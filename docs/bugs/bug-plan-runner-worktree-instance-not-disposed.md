# bug: Plan-Runner dedicated worktree 的 OpenCode instance 未释放

## 现象

Plan-Runner 每次通过 `start_plan_runner` 创建 dedicated run worktree。任务进入 `validated`、`blocked` 或 `interrupted` 后，task-state、session 和 git worktree 都会保留给父 agent 回流和人工清理，但 OpenCode 会继续按该 resolved directory 缓存 MCP、LSP 与 plugin instance。已观察到 8 个休眠 MCP/LSP instance 未随 session idle、abort 或 delete 释放。首版修复在 plan-runner idle 或 `start_plan_runner` 返回前调用 dispose；真实 smoke 显示 API 返回成功、子进程 cwd 清空后，同一 child session 的尾部事件会再次初始化目标 directory plugin，因此释放时机仍然过早。

## 根因（6 要素）

1. **触发条件**：harness-owned run worktree 与 `origin_worktree` 不同，且该 run 进入 `validated`、`blocked` 或 `interrupted` 终态。
2. **期望链路**：origin directory 的 PlanRunnerHarnessPlugin 在终态持久化、`start_plan_runner` 工具结果完成回流且父 session 进入 idle 后，只回收 run worktree 对应的 OpenCode runtime instance。
3. **实际链路**：原实现完全不释放 runtime；首版修复又在 plan-runner idle 或 `startPlanRunnerTool` 返回前立即释放。真实 smoke 日志先出现 `disposing instance`，随后出现同一 directory 的配置加载和 `plugin initialized`，证明 child session 尾部事件在 dispose 后重新读取 cache。
4. **关键假设失效**：最初把 session idle、abort 或 delete 当作 runtime 生命周期结束；首版又把 plan-runner idle 当作该 directory 已无后续访问。OpenCode dev `f014686` 源码显示 MCP/LSP/plugin instance 以 resolved directory 缓存，而 `Plugin.trigger` 会在每个后续 directory event 上重新读取已失效的 scoped cache；只有父 session idle 才位于 `start_plan_runner` 回流和 child 尾部事件之后。
5. **API 证据**：legacy PluginInput 的 client 暴露 `instance.dispose`，支持 `await client.instance.dispose({ query: { directory: runWorktree } })`；SDK 返回 error object 时必须通过现有 `throwIfSdkError` 识别。该调用只定位目标 directory，不会停止 origin OpenCode、删除 session/worktree/branch，也不影响其他 directory。
6. **影响范围**：每个完成但未回收 runtime 的 dedicated run 都可能留下 MCP/LSP/plugin instance，长期累积资源；child plugin 若在自身 hook 中自释放还可能中断自身运行。

## 修复边界

- 只有 `ctx.directory === state.origin_worktree` 的 origin plugin 可发起释放；child directory plugin 永不自释放。
- 只在 harness-owned 且 run worktree 不等于 origin 的 `validated` / `blocked` / `interrupted` 状态调用 target-directory dispose。
- 不在 plan-runner idle 或 `start_plan_runner` 工具返回前释放；由 origin plugin 收到绑定父 session 的 `session.idle` 后释放，避免 child 尾部事件重建 target instance。
- task-state 记录 `runtime_disposal.status` 为 `disposing`、`disposed` 或 `failed`，并记录 `attempts`、最近错误和时间；`failed` 在后续终态触发时最多重试两次，`disposing` / `disposed` 或达到上限后不再调用。plugin instance 内 state queue 串行化重复 idle，因此不会并发重复调用。
- dispose 失败、SDK error object 或方法缺失只留下诊断，绝不回退终态，也不破坏 final output、父会话 merge-back 通知、worktree/branch/session 保留策略。
- 不自行扫描进程、不调用 `ps`、`lsof`、`kill`、`global.dispose`，也不删除或合并 git worktree。
- OpenCode `instance.dispose` HTTP endpoint 在返回 response 后才由 middleware 触发 teardown，plugin event 也是 fire-and-forget；父 idle hook 可继续 await SDK response，不需要用不可观测的 fire-and-forget 绕过时序。
- dispose 完成前 helper 会重新读取 task-state 再写入结果，覆盖同一 instance 排队之外的 parent notification/evidence 更新；但不同 plugin instance 仍共享无 CAS/文件锁的 task-state，极小 read-write 窗口是现有架构残余风险，本次不扩展为全局跨-instance 锁。

## 验证

- RED：origin plugin 在 validated idle 时恰好释放一次，重复 idle 不重复；child directory plugin、audit child idle 和非终态 idle 不释放。
- RED：Change Request / 空响应写入 blocked 后释放且 final text 正常返回；SDK error 或 API 缺失写 failed 诊断而不破坏终态和 parent output/notification。失败后下一次 idle 成功重试，达到两次上限后停止；interrupted idle 也释放。
- RED：dispose await 期间新增的 parent notification/evidence 在完成后仍保留。
- RED：plan-runner idle 和 blocked 工具返回前均不释放；绑定的父 session idle 才释放，非绑定父 session idle 不释放。
- GREEN：focused pattern、整个 harness suite 和 `git diff --check` 通过。

## 残余风险

第二轮真实 blocked smoke 已验证修正后的父 idle 边界：`start_plan_runner` 返回前无 dispose；绑定父 session idle 后 task-state 记录 `disposed`，日志中 target directory 各出现一次 `creating instance`、`plugin initialized` 和 `disposing instance`，dispose 后没有再次初始化；`lsof` 无该 worktree cwd 残留，Swift 现场在清理前仍保留。
