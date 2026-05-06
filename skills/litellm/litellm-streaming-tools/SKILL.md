---
name: litellm-streaming-tools
description: Unified streaming and tool/function calling across LLM providers — stream=True, acompletion, tool_choice, parallel function calling, and capability checks.
tech_stack: [litellm]
language: [python]
capability: [tool-calling, llm-client]
version: "LiteLLM unversioned"
collected_at: 2025-01-01
---

# LiteLLM Streaming & Tool Calling

> Source: https://docs.litellm.ai/stream, https://docs.litellm.ai/docs/completion/function_call

## Purpose

Unified streaming and tool/function calling across all supported LLM providers. LiteLLM normalizes provider differences behind an OpenAI-compatible API: `stream=True` for sync/async streaming, `stream_options={"include_usage": True}` for token usage in streams, `tools` + `tool_choice` for function calling, and runtime capability checks (`supports_function_calling`, `supports_parallel_function_calling`).

## When to Use

- Stream LLM responses to users for real-time UX (sync or async)
- Implement tool calling that works across OpenAI, Anthropic, Azure, Grok, and other providers
- Check model capabilities at runtime before sending tools
- Handle parallel function calls (multiple tool invocations per response)
- Convert Python functions to tool schemas automatically with `function_to_dict()`
- Enable tool calling on models without native support via `add_function_to_prompt`

## Basic Usage

### Synchronous Streaming

```python
from litellm import completion

response = completion(
    model="gpt-3.5-turbo",
    messages=[{"role": "user", "content": "Hello"}],
    stream=True
)
for chunk in response:
    print(chunk['choices'][0]['delta'])
```

### Async Streaming

```python
from litellm import acompletion
import asyncio

async def stream_response():
    response = await acompletion(
        model="gpt-3.5-turbo",
        messages=[{"role": "user", "content": "Hello"}],
        stream=True
    )
    async for chunk in response:
        print(chunk['choices'][0]['delta'])

asyncio.run(stream_response())
```

### Streaming with Token Usage

```python
response = completion(
    model="gpt-3.5-turbo",
    messages=messages,
    stream=True,
    stream_options={"include_usage": True}
)
# Final chunk before [DONE] has usage field with token counts; choices is empty
```

### Tool Calling

```python
tools = [{
    "type": "function",
    "function": {
        "name": "get_current_weather",
        "description": "Get the current weather in a given location",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {"type": "string", "description": "City, e.g. San Francisco, CA"},
                "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}
            },
            "required": ["location"]
        }
    }
}]

response = completion(
    model="gpt-3.5-turbo",
    messages=[{"role": "user", "content": "What's the weather in Boston?"}],
    tools=tools,
    tool_choice="auto"
)

tool_calls = response.choices[0].message.tool_calls
```

### Parallel Function Calling (Full Loop)

```python
response = completion(
    model="gpt-3.5-turbo-1106",
    messages=[{"role": "user", "content": "Weather in SF, Tokyo, and Paris?"}],
    tools=tools,
    tool_choice="auto"
)

response_message = response.choices[0].message
tool_calls = response_message.tool_calls  # may have 3 entries

if tool_calls:
    messages.append(response_message)
    for tc in tool_calls:
        args = json.loads(tc.function.arguments)
        result = your_function(**args)
        messages.append({
            "tool_call_id": tc.id, "role": "tool",
            "name": tc.function.name, "content": str(result)
        })

    final = completion(model="gpt-3.5-turbo-1106", messages=messages)
    print(final.choices[0].message.content)
```

## Key APIs (Summary)

### Streaming

| API | Description |
|-----|-------------|
| `completion(stream=True)` | Sync streaming — iterate chunks with `for` |
| `acompletion(stream=True)` | Async streaming — iterate with `async for` |
| `stream_options={"include_usage": True}` | Final chunk before `[DONE]` has `usage` field with token counts |

### Capability Checks

```python
litellm.supports_function_calling(model="gpt-3.5-turbo")          # True
litellm.supports_function_calling(model="ollama/llama2")           # False
litellm.supports_parallel_function_calling(model="gpt-4-turbo")    # True
litellm.supports_parallel_function_calling(model="gpt-4")          # False
```

### Tool Choice Values

| Value | Behavior |
|-------|----------|
| `"auto"` | Model decides (default) |
| `"none"` | No tool calls |
| `"required"` | Must call at least one tool |
| `{"type": "function", "function": {"name": "x"}}` | Force specific function |

### `function_to_dict()`

Converts a Python function with numpy-style docstring to an OpenAI tool dict:

```python
from litellm.utils import function_to_dict

def get_weather(location: str, unit: str):
    """Get current weather.

    Parameters
    ----------
    location : str
        City and state, e.g. San Francisco, CA
    unit : {'celsius', 'fahrenheit'}
        Temperature unit
    """
    ...

tool_dict = function_to_dict(get_weather)
# → {"name": "get_weather", "description": "...", "parameters": {...}}
```

### `add_function_to_prompt` (No Native Support)

```python
litellm.add_function_to_prompt = True

response = completion(
    model="claude-2",          # model without native tool calling
    messages=[{"role": "user", "content": "What is the weather in Boston?"}],
    functions=functions        # injected into system prompt as text
)
```

## Caveats

- **Check capabilities first**: Sending `tools` to a model that doesn't support function calling may error. Always gate with `supports_function_calling()`.
- **Not all function-calling models support parallel calls**: `gpt-4` supports single tool calls but not parallel — check with `supports_parallel_function_calling()`.
- **`stream_options={"include_usage": True}`**: Adds a final chunk with `usage` and empty `choices`. All preceding chunks have `usage: null`.
- **`add_function_to_prompt`** returns plain text, not structured `tool_calls`. You must parse the function call from the response text — no `tool_call_id` or structured args.
- **Tool call JSON may be malformed**: Wrap `json.loads(tc.function.arguments)` in try/except.
- **Streaming tool calls**: Arguments arrive incrementally across chunks. Accumulate deltas to reconstruct the full JSON before parsing.
- **Prefer `tools=` over deprecated `functions=`** for forward compatibility (OpenAI legacy format still works).

## Composition Hints

- **Streaming pattern**: Always use `acompletion` with `async for` in async code. Use `completion` with `for` in sync code. Both return identical chunk structures.
- **Tool loop pattern**: (1) Send messages + tools → (2) Check `response.choices[0].message.tool_calls` → (3) Execute functions, append results as `{"role": "tool", ...}` → (4) Send back to model for final response.
- **Parallel tool calls**: When `tool_calls` has multiple entries, execute all functions and append all results before the second completion call. The model expects all tool results before responding.
- **Runtime capability gating**: Use `supports_function_calling()` to branch between native tool calling and `add_function_to_prompt` fallback.
- **Schema generation**: Use `function_to_dict()` for rapid prototyping — it extracts name, description, parameters, and required fields from Python docstrings. For production, prefer explicit tool dicts for full control.
