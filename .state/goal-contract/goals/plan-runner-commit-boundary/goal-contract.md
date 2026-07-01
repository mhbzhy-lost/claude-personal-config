# Goal Contract: plan-runner commit boundary

## Objective

完整执行 `docs/plans/plan-runner-commit-boundary.md`：把 plan-runner 的 external review 范围收敛为 Git commit range，并在 harness 中阻断 dirty 主工作区和 linked worktree 启动。

## Why

当前 `git_base..WORKTREE` dirty diff 会把派发前已有改动混入 external review。commit boundary 能让一次 plan-runner run 对应清晰的 `base_commit..HEAD`，减少自建范围机制和 scope drift。

## Scope

- 修改 `userconf/plugins/plan-runner-harness.js` 及其测试。
- 修改 `userconf/agents/plan-runner.md`，要求 plan-runner 在 `finish_plan` 前本地 commit、不 push。
- 更新 runbook / knowledge / plan 文档，明确 commit boundary 是唯一 external review 范围来源。
- 保持 existing todo/evidence/audit 能力，但 external review 范围不得依赖它们。
- 增加必要 bug 文档和验证记录。

## Non-Goals

- 不自动提交派发前已有 dirty changes。
- 不在 plan-runner 内 push。
- 不新增 task-scoped snapshot、task patch 或文件内容缓存机制。
- 不让 external review 根据 harness 自建 `modified_files` / `evidence` 计算范围。
- 不要求本轮重写整个 todo/evidence/audit 状态机。

## Invariants

- plan-runner 只能从主工作区启动，不能从 `git worktree add` 创建的 linked worktree 启动。
- plan-runner dispatch 时 repo 必须 clean。
- `finish_plan` review 前 repo 必须 clean。
- external review 输入必须是 `base_commit..HEAD`。
- 主 agent 负责处理 dispatch 前的 dirty changes，让人有介入机会。

## Missing Context Boundary

- OpenCode `tool.execute.before` 抛错硬阻断的最终 UI/DB 表现尚需 probe 或 RED 测试确认。
- linked worktree 判定需在本仓普通 checkout 与临时 `git worktree add` checkout 上验证。
- live smoke 需要在干净主工作区中执行；当前主仓存在未提交改动，不能直接作为 clean smoke 场地。

The agent must not infer:

- That a dirty diff belongs to the current plan-runner run unless it is committed after `base_commit`.
- That a linked worktree is a valid plan-runner root.
- That a plan-runner self-report is sufficient completion evidence.

## Definition of Done

- Dirty 主工作区派发 plan-runner 时，harness 阻断且不创建 plan-runner child session。
- Linked worktree 中派发 plan-runner 时，harness 阻断且返回明确错误码。
- Clean 主工作区中，plan-runner 能记录 base commit，完成本地 commit，调用 `finish_plan`。
- `finish_plan` 在 repo dirty 或 `HEAD == base_commit` 时返回 deterministic failure / repair_required，不进入 external review。
- External review 调用使用 base commit 到 `HEAD` 的 commit range，并带当前 repo 路径作为 `--worktree` 参数。
- 自动化验证全部通过，且 commit-boundary live smoke 达到 `validated`。
- `docs/plans/plan-runner-commit-boundary.md` 的实施清单全部从 `TODO:` 更新为 `DONE:` 或明确保留 blocker。

## Verification

| Claim | Evidence required | Command/artifact |
| --- | --- | --- |
| dispatch 阻断 dirty repo | RED/GREEN automated test | `node --test userconf/plugins/test/plan-runner-harness.test.mjs` |
| dispatch 阻断 linked worktree | RED/GREEN automated test | `node --test userconf/plugins/test/plan-runner-harness.test.mjs` |
| external review 使用 commit range | RED/GREEN automated test | `node --test userconf/plugins/test/plan-runner-harness.test.mjs` |
| live flow validated | task-state/events/DB | commit-boundary live smoke |

