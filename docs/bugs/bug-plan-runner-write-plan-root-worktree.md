# bug: plan-runner write_plan 写到文件系统根目录

## 症状

真实闭环验证中，root 成功通过 `task` 派发 `plan-runner`，harness 也绑定了子会话，但子会话一直停在 `planning_required`，没有进入 todowrite 和执行阶段。

## 影响

- `plan-runner` 无法完成 `write_plan`，后续 phase gate 会继续禁止 bash/write 等执行工具。
- 真实任务会卡在规划阶段，无法产生 plan markdown、todo mirror、diff evidence。

## 期望行为

`write_plan` 应写入 dispatch 时绑定的 workspace：

```text
<workspace>/docs/plans/<task_id>.md
```

## 实际行为

真实日志中 `write_plan` 报错：

```text
EROFS: read-only file system, mkdir '/docs'
```

说明 harness 尝试写入 `/docs/plans/...`，而不是临时 workspace 下的 `docs/plans/...`。

## 根因

`writePlanTool` 当前优先使用 custom tool context 的 `context.worktree || context.directory`：

```js
const worktree = context.worktree || context.directory || state.worktree
```

真实 OpenCode custom tool context 中 `context.worktree` 或 `context.directory` 可能为 `/`。这个值覆盖了 dispatch 阶段已经正确保存的 `state.worktree`，最终 `join("/", "docs", "plans", ...)` 变成 `/docs/plans/...`。

## 修复方案

`write_plan` 应优先使用 task state 中的 `state.worktree`。这是在 `tool.execute.before(task)` 派发时由 plugin context 记录的 workspace，和 task/session 绑定更稳定。

## 验证

- 单测：模拟 `context.worktree = "/"` 时，`write_plan` 仍写到 state 里的 workspace。
- 真实闭环：重跑隔离 `opencode serve + run --attach`，确认 `write_plan`、todowrite、文件写入、`session.diff` evidence 能串起来。
