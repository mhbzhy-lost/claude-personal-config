# bug: write_plan 同时传 content 和 tasks 时误入 legacy todowrite 流程

## 现象

plan-runner 调用 `write_plan` 后继续调用 `start_task`，被 phase gate 拒绝：`plan-runner phase gate: start_task is not allowed during waiting_for_todo`。最近失败 task-state 显示 `status = waiting_for_todo`、`version = 1`、`tasks` 不存在，events 只有 `dispatch_started`、`plan_runner_bound`、`plan_written`。

## 根因 (6 要素)

1. **触发条件**：plan-runner 调用 `write_plan({ content, tasks })`，即同时传入 reviewer-facing plan markdown 和结构化任务数组。
2. **期望链路**：`tasks` 是唯一机器执行契约；只要传入 `tasks`，harness 就应保留 `state.tasks`，进入 `ready_to_execute`，允许后续 `start_task`。
3. **实际链路**：`writePlanTool()` 在 `markdown.trim() && Array.isArray(args.tasks) && args.tasks.length` 时走旧分支，写 `docs/plans/<task_id>.md` 后把 state 置为 `waiting_for_todo`，并删除 `state.tasks` / `state.active_task`。
4. **关键假设失效**：旧实现把 `content + tasks` 解释为 legacy markdown plan + 原生 `todowrite` mirror；但当前产品语义已明确删除原生 `todowrite` 执行账本，`tasks` 必须始终是 SSOT。
5. **旁证**：失败 state 为 `version = 1` 且 `todo.mirrored = false`；event 是 `plan_written` 而不是 `plan_contract_written`；`start_task` 在 `waiting_for_todo` 阶段不在 allowlist 中。
6. **影响范围**：任何遵循 prompt 同时提供 plan brief 和 `tasks` 的新 plan-runner run 都会卡死在旧 todowrite 等待态，无法进入结构化任务执行。

## 修复方向

删除 `content + tasks` 进入 legacy `waiting_for_todo` 的行为。`tasks` 存在时永远走 v2 structured task contract：可选写入 reviewer-facing plan brief，但必须保留 `state.tasks`、`active_task = null`、`status = ready_to_execute`，并写 `plan_contract_written` event。

## 验证

- RED：调用 `write_plan({ content, tasks })` 后断言 state 进入 `ready_to_execute`、保留 `tasks[]`，且 `start_task` 不被 `waiting_for_todo` 阶段拒绝；当前实现会失败。
- GREEN：修复后 focused test、plan-runner harness 全量测试、全量 node 测试和 `git diff --check` 通过。

## 实际验证

- `node --test userconf/plugins/test/plan-runner-harness.test.mjs`：82 pass。
- `node --test userconf/plugins/test/*.mjs scripts/test/opencode-subagent-event-probe.test.mjs`：225 pass。
- `git diff --check`：通过。
