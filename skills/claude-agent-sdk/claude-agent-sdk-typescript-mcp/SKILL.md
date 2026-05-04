---
name: claude-agent-sdk-typescript-mcp
description: MCP server integration and custom tool creation with the TypeScript Claude Agent SDK — connecting external tools, defining in-process SDK tools, and managing server lifecycle.
tech_stack: [claude-agent-sdk]
language: [typescript]
capability: [cc-mcp, tool-calling]
version: "@anthropic-ai/claude-agent-sdk unversioned"
collected_at: 2025-07-16
---

# Claude Agent SDK TypeScript — MCP & Custom Tools

> Source: https://code.claude.com/docs/en/agent-sdk/mcp, https://code.claude.com/docs/en/agent-sdk/custom-tools, https://code.claude.com/docs/en/agent-sdk/typescript

## Purpose

Connect Claude Agent SDK to external tools and data sources via the Model Context Protocol (MCP), and define your own in-process custom tools with type-safe Zod schemas. Covers all three transport types (stdio, HTTP/SSE, SDK), tool permission control, error handling, and lifecycle management.

## When to Use

- Integrating external MCP servers (databases, GitHub, Slack, filesystem) into agent sessions
- Building custom tools with Zod-typed inputs that Claude can call during conversations
- Managing MCP server lifecycle — reconnect, toggle, or replace servers mid-session
- Returning non-text results from tools (images, resources)

## Basic Usage

### Connect an external MCP server (HTTP)

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const msg of query({
  prompt: "List recent issues",
  options: {
    mcpServers: {
      github: {
        type: "http",
        url: "https://api.github.com/mcp",
        headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
      }
    },
    allowedTools: ["mcp__github__*"]  // wildcard permits all tools from this server
  }
})) {
  if (msg.type === "result" && msg.subtype === "success") console.log(msg.result);
}
```

### Connect a stdio MCP server

```typescript
mcpServers: {
  filesystem: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/root"],
    env: { TOKEN: process.env.TOKEN }
  }
}
```

### Define a custom tool (SDK MCP server)

```typescript
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const getWeather = tool(
  "get_weather",
  "Get current temperature for a city",
  { city: z.string() },
  async ({ city }) => {
    const res = await fetch(`https://api.weather.example/${city}`);
    return { content: [{ type: "text", text: await res.text() }] };
  },
  { annotations: { readOnlyHint: true, openWorldHint: true } }
);

const weatherServer = createSdkMcpServer({
  name: "weather",
  version: "1.0.0",
  tools: [getWeather],
});

// Use in query()
query({ prompt: "...", options: {
  mcpServers: { weather: weatherServer },
  allowedTools: ["mcp__weather__get_weather"]
}});
```

## Key APIs (Summary)

### Tool naming convention
`mcp__<server-name>__<tool-name>` — e.g., a server key `"github"` with tool `list_issues` becomes `mcp__github__list_issues`.

### `tool(name, description, zodSchema, handler, extras?)`
- `handler` receives Zod-inferred typed args, returns `Promise<{ content: ContentBlock[], isError?: boolean }>`
- Content blocks: `{ type: "text", text: "..." }`, `{ type: "image", data: base64, mimeType: "image/png" }`, `{ type: "resource", resource: { uri, text?, blob?, mimeType? } }`
- Image `data` must be raw base64 — no `data:image/...;base64,` prefix; `mimeType` is required.
- Set `isError: true` to tell Claude the tool failed without killing the agent loop.

### `createSdkMcpServer({ name, version?, tools? })`
Wraps tool definitions into an in-process MCP server. Pass the returned object to `query()` options under `mcpServers`.

### ToolAnnotations
| Hint | Default | Effect |
|------|---------|--------|
| `readOnlyHint` | false | Enables parallel execution with other read-only tools |
| `destructiveHint` | true | Informational only |
| `idempotentHint` | false | Informational only |
| `openWorldHint` | true | Informational only |

Annotations are metadata, **not enforcement**. `readOnlyHint: true` won't stop a handler from writing to disk.

### Query object — MCP lifecycle methods
- `query.mcpServerStatus()` → `Promise<McpServerStatus[]>` — connection status per server
- `query.reconnectMcpServer(name)` — retry a failed server
- `query.toggleMcpServer(name, enabled)` — enable/disable mid-session; disabling removes tools from context
- `query.setMcpServers(servers)` — replace all servers dynamically; returns added/removed/error info

### Detecting connection failures
```typescript
for await (const msg of query({ ... })) {
  if (msg.type === "system" && msg.subtype === "init") {
    const failed = msg.mcp_servers.filter(s => s.status !== "connected");
    if (failed.length) console.warn("MCP connection failures:", failed);
  }
}
```

### Tool access control: the two layers

| Layer | Option | Effect |
|-------|--------|--------|
| Availability | `tools: ["Read","Grep"]` | Only listed built-ins in context. MCP tools unaffected. `tools: []` removes all built-ins. |
| Permission | `allowedTools: ["mcp__gh__*"]` | Auto-approve listed tools. Unlisted tools still visible but require permission flow. |
| Permission | `disallowedTools: ["Bash"]` | Deny every call. Tool stays visible — Claude may waste a turn attempting it. |

**Critical**: `permissionMode: "acceptEdits"` does NOT auto-approve MCP tools. Use `allowedTools` wildcards instead. `bypassPermissions` works but disables all safety prompts — overkill.

## Caveats

- **MCP tools need explicit `allowedTools`** — without it, Claude sees tools but can't call them.
- **Uncaught handler exceptions kill the agent loop.** Always catch errors in tool handlers and return `isError: true`.
- **`disallowedTools` leaves tools visible.** Prefer `tools: [...]` to remove from context entirely.
- **Connection timeout is 60s.** For slow-starting servers, pre-warm or use lighter alternatives.
- **Every tool consumes context window space each turn.** Enable tool search (on by default) for many tools.
- **`.mcp.json`** is loaded only when `"project"` is in `settingSources` (default for `query()`). Explicit `settingSources` must include `"project"`.

## Composition Hints

- **Custom tools + external MCP**: Mix SDK-based tools and external servers in the same `mcpServers` map — just use different keys.
- **Error recovery pattern**: Return `isError: true` for expected failures (non-200 HTTP, missing data). Let uncaught exceptions propagate only for truly unexpected conditions.
- **Wildcard discipline**: Use `mcp__<server>__<tool>` for specific tools, `mcp__<server>__*` for full server access. Never use bare `*` as an allowedTool.
- **Init message as health check**: Always check `system.init` for MCP connection status before trusting tool results.
