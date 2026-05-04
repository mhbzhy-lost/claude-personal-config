---
name: claude-agent-sdk-typescript-subagents
description: Subagent development in TypeScript Claude Agent SDK — AgentDefinition, context isolation, detection, resume, and tool restriction patterns.
tech_stack: [claude-code]
language: [typescript]
capability: [agent-orchestration, tool-calling, permission]
version: "@anthropic-ai/claude-agent-sdk (docs reference v0.2.111+)"
collected_at: 2025-01-01
---

# Claude Agent SDK — TypeScript Subagents

> Source: https://code.claude.com/docs/en/agent-sdk/subagents, https://code.claude.com/docs/en/agent-sdk/typescript

## Purpose

Subagents are separate agent instances spawned by the main agent via the **Agent** tool to handle focused subtasks. They provide context isolation (only the final message returns to parent), parallel execution, specialized instructions, and tool restrictions — without bloating the main agent's prompt.

## When to Use

- **Context isolation**: large research/exploration tasks whose intermediate results shouldn't accumulate in the main conversation
- **Parallelization**: run multiple analyses concurrently (code review + security scan + test coverage)
- **Specialization**: agents with tailored prompts and expertise (SQL migration agent, security auditor)
- **Tool restriction**: limit a subagent to read-only tools for safer delegation
- **Background tasks**: non-blocking work running alongside the main agent
- **Dynamic configuration**: agent behavior that changes based on runtime conditions (strictness level, model choice)

## Basic Usage

### Three creation approaches

| Approach | How | Use when |
|----------|-----|----------|
| **Programmatic** | `agents` param in `Options` | SDK applications (recommended) |
| **Filesystem-based** | `.md` files in `.claude/agents/` | Reusable across sessions |
| **Built-in general-purpose** | No definition needed, just include `Agent` in `allowedTools` | Quick delegation |

Programmatic agents take precedence over filesystem-based with the same name. Filesystem-based agents load at startup only — restart session to pick up new ones.

### Minimal example

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const msg of query({
  prompt: "Review the auth module for security issues",
  options: {
    allowedTools: ["Read", "Grep", "Glob", "Agent"],  // Agent tool is REQUIRED
    agents: {
      "code-reviewer": {
        description: "Expert code reviewer. Use for quality, security, and maintainability.",
        prompt: `You are a code review specialist. Identify vulnerabilities, performance issues,
and standards violations. Be thorough but concise.`,
        tools: ["Read", "Grep", "Glob"],  // read-only
        model: "sonnet",
      },
    },
  },
})) {
  if (msg.type === "result") console.log(msg.result);
}
```

### Invocation patterns

- **Automatic**: Claude matches tasks to subagents by `description`. Write clear, specific descriptions.
- **Explicit**: `"Use the code-reviewer agent to check the authentication module"`

## Key APIs (Summary)

### `AgentDefinition` — all fields

```typescript
type AgentDefinition = {
  description: string;                      // Required: when to use (natural language)
  prompt: string;                           // Required: system prompt for the subagent
  tools?: string[];                         // Allowed tools. Omit = inherit all parent tools
  disallowedTools?: string[];               // Tools to remove from inherited set
  model?: string;                           // 'sonnet'|'opus'|'haiku'|'inherit'|full ID
  mcpServers?: AgentMcpServerSpec[];        // MCP servers by name or inline config
  skills?: string[];                        // Skill names to load
  initialPrompt?: string;                   // First user-like message
  maxTurns?: number;                        // Max agentic turns
  background?: boolean;                     // Non-blocking background task
  memory?: "user" | "project" | "local";    // Memory source
  effort?: "low" | "medium" | "high" | "xhigh" | "max" | number;
  permissionMode?: PermissionMode;          // Permission override (but see inheritance rules)
  criticalSystemReminder_EXPERIMENTAL?: string;
};
```

### Context inheritance rules

| Subagent RECEIVES | Subagent does NOT receive |
|-------------------|--------------------------|
| Its own `prompt` (system prompt) | Parent's conversation history |
| The Agent tool's prompt string (sole channel from parent) | Parent's system prompt |
| Project `CLAUDE.md` (via `settingSources`) | |
| Skills listed in `skills` | |
| Tool definitions (parent's, or `tools` subset) | |

**The Agent tool's prompt string is the only communication channel from parent to subagent.** Include all file paths, error messages, and decisions the subagent needs directly in that string.

The parent receives the subagent's final message verbatim as the Agent tool result. The parent may summarize it — to preserve verbatim, instruct in `systemPrompt`.

### Detecting subagent invocation (TypeScript)

```typescript
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({ /* ... */ })) {
  // In SDKAssistantMessage, content is nested under message.message.content
  if ("message" in message && message.message?.content) {
    for (const block of message.message.content) {
      // Check BOTH names for compatibility with older SDK versions
      if (block.type === "tool_use" && (block.name === "Agent" || block.name === "Task")) {
        console.log(`Subagent: ${(block.input as any)?.subagent_type}`);
      }
    }
  }
  // Messages from inside a subagent carry parent_tool_use_id
  if ("parent_tool_use_id" in message && message.parent_tool_use_id) {
    console.log("  (inside subagent context)");
  }
}
```

**Name compatibility:** Renamed `"Task"` → `"Agent"` in Claude Code v2.1.63. Current SDK emits `"Agent"` in `tool_use` but still uses `"Task"` in `system:init` tools list and `permission_denials[].tool_name`. Always check both.

### Resuming subagents

Subagents retain full conversation history in their session. To resume:

```typescript
// Helper: extract agentId from message content via regex
function extractAgentId(message: SDKMessage): string | undefined {
  if (!("message" in message)) return undefined;
  const match = JSON.stringify(message.message.content).match(/agentId:\s*([a-f0-9-]+)/);
  return match?.[1];
}