- `node --test "userconf/plugins/test"/*.mjs "scripts/test/opencode-subagent-event-probe.test.mjs"`
- `node --check "userconf/plugins/plan-runner-harness.js"`
- `node --check "scripts/opencode-subagent-event-probe.mjs"`
- `git diff --check`
- 重启 OpenCode 后运行 commit-boundary live smoke，并核验 task-state/events/DB。

## Evidence & Runtime Lanes

- source: code diff and docs diff.
- test: node tests and RED/GREEN outputs.
- runtime: live OpenCode smoke task-state/events/DB.
- review: audit/external review outputs.
- environment: git repo/worktree state and OpenCode restart state.

## Evidence Authority Ladder

1. runtime task-state/events/DB from live smoke.
2. automated tests and explicit RED/GREEN failure/pass output.
3. source diff inspection.
4. reviewer/audit text.
5. agent self-report.

## Architectural Red Lines

- Do not implement task-scoped content snapshots or custom patch caches.
- Do not define external review scope from `modified_files`, `evidence`, or agent-reported files.
- Do not let plan-runner auto-handle dirty changes that existed before dispatch.
- Do not use linked worktree as a plan-runner root.

## Drift Detectors

- If external review receives `WORKTREE`, mark scope drift and stop.
- If a new helper stores file contents to reconstruct task patch, mark scope drift and stop.
- If dirty repo dispatch starts a plan-runner child session, mark blocker `scope_conflict`.
- If completion is claimed without live smoke or an explicit blocker, mark `missing_evidence`.

## Slice Ordering Gate

1. Verify/encode dispatch preflight behavior with RED tests.
2. Implement Git preflight and dispatch blockers.
3. Verify/encode finish_plan commit-range checks with RED tests.
4. Change external review to commit range.
5. Update agent/docs.
6. Run automated verification.
7. Run live smoke in clean main checkout.

## Compaction Recovery Guard

Compacted chat summaries are recovery hints only. On every continuation, first read:

1. `.state/goal-contract/registry.json`
2. `.state/goal-contract/goals/plan-runner-commit-boundary/recovery.md`
3. `.state/goal-contract/goals/plan-runner-commit-boundary/state.json`
4. `.state/goal-contract/goals/plan-runner-commit-boundary/goal-contract.md`
5. `.state/goal-contract/goals/plan-runner-commit-boundary/feature-list.json`
6. the last 20 lines of `.state/goal-contract/goals/plan-runner-commit-boundary/evidence.jsonl`

If these files conflict with a chat summary, the files win. If they are missing or ambiguous, mark the goal blocked or needs amendment before continuing.

## Claim Thresholds

- complete: every DoD item has evidence and no proposed amendment remains.
- substantial progress: one named slice is GREEN and recorded in evidence.
- blocked: required OpenCode behavior or clean smoke environment cannot be obtained.
- scope drift: any architectural red line is crossed.

## Confidence Labels

- [Evidence-Backed]: directly proven by command output, source diff, artifact, task-state/event log, DB row, or explicit user-provided fact.
- [Reasonable-Inference]: supported by evidence but not directly proven.
- [Speculative]: plausible, but missing required evidence.

## Stop Conditions

- OpenCode hook cannot hard-block task dispatch without creating a child session.
- linked worktree detection cannot be made reliable with git metadata.
- live smoke cannot be run because no clean main checkout is available.
- implementation would require forbidden snapshot/patch mechanism.

## Recovery Entry

Start at `.state/goal-contract/registry.json`, then read this contract, `state.json`, `feature-list.json`, `evidence.jsonl`, `progress.md`, and `recovery.md`. The tracked plan is `docs/plans/plan-runner-commit-boundary.md`.

## Change Policy

Do not rewrite Objective, Scope, Non-Goals, Invariants, DoD, or Architectural Red Lines without writing an amendment entry first.

## What This Contract Cannot Tell Us

- Whether the future live smoke environment has been restarted with latest plugin/agent changes.
- Whether OpenCode hook errors surface with the exact UX intended until the probe/RED tests run.
