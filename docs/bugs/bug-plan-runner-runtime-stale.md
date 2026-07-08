# bug: plan-runner runtime stale 机制干扰一次性事务

## 现象

`plan-runner` 被用作一次性原子 subagent 事务时，旧 task-state 本应只作为磁盘诊断残留；但 harness 在后续 `session.idle` / `todo.updated` 事件中仍会扫描所有 task-state，并把 lease 过期的 active 状态改写为 `stale`。这会让旧 session 状态继续参与 runtime 流程控制，并可能把 `finish_plan` terminal gate 结果导向 `stale`。

## 根因 (6 要素)

1. **触发条件**：任意 OpenCode 会话触发 `session.idle` 或 `todo.updated`，且 `~/.config/opencode/task-state/tasks/` 下存在 lease 已过期、状态仍在 active 集合中的旧 plan-runner task-state。
2. **期望链路**：plan-runner task-state 只记录本次 subagent 执行账本；旧 task-state 保留为诊断日志，不由 event hook 自动改写、恢复或补偿。`finish_plan` 超时只写 `interrupted`。
3. **实际链路**：`event` hook 在处理当前事件后调用 `markExpiredTasks(stateDir)`，全局遍历旧 task-state，把匹配 active 状态的文件改成 `status = stale` 并写 `task_stale` event。
4. **关键假设失效**：早期实现把 plan-runner 当作可被 runtime 恢复/过期管理的长生命周期任务；当前产品语义已变为一次性 subagent 事务，中断后的文件系统副作用由 git 工作区和下一次主 agent 授权处理。
5. **旁证**：`COMPLETION_GATE_RESULT_STATUSES` / `TERMINAL_COMPLETION_GATE_STATUSES` 仍包含 `stale`，单测仍断言过期旧 state 在 `session.idle` 后变成 `stale`；知识文档仍记录低频事件会执行 stale 扫描。
6. **影响范围**：旧 state 会被新事件意外改写，audit/external/repair 等 terminal gate 状态可能被 stale 语义覆盖；同时引入不必要的全局磁盘扫描和状态竞态。

## 修复方向

删除 runtime stale 扫描和状态转换，不引入重入恢复、自动 reset、自动清理 git 工作区等机制。旧 task-state 仅作诊断残留；`finish_plan` 仍由自身 timeout 写 `interrupted`，`stale` 不再作为 completion gate terminal result。若诊断残留长期膨胀，只能通过 out-of-band 清理/归档工具按时间或数量裁剪旧文件，不能把全目录扫描重新放回 runtime event hook。

## 验证

- RED：构造过期旧 task-state，触发 `session.idle` / `todo.updated` 和 audit/repair 相关事件，断言 state 不被改写为 `stale`；当前实现会失败。
- GREEN：删除 runtime stale 扫描后，旧 state 保持原值，event log 不出现 `task_stale`；完整 plan-runner harness 测试和语法检查通过。
