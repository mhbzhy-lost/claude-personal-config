"""Contract tests for the ENABLE_INTENT_ENHANCEMENT opt-in path.

Covers:
1. Disabled (env unset) → behavior identical to legacy pipeline, no enhancement
   code touched.
2. Enabled but module unavailable → warning logged, legacy pipeline result.
3. Enabled + available → return dict contains enhancement-only fields.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace

import pytest

from skill_catalog import pipeline as pipeline_mod
from skill_catalog.intent_fallback import ClassifyResult
from skill_catalog.pipeline import run_resolve_pipeline
from skill_catalog.scanner import SkillCatalog


# -- helpers ----------------------------------------------------------------

def _write_skill(library: Path, name: str, description: str,
                 tech_stack: list[str], capability: list[str] | None = None) -> None:
    d = library / name
    d.mkdir(parents=True, exist_ok=True)
    fm = ["---", f"name: {name}", f'description: "{description}"',
          f"tech_stack: {json.dumps(tech_stack)}"]
    if capability:
        fm.append(f"capability: {json.dumps(capability)}")
    fm.append("---")
    fm.append("body")
    (d / "SKILL.md").write_text("\n".join(fm), encoding="utf-8")


@pytest.fixture
def catalog(tmp_path: Path) -> SkillCatalog:
    lib = tmp_path / "skills"
    lib.mkdir()
    _write_skill(lib, "ant-form", "Ant 表单", ["antd", "react"], ["ui-form"])
    _write_skill(lib, "django-auth", "Django JWT", ["django"], ["auth"])
    return SkillCatalog(str(lib))


class _FakeClassifier:
    def __init__(self, result: ClassifyResult) -> None:
        self._result = result
        self.call_count = 0

    def classify(self, **kwargs):
        self.call_count += 1
        return self._result


# -- 1. disabled path -------------------------------------------------------

def test_disabled_by_default_is_legacy(catalog, tmp_path, monkeypatch):
    monkeypatch.delenv("ENABLE_INTENT_ENHANCEMENT", raising=False)
    clf = _FakeClassifier(ClassifyResult(
        tech_stack=["antd"], capability=["ui-form"], error=None,
    ))

    # Spy: ensure enhancement import helper is never called.
    called = {"flag": False}
    def _spy():
        called["flag"] = True
        raise AssertionError("enhancement path must not execute when disabled")
    monkeypatch.setattr(pipeline_mod, "_try_import_intent_enhanced_resolver", _spy)

    result = run_resolve_pipeline(
        catalog=catalog, classifier=clf,
        user_prompt="写个 antd 表单", cwd=str(tmp_path),
    )

    assert called["flag"] is False
    assert clf.call_count == 1
    assert "intent_enhancement_used" not in result
    assert set(result.keys()) == {
        "cwd", "fingerprint", "tech_stack", "language", "capability",
        "classifier_error", "skills",
    }
    assert all({"name", "description"} == set(s.keys()) for s in result["skills"])


# -- 2. enabled but module unavailable --------------------------------------

def test_enabled_but_import_fails_falls_back(catalog, tmp_path, monkeypatch, caplog):
    monkeypatch.setenv("ENABLE_INTENT_ENHANCEMENT", "true")

    def _boom():
        raise ImportError("simulated: pyyaml missing")
    monkeypatch.setattr(pipeline_mod, "_try_import_intent_enhanced_resolver", _boom)

    clf = _FakeClassifier(ClassifyResult(
        tech_stack=["antd"], capability=["ui-form"], error=None,
    ))

    with caplog.at_level("WARNING", logger="skill_catalog.pipeline"):
        result = run_resolve_pipeline(
            catalog=catalog, classifier=clf,
            user_prompt="写个 antd 表单", cwd=str(tmp_path),
        )

    assert any("Intent enhancement failed" in rec.message for rec in caplog.records)
    assert "intent_enhancement_used" not in result
    assert clf.call_count == 1  # legacy path ran
    assert set(result.keys()) == {
        "cwd", "fingerprint", "tech_stack", "language", "capability",
        "classifier_error", "skills",
    }


# -- 3. enabled + available -------------------------------------------------

class _StubEnhancedResolver:
    """Mimics IntentEnhancedResolver.resolve() without loading the real
    intent-enhancement stack (avoids yaml/numpy deps in CI)."""

    def __init__(self, catalog, classifier=None):
        self.catalog = catalog

    def resolve(self, *, user_prompt, cwd, tech_stack=None, capability=None,
                language=None, top_n_limit=None, fingerprint_payload=None):
        return {
            "cwd": str(Path(cwd).resolve()) if Path(cwd).exists() else str(cwd),
            "fingerprint": fingerprint_payload or {},
            "tech_stack": tech_stack or [],
            "capability": capability or [],
            "classifier_error": None,
            "skills": [{"name": "ant-form", "description": "Ant 表单"}],
            "intent_enhancement_used": True,
            "enhanced_intent": "构建一个 antd 表单组件",
            "original_intent": user_prompt,
            "intent_confidence": 0.82,
            "confidence": 0.82,
            "technical_context": {"frameworks": ["antd"]},
            "dependency_analysis": {"has_conflicts": False},
            "processing_time": 0.01,
            "used_cache": False,
            "enhanced_skills": [{"name": "ant-form", "description": "Ant 表单"}],
        }


def test_enabled_and_available_includes_enhancement_fields(
    catalog, tmp_path, monkeypatch
):
    monkeypatch.setenv("ENABLE_INTENT_ENHANCEMENT", "true")
    monkeypatch.setattr(
        pipeline_mod,
        "_try_import_intent_enhanced_resolver",
        lambda: _StubEnhancedResolver,
    )

    clf = _FakeClassifier(ClassifyResult(
        tech_stack=["antd"], capability=["ui-form"], error=None,
    ))

    result = run_resolve_pipeline(
        catalog=catalog, classifier=clf,
        user_prompt="写个 antd 表单", cwd=str(tmp_path),
    )

    assert result["intent_enhancement_used"] is True
    assert result["enhanced_intent"] == "构建一个 antd 表单组件"
    assert "confidence" in result
    assert "dependency_analysis" in result
    # legacy classifier must not run on enhancement path
    assert clf.call_count == 0
    # original minimal shape preserved for ``skills``
    assert result["skills"] == [{"name": "ant-form", "description": "Ant 表单"}]


# -- 4. enabled + resolver raises RuntimeError (not ImportError) --------------

class _BoomOnResolveResolver:
    """Import succeeds but resolve() raises RuntimeError."""

    def __init__(self, catalog, classifier=None):
        pass

    def resolve(self, **kwargs):
        raise RuntimeError("downstream intent engine crashed")


def test_enabled_resolver_runtime_error_falls_back(
    catalog, tmp_path, monkeypatch, caplog
):
    """pipeline 应在 resolver.resolve() 抛出非 ImportError 异常时也触发降级。

    pipeline.py 用 ``except Exception`` 兜住所有异常，这里验证该分支对
    RuntimeError 同样生效，并确保 legacy 路径的 key 形状完整。
    """
    monkeypatch.setenv("ENABLE_INTENT_ENHANCEMENT", "true")
    monkeypatch.setattr(
        pipeline_mod,
        "_try_import_intent_enhanced_resolver",
        lambda: _BoomOnResolveResolver,
    )

    clf = _FakeClassifier(ClassifyResult(
        tech_stack=["antd"], capability=["ui-form"], error=None,
    ))

    with caplog.at_level("WARNING", logger="skill_catalog.pipeline"):
        result = run_resolve_pipeline(
            catalog=catalog, classifier=clf,
            user_prompt="写个 antd 表单", cwd=str(tmp_path),
        )

    # warning must be logged
    assert any("Intent enhancement failed" in rec.message for rec in caplog.records)
    # enhancement key must NOT appear (fell back to legacy)
    assert "intent_enhancement_used" not in result
    # legacy classifier ran exactly once
    assert clf.call_count == 1
    # result shape matches legacy contract
    assert set(result.keys()) == {
        "cwd", "fingerprint", "tech_stack", "language", "capability",
        "classifier_error", "skills",
    }


# -- 5. enabled + resolver returns result missing optional enhancement fields --

class _MinimalFieldResolver:
    """Resolver returns only the mandatory fields (no enhancement extras).

    Verifies that pipeline does NOT crash when the resolver omits optional
    enhancement-only fields — i.e. the pipeline does not attempt to post-
    process the dict and simply returns it as-is.
    """

    def __init__(self, catalog, classifier=None):
        pass

    def resolve(self, *, user_prompt, cwd, tech_stack=None, capability=None,
                language=None, top_n_limit=None, fingerprint_payload=None):
        return {
            "cwd": str(cwd),
            "fingerprint": fingerprint_payload or {},
            "tech_stack": tech_stack or [],
            "capability": capability or [],
            "classifier_error": None,
            "skills": [],
            "intent_enhancement_used": True,
            # intentionally omitting: enhanced_intent, confidence, dependency_analysis …
        }


def test_enabled_resolver_partial_fields_no_crash(
    catalog, tmp_path, monkeypatch
):
    """Enhancement resolver 返回部分字段时 pipeline 不应崩溃。"""
    monkeypatch.setenv("ENABLE_INTENT_ENHANCEMENT", "true")
    monkeypatch.setattr(
        pipeline_mod,
        "_try_import_intent_enhanced_resolver",
        lambda: _MinimalFieldResolver,
    )

    clf = _FakeClassifier(ClassifyResult(
        tech_stack=["antd"], capability=["ui-form"], error=None,
    ))

    result = run_resolve_pipeline(
        catalog=catalog, classifier=clf,
        user_prompt="写个 antd 表单", cwd=str(tmp_path),
    )

    assert result["intent_enhancement_used"] is True
    assert "enhanced_intent" not in result  # 未提供，pipeline 不补充
    assert clf.call_count == 0  # enhancement path ran, legacy skipped


# -- 6. 真实端到端链路（不 stub adapter / EnhancedSkillResolver / 检索引擎） --

def _build_real_catalog(tmp_path: Path) -> SkillCatalog:
    """构造真实 SkillCatalog 实例（非 mock），含少量手写 skill 以提速。"""
    lib = tmp_path / "real-skills"
    lib.mkdir()
    _write_skill(lib, "antd-form-builder",
                 "Ant Design 表单构建与校验最佳实践",
                 ["antd", "react"], ["ui-form"])
    _write_skill(lib, "django-jwt-auth",
                 "Django JWT 认证实现指南",
                 ["django", "python"], ["auth"])
    _write_skill(lib, "react-hooks-patterns",
                 "React Hooks 使用范式与性能优化",
                 ["react"], ["frontend"])
    return SkillCatalog(str(lib))


def test_enabled_real_adapter_end_to_end_returns_enhancement_shape(
    tmp_path, monkeypatch
):
    """真实链路：pipeline → 真实 IntentEnhancedResolver → 真实 EnhancedSkillResolver
    → 真实 HybridRetrievalEngine → 真实 IntentRecognitionEngine（无 session 分支）。

    不 stub adapter 层、不 stub EnhancedSkillResolver、不 stub 检索引擎。
    Classifier 用 FakeClassifier 并断言不被调用（enhancement 路径不走 classifier）。
    """
    monkeypatch.setenv("ENABLE_INTENT_ENHANCEMENT", "true")
    catalog = _build_real_catalog(tmp_path)
    clf = _FakeClassifier(ClassifyResult(
        tech_stack=["antd"], capability=["ui-form"], error=None,
    ))

    result = run_resolve_pipeline(
        catalog=catalog, classifier=clf,
        user_prompt="写一个 antd 表单组件并添加字段校验",
        cwd=str(tmp_path),
    )

    # —— 稳定断言：链路走完整、adapter 返回 enhancement 形状 ——
    assert isinstance(result, dict)
    assert result["intent_enhancement_used"] is True
    # enhancement-only 字段齐全（即使 fallback，adapter 也会填默认值）
    for key in ("enhanced_intent", "original_intent", "intent_confidence",
                "confidence", "technical_context", "dependency_analysis",
                "processing_time", "used_cache", "enhanced_skills"):
        assert key in result, f"missing enhancement key: {key}"
    # skills 必须是 list
    assert isinstance(result["skills"], list)
    # 且 minimal shape（仅 name / description）
    for s in result["skills"]:
        assert set(s.keys()) == {"name", "description"}
    # enhancement 路径复用 classifier 做 tech_stack/capability 硬过滤；
    # caller 未预传时应触发一次分类
    assert clf.call_count == 1
    # 分类成功则 classifier_error 透传为 None
    assert result["classifier_error"] is None
    # original_intent 必须回传原始 prompt
    assert result["original_intent"] == "写一个 antd 表单组件并添加字段校验"

    # —— 真实检索链路应返回非空结果、dependency_analysis 不含 error ——
    assert len(result["skills"]) >= 1, "真实检索链路应命中至少一个 skill"
    assert "error" not in (result["dependency_analysis"] or {}), \
        f"意图增强走 fallback 分支: {result['dependency_analysis']}"


def test_enabled_real_adapter_with_missing_session_does_not_crash(
    tmp_path, monkeypatch
):
    """真实链路下即使 ``~/.claude/projects/<id>.jsonl`` 不存在也不应崩溃。

    adapter 不向 EnhancedSkillResolver 传 conversation_id，触发
    ``_recognize_intent`` 的纯文本 fallback 分支（不读日志）。
    将 log_directory 指向空 tmp 目录，额外证明即便下游意图引擎尝试读日志
    也不会炸穿 pipeline。
    """
    monkeypatch.setenv("ENABLE_INTENT_ENHANCEMENT", "true")
    empty_logs = tmp_path / "empty-claude-projects"
    empty_logs.mkdir()
    # 覆盖 intent-enhancement 的 log_directory 配置
    import sys as _sys
    _sys.path.insert(
        0, str(Path(__file__).resolve().parents[3] / "intent-enhancement" / "src")
    )
    from utils.config import get_config  # type: ignore
    cfg = get_config()
    monkeypatch.setattr(cfg.claude_code, "log_directory", str(empty_logs))

    catalog = _build_real_catalog(tmp_path)
    clf = _FakeClassifier(ClassifyResult(
        tech_stack=[], capability=[], error=None,
    ))

    # 不应抛异常
    result = run_resolve_pipeline(
        catalog=catalog, classifier=clf,
        user_prompt="django jwt 登录接口怎么写",
        cwd=str(tmp_path),
    )

    assert isinstance(result, dict)
    assert result["intent_enhancement_used"] is True
    assert isinstance(result["skills"], list)
    # enhancement 路径复用 classifier；即便 session log 缺失也应正常调分类
    assert clf.call_count == 1
    # 无 session 分支下 original_intent 应回显
    assert result["original_intent"] == "django jwt 登录接口怎么写"
    # adapter 不应抛 classifier_error
    assert result["classifier_error"] is None
