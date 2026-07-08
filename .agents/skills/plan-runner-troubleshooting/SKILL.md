---
name: plan-runner-troubleshooting
description: Use when plan-runner stalls, returns preflight_blocked or repair_required, task-state looks inconsistent, finish_plan does not reach validated, child worktrees remain, or another session needs plan-runner diagnostics.
---

# Plan-Runner Troubleshooting

## Core Rule

Do not trust the agent final report until the harness state proves it. Diagnose from task-state, event logs, Git state, and server logs.

## First Look

1. Find the newest task state. Default path: `~/.config/opencode/task-state/tasks/<task_id>.json`; if `$OPENCODE_CONFIG_DIR` or `$XDG_CONFIG_HOME` is set, replace the config root accordingly.
2. Read the event stream. Default path: `~/.config/opencode/task-state/events/<task_id>.jsonl`; apply the same config-root replacement when needed.
3. Check `status`, `tasks[]`, `active_task`, `child_sessions[]`, `completion_gate`, `gate_failures[]`, `base_commit`, and `worktree`.
4. Confirm the workspace Git state with `git status --short` and child registration with `git worktree list --porcelain`.
5. If this came from smoke automation, remember: `opencode run --attach` may return after background plan-runner dispatch; keep `serve` alive until task-state reaches a terminal status.

## Expected Event Spine

For a healthy run with child work, events should normally include:

```text
dispatch_started
plan_runner_bound
plan_contract_written
task_started
child_worktree_created
child_session_bound
child_session_completed
task_completed
self_check_completed
deterministic_check_passed
audit_review_dispatched
audit_review_passed
external_review_started
external_review_passed
task_validated
```

`finish_plan_preflight_blocked` can appear before `self_check_completed`; that is recoverable if the same plan-runner session later creates/repairs the local commit boundary and calls `finish_plan` again.

## Stop-Point Map

| Last reliable signal | Likely cause | Check next |
| --- | --- | --- |
| `dispatch_started`, no `plan_runner_bound` | parent dispatched but child session did not bind | OpenCode server log, task tool metadata, agent load |
| `planning_required` | plan-runner never called `write_plan({ tasks })` | agent prompt loaded, `write_plan` tool allowed |
| `ready_to_execute` | no task cursor selected | missing `start_task` |
| `active_task` set too long | task never completed or evidence missing | tool evidence, validation command exits, `complete_task` |
| pending task after completed task | `start_task` did not select next task | phase gate error text |
| child `status: running` after idle | child idle did not backflow | `child_session_completed`, session index role |
| `finish_plan_preflight_blocked` | root commit boundary or child cleanup missing | `git status --short`, `git worktree list --porcelain`, `child_sessions[].worktree` |
| `audit_review_dispatched` only | audit child did not return consumable JSON | audit child session DB rows, `message.part.updated`, server log |
| `external_review_started` only | reviewer command/provider stuck or unavailable | `gate_failures[]`, reviewer output, provider health |
| `repair_required` | gate found actionable issues | repair in same plan-runner session, validate, commit, retry `finish_plan` |

## Git And Worktree Checks

- Root worktree must be clean before terminal review.
- `HEAD` must differ from `base_commit`, and `base_commit..HEAD` must contain diff.
- Every harness child worktree recorded in `child_sessions[]` must be merged or intentionally discarded and removed.
- `git worktree list --porcelain` should show only the root workspace when cleanup is complete.
- `child_sessions[].worktree` paths that still exist are blockers, even if the child says it is done.

## Server And Session Checks

- Fresh plugin/agent changes require restarting OpenCode; running sessions do not hot-reload config-time files.
- In live smoke, start a persistent `opencode serve`, then use `opencode run --attach <url> --dir <workspace>` to dispatch.
- If a script kills `serve` when parent `opencode run --attach` returns, background plan-runner may stop at `planning_required` or `plan_runner_bound`.
- For audit backflow, check the OpenCode DB only with snake_case fields such as `session_id`; audit text may arrive through `message.part.updated`, not just `message.updated`.

## Common Mistakes

- Trusting a final answer before `status == "validated"` and `task_validated` exists.
- Treating `preflight_blocked` as terminal instead of a commit/worktree cleanup step.
- Checking only root Git status and ignoring registered child worktrees.
- Killing a smoke server before the background task reaches terminal state.
- Assuming `repair_required` findings are for the main agent; they must be handled in the same plan-runner session.

## Useful References

- `docs/runbook/plan-runner-smoke.md`
- `docs/knowledge/subagent-dispatch-hook.md`
- `userconf/plugins/plan-runner-harness.js`
