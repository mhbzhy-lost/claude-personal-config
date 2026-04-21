"""Tests for SkillCatalog.available_tags — closed tag universe."""

from __future__ import annotations

from pathlib import Path

from skill_catalog.scanner import SkillCatalog

from test_scanner import write_skill  # noqa: E402 — sibling test module


def test_available_tags_empty_library(tmp_path: Path) -> None:
    catalog = SkillCatalog(tmp_path)
    tags = catalog.available_tags()
    assert tags == {"tech_stack": [], "language": [], "capability": []}


def test_available_tags_collects_and_sorts(tmp_path: Path) -> None:
    write_skill(tmp_path, "a", "d", ["react", "frontend"],
                language=["typescript"], capability=["ui-form"])
    write_skill(tmp_path, "b", "d", ["antd", "react"],
                language=["typescript"], capability=["ui-input"])
    write_skill(tmp_path, "c", "d", ["django"],
                language=["python"], capability=["web-framework", "orm"])

    catalog = SkillCatalog(tmp_path)
    tags = catalog.available_tags()

    assert tags["tech_stack"] == ["antd", "django", "frontend", "react"]
    assert tags["language"] == ["python", "typescript"]
    assert tags["capability"] == ["orm", "ui-form", "ui-input", "web-framework"]


def test_available_tags_deduplicates(tmp_path: Path) -> None:
    write_skill(tmp_path, "a", "d", ["react"], language=["typescript"],
                capability=["ui-form"])
    write_skill(tmp_path, "b", "d", ["react"], language=["typescript"],
                capability=["ui-form"])
    tags = SkillCatalog(tmp_path).available_tags()
    assert tags["tech_stack"] == ["react"]
    assert tags["language"] == ["typescript"]
    assert tags["capability"] == ["ui-form"]


def test_available_tags_skill_without_optional_fields(tmp_path: Path) -> None:
    write_skill(tmp_path, "legacy", "d", ["docker"])  # no language/capability
    tags = SkillCatalog(tmp_path).available_tags()
    assert tags["tech_stack"] == ["docker"]
    assert tags["language"] == []
    assert tags["capability"] == []
