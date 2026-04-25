"""Integration tests for the resolve pipeline (shared by MCP tool + CLI)."""

from __future__ import annotations

import json
import textwrap
from pathlib import Path

import pytest

from skill_catalog.intent_fallback import ClassifyResult
from skill_catalog.pipeline import run_resolve_pipeline
from skill_catalog.scanner import SkillCatalog


def _write_skill(library: Path, name: str, description: str,
                 tech_stack: list[str], capability: list[str] | None = None) -> None:
    skill_dir = library / name
    skill_dir.mkdir(parents=True, exist_ok=True)
    fm: list[str] = ["---", f"name: {name}", f'description: "{description}"']
    fm.append(f"tech_stack: {json.dumps(tech_stack)}")
    if capability:
        fm.append(f"capability: {json.dumps(capability)}")
    fm.append("---")
    fm.append("body content")
    (skill_dir / "SKILL.md").write_text("\n".join(fm), encoding="utf-8")


@pytest.fixture
def catalog(tmp_path: Path) -> SkillCatalog:
    lib = tmp_path / "skills"
    lib.mkdir()
    _write_skill(lib, "ant-form", "Ant Design 表单最佳实践",
                 ["antd", "react"], ["ui-form"])
    _write_skill(lib, "ant-input", "Ant Design 输入组件",
                 ["antd", "react"], ["ui-form"])
    _write_skill(lib, "django-auth", "Django JWT 登录",
                 ["django"], ["auth"])
    return SkillCatalog(str(lib))


class _FakeClassifier:
    def __init__(self, result: ClassifyResult) -> None:
        self._result = result
        self.calls: list[dict] = []

    def classify(self, user_prompt, fingerprint_summary,
                 available_tech_stack, available_capability,
                 available_language=None):
        self.calls.append(
            {
                "user_prompt": user_prompt,
                "fingerprint_summary": fingerprint_summary,
                "available_tech_stack": available_tech_stack,
                "available_capability": available_capability,
                "available_language": available_language,
            }
        )
        return self._result


def test_pipeline_end_to_end(catalog, tmp_path):
    workspace = tmp_path / "ws"
    workspace.mkdir()
    (workspace / "package.json").write_text(
        json.dumps({"dependencies": {"react": "^19", "antd": "^5"}}),
        encoding="utf-8",
    )

    classifier = _FakeClassifier(
        ClassifyResult(tech_stack=["antd", "react"], capability=["ui-form"])
    )

    result = run_resolve_pipeline(
        catalog=catalog,
        classifier=classifier,  # type: ignore[arg-type]
        user_prompt="做一个 Ant Design 登录表单",
        cwd=str(workspace),
    )

    assert result["tech_stack"] == ["antd", "react"]
    assert result["capability"] == ["ui-form"]
    assert result["classifier_error"] is None
    names = [s["name"] for s in result["skills"]]
    assert "ant-form" in names
    assert "ant-input" in names
    assert "django-auth" not in names
    # fingerprint detected react+antd
    assert "react" in result["fingerprint"]["detected"].get("tech_stack", [])
    # classifier was called with the available tag universe
    assert classifier.calls[0]["available_tech_stack"]


def test_pipeline_preset_tags_skips_classifier(catalog, tmp_path):
    classifier = _FakeClassifier(
        ClassifyResult(tech_stack=["should-not-be-used"], capability=[])
    )
    result = run_resolve_pipeline(
        catalog=catalog,
        classifier=classifier,  # type: ignore[arg-type]
        user_prompt="x",
        cwd=str(tmp_path),
        tech_stack=["antd"],
        capability=["ui-form"],
    )
    # classifier not called because both preset
    assert classifier.calls == []
    assert result["tech_stack"] == ["antd"]
    assert result["capability"] == ["ui-form"]
    names = [s["name"] for s in result["skills"]]
    assert "ant-form" in names


