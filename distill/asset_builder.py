"""Generate executable skill assets (install.sh, run-impl.sh) and validate
them in a fresh debian:12-slim sandbox before the distill output is committed.

Validation gates (must all pass):
  1. install.sh runs successfully on first execution
  2. install.sh exits 0 immediately on second execution (idempotent guard fires)
  3. docker diff after second run is empty (zero side effects)
  4. smoke_test commands all return exit 0

Failure -> feed stderr + script back to LLM, retry up to 3 rounds.
After 3 failures, mark asset as ``unverified: true`` and emit summary warn.
"""
from __future__ import annotations

import logging
import os
import re
import subprocess
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from sandbox_runner import (
    SandboxError, container_exists, diff_container,
    exec_in_container, remove_container, run_ephemeral,
)

logger = logging.getLogger(__name__)

STDERR_TAIL_LINES = 100

# Replace host-only loopback addresses with the container-reachable
# host.docker.internal alias so install.sh can reach the user's HTTP proxy.
_PROXY_LOCALHOST_RE = re.compile(r"://(127\.0\.0\.1|::1|localhost)([:/]|$)")


def _translate_proxy_url(url: str) -> str:
    """Rewrite host-shell proxy URLs (typically http://127.0.0.1:7897) to
    container-reachable form (http://host.docker.internal:7897). Leaves
    non-loopback proxies (e.g. corporate proxy.example.com) untouched."""
    return _PROXY_LOCALHOST_RE.sub(r"://host.docker.internal\2", url)


def _collect_proxy_env() -> dict[str, str]:
    """Read host shell's HTTP proxy env vars (lower + upper case) and return
    a dict ready to feed into run_ephemeral(env=...). Empty when the host
    has no proxy configured — fully transparent."""
    out: dict[str, str] = {}
    for var in (
        "http_proxy", "https_proxy", "ftp_proxy", "no_proxy", "all_proxy",
        "HTTP_PROXY", "HTTPS_PROXY", "FTP_PROXY", "NO_PROXY", "ALL_PROXY",
    ):
        v = os.environ.get(var)
        if not v:
            continue
        if var.lower().endswith("no_proxy"):
            out[var] = v
        else:
            out[var] = _translate_proxy_url(v)
    return out


@dataclass
class AssetSpec:
    filename: str
    idempotent_check: str = ""    # bash command — exit 0 if tool already installed
    smoke_test: list[str] = field(default_factory=list)  # bash commands run after install
    purpose: str = ""              # passed to LLM


@dataclass
class ValidationResult:
    success: bool
    error_log: str = ""        # accumulated stderr + diagnostic
    container_id: str = ""     # for debugging on failure


def _read_template(name: str) -> str:
    """Read a template file from distill/templates/."""
    return (Path(__file__).parent / "templates" / name).read_text(encoding="utf-8")


def _inject_helpers(install_sh: str) -> str:
    """Prepend retry() helper to install.sh body (after shebang + idempotent guard)."""
    helpers = _read_template("install_helpers.sh")
    lines = install_sh.splitlines(keepends=True)
    insert_idx = 0
    for i, ln in enumerate(lines):
        if ln.strip().startswith("#!"):
            insert_idx = i + 1
        if "&& exit 0" in ln:
            insert_idx = i + 1
            break
    return "".join(lines[:insert_idx]) + "\n" + helpers + "\n" + "".join(lines[insert_idx:])


def validate_install_asset(install_sh: str, base_image: str,
                            spec: AssetSpec) -> ValidationResult:
    """Run the 4-gate validation in a fresh container.

    Returns ValidationResult with success=False + error_log on first failure.
    Container is always cleaned up.

    install_sh is fed directly to ``bash -c`` via ``exec_in_container``; no
    staging step (mkdir/cat/chmod) is needed and no file-system writes occur
    outside the install script itself, which keeps the gate-3 diff check
    capturing only changes the script makes.
    """
    container_name = f"distill-validate-{uuid.uuid4().hex[:12]}"
    error_chunks: list[str] = []
    proxy_env = _collect_proxy_env()

    try:
        run_ephemeral(
            base_image, name=container_name, detach=True,
            command=["sleep", "600"], env=proxy_env or None,
        )

        # Gate 1: first install
        r1 = exec_in_container(
            container_name, ["bash", "-c", install_sh], check=False,
        )
        if r1.returncode != 0:
            error_chunks.append(
                f"[gate 1: first install] rc={r1.returncode}\n"
                f"stderr (last {STDERR_TAIL_LINES} lines):\n"
                + "\n".join(r1.stderr.splitlines()[-STDERR_TAIL_LINES:])
            )
            return ValidationResult(False, "\n".join(error_chunks), container_name)

        # Gate 2: second install (idempotent guard must fire, rc=0)
        r2 = exec_in_container(
            container_name, ["bash", "-c", install_sh], check=False,
        )
        if r2.returncode != 0:
            error_chunks.append(
                f"[gate 2: second install] rc={r2.returncode} (must be 0)\n"
                f"stderr:\n{r2.stderr[-2000:]}"
            )
            return ValidationResult(False, "\n".join(error_chunks), container_name)

        # Gate 3: zero-delta on a redundant 3rd run.
        # ``docker diff`` reports the cumulative delta from the image baseline,
        # not delta-since-last-checkpoint, so we must subtract before/after sets
        # around a 3rd redundant run rather than asserting the post-2nd-run diff
        # is empty (gate 1's writes are still visible there).
        diff_baseline = set(p for _, p in diff_container(container_name))
        exec_in_container(
            container_name, ["bash", "-c", install_sh], check=False,
        )
        diff_post = set(p for _, p in diff_container(container_name))
        new_paths = diff_post - diff_baseline
        if new_paths:
            error_chunks.append(
                f"[gate 3: idempotency violation] redundant run wrote "
                f"{len(new_paths)} new path(s): {sorted(list(new_paths))[:10]}"
            )
            return ValidationResult(False, "\n".join(error_chunks), container_name)

        # Gate 4: smoke tests
        for cmd in spec.smoke_test:
            rs = exec_in_container(
                container_name, ["bash", "-c", cmd], check=False,
            )
            if rs.returncode != 0:
                error_chunks.append(
                    f"[gate 4: smoke '{cmd}'] rc={rs.returncode}\n"
                    f"stderr:\n{rs.stderr[-2000:]}"
                )
                return ValidationResult(False, "\n".join(error_chunks), container_name)

        return ValidationResult(True, "", container_name)

    except SandboxError as e:
        return ValidationResult(False, f"[sandbox error] {e}", container_name)
    except subprocess.TimeoutExpired as e:
        return ValidationResult(
            False,
            f"[timeout after {e.timeout}s] command: {e.cmd}",
            container_name,
        )
    finally:
        # Cleanup is best-effort; never let teardown raise into the caller.
        try:
            if container_exists(container_name):
                remove_container(container_name, force=True)
        except Exception:  # noqa: BLE001 — docker may be absent in unit tests
            logger.debug("cleanup skipped for %s", container_name, exc_info=True)


