# Progress: plan-runner commit boundary

## Current Slice

None. Goal state is `completed`.

## Evidence

- [Evidence-Backed] `docs/plans/plan-runner-commit-boundary.md` defines the target behavior and implementation checklist.
- [Evidence-Backed] `docs/bugs/bug-plan-runner-external-review-dirty-worktree-scope.md` records the root cause and verification plan.
- [Evidence-Backed] `node --test "userconf/plugins/test"/*.mjs "scripts/test/opencode-subagent-event-probe.test.mjs"` reported `186 pass / 0 fail` after the final checklist update.
- [Evidence-Backed] `node --check "userconf/plugins/plan-runner-harness.js"`, `node --check "scripts/opencode-subagent-event-probe.mjs"`, and `git diff --check` exited successfully.
- [Evidence-Backed] Commit-boundary live smoke task-state is `status: validated` with `base_commit: 376806bd9930e33cdc63a13ff3c91e2635ecbd83` and external review provider `idealab-openai` passing.
- [Evidence-Backed] Live smoke events include `deterministic_check_passed`, `audit_review_passed`, `external_review_passed`, and `task_validated`.
- [Evidence-Backed] OpenCode DB query for audit child `ses_0e2d768d9ffe7eOVeeWkUsMeEZ` returned `message=4`, `part=14`, `session_input=0`; plan-runner final message time is `1782900683155`, later than `task_validated` at `1782900682661`.

## What This State Cannot Tell Us

- This state cannot prove that already-running OpenCode TUI or server processes have reloaded the updated plugin/agent files; those processes still need restart.
- This state cannot prove future external review provider health; it only records the live smoke provider result at verification time.

## Next Action

No implementation action remains for this goal. Restart long-running OpenCode processes before relying on the updated plugin/agent behavior.
