---
name: claude-agent-sdk-ts-vs-python
description: Side-by-side comparison of TypeScript and Python Claude Agent SDKs — API differences, platform-exclusive features, naming conventions, and migration path from the old Claude Code SDK.
tech_stack: [claude-agent-sdk]
language: [typescript, python]
capability: [agent-orchestration, tool-calling]
version: "@anthropic-ai/claude-agent-sdk / claude-agent-sdk 0.1.0+"
collected_at: 2025-07-16
---

# Claude Agent SDK — TypeScript vs Python

> Source: https://code.claude.com/docs/en/agent-sdk/migration-guide, https://code.claude.com/docs/en/agent-sdk/python, https://code.claude.com/docs/en/agent-sdk/typescript, https://code.claude.com/docs/en/agent-sdk/typescript-v2-preview

## Purpose

Understand the key differences between the TypeScript and Python Claude Agent SDKs: API structure, naming conventions, platform-exclusive features, and the migration path from the old `claude-code` packages. Use this to choose the right SDK or bridge between the two.

## When to Use

- Deciding which language SDK fits your project
- Migrating from `@anthropic-ai/claude-code` or `claude-code-sdk`
- Writing cross-platform agent code that targets both TS and Python
- Understanding which features are only available in one SDK

## Basic Usage

### Migration: the rename

Before v0.1.0 the SDK was called "Claude Code SDK". Everything was renamed:

| Aspect | Old | New |
|--------|-----|-----|
| TS package | `@anthropic-ai/claude-code` | `@anthropic-ai/claude-agent-sdk` |
| Python package | `claude-code-sdk` | `claude-agent-sdk` |
| Python options | `ClaudeCodeOptions` | `ClaudeAgentOptions` |

```typescript
// TS migration
import { query } from "@anthropic-ai/claude-agent-sdk";  // was @anthropic-ai/claude-code
```

```python
# Python migration
from claude_agent_sdk import query, ClaudeAgentOptions  # was claude_code_sdk, ClaudeCodeOptions
```

### Breaking changes (v0.1.0+)

**1. System prompt**: No longer defaults to Claude Code's system prompt. To restore:
```typescript
// TS
options: { systemPrompt: { type: "preset", preset: "claude_code" } }
```
```python
# Python
ClaudeAgentOptions(system_prompt={"type": "preset", "preset": "claude_code"})
```

**2. Settings isolation**: Pass empty list to disable filesystem settings:
```typescript
options: { settingSources: [] }
```
```python
ClaudeAgentOptions(setting_sources=[])  # requires Python SDK >0.1.59
```

### Naming conventions: the universal rule

**TypeScript → camelCase. Python → snake_case.** Semantic meaning is identical across all fields:

| TS | Python |
|----|--------|
| `allowedTools` | `allowed_tools` |
| `mcpServers` | `mcp_servers` |
| `permissionMode` | `permission_mode` |
| `systemPrompt` | `system_prompt` |
| `maxTurns` | `max_turns` |
| `enableFileCheckpointing` | `enable_file_checkpointing` |

Same pattern for session info fields: TS `sessionId` → Python `session_id`, TS `lastModified` → Python `last_modified`, TS `customTitle` → Python `custom_title`, TS `gitBranch` → Python `git_branch`.

## Key APIs (Summary)

### `query()` — structural differences

| Aspect | TypeScript | Python |
|--------|-----------|--------|
| Return type | `Query` object (extends `AsyncGenerator` + ~20 methods) | `AsyncIterator[Message]` — bare iterator, no extra methods |
| Iteration | `for await (const msg of query(...))` | `async for msg in query(...)` |
| Control methods | On the `Query` object: `interrupt()`, `setModel()`, `mcpServerStatus()`, `setMcpServers()`, `close()`, etc. | Methods live on `ClaudeSDKClient` instead |
| Multi-turn | Via `resume`/`continue` in `Options`, or `streamInput()` on Query | Via dedicated `ClaudeSDKClient` class |

### Tool definition

| Aspect | TypeScript | Python |
|--------|-----------|--------|
| API | `tool()` function call | `@tool` decorator |
| Schema | Zod object → auto-typed handler args | Dict `{"name": str}` or full JSON Schema dict |
| Handler | `async ({ city }) => ...` (destructured, typed) | `async def fn(args: dict[str, Any]) -> ...` |
| Annotations | 5th arg: `{ annotations: { readOnlyHint: true } }` | kwarg: `annotations=ToolAnnotations(readOnlyHint=True)` |

