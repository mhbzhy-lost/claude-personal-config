"""Agentic install.sh builder: LLM drives bash exploration in a probe
container, then submits a final install.sh that gets re-validated against
4 gates in a fresh container.

Replaces the old "3-round retry on one-shot generation" pattern. The LLM
gets two tools:

- ``bash(command, timeout_sec)`` — exec inside a long-lived probe
  container (same image as validation). Use to discover what's installed,
  test apt commands, verify install steps work.
- ``finalize(content)`` — submit the final install.sh. Pipeline runs the
  4-gate validation in a FRESH container; on failure, the gate-error log
  is fed back into the conversation so the LLM can keep iterating.

Budgets: 10 bash calls + 3 finalize attempts. Both exhausted → return the
last finalize content with ``verified=False``; pipeline falls back to
``manual_smoke_after_pilot`` (same surface as before).

The probe container is created with the host's HTTP proxy passthrough
(translated 127.0.0.1 → host.docker.internal), matching
``asset_builder.validate_install_asset``'s behavior.
"""
from __future__ import annotations

import json
import logging
import subprocess
import uuid
from dataclasses import dataclass

from sandbox_runner import (
    SandboxError, container_exists, exec_in_container,
    remove_container, run_ephemeral,
)

logger = logging.getLogger(__name__)

DEFAULT_BASH_BUDGET = 10
DEFAULT_FINALIZE_BUDGET = 3
DEFAULT_MAX_ITERATIONS = 25  # safety cap on outer LLM-call loop
DEFAULT_BASH_TIMEOUT = 60
PROBE_TTL_SECONDS = 1800  # auto-die if loop hangs (cleanup is best-effort)
STDERR_TAIL = 2000        # bytes of stderr/stdout returned to LLM per bash call


@dataclass
class AgenticResult:
    content: str        # final install.sh (may be "" if LLM never finalized)
    verified: bool      # True iff a finalize() call passed all 4 gates
    finalize_attempts: int
    bash_calls: int
    abort_reason: str = ""  # "" on clean exit; "no_tool_calls" / "max_iterations" / "budget_exhausted"


# ---------------------------------------------------------------------------
# Tool definitions (OpenAI function-calling schema)
# ---------------------------------------------------------------------------
def _tool_defs() -> list[dict]:
    return [
        {
            "type": "function",
            "function": {
                "name": "bash",
                "description": (
                    "Execute a bash command inside the probe container "
                    "(same base image as validation). Use this to discover "
                    "what's preinstalled (e.g. `command -v python3`), test "
                    "apt install steps, and verify install commands work "
                    "before committing them to install.sh. State persists "
                    "across calls within this loop."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": {
                            "type": "string",
                            "description": "Bash command to run (will be wrapped in `bash -c '...'`).",
                        },
                        "timeout_sec": {
                            "type": "integer",
                            "description": f"Per-call timeout in seconds (default {DEFAULT_BASH_TIMEOUT}, max 300).",
                        },
                    },
                    "required": ["command"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "finalize",
                "description": (
                    "Submit the final install.sh content. Pipeline runs "
                    "4-gate validation in a FRESH container. On failure, "
                    "you'll get the gate error and can call bash again or "
                    "finalize() with fixes. Don't call this until you've "
                    "verified your install steps work."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "content": {
                            "type": "string",
                            "description": "Complete install.sh content (must include shebang + idempotent guard line).",
                        },
                    },
                    "required": ["content"],
                },
            },
        },
    ]


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------
def _system_prompt() -> str:
    return (
        "You are generating an install.sh for a debian:12-slim sandbox skill.\n"
        "\n"
        "You have a probe container at your disposal — use the `bash` tool to\n"
        "discover what's preinstalled (debian:12-slim is MINIMAL — no python3,\n"
        "no unzip, no pip, no curl in some configs), test individual install\n"
        "commands, and verify your script works before submitting via\n"
        "`finalize(content=...)`.\n"
        "\n"
        "Strategy:\n"
        "1. First, probe: `command -v python3 unzip curl wget jq` and similar.\n"
        "2. Test each apt-get / curl / pip step in isolation.\n"
        "3. Run your full install.sh draft in the probe; fix issues.\n"
        "4. Only call finalize() when you're confident it'll pass 4-gate validation.\n"
        "\n"
        "4-gate validation (run in a FRESH container after finalize):\n"
        "  G1: install.sh first run rc=0\n"
        "  G2: install.sh second run rc=0 (idempotent guard fires)\n"
        "  G3: third run produces zero new filesystem deltas\n"
        "  G4: smoke_test commands all rc=0\n"
        "\n"
        "Budgets: 10 bash calls + 3 finalize attempts. If you exhaust both,\n"
        "your last finalize content is kept with verified=false.\n"
        "\n"
        "When writing install.sh:\n"
        "- Keep idempotent guard as the FIRST line after shebang\n"
        "- Use the `retry` helper (auto-injected by pipeline) for network ops\n"
        "- China network: install.sh template-style — sed apt sources to\n"
        "  mirrors.tuna.tsinghua.edu.cn before apt-get update if applicable\n"
        "- End with self-verify (e.g. `mytool --version >/dev/null`)\n"
    )


