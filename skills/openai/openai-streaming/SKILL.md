---
name: openai-streaming
description: Stream OpenAI Chat Completions incrementally with delta processing, event-driven stream managers, and cross-provider compatibility.
tech_stack: [openai]
language: [python]
capability: [llm-client, tool-calling]
version: "openai-python unversioned (indexed 2026-01-12)"
collected_at: 2026-01-12
---

# OpenAI Streaming Chat Completions

> Source: https://github.com/openai/openai-python/blob/main/README.md?plain=1, https://deepwiki.com/openai/openai-python/4.1.2-streaming-chat-completions

## Purpose

Deliver Chat Completions responses incrementally via Server-Sent Events (SSE), enabling real-time display of partial results. Supports raw chunk iteration and a higher-level stream manager with semantic events, automatic state accumulation, and incremental JSON parsing for structured outputs.

## When to Use

- Real-time chat UIs that display tokens as they arrive
- Long responses where full-completion latency is unacceptable
- Streaming tool calls where incremental fragments matter
- Structured output streaming with progressive JSON parsing
- Any scenario needing low time-to-first-token

Prefer `.stream()` (the stream manager) for automatic accumulation and semantic events. Use raw `stream=True` only when you need chunk-by-chunk control.

## Basic Usage

### Stream Manager (recommended)

```python
from openai import OpenAI
client = OpenAI()

with client.chat.completions.stream(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Tell me a story."}],
) as stream:
    for event in stream:
        if event.type == "content.delta":
            print(event.delta, flush=True, end="")
        elif event.type == "content.done":
            print(f"\n--- done, {len(event.content)} chars ---")
    final = stream.get_final_completion()
```

### Async Stream Manager

```python
import asyncio
from openai import AsyncOpenAI

async def main():
    client = AsyncOpenAI()
    async with await client.chat.completions.stream(
        model="gpt-4o",
        messages=[{"role": "user", "content": "Hello"}],
    ) as stream:
        async for event in stream:
            if event.type == "content.delta":
                print(event.delta, flush=True, end="")
        final = await stream.get_final_completion()
```

### Raw Chunk Iteration (direct)

```python
stream = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hi"}],
    stream=True,
)
for chunk in stream:
    delta = chunk.choices[0].delta
    if delta.content is not None:
        print(delta.content, end="")
```

## Key APIs (Summary)

### Stream Event Types

| Event | Triggers when | Key fields |
|---|---|---|
| `content.delta` | New text token arrives | `delta` (new text), `snapshot` (all so far) |
| `content.done` | Content complete | `content` (full text), `parsed` (if structured output) |
| `tool_calls.delta` | Tool call fragment arrives | `delta`, `snapshot` |
| `tool_calls.done` | Tool call JSON complete | Fully parsed `ParsedFunctionToolCall` |
| `refusal.delta` / `refusal.done` | Model refuses request | `delta`/`refusal` text |
| `chunk` | Raw SSE chunk | Full `ChatCompletionChunk` |

### Stream Manager Methods

- `stream.get_final_completion()` → `ParsedChatCompletion[T]` — final accumulated result after iteration
- `stream.until_done()` — blocks until stream completes (useful with callbacks)
- `stream.on(event_type, callback)` — register per-event callbacks
- `stream.current_completion_snapshot` — live accumulated state during iteration

### With Structured Outputs (incremental JSON parse)

```python
from pydantic import BaseModel

class Story(BaseModel):
    title: str
    content: str

with client.chat.completions.stream(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Write a story"}],
    response_format=Story,
) as stream:
    for event in stream:
        if event.type == "content.delta" and event.parsed:
            print(event.parsed)  # partial dict until JSON is complete
```

### Streaming with Tool Calls

```python
with client.chat.completions.stream(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Weather in Tokyo?"}],
    tools=[{"type": "function", "function": {"name": "get_weather", "parameters": {...}}}],
) as stream:
    for event in stream:
        if event.type == "tool_calls.delta":
            print(f"partial: {event.delta}")
        elif event.type == "tool_calls.done":
            print(f"complete: {event.parsed_function}")  # ParsedFunctionToolCall
```

### Event Callbacks

```python
stream = client.chat.completions.stream(model="gpt-4o", messages=[...])
stream.on("content.delta", lambda delta, snapshot: print(delta, end=""))
stream.until_done()
```

## Caveats

### LengthFinishReasonError
When `max_tokens` is reached mid-response, the stream raises `LengthFinishReasonError`. Always catch it:

```python
from openai import LengthFinishReasonError

try:
    with client.chat.completions.stream(...) as stream:
        for event in stream:
            pass
except LengthFinishReasonError:
    print("Response truncated — increase max_tokens")
```

### Refusal Handling
When the model refuses, `refusal.delta`/`refusal.done` events fire instead of `content.*`. Always handle both to avoid silent empty outputs.

### Chunk Granularity
Deltas are token-level, not word/character-level. Never assume a chunk is a complete word — always concatenate.

### Resource Cleanup
Always use `.stream()` with a `with` block. Direct `stream=True` iterators should also use context-manager patterns where possible to close HTTP connections.

### Cross-Provider Streaming

| Provider | base_url | Streaming support | Caveats |
|---|---|---|---|
| **DeepSeek** | `https://api.deepseek.com/v1` | ✅ `deepseek-chat`, `deepseek-reasoner` | Tool call streaming may differ |
| **Qwen (DashScope)** | `https://dashscope.aliyuncs.com/compatible-mode/v1` | ✅ | SSE format may wrap differently |
| **Zhipu (GLM)** | `https://open.bigmodel.cn/api/paas/v4/` | ✅ (glm-4+) | `tool_calls.delta` may be unsupported |

### Sync/Async Parity
Synchronous and async streaming APIs are functionally identical — same event types, same `current_completion_snapshot`, same `get_final_completion()`. Only implementation differs (async uses `httpx.AsyncClient`).

## Composition Hints

- **With tool-calling loops**: Use streaming to detect `tool_calls.done`, then switch to non-streaming for the follow-up `create()` call with tool results.
- **With structured outputs**: Pass a Pydantic model as `response_format` and use `event.parsed` on `content.delta` for progressive JSON — wait for `content.done` for the fully validated model.
- **With vision**: Streaming works the same; image inputs are processed before text generation begins.
- **UI integration**: Map `content.delta` → append to display buffer, `content.done` → finalize, `tool_calls.done` → trigger tool execution.
