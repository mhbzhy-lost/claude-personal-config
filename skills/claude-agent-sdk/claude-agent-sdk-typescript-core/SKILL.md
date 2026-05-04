---
name: claude-agent-sdk-typescript-core
description: Core TypeScript SDK for Claude Agent — query(), permissions, hooks, session management, and initialization patterns.
tech_stack: [claude-code]
language: [typescript]
capability: [agent-orchestration, tool-calling, permission]
version: "@anthropic-ai/claude-agent-sdk (docs reference v0.2.111+)"
collected_at: 2025-01-01
---

# Claude Agent SDK — TypeScript Core

> Source: https://code.claude.com/docs/en/agent-sdk/typescript, https://code.claude.com/docs/en/agent-sdk/overview, https://code.claude.com/docs/en/agent-sdk/hooks, https://code.claude.com/docs/en/agent-sdk/permissions, https://code.claude.com/docs/en/agent-sdk/sessions

## Purpose

The `@anthropic-ai/claude-agent-sdk` provides a programmatic interface for building AI agents in TypeScript that autonomously read files, run commands, search the web, and edit code. It bundles a native Claude Code binary and exposes an async-generator-based `query()` function that streams `SDKMessage` events. The SDK includes built-in tools (Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, AskUserQuestion), a hooks system, layered permissions, and session persistence.

## When to Use

- Autonomous code analysis, editing, shell execution in custom TypeScript apps
- CI/CD pipelines requiring agent-driven automation
- Multi-turn conversations with session resume/fork
- When you need the full agent loop (tool calling + context management) without implementing it yourself
- Production automation where the agent runs inside your own process

## Basic Usage

```bash
npm install @anthropic-ai/claude-agent-sdk
```

The SDK bundles a native Claude Code binary as an optional dependency per platform. If skipped, set `pathToClaudeCodeExecutable` to a separately installed `claude` binary.

### Minimal agent

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "What files are in this directory?",
  options: { allowedTools: ["Bash", "Glob"] }
})) {
  if (message.type === "result" && message.subtype === "success") {
    console.log(message.result);
  }
}
```

### Pre-warming with `startup()`

Eliminates cold-start latency by spawning the CLI subprocess early:

```typescript
import { startup } from "@anthropic-ai/claude-agent-sdk";

const warm = await startup({ options: { maxTurns: 3 } });
// Later, when prompt is ready — no spawn delay
for await (const msg of warm.query("What files are here?")) {
  console.log(msg);
}
```

`WarmQuery` implements `AsyncDisposable` — usable with `await using` for automatic cleanup. `query()` can only be called once per `WarmQuery`.

### Multi-turn with `continue: true`

TypeScript has no session-holding client object like Python's `ClaudeSDKClient`. Instead, use `continue: true` to resume the most recent session in the current directory:

```typescript
// First query: creates new session
for await (const msg of query({
  prompt: "Analyze the auth module",
  options: { allowedTools: ["Read", "Glob", "Grep"] }
})) { /* ... */ }

// Second query: continues same session
for await (const msg of query({
  prompt: "Now refactor it to use JWT",
  options: { continue: true, allowedTools: ["Read", "Edit", "Write"] }
})) { /* ... */ }
```

### Session resume by ID

```typescript
let sessionId: string | undefined;
for await (const msg of query({
  prompt: "Analyze auth module",
  options: { allowedTools: ["Read", "Glob", "Grep"] }
})) {
  if ("session_id" in msg) sessionId = msg.session_id;
}

