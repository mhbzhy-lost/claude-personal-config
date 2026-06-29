# bug: plan-runner 高频事件触发 stale 全量扫描

## 现象

`plan-runner` harness 在每个 `event` hook 开头都调用 `markExpiredTasks(stateDir)`，会对 `tasks` 目录做全量 `readdir` + JSON 读取。`message.updated` / `message.part.delta` 这类高频事件可能造成不必要的 IO 放大。

## 根因 (6 要素)

1. **触发条件**：OpenCode 会话流式输出或频繁更新 message，插件收到大量 event。
2. **期望链路**：stale lease 扫描只需要在低频边界事件执行，例如 `session.idle` 或 `todo.updated`，不应跟随 token/message 级事件全量扫描。
3. **实际链路**：`event` hook 无条件执行 `await markExpiredTasks(stateDir)`。
4. **关键假设失效**：实现时把“下次事件触发即可清理 stale”理解为任意事件，没有区分高频事件和状态边界事件。
5. **旁证**：外源 review 指出 `message.updated` 流式输出下会放大为每秒多次目录扫描；当前测试只覆盖 `session.idle`，没有约束高频事件行为。
6. **影响范围**：历史 task-state 文件较多时，OpenCode 插件响应可能因重复磁盘 IO 变慢，增加 hook 延迟和状态竞态概率。

## 修复方向

只在低频事件上执行 stale 扫描：`session.idle`、`todo.updated`。保留原有 `session.idle` stale 测试，并新增 `message.updated` 不触发 stale 的测试。

## 验证

- RED：过期 task 收到 `message.updated` 后不应变 stale；当前实现会立即变 stale，测试失败。
- GREEN：限制 stale 扫描事件后，`message.updated` 不变更 state，随后 `session.idle` 仍会标记 stale。
