"""Integration tests for the resolve pipeline (shared by MCP tool + CLI)."""

from __future__ import annotations

import json
import textwrap
from pathlib import Path

import pytest

from skill_catalog.classifier import ClassifyResult
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
                 available_tech_stack, available_capability):
        self.calls.append(
            {
                "user_prompt": user_prompt,
                "fingerprint_summary": fingerprint_summary,
                "available_tech_stack": available_tech_stack,
                "available_capability": available_capability,
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


def test_pipeline_referenced_files_injected_into_classifier(catalog, tmp_path):
    plan = tmp_path / "plan.md"
    plan.write_text(
        "# 计划 56 - 接入 Ant Design 登录弹窗\n涉及 antd Modal + Form。",
        encoding="utf-8",
    )
    classifier = _FakeClassifier(
        ClassifyResult(tech_stack=["antd"], capability=["ui-overlay"])
    )
    result = run_resolve_pipeline(
        catalog=catalog,
        classifier=classifier,  # type: ignore[arg-type]
        user_prompt="执行 @plan.md",
        cwd=str(tmp_path),
        referenced_files=[str(plan)],
    )

    assert classifier.calls, "classifier 应被调用"
    injected = classifier.calls[0]["user_prompt"]
    assert "执行 @plan.md" in injected
    assert "计划 56" in injected
    assert "antd Modal" in injected
    assert str(plan) in result["referenced_files"]


def test_pipeline_referenced_files_missing_is_tolerated(catalog, tmp_path):
    classifier = _FakeClassifier(
        ClassifyResult(tech_stack=["antd"], capability=["ui-form"])
    )
    ghost = tmp_path / "does-not-exist.md"
    result = run_resolve_pipeline(
        catalog=catalog,
        classifier=classifier,  # type: ignore[arg-type]
        user_prompt="x",
        cwd=str(tmp_path),
        referenced_files=[str(ghost)],
    )
    assert result["referenced_files"] == []
    # 原始 prompt 未被污染
    assert classifier.calls[0]["user_prompt"] == "x"


def test_pipeline_referenced_files_truncation(catalog, tmp_path):
    huge = tmp_path / "huge.md"
    # 12KB > 8KB 上限
    huge.write_text("A" * 12_000, encoding="utf-8")
    classifier = _FakeClassifier(
        ClassifyResult(tech_stack=["antd"], capability=["ui-form"])
    )
    result = run_resolve_pipeline(
        catalog=catalog,
        classifier=classifier,  # type: ignore[arg-type]
        user_prompt="x",
        cwd=str(tmp_path),
        referenced_files=[str(huge)],
    )
    assert str(huge) in result["referenced_files"]
    injected = classifier.calls[0]["user_prompt"]
    assert "[truncated at 8192 bytes]" in injected
    # 截断后总长度 < 文件原始大小
    assert injected.count("A") <= 8192


def test_pipeline_referenced_files_caps_at_three(catalog, tmp_path):
    files = []
    for i in range(5):
        f = tmp_path / f"f{i}.md"
        f.write_text(f"# file {i}\nantd", encoding="utf-8")
        files.append(str(f))
    classifier = _FakeClassifier(
        ClassifyResult(tech_stack=["antd"], capability=["ui-form"])
    )
    result = run_resolve_pipeline(
        catalog=catalog,
        classifier=classifier,  # type: ignore[arg-type]
        user_prompt="x",
        cwd=str(tmp_path),
        referenced_files=files,
    )
    assert len(result["referenced_files"]) == 3


def test_pipeline_referenced_files_binary_utf8_error_is_tolerated(catalog, tmp_path):
    """非文本二进制文件通过 errors='replace' 容错，文件仍被附加而不是被跳过。"""
    binary = tmp_path / "image.bin"
    # 写入包含非法 UTF-8 字节序列的二进制内容
    binary.write_bytes(b"\xff\xfe" + b"\x80\x81\x82" * 100)
    classifier = _FakeClassifier(
        ClassifyResult(tech_stack=["antd"], capability=["ui-form"])
    )
    result = run_resolve_pipeline(
        catalog=catalog,
        classifier=classifier,  # type: ignore[arg-type]
        user_prompt="x",
        cwd=str(tmp_path),
        referenced_files=[str(binary)],
    )
    # 文件应被成功附加（errors='replace' 不会让它被丢弃）
    assert str(binary) in result["referenced_files"]
    # classifier prompt 中应包含 Unicode 替换字符（U+FFFD）
    injected = classifier.calls[0]["user_prompt"]
    assert "�" in injected


def test_pipeline_referenced_files_directory_is_skipped(catalog, tmp_path):
    """传入目录路径时，pipeline 层保底过滤：不崩溃、不附加目录。"""
    subdir = tmp_path / "somedir"
    subdir.mkdir()
    valid = tmp_path / "valid.md"
    valid.write_text("antd form", encoding="utf-8")
    classifier = _FakeClassifier(
        ClassifyResult(tech_stack=["antd"], capability=["ui-form"])
    )
    result = run_resolve_pipeline(
        catalog=catalog,
        classifier=classifier,  # type: ignore[arg-type]
        user_prompt="x",
        cwd=str(tmp_path),
        referenced_files=[str(subdir), str(valid)],
    )
    # 目录被跳过，只有普通文件被附加
    assert str(subdir) not in result["referenced_files"]
    assert str(valid) in result["referenced_files"]
    # 空列表与 None 行为一致：两者都不触发文件读取
    result_empty = run_resolve_pipeline(
        catalog=catalog,
        classifier=classifier,  # type: ignore[arg-type]
        user_prompt="y",
        cwd=str(tmp_path),
        referenced_files=[],
    )
    assert result_empty["referenced_files"] == []
    assert classifier.calls[-1]["user_prompt"] == "y"
