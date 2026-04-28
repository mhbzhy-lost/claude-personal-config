"""Offline smoke test for the 3-stage pipeline plumbing.

Does NOT hit DeepSeek/Qwen — uses a fake adapter that:

  * On the first 3 calls of a conversation, returns tool_calls forcing
    the soft-abort path.
  * After abort, replies with a JSON status string so the next step can
    proceed.

Verifies:

  * runs/<id>/ directory layout (config.json, summary.json,
    plan/{transcript,stats,final_output}, fetch/{log,stats},
    build/{transcript,stats,final_output})
  * summary.json schema_version = 2 + required totals fields
  * tool_call_limit aborts cleanly with salvage written to final_output
  * fetch logger writes log.jsonl + stats.json without LLM
  * build per-step slices populate step_slices

Run with: ``uv run python tests/smoke_test.py`` from scripts/distill/.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import pipeline  # noqa: E402
from adapter import PipelineStats, StageStats  # noqa: E402
from persistence import RunRecorder  # noqa: E402


# ---------------------------------------------------------------------------
# Fake adapter
# ---------------------------------------------------------------------------
class _ToolCall:
    def __init__(self, idx: int, name: str = "list_files", args: dict | None = None):
        self.id = f"call_{idx}"
        self.type = "function"
        self.function = SimpleNamespace(
            name=name,
            arguments=json.dumps(args or {"path": "/tmp", "pattern": "*"}),
        )


class _Msg:
    def __init__(self, idx: int, *, give_up: bool = False):
        if give_up:
            self.content = '{"status":"ok","note":"fake final"}'
            self.tool_calls = None
            self.reasoning_content = "(fake reasoning)"
        else:
            self.content = None
            self.tool_calls = [_ToolCall(idx)]
            self.reasoning_content = "(fake mid reasoning)"


class _Choice:
    def __init__(self, idx: int, *, give_up: bool = False):
        self.message = _Msg(idx, give_up=give_up)
        self.finish_reason = "stop" if give_up else "tool_calls"


class _Response:
    def __init__(self, idx: int, *, give_up: bool = False):
        self.choices = [_Choice(idx, give_up=give_up)]
        self.usage = SimpleNamespace(
            prompt_tokens=100,
            completion_tokens=10,
            prompt_tokens_details=SimpleNamespace(cached_tokens=0),
        )


class FakeAbortAdapter:
    """Always returns tool_calls — used to drive run_tool_loop into soft-abort."""

    name = "fake"
    model = "fake-model"

    def __init__(self):
        self._call_count = 0

    def serialize_assistant_message(self, message):
        from adapter import serialize_assistant_message
        return serialize_assistant_message(message)

    def build_system(self, system_prompt):
        return [{"role": "system", "content": "FAKE\n\n" + system_prompt}]

    def create_message(self, messages, tools=None, max_tokens=4096):
        self._call_count += 1
        return _Response(self._call_count, give_up=False)

    def extract_usage(self, response):
        return {
            "prompt_tokens": response.usage.prompt_tokens,
            "completion_tokens": response.usage.completion_tokens,
            "cached_tokens": 0,
            "cache_write_tokens": 0,
        }


# ---------------------------------------------------------------------------
# Test 1: tool_call_limit soft-abort + salvage
# ---------------------------------------------------------------------------
def test_tool_loop_soft_abort(rec: RunRecorder):
    print("\n[test 1] tool_call_limit soft-abort + salvage")
    adapter = FakeAbortAdapter()
    stage_rec = rec.stage("plan")

    stats = StageStats(stage="plan")
    stage_rec.log_system("(test sys)")
    stage_rec.log_user("(test user)")

    final_text, abort_info = pipeline.run_tool_loop(
        adapter,
        messages=[
            {"role": "system", "content": "(test sys)"},
            {"role": "user", "content": "(test user)"},
        ],
        tools=None,
        stats=stats,
        max_iterations=20,
        max_tokens=512,
        max_tool_calls=3,
        recorder=stage_rec,
    )
    stage_rec.write_final_output(final_text)
    stage_rec.write_stats(stats)

    assert stats.aborted_reason == "tool_call_limit", stats.aborted_reason
    assert stats.tool_call_limit_hit is True
    assert abort_info and abort_info["reason"] == "tool_call_limit"
    assert "[ABORTED at tool_call_limit" in final_text, final_text[:200]
    assert "[reasoning_content]:" in final_text
    print(f"  stats.tool_calls={stats.tool_calls} aborted={stats.aborted_reason}")
    print(f"  final_output has [ABORTED] header + reasoning_content: OK")

    # Transcript integrity
    tpath = stage_rec.dir / "transcript.jsonl"
    assert tpath.exists()
    lines = tpath.read_text().splitlines()
    assert lines, "transcript empty"
    for ln in lines:
        json.loads(ln)
    abort_markers = [
        ln for ln in lines if '"type": "abort_marker"' in ln
    ]
    assert abort_markers, "no abort_marker line in transcript"
    print(f"  transcript: {len(lines)} JSON lines, abort_marker present")


# ---------------------------------------------------------------------------
# Test 2: fetch logger plumbing (no LLM)
# ---------------------------------------------------------------------------
def test_fetch_logger(rec: RunRecorder):
    print("\n[test 2] fetch logger plumbing")
    fetch_logger = rec.fetch_logger()
    fetch_logger.log(skill="x", role="primary", url="http://a", status="ok", bytes=100)
    fetch_logger.log(skill="x", role="complement", url="http://b", status="error",
                     error="timeout")
    stats = {"files_count": 1, "bytes_total": 100, "failures": [
        {"skill": "x", "url": "http://b", "error": "timeout"}
    ], "elapsed_ms": 50}
    fetch_logger.write_stats(stats)

    log_path = rec.root / "fetch" / "log.jsonl"
    stats_path = rec.root / "fetch" / "stats.json"
    assert log_path.exists() and stats_path.exists()
    log_lines = log_path.read_text().splitlines()
    assert len(log_lines) == 2
    for ln in log_lines:
        json.loads(ln)
    s = json.loads(stats_path.read_text())
    assert s["files_count"] == 1
    print(f"  fetch/log.jsonl: {len(log_lines)} lines, stats.json OK")


# ---------------------------------------------------------------------------
# Test 3: PipelineStats.to_summary_dict schema v2
# ---------------------------------------------------------------------------
def test_summary_schema(rec: RunRecorder):
    print("\n[test 3] summary.json schema_version=2")
    plan_stats = StageStats(stage="plan")
    plan_stats.prompt_tokens = 1000
    plan_stats.cached_tokens = 200
    plan_stats.completion_tokens = 500
    plan_stats.requests = 3
    plan_stats.tool_calls = 5
    plan_stats.elapsed_ms = 12000

    build_stats = StageStats(stage="build")
    build_stats.prompt_tokens = 4000
    build_stats.cached_tokens = 2500
    build_stats.completion_tokens = 1500
    build_stats.requests = 9
    build_stats.tool_calls = 18
    build_stats.elapsed_ms = 45000
    build_stats.step_slices = [
        {"step": "step_1_preprocess", "budget": 12, "prompt_tokens": 1500,
         "completion_tokens": 500, "tool_calls": 7, "requests": 3,
         "cached_tokens": 800, "cache_write_tokens": 0},
        {"step": "step_2_build", "budget": 12, "prompt_tokens": 1800,
         "completion_tokens": 700, "tool_calls": 8, "requests": 4,
         "cached_tokens": 1200, "cache_write_tokens": 0},
        {"step": "step_3_mark", "budget": 5, "prompt_tokens": 700,
         "completion_tokens": 300, "tool_calls": 3, "requests": 2,
         "cached_tokens": 500, "cache_write_tokens": 0},
    ]

    pipe_stats = PipelineStats(provider="fake", model="fake-model", tech_stack="x")
    pipe_stats.plan_stats = plan_stats
    pipe_stats.build_stats = build_stats
    pipe_stats.fetch_stats = {
        "files_count": 4,
        "bytes_total": 80000,
        "failures": [],
        "elapsed_ms": 1500,
    }
    pipe_stats.skills_created = 2
    pipe_stats.source_text_chars = 80000

    summary = pipe_stats.to_summary_dict(
        run_id=rec.run_id,
        config={"foo": "bar", "max_skills": 0},
        plan_skill_names=["x-foo", "x-bar"],
        skill_outputs=[
            {"name": "x-foo", "path": "/tmp/x-foo/SKILL.md", "exists": True, "size": 1234},
            {"name": "x-bar", "path": "/tmp/x-bar/SKILL.md", "exists": False, "size": 0},
        ],
    )
    rec.flush_summary(summary)

    s = json.loads((rec.root / "summary.json").read_text())
    assert s["schema_version"] == 2, s
    assert s["run_id"] == rec.run_id
    assert "config" in s and "plan" in s and "build" in s and "fetch" in s
    totals = s["totals"]
    for k in ("prompt_tokens", "completion_tokens", "cached_tokens",
              "cache_write_tokens", "requests", "tool_calls",
              "elapsed_ms", "cache_hit_rate"):
        assert k in totals, f"missing totals.{k}"
    assert totals["prompt_tokens"] == 5000
    assert totals["cached_tokens"] == 2700
    assert abs(totals["cache_hit_rate"] - 0.54) < 0.01, totals
    assert s["fetch"]["files_count"] == 4
    assert len(s["build"]["step_slices"]) == 3
    assert s["per_model_cache"]["fake-model"]["prompt"] == 5000
    assert len(s["skills"]) == 2
    print(f"  schema_version=2 OK, totals.cache_hit_rate={totals['cache_hit_rate']}")
    print(f"  build.step_slices: 3 entries OK")


# ---------------------------------------------------------------------------
# Test 4: end-to-end with fake adapter (config.json + dir layout)
# ---------------------------------------------------------------------------
def test_dir_layout(rec: RunRecorder):
    print("\n[test 4] runs/<id>/ directory layout")
    rec.write_config({"foo": "bar"})
    assert (rec.root / "config.json").exists()
    # Create stages and fetch logger to verify subdirs
    p = rec.stage("plan")
    p.write_final_output("(plan output)")
    p.write_stats(StageStats(stage="plan"))
    fl = rec.fetch_logger()
    fl.log(skill="x", url="u", status="ok")
    fl.write_stats({"files_count": 1, "bytes_total": 0, "failures": [], "elapsed_ms": 0})
    b = rec.stage("build")
    b.write_final_output("(build output)")
    b.write_stats(StageStats(stage="build"))

    for sub in ["config.json", "plan/transcript.jsonl", "plan/stats.json",
                "plan/final_output.txt", "fetch/log.jsonl", "fetch/stats.json",
                "build/transcript.jsonl", "build/stats.json",
                "build/final_output.txt"]:
        path = rec.root / sub
        assert path.exists(), f"missing: {sub}"
    print(f"  all 9 expected files present under {rec.root.name}/")


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------
def main() -> int:
    runs_dir = ROOT / "runs"

    test_tool_loop_soft_abort(RunRecorder(runs_dir))
    test_fetch_logger(RunRecorder(runs_dir))
    test_summary_schema(RunRecorder(runs_dir))
    test_dir_layout(RunRecorder(runs_dir))

    print("\nSMOKE TEST PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
