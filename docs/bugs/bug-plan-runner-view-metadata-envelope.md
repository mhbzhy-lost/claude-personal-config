# Plan-Runner Custom Tool 缺少 Child Session TUI 导航

## 1. 现象

`start_plan_runner` 和 `dispatch_child` 已通过 `client.session.create` 创建独立 child session，
但 custom tool 只返回最终 metadata，没有在运行期间发布 `metadata.tui.view`。TUI 因此没有原生
`task` 卡片提供的 child session 导航入口。

## 2. 稳定复现

执行任一 custom tool，在 child session 创建后、`promptAsync` 前检查运行态 ToolPart；当前没有
`tui.view`。早期实验曾直接把最终 `ToolResult.metadata` 对象传给 `ToolContext.metadata`，但 Plugin
bridge 读取的是 envelope 内的 `input.metadata`，该实验同样无法生效。

## 3. 数据流

```text
custom tool creates child session
-> no valid context.metadata({ metadata }) update
-> running ToolPart receives no tui.view
-> user cannot navigate to the child session from the tool card
```

## 4. 根因

Custom tool 替代原生 `task` 后没有自动继承其 TUI session 卡片。早期适配还把最终
`ToolResult.metadata` 的对象形状误当成 `ToolContext.metadata` 参数，测试 mock 复制了错误形状，
未模拟公开 API envelope。

## 5. 修复假设

先验证当前 OpenCode 版本支持的 `ToolContext.metadata` 与 `tui.view` schema，再在
`start_plan_runner` 和 `dispatch_child` 的 session create 成功后调用
`context.metadata({ metadata })`；最终返回继续使用 `{ output, metadata }`。该能力应独立实现，
不能把已还原的同步 `session.prompt` 或旧 root idle collector 带回当前非阻塞架构。

## 6. 回归范围

- running metadata 必须位于公开 API 的 `metadata` 字段内。
- child session view target 必须在 `promptAsync` 前发布。
- 最终 metadata 必须保留现有 task、session 和 worktree 字段。
- 不改变 dispatch delivery、idle 或 watchdog 生命周期逻辑。
- 必须用 fresh OpenCode runtime 验证 TUI 实际可导航，不能只依赖 mock metadata 断言。
