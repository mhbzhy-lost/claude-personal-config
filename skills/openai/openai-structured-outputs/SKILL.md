---
name: openai-structured-outputs
description: Use OpenAI's parse() and stream() with Pydantic models for type-safe structured JSON outputs from chat completions.
tech_stack: [openai]
language: [python]
capability: [llm-client, api-design]
version: "openai-python unversioned"
collected_at: 2026-01-12
---

# OpenAI Structured Outputs (parse / stream with Pydantic)

> Source: https://developers.openai.com/api/reference/python, https://deepwiki.com/openai/openai-python/4.1.3-parsed-responses-and-structured-outputs

## Purpose

Use `client.chat.completions.parse()` and `client.chat.completions.stream()` to get type-safe, Pydantic-validated structured outputs from chat completions — without manual JSON parsing. The API enforces `strict: true` JSON Schema generated automatically from your Pydantic models.

## When to Use

- Extracting structured data (entities, classifications, summaries) from LLM responses
- When you need validated, typed outputs — not raw JSON strings
- Building RAG or agent pipelines that consume structured intermediate results
- Streaming large structured outputs with incremental parsing
- Combining structured response format with tool calling in a single request

## Basic Usage

### Define a Pydantic model, pass it as `response_format`

```python
from pydantic import BaseModel
from openai import OpenAI

client = OpenAI()

class Location(BaseModel):
    city: str
    country: str
    lat: float | None = None
    lon: float | None = None

completion = client.chat.completions.parse(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": "Extract location information."},
        {"role": "user", "content": "I'm visiting Tokyo next month."},
    ],
    response_format=Location,
)

loc = completion.choices[0].message.parsed  # Location instance
# loc.city == "Tokyo", loc.country == "Japan"
```

### Streaming with incremental parsing

```python
with client.chat.completions.stream(
    model="gpt-4o",
    messages=[{"role": "user", "content": "List 5 countries and capitals"}],
    response_format=CountryList,
) as stream:
    for event in stream:
        if event.type == "content.delta":
            print(event.parsed)        # partial dict[str, Any]
        elif event.type == "content.done":
            result = event.parsed      # full CountryList instance

final = stream.get_final_completion()  # ParsedChatCompletion[CountryList]
```

## Key APIs (Summary)

| API | Returns | Use |
|---|---|---|
| `.parse(model, messages, response_format=Model)` | `ParsedChatCompletion[T]` | Non-streaming structured output |
| `.stream(model, messages, response_format=Model)` | streaming context manager | Streaming structured output |
| `completion.choices[0].message.parsed` | `T` (Pydantic instance) | Access deserialized result |
| `completion.choices[0].message.refusal` | `str \| None` | Set if model refused (safety) |
| `openai.pydantic_function_tool(Model)` | tool definition dict | Convert Pydantic model to tool schema |
| `tool_call.function.parsed_arguments` | Pydantic instance | Parsed tool arguments (when using `.parse()` with tools) |

### Supported model features

- **Discriminated unions**: `Union[Cat, Dog]` with a `Literal["cat", "dog"]` discriminator field
- **Pydantic dataclasses** (v2 only): `@pydantic.dataclasses.dataclass`
- **Enums**: `class Sentiment(str, Enum)` with `Field(description=...)`
- **Nested models and lists**: `list[Ingredient]`, arbitrary nesting
- **Optional fields with defaults**: `age: int | None = None`, `tags: list[str] = []`

### parse() vs create()

| | `.parse()` | `.create()` |
|---|---|---|
| Return type | `ParsedChatCompletion[T]` | `ChatCompletion` |
| Parsed access | `message.parsed` (typed) | Manual `json.loads()` |
| Schema | Auto from Pydantic model | Manual `response_format` dict |
| Validation | Automatic | You do it |

## Caveats

- **LengthFinishReasonError**: Raised when `max_tokens` is reached before JSON completes. Handle this in both streaming and non-streaming modes — increase `max_tokens` or simplify the schema.
- **Refusals**: The model may refuse to respond (safety). Check `message.refusal` — it will be populated instead of `parsed`. In streaming, a `refusal.done` event is emitted.
- **Strict mode is always on**: All fields must be present (unless optional with defaults); extra fields are rejected. This can cause failures if your schema doesn't match expected output.
- **Pydantic v2 required for dataclasses**: Pydantic dataclasses only work with Pydantic v2. The SDK internally uses `construct()` (loose coercion) not `validate()` (strict).
- **`n > 1`**: Each choice is independently parsed. `choices[0].message.parsed`, `choices[1].message.parsed` etc. may differ.
- **No response_format = parsed is None**: Calling `.parse()` without `response_format` returns `ParsedChatCompletion[NoneType]` — only useful when you want parsed tool calls without a structured response body.
- **Cross-provider**: The `parse()` method is an OpenAI SDK feature. When using alternative providers (DeepSeek, Qwen, Zhipu) via `base_url`, structured output behavior depends on whether the provider supports `response_format` with `json_schema` + `strict: true`. Most do not support the full `parse()` convenience; fall back to `create()` with manual `response_format={"type": "json_object"}` and manual parsing.

## Composition Hints

- **With tool calling**: Use `.parse()` with both `response_format` and `tools`. `message.parsed` gets the structured body; `tool_calls[].function.parsed_arguments` gets parsed tool parameters.
- **With async**: Use `AsyncOpenAI` — `.parse()` and `.stream()` both work identically with `await`.
- **Serializing results**: Parsed models inherit Pydantic's `.to_json()` and `.to_dict()`.
- **If the model struggles with complex schemas**: Simplify the Pydantic model (fewer fields, flatter structure) or increase `max_tokens`.
