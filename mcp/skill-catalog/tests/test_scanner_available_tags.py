"""Tests for SkillCatalog.available_tags — closed tag universe."""

from __future__ import annotations

import json
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


def test_available_tags_prefers_catalog_json_dict(tmp_path: Path) -> None:
    """When _tag_catalog.json exists with dict-shaped fields, use its keys."""
    # Write a SKILL.md that uses tags NOT present in catalog json — they
    # must be ignored because catalog json takes precedence.
    write_skill(tmp_path, "x", "d", ["frombody"], language=["fromlang"],
                capability=["fromcap"])
    (tmp_path / "_tag_catalog.json").write_text(json.dumps({
        "schema_version": 1,
        "capability": {"ui-form": "desc", "auth": "desc"},
        "tech_stack": {"antd": "desc", "react": "desc"},
        "language": ["python", "typescript"],
    }), encoding="utf-8")

    tags = SkillCatalog(tmp_path).available_tags()
    assert tags["tech_stack"] == ["antd", "react"]
    assert tags["language"] == ["python", "typescript"]
    assert tags["capability"] == ["auth", "ui-form"]


def test_available_tags_catalog_json_list_shape(tmp_path: Path) -> None:
    """Plain-list shape (no descriptions) for capability/tech_stack works too."""
    (tmp_path / "_tag_catalog.json").write_text(json.dumps({
        "schema_version": 1,
        "capability": ["ui-form", "auth"],
        "tech_stack": ["antd"],
        "language": ["python"],
    }), encoding="utf-8")

    tags = SkillCatalog(tmp_path).available_tags()
    assert tags["tech_stack"] == ["antd"]
    assert tags["capability"] == ["auth", "ui-form"]
    assert tags["language"] == ["python"]


def test_available_tags_falls_back_when_catalog_invalid(tmp_path: Path) -> None:
    """Malformed JSON falls back to frontmatter aggregation."""
    write_skill(tmp_path, "a", "d", ["docker"], capability=["container"])
    (tmp_path / "_tag_catalog.json").write_text("{ not valid json", encoding="utf-8")

    tags = SkillCatalog(tmp_path).available_tags()
    assert tags["tech_stack"] == ["docker"]
    assert tags["capability"] == ["container"]
