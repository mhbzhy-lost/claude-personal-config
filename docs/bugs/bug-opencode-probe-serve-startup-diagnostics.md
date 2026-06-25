# bug: OpenCode 探针 server 启动失败缺少日志路径

## 症状

`runProbe` 等待 `opencode serve` ready 超时后，只返回：

```text
opencode serve did not become ready on <url>
```

## 影响

端口占用、配置错误、二进制异常等启动失败场景下，调用方不知道应该查看哪个 serve 日志文件，排查成本高。

## 期望行为

错误信息应包含 `serveLogPath`，让排查者能直接打开日志。

## 实际行为

`runProbe` 已经把 serve stdout/stderr 写入 `paths.serveLogPath`，但失败返回没有暴露该路径。

## 根因

早期探针只为自动化判定 ready/not ready，忽略了失败诊断信息的可达性。

## 修复方案

抽取 `formatServeNotReadyError`，把 attach URL 和 serve log path 都写入错误信息。

## 验证

单测覆盖启动失败错误信息同时包含 attach URL 和 `opencode-serve.log`。
