"""Tests for `skill-catalog-cli get` subcommand."""

from __future__ import annotations

import io
import json
from pathlib import Path

import pytest

from skill_catalog import cli as cli_mod

from test_scanner import write_skill


@pytest.fixture
def library(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    write_skill(
        tmp_path,
        "demo-skill",
        "a demo skill",
        ["demo"],
        body="# Demo Body\n\nHello world.",
    )
    monkeypatch.setenv("SKILL_LIBRARY_PATH", str(tmp_path))
    return tmp_path


def _run(monkeypatch: pytest.MonkeyPatch, argv: list[str]) -> tuple[int, str]:
    buf = io.StringIO()
    monkeypatch.setattr("sys.stdout", buf)
    monkeypatch.setattr("sys.argv", argv)
    rc = cli_mod.main()
    return rc, buf.getvalue()


def test_get_existing_skill_json(library: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    rc, out = _run(monkeypatch, ["skill-catalog-cli", "get", "--name", "demo-skill", "--json-output"])
    assert rc == 0
    payload = json.loads(out)
    assert payload["name"] == "demo-skill"
    assert payload["content"] is not None
    assert "Demo Body" in payload["content"]


def test_get_existing_skill_text(library: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    rc, out = _run(monkeypatch, ["skill-catalog-cli", "get", "--name", "demo-skill", "--text-output"])
    assert rc == 0
    assert "Demo Body" in out
    assert "Hello world" in out


def test_get_missing_skill_json(library: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    rc, out = _run(monkeypatch, ["skill-catalog-cli", "get", "--name", "not-exist", "--json-output"])
    assert rc == 0
    payload = json.loads(out)
    assert payload["name"] == "not-exist"
    assert payload["content"] is None


def test_get_missing_skill_text(library: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    rc, out = _run(monkeypatch, ["skill-catalog-cli", "get", "--name", "not-exist", "--text-output"])
    assert rc == 2
    assert out == ""
