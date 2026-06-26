---
name: plan-runner-dispatch
description: Use when the user explicitly asks 写计划并执行, 开始执行, 进入执行阶段, 按方案落地, 开始落地, 开始写计划并执行, or asks to turn an agreed technical approach into execution.
---

# Plan Runner Dispatch

Use this skill only as a routing shim. The primary agent should not execute the
implementation after this skill is loaded.

## Required Action

Do not implement the request in the primary agent. Immediately dispatch the
`plan-runner` subagent in the background:

```json
{
  "subagent_type": "plan-runner",
  "background": true
}
```

The task prompt must include:

- The user's original execution request.
- The agreed approach or current technical context.
- Any explicit constraints, tests, non-goals, and stop conditions already known.

## If Context Is Missing

Ask one concise clarification only when the execution goal or agreed approach is
missing. Otherwise dispatch `plan-runner` without re-planning in the primary
agent.

## Do Not

- Do not draft the execution plan yourself.
- Do not call `write_plan` from the primary agent.
- Do not use a foreground subagent call.
- Do not replace `plan-runner` with `general`, `explore`, or another custom
  agent.
