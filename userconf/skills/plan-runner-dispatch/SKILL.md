---
name: plan-runner-dispatch
description: Use when the user explicitly asks 写计划并执行, 开始执行, 进入执行阶段, 按方案落地, 开始落地, 开始写计划并执行, or asks to turn an agreed technical approach into execution.
---

# Plan Runner Dispatch

Use this skill only as a routing shim. The primary agent should not execute the
implementation after this skill is loaded.

The harness owns plan-runner isolation. It must create and bind a dedicated
harness-owned worktree for the run.

## Preflight Self-Check

This preflight takes priority over the later Required Action and context rules.
An agreed approach, conversation notes, or user urgency must not substitute for
a complete plan document produced with `writing-plans`.

Before calling `start_plan_runner`, verify that `writing-plans` has been used to
produce a complete plan document for the current execution request. Conversation
notes, an agreed direction, or a partial checklist are not a complete plan
document.

If no complete plan document exists, do not call `start_plan_runner`.
Load `writing-plans`, create the plan document, and complete its execution-mode
handoff first. Continue with this skill only after the user selects Plan-Runner.

## Required Action

After the preflight passes, do not implement the request in the primary agent.
Immediately call the dedicated `start_plan_runner` tool:

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

## After Dispatch

`dispatch_status=accepted` means only that the harness accepted the start
request. It is not a completion result and is not a terminal state.

After the tool returns `accepted`, the primary agent may continue with
non-conflicting work that is outside this implementation plan, or end the
current turn. It must not personally implement, steer, or otherwise continue
the dispatched plan.

Wait for the harness to asynchronously notify the parent session with one of
the terminal results: `validated`, `blocked`, or `interrupted`. Do not actively
or repeatedly poll for progress.

Call `get_plan_runner_status` at most once only when the expected notification
is missing, the user explicitly asks for status, or manual diagnosis is needed.
Report the observed status; never present `accepted` as completion.

## If Context Is Missing

Ask one concise clarification only when the execution goal or agreed approach is
missing after the preflight passes. Otherwise call `start_plan_runner` without
re-planning in the primary agent.

## Do Not

- Do not improvise an execution plan inside this routing shim; use
  `writing-plans` when the preflight fails.
- Do not call `write_plan` from the primary agent.
- Do not use the native `task` tool for plan-runner dispatch.
- Do not replace `plan-runner` with `general`, `explore`, or another custom
  agent.
- Do not wait in the current turn, poll, or personally continue the accepted
  implementation plan.
