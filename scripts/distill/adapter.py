"""Provider adapters with caching strategies and usage stats tracking.

DeepSeek: automatic byte-prefix caching — we ensure prefix consistency.
Qwen: explicit cache_control breakpoints injected into system prompt.

The pipeline runs two LLM conversations end-to-end:

  1. *plan*  — exploration loop that emits ``plan.json``
  2. *build* — single message-history that walks 3 inner steps
              (preprocess → build SKILL.md → mark capability) by appending
              user nudges. The system prompt stays byte-identical across
              all turns of one conversation, so DeepSeek's automatic
              prefix cache and Qwen's explicit cache_control both hit on
              every follow-up turn.

This module deliberately keeps two adapters in lock-step so we can
A/B-test cost between providers using the same orchestrator.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any

from openai import OpenAI


# ---------------------------------------------------------------------------
# Usage statistics
# ---------------------------------------------------------------------------
@dataclass
class StageStats:
    """Stats for a single LLM conversation (plan or build).

    Multi-step build conversations slice the same StageStats — per-step
    breakdowns live in ``step_slices`` (indexed by step name).
    """

    stage: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cached_tokens: int = 0
    cache_write_tokens: int = 0
    requests: int = 0
    tool_calls: int = 0
    elapsed_ms: int = 0
    aborted_reason: str | None = None
    tool_call_limit_hit: bool = False
    # Optional per-step breakdown for the build conversation. Each entry
    # captures the delta of the StageStats counters between two ``user``
    # nudges (i.e. the portion of the conversation that ran step N).
    step_slices: list[dict] = field(default_factory=list)

    @property
    def cache_hit_rate(self) -> float:
        if self.prompt_tokens == 0:
            return 0.0
        return self.cached_tokens / self.prompt_tokens

    def snapshot(self) -> dict:
        """Counter snapshot for slicing (used by run_tool_loop step boundaries)."""
        return {
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "cached_tokens": self.cached_tokens,
            "cache_write_tokens": self.cache_write_tokens,
            "requests": self.requests,
            "tool_calls": self.tool_calls,
        }


@dataclass
class PipelineStats:
    """Top-level stats for one ``runs/<id>/`` directory.

    The 3-stage architecture means we hold:

    * ``plan_stats``  — StageStats for the plan conversation
    * ``fetch_stats`` — dict (no LLM, pure script counters)
    * ``build_stats`` — StageStats for the build conversation (with
      per-step slices inside)
    """

    provider: str
    model: str
    tech_stack: str
    skills_created: int = 0
    source_text_chars: int = 0
    plan_stats: StageStats | None = None
    fetch_stats: dict = field(default_factory=dict)
    build_stats: StageStats | None = None

    # ---- aggregation helpers -----------------------------------------
    def _llm_stages(self) -> list[StageStats]:
        return [s for s in (self.plan_stats, self.build_stats) if s is not None]

    @property
    def total_prompt_tokens(self) -> int:
        return sum(s.prompt_tokens for s in self._llm_stages())

    @property
    def total_completion_tokens(self) -> int:
        return sum(s.completion_tokens for s in self._llm_stages())

    @property
    def total_cached_tokens(self) -> int:
        return sum(s.cached_tokens for s in self._llm_stages())

    @property
    def total_cache_write_tokens(self) -> int:
        return sum(s.cache_write_tokens for s in self._llm_stages())

    @property
    def cache_hit_rate(self) -> float:
        if self.total_prompt_tokens == 0:
            return 0.0
        return self.total_cached_tokens / self.total_prompt_tokens

    @property
    def total_requests(self) -> int:
        return sum(s.requests for s in self._llm_stages())

    @property
    def total_tool_calls(self) -> int:
        return sum(s.tool_calls for s in self._llm_stages())

    @property
    def total_elapsed_ms(self) -> int:
        llm_ms = sum(s.elapsed_ms for s in self._llm_stages())
        fetch_ms = int(self.fetch_stats.get("elapsed_ms", 0) or 0)
        return llm_ms + fetch_ms

    def to_summary_dict(
        self,
        run_id: str | None = None,
        config: dict | None = None,
        plan_skill_names: list[str] | None = None,
        skill_outputs: list[dict] | None = None,
    ) -> dict:
        """Serializable snapshot for ``runs/<id>/summary.json`` (schema v2)."""

        def _stage_dict(s: StageStats | None) -> dict | None:
            if s is None:
                return None
            return {
                "stage": s.stage,
                "prompt_tokens": s.prompt_tokens,
                "completion_tokens": s.completion_tokens,
                "cached_tokens": s.cached_tokens,
                "cache_write_tokens": s.cache_write_tokens,
                "cache_hit_rate": round(s.cache_hit_rate, 4),
                "requests": s.requests,
                "tool_calls": s.tool_calls,
                "elapsed_ms": s.elapsed_ms,
                "aborted_reason": s.aborted_reason,
                "tool_call_limit_hit": s.tool_call_limit_hit,
                "step_slices": s.step_slices,
            }

        per_model_cache: dict[str, dict[str, int]] = {
            self.model: {
                "prompt": self.total_prompt_tokens,
                "cached": self.total_cached_tokens,
                "cache_write": self.total_cache_write_tokens,
            }
        }

        return {
            "schema_version": 2,
            "run_id": run_id or "",
            "config": config or {},
            "provider": self.provider,
            "model": self.model,
            "tech_stack": self.tech_stack,
            "skills_created": self.skills_created,
            "source_text_chars": self.source_text_chars,
            "plan_skill_names": plan_skill_names or [],
            "skills": skill_outputs or [],
            "totals": {
                "prompt_tokens": self.total_prompt_tokens,
                "completion_tokens": self.total_completion_tokens,
                "cached_tokens": self.total_cached_tokens,
                "cache_write_tokens": self.total_cache_write_tokens,
                "requests": self.total_requests,
                "tool_calls": self.total_tool_calls,
                "elapsed_ms": self.total_elapsed_ms,
                "cache_hit_rate": round(self.cache_hit_rate, 4),
            },
            "per_model_cache": per_model_cache,
            "plan": _stage_dict(self.plan_stats),
            "fetch": dict(self.fetch_stats) if self.fetch_stats else {},
            "build": _stage_dict(self.build_stats),
        }

    def report(self) -> str:
        lines = [
            "=" * 60,
            f"  Distillation Report — {self.provider} ({self.model})",
            "=" * 60,
            f"  Tech stack:      {self.tech_stack}",
            f"  Skills created:  {self.skills_created}",
            f"  Source text:     {self.source_text_chars:,} chars",
            "-" * 60,
        ]
        for s in self._llm_stages():
            cr = s.cached_tokens / max(s.prompt_tokens, 1)
            lines.append(
                f"  [{s.stage}] "
                f"prompt={s.prompt_tokens:,} cached={s.cached_tokens:,} "
                f"(hit_rate={cr:.0%}) "
                f"completion={s.completion_tokens:,} "
                f"requests={s.requests} tool_calls={s.tool_calls} "
                f"time={s.elapsed_ms:,}ms"
            )
        if self.fetch_stats:
            lines.append(
                f"  [fetch] files={self.fetch_stats.get('files_count', 0)} "
                f"bytes={self.fetch_stats.get('bytes_total', 0):,} "
                f"failures={len(self.fetch_stats.get('failures', []))} "
                f"time={self.fetch_stats.get('elapsed_ms', 0):,}ms"
            )
        lines.append("-" * 60)
        lines.append(
            f"  TOTALS: "
            f"prompt={self.total_prompt_tokens:,} "
            f"cached={self.total_cached_tokens:,} "
            f"completion={self.total_completion_tokens:,} "
            f"requests={self.total_requests}"
        )
        lines.append(
            f"  Cache hit rate:  {self.cache_hit_rate:.0%} "
            f"({self.total_cached_tokens:,} / "
            f"{self.total_prompt_tokens:,})"
        )
        lines.append(f"  Total time:      {self.total_elapsed_ms / 1000:.1f}s")
        lines.append("=" * 60)
        return "\n".join(lines)


# ---------------------------------------------------------------------------
# Assistant message serialization
# ---------------------------------------------------------------------------
def serialize_assistant_message(message: Any) -> dict:
    """Convert an OpenAI ChatCompletionMessage to a plain dict for the next
    round's ``messages`` list.

    Preserves provider-specific fields that the API requires to be echoed
    back in multi-turn conversations:

    * ``reasoning_content`` — DeepSeek thinking-mode and Qwen reasoning
      models attach the chain-of-thought to the assistant message and
      *require* it to be passed back, otherwise the API rejects the next
      request with HTTP 400.
    """
    entry: dict[str, Any] = {"role": "assistant"}
    content = getattr(message, "content", None)
    if content is not None:
        entry["content"] = content
    reasoning = getattr(message, "reasoning_content", None)
    if reasoning:
        entry["reasoning_content"] = reasoning
    tool_calls = getattr(message, "tool_calls", None)
    if tool_calls:
        entry["tool_calls"] = [
            {
                "id": tc.id,
                "type": "function",
                "function": {
                    "name": tc.function.name,
                    "arguments": tc.function.arguments,
                },
            }
            for tc in tool_calls
        ]
    return entry


# ---------------------------------------------------------------------------
# Provider adapters
# ---------------------------------------------------------------------------
class DeepSeekAdapter:
    """DeepSeek adapter — automatic byte-prefix caching.

    No cache_control parameters needed. We just keep the system message
    byte-identical for every turn of a conversation so the server-side
    prefix cache hits.
    """

    def __init__(self, model: str = "deepseek-v4-pro", api_key: str | None = None):
        self.model = model
        self.client = OpenAI(
            api_key=api_key or os.environ.get("DEEPSEEK_API_KEY", ""),
            base_url="https://api.deepseek.com/v1",
        )

    @property
    def name(self) -> str:
        return "deepseek"

    def serialize_assistant_message(self, message: Any) -> dict:
        return serialize_assistant_message(message)

    def build_system(self, system_prompt: str) -> list[dict]:
        return [{"role": "system", "content": system_prompt}]

    def create_message(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
        max_tokens: int = 8192,
    ) -> Any:
        kwargs: dict[str, Any] = dict(
            model=self.model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=0.2,
        )
        if tools:
            kwargs["tools"] = tools
        return self.client.chat.completions.create(**kwargs)

    def extract_usage(self, response: Any) -> dict:
        usage = response.usage
        result = {
            "prompt_tokens": usage.prompt_tokens,
            "completion_tokens": usage.completion_tokens,
            "cached_tokens": 0,
            "cache_write_tokens": 0,
        }
        details = getattr(usage, "prompt_tokens_details", None)
        if details and hasattr(details, "cached_tokens"):
            result["cached_tokens"] = details.cached_tokens or 0
        return result


class QwenAdapter:
    """Qwen adapter — explicit cache_control breakpoints.

    The system prompt always carries ``cache_control: {type: ephemeral}``
    (covers static instructions). On every ``create_message`` call we
    additionally inject a *trailing* breakpoint on the last non-assistant
    message so the entire growing prefix (system + accumulated tool
    results + user nudges) becomes cacheable on each turn.

    Min cacheable: 1024 tokens. TTL: 5 minutes (refreshed on hit).
    """

    @staticmethod
    def _attach_cache_control(content: Any) -> Any:
        """Wrap a message ``content`` so the trailing block carries
        ``cache_control: ephemeral``. Returns a new value — never mutates.

        * ``str`` → wrapped into a single ``[{type: text, text, cache_control}]``
        * ``list`` of dict blocks → copy with cache_control on the last block
          (skips blocks that already carry one to stay idempotent)
        * other types → returned unchanged
        """
        if isinstance(content, str):
            return [
                {
                    "type": "text",
                    "text": content,
                    "cache_control": {"type": "ephemeral"},
                }
            ]
        if isinstance(content, list) and content:
            new_blocks = [dict(b) if isinstance(b, dict) else b for b in content]
            for i in range(len(new_blocks) - 1, -1, -1):
                blk = new_blocks[i]
                if isinstance(blk, dict):
                    if "cache_control" not in blk:
                        blk["cache_control"] = {"type": "ephemeral"}
                    return new_blocks
            return new_blocks
        return content

    def __init__(
        self,
        model: str = "qwen-max",
        api_key: str | None = None,
        base_url: str | None = None,
    ):
        self.model = model
        self.client = OpenAI(
            api_key=api_key or os.environ.get("DASHSCOPE_API_KEY", ""),
            base_url=base_url or os.environ.get(
                "DASHSCOPE_BASE_URL",
                "https://dashscope.aliyuncs.com/compatible-mode/v1",
            ),
        )

    @property
    def name(self) -> str:
        return "qwen"

    def serialize_assistant_message(self, message: Any) -> dict:
        return serialize_assistant_message(message)

    def build_system(self, system_prompt: str) -> list[dict]:
        return [
            {
                "role": "system",
                "content": [
                    {
                        "type": "text",
                        "text": system_prompt,
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
            }
        ]

    def create_message(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
        max_tokens: int = 8192,
    ) -> Any:
        # Inject a trailing cache_control breakpoint on the last
        # non-assistant message so the full growing prefix becomes a
        # cache candidate on every turn. The system block already
        # carries its own breakpoint via build_system().
        patched: list[dict] = []
        last_idx = -1
        for i, m in enumerate(messages):
            if m.get("role") in ("user", "tool", "system"):
                last_idx = i
        for i, m in enumerate(messages):
            if i == last_idx and i != 0:  # skip if it's the system head (already marked)
                new_m = dict(m)
                new_m["content"] = self._attach_cache_control(m.get("content"))
                patched.append(new_m)
            else:
                patched.append(m)

        kwargs: dict[str, Any] = dict(
            model=self.model,
            messages=patched,
            max_tokens=max_tokens,
            temperature=0.2,
        )
        if tools:
            kwargs["tools"] = tools
        return self.client.chat.completions.create(**kwargs)

    def extract_usage(self, response: Any) -> dict:
        usage = response.usage
        result = {
            "prompt_tokens": usage.prompt_tokens,
            "completion_tokens": usage.completion_tokens,
            "cached_tokens": 0,
            "cache_write_tokens": 0,
        }
        details = getattr(usage, "prompt_tokens_details", None)
        if details:
            if hasattr(details, "cached_tokens"):
                result["cached_tokens"] = details.cached_tokens or 0
            if hasattr(details, "cache_creation_input_tokens"):
                result["cache_write_tokens"] = details.cache_creation_input_tokens or 0
        return result


# ---------------------------------------------------------------------------
# Adapter factory
# ---------------------------------------------------------------------------
def create_adapter(
    provider: str,
    model: str | None = None,
    api_key: str | None = None,
) -> DeepSeekAdapter | QwenAdapter:
    """Create a provider adapter by name."""
    defaults: dict[str, str] = {
        "deepseek": "deepseek-v4-pro",
        "qwen": "qwen-max",
    }
    if provider not in defaults:
        raise ValueError(
            f"Unknown provider '{provider}'. Choose: {list(defaults)}"
        )
    if provider == "deepseek":
        return DeepSeekAdapter(model=model or defaults[provider], api_key=api_key)
    return QwenAdapter(model=model or defaults[provider], api_key=api_key)
