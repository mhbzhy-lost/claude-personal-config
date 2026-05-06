---
name: openai-chat-completions
description: Create chat completions with messages array, role management, response_format, sampling controls, and cross-provider model names.
tech_stack: [openai]
language: [python]
capability: [llm-client, prompt-engineering]
version: "openai-python unversioned"
collected_at: 2026-01-12
---

# Chat Completions API

> Source: https://developers.openai.com/api/reference/python, https://deepwiki.com/openai/openai-python/4.1.1-parameters-and-configuration, https://github.com/openai/openai-python/blob/main/README.md?plain=1

## Purpose

Call `client.chat.completions.create()` to generate text from OpenAI and OpenAI-compatible models. The API accepts an array of role-tagged messages and returns one or more completion choices with configurable sampling, formatting, and reasoning behavior.

## When to Use

- Any text generation task: conversation, summarization, translation, code generation
- Multi-turn dialogue: accumulate `messages` and re-send the full history each turn
- Structured output: JSON object or JSON Schema via `response_format`
- Reasoning-heavy tasks on o-series/GPT-5 models with `reasoning_effort`
- Token-level probability inspection via `logprobs`
- Cross-provider chat: DeepSeek, Qwen, Zhipu all share this interface

## Basic Usage

```python
from openai import OpenAI

client = OpenAI()
completion = client.chat.completions.create(
    model="gpt-5.2",
    messages=[
        {"role": "developer", "content": "Talk like a pirate."},
        {"role": "user", "content": "How do I check if a Python object is an instance of a class?"},
    ],
)
print(completion.choices[0].message.content)
```

### Messages: Roles and Content

```python
messages = [
    {"role": "system",    "content": "You are a helpful math tutor."},       # System instruction
    {"role": "user",      "content": "What is the derivative of x^2?"},      # User turn
    {"role": "assistant", "content": "The derivative is 2x."},               # Model response (history)
    {"role": "user",      "content": "Now the second derivative."},          # Next user turn
]
```

| Role | Purpose |
|------|---------|
| `developer` | Highest-priority instructions (preferred for gpt-5.x; replaces `system`) |
| `system` | System-level instructions (legacy, still widely supported) |
| `user` | User input / conversation turn |
| `assistant` | Model response for multi-turn context |
| `tool` | Function call result in tool-calling loops |

The `content` field can be a plain string or an array of content parts (text, `image_url` for vision, etc.).

### Multi-Turn Conversation Pattern

```python
messages = [{"role": "system", "content": "You are a helpful assistant."}]

while True:
    user_input = input("You: ")
    messages.append({"role": "user", "content": user_input})

    response = client.chat.completions.create(model="gpt-4o", messages=messages)
    reply = response.choices[0].message
    messages.append({"role": "assistant", "content": reply.content})
    print(f"Assistant: {reply.content}")
```

## Key APIs (Summary)

### Response Format

```python
# JSON object (legacy — requires the word "JSON" somewhere in messages)
client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Return JSON with name, age, city"}],
    response_format={"type": "json_object"},
)

# JSON Schema (Structured Outputs)
client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "List 3 popular Python libraries"}],
    response_format={
        "type": "json_schema",
        "json_schema": {
            "name": "library_list",
            "schema": {
                "type": "object",
                "properties": {
                    "libraries": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "purpose": {"type": "string"},
                            },
                            "required": ["name", "purpose"],
                            "additionalProperties": False,
                        },
                    }
                },
                "required": ["libraries"],
                "additionalProperties": False,
            },
            "strict": True,
        },
    },
)
```

### Sampling Controls

```python
# Creative generation
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Write a poem"}],
    temperature=1.5,          # 0-2, higher = more random
    top_p=0.9,                # nucleus sampling threshold
    frequency_penalty=0.5,    # -2.0 to 2.0, penalize repetition
    presence_penalty=0.3,     # -2.0 to 2.0, penalize topic reuse
)

# Deterministic (best-effort)
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Generate a random color name"}],
    seed=42,                  # same seed + same system_fingerprint ≈ same output
    temperature=0,
)

# Constrained with stop sequences
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "List fruits: 1."}],
    stop=["\n", "4."],        # up to 4 stop sequences
    max_tokens=50,
)
```

