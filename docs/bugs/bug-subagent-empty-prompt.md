# Bug: Sub-agent prompts return immediately without execution

**Status**: Fixed
**Date**: 2026-06-18
**Component**: `vendor/opencode-dynamic-workflow/lib/runner.mjs`
**Severity**: P0 (blocks all DAG/agent-based workflow execution)

## 1. Symptom

`wf.agent("coder", "Create a file ...")` resolves successfully with
`output: ""`, `durationMs: 2762`, session was created in the opencode DB,
but the session has **0 messages** and no files are produced.

Minimal reproducible via:
```js
const wf = await createWorkflow({});
const result = await wf.agent("coder", "Create t.txt with: hi");
// => { status: "completed", output: "", durationMs: 2762 }
// DB: session "coder: agent-..." exists, message count = 0
```

A bare SDK test (no workflow, same server, same session.prompt call shape
`{ path:, body: { parts: } }`) succeeds with 4 messages and the file created.

## 2. Hypothesis space examined

| Hypothesis | Evidence | Verdict |
|---|---|---|
| Server not reachable | Health endpoint 200, server URL matched | Reject |
| Server didn't accept HTTP request | session.create returned 200, session present in DB | Reject |
| SDK sent malformed body | Interceptor showed `{"parts":[...]}` correctly transmitted | Reject |
| MCP init too slow (global config had playwright) | http-test.mjs worked via same external server | Reject |
| **`agent` field value rejected by server** | `agent: "coder"` returns `{"error":{"name":"UnknownError",...}}` in 55 ms; `agent: undefined` or `agent: "build"` works in ~20 s | **Accepted** |

## 3. Root cause

Two compounding bugs in `runAgent` (runner.mjs:271–336):

1. **Wrong agent value.** The runner unconditionally sets `agent: spec.type`
   (line 301). `spec.type` is the workflow role label — one of `coder`,
   `explore`, `general`. opencode only recognises the built-in agents
   `build` and `plan` (verified via `strings $(which opencode)` and
   direct SDK calls). Passing `agent: "coder"` causes the server to
   raise an `UnknownError` during `session.prompt` → `createUserMessage`.

2. **Silent error swallow.** When the server returns an error, the SDK
   populates `result.error` and leaves `result.data` undefined. The code
   then reads `result.data?.parts || []`, which silently yields `[]`,
   and the function returns `status: "completed", output: ""`
   (line 323). The failure is invisible to callers.

## 4. Why it wasn't caught earlier

- Existing unit tests use `_mockClient` — the mock always returns a
  successful response with `parts`, never the error shape
  `{ error: { name, data } }` that the real SDK produces for unknown agents.
- SKILL.md documents `general`/`explore`/`coder` as "agent types", which
  were silently treated as opencode agent identifiers without validation.
- Empty output and 0 DB messages were assumed to be "agent did nothing"
  rather than "server rejected the request".

## 5. Fix

1. **runner.mjs — agent translation.** Drop the `agent` field from the
   request body when the workflow role is not a built-in opencode agent.
   Add `resolveAgent()` helper returning `undefined` for unknown types,
   `"build"` for the default code-writing role, `"plan"` when the spec
   explicitly wants plan-only.

2. **runner.mjs — error detection.** After `client.session.prompt`,
   inspect `result.error` first. If present, throw a synthetic error so
   the existing `catch` block records `status: "failed"` on the agent
   with the actual server message.

3. **SKILL.md — agent type clarification.** Explicitly separate workflow
   role labels (coder/explore/general) from opencode agent identifiers
   (build/plan). Document that the role label is metadata only and does not
   constrain which opencode agent executes the prompt.

## 6. Prevention

- Add an integration test that drives `runAgent` through the **real**
  SDK (`ensureServer` + auto-started opencode serve) and asserts:
  - `agent.status === "completed"`
  - `agent.output` is non-empty
  - The corresponding session in the DB has ≥ 1 message
- Add a negative test: calling `session.prompt` with an unknown agent
  produces an error — assert the runner reports it as `status: "failed"`
  rather than silent success.
- SKILL.md examples use `agent: "build"` (or omit it) so readers never
  copy the invalid `coder`/`general`/`explore` values.
