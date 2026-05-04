---
name: anthropic-sdk-python-core
description: Python client for the Anthropic Claude API — sync and async message creation with streaming support
tech_stack: [anthropic-sdk]
language: [python]
capability: [llm-client]
version: "anthropic v0.97.0"
collected_at: 2026-04-23
---

# Anthropic Python SDK

> Source: https://github.com/anthropics/anthropic-sdk-python, https://pypi.org/project/anthropic/, https://platform.claude.com/docs/en/api/sdks/python

## Purpose
The official Python SDK for Anthropic's Claude API. Provides both synchronous (`Anthropic`) and asynchronous (`AsyncAnthropic`) clients for creating and streaming LLM completions from Python applications.

## When to Use
- Any Python backend that needs to call Claude models (Opus, Sonnet, Haiku)
- Both blocking (sync) and asyncio-based (async) workflows
- Real-time streaming of LLM output token-by-token
- Server-side applications; Python 3.9+ required

## Basic Usage

### Install
```sh
pip install anthropic
```

### Sync Message
```python
from anthropic import Anthropic

client = Anthropic()  # defaults to ANTHROPIC_API_KEY env var
message = client.messages.create(
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello, Claude"}],
    model="claude-sonnet-4-5-20250929",
)
print(message.content)
```

### Async Streaming
```python
import asyncio
from anthropic import AsyncAnthropic

client = AsyncAnthropic()

async def main():
    async with client.messages.stream(
        max_tokens=1024,
        messages=[{"role": "user", "content": "Say hello!"}],
        model="claude-sonnet-4-5-20250929",
    ) as stream:
        async for event in stream:
            if event.type == "text":
                print(event.text, end="", flush=True)
        accumulated = await stream.get_final_message()
        print(accumulated.to_json())

asyncio.run(main())
```

## Key APIs (Summary)
- **`Anthropic(api_key=...)`** — synchronous client; reads `ANTHROPIC_API_KEY` env var by default
- **`AsyncAnthropic(api_key=...)`** — async client for asyncio workflows
- **`client.messages.create(**params)`** — send a message; returns the full response
- **`client.messages.stream(**params)`** — async context manager yielding streaming events
  - Event types: `text` (incremental token), `content_block_stop` (block complete)
  - `stream.get_final_message()` — accumulated result after full consumption
- Key parameters: `model`, `max_tokens`, `messages` (list of `{role, content}`)

## Caveats
- **Stream consumption**: Must consume the entire stream inside the `async with` block before calling `get_final_message()`
- **Model IDs are exact strings** (e.g., `"claude-sonnet-4-5-20250929"`) — no shorthand aliases
- **Python 3.9+** required
- **API key**: Reads `ANTHROPIC_API_KEY` from env by default; pass `api_key=` to override

## Composition Hints
- For tool use / function calling, see the companion `tools.md` and `helpers.md` in the SDK repo
- Combine with `tenacity` or similar for retry logic on rate limits
- The streaming pattern uses `async for` — works naturally with FastAPI `StreamingResponse` for proxying
- Both sync and async clients share the same `messages` API surface; swap `Anthropic` ↔ `AsyncAnthropic` when changing concurrency model
