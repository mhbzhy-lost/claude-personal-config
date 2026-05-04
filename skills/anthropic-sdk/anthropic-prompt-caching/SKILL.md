---
name: anthropic-prompt-caching
description: Cache and reuse prompt context in Claude API for >2x latency reduction and up to 90% cost savings on repetitive tasks.
tech_stack: [backend]
language: [python]
capability: [llm-client, prompt-engineering]
version: "Anthropic API (Python SDK >= 0.83.0)"
collected_at: 2025-07-17
---

# Prompt Caching (Claude API)

> Source: https://platform.claude.com/docs/en/build-with-claude/prompt-caching, https://platform.claude.com/cookbook/misc-prompt-caching, https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-use-with-prompt-caching

## Purpose

Prompt caching stores and reuses shared context across Claude API calls. It reduces latency by >2x and input token costs by up to 90% (cache reads billed at 0.1x base price). Ideal when the same large prefix — system prompts, long documents, tool definitions — is sent repeatedly.

## When to Use

- Multi-turn conversations where earlier context (system prompt, large documents) is reused
- Repeated queries against the same large context (book analysis, codebase queries)
- System prompts with large tool definitions that stay constant
- Any scenario where the same long prefix is sent 2+ times within the cache TTL window

**Skip if:** your prompts are short (<1,024 tokens for Sonnet), each request is unique, or only a single call is needed.

## Basic Usage

### Automatic caching (recommended — one-line change)

Add `cache_control={"type": "ephemeral"}` at the top level of `messages.create()`:

```python
import anthropic

client = anthropic.Anthropic()

# First call: cache write (similar latency to baseline)
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=300,
    cache_control={"type": "ephemeral"},  # ← the only change
    messages=[{"role": "user", "content": "<book>" + book_content + "</book>\n\nSummarize."}],
)

# Second call with same prefix: cache hit (~3x faster)
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=300,
    cache_control={"type": "ephemeral"},
    messages=[{"role": "user", "content": "<book>" + book_content + "</book>\n\nWhat is the title?"}],
)
```

The system automatically places and manages cache breakpoints. In multi-turn conversations the breakpoint moves forward as the conversation grows — no manual marker management.

### Explicit breakpoints (fine-grained control)

Place `cache_control` on individual content blocks for precise control:

```python
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=300,
    system=[{
        "type": "text",
        "text": system_message,
        "cache_control": {"type": "ephemeral"},  # explicit on system
    }],
    messages=[{
        "role": "user",
        "content": [{
            "type": "text",
            "text": user_content,
            "cache_control": {"type": "ephemeral"},  # explicit on content
        }],
    }],
)
```

You can **combine** both: explicit breakpoints for the system prompt while automatic caching handles the conversation messages.

### Monitoring cache hits

```python
usage = response.usage
usage.cache_creation_input_tokens   # >0 → cache write occurred
usage.cache_read_input_tokens       # >0 → cache hit occurred (0.1x billing)
usage.input_tokens                  # only non-cached portion when hit occurred
```

## Key APIs (Summary)

| Mechanism | How | Best for |
|-----------|-----|----------|
| `cache_control={"type": "ephemeral"}` | Top-level param in `messages.create()` | Most use cases; zero-config multi-turn |
| `"cache_control": {"type": "ephemeral"}` | On individual content blocks in `system` or `messages[].content[]` | Fine-grained control, different TTLs per section |
| `usage.cache_creation_input_tokens` | Response field | Track cache writes |
| `usage.cache_read_input_tokens` | Response field | Track cache hits |

**Constraints:**

- Minimum cacheable: 1,024 tokens (Sonnet) / 4,096 tokens (Opus, Haiku 4.5)
- Max 4 explicit breakpoints per request (+1 slot for automatic)
- Cache TTL: 5 min default (refreshes on each hit); 1-hour TTL available at 2x base input price
- Cache is ephemeral — server-side only, not persisted across sessions

## Caveats

- **Cache is ephemeral**: Lives on Anthropic servers only; cannot be persisted across sessions. 5 min default TTL, max 1 hour.
- **Byte-exact matching**: Any change in the cached prefix causes a full cache miss and re-write. Use unique prefixes (timestamps) to avoid stale caches from previous runs.
- **Silent skip below minimum**: Content shorter than the minimum token threshold is silently not cached — no error is raised.
- **Cost tradeoff**: Cache writes cost 1.25x base input price. If the cache is only read once before expiring, total cost is higher than no caching. Optimal when reusing same prefix 2+ times within TTL.
- **Breakpoint limit**: Exceeding 4 explicit breakpoints causes an error. Automatic caching consumes one slot.
- **Stackable with Batch API**: Prompt caching discounts can combine with Batch API's 50% discount for additional savings.

## Composition Hints

- **With Tool Use**: Cache system prompts containing large tool definitions. Place `cache_control` on the system block with tool definitions to avoid re-processing tool schemas on every turn.
- **With multi-turn conversations**: Use automatic caching — the breakpoint moves forward automatically. No need to manually shift markers.
- **With long documents**: Embed the document in the first user message with `cache_control` at top level. Subsequent questions about the same document hit the cache.
- **Explicit mode for conversation class**: When building a conversation manager, place `cache_control` only on the *last* user message in each turn — older turns are already cached.
