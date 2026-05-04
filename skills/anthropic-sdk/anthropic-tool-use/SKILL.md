---
name: anthropic-tool-use
description: Anthropic Tool Use (function calling) — tool definition schema, tool_choice control, parallel tool execution, streaming tool events, and the complete tool loop pattern.
tech_stack: [claude-code]
language: [python]
capability: [tool-calling, llm-client, api-design]
version: "Anthropic API unversioned"
collected_at: 2025-07-01
---

# Tool Use (Function Calling)

> Source: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview, https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools, https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use, https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming

## Purpose

Tool Use (function calling) enables Claude to interact with external tools, APIs, and functions. Claude decides *when* to call a tool, *which* tool to call, and *what arguments* to pass — your code executes the function and returns results. This is the foundation for building Claude-powered agents.

## When to Use

- Giving Claude access to external APIs (weather, database, search, etc.).
- Structured data extraction where Claude chooses the right function with typed parameters.
- Multi-step workflows where Claude orchestrates a sequence of tool calls.
- Building agents that need side-effect execution (sending email, creating tickets, querying APIs).
- When you need deterministic output — `input_schema` enforces a JSON Schema contract.

## Basic Usage

### Tool Definition

```python
tools = [{
    "name": "get_weather",
    "description": "Get current weather for a location.",
    "input_schema": {
        "type": "object",
        "properties": {
            "location": {
                "type": "string",
                "description": "City and state, e.g. San Francisco, CA"
            },
            "unit": {
                "type": "string",
                "enum": ["celsius", "fahrenheit"]
            }
        },
        "required": ["location"]
    }
}]
```

- `name`: unique identifier, `^[a-zA-Z0-9_-]{1,64}$`
- `description`: guides Claude's tool selection — be specific about *when* to use
- `input_schema`: standard JSON Schema (draft 2020-12); `type: "object"`, `properties`, `required`

### The Tool Loop (Complete Pattern)

```python
import anthropic

client = anthropic.Anthropic()

def execute_tool(name: str, input: dict) -> str:
    # Your actual implementation
    if name == "get_weather":
        return f"Sunny, 22°C in {input['location']}"
    return f"Unknown tool: {name}"

def run_with_tools(user_input: str, tools: list) -> str:
    messages = [{"role": "user", "content": user_input}]

    while True:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            tools=tools,
            messages=messages,
        )

        if response.stop_reason == "end_turn":
            return response.content[0].text

        # stop_reason == "tool_use"
        messages.append({"role": "assistant", "content": response.content})

        tool_results = []
        for block in response.content:
            if block.type == "tool_use":
                result = execute_tool(block.name, block.input)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": str(result),
                })

        messages.append({"role": "user", "content": tool_results})
```

**Loop contract**: check `stop_reason` → extract `tool_use` blocks → execute → send `tool_result` → repeat until `"end_turn"`.

## Key APIs (Summary)

### `tool_choice` — Controlling Tool Selection

| Value | Behavior |
|-------|----------|
| `"auto"` (default) | Claude freely decides: text or tool |
| `"any"` | Claude MUST use a tool |
| `{"type": "tool", "name": "X"}` | Force a specific tool |
| omitted entirely | Text-only, no tools |

```python
# Force a specific tool
response = client.messages.create(
    model="claude-sonnet-4-6", max_tokens=1024,
    tools=[weather_tool, search_tool],
    tool_choice={"type": "tool", "name": "get_weather"},
    messages=[{"role": "user", "content": "Weather in Paris?"}],
)

# Disable parallel tool use
tool_choice={"type": "auto", "disable_parallel_tool_use": True}
```

### Parallel Tool Use

Claude can return multiple `tool_use` blocks in a single response when tools are independent.

**Critical rule**: all `tool_result` blocks for a given assistant turn MUST be returned together in a single user message:

