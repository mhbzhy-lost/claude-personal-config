# Plan: 删除 plan-runner runtime stale 扫描

## Goal

将 plan-runner harness 的 task state 恢复为“本次 subagent 执行账本”：event hook 不再扫描旧 task-state，也不再把旧 state 自动转换为 `stale`。旧 state 只作为磁盘诊断残留；`finish_plan` 的超时终态继续使用 `interrupted`，`stale` 不参与 completion gate 的 terminal result。

## Architecture

- 入口仍是 `userconf/plugins/plan-runner-harness.js` 的 OpenCode event hook 与 MCP 工具实现。
- 删除 runtime stale 扫描路径：`session.idle`、`todo.updated`、audit/external/repair 相关事件消费时，不再触发全局 task-state 过期检查。
- 删除/收窄 stale 状态语义：`stale` 不属于 completion gate result，也不属于 finish_plan terminal status；若仍有历史磁盘日志写过 `stale`，本次代码不做迁移或自动清理。
- `finish_plan` 保留现有 timeout -> `interrupted` 行为，作为唯一的超时终态。

## File Structure

- `docs/bugs/bug-plan-runner-runtime-stale.md`：新增 bug 六要素记录，说明 stale runtime 机制的根因、影响和修复边界。
- `userconf/plugins/test/plan-runner-harness.test.mjs`：先写 RED 回归测试，证明旧 state 不会因 `session.idle`/`todo.updated`/audit/external/repair 事件被改写为 stale。
- `userconf/plugins/plan-runner-harness.js`：删除 `markExpiredTasks` / `shouldCheckExpiredTasks` 的 event hook 调用及无用 stale 常量/函数。
- `docs/knowledge/subagent-dispatch-hook.md`：同步长期事实：不做 stale runtime 扫描，旧 state 是诊断残留，finish_plan timeout 写 `interrupted`。

## TDD task steps

- T1: 记录 bug 六要素，明确根因假设：一次性 subagent 事务不需要 runtime stale 恢复，扫描旧 state 会干扰 terminal gate。
- T2: 写 RED 测试：构造过期旧 task-state，触发 `session.idle` / `todo.updated`，期望文件状态保持原值且不出现 `completion_gate_result: stale`；同时覆盖 audit/external/repair pending 状态不会被 stale 覆盖。
- T3: 运行定向测试并确认 RED：`node --test userconf/plugins/test/plan-runner-harness.test.mjs` 应因仍存在 stale 扫描而失败，失败点指向旧 state 被改写或 stale terminal result。
- T4: 最小 GREEN 实现：移除 event hook runtime stale 扫描、删除不再使用的 stale completion gate result/terminal status 语义，并保留 finish_plan timeout -> `interrupted`。
- T5: 更新知识文档并运行完整验证；通过后本地提交，提交消息使用中文祈使句且不 push。

## Commands with expected output

- RED：`node --test userconf/plugins/test/plan-runner-harness.test.mjs`
  - 预期：新增测试失败，失败原因显示旧过期 state 被改成 `stale` 或 audit/external/repair pending 被 stale 覆盖。
- GREEN 定向：`node --test userconf/plugins/test/plan-runner-harness.test.mjs`
  - 预期：plan-runner harness 测试全部通过。
- 完整验证：`node --test "userconf/plugins/test"/*.mjs "scripts/test/opencode-subagent-event-probe.test.mjs"`
  - 预期：所有测试通过，无失败测试。
- 语法检查：`node --check "userconf/plugins/plan-runner-harness.js"`
  - 预期：无输出，退出码 0。
- 语法检查：`node --check "scripts/opencode-subagent-event-probe.mjs"`
  - 预期：无输出，退出码 0。
- Diff 检查：`git diff --check`
  - 预期：无空白错误，退出码 0。
- 提交前后：`git status --short`
  - 预期：提交前只包含本计划内文件；提交后无输出。

## Risks / Stop Conditions

- 若测试暴露 `stale` 被外部文档或工具 API 作为用户可见契约依赖，需要停止并提交 Change Request，不在本任务中静默改 API。
- 若删除 stale 需要新增重入恢复、自动 reset 或工作区清理机制，停止并提交 Change Request，因为超出简报边界。
- 若指定验证命令因环境缺失无法运行，停止记录具体缺失与影响，不以代码审阅替代验证。
- 不修改 `userconf/AGENTS.md`；若发现必须改全局规则，停止请求用户确认。
