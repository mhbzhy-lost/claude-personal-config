---
name: plan-runner-dispatch
description: Use when the user explicitly asks 写计划并执行, 开始执行, 进入执行阶段, 按方案落地, 开始落地, 开始写计划并执行, or asks to turn an agreed technical approach into execution.
---

# Plan Runner Dispatch

Use this skill only as a routing shim. The primary agent should not execute the
implementation after this skill is loaded.

The harness owns plan-runner isolation. It must create and bind a dedicated
harness-owned worktree for the run.

## Required Action

Do not implement the request in the primary agent. Immediately call the
dedicated `start_plan_runner` tool:

```json
{
  "prompt": "<execution request, agreed approach, constraints, tests, non-goals, stop conditions>"
}
```

The `prompt` must include:

- The user's original execution request.
- The agreed approach or current technical context.
- Any explicit constraints, tests, non-goals, and stop conditions already known.
- Any known dirty state in the main workspace, if relevant. Dirty files are not
  automatically included in the harness-owned worktree unless the tool contract
  explicitly says so.

If `start_plan_runner` is not available, stop and report the configuration
mismatch. Do not fall back to the native `task` tool.

## If Context Is Missing

Ask one concise clarification only when the execution goal or agreed approach is
missing. Otherwise call `start_plan_runner` without re-planning in the primary
agent.

## Do Not

- Do not draft the execution plan yourself.
- Do not call `write_plan` from the primary agent.
- Do not use the native `task` tool for plan-runner dispatch.
- Do not replace `plan-runner` with `general`, `explore`, or another custom
  agent.
