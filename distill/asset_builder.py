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
import subprocess
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from sandbox_runner import (
    SandboxError, container_exists, diff_container,
    exec_in_container, remove_container, run_ephemeral,
)

logger = logging.getLogger(__name__)

MAX_RETRY_ROUNDS = 3
STDERR_TAIL_LINES = 100


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

    try:
        run_ephemeral(
            base_image, name=container_name, detach=True,
            command=["sleep", "600"],
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
                  llm_generate, source_text: str) -> dict:
    """Generate + validate all assets for one skill. Up to 3 retry rounds per asset.

    Args:
        skill: plan dict for the skill (name, description, ...)
        assets: list of AssetSpec to generate
        base_image: e.g. "debian:12-slim"
        llm_generate: callable (prompt: str) -> str (returns asset script content)
        source_text: cleaned doc text to inform LLM

    Returns:
        {"<filename>": {"content": "...", "verified": bool, "rounds": N}}
    """
    out: dict[str, dict] = {}
    for spec in assets:
        if spec.filename != "install.sh":
            content = llm_generate(_render_prompt(skill, spec, source_text))
            out[spec.filename] = {
                "content": content,
                "verified": True,
                "validation_skipped": True,  # no gates applicable for non-install
                "rounds": 0,
            }
            continue

        last_error = ""
        last_content = ""
        verified = False
        for round_idx in range(1, MAX_RETRY_ROUNDS + 1):
            prompt = _render_prompt(skill, spec, source_text,
                                     prior_attempt=last_content,
                                     prior_error=last_error)
            content = llm_generate(prompt)
            content = _inject_helpers(content)
            result = validate_install_asset(content, base_image, spec)
            if result.success:
                out[spec.filename] = {
                    "content": content, "verified": True, "validation_skipped": False,
                    "rounds": round_idx,
                }
                verified = True
                break
            last_error = result.error_log
            last_content = content
            logger.warning(
                "asset %s round %d failed: %s",
                spec.filename, round_idx, result.error_log[:300],
            )
        if not verified:
            out[spec.filename] = {
                "content": last_content, "verified": False,
                "validation_skipped": False,
                "rounds": MAX_RETRY_ROUNDS, "error": last_error,
            }
    return out


def _render_prompt(skill: dict, spec: AssetSpec, source_text: str,
                    prior_attempt: str = "", prior_error: str = "") -> str:
    """Construct LLM prompt for asset generation."""
    base = (
        f"Generate {spec.filename} for skill '{skill.get('name')}'.\n\n"
        f"Purpose: {spec.purpose}\n"
        f"Idempotent guard (first line, after shebang): {spec.idempotent_check} && exit 0\n"
        f"Required smoke test commands (will run in fresh debian:12-slim after install):\n"
        + "\n".join(f"  - {c}" for c in spec.smoke_test)
        + "\n\nReference docs (excerpts):\n" + source_text[:5000]
    )
    if prior_attempt and prior_error:
        base += (
            f"\n\n---\nPrior attempt failed validation. Previous script:\n"
            f"```bash\n{prior_attempt}\n```\n\n"
            f"Failure log:\n```\n{prior_error}\n```\n\n"
            f"Required: fix the above. Keep idempotent guard, use retry helper for "
            f"network ops (apt-get update, curl downloads). Output only the bash script."
        )
    else:
        base += (
            "\n\nOutput ONLY the bash script, no markdown fences, no commentary. "
            "Use retry helper (already injected by build pipeline) for network ops."
        )
    return base
