"""End-to-end tests against a real local ollama daemon.

Run explicitly:
    SKILL_LIBRARY_PATH=/Users/mhbzhy/claude-config/skills \
    SKILL_CATALOG_OLLAMA_HOST=http://127.0.0.1:11435 \
    uv run pytest tests/test_resolve_e2e.py -v

Module-level skip when daemon is offline so the default `uv run pytest` stays
green on machines without ollama.
"""

from __future__ import annotations

import http.client
import os
import socket
from pathlib import Path
from urllib.parse import urlparse

import pytest
import yaml

from skill_catalog.intent_fallback import IntentFallback, IntentFallbackConfig
from skill_catalog.pipeline import run_resolve_pipeline
from skill_catalog.scanner import SkillCatalog


OLLAMA_HOST = os.environ.get("SKILL_CATALOG_OLLAMA_HOST", "http://127.0.0.1:11435")
SKILL_LIB = os.environ.get(
    "SKILL_LIBRARY_PATH", "/Users/mhbzhy/claude-config/skills"
)
GOLDEN_PATH = Path(__file__).parent / "fixtures" / "golden_cases.yaml"


def _ollama_available() -> bool:
    try:
        u = urlparse(OLLAMA_HOST)
        conn = http.client.HTTPConnection(
            u.hostname or "127.0.0.1", u.port or 11435, timeout=1
        )
        conn.request("GET", "/api/tags")
        resp = conn.getresponse()
        return 200 <= resp.status < 300
    except (socket.timeout, ConnectionRefusedError, OSError, http.client.HTTPException):
        return False
    finally:
        try:
            conn.close()  # type: ignore[name-defined]
        except Exception:
            pass


pytestmark = pytest.mark.requires_ollama

if not _ollama_available():
    pytest.skip(
        f"ollama daemon 不在线 ({OLLAMA_HOST})，E2E 测试跳过",
        allow_module_level=True,
    )

if not Path(SKILL_LIB).is_dir():
    pytest.skip(
        f"skill library 不存在 ({SKILL_LIB})，E2E 测试跳过",
        allow_module_level=True,
    )


def _load_cases() -> list[dict]:
    with open(GOLDEN_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)["cases"]


CASES = _load_cases()


@pytest.fixture(scope="module")
def catalog() -> SkillCatalog:
    return SkillCatalog(SKILL_LIB)


@pytest.fixture(scope="module")
def classifier() -> IntentFallback:
    # 放宽超时：首次加载 bge-m3 embedding 权重可能较慢
    return IntentFallback(
        IntentFallbackConfig(
            embedding_host_url=OLLAMA_HOST,
            embedding_timeout_s=60.0,
        )
    )


def _setup_workspace(tmp: Path, spec: dict) -> Path:
    for rel_path, content in (spec or {}).items():
        full = tmp / rel_path
        full.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(content, str):
            full.write_text(content, encoding="utf-8")
        else:
            full.write_text(str(content), encoding="utf-8")
    return tmp


def _assert_case(result: dict, expected: dict, case_id: str) -> None:
    ts = set(result["tech_stack"])
    caps = set(result["capability"])
    skills = [s["name"] for s in result["skills"]]
    skills_set = set(skills)

    if "tech_stack_must_include" in expected:
        missing = set(expected["tech_stack_must_include"]) - ts
        assert not missing, (
            f"[{case_id}] tech_stack 缺少 {missing}，实际 {sorted(ts)}"
        )
    if "tech_stack_must_include_one_of" in expected:
        cand = set(expected["tech_stack_must_include_one_of"])
        assert ts & cand, (
            f"[{case_id}] tech_stack {sorted(ts)} 未命中任一 {sorted(cand)}"
        )
    if "tech_stack_must_not_include" in expected:
        forbidden = ts & set(expected["tech_stack_must_not_include"])
        assert not forbidden, f"[{case_id}] tech_stack 含禁用 {forbidden}"
    if "capability_must_include" in expected:
        missing = set(expected["capability_must_include"]) - caps
        assert not missing, (
            f"[{case_id}] capability 缺少 {missing}，实际 {sorted(caps)}"
        )
    if "capability_must_include_one_of" in expected:
        cand = set(expected["capability_must_include_one_of"])
        assert caps & cand, (
            f"[{case_id}] capability {sorted(caps)} 未命中任一 {sorted(cand)}"
        )
    if "capability_exact" in expected:
        assert caps == set(expected["capability_exact"]), (
            f"[{case_id}] capability 不精确匹配，"
            f"{sorted(caps)} != {sorted(expected['capability_exact'])}"
        )
    if "skills_must_include" in expected:
        missing = set(expected["skills_must_include"]) - skills_set
        assert not missing, f"[{case_id}] skills 缺少 {missing}，实际 {skills}"
    if "skills_must_include_one_of" in expected:
        cand = set(expected["skills_must_include_one_of"])
        assert skills_set & cand, (
            f"[{case_id}] skills 未命中任一 {sorted(cand)}，实际 {skills}"
        )
    if "min_skills" in expected:
        assert len(skills) >= expected["min_skills"], (
            f"[{case_id}] skills 数量 {len(skills)} < min {expected['min_skills']}"
        )
    if "max_skills" in expected:
        assert len(skills) <= expected["max_skills"], (
            f"[{case_id}] skills 数量 {len(skills)} > max {expected['max_skills']}，"
            f"实际 {skills}"
        )


@pytest.mark.parametrize("case", CASES, ids=lambda c: c["id"])
def test_resolve_golden(
    case: dict,
    catalog: SkillCatalog,
    classifier: IntentFallback,
    tmp_path: Path,
) -> None:
    # 稳定性 case
    if "run_count" in case:
        run_count = case["run_count"]
        expected_stable = case["expected_stable"]
        ws = _setup_workspace(tmp_path, case.get("workspace_setup", {}))

        runs: list[dict] = []
        for _ in range(run_count):
            result = run_resolve_pipeline(
                catalog=catalog,
                classifier=classifier,
                user_prompt=case["user_prompt"],
                cwd=str(ws),
            )
            runs.append(result)

        if "skill_must_appear_at_least" in expected_stable:
            rule = expected_stable["skill_must_appear_at_least"]
            target = rule["skill"]
            hits = [target in {s["name"] for s in r["skills"]} for r in runs]
            assert sum(hits) >= rule["min_runs"], (
                f"[{case['id']}] skill {target} 在 {run_count} 次中命中 "
                f"{sum(hits)} 次，少于 min {rule['min_runs']}，runs={hits}"
            )
        if "tech_stack_must_appear_at_least" in expected_stable:
            rule = expected_stable["tech_stack_must_appear_at_least"]
            target = rule["tag"]
            hits = [target in set(r["tech_stack"]) for r in runs]
            assert sum(hits) >= rule["min_runs"], (
                f"[{case['id']}] tech_stack {target} 在 {run_count} 次中命中 "
                f"{sum(hits)} 次，少于 min {rule['min_runs']}，runs={hits}"
            )
        return

    # 普通 case
    ws = _setup_workspace(tmp_path, case.get("workspace_setup", {}))
    prefill = case.get("prefill") or {}

    kwargs: dict = {
        "catalog": catalog,
        "classifier": classifier,
        "user_prompt": case["user_prompt"],
        "cwd": str(ws),
    }
    if "tech_stack" in prefill:
        kwargs["tech_stack"] = prefill["tech_stack"]
    if "capability" in prefill:
        kwargs["capability"] = prefill["capability"]

    result = run_resolve_pipeline(**kwargs)
    _assert_case(result, case["expected"], case["id"])
