---
name: anthropic-messages-api
description: Anthropic Messages API — multi-turn chat, streaming, sampling parameters, multimodal image input, and prompt caching for Claude models.
tech_stack: [claude-code]
language: [python]
capability: [llm-client, api-design]
version: "Anthropic API unversioned"
collected_at: 2025-07-01
---

# Messages API

> Source: https://platform.claude.com/docs/en/build-with-claude/working-with-messages, https://platform.claude.com/docs/en/api/messages, https://platform.claude.com/cookbook/misc-prompt-caching

## Purpose

The Messages API is Anthropic's primary chat/completion endpoint (`POST /v1/messages`). It accepts multi-turn conversations with alternating user/assistant roles, a system prompt, and configurable sampling parameters. It returns one or more content blocks (text, tool_use), stop reason, and token usage metadata.

## When to Use

- Building chat/conversation interfaces with multi-turn context management.
- Any Claude-powered application requiring controllable text generation.
- Processing large documents/images where prompt caching saves cost and latency (>2x speed, up to 90% cost reduction).
- Structured output generation via `stop_sequences` and sampling parameter tuning.

## Basic Usage

```python
import anthropic

client = anthropic.Anthropic()
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=300,
    system="You are a helpful assistant.",
    messages=[
        {"role": "user", "content": "What is the title of Pride and Prejudice?"}
    ],
)
print(response.content[0].text)
# Access usage: response.usage.input_tokens, response.usage.output_tokens
```

### Streaming

```python
with client.messages.stream(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Tell me a story."}],
) as stream:
    for event in stream:
        if event.type == "content_block_delta":
            print(event.delta.text, end="", flush=True)
```

### Multimodal Image Input

```python
import base64

with open("image.jpg", "rb") as f:
    image_data = base64.b64encode(f.read()).decode()

response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=300,
    messages=[{
        "role": "user",
        "content": [
            {"type": "text", "text": "Describe this image."},
            {"type": "image", "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": image_data,
            }},
        ],
    }],
)
```

### Prompt Caching (Automatic — Recommended)

```python
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=300,
    cache_control={"type": "ephemeral"},       # one-line change
    system=large_document_context,
    messages=[{"role": "user", "content": "Summarize."}],
)
# Monitor cache: response.usage.cache_creation_input_tokens / cache_read_input_tokens
```

### Prompt Caching (Explicit Breakpoints)

```python
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=300,
    system=[{
        "type": "text",
        "text": system_prompt,
        "cache_control": {"type": "ephemeral"}, # explicit breakpoint
    }],
    messages=[{
        "role": "user",
        "content": [{
            "type": "text",
            "text": user_query,
            "cache_control": {"type": "ephemeral"},
        }],
    }],
)
```

### Multi-turn with Automatic Caching

```python
conversation = []
for question in questions:
    conversation.append({"role": "user", "content": question})
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=300,
        cache_control={"type": "ephemeral"},
        system=large_document,
        messages=conversation,
    )
    reply = response.content[0].text
    conversation.append({"role": "assistant", "content": reply})
```

## Key APIs (Summary)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | Yes | Model ID (e.g. `"claude-sonnet-4-6"`) |
| `messages` | array | Yes | `[{role, content}, ...]`; roles alternate user/assistant |
| `max_tokens` | integer | **Yes** | Max output tokens; mandatory, 400 error if omitted |
| `system` | string\|array | No | System prompt; supports `cache_control` per block |
| `temperature` | number | No | 0.0–1.0; lower = deterministic, higher = creative |
| `top_p` | number | No | Nucleus sampling; don't combine with temperature |
| `top_k` | integer | No | Top-K sampling |
| `stop_sequences` | array | No | Custom stop strings; model stops *before* producing them |
| `stream` | boolean | No | Enable SSE streaming |
| `cache_control` | object | No | `{"type": "ephemeral"}` for automatic caching |
| `tools` | array | No | Tool definitions for function calling |

**Response fields**: `id`, `model`, `role` ("assistant"), `content` (array of blocks), `stop_reason` ("end_turn"\|"max_tokens"\|"stop_sequence"\|"tool_use"), `usage` (input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens).

**Sampling recommendations**:
- Deterministic: `temperature=0.0`
- Balanced (default): `temperature=0.7`
- Creative: `temperature=1.0`
- If using top_p: `temperature=1.0, top_p=0.9`

**Streaming events**: `message_start` → `content_block_start` → `content_block_delta` → `content_block_stop` → `message_delta` → `message_stop`.

## Caveats

- **`max_tokens` is mandatory** — forgetting it causes a 400 error on every call.
- **Cache minimum token thresholds**: 1,024 tokens (Sonnet) / 4,096 tokens (Opus, Haiku 4.5). Shorter content is silently not cached.
- **Cache TTL**: 5 min default (refreshed on each hit); 1h TTL option costs 2× base input price.
- **Cache hit is not guaranteed**: the API may evict entries under load; always check `usage.cache_read_input_tokens`.
- **temperature + top_p**: don't use both simultaneously — pick one sampling strategy.
- **stop_sequences**: the model stops *before* the sequence, so it won't appear in the output text.
- **Image input**: must be base64-encoded (not URLs); large images increase latency significantly; supported types: JPEG/PNG/GIF/WebP.
- **Conversation state is client-side**: the API is stateless; you must manage the full message history yourself.
- **Automatic caching uses 1 of 4 available breakpoint slots** — if you need all 4 for explicit breakpoints, skip automatic caching.

## Composition Hints

- **Pair with `anthropic-tool-use`** when Claude needs to call external functions — pass `tools` alongside messages.
- **Pair with `anthropic-prompt-caching`** for deep caching strategies (mixed TTLs, cache hit rate optimization, cost analysis).
- **Pair with `anthropic-token-counting`** to pre-calculate input tokens before calling `messages.create` — useful for estimating costs and deciding whether caching is worthwhile.
- **For production**: always set `max_tokens` explicitly, handle `stop_reason == "max_tokens"` (truncated response), and use `cache_control` for any repeated large context.