def build_assets(skill: dict, assets: list[AssetSpec], base_image: str,
                  llm_generate, source_text: str,
                  *, adapter=None, stats=None) -> dict:
    """Generate assets for one skill.

    install.sh:    agentic loop (LLM probes container + iterates finalize).
                   Requires ``adapter`` + ``stats`` to be passed.
    other files:   one-shot generation via ``llm_generate``.

    Args:
        skill: plan dict for the skill (name, description, ...)
        assets: list of AssetSpec to generate
        base_image: e.g. "debian:12-slim"
        llm_generate: callable (prompt: str) -> str (one-shot, used for run-impl.sh etc.)
        source_text: cleaned doc text to inform LLM
        adapter: required when any asset is install.sh (drives the agentic loop)
        stats: StageStats; agentic loop accumulates token/request counts here

    Returns:
        {"<filename>": {"content": "...", "verified": bool, "rounds": N, ...}}
        ``rounds`` for install.sh = number of finalize() attempts (1..3).
    """
    out: dict[str, dict] = {}
    for spec in assets:
        if spec.filename != "install.sh":
            content = llm_generate(_render_oneshot_prompt(skill, spec, source_text))
            out[spec.filename] = {
                "content": content,
                "verified": True,
                "validation_skipped": True,  # no gates applicable for non-install
                "rounds": 0,
            }
            continue

        if adapter is None or stats is None:
            raise ValueError(
                "build_assets: install.sh requires adapter + stats for the agentic loop"
            )

        # Lazy import to avoid circular dep with agentic_install_builder.
        from agentic_install_builder import build_install_via_agentic_loop

        proxy_env = _collect_proxy_env() or None
        result = build_install_via_agentic_loop(
            skill=skill,
            spec=spec,
            base_image=base_image,
            source_text=source_text,
            adapter=adapter,
            stats=stats,
            proxy_env=proxy_env,
            inject_helpers=_inject_helpers,
            validator=validate_install_asset,
        )
        entry: dict = {
            "content": result.content,
            "verified": result.verified,
            "validation_skipped": False,
            "rounds": result.finalize_attempts,
            "bash_calls": result.bash_calls,
        }
        if result.abort_reason:
            entry["abort_reason"] = result.abort_reason
        out[spec.filename] = entry
        if not result.verified:
            logger.warning(
                "asset %s agentic loop unverified (attempts=%d, bash=%d, reason=%s)",
                spec.filename, result.finalize_attempts, result.bash_calls,
                result.abort_reason or "n/a",
            )
    return out


def _render_oneshot_prompt(skill: dict, spec: AssetSpec, source_text: str) -> str:
    """One-shot prompt for non-install assets (e.g. run-impl.sh).

    install.sh has its own agentic loop with its own system + initial prompts
    in ``agentic_install_builder``; this is for the legacy one-shot path
    that still serves run-impl.sh and similar simple wrapper scripts.
    """
    return (
        f"Generate {spec.filename} for skill '{skill.get('name')}'.\n\n"
        f"Purpose: {spec.purpose}\n"
        f"Idempotent guard (first line, after shebang): {spec.idempotent_check} && exit 0\n"
        f"Required smoke test commands (will run in fresh debian:12-slim after install):\n"
        + "\n".join(f"  - {c}" for c in spec.smoke_test)
        + "\n\nReference docs (excerpts):\n" + source_text[:5000]
        + "\n\nOutput ONLY the bash script, no markdown fences, no commentary."
    )
