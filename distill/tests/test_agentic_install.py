"""Unit tests for agentic_install_builder.

Mocks the adapter (LLM responses) and the docker probe container so the
loop can be exercised without spinning real containers.
"""
from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from agentic_install_builder import (
    AgenticResult, build_install_via_agentic_loop,
)
from asset_builder import AssetSpec, ValidationResult
from sandbox_runner import ExecResult


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------
class _StageStats:
    """Minimal StageStats stand-in (counters only)."""
    def __init__(self):
        self.prompt_tokens = 0
        self.completion_tokens = 0
        self.cached_tokens = 0
        self.cache_write_tokens = 0
        self.requests = 0
        self.tool_calls = 0


def _tool_call(name: str, args: dict, tc_id: str = "tc1"):
    return SimpleNamespace(
        id=tc_id,
        function=SimpleNamespace(name=name, arguments=json.dumps(args)),
    )


def _msg(content=None, tool_calls=None):
    return SimpleNamespace(
        content=content,
        tool_calls=tool_calls or None,
        reasoning_content=None,
    )


def _response(message):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=message)],
        usage=SimpleNamespace(
            prompt_tokens=100,
            completion_tokens=50,
            prompt_tokens_details=None,
        ),
    )


class FakeAdapter:
    """Replays a scripted list of assistant messages."""

    def __init__(self, scripted_messages):
        self._queue = list(scripted_messages)
        self.calls = []

    def create_message(self, messages, tools=None, max_tokens=8192):
        self.calls.append({"messages": list(messages), "tools": tools})
        if not self._queue:
            raise AssertionError(
                f"FakeAdapter exhausted after {len(self.calls)} calls"
            )
        msg = self._queue.pop(0)
        return _response(msg)

    def serialize_assistant_message(self, msg):
        entry = {"role": "assistant", "content": msg.content or ""}
        if msg.tool_calls:
            entry["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments,
                    },
                }
                for tc in msg.tool_calls
            ]
        return entry

    def extract_usage(self, response):
        return {
            "prompt_tokens": 100,
            "completion_tokens": 50,
            "cached_tokens": 0,
            "cache_write_tokens": 0,
        }


@pytest.fixture
def patched_sandbox():
    """Patch sandbox-creation/exec/cleanup so no real docker is touched."""
    with patch("agentic_install_builder.run_ephemeral") as m_run, \
         patch("agentic_install_builder.exec_in_container") as m_exec, \
         patch("agentic_install_builder.container_exists") as m_exists, \
         patch("agentic_install_builder.remove_container") as m_remove:
        m_run.return_value = ExecResult(0, "", "")
        m_exec.return_value = ExecResult(0, "ok", "")
        m_exists.return_value = True
        m_remove.return_value = ExecResult(0, "", "")
        yield {
            "run_ephemeral": m_run,
            "exec_in_container": m_exec,
            "container_exists": m_exists,
            "remove_container": m_remove,
        }


