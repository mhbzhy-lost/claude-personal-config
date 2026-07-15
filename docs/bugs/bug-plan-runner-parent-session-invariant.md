# Plan-Runner Parent Session 不变量缺少入口校验

## 1. 现象

外部 review 认为没有 parent session 的 Plan-Runner 终态可能因等待 parent notification 而无法释放 run runtime。当前 `start_plan_runner` 实际由 custom tool context 提供 parent session，但入口没有显式拒绝缺失 `context.sessionID` 的异常调用。

## 2. 影响

正常 OpenCode 调用不受影响；测试、错误集成或未来 API 漂移若传入空 session ID，可能生成带 `undefined` 标识的 task/worktree，并绕开“terminal barrier → parent notification → parent idle disposal”的生命周期不变量。

## 3. 复现条件

直接调用 `start_plan_runner.execute`，提供合法 prompt 和 workspace，但删除 tool context 的 `sessionID`。现有实现会继续生成 task ID 并尝试创建 run worktree，而不是在副作用发生前失败。

## 4. 根因

实现默认相信 OpenCode 永远提供 `ToolContext.sessionID`，但未把该平台前置条件编码为入口断言。`shouldDisposeRunRuntime` 要求 parent notification 完成是有意的安全边界，不应通过放宽 disposal 条件掩盖入口不变量缺失。

## 5. 修复方向

在 `startPlanRunnerTool` 读取 prompt 和创建任何 worktree/state 前，要求非空 `context.sessionID`；缺失时 fail closed。保留 runtime disposal 对 terminal barrier 和 parent notification 的现有要求。

## 6. 验证与防回归

新增测试证明缺失 parent session 时工具拒绝且不创建 worktree。并发启动多个正常 run 的测试继续证明 parent registry 通过 plugin `enqueueState` 串行追加，不发生 task ID 丢失。
