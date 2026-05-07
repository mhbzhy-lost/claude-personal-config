"""Unit tests for asset_builder. Mocks LLM + sandbox_runner."""
from __future__ import annotations
from unittest.mock import patch, MagicMock
import pytest
from asset_builder import (
    AssetSpec, ValidationResult, validate_install_asset, build_assets,
)
from sandbox_runner import ExecResult


def _ok(stdout="", stderr=""):
    return ExecResult(0, stdout, stderr)


def _fail(stderr="boom"):
    return ExecResult(1, "", stderr)


def test_validate_install_idempotent_check():
    """First run installs; second run must be no-op (zero diff)."""
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
        m_exec.side_effect = [_ok(), _ok(), _ok()]  # install, install (re-run), smoke
        m_diff.return_value = []  # empty diff after 2nd run
        result = validate_install_asset(install_sh, "debian:12-slim", spec)

    assert result.success is True
    assert result.error_log == ""


def test_validate_install_fails_when_diff_nonempty_after_second_run():
    """Second install run must produce zero diff. Diff = idempotency violation."""
    spec = AssetSpec(filename="install.sh", idempotent_check="which X",
                     smoke_test=["X --version"])
    with patch("asset_builder.run_ephemeral") as m_run, \
         patch("asset_builder.exec_in_container") as m_exec, \
         patch("asset_builder.diff_container") as m_diff:
        m_run.return_value = _ok()
        m_exec.side_effect = [_ok(), _ok()]
        m_diff.return_value = [("A", "/var/log/leak")]  # leaked write
        result = validate_install_asset("...", "debian:12-slim", spec)

    assert result.success is False
    assert "idempotency" in result.error_log.lower()


def test_build_assets_retries_until_success():
    """LLM fails round 1, succeeds round 2."""
    spec = AssetSpec(filename="install.sh", idempotent_check="which X",
                     smoke_test=["X --version"])
    skill = {"name": "test-skill"}

    call_count = {"n": 0}
    def fake_llm(prompt):
        call_count["n"] += 1
        if call_count["n"] == 1:
            return "#!/bin/bash\nbroken"
        return "#!/bin/bash\nwhich X && exit 0\necho ok"

    with patch("asset_builder.validate_install_asset") as v:
        v.side_effect = [
            ValidationResult(False, "round 1 boom"),
            ValidationResult(True, ""),
        ]
        result = build_assets(skill, [spec], "debian:12-slim", fake_llm, "src")

    assert result["install.sh"]["verified"] is True
    assert result["install.sh"]["rounds"] == 2
    assert call_count["n"] == 2


def test_build_assets_marks_unverified_after_3_rounds():
    spec = AssetSpec(filename="install.sh", idempotent_check="which X",
                     smoke_test=["X --version"])
    with patch("asset_builder.validate_install_asset") as v:
        v.return_value = ValidationResult(False, "always fail")
        result = build_assets({"name": "x"}, [spec], "debian:12-slim",
                                lambda p: "broken", "src")
    assert result["install.sh"]["verified"] is False
    assert result["install.sh"]["rounds"] == 3
    assert "always fail" in result["install.sh"]["error"]
