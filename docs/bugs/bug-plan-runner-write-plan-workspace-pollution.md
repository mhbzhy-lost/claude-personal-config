# bug: write_plan content 写入目标 workspace 污染业务目录

## 现象

`write_plan({ content, tasks })` 会把 `content` 写到目标 workspace 的 `docs/plans/<task_id>.md`。但当前 `write_plan` 产物已经是 harness / audit / external review 消费的执行契约材料，不应作为业务仓库文档落到目标 workspace。

## 根因 (6 要素)

1. **触发条件**：plan-runner 调用带 `content` 的 `write_plan`。
2. **期望链路**：`content` 作为 harness-owned plan artifact 单独保存在 task-state 管理目录，供 audit agent 和 external review 读取。
3. **实际链路**：`writePlanTool()` 使用 `state.worktree || context.worktree || context.directory` 拼出 `<workspace>/docs/plans/<task_id>.md`，写入目标业务目录。
4. **关键假设失效**：早期把 `content` 当 reviewer-facing workspace plan；现在机器任务定义来自 `tasks`，`content` 只是 harness 审查材料，不属于业务仓库文件。
5. **旁证**：现有单测断言 `state.plan_path == join(workspace, "docs", "plans", ...)`，说明该错误行为已固化在测试中。
6. **影响范围**：每次带 `content` 的 plan-runner run 都会在目标 workspace 产生额外 `docs/plans` 文件，污染 git status，并可能影响 finish_plan 的 clean repo / commit boundary。

## 修复方向

将 `write_plan.content` 写到 harness stateDir 下的独立 plans 目录，例如 `<stateDir>/plans/<task_id>.md`。`state.plan_path` 继续作为 audit / external review 可读路径，但不再指向目标 workspace；`tasks` 仍是唯一机器执行契约。

## 验证

- RED：带 `content` 调用 `write_plan` 后断言 `state.plan_path` 位于 `stateDir/plans`，且 `workspace/docs/plans/<task_id>.md` 不存在；当前实现失败。
- GREEN：修复后运行 plan-runner harness 全量测试、全量 node 测试和 `git diff --check`。

## 实际验证

- focused RED：`write_plan keeps structured tasks as SSOT when content is present`、`write_plan stores plan content under stateDir when tool context reports root`、audit prompt / external reviewer spec 相关用例在旧实现下暴露 workspace plan 路径和缺失 `Plan path`。
- focused GREEN：`node --test --test-name-pattern "write_plan keeps structured tasks as SSOT when content is present|write_plan stores plan content under stateDir|uses synchronous session.prompt|passes base commit to HEAD range" "userconf/plugins/test/plan-runner-harness.test.mjs"`：4 pass。
- `node --test "userconf/plugins/test/plan-runner-harness.test.mjs"`：82 pass。
- `node --test "userconf/plugins/test"/*.mjs "scripts/test/opencode-subagent-event-probe.test.mjs"`：225 pass。
- `git diff --check`：通过。