// Resume later (even after process restart)
for await (const msg of query({
  prompt: "Now implement the refactoring",
  options: { resume: sessionId, allowedTools: ["Read", "Edit", "Write"] }
})) { /* ... */ }
```

### Fork to explore alternatives

```typescript
for await (const msg of query({
  prompt: "Instead of JWT, implement OAuth2",
  options: { resume: sessionId, forkSession: true }
})) { /* gets new session ID; original unchanged */ }
```

## Key APIs (Summary)

### `query()` signature

```typescript
function query({ prompt, options }: {
  prompt: string | AsyncIterable<SDKUserMessage>;
  options?: Options;
}): Query;  // extends AsyncGenerator<SDKMessage, void>
```

### `Query` object — key methods

| Method | Use |
|--------|-----|
| `interrupt()` | Cancel mid-query (streaming input mode only) |
| `setPermissionMode(mode)` | Change permission mode mid-session |
| `setModel(model?)` | Switch models mid-session |
| `streamInput(stream)` | Multi-turn via streaming input |
| `stopTask(taskId)` | Stop a background task |
| `mcpServerStatus()` | Status of connected MCP servers |
| `reconnectMcpServer(name)` | Reconnect an MCP server |
| `toggleMcpServer(name, enabled)` | Enable/disable an MCP server |
| `setMcpServers(servers)` | Replace all MCP servers dynamically |
| `rewindFiles(userMessageId)` | Revert files to earlier state (needs `enableFileCheckpointing`) |
| `close()` | Terminate underlying process |

### `Options` — most-used fields

| Field | Purpose |
|-------|---------|
| `allowedTools` | Auto-approve these tools. Does NOT restrict — unlisted tools fall through to `permissionMode`/`canUseTool` |
| `disallowedTools` | Always deny. Checked first; overrides even `bypassPermissions` |
| `permissionMode` | `"default"` / `"dontAsk"` / `"acceptEdits"` / `"bypassPermissions"` / `"plan"` / `"auto"` (TS only) |
| `canUseTool` | Custom permission callback for runtime decisions |
| `maxTurns` | Cap agentic turns (tool-use round trips) |
| `maxBudgetUsd` | Stop when client-side cost estimate reaches this USD |
| `hooks` | Register hook callbacks by event type |
| `agents` | Programmatic subagent definitions |
| `mcpServers` | MCP server configurations |
| `systemPrompt` | Custom string or `{ type: 'preset', preset: 'claude_code' }` for CLI-like behavior |
| `settingSources` | Pass `[]` to disable user/project/local settings |
| `resume` / `forkSession` | Session continuation |
| `continue` | Resume most recent session in cwd |
| `persistSession` | `false` = no disk writes (TS only) |
| `model` / `fallbackModel` | Model selection |
| `thinking` | `{ type: 'adaptive' }` (default for supported models) |
| `outputFormat` | `{ type: 'json_schema', schema: ... }` for structured outputs |
| `env` | Environment variables; set `CLAUDE_AGENT_SDK_CLIENT_APP` for User-Agent |

### Session management functions

```typescript
listSessions({ dir?, limit?, includeWorktrees? }): Promise<SDKSessionInfo[]>
getSessionMessages(sessionId, { dir?, limit?, offset? }): Promise<SessionMessage[]>
getSessionInfo(sessionId, { dir? }): Promise<SDKSessionInfo | undefined>
renameSession(sessionId, title, { dir? }): Promise<void>
tagSession(sessionId, tag, { dir? }): Promise<void>    // tag=null to clear
```

### `tool()` — type-safe MCP tool definition

```typescript
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const myTool = tool("search", "Search the web",
  { query: z.string() },
  async ({ query }) => ({
    content: [{ type: "text", text: `Results for: ${query}` }]
  }),
  { annotations: { readOnlyHint: true, openWorldHint: true } }
);
```

Supports Zod 3 and Zod 4. Annotation hints: `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`.

### `createSdkMcpServer()` — in-process MCP server

```typescript
createSdkMcpServer({ name, version?, tools? }): McpSdkServerConfigWithInstance
```

## Hooks System

Hooks are callbacks that intercept agent lifecycle events — block, modify, or audit operations.

### Registering hooks

```typescript
options: {
  hooks: {
    "PreToolUse": [{ matcher: "Bash", hooks: [myCallback], timeout: 60 }]
  }
}
```

- `matcher`: regex against tool name (`"Write|Edit"`, `"^mcp__"`, or omit for all)
- `hooks`: array of callback functions (executed in order)
- `timeout`: seconds (default 60)

### Callback signature

```typescript
(input: HookInput, toolUseID: string | undefined, context: { signal: AbortSignal }) =>
  HookOutput
```

All inputs share: `session_id`, `cwd`, `hook_event_name`. Subagent context adds `agent_id`, `agent_type`.

### Output decisions

```typescript
// Allow unchanged
return {};

// Deny
return { hookSpecificOutput: {
  hookEventName: "PreToolUse",
  permissionDecision: "deny",
  permissionDecisionReason: "reason..."
}};

// Modify and allow
return { hookSpecificOutput: {
  hookEventName: "PreToolUse",
  permissionDecision: "allow",
  updatedInput: { ...input.tool_input, file_path: "/sandbox" + path }
}};

