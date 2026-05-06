---
name: openai-tool-calling
description: Use OpenAI function/tool calling with multi-turn loops, tool_choice strategies, parallel calls, Pydantic integration, and cross-provider compatibility.
tech_stack: [openai]
language: [python]
capability: [tool-calling, llm-client]
version: "openai-python unversioned (indexed 2026-01-12)"
collected_at: 2026-01-12
---

# OpenAI Tool Calling (Function Calling)

> Source: https://github.com/openai/openai-python/blob/main/README.md?plain=1, https://deepwiki.com/openai/openai-python/4.1.1-parameters-and-configuration, https://deepwiki.com/openai/openai-python/4.1.3-parsed-responses-and-structured-outputs

## Purpose

Enable models to request execution of external functions by emitting structured JSON (name + arguments). The developer executes the function and returns results in a `tool` role message, enabling the model to interact with APIs, databases, code executors, and other systems through a multi-turn conversation loop.

## When to Use

- External API calls (weather, search, stock prices)
- Database queries where the model decides parameters
- Code execution in sandboxes
- Multi-step agent workflows with chained tool calls
- Any scenario where the model needs to take action beyond text generation

Do NOT use tool calling for: simple classification (use structured outputs), output formatting (use `response_format`), or deterministic parsing.

## Basic Usage

### Defining Tools

```python
tools = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "Get current weather for a location",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "City, e.g. 'Tokyo, Japan'"
                },
                "unit": {
                    "type": "string",
                    "enum": ["celsius", "fahrenheit"]
                }
            },
            "required": ["location"]
        }
    }
}]
```

### The Multi-Turn Tool Loop (canonical pattern)

```python
import json
from openai import OpenAI

client = OpenAI()

def get_weather(location: str, unit: str = "celsius") -> str:
    return f"Sunny, 22°C in {location}"

tools = [{"type": "function", "function": {
    "name": "get_weather",
    "description": "Get current weather",
    "parameters": {
        "type": "object",
        "properties": {
            "location": {"type": "string"},
            "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}
        },
        "required": ["location"]
    }
}}]

messages = [{"role": "user", "content": "Weather in Tokyo and Paris?"}]
max_iterations = 10

for _ in range(max_iterations):
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        tools=tools,
    )
    msg = response.choices[0].message

    if not msg.tool_calls:  # model is done
        print(msg.content)
        break

    # Append assistant message with tool_calls
    messages.append(msg)

    # Execute each tool call and append results
    for tc in msg.tool_calls:
        args = json.loads(tc.function.arguments)
        result = get_weather(**args)
        messages.append({
            "role": "tool",
            "tool_call_id": tc.id,
            "content": result,
        })
```

### Tool Choice Control

```python
# Let model decide (default when tools provided)
tool_choice="auto"

# Force model to call at least one tool
tool_choice="required"

# Prevent tool calls
tool_choice="none"

# Force a specific tool
tool_choice={"type": "function", "function": {"name": "get_weather"}}

# Disable parallel calls (only one tool per response)
client.chat.completions.create(..., parallel_tool_calls=False)
```

### Pydantic Function Tools

```python
from openai import pydantic_function_tool
from pydantic import BaseModel

class WeatherParams(BaseModel):
    """Get current weather for a location."""
    location: str
    unit: str = "celsius"

tools = [pydantic_function_tool(WeatherParams, name="get_weather")]
# Auto-generates JSON Schema from Pydantic fields
```

## Key APIs (Summary)

### Creating a tool-calling request

```python
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[...],
    tools=[...],                         # max 128 tools
    tool_choice="auto",                  # "none"|"auto"|"required"|dict
    parallel_tool_calls=True,            # allow multiple tool calls per response
)
```

### Inspecting the response

```python
msg = response.choices[0].message

msg.content           # str | None — often None when tool_calls present
msg.tool_calls        # List[ParsedFunctionToolCall] | None
msg.tool_calls[0].id  # str — must be referenced in tool result message
msg.tool_calls[0].function.name       # str
msg.tool_calls[0].function.arguments  # str — JSON, use json.loads()
```

### Tool result message format

```python
{
    "role": "tool",
    "tool_call_id": "<id from msg.tool_calls[0].id>",
    "content": "<result string>"
}
```

### Async variant

```python
from openai import AsyncOpenAI

response = await client.chat.completions.create(
    model="gpt-4o", messages=messages, tools=tools
)
# Same loop pattern, with `await`
```

## Caveats

### Tool Call ID Matching is Mandatory
Each `tool` role message MUST reference the correct `tool_call_id`. Missing or mismatched IDs cause API errors or model confusion, especially with parallel calls.

### message.content is Often None
When `msg.tool_calls` is non-empty, `msg.content` is typically `None`. Always check `tool_calls` before reading content.

### Loop Safety
Always guard multi-turn loops with `max_iterations` (e.g., 10) to prevent infinite loops if the model never converges.

### Never Use Deprecated `functions` / `function_call`
Use `tools` and `tool_choice` exclusively. The old parameters lack `parallel_tool_calls` support.

### Streaming Tool Calls
In streaming mode, tool calls arrive as `tool_calls.delta` events (incremental fragments). Wait for `tool_calls.done` to get the fully parsed `ParsedFunctionToolCall`. Never try to parse partial JSON from deltas.

### Tool Description Quality Matters
Poor descriptions are the #1 cause of incorrect tool selection. Write specific descriptions with parameter examples. JSON Schema `enum` constraints are respected by the model.

### Cross-Provider Tool Calling

| Provider | Support | base_url | Notes |
|---|---|---|---|
| **DeepSeek** | ✅ | `https://api.deepseek.com/v1` | `deepseek-chat` model; `auto`/`none`/`required` supported |
| **Qwen (DashScope)** | ✅ | `https://dashscope.aliyuncs.com/compatible-mode/v1` | Some `tool_choice` values may be unsupported |
| **Zhipu (GLM)** | ✅ | `https://open.bigmodel.cn/api/paas/v4/` | `glm-4`+ models; `parallel_tool_calls` may not work on all |

### Combining Tools + Structured Outputs
When both `tools` and `response_format` are specified, the model chooses: it either calls tools (check `msg.tool_calls`) or returns structured output (check `msg.parsed`). Handle both branches.

## Composition Hints

- **With streaming**: Use streaming to detect `tool_calls.done` events, then switch to non-streaming for the follow-up call with tool results.
- **With structured outputs**: Combine `tools` + `response_format` for agents that can either act (tool calls) or extract data (structured output) depending on the prompt.
- **Agent frameworks**: Build autonomous agents by wrapping the tool loop in a while-tool_calls loop with a max iteration guard and function registry dict.
- **Parallel execution**: When `parallel_tool_calls=True`, execute all tool calls concurrently (e.g., `asyncio.gather`) and return all results in one batch of `tool` messages.