**Critical**: Alter `temperature` OR `top_p` — not both at once per OpenAI recommendations.

### Token Limits

```python
# For standard models (GPT-4o, etc.)
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[...],
    max_tokens=500,
)

# For o-series reasoning models — MUST use max_completion_tokens
response = client.chat.completions.create(
    model="o3",
    messages=[...],
    max_completion_tokens=2000,  # NOT max_tokens — incompatible with o-series
)
```

### Reasoning Effort (o-series / GPT-5)

```python
response = client.chat.completions.create(
    model="gpt-5.2",
    messages=[{"role": "user", "content": "Solve this complex puzzle..."}],
    reasoning_effort="high",   # "none"|"minimal"|"low"|"medium"|"high"|"xhigh"
)
```

Availability depends on model. Lower effort = faster but less thorough. `gpt-5-pro` only supports `"high"`.

### Log Probabilities

```python
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Say hello world"}],
    logprobs=True,
    top_logprobs=5,            # 0–20, requires logprobs=True
)
# response.choices[0].logprobs.content[...].top_logprobs
```

### Multiple Choices

```python
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Suggest a startup idea"}],
    n=3,
)
for i, choice in enumerate(response.choices):
    print(f"Choice {i}: {choice.message.content}")
```

### Cross-Provider Chat (DeepSeek example)

```python
from openai import OpenAI

client = OpenAI(
    api_key="sk-your-deepseek-key",
    base_url="https://api.deepseek.com",
)

response = client.chat.completions.create(
    model="deepseek-v4-pro",             # or "deepseek-v4-flash"
    messages=[
        {"role": "system", "content": "You are a helpful assistant"},
        {"role": "user", "content": "Hello!"},
    ],
    extra_body={"thinking": {"type": "enabled"}},  # provider-specific params
)
```

Provider model names: **DeepSeek** (`deepseek-v4-flash`, `deepseek-v4-pro`), **Qwen** (`qwen-turbo`, `qwen-plus`, `qwen-max`), **Zhipu** (`glm-4-plus`, `glm-4-flash`).

## Caveats

- **`max_tokens` breaks on o-series models.** Always use `max_completion_tokens` for `o3`, `o4-mini`, and similar reasoning models.
- **`developer` > `system` for gpt-5.x.** New models prefer `developer` role for highest-priority instructions. Legacy `system` still works but may be less effective.
- **`functions` / `function_call` are deprecated.** Migrate to `tools` / `tool_choice`. Old params still accepted but subject to removal.
- **`user` parameter is deprecated.** Use `safety_identifier` for abuse detection and `prompt_cache_key` for prompt caching.
- **`response_format: json_object` needs "JSON" in your prompt.** If the messages don't mention JSON, the model may refuse or return non-JSON.
- **`seed` is best-effort, not guaranteed.** The `system_fingerprint` in the response tracks backend state. Same seed + same fingerprint ≈ reproducible output, but backend changes can break reproducibility.
- **Provider-specific params go in `extra_body`.** DeepSeek `thinking`, Qwen `enable_search`, etc. are not in the OpenAI schema. The SDK passes them through as-is.
- **`store=True` drops images >8MB** silently from stored completions.
- **Never pass Pydantic models directly to `response_format`.** For structured outputs with Pydantic, use `client.chat.completions.parse()` instead.

## Composition Hints

- Use with `openai-async-client` for async chat (`AsyncOpenAI().chat.completions.create(...)`).
- For streaming, set `stream=True` and use `openai-streaming` patterns.
- For tool calling, add `tools` and `tool_choice` — see `openai-tool-calling`.
- For structured outputs with Pydantic models, use `openai-structured-outputs` (the `parse()` method).
- For image inputs, use `image_url` content blocks — see `openai-vision`.
