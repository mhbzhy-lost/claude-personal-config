# bug: plan-runner validated 后未通知主 agent 合回 dedicated worktree

## 现象

真实 `opencode serve` smoke 中，`start_plan_runner` 成功创建 dedicated git worktree，plan-runner 在该 worktree 内完成 `SMOKE.md`、校验、commit、audit、external review，并把 task-state 写到 `validated`。但 parent/main agent 没有收到足够明确、可执行的合回通知，因此没有把该 commit 手动合回 origin workspace；origin 仍停在 base commit，只留下 `.gitignore` 的 worktree 忽略项。

## 根因 (6 要素)

1. **触发条件**：使用新的 `start_plan_runner` tool 派发 plan-runner 到 harness-owned dedicated worktree，并依赖 parent agent 在 plan-runner 终态后执行合回。
2. **期望链路**：child plan-runner 调用 `finish_plan` 得到 `validated` 后，harness 不应自动 `git merge`，但应通知 parent/main agent：run worktree 已验证、commit range/base/head、需要由 parent 在 origin workspace 手动合回并清理 worktree。
3. **实际链路**：`startPlanRunnerTool()` 只在 parent tool output 中返回 `plan-runner started: <task_id>` 和 metadata；`finishPlanTool()` 只把 `Result: validated` 返回给 plan-runner 子会话。事件流只写到 `task_validated`，没有 parent notification / merge-back instruction / merge-ready 事件。
4. **关键假设失效**：文档明确排除 harness 自动合回，要求 main agent 手动合回；但实现把 native background `task` 的“子任务完成后回报 parent”能力等同到自定义 `start_plan_runner`，而自定义 tool 只是 `client.session.create` + `client.session.prompt`，不会自动在 child 终态后唤醒 parent。
5. **旁证**：smoke task `planrun-ses_0bb3eba48ffe6W6A2HjlvhjddE-start-5843c1a4-a620-49ee-bd7f-ebf2d4799b34` 的 state 为 `validated`，event spine 到 `external_review_passed` / `task_validated`；origin workspace `HEAD=4ac45bb` 且无 `SMOKE.md`，dedicated worktree `HEAD=9cf96f7` 含 `test(smoke): 增加 plan-runner serve 烟测文件`。
6. **影响范围**：真实执行会把已验证成果留在 `.plan-runner-worktrees/<task>` 分支，主工作区不会自动收到修改；如果 parent agent 只看 `start_plan_runner` 返回文案，会误以为后续会自动完成并错过合回。

## 修复方向

让 harness 在 terminal gate 得到 `validated` 时生成清晰、机器可读且 agent-facing 的 merge-back 通知，而不是自动合回。通知至少包含 origin worktree、run worktree、branch、base/head commit、建议合回命令/步骤，以及“合回由 parent agent 执行，plan-runner 不得修改 origin”的边界。对应测试应覆盖 `finish_plan` validated 后 parent notification 内容，而不只验证 task-state 终态。

## 修复记录

- `finish_plan` 看到 dedicated run worktree 的 `validated` 终态时，harness 优先用 `client.session.promptAsync` 向 `parent_session_id` 投递 merge-back 通知；无 `promptAsync` 时才降级到 `prompt`。
- 通知包含 task id、origin worktree、run worktree、branch、base commit、run worktree head commit、`git merge --ff-only <branch>` 和 `git worktree remove <run_worktree>`。
- state 写入 `parent_notification={ type: merge_back, status, origin_worktree, worktree, branch, base_commit, head_commit }`；成功追加 `parent_merge_back_notified` event，失败追加 `parent_merge_back_notify_failed` event，但不把 `validated` 回退。
- harness 仍不自动 `git merge` origin workspace，也不自动删除 run worktree；合回和清理继续由 parent/main agent 执行。

## 验证

- `OPENCODE_PLAN_RUNNER_SLOW_TESTS=1 node --test --test-timeout=10000 --test-name-pattern "notifies the parent agent to merge back" "userconf/plugins/test/plan-runner-harness.test.mjs"`：通过。
- `node --test "userconf/plugins/test/plan-runner-harness.test.mjs"`：通过，`86 tests`，`54 pass`，`32 skipped`。
- `OPENCODE_PLAN_RUNNER_SLOW_TESTS=1 node --test "userconf/plugins/test/plan-runner-harness.test.mjs"`：通过，`86/86 pass`。
- `node --test "userconf/plugins/test"/*.mjs "scripts/test/opencode-subagent-event-probe.test.mjs"`：通过，`229 tests`，`197 pass`，`32 skipped`。
- `git diff --check`：通过。
