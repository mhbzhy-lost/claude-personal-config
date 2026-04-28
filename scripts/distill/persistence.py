"""Persistence layer for the 3-stage skill distillation pipeline.

Each pipeline run gets a directory under ``runs/<run_id>/`` containing:

  config.json                # Run-level inputs (provider, model, budgets)
  summary.json               # Aggregated PipelineStats (rewritten on each step)
  plan/
    transcript.jsonl         # Plan conversation transcript (line-delim JSON)
    stats.json               # StageStats incl. abort reason / tool budget
    final_output.txt         # Final assistant content (or ABORTED salvage)
  fetch/
    log.jsonl                # One line per web_fetch call (url/status/bytes)
    stats.json               # Aggregate counters
  build/
    transcript.jsonl         # Single-conversation transcript (3 steps)
    stats.json               # StageStats incl. step_slices breakdown
    final_output.txt         # Final assistant content (or ABORTED salvage)

Design choices:

* transcript.jsonl is **streamed** so a Ctrl-C still leaves a useful trace.
* summary.json is rewritten after every meaningful checkpoint so partial
  runs can still be inspected.
"""

from __future__ import annotations

import json
import time
from dataclasses import asdict, is_dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def make_run_id() -> str:
    """ISO-style compact timestamp, e.g. ``20260428T120000``."""
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")


# ---------------------------------------------------------------------------
# Run-level helpers
# ---------------------------------------------------------------------------
class RunRecorder:
    """Owner of a single ``runs/<run_id>/`` directory."""

    def __init__(self, runs_dir: str | Path, run_id: str | None = None):
        self.run_id = run_id or make_run_id()
        self.root = Path(runs_dir) / self.run_id
        self.root.mkdir(parents=True, exist_ok=True)
        self._created_at = time.time()

    def write_config(self, config: dict) -> None:
        path = self.root / "config.json"
        path.write_text(
            json.dumps(config, indent=2, ensure_ascii=False, default=_default)
        )

    def stage(self, stage_name: str) -> "StageRecorder":
        """Create a per-stage recorder. ``stage_name`` becomes the subdir name."""
        sub = self.root / stage_name
        sub.mkdir(parents=True, exist_ok=True)
        return StageRecorder(stage_name=stage_name, dir=sub)

    def fetch_logger(self) -> "FetchLogger":
        sub = self.root / "fetch"
        sub.mkdir(parents=True, exist_ok=True)
        return FetchLogger(dir=sub)

    def flush_summary(self, summary: dict) -> None:
        path = self.root / "summary.json"
        path.write_text(
            json.dumps(summary, indent=2, ensure_ascii=False, default=_default)
        )


# ---------------------------------------------------------------------------
# Per-stage recorder — streams transcript.jsonl
# ---------------------------------------------------------------------------
class StageRecorder:
    """Streams transcript + writes stats/final_output for one LLM conversation."""

    def __init__(self, stage_name: str, dir: Path):
        self.stage_name = stage_name
        self.dir = dir
        self._transcript_path = dir / "transcript.jsonl"
        self._transcript_path.write_text("")

    def _append(self, entry: dict) -> None:
        entry.setdefault("ts", datetime.now(timezone.utc).isoformat())
        with self._transcript_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False, default=_default))
            f.write("\n")

    def log_system(self, content: str) -> None:
        self._append({"role": "system", "content": content})

    def log_user(self, content: str) -> None:
        self._append({"role": "user", "content": content})

    def log_assistant(
        self,
        content: str | None,
        tool_calls: list[dict] | None = None,
        reasoning_content: str | None = None,
    ) -> None:
        entry: dict[str, Any] = {"role": "assistant"}
        if content is not None:
            entry["content"] = content
        if reasoning_content:
            entry["reasoning_content"] = reasoning_content
        if tool_calls:
            entry["tool_calls"] = tool_calls
        self._append(entry)

    def log_tool_result(self, tool_call_id: str, name: str, content: str) -> None:
        self._append({
            "role": "tool",
            "tool_call_id": tool_call_id,
            "name": name,
            "content": content,
        })

    def log_meta(self, content: str, **extra: Any) -> None:
        entry: dict[str, Any] = {"role": "meta", "content": content}
        entry.update(extra)
        self._append(entry)

    def log_step_boundary(self, step_name: str, snapshot: dict) -> None:
        """Mark a step boundary inside a single conversation (build pipeline)."""
        self._append({
            "role": "meta",
            "type": "step_boundary",
            "step": step_name,
            "snapshot": snapshot,
        })

    def log_abort_marker(self, reason: str, **extra: Any) -> None:
        entry = {"role": "system", "type": "abort_marker", "reason": reason}
        entry.update(extra)
        self._append(entry)

    def write_stats(self, stats_obj: Any) -> None:
        path = self.dir / "stats.json"
        path.write_text(
            json.dumps(stats_obj, indent=2, ensure_ascii=False, default=_default)
        )

    def write_final_output(self, text: str) -> None:
        path = self.dir / "final_output.txt"
        path.write_text(text or "", encoding="utf-8")


# ---------------------------------------------------------------------------
# Fetch logger — pure script, no LLM transcript
# ---------------------------------------------------------------------------
class FetchLogger:
    """Append-only log for the pure-Python fetch step."""

    def __init__(self, dir: Path):
        self.dir = dir
        self._log_path = dir / "log.jsonl"
        self._log_path.write_text("")

    def log(self, **entry: Any) -> None:
        entry.setdefault("ts", datetime.now(timezone.utc).isoformat())
        with self._log_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False, default=_default))
            f.write("\n")

    def write_stats(self, stats: dict) -> None:
        path = self.dir / "stats.json"
        path.write_text(
            json.dumps(stats, indent=2, ensure_ascii=False, default=_default)
        )


# ---------------------------------------------------------------------------
# Misc
# ---------------------------------------------------------------------------
def _default(o: Any) -> Any:
    if is_dataclass(o):
        return asdict(o)
    if isinstance(o, Path):
        return str(o)
    raise TypeError(f"Object of type {type(o).__name__} is not JSON serializable")
