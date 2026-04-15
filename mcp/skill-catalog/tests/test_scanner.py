"""Minimal pytest suite for SkillCatalog scanner logic.

Tests use tmp_path fixtures with synthetic SKILL.md files so no real
skills directory is required, and no external I/O occurs.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from skill_catalog.scanner import SkillCatalog, _rewrite_relative_links


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def write_skill(directory: Path, name: str, description: str, tech_stack, body: str = "") -> Path:
    """Write a synthetic SKILL.md under *directory/name*/SKILL.md."""
    skill_dir = directory / name
    skill_dir.mkdir(parents=True, exist_ok=True)
    skill_file = skill_dir / "SKILL.md"

    if isinstance(tech_stack, list):
        tag_yaml = "[" + ", ".join(tech_stack) + "]"
    else:
        tag_yaml = str(tech_stack)

    skill_file.write_text(
        f"---\nname: {name}\ndescription: \"{description}\"\ntech_stack: {tag_yaml}\n---\n{body}\n",
        encoding="utf-8",
    )
    return skill_file


# ---------------------------------------------------------------------------
# 1. Empty library → catalog is empty, no crash
# ---------------------------------------------------------------------------


def test_empty_library_returns_empty_catalog(tmp_path: Path) -> None:
    catalog = SkillCatalog(tmp_path)
    assert catalog.by_name == {}
    assert catalog.by_tag == {}


# ---------------------------------------------------------------------------
# 2. Non-existent path → same as empty, no crash
# ---------------------------------------------------------------------------


def test_nonexistent_library_path_is_safe(tmp_path: Path) -> None:
    catalog = SkillCatalog(tmp_path / "does_not_exist")
    assert catalog.by_name == {}


# ---------------------------------------------------------------------------
# 3. Single skill is indexed correctly
# ---------------------------------------------------------------------------


def test_single_skill_indexed(tmp_path: Path) -> None:
    write_skill(tmp_path, "playwright-core", "Playwright E2E", ["playwright"])
    catalog = SkillCatalog(tmp_path)

    assert "playwright-core" in catalog.by_name
    record = catalog.by_name["playwright-core"]
    assert record.tech_stack == ["playwright"]
    assert record.description == "Playwright E2E"
    assert "playwright" in catalog.by_tag
    assert "playwright-core" in catalog.by_tag["playwright"]


# ---------------------------------------------------------------------------
# 4. list_skills([]) returns all skills that have tech_stack field
# ---------------------------------------------------------------------------


def test_list_skills_empty_query_returns_all(tmp_path: Path) -> None:
    write_skill(tmp_path, "skill-a", "desc a", ["react"])
    write_skill(tmp_path, "skill-b", "desc b", ["vue"])
    catalog = SkillCatalog(tmp_path)

    result = catalog.list_skills([])
    names = [s["name"] for s in result["skills"]]
    assert "skill-a" in names
    assert "skill-b" in names


# ---------------------------------------------------------------------------
# 5. list_skills with known tag returns only matching skills
# ---------------------------------------------------------------------------


def test_list_skills_known_tag_filters_correctly(tmp_path: Path) -> None:
    write_skill(tmp_path, "skill-react", "desc", ["react"])
    write_skill(tmp_path, "skill-vue", "desc", ["vue"])
    catalog = SkillCatalog(tmp_path)

    result = catalog.list_skills(["react"])
    names = [s["name"] for s in result["skills"]]
    assert "skill-react" in names
    assert "skill-vue" not in names


# ---------------------------------------------------------------------------
# 6. list_skills with unknown tag falls back to full catalog
# ---------------------------------------------------------------------------


def test_list_skills_unknown_tag_returns_full_catalog(tmp_path: Path) -> None:
    write_skill(tmp_path, "skill-a", "desc", ["react"])
    write_skill(tmp_path, "skill-b", "desc", ["vue"])
    catalog = SkillCatalog(tmp_path)

    result = catalog.list_skills(["nonexistent-framework"])
    names = [s["name"] for s in result["skills"]]
    assert "skill-a" in names
    assert "skill-b" in names


# ---------------------------------------------------------------------------
# 7. list_skills result is sorted by name
# ---------------------------------------------------------------------------


def test_list_skills_result_is_sorted(tmp_path: Path) -> None:
    write_skill(tmp_path, "zebra-skill", "desc", ["react"])
    write_skill(tmp_path, "alpha-skill", "desc", ["react"])
    write_skill(tmp_path, "mango-skill", "desc", ["react"])
    catalog = SkillCatalog(tmp_path)

    result = catalog.list_skills(["react"])
    names = [s["name"] for s in result["skills"]]
    assert names == sorted(names)


# ---------------------------------------------------------------------------
# 8. get_skill returns body for known skill
# ---------------------------------------------------------------------------


def test_get_skill_returns_body(tmp_path: Path) -> None:
    write_skill(tmp_path, "my-skill", "desc", ["react"], body="## Usage\nDo stuff.")
    catalog = SkillCatalog(tmp_path)

    result = catalog.get_skill("my-skill")
    assert result is not None
    assert "Usage" in result["content"]


# ---------------------------------------------------------------------------
# 9. get_skill returns None for unknown skill
# ---------------------------------------------------------------------------


def test_get_skill_unknown_returns_none(tmp_path: Path) -> None:
    catalog = SkillCatalog(tmp_path)
    assert catalog.get_skill("no-such-skill") is None


# ---------------------------------------------------------------------------
# 10. _rewrite_relative_links rewrites relative paths to absolute
# ---------------------------------------------------------------------------


def test_rewrite_relative_links_rewrites_relative(tmp_path: Path) -> None:
    skill_dir = tmp_path / "my-skill"
    skill_dir.mkdir()
    body = "See [example](assets/example.png) for details."
    rewritten = _rewrite_relative_links(body, skill_dir)

    # Result must reference an absolute path derived from skill_dir
    expected_abs = str((skill_dir / "assets/example.png").resolve())
    assert expected_abs in rewritten


def test_rewrite_relative_links_leaves_http_intact(tmp_path: Path) -> None:
    skill_dir = tmp_path / "my-skill"
    skill_dir.mkdir()
    body = "See [docs](https://example.com/guide) for details."
    rewritten = _rewrite_relative_links(body, skill_dir)
    assert "https://example.com/guide" in rewritten


def test_rewrite_relative_links_leaves_anchor_intact(tmp_path: Path) -> None:
    skill_dir = tmp_path / "my-skill"
    skill_dir.mkdir()
    body = "Go to [section](#heading)."
    rewritten = _rewrite_relative_links(body, skill_dir)
    assert "(#heading)" in rewritten


# ---------------------------------------------------------------------------
# 11. Malformed SKILL.md is silently skipped (catalog still functional)
# ---------------------------------------------------------------------------


def test_malformed_skill_md_is_skipped(tmp_path: Path) -> None:
    bad_dir = tmp_path / "bad-skill"
    bad_dir.mkdir()
    (bad_dir / "SKILL.md").write_text("---\nbad: [\n---\nbody\n", encoding="utf-8")

    write_skill(tmp_path, "good-skill", "desc", ["react"])
    catalog = SkillCatalog(tmp_path)

    # Bad skill skipped; good skill still indexed
    assert "good-skill" in catalog.by_name
    assert "bad-skill" not in catalog.by_name


# ---------------------------------------------------------------------------
# 12. SKILL.md without `name` field is skipped
# ---------------------------------------------------------------------------


def test_skill_without_name_is_skipped(tmp_path: Path) -> None:
    no_name_dir = tmp_path / "no-name"
    no_name_dir.mkdir()
    (no_name_dir / "SKILL.md").write_text(
        "---\ndescription: has no name\ntech_stack: [react]\n---\nbody\n",
        encoding="utf-8",
    )
    catalog = SkillCatalog(tmp_path)
    assert catalog.by_name == {}


# ---------------------------------------------------------------------------
# 13. tech_stack as string scalar is normalised to list
# ---------------------------------------------------------------------------


def test_tech_stack_string_scalar_normalised(tmp_path: Path) -> None:
    skill_dir = tmp_path / "scalar-skill"
    skill_dir.mkdir()
    (skill_dir / "SKILL.md").write_text(
        "---\nname: scalar-skill\ndescription: desc\ntech_stack: react\n---\nbody\n",
        encoding="utf-8",
    )
    catalog = SkillCatalog(tmp_path)
    record = catalog.by_name["scalar-skill"]
    assert record.tech_stack == ["react"]
    assert "scalar-skill" in catalog.by_tag["react"]