### Session management — sync vs async

**Python session functions are synchronous** and return immediately. TypeScript equivalents return Promises:

| Function | TS (async) | Python (sync) |
|----------|-----------|---------------|
| List | `await listSessions({ dir, limit })` | `list_sessions(directory, limit)` |
| Messages | `await getSessionMessages(id, opts)` | `get_session_messages(id, directory)` |
| Info | `await getSessionInfo(id, opts)` | `get_session_info(id, directory)` |
| Rename | `await renameSession(id, title, opts)` | `rename_session(id, title, directory)` |
| Tag | `await tagSession(id, tag, opts)` | `tag_session(id, tag, directory)` |

### Multi-turn conversations — different approaches

**TypeScript**: Achieved through `resume` option, `continue` option, `streamInput()` on Query, or the V2 `createSession()` interface. No dedicated client class.

**Python**: Uses `ClaudeSDKClient` — a stateful class that maintains conversation context across `query()` calls:
```python
async with ClaudeSDKClient() as client:
    await client.query("First question")
    async for msg in client.receive_response():
        ...
    await client.query("Follow-up")  # context preserved
    async for msg in client.receive_response():
        ...
```

## Platform-Exclusive Features

### TypeScript only
- **`startup()` / `WarmQuery`**: Pre-warm the CLI subprocess. Call `startup()` early, then `.query()` later for zero-spawn-latency first prompt.
- **V2 preview** (`unstable_v2_createSession`, `unstable_v2_resumeSession`, `unstable_v2_prompt`): Simplified `send()`/`stream()` pattern replacing async generators. No Python equivalent.
- **`Query.setMcpServers()`**: Dynamically replace all MCP servers mid-session in one call.
- **Native binary bundling**: Platform binaries shipped as optional npm dependencies.
- **Additional hook events**: `SessionStart`, `SessionEnd`, `PostToolBatch`, `Setup`, `TeammateIdle`, `TaskCompleted`, `ConfigChange`, `WorktreeCreate`, `WorktreeRemove`.

### Python only
- **`ClaudeSDKClient`**: Stateful client with context manager (`async with`) for multi-turn conversations, interrupt handling, and lifecycle control.
- **`@tool` decorator**: More idiomatic Python pattern for defining tools vs TS's `tool()` function.
- **Synchronous session functions**: `list_sessions()`, `get_session_messages()`, etc. are blocking calls — simpler for scripts but can block the event loop.

## Caveats

- **Python `interrupt()` drain**: After `client.interrupt()`, the interrupted task's messages (including a `ResultMessage` with `subtype="error_during_execution"`) remain buffered. You **must** drain them with `receive_response()` before sending a new query, or you'll read stale messages.
- **Python `break` in async iteration**: Don't `break` out of `receive_response()` loops — causes asyncio cleanup issues. Use flags or let iteration complete.
- **Python `setting_sources=[]`**: Only works as isolation in SDK >0.1.59. Earlier versions treated empty list the same as omitting it.
- **V2 preview is unstable**: `unstable_v2_*` APIs may change. Session forking requires V1.
- **No `ClaudeSDKClient` in TS**: TS achieves multi-turn differently — via `resume`/`continue` options, `streamInput()`, or V2 sessions.
- **Type systems diverge**: TS uses Zod with full type inference in handlers. Python uses runtime dicts with no type inference — you cast/access by string key.

## Composition Hints

- **Choose TS if**: You need V2 preview, subprocess pre-warming, native binary bundling, or the rich `Query` object with in-line control methods.
- **Choose Python if**: You want `ClaudeSDKClient`'s clean multi-turn context manager pattern, the `@tool` decorator, or synchronous session management.
- **Cross-platform porting**: Map camelCase→snake_case mechanically. Beware the structural gap: TS `Query` methods live on `ClaudeSDKClient` in Python. Python `ClaudeSDKClient` context manager has no direct TS analog — use V2 `createSession()` or `resume` option.
- **System prompt parity**: Both SDKs use the same preset mechanism — `{ type: "preset", preset: "claude_code" }` works identically, just adjust the key naming convention.
