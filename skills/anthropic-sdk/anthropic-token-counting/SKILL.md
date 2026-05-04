---
name: anthropic-token-counting
description: Count tokens before sending API requests using Anthropic's free count_tokens endpoint
tech_stack: [anthropic-sdk]
language: [python, typescript]
capability: [llm-client]
version: "Anthropic API unversioned"
collected_at: 2025-01-01
---

# Anthropic Token Counting

> Source: https://platform.claude.com/docs/en/build-with-claude/token-counting

## Purpose
Count the number of input tokens a message would consume — before actually sending the paid API request. The count_tokens endpoint is **free** and accepts the exact same parameter shape as `messages.create`, making it a zero-cost way to estimate usage, trim conversations, and decide whether prompt caching is worthwhile.

## When to Use
- Pre-calculate token counts to choose between models (Opus vs Sonnet vs Haiku)
- Trim conversation history to fit within context windows before sending
- Determine if prompt caching thresholds are met (1024 tokens for Sonnet, 4096 for Opus/Haiku 4.5)
- Estimate costs before committing to a paid `messages.create` call
- Compare token consumption across different system prompt or tool definitions

## Basic Usage

### Python
```python
import anthropic

client = anthropic.Anthropic()

response = client.messages.count_tokens(
    model="claude-sonnet-4-20250514",
    system="You are a helpful assistant.",
    messages=[
        {"role": "user", "content": "Hello, world!"}
    ]
)
print(response.input_tokens)  # e.g. 15
```

### TypeScript
```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

const response = await anthropic.messages.countTokens({
    model: 'claude-sonnet-4-20250514',
    system: 'You are a helpful assistant.',
    messages: [
        { role: 'user', content: 'Hello, world!' }
    ]
});
console.log(response.input_tokens);  // e.g. 15
```

## Key APIs (Summary)

| Endpoint | Method | Cost |
|----------|--------|------|
| `/v1/messages/count_tokens` | POST | **Free** |

**Request shape** — identical to `messages.create`:
- `model` (string, required) — model ID string
- `messages` (array, required) — conversation messages
- `system` (string | array, optional) — system prompt
- `tools` (array, optional) — tool definitions
- `tool_choice` (object, optional) — tool selection control

**Response**: `{ "input_tokens": <integer> }`

## Caveats
- **Input only** — does not predict output tokens; only counts the input side
- **Model-dependent** — Claude 3 and Claude 4 series use different tokenizers; same text yields different counts across model families
- **Image tokens** are counted differently than text tokens
- **Character heuristic** (~4 chars ≈ 1 token for English) is a rough estimate only; always prefer the API for accuracy
- Must pass the full parameter shape (system, tools, etc.) to get an accurate count — omitting parts yields underestimates

## Composition Hints
- Use **before** calling `messages.create` to validate that prompts + conversation history fit within the model's context window
- Pair with **Prompt Caching** (`anthropic-prompt-caching`): use count_tokens to verify cache breakpoints meet the minimum token thresholds before marking content with `cache_control`
- Pair with **Batch API** (`anthropic-batch-api`): pre-count tokens for each batch request to estimate total cost at 50%-off batch pricing
- Combine with **Model Migration** (`anthropic-model-migration`): compare token counts for identical input across old and new model IDs to forecast cost changes