def _spec():
    return AssetSpec(
        filename="install.sh",
        idempotent_check="which mytool",
        smoke_test=["mytool --version"],
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
def test_first_finalize_passes(patched_sandbox):
    """LLM finalizes on first turn and the script passes 4-gate → verified."""
    adapter = FakeAdapter([
        _msg(tool_calls=[_tool_call("finalize", {"content": "#!/bin/bash\necho ok"})]),
    ])
    stats = _StageStats()
    validator = lambda content, image, spec: ValidationResult(True, "")
    inject = lambda content: "INJECTED:" + content

    result = build_install_via_agentic_loop(
        skill={"name": "t1"}, spec=_spec(), base_image="debian:12-slim",
        source_text="docs", adapter=adapter, stats=stats,
        inject_helpers=inject, validator=validator,
    )

    assert result.verified is True
    assert result.finalize_attempts == 1
    assert result.bash_calls == 0
    assert result.content.startswith("INJECTED:")
    assert stats.requests == 1


def test_finalize_budget_exhausted(patched_sandbox):
    """3 finalize attempts all fail → unverified, abort_reason set."""
    adapter = FakeAdapter([
        _msg(tool_calls=[_tool_call("finalize", {"content": "v1"}, "t1")]),
        _msg(tool_calls=[_tool_call("finalize", {"content": "v2"}, "t2")]),
        _msg(tool_calls=[_tool_call("finalize", {"content": "v3"}, "t3")]),
    ])
    stats = _StageStats()
    validator = lambda *a, **k: ValidationResult(False, "[gate 1] always fails")

    result = build_install_via_agentic_loop(
        skill={"name": "t2"}, spec=_spec(), base_image="debian:12-slim",
        source_text="", adapter=adapter, stats=stats,
        inject_helpers=lambda c: c, validator=validator,
    )

    assert result.verified is False
    assert result.finalize_attempts == 3
    assert result.abort_reason == "budget_exhausted"
    assert result.content == "v3"


def test_bash_then_finalize_passes(patched_sandbox):
    """Probe with bash, then finalize successfully → counts both."""
    patched_sandbox["exec_in_container"].return_value = ExecResult(
        0, "/usr/bin/python3", "",
    )
    adapter = FakeAdapter([
        _msg(tool_calls=[_tool_call("bash", {"command": "command -v python3"}, "b1")]),
        _msg(tool_calls=[_tool_call("finalize", {"content": "ok"}, "f1")]),
    ])
    stats = _StageStats()
    result = build_install_via_agentic_loop(
        skill={"name": "t3"}, spec=_spec(), base_image="debian:12-slim",
        source_text="", adapter=adapter, stats=stats,
        inject_helpers=lambda c: c,
        validator=lambda *a, **k: ValidationResult(True, ""),
    )

    assert result.verified is True
    assert result.bash_calls == 1
    assert result.finalize_attempts == 1
    # exec_in_container received the bash command
    cmd = patched_sandbox["exec_in_container"].call_args
    assert "command -v python3" in cmd.args[1][2]


def test_no_tool_calls_aborts(patched_sandbox):
    """LLM returns plain text without any tool_call → loop bails out."""
    adapter = FakeAdapter([_msg(content="I give up")])
    stats = _StageStats()
    result = build_install_via_agentic_loop(
        skill={"name": "t4"}, spec=_spec(), base_image="debian:12-slim",
        source_text="", adapter=adapter, stats=stats,
        inject_helpers=lambda c: c,
        validator=lambda *a, **k: ValidationResult(True, ""),
    )

    assert result.verified is False
    assert result.abort_reason == "no_tool_calls"
    assert result.bash_calls == 0
    assert result.finalize_attempts == 0


def test_bash_budget_exhausted_then_finalize(patched_sandbox):
    """11 bash calls then finalize → bash budget hit, finalize still allowed."""
    bash_msgs = [
        _msg(tool_calls=[_tool_call("bash", {"command": f"echo {i}"}, f"b{i}")])
        for i in range(11)
    ]
    final_msg = _msg(tool_calls=[_tool_call("finalize", {"content": "best-effort"}, "ff")])
    adapter = FakeAdapter(bash_msgs + [final_msg])
    stats = _StageStats()

    result = build_install_via_agentic_loop(
        skill={"name": "t5"}, spec=_spec(), base_image="debian:12-slim",
        source_text="", adapter=adapter, stats=stats,
        bash_budget=10, finalize_budget=3, max_iterations=20,
        inject_helpers=lambda c: c,
        validator=lambda *a, **k: ValidationResult(True, ""),
    )

    # bash_calls counts the actual exec calls; budget enforcement only adds
    # warning to tool_result, doesn't reject the call. The 11th bash still
    # ran, then the 12th iteration was the finalize.
    assert result.bash_calls >= 10
    assert result.finalize_attempts == 1
    assert result.verified is True


def test_probe_create_failure_returns_clean_result(patched_sandbox):
    """If run_ephemeral fails, return AgenticResult with abort_reason set."""
    from sandbox_runner import SandboxError
    patched_sandbox["run_ephemeral"].side_effect = SandboxError("run", 1, "perm denied")
    adapter = FakeAdapter([])  # never reached
    stats = _StageStats()

    result = build_install_via_agentic_loop(
        skill={"name": "t6"}, spec=_spec(), base_image="debian:12-slim",
        source_text="", adapter=adapter, stats=stats,
        inject_helpers=lambda c: c,
        validator=lambda *a, **k: ValidationResult(True, ""),
    )

    assert result.verified is False
    assert result.abort_reason.startswith("probe_create_failed:")
    assert result.bash_calls == 0


def test_cleanup_runs_even_when_validator_raises(patched_sandbox):
    """Probe container is removed in finally even on unexpected error."""
    adapter = FakeAdapter([
        _msg(tool_calls=[_tool_call("finalize", {"content": "x"}, "f1")]),
    ])
    stats = _StageStats()

    def boom(*a, **k):
        raise RuntimeError("validator crashed")

    with pytest.raises(RuntimeError):
        build_install_via_agentic_loop(
            skill={"name": "t7"}, spec=_spec(), base_image="debian:12-slim",
            source_text="", adapter=adapter, stats=stats,
            inject_helpers=lambda c: c, validator=boom,
        )
    patched_sandbox["remove_container"].assert_called_once()
