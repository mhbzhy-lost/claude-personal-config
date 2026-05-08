"""Unit tests for asset_builder. Mocks LLM + sandbox_runner."""
from __future__ import annotations
from unittest.mock import patch, MagicMock
import pytest
from asset_builder import (
    AssetSpec, ValidationResult, validate_install_asset, build_assets,
)
from sandbox_runner import ExecResult, SandboxError


def _ok(stdout="", stderr=""):
    return ExecResult(0, stdout, stderr)


def _fail(stderr="boom"):
    return ExecResult(1, "", stderr)


def test_validate_install_idempotent_check():
    """First run installs; 3rd redundant run must add zero new paths vs baseline."""
    spec = AssetSpec(
        filename="install.sh",
        idempotent_check="which mitmproxy",
        smoke_test=["mitmproxy --version"],
    )
    install_sh = "#!/bin/bash\nwhich mitmproxy && exit 0\napt-get install mitmproxy"

    with patch("asset_builder.run_ephemeral") as m_run, \
         patch("asset_builder.exec_in_container") as m_exec, \
         patch("asset_builder.diff_container") as m_diff:
        m_run.return_value = _ok()
        # install x3 (gates 1, 2, 3-redundant) + smoke
        m_exec.side_effect = [_ok(), _ok(), _ok(), _ok()]
        # baseline (post-2nd-run) + post (after-3rd-run); both empty for clean case
        m_diff.side_effect = [[], []]
        result = validate_install_asset(install_sh, "debian:12-slim", spec)

    assert result.success is True
    assert result.error_log == ""


def test_validate_install_fails_when_third_run_writes_new_paths():
    """3rd redundant run must add zero new paths. New path => idempotency violation."""
    spec = AssetSpec(filename="install.sh", idempotent_check="which X",
                     smoke_test=["X --version"])
    with patch("asset_builder.run_ephemeral") as m_run, \
         patch("asset_builder.exec_in_container") as m_exec, \
         patch("asset_builder.diff_container") as m_diff:
        m_run.return_value = _ok()
        # install x3 (no smoke since gate 3 fails before)
        m_exec.side_effect = [_ok(), _ok(), _ok()]
        # baseline empty, post adds /var/log/leak => new_paths nonempty
        m_diff.side_effect = [[], [("A", "/var/log/leak")]]
        result = validate_install_asset("...", "debian:12-slim", spec)

    assert result.success is False
    assert "idempotency" in result.error_log.lower()


def test_build_assets_install_requires_adapter_and_stats():
    """install.sh now goes through the agentic loop and needs both kwargs."""
    spec = AssetSpec(filename="install.sh", idempotent_check="which X",
                     smoke_test=["X --version"])
    with pytest.raises(ValueError, match="agentic loop"):
        build_assets({"name": "x"}, [spec], "debian:12-slim",
                     lambda p: "ignored", "src")


def test_build_assets_install_dispatches_to_agentic_loop():
    """install.sh hits build_install_via_agentic_loop and reflects its result."""
    from agentic_install_builder import AgenticResult
    spec = AssetSpec(filename="install.sh", idempotent_check="which X",
                     smoke_test=["X --version"])

    fake_result = AgenticResult(
        content="#!/bin/bash\nverified",
        verified=True,
        finalize_attempts=2,
        bash_calls=4,
        abort_reason="",
    )

    class _Adapter: pass
    class _Stats: pass

    with patch(
        "agentic_install_builder.build_install_via_agentic_loop",
        return_value=fake_result,
    ) as m_loop:
        out = build_assets(
            {"name": "x"}, [spec], "debian:12-slim",
            lambda p: "ignored", "src",
            adapter=_Adapter(), stats=_Stats(),
        )

    assert m_loop.called
    entry = out["install.sh"]
    assert entry["verified"] is True
    assert entry["rounds"] == 2          # finalize_attempts surfaces as rounds
    assert entry["bash_calls"] == 4
    assert entry["validation_skipped"] is False
    assert "abort_reason" not in entry   # empty reason is omitted


def test_build_assets_install_unverified_records_abort_reason():
    """budget_exhausted etc. land in the entry for downstream _meta.json."""
    from agentic_install_builder import AgenticResult
    spec = AssetSpec(filename="install.sh", idempotent_check="which X",
                     smoke_test=["X --version"])
    fake_result = AgenticResult(
        content="best-effort", verified=False,
        finalize_attempts=3, bash_calls=10, abort_reason="budget_exhausted",
    )
    class _A: pass
    class _S: pass
    with patch(
        "agentic_install_builder.build_install_via_agentic_loop",
        return_value=fake_result,
    ):
        out = build_assets(
            {"name": "x"}, [spec], "debian:12-slim",
            lambda p: "ignored", "src",
            adapter=_A(), stats=_S(),
        )
    assert out["install.sh"]["verified"] is False
    assert out["install.sh"]["abort_reason"] == "budget_exhausted"


def test_build_assets_non_install_marked_skipped():
    """Non-install assets bypass validation gates and are marked as skipped."""
    spec = AssetSpec(filename="run-impl.sh", purpose="wrap mitmdump")
    result = build_assets(
        {"name": "x"}, [spec], "debian:12-slim",
        lambda p: "#!/bin/bash\nmitmdump $@", "src",
    )
    assert result["run-impl.sh"]["verified"] is True
    assert result["run-impl.sh"]["validation_skipped"] is True
    assert result["run-impl.sh"]["rounds"] == 0


def test_validate_install_returns_failed_result_on_sandbox_error():
    """SandboxError from run_ephemeral propagates as ValidationResult, not exception."""
    spec = AssetSpec(filename="install.sh", smoke_test=[])
    with patch("asset_builder.run_ephemeral",
               side_effect=SandboxError("run", 1, "daemon down")):
        result = validate_install_asset("...", "debian:12-slim", spec)
    assert result.success is False
    assert "sandbox error" in result.error_log.lower()


def test_validate_install_returns_failed_result_on_timeout():
    """subprocess.TimeoutExpired from a hung install.sh is caught."""
    import subprocess as sp
    spec = AssetSpec(filename="install.sh", smoke_test=[])
    with patch("asset_builder.run_ephemeral",
               side_effect=sp.TimeoutExpired(cmd=["docker", "run"], timeout=600)):
        result = validate_install_asset("...", "debian:12-slim", spec)
    assert result.success is False
    assert "timeout" in result.error_log.lower()