```python
# Correct — parallel results in one message:
messages.append({"role": "user", "content": [
    {"type": "tool_result", "tool_use_id": "toolu_01", "content": "..."},
    {"type": "tool_result", "tool_use_id": "toolu_02", "content": "..."},
]})

# WRONG — splitting across messages breaks the protocol
```

Disable parallel tools when: tools have ordering dependencies, side effects must be sequenced, or safety requires step-by-step.

### Streaming Tool Events

```python
with client.messages.stream(
    model="claude-sonnet-4-6", max_tokens=1024,
    tools=tools,
    messages=[{"role": "user", "content": "Weather in Paris and London?"}],
) as stream:
    tool_inputs = {}
    for event in stream:
        if event.type == "content_block_start":
            if event.content_block.type == "tool_use":
                tool_inputs[event.content_block.id] = {
                    "name": event.content_block.name, "json": ""
                }
        elif event.type == "content_block_delta":
            if event.delta.type == "input_json_delta":
                tool_inputs[event.content_block.id]["json"] += event.delta.partial_json
        elif event.type == "content_block_stop":
            pass  # input complete; parse accumulated JSON

    final = stream.get_final_message()
```

**Streaming event sequence for tool use**:
- `content_block_start` (has `id` + `name`) → `content_block_delta` (`.delta.type == "input_json_delta"`, `.delta.partial_json`) → `content_block_stop`

**Key**: accumulate `partial_json` across deltas before parsing. Each delta is a fragment, not valid standalone JSON.

### Message History Format

```
user: "What's the weather?"
assistant: [{type:"text",...}, {type:"tool_use", id:"toolu_01", name:"get_weather", input:{...}}]
user: [{type:"tool_result", tool_use_id:"toolu_01", content:"Sunny, 22°C"}]
assistant: "It's sunny and 22°C in Paris."
```

### Content Block Types

**`tool_use`** (from Claude):
```json
{"type": "tool_use", "id": "toolu_01AbCd...", "name": "get_weather", "input": {"location": "Paris"}}
```

**`tool_result`** (sent to Claude):
```json
{"type": "tool_result", "tool_use_id": "toolu_01AbCd...", "content": "Sunny, 22°C"}
```

## Caveats

- **`tool_use_id` must match exactly**: every `tool_result` must reference the exact `id` from the corresponding `tool_use`. Mismatch = error.
- **Parallel results go in one message**: never split parallel `tool_result` blocks across multiple user messages.
- **`stop_reason == "tool_use"`**: content may contain BOTH text and `tool_use` blocks. Always check `stop_reason`, don't assume pure tool use.
- **Streaming tool input is partial JSON**: accumulate `partial_json` across all deltas before `json.loads()`. Each delta alone is invalid JSON.
- **`input_schema` must be valid JSON Schema**: malformed schemas cause API errors at request time.
- **Tool names must be unique** within a single request. Duplicates = undefined behavior.
- **Dependent tools → disable parallel**: if tool B needs tool A's output, set `disable_parallel_tool_use: true`.
- **`max_tokens` caps tool input**: large tool input JSON needs sufficient `max_tokens`; hitting the limit truncates the tool call.
- **Forgetting `tools` parameter**: Claude cannot call any tools if you omit it — even if prior turns had tools.

## Composition Hints

- **Pair with `anthropic-messages-api`** for the full request/response lifecycle — Messages API provides the transport, Tool Use provides the action layer.
- **Pair with `anthropic-prompt-caching`** to cache tool definitions and system prompts across repeated tool-use conversations.
- **For agent architectures**: use `tool_choice="any"` or `{"type": "tool", "name": "X"}` for deterministic agent steps; use `"auto"` for flexible conversational agents.
- **For production agents**: implement a max iteration cap on the tool loop to prevent infinite loops; log `stop_reason` on every turn for debugging.
- **Streaming UI**: use fine-grained tool streaming (`input_json_delta` events) to show real-time parameter filling in your UI as Claude constructs tool calls.
