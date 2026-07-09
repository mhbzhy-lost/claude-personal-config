# bug: plan-runner 测试迁移后反复创建真实 worktree 导致耗时失控

## 现象

接管中的 plan-runner 开发停在 `T3`，多次运行 `node --test "userconf/plugins/test/plan-runner-harness.test.mjs"` 或较大的 `--test-name-pattern` 组合后无法有效结束，task-state 中 `T3` 长时间 `in_progress`，事件流显示大量重复的测试文件修改与命令执行。

## 根因 (6 要素)

1. **触发条件**：把通用测试 helper `dispatchPlanRunner()` 改成每个用例都调用真实 `start_plan_runner`。
2. **期望链路**：只有 `start_plan_runner` 专属用例验证 git linked worktree 创建；旧 harness 行为用例只需一个已绑定的 task-state/session fixture。
3. **实际链路**：几乎所有旧 harness 用例都执行 `git worktree add`、写 `.gitignore`、创建 plan-runner session mock，并在 run worktree 里提交测试状态。
4. **关键假设失效**：测试 helper 迁移把“启动工具行为”变成所有终态门禁、audit、external review、evidence 测试的共同前置，导致同一行为被重复覆盖数十次。
5. **旁证**：task-state `T3` 中同一测试文件出现大量 diff evidence，事件流中 full harness test 和多个大 pattern 命令反复运行，部分命令 `exit_code = null`。
6. **放大因素**：audit/external review 用例属于 terminal-gate 端到端等待路径，默认运行时会串行等待 audit child、external reviewer command 和 fail-open 轮次；其中 `prepareAuditReviewState()` 只等待 `state.status === "audit_review"`，但实现先写状态、后写 audit session index，测试立即回灌 `ses_audit` 事件时可能丢事件并等到 `finish_plan` 超时。
7. **影响范围**：测试 suite 时间被 git worktree setup 和 terminal-gate 等待链共同主导，plan-runner 难以完成 terminal gate；也让失败定位被大量无关 worktree setup 噪声淹没。

## 修复方向

将测试 fixture 分层：默认 helper 直接写入等价的 harness task-state/session index，保持旧用例快速覆盖状态机行为；只在 `start_plan_runner` 专属用例和 origin dirty/run worktree 边界用例中显式使用真实 dedicated worktree。将 audit/external/fail-open 等 terminal-gate 端到端等待路径放入 `OPENCODE_PLAN_RUNNER_SLOW_TESTS=1` 分组，并让 audit helper 等到 `audit_review_dispatched` 后再回灌 audit 结果。

## 验证

- focused：运行 `start_plan_runner` / run worktree 专属用例。
- focused：运行原先卡住的旧行为组合，确认不再批量创建真实 worktree。
- 回归：运行 `node --test "userconf/plugins/test/plan-runner-harness.test.mjs"`。
- 慢测：运行 `OPENCODE_PLAN_RUNNER_SLOW_TESTS=1 node --test "userconf/plugins/test/plan-runner-harness.test.mjs"`。
- 全量：运行 `node --test "userconf/plugins/test"/*.mjs "scripts/test/opencode-subagent-event-probe.test.mjs"`。
- 空白：运行 `git diff --check`。

## 实际验证 (2026-07-08)

- `node --test --test-name-pattern "start_plan_runner creates a fresh task state" "userconf/plugins/test/plan-runner-harness.test.mjs"`：通过。
- `node --test "userconf/plugins/test/plan-runner-harness.test.mjs"`：通过，85 tests，54 pass，31 skipped。
- `OPENCODE_PLAN_RUNNER_SLOW_TESTS=1 node --test "userconf/plugins/test/plan-runner-harness.test.mjs"`：通过，85/85 pass。
- `node --test "userconf/plugins/test"/*.mjs "scripts/test/opencode-subagent-event-probe.test.mjs"`：通过，228 tests，197 pass，31 skipped。
- `git diff --check`：通过。
