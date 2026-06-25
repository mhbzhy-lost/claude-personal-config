# bug: plan-runner harness 在 hook 中使用同步 I/O

## 症状

`plan-runner-harness.js` 在 OpenCode plugin hook 中使用 `readFileSync`、`writeFileSync`、`appendFileSync`、`renameSync` 等同步文件操作。

## 影响

hook 运行在 OpenCode server 的 Node.js 主事件循环中；高频 `message.updated` / `message.part.updated` 或多 session 并发时，同步 I/O 会阻塞其他 hook、流式输出和 UI 反馈。

## 期望行为

hook 中的 runtime state 读写使用 `node:fs/promises` 异步 API，避免阻塞事件循环。

## 实际行为

state 读写、事件追加、计划文档写入和 session/task index 读写均使用同步 fs API。

## 根因

首个 harness 切片优先保证状态一致性和最小实现，沿用了同步脚本式 I/O，没有把 plugin server 的异步运行环境纳入约束。

## 修复方案

将 harness runtime I/O 改为 `fs/promises`，hook 串行 `await` 相关状态读写；原子写入失败时清理临时文件。

## 验证

单测锁定插件源码不再引用同步 fs helper，并跑完整 plugin 测试。