let agentId: string | undefined;
let sessionId: string | undefined;

// Step 1: Run subagent, capture IDs
for await (const msg of query({
  prompt: "Use Explore agent to find all API endpoints",
  options: { allowedTools: ["Read", "Grep", "Glob", "Agent"] }
})) {
  if ("session_id" in msg) sessionId = msg.session_id;
  agentId ??= extractAgentId(msg);
}

// Step 2: Resume same session, ask follow-up
if (agentId && sessionId) {
  for await (const msg of query({
    prompt: `Resume agent ${agentId} and list the top 3 most complex endpoints`,
    options: { allowedTools: ["Read", "Grep", "Glob", "Agent"], resume: sessionId }
  })) {
    if ("result" in msg) console.log(msg.result);
  }
}
```

**Critical:** Each `query()` starts a new session. You MUST pass `resume: sessionId` to access the subagent's transcript. For custom (non-built-in) agents, also pass the same `AgentDefinition` in both queries.

### Dynamic factory pattern

```typescript
function createReviewer(level: "strict" | "balanced") {
  return {
    description: "Security code reviewer",
    prompt: `You are a ${level} security reviewer. ${level === "strict" ? "Flag everything." : "Focus on critical issues."}`,
    tools: ["Read", "Grep", "Glob"],
    model: level === "strict" ? "opus" : "sonnet",
  };
}

// Usage at query time
options: {
  agents: { "security-reviewer": createReviewer("strict") }
}
```

### Tool restriction patterns

| Use case | Tools | 
|----------|-------|
| Read-only analysis | `Read`, `Grep`, `Glob` |
| Test execution | `Bash`, `Read`, `Grep` |
| Code modification | `Read`, `Edit`, `Write`, `Grep`, `Glob` |
| Full access | omit `tools` entirely |

### Background subagents

```typescript
agents: {
  "watcher": {
    description: "Background file watcher",
    prompt: "Monitor for changes and report...",
    background: true,
  }
}
// Stop with: query.stopTask(taskId)
```

### Subagent transcript lifecycle

- **Compaction**: main conversation compaction doesn't affect subagent transcripts (separate files)
- **Persistence**: transcripts survive within their session; resume after restart
- **Cleanup**: automatic after `cleanupPeriodDays` (default 30 days)

## Caveats

- **`Agent` must be in `allowedTools`** — without it, Claude cannot delegate to any subagent (including built-in general-purpose)
- **Subagents cannot spawn sub-subagents** — never include `Agent` in a subagent's `tools` array
- **Permission mode inheritance is locked** — when parent uses `bypassPermissions`/`acceptEdits`/`auto`, subagents inherit that mode and CANNOT override. This means `bypassPermissions` parent → subagent gets full autonomous system access with no way to downgrade
- **Context isolation is one-way** — only the Agent tool's prompt string passes from parent to subagent. Any file paths, error messages, or decisions the subagent needs must be in that prompt string
- **Subagent output may be summarized** — the parent may condense the subagent's final message. To preserve output verbatim, add an instruction in the main `systemPrompt`
- **Windows command-line limit** — subagent prompts exceeding 8191 characters fail on Windows. Keep prompts concise or use filesystem-based agents for complex instructions
- **Filesystem-based agents load at startup only** — create `.claude/agents/` files before session start; new files require a restart
- **Resume requires same session + same AgentDefinition** — for custom agents, pass identical `agents` config on both the initial and resume calls
- **Tool name dual-check required** — check both `"Agent"` and `"Task"` in `tool_use` blocks for cross-version compatibility
- **Fork vs. subagent**: forking branches the main conversation; subagents create isolated child contexts. They serve different purposes

## Composition Hints

- **Combine with hooks**: use `SubagentStart`/`SubagentStop` hooks to track and log subagent activity across parallel tasks
- **Factory pattern for model selection**: use `model: "opus"` for high-stakes subagents (security review) and `model: "sonnet"` for routine ones
- **Read-only subagents for safe analysis**: pair `tools: ["Read", "Grep", "Glob"]` with `permissionMode: "dontAsk"` for risk-free exploration
- **Background subagents for side effects**: monitoring, periodic checks, long-running analysis — stop with `stopTask(taskId)`
- **Parallel review pattern**: define `style-checker`, `security-scanner`, and `test-coverage` subagents with complementary `description` fields; Claude invokes them concurrently
- **Dynamic strictness**: use factory functions that accept runtime parameters (security level, model choice) to create agent definitions at query time
- **Resume for follow-up analysis**: capture agentId from first run, then resume same session to ask deeper questions without redoing work
- **Filesystem-based for shared configs**: define reusable agents in `.claude/agents/` for team-wide use; override programmatically when needed