// Inject context + deny
return {
  systemMessage: "Remember: /etc is protected.",
  hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", ... }
};
```

**Priority:** `deny` > `defer` (TS only) > `ask` > `allow`. Any single `deny` blocks the operation.

**Async hooks** (fire-and-forget for logging/metrics):
```typescript
return { async: true, asyncTimeout: 30000 };  // cannot block/modify
```

### Key hook events

| Event | Trigger |
|-------|---------|
| `PreToolUse` | Before tool executes (block/modify allowed) |
| `PostToolUse` | After tool returns (add context / replace output) |
| `PostToolUseFailure` | Tool execution failed |
| `PostToolBatch` | Batch of tools resolved (TS only) |
| `UserPromptSubmit` | User prompt submitted (inject context) |
| `Stop` | Agent execution ending |
| `SubagentStart` / `SubagentStop` | Subagent lifecycle |
| `SessionStart` / `SessionEnd` | Session lifecycle (TS only) |
| `Notification` | Agent status updates |
| `PermissionRequest` | Permission dialog would display |

## Permissions System

### Evaluation order (fixed)

1. **Hooks** → can allow/deny/continue
2. **Deny rules** (`disallowedTools` + settings.json) → blocks even in `bypassPermissions`
3. **Permission mode** → `bypassPermissions` approves everything; `acceptEdits` approves file ops
4. **Allow rules** (`allowedTools` + settings.json) → pre-approve matching tools
5. **`canUseTool` callback** → final runtime decision (skipped in `dontAsk`)

### Permission modes

| Mode | Behavior |
|------|----------|
| `default` | No auto-approvals; unmatched → `canUseTool` |
| `dontAsk` | Deny unapproved; `canUseTool` never called |
| `acceptEdits` | Auto-approve Edit/Write + filesystem commands within working dir |
| `bypassPermissions` | All tools approved (hooks + deny rules still apply) |
| `plan` | No tool execution; plan only |
| `auto` (TS only) | Model classifier decides |

### Critical rules

- `allowedTools` does **not** restrict — it only pre-approves. Unlisted tools fall through.
- `bypassPermissions` is **not** constrained by `allowedTools` — use `disallowedTools` to block.
- `allowedTools` + `permissionMode: "dontAsk"` = locked-down agent (only listed tools, everything else denied).
- Subagents inherit `bypassPermissions`/`acceptEdits`/`auto` from parent and **cannot override**.

## Caveats

- **Opus 4.7 requires SDK ≥ v0.2.111** — older versions throw `thinking.type.enabled` API error
- **`systemPrompt` default is minimal** (not Claude Code preset) — use `{ type: 'preset', preset: 'claude_code' }` for full CLI behavior
- **`cwd` must match for resume** — mismatched cwd looks in wrong session directory; sessions stored under `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`
- **Session ≠ filesystem snapshot** — `forkSession` copies conversation only; use `enableFileCheckpointing` + `rewindFiles()` for file revert
- **Hooks may not fire at `maxTurns` limit` — session ends before hooks execute
- **`updatedInput` requires `permissionDecision: 'allow'`** — always return new object, never mutate original
- **Matchers filter by tool name only** — for file path filtering, check inside callback
- **Async hooks can't influence agent behavior** — use only for side effects (logging, metrics, notifications)
- **`persistSession: false` is TS-only** — Python always persists
- **`defer` permission decision is TS-only** — not available in Python SDK
- **`excludeDynamicSections: true`** on systemPrompt preset improves prompt-cache reuse across machines by moving per-session context to first user message

## Composition Hints

- **Combine `allowedTools` + `permissionMode: "dontAsk"`** for headless agents with fixed tool surface
- **Use `startup()` at app boot** then `.query()` when prompt is ready to eliminate cold-start latency
- **Use `continue: true`** for multi-turn within one process — no session ID tracking needed
- **Use explicit `resume`** when you have multiple sessions (multi-user) or need to resume a non-most-recent session
- **Chain multiple hook matchers** for complex logic — each focused on one responsibility (rate-limit → auth → sanitize → audit)
- **Use `PreToolUse` + `updatedInput`** to redirect file writes to sandboxed directories
- **Use `PostToolUse` + `additionalContext`** to enrich tool results with extra data before Claude sees them
- **For cross-host resume**, either move the JSONL file or capture results as app state and pass into a fresh prompt
- **MCP tools are named `mcp__<server>__<action>`** — use `"^mcp__"` matcher to target all MCP tools in hooks
- **Set `CLAUDE_AGENT_SDK_CLIENT_APP`** in `env` to identify your app in User-Agent headers
