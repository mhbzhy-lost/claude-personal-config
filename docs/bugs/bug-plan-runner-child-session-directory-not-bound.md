# Plan-Runner Child Session 未绑定独立 Worktree

## 1. 现象

Plan-Runner root 通过原生 `task` 派发 DAG executor 时，harness 会创建独立 child worktree，但 OpenCode TaskTool 不接受 `directory` 参数，child session 本身仍继承 root session directory。

## 2. 影响

常见 Bash 和文件工具虽由 hook 重写到 child worktree，省略路径的读取以及 LSP、MCP、plugin runtime 等目录级能力仍可能使用 root 上下文。并行节点因此没有统一的 session 级目录契约，后续新增工具字段也可能绕过现有路径重写。

## 3. 复现条件

Plan-Runner root 在 active task 中调用原生 `task(background=true, ...)`。Harness 创建 child worktree 并在 task 返回后绑定 child session；检查 child session 的 directory/runtime，可见其并非以 child worktree 创建。

## 4. 根因

原生 TaskTool 没有 `directory` / `workdir` 参数。当前实现只能在 `tool.execute.before/after` 中注入 prompt、重写已知工具路径并事后绑定 session ID，无法改变 session 创建时选择的 directory，也产生 terminal 早于 after-binding 的竞态补偿需求。

## 5. 修复方向

新增仅 Plan-Runner 可见的 `dispatch_child({ description, prompt })` custom tool。Harness 先创建 child worktree，再调用 `client.session.create({ query: { directory: childWorktree } })`，持久化 session index 后用相同 directory 执行 `promptAsync(agent=executor)`。全局默认 deny `dispatch_child`，Plan-Runner deny 原生 `task` 并单独 allow 该工具。

## 6. 验证与防回归

权限测试覆盖全局 deny、Plan-Runner 独占 allow、其他 primary/subagent 不可见。Harness 测试必须断言 create/prompt 的 `query.directory` 等于 child worktree、session index 在 prompt 前完成绑定、并行 child terminal 能回流 root，且 child directory runtime 在安全 root 活动边界释放。
