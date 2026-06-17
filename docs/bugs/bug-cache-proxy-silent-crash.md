---
title: "cache proxy 无故消失"
tags: [bug, cache-proxy, reliability, observability]
severity: high
created: 2026-06-17
status: resolved
resolved_by: vendor/opencode-cache-proxy@daa1c4b
---

## 现象
- OpenCode 多窗口同时显示"无法连接"
- 杀掉一个窗口重启后，所有窗口恢复正常
- 怀疑 cache proxy 进程无故退出

## 现场证据
- 第一次检查：PID=5169（14:41 启动）
- 约 50 分钟后第二次检查：PID=38589（15:34 启动）← **PID 变化 = proxy 崩溃并被 plugin 重启**
- 健康检查接口：`{"ok":true,"activePids":[]}`（当前存活）
- 无 stderr 日志文件（stderr 被 pipe 到 plugin，plugin 又写 OpenCode SDK 日志）

## 根因（6 要素）

**触发条件**：请求流中任意未捕获的 Promise rejection 或同步异常

**直接原因**：`proxy/bin/bailian-cache-proxy.mjs` 注册了
`SIGTERM`/`SIGINT`/`SIGHUP` 信号处理和 `process.on("exit")`，但**没有**
`process.on("uncaughtException")` 和 `process.on("unhandledRejection")`。

**影响范围**：
- Node.js 默认行为：任何 unhandled rejection 会让进程以 code=1 死掉
- 信号处理器不会触发（不是 SIGTERM 而是 Node 主动 exit）
- `process.on("exit")` 会被调用，但 stderr 通过 pipe 到 plugin，plugin 又通过
  OpenCode SDK 记录（如果没在活跃 session 中可能被丢弃）

**崩溃窗口**：
- 旧 proxy 死掉 → 所有 OpenCode 窗口无法连接 upstream
- Plugin 只在**自己启动时**做 health check，**不会周期性监控**
- 直到某个窗口重启 opencode，才会触发 plugin → 重启 proxy → 所有窗口恢复

## 候选触发场景
1. `fetch() -> upstreamResponse` 期间未捕获的 rejection
2. `pipeline()` 流的 `collect` 异步生成器抛出未捕获错误
3. `keepalive manager` 定时器中未捕获的异常
4. `usageRecorder` 异步 JSONL 写入失败

## 实现修复

修复代码位于 `vendor/opencode-cache-proxy/proxy/src/crash-logging.mjs` 与
`vendor/opencode-cache-proxy/plugins/bailian-cache-proxy.js`。

### proxy 侧：新增 crash-logging.mjs

- `setupCrashHandlers()` 统一注册 `uncaughtException` / `unhandledRejection` /
  `SIGTERM` / `SIGINT` / `SIGHUP` / `exit` 六个事件
- 崩溃时**先写 stderr（即使管道坏了也不阻塞），再写文件日志**
- 文件日志路径：`$XDG_CACHE_HOME/bailian-cache-proxy/crash.log`
  （fallback `~/.cache/bailian-cache-proxy/crash.log`），调用 `mkdirSync(..., { recursive: true })`
  保证目录存在
- 字符串化使用 `node:util` 的 `inspect(reason, { depth: 2, maxStringLength: 2048 })`
  安全处理 circular / Buffer / 非 Error types，避免 `[object Object]` 信息丢失
- 信号退出码遵循 POSIX 约定（128 + signal number）

### plugin 侧：周期健康检查

- 30s `setInterval` 周期性调用 `healthCheck()`
- 失败时自动 `startProxy()` 重启
- **60s cooldown** 防止 fork-storm：proxy 二进制损坏时不会无限 respawn
- 异步回调用 async/try/catch 包裹，`healthCheck` 的 fetch 异常降级为 warn 日志
  而非 unhandled rejection
- 定时器调用 `unref()` 不阻塞 Node 进程退出

### 验证

- 210/210 opencode-cache-proxy 测试全绿
- 现场验证（EADDRINUSE 故意触发）：`crash.log` 成功写入 + stderr 完整堆栈
- 日常使用中若再次出现连接中断，可查 `~/.cache/bailian-cache-proxy/crash.log`
  获取精确崩溃堆栈定位根因

## 优先级
- **高**：proxy 是多个 OpenCode 窗口的共享依赖，崩溃影响面大
- **中**：plugin 的 health check 只在启动时执行，无周期监控，自愈延迟到下一个窗口重启
  → 已通过 30s 周期检查解决
