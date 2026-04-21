"""Tests for skill_catalog.ranking — pure-script scoring and top-N."""

from __future__ import annotations

from skill_catalog.ranking import (
    RankedSkill,
    extract_user_keywords,
    rank,
    top_n,
)


# ---------------------------------------------------------------------------
# extract_user_keywords
# ---------------------------------------------------------------------------


def test_extract_empty_returns_empty() -> None:
    assert extract_user_keywords("") == []
    assert extract_user_keywords("  ") == []


def test_extract_filters_english_stopwords() -> None:
    kws = extract_user_keywords("the a of Cascader and Table", top_k=5)
    assert "the" not in kws
    assert "a" not in kws
    assert "of" not in kws
    assert "Cascader" in kws
    assert "Table" in kws


def test_extract_filters_chinese_stopwords() -> None:
    kws = extract_user_keywords("用 Cascader 实现三级联动的 表单", top_k=5)
    lowered = [k.lower() for k in kws]
    assert "的" not in lowered
    assert "了" not in lowered
    assert "cascader" in lowered
    # either 三级联动 or a 2/3/4-gram sub-window of it should surface
    assert any("三级" in k or "联动" in k or "三级联动" in k for k in kws)


def test_extract_respects_top_k() -> None:
    kws = extract_user_keywords("Form Input Button Table Modal Drawer", top_k=3)
    assert len(kws) == 3


def test_extract_top_k_zero_returns_empty() -> None:
    assert extract_user_keywords("Cascader Table", top_k=0) == []


# ---------------------------------------------------------------------------
# rank: tech_stack
# ---------------------------------------------------------------------------


def _mk(name: str, **kw) -> dict:
    out = {"name": name, "description": kw.get("description", ""),
           "tech_stack": kw.get("tech_stack", []),
           "capability": kw.get("capability", [])}
    return out


def test_rank_tech_overlap_scores_higher() -> None:
    skills = [
        _mk("a", tech_stack=["react", "antd"]),
        _mk("b", tech_stack=["react"]),
        _mk("c", tech_stack=["vue"]),
    ]
    ranked = rank(skills, tech_stack=["react", "antd"], capability=[], user_prompt="")
    names = [r.name for r in ranked]
    assert names[0] == "a"  # 2 tag overlap
    assert names[1] == "b"  # 1 tag overlap
    assert names[2] == "c"  # no overlap
    assert ranked[0].score > ranked[1].score > ranked[2].score


def test_rank_capability_overlap() -> None:
    skills = [
        _mk("form", capability=["ui-form", "form-validation"]),
        _mk("input", capability=["ui-input"]),
    ]
    ranked = rank(skills, tech_stack=[], capability=["ui-form", "form-validation"],
                  user_prompt="")
    assert ranked[0].name == "form"


def test_rank_description_keyword_match() -> None:
    skills = [
        _mk("cascader", tech_stack=["antd"], description="级联选择 cascader picker"),
        _mk("button", tech_stack=["antd"], description="普通按钮"),
    ]
    ranked = rank(skills, tech_stack=["antd"], capability=[],
                  user_prompt="用 Cascader 做三级联动")
    assert ranked[0].name == "cascader"
    # cascader should score strictly higher than button
    assert ranked[0].score > ranked[1].score


def test_rank_empty_skills_returns_empty() -> None:
    assert rank([], ["react"], ["ui-form"], "anything") == []


def test_rank_returns_ranked_skill_dataclass() -> None:
    skills = [_mk("a", tech_stack=["react"])]
    ranked = rank(skills, ["react"], [], "")
    assert isinstance(ranked[0], RankedSkill)
    assert ranked[0].name == "a"
    assert ranked[0].score > 0
    assert any(t.startswith("tech:") for t in ranked[0].matched_tags)


def test_rank_skill_without_name_is_dropped() -> None:
    skills = [{"name": "", "tech_stack": ["react"]}, _mk("a", tech_stack=["react"])]
    ranked = rank(skills, ["react"], [], "")
    assert [r.name for r in ranked] == ["a"]


# ---------------------------------------------------------------------------
# top_n dynamic rules
# ---------------------------------------------------------------------------


def _ranked_seq(n: int) -> list[RankedSkill]:
    return [RankedSkill(name=f"s{i}", score=float(n - i)) for i in range(n)]


def test_top_n_explicit_n_truncates() -> None:
    ranked = _ranked_seq(10)
    assert len(top_n(ranked, n=3)) == 3


def test_top_n_dynamic_small_candidate_set_returns_all() -> None:
    ranked = _ranked_seq(5)
    assert len(top_n(ranked, n=None, candidate_count=5)) == 5
    ranked = _ranked_seq(3)
    assert len(top_n(ranked, n=None, candidate_count=3)) == 3


def test_top_n_dynamic_at_threshold_returns_all() -> None:
    # 35 个候选恰好在 FULL_RETURN_THRESHOLD，全返
    ranked = _ranked_seq(35)
    result = top_n(ranked, n=None, candidate_count=35)
    assert len(result) == 35


def test_top_n_dynamic_above_threshold_caps_at_35() -> None:
    # 超过阈值时截到 35
    ranked = _ranked_seq(80)
    result = top_n(ranked, n=None, candidate_count=80)
    assert len(result) == 35


def test_top_n_empty_input() -> None:
    assert top_n([], n=3) == []
    assert top_n([], n=None, candidate_count=100) == []


def test_top_n_falls_back_to_ranked_length_when_no_count() -> None:
    ranked = _ranked_seq(4)
    # candidate_count omitted → use len(ranked)=4 → small → return all
    assert len(top_n(ranked)) == 4