def _initial_user_prompt(skill: dict, spec, source_text: str) -> str:
    return (
        f"Skill: {skill.get('name')}\n"
        f"Purpose: {spec.purpose}\n"
        f"Idempotent guard (first line after shebang): {spec.idempotent_check} && exit 0\n"
        f"Smoke tests (must all rc=0 after install):\n"
        + "\n".join(f"  - {c}" for c in (spec.smoke_test or []))
        + "\n\nReference docs (excerpt):\n" + (source_text or "")[:5000]
        + "\n\nStart by probing the environment with `bash`."
    )


# ---------------------------------------------------------------------------
# Main entry
# ---------------------------------------------------------------------------
def build_install_via_agentic_loop(
    skill: dict,
    spec,                     # AssetSpec from asset_builder
    base_image: str,
    source_text: str,
    adapter,
    stats,                    # StageStats; we accumulate counters into it
    *,
    bash_budget: int = DEFAULT_BASH_BUDGET,
    finalize_budget: int = DEFAULT_FINALIZE_BUDGET,
    max_iterations: int = DEFAULT_MAX_ITERATIONS,
    proxy_env: dict[str, str] | None = None,
    inject_helpers=None,      # callable(install_sh) -> install_sh; injected by caller
    validator=None,           # callable(install_sh, base_image, spec) -> ValidationResult
) -> AgenticResult:
    """Drive the agentic loop. Returns AgenticResult.

    ``inject_helpers`` and ``validator`` are injected to keep this module
    decoupled from asset_builder (avoids circular import + makes unit tests
    trivial — pass stub callables).
    """
    if inject_helpers is None or validator is None:
        # Lazy import to avoid circular dep at module load.
        from asset_builder import _inject_helpers, validate_install_asset
        inject_helpers = inject_helpers or _inject_helpers
        validator = validator or validate_install_asset

    container_name = f"distill-probe-{uuid.uuid4().hex[:12]}"
    last_content = ""
    bash_calls = 0
    finalize_attempts = 0
    abort_reason = ""

    try:
        try:
            run_ephemeral(
                base_image, name=container_name, detach=True,
                command=["sleep", str(PROBE_TTL_SECONDS)],
                env=proxy_env or None,
            )
        except SandboxError as e:
            return AgenticResult(
                content="", verified=False, finalize_attempts=0, bash_calls=0,
                abort_reason=f"probe_create_failed: {e}",
            )

        messages: list[dict] = [
            {"role": "system", "content": _system_prompt()},
            {"role": "user", "content": _initial_user_prompt(skill, spec, source_text)},
        ]
        tools = _tool_defs()

        for _ in range(max_iterations):
            try:
                response = adapter.create_message(
                    messages=messages, tools=tools, max_tokens=4096,
                )
            except Exception as e:  # noqa: BLE001 — surface upstream failure
                abort_reason = f"llm_error: {e}"
                break

            stats.requests += 1
            usage = adapter.extract_usage(response)
            stats.prompt_tokens += usage["prompt_tokens"]
            stats.completion_tokens += usage["completion_tokens"]
            stats.cached_tokens += usage["cached_tokens"]
            stats.cache_write_tokens += usage["cache_write_tokens"]

            msg = response.choices[0].message

            if not msg.tool_calls:
                # LLM ended without finalize → treat as give-up
                abort_reason = "no_tool_calls"
                break

            stats.tool_calls += len(msg.tool_calls)
            messages.append(adapter.serialize_assistant_message(msg))

            terminal = False
            for tc in msg.tool_calls:
                tname = tc.function.name
                try:
                    targs = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    targs = {}

                if tname == "bash":
                    bash_calls += 1
                    cmd = str(targs.get("command", ""))
                    timeout_sec = min(int(targs.get("timeout_sec", DEFAULT_BASH_TIMEOUT) or DEFAULT_BASH_TIMEOUT), 300)
                    tool_content = _exec_bash(container_name, cmd, timeout_sec)
                    if bash_calls >= bash_budget:
                        tool_content += (
                            f"\n[budget] bash calls exhausted "
                            f"({bash_calls}/{bash_budget}); next step MUST be finalize()."
                        )
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": tool_content,
                    })

                elif tname == "finalize":
                    finalize_attempts += 1
                    raw = str(targs.get("content", ""))
                    content = inject_helpers(raw)
                    last_content = content
                    result = validator(content, base_image, spec)
                    if result.success:
                        return AgenticResult(
                            content=content, verified=True,
                            finalize_attempts=finalize_attempts,
                            bash_calls=bash_calls,
                        )
                    feedback = (
                        f"finalize attempt {finalize_attempts}/{finalize_budget} "
                        f"FAILED 4-gate validation:\n{result.error_log[-3000:]}"
                    )
                    if finalize_attempts >= finalize_budget:
                        abort_reason = "budget_exhausted"
                        terminal = True
                        feedback += "\n[budget] finalize attempts exhausted."
                    else:
                        feedback += (
                            "\n\nKeep iterating: use bash to investigate the "
                            "failure, then call finalize() again with fixes."
                        )
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": feedback,
                    })

                else:
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": f"Unknown tool: {tname}",
                    })

            if terminal:
                break

            # Force finalize when bash budget hits and no finalize yet
            if bash_calls >= bash_budget and finalize_attempts == 0:
                messages.append({
                    "role": "user",
                    "content": (
                        "bash budget exhausted with no finalize() yet. You "
                        "MUST call finalize(content=...) now with your best "
                        "install.sh — no more bash calls allowed."
                    ),
                })
        else:
            abort_reason = abort_reason or "max_iterations"

        return AgenticResult(
            content=last_content,
            verified=False,
            finalize_attempts=finalize_attempts,
            bash_calls=bash_calls,
            abort_reason=abort_reason,
        )

    finally:
        try:
            if container_exists(container_name):
                remove_container(container_name, force=True)
        except Exception:  # noqa: BLE001
            logger.debug("probe cleanup failed for %s", container_name, exc_info=True)


def _exec_bash(container: str, cmd: str, timeout_sec: int) -> str:
    """Run a bash command inside the probe container; return formatted result."""
    try:
        result = exec_in_container(
            container, ["bash", "-c", cmd], check=False, timeout=timeout_sec,
        )
        return (
            f"rc={result.returncode}\n"
            f"--- stdout (last {STDERR_TAIL}B) ---\n{result.stdout[-STDERR_TAIL:]}\n"
            f"--- stderr (last {STDERR_TAIL}B) ---\n{result.stderr[-STDERR_TAIL:]}"
        )
    except subprocess.TimeoutExpired as e:
        return f"rc=124 (timeout after {e.timeout}s)\ncmd: {cmd!r}"
    except SandboxError as e:
        return f"sandbox error: {e}"
