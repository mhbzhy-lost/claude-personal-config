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


def write_skill(
    directory: Path,
    name: str,
    description: str,
    tech_stack,
    body: str = "",
    language=None,
    capability=None,
) -> Path:
    """Write a synthetic SKILL.md under *directory/name*/SKILL.md."""
    skill_dir = directory / name
    skill_dir.mkdir(parents=True, exist_ok=True)
    skill_file = skill_dir / "SKILL.md"

    if isinstance(tech_stack, list):
        tag_yaml = "[" + ", ".join(tech_stack) + "]"
    else:
        tag_yaml = str(tech_stack)

    lang_line = ""
    if language is not None:
        if isinstance(language, list):
            lang_yaml = "[" + ", ".join(language) + "]"
        else:
            lang_yaml = str(language)
        lang_line = f"language: {lang_yaml}\n"

    cap_line = ""
    if capability is not None:
        if isinstance(capability, list):
            cap_yaml = "[" + ", ".join(capability) + "]"
        else:
            cap_yaml = str(capability)
        cap_line = f"capability: {cap_yaml}\n"

    skill_file.write_text(
        f"---\nname: {name}\ndescription: \"{description}\"\ntech_stack: {tag_yaml}\n{lang_line}{cap_line}---\n{body}\n",
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
# 4. Both tech_stack and language empty → returns full catalog
# ---------------------------------------------------------------------------


def test_list_skills_both_empty_returns_all(tmp_path: Path) -> None:
    write_skill(tmp_path, "skill-a", "desc a", ["react"], language=["typescript"])
    write_skill(tmp_path, "skill-b", "desc b", ["vue"])
    catalog = SkillCatalog(tmp_path)

    for args in [([],), (None, None), ([], [])]:
        result = catalog.list_skills(*args)
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
# 6. list_skills with unknown tag returns nothing (no match)
# ---------------------------------------------------------------------------


def test_list_skills_unknown_tag_returns_empty(tmp_path: Path) -> None:
    write_skill(tmp_path, "skill-a", "desc", ["react"])
    write_skill(tmp_path, "skill-b", "desc", ["vue"])
    catalog = SkillCatalog(tmp_path)

    result = catalog.list_skills(["nonexistent-framework"])
    assert result["skills"] == []


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


# ---------------------------------------------------------------------------
# 14. language field is parsed into SkillRecord
# ---------------------------------------------------------------------------


def test_language_field_parsed(tmp_path: Path) -> None:
    write_skill(tmp_path, "py-skill", "desc", ["django"], language=["python"])
    catalog = SkillCatalog(tmp_path)
    assert catalog.by_name["py-skill"].language == ["python"]


def test_no_language_field_defaults_to_empty(tmp_path: Path) -> None:
    write_skill(tmp_path, "agnostic-skill", "desc", ["docker"])
    catalog = SkillCatalog(tmp_path)
    assert catalog.by_name["agnostic-skill"].language == []


def test_language_string_scalar_normalised(tmp_path: Path) -> None:
    skill_dir = tmp_path / "scalar-lang"
    skill_dir.mkdir()
    (skill_dir / "SKILL.md").write_text(
        "---\nname: scalar-lang\ndescription: desc\ntech_stack: [react]\nlanguage: typescript\n---\nbody\n",
        encoding="utf-8",
    )
    catalog = SkillCatalog(tmp_path)
    assert catalog.by_name["scalar-lang"].language == ["typescript"]


# ---------------------------------------------------------------------------
# 15. list_skills with language filter excludes agnostic skills
# ---------------------------------------------------------------------------


def test_list_skills_language_filter_excludes_agnostic(tmp_path: Path) -> None:
    write_skill(tmp_path, "harmony-arkts", "desc", ["harmonyos"], language=["arkts"])
    write_skill(tmp_path, "harmony-cpp", "desc", ["harmonyos"], language=["cpp"])
    write_skill(tmp_path, "harmony-doc", "desc", ["harmonyos"])  # agnostic
    catalog = SkillCatalog(tmp_path)

    result = catalog.list_skills(["harmonyos"], language=["arkts"])
    names = [s["name"] for s in result["skills"]]
    assert "harmony-arkts" in names
    assert "harmony-doc" not in names  # agnostic excluded when language is set
    assert "harmony-cpp" not in names  # language mismatch


# ---------------------------------------------------------------------------
# 16. list_skills without language returns all tech_stack matches
# ---------------------------------------------------------------------------


def test_list_skills_no_language_returns_all(tmp_path: Path) -> None:
    write_skill(tmp_path, "harmony-arkts", "desc", ["harmonyos"], language=["arkts"])
    write_skill(tmp_path, "harmony-cpp", "desc", ["harmonyos"], language=["cpp"])
    catalog = SkillCatalog(tmp_path)

    result = catalog.list_skills(["harmonyos"])
    names = [s["name"] for s in result["skills"]]
    assert "harmony-arkts" in names
    assert "harmony-cpp" in names


# ---------------------------------------------------------------------------
# 17. list_skills language filter with multi-language skill
# ---------------------------------------------------------------------------


def test_list_skills_language_filter_multi_language_skill(tmp_path: Path) -> None:
    write_skill(tmp_path, "jni-skill", "desc", ["android"], language=["java", "cpp"])
    write_skill(tmp_path, "ndk-skill", "desc", ["android"], language=["cpp"])
    catalog = SkillCatalog(tmp_path)

    # Query with java → jni matches (has java), ndk does not
    result = catalog.list_skills(["android"], language=["java"])
    names = [s["name"] for s in result["skills"]]
    assert "jni-skill" in names
    assert "ndk-skill" not in names

    # Query with cpp → both match
    result = catalog.list_skills(["android"], language=["cpp"])
    names = [s["name"] for s in result["skills"]]
    assert "jni-skill" in names
    assert "ndk-skill" in names


# ---------------------------------------------------------------------------
# 18. language field appears in list_skills output only when non-empty
# ---------------------------------------------------------------------------


def test_list_skills_output_includes_language_when_present(tmp_path: Path) -> None:
    write_skill(tmp_path, "typed-skill", "desc", ["react"], language=["typescript"])
    write_skill(tmp_path, "plain-skill", "desc", ["react"])
    catalog = SkillCatalog(tmp_path)

    result = catalog.list_skills(["react"])
    by_name = {s["name"]: s for s in result["skills"]}
    assert by_name["typed-skill"]["language"] == ["typescript"]
    assert "language" not in by_name["plain-skill"]


# ---------------------------------------------------------------------------
# 19. Cross-stack isolation: harmonyos+cpp must NOT return android JNI
# ---------------------------------------------------------------------------


def test_cross_stack_language_isolation(tmp_path: Path) -> None:
    write_skill(tmp_path, "harmony-native", "desc", ["harmonyos"], language=["cpp"])
    write_skill(tmp_path, "android-jni", "desc", ["android"], language=["java", "cpp"])
    catalog = SkillCatalog(tmp_path)

    result = catalog.list_skills(["harmonyos"], language=["cpp"])
    names = [s["name"] for s in result["skills"]]
    assert "harmony-native" in names
    assert "android-jni" not in names  # wrong tech_stack


# ---------------------------------------------------------------------------
# 20. Only language provided → returns all skills matching that language
# ---------------------------------------------------------------------------


def test_list_skills_only_language(tmp_path: Path) -> None:
    write_skill(tmp_path, "django-core", "desc", ["django"], language=["python"])
    write_skill(tmp_path, "fastapi-core", "desc", ["fastapi"], language=["python"])
    write_skill(tmp_path, "nextjs-core", "desc", ["nextjs"], language=["typescript"])
    write_skill(tmp_path, "docker-core", "desc", ["docker"])  # agnostic
    catalog = SkillCatalog(tmp_path)

    result = catalog.list_skills(language=["python"])
    names = [s["name"] for s in result["skills"]]
    assert "django-core" in names
    assert "fastapi-core" in names
    assert "nextjs-core" not in names   # wrong language
    assert "docker-core" not in names   # agnostic excluded


# ---------------------------------------------------------------------------
# 21. Only tech_stack provided → returns all skills including agnostic
# ---------------------------------------------------------------------------


def test_list_skills_only_tech_stack_includes_agnostic(tmp_path: Path) -> None:
    write_skill(tmp_path, "harmony-arkts", "desc", ["harmonyos"], language=["arkts"])
    write_skill(tmp_path, "harmony-cpp", "desc", ["harmonyos"], language=["cpp"])
    write_skill(tmp_path, "harmony-doc", "desc", ["harmonyos"])  # agnostic
    catalog = SkillCatalog(tmp_path)

    result = catalog.list_skills(["harmonyos"])
    names = [s["name"] for s in result["skills"]]
    assert "harmony-arkts" in names
    assert "harmony-cpp" in names
    assert "harmony-doc" in names  # agnostic included when no language constraint


# ---------------------------------------------------------------------------
# 22. tech_stack intersection (default): multi-tag query requires ALL tags
# ---------------------------------------------------------------------------


def test_ts_intersection_multi_tag_requires_all(tmp_path: Path) -> None:
    write_skill(tmp_path, "compose-anim", "desc", ["compose", "android", "mobile-native"])
    write_skill(tmp_path, "android-jni", "desc", ["android", "mobile-native"])
    write_skill(tmp_path, "pure-compose", "desc", ["compose"])
    catalog = SkillCatalog(tmp_path, tech_stack_match_mode="intersection")

    result = catalog.list_skills(["compose", "android"])
    names = [s["name"] for s in result["skills"]]
    assert "compose-anim" in names      # has both compose & android
    assert "android-jni" not in names   # missing compose
    assert "pure-compose" not in names  # missing android


def test_ts_intersection_single_tag_same_as_union(tmp_path: Path) -> None:
    write_skill(tmp_path, "skill-react", "desc", ["react", "frontend"])
    write_skill(tmp_path, "skill-vue", "desc", ["vue", "frontend"])
    catalog = SkillCatalog(tmp_path, tech_stack_match_mode="intersection")

    result = catalog.list_skills(["react"])
    names = [s["name"] for s in result["skills"]]
    assert "skill-react" in names
    assert "skill-vue" not in names


# ---------------------------------------------------------------------------
# 23. tech_stack union: multi-tag query matches ANY tag
# ---------------------------------------------------------------------------


def test_ts_union_multi_tag_matches_any(tmp_path: Path) -> None:
    write_skill(tmp_path, "compose-anim", "desc", ["compose", "android", "mobile-native"])
    write_skill(tmp_path, "android-jni", "desc", ["android", "mobile-native"])
    write_skill(tmp_path, "pure-compose", "desc", ["compose"])
    write_skill(tmp_path, "react-btn", "desc", ["react", "frontend"])
    catalog = SkillCatalog(tmp_path, tech_stack_match_mode="union")

    result = catalog.list_skills(["compose", "android"])
    names = [s["name"] for s in result["skills"]]
    assert "compose-anim" in names     # has compose & android
    assert "android-jni" in names      # has android
    assert "pure-compose" in names     # has compose
    assert "react-btn" not in names    # neither compose nor android


# ---------------------------------------------------------------------------
# 24. language union (default): multi-tag query matches ANY language
# ---------------------------------------------------------------------------


def test_lang_union_multi_tag_matches_any(tmp_path: Path) -> None:
    write_skill(tmp_path, "jni-skill", "desc", ["android"], language=["java", "cpp"])
    write_skill(tmp_path, "kotlin-skill", "desc", ["android"], language=["kotlin"])
    # default: language_match_mode="union"
    catalog = SkillCatalog(tmp_path)

    result = catalog.list_skills(["android"], language=["java", "kotlin"])
    names = [s["name"] for s in result["skills"]]
    assert "jni-skill" in names        # has java
    assert "kotlin-skill" in names     # has kotlin


# ---------------------------------------------------------------------------
# 25. language intersection: multi-tag query requires ALL languages
# ---------------------------------------------------------------------------


def test_lang_intersection_multi_tag_requires_all(tmp_path: Path) -> None:
    write_skill(tmp_path, "jni-skill", "desc", ["android"], language=["java", "cpp"])
    write_skill(tmp_path, "kotlin-skill", "desc", ["android"], language=["kotlin"])
    catalog = SkillCatalog(tmp_path, language_match_mode="intersection")

    result = catalog.list_skills(["android"], language=["java", "cpp"])
    names = [s["name"] for s in result["skills"]]
    assert "jni-skill" in names        # has both java & cpp
    assert "kotlin-skill" not in names # missing java & cpp


# ---------------------------------------------------------------------------
# 26. Independent control: ts=intersection + lang=union (default combo)
# ---------------------------------------------------------------------------


def test_independent_modes_default_combo(tmp_path: Path) -> None:
    write_skill(tmp_path, "compose-anim", "desc", ["compose", "android"], language=["kotlin"])
    write_skill(tmp_path, "android-jni", "desc", ["android"], language=["java", "cpp"])
    write_skill(tmp_path, "compose-test", "desc", ["compose", "android"], language=["java"])
    # default: tech_stack=intersection, language=union
    catalog = SkillCatalog(tmp_path)

    # tech_stack requires BOTH compose+android; language matches ANY of java/kotlin
    result = catalog.list_skills(["compose", "android"], language=["java", "kotlin"])
    names = [s["name"] for s in result["skills"]]
    assert "compose-anim" in names     # ts: both ✓, lang: kotlin ✓
    assert "compose-test" in names     # ts: both ✓, lang: java ✓
    assert "android-jni" not in names  # ts: missing compose ✗


# ---------------------------------------------------------------------------
# 27. Invalid match_mode raises ValueError
# ---------------------------------------------------------------------------


def test_invalid_ts_match_mode_raises(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="tech_stack_match_mode"):
        SkillCatalog(tmp_path, tech_stack_match_mode="invalid")


def test_invalid_lang_match_mode_raises(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="language_match_mode"):
        SkillCatalog(tmp_path, language_match_mode="invalid")


def test_invalid_capability_match_mode_raises(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="capability_match_mode"):
        SkillCatalog(tmp_path, capability_match_mode="invalid")


# ---------------------------------------------------------------------------
# 28. Capability filter: union mode (default) — any intersection matches
# ---------------------------------------------------------------------------


def test_capability_union_match(tmp_path: Path) -> None:
    write_skill(tmp_path, "ant-select", "desc", ["antd"], capability=["ui-input", "ui-overlay"])
    write_skill(tmp_path, "ant-button", "desc", ["antd"], capability=["ui-action"])
    write_skill(tmp_path, "ant-modal", "desc", ["antd"], capability=["ui-overlay"])
    catalog = SkillCatalog(tmp_path)  # capability default = union

    result = catalog.list_skills(["antd"], capability=["ui-overlay"])
    names = [s["name"] for s in result["skills"]]
    assert names == ["ant-modal", "ant-select"]  # sorted


# ---------------------------------------------------------------------------
# 29. Capability filter: intersection mode requires all keys present
# ---------------------------------------------------------------------------


def test_capability_intersection_requires_all_keys(tmp_path: Path) -> None:
    write_skill(tmp_path, "ant-select", "desc", ["antd"], capability=["ui-input", "ui-overlay"])
    write_skill(tmp_path, "ant-button", "desc", ["antd"], capability=["ui-action"])
    catalog = SkillCatalog(tmp_path, capability_match_mode="intersection")

    result = catalog.list_skills(["antd"], capability=["ui-input", "ui-overlay"])
    names = [s["name"] for s in result["skills"]]
    assert names == ["ant-select"]

    result = catalog.list_skills(["antd"], capability=["ui-input", "ui-action"])
    assert result["skills"] == []


# ---------------------------------------------------------------------------
# 30. Skills without capability field are excluded when capability is queried
# ---------------------------------------------------------------------------


def test_capability_filter_excludes_unmarked_skills(tmp_path: Path) -> None:
    write_skill(tmp_path, "ant-select", "desc", ["antd"], capability=["ui-input"])
    write_skill(tmp_path, "ant-legacy", "desc", ["antd"])  # no capability
    catalog = SkillCatalog(tmp_path)

    result = catalog.list_skills(["antd"], capability=["ui-input"])
    names = [s["name"] for s in result["skills"]]
    assert names == ["ant-select"]

    # Without capability filter, legacy skill is still returned.
    result = catalog.list_skills(["antd"])
    names = [s["name"] for s in result["skills"]]
    assert "ant-legacy" in names


# ---------------------------------------------------------------------------
# 31. capability field appears in output only when non-empty
# ---------------------------------------------------------------------------


def test_capability_output_field_presence(tmp_path: Path) -> None:
    write_skill(tmp_path, "ant-select", "desc", ["antd"], capability=["ui-input"])
    write_skill(tmp_path, "ant-legacy", "desc", ["antd"])
    catalog = SkillCatalog(tmp_path)

    result = catalog.list_skills(["antd"])
    by_name = {s["name"]: s for s in result["skills"]}
    assert by_name["ant-select"]["capability"] == ["ui-input"]
    assert "capability" not in by_name["ant-legacy"]


# ---------------------------------------------------------------------------
# 32. Capability + tech_stack + language compose correctly
# ---------------------------------------------------------------------------


def test_capability_composes_with_other_filters(tmp_path: Path) -> None:
    write_skill(
        tmp_path, "react-form-ts", "desc", ["react"],
        language=["typescript"], capability=["ui-form"],
    )
    write_skill(
        tmp_path, "react-form-js", "desc", ["react"],
        language=["javascript"], capability=["ui-form"],
    )
    write_skill(
        tmp_path, "react-table-ts", "desc", ["react"],
        language=["typescript"], capability=["ui-display"],
    )
    catalog = SkillCatalog(tmp_path)

    result = catalog.list_skills(
        ["react"], language=["typescript"], capability=["ui-form"],
    )
    names = [s["name"] for s in result["skills"]]
    assert names == ["react-form-ts"]


# ---------------------------------------------------------------------------
# 33. Scalar capability frontmatter value is normalised to list
# ---------------------------------------------------------------------------


def test_capability_scalar_value_normalized(tmp_path: Path) -> None:
    # Write a skill whose frontmatter has capability as a plain string.
    skill_dir = tmp_path / "single-cap"
    skill_dir.mkdir()
    (skill_dir / "SKILL.md").write_text(
        "---\nname: single-cap\ndescription: \"x\"\ntech_stack: [antd]\n"
        "capability: ui-action\n---\n",
        encoding="utf-8",
    )
    catalog = SkillCatalog(tmp_path)
    result = catalog.list_skills(["antd"], capability=["ui-action"])
    names = [s["name"] for s in result["skills"]]
    assert names == ["single-cap"]
