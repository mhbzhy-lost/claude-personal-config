"""Subprocess wrappers around docker CLI used by distill build stage.

Pure subprocess; no docker SDK dependency. All functions raise SandboxError
on docker non-zero exit. Stdout/stderr captured for diagnostics.
"""
from __future__ import annotations

import subprocess
from dataclasses import dataclass


class SandboxError(RuntimeError):
    """Raised when a docker subprocess returns non-zero exit."""

    def __init__(self, op: str, returncode: int, stderr: str):
        super().__init__(f"sandbox {op} failed (rc={returncode}): {stderr.strip()}")
        self.op = op
        self.returncode = returncode
        self.stderr = stderr


@dataclass
class ExecResult:
    returncode: int
    stdout: str
    stderr: str


def _run(cmd: list[str], op: str, *, check: bool = True,
         input_text: str | None = None, timeout: int | None = None) -> ExecResult:
    """Run a docker subcommand. Raise SandboxError on non-zero if check=True."""
    res = subprocess.run(
        cmd, capture_output=True, text=True, input=input_text, timeout=timeout,
    )
    result = ExecResult(res.returncode, res.stdout, res.stderr)
    if check and res.returncode != 0:
        raise SandboxError(op, res.returncode, res.stderr)
    return result


def pull_image_with_digest(image: str) -> str:
    """Pull image and return its digest (sha256:...).

    Two calls: docker pull, then docker inspect. Stdout may be either a bare
    Id (``sha256:...``) or a RepoDigest (``repo@sha256:...``); we strip any
    ``repo@`` prefix and return just the ``sha256:...`` portion.
    """
    _run(["docker", "pull", image], op="pull")
    res = _run(
        ["docker", "image", "inspect", image, "--format", "{{.Id}}"],
        op="inspect",
    )
    raw = res.stdout.strip()
    # docker may print "<repo>@sha256:..." (RepoDigest form); keep only the digest.
    digest = raw.rpartition("@")[2] if "@" in raw else raw
    if not digest.startswith("sha256:"):
        raise SandboxError("inspect", 0, f"unexpected digest format: {raw!r}")
    return digest


def inspect_image_digest(image: str) -> str | None:
    """Return current digest of locally cached image, or None if not present.

    Mirrors the parsing in :func:`pull_image_with_digest`: docker may emit
    either a bare ``sha256:...`` Id or a ``repo@sha256:...`` RepoDigest, so
    we strip any ``repo@`` prefix before validating.
    """
    res = _run(
        ["docker", "image", "inspect", image, "--format", "{{.Id}}"],
        op="inspect", check=False,
    )
    if res.returncode != 0:
        return None
    raw = res.stdout.strip()
    digest = raw.rpartition("@")[2] if "@" in raw else raw
    return digest if digest.startswith("sha256:") else None


def run_ephemeral(image: str, *, command: list[str] | None = None,
                   mounts: list[str] | None = None, env: dict[str, str] | None = None,
                   workdir: str | None = None, name: str | None = None,
                   detach: bool = False, timeout: int = 600) -> ExecResult:
    """Run a one-off container. Use for distill validation (--rm)."""
    cmd = ["docker", "run", "--rm"]
    if name:
        cmd += ["--name", name]
    if detach:
        cmd += ["-d"]
    for m in mounts or []:
        cmd += ["--mount", m]
    for k, v in (env or {}).items():
        cmd += ["-e", f"{k}={v}"]
    if workdir:
        cmd += ["-w", workdir]
    cmd.append(image)
    if command:
        cmd += command
    return _run(cmd, op="run", timeout=timeout)


def exec_in_container(container: str, command: list[str], *,
                       env: dict[str, str] | None = None,
                       workdir: str | None = None,
                       check: bool = True, timeout: int = 600) -> ExecResult:
    """docker exec into a running container."""
    cmd = ["docker", "exec"]
    for k, v in (env or {}).items():
        cmd += ["-e", f"{k}={v}"]
    if workdir:
        cmd += ["-w", workdir]
    cmd.append(container)
    cmd += command
    return _run(cmd, op="exec", check=check, timeout=timeout)


def diff_container(container: str) -> list[tuple[str, str]]:
    """Return [(change_type, path), ...]. change_type ∈ {A, C, D}."""
    res = _run(["docker", "diff", container], op="diff")
    out: list[tuple[str, str]] = []
    for line in res.stdout.splitlines():
        if not line:
            continue
        change_type, _, path = line.partition(" ")
        out.append((change_type, path))
    return out


def remove_container(name: str, *, force: bool = True) -> ExecResult:
    """Remove a container. Returns ExecResult; non-zero rc usually means
    container didn't exist (idempotent intent), but stderr may contain
    real errors (daemon down, perms) — caller should inspect."""
    flags = ["-f"] if force else []
    return _run(["docker", "rm", *flags, name], op="rm", check=False)


def container_exists(name: str) -> bool:
    res = _run(
        ["docker", "ps", "-a", "--format", "{{.Names}}", "--filter", f"name=^{name}$"],
        op="ps", check=False,
    )
    return name in res.stdout.split()
