# bug: OpenCode 探针用外部 sleep 命令等待

## 症状

`scripts/opencode-subagent-event-probe.mjs` 的 `sleepMs` 通过 `spawnSync("sleep", ...)` 等待。

## 影响

- Windows 或极简容器中可能没有 `sleep` 二进制，探针会直接失败。
- Unix 环境每次轮询都会 fork 子进程，等待 server ready 或 repair evidence 时开销不必要。

## 期望行为

等待逻辑应在 Node 进程内完成，不依赖平台 shell 命令。

## 实际行为

`sleepMs` 依赖外部命令，并把毫秒转换为秒传给系统 `sleep`。

## 根因

探针脚本保持同步控制流时复用了 shell sleep，而不是使用 Node 内建同步等待能力。

## 修复方案

使用 `Atomics.wait` 在进程内完成同步等待，保留现有 `runProbe` 同步 API。

## 验证

单测检查探针脚本不再调用 `spawnSync("sleep")`，且使用 `Atomics.wait`。
