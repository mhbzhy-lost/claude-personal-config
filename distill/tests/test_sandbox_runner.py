"""Unit tests for sandbox_runner. Mocks subprocess; doesn't touch real docker."""
from __future__ import annotations
import subprocess
from unittest.mock import patch
import pytest
from sandbox_runner import (
    pull_image_with_digest, run_ephemeral, exec_in_container,
    diff_container, inspect_image_digest, container_exists,
    remove_container, SandboxError,
)


def _mock_run(returncode=0, stdout="", stderr=""):
    return subprocess.CompletedProcess(args=[], returncode=returncode,
                                        stdout=stdout, stderr=stderr)


def test_pull_image_returns_digest():
    with patch("subprocess.run") as m:
        m.side_effect = [
            _mock_run(0, "", ""),  # docker pull
            _mock_run(0, "debian@sha256:abc123\n", ""),  # docker inspect
        ]
        digest = pull_image_with_digest("debian:12-slim")
    assert digest == "sha256:abc123"
    assert m.call_count == 2


def test_pull_image_raises_on_failure():
    with patch("subprocess.run") as m:
        m.return_value = _mock_run(1, "", "manifest unknown")
        with pytest.raises(SandboxError, match="pull"):
            pull_image_with_digest("nonexistent:tag")


def test_run_ephemeral_passes_mounts_and_env():
    with patch("subprocess.run") as m:
        m.return_value = _mock_run(0, "ok\n", "")
        res = run_ephemeral(
            "debian:12-slim",
            command=["bash", "-c", "echo ok"],
            mounts=["type=volume,source=foo,target=/foo"],
            env={"DEBIAN_FRONTEND": "noninteractive"},
            workdir="/work",
        )
    assert res.stdout.strip() == "ok"
    cmd = m.call_args[0][0]
    assert "--mount" in cmd and "type=volume,source=foo,target=/foo" in cmd
    assert "-e" in cmd and "DEBIAN_FRONTEND=noninteractive" in cmd
    assert "-w" in cmd and "/work" in cmd


def test_exec_in_container_check_false_returns_nonzero():
    with patch("subprocess.run") as m:
        m.return_value = _mock_run(1, "", "exit 1")
        res = exec_in_container("ctr", ["false"], check=False)
    assert res.returncode == 1
    assert res.stderr == "exit 1"


def test_diff_container_parses_lines():
    with patch("subprocess.run") as m:
        m.return_value = _mock_run(0, "A /usr/bin/foo\nC /etc/bar\nD /tmp/baz\n", "")
        diff = diff_container("ctr")
    assert diff == [("A", "/usr/bin/foo"), ("C", "/etc/bar"), ("D", "/tmp/baz")]


def test_inspect_image_digest_returns_none_when_missing():
    with patch("subprocess.run") as m:
        m.return_value = _mock_run(1, "", "No such image")
        assert inspect_image_digest("missing:tag") is None


def test_inspect_image_digest_strips_repo_prefix():
    """Same rpartition behavior as pull_image_with_digest — handles
    RepoDigest format consistently."""
    with patch("subprocess.run") as m:
        m.return_value = _mock_run(0, "debian@sha256:abc123\n", "")
        assert inspect_image_digest("debian:12-slim") == "sha256:abc123"


def test_container_exists_filters_by_name():
    with patch("subprocess.run") as m:
        m.return_value = _mock_run(0, "claude-skill-sandbox\n", "")
        assert container_exists("claude-skill-sandbox") is True


def test_container_exists_false_when_not_listed():
    with patch("subprocess.run") as m:
        m.return_value = _mock_run(0, "", "")
        assert container_exists("nonexistent") is False


def test_remove_container_returns_exec_result():
    """After fix: remove_container returns ExecResult so callers can
    inspect stderr (vs swallowing all errors)."""
    with patch("subprocess.run") as m:
        m.return_value = _mock_run(1, "", "Error: No such container: foo")
        res = remove_container("foo")
    assert res.returncode == 1
    assert "No such container" in res.stderr