def test_pipeline_classifier_error_degrades_gracefully(catalog, tmp_path):
    classifier = _FakeClassifier(
        ClassifyResult(tech_stack=[], capability=[], error="timeout")
    )
    result = run_resolve_pipeline(
        catalog=catalog,
        classifier=classifier,  # type: ignore[arg-type]
        user_prompt="x",
        cwd=str(tmp_path),
    )
    assert result["classifier_error"] == "timeout"
    assert result["tech_stack"] == []
    assert result["capability"] == []
    assert result["skills"] == []


def test_pipeline_monorepo_submodule_detection(catalog, tmp_path):
    workspace = tmp_path / "monorepo"
    workspace.mkdir()
    (workspace / "pyproject.toml").write_text(
        '[project]\nname = "x"\ndependencies = ["fastapi"]\n', encoding="utf-8"
    )
    web = workspace / "web"
    web.mkdir()
    (web / "package.json").write_text(
        json.dumps({"dependencies": {"react": "^19", "antd": "^5"}}),
        encoding="utf-8",
    )

    classifier = _FakeClassifier(
        ClassifyResult(tech_stack=["antd", "react"], capability=["ui-form"])
    )
    result = run_resolve_pipeline(
        catalog=catalog,
        classifier=classifier,  # type: ignore[arg-type]
        user_prompt="antd 表单",
        cwd=str(workspace),
    )
    tech = result["fingerprint"]["detected"].get("tech_stack", [])
    assert "fastapi" in tech
    assert "react" in tech
    assert "antd" in tech
    # web/ prefix in evidence
    evidence = result["fingerprint"]["detected"].get("evidence", [])
    assert any(e.startswith("web/") for e in evidence)


def test_pipeline_match_quality_high(catalog, tmp_path):
    # tech_stack tag hit -> top score >= 2.0 -> high; no hint field
    classifier = _FakeClassifier(
        ClassifyResult(tech_stack=["antd", "react"], capability=["ui-form"])
    )
    result = run_resolve_pipeline(
        catalog=catalog,
        classifier=classifier,  # type: ignore[arg-type]
        user_prompt="antd 表单",
        cwd=str(tmp_path),
    )
    assert result["match_quality"] == "high"
    assert "hint" not in result
    assert result["skills"]


def test_pipeline_match_quality_empty(catalog, tmp_path):
    # No tags at all -> skills list empty -> empty + hint
    classifier = _FakeClassifier(
        ClassifyResult(tech_stack=[], capability=[])
    )
    result = run_resolve_pipeline(
        catalog=catalog,
        classifier=classifier,  # type: ignore[arg-type]
        user_prompt="x",
        cwd=str(tmp_path),
    )
    assert result["skills"] == []
    assert result["match_quality"] == "empty"
    assert "hint" in result
    assert "No relevant skill" in result["hint"]


def test_pipeline_match_quality_low(tmp_path):
    # Hand-craft a catalog whose top-1 only matches via capability (1.5 < 2.0)
    # and via keyword fuzz, so top score stays below the high threshold.
    lib = tmp_path / "skills_low"
    lib.mkdir()
    _write_skill(lib, "lonely-cap", "some description",
                 tech_stack=["unrelated-stack"], capability=["ui-form"])
    cat = SkillCatalog(str(lib))
    classifier = _FakeClassifier(
        ClassifyResult(tech_stack=[], capability=["ui-form"])
    )
    result = run_resolve_pipeline(
        catalog=cat,
        classifier=classifier,  # type: ignore[arg-type]
        user_prompt="anything",
        cwd=str(tmp_path),
        capability=["ui-form"],
    )
    assert result["skills"]
    assert result["match_quality"] == "low"
    assert "hint" in result
    assert "below confidence threshold" in result["hint"]


def test_pipeline_top_n_override(catalog, tmp_path):
    classifier = _FakeClassifier(
        ClassifyResult(tech_stack=["antd", "react"], capability=["ui-form"])
    )
    result = run_resolve_pipeline(
        catalog=catalog,
        classifier=classifier,  # type: ignore[arg-type]
        user_prompt="x",
        cwd=str(tmp_path),
        top_n_limit=1,
    )
    assert len(result["skills"]) == 1
