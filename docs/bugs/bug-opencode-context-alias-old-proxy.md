# OpenCode Opus context alias 被旧 proxy 原样转发

## 现象

在 OpenCode 中选择 `anthropic-idealab-cached/claude-opus-4-6-300k` 后，请求失败并提示：

```text
用户设置的model错误，model = claude-opus-4-6-300k
```

## 调用链

OpenCode model selector 使用 `~/.config/opencode/opencode.json` 中的自定义模型别名，
请求进入本地 cache proxy `127.0.0.1:48761`，再由 Anthropic handler 转发到
Idealab 上游。

## 根因假设

配置文件已经包含 `claude-opus-4-6-300k` 等 alias，但当前监听 `48761` 的 proxy
进程仍是旧运行时代码。旧代码不包含子模块提交 `a2f4b30` 中的 alias rewrite，
因此把 `body.model = claude-opus-4-6-300k` 原样发给上游；上游只识别真实模型
`claude-opus-4-6`，于是返回 model 错误。

## 验证证据

- OpenCode 日志中的上游错误明确包含 `model = claude-opus-4-6-300k`，说明 alias
  被转发到了上游，而不是在本地配置阶段失败。
- `~/.config/opencode/opencode.json` 已有 `claude-opus-4-6-300k` 及 context
  配置，说明 OpenCode 侧模型列表已更新。
- proxy usage 记录中可见 `model = claude-opus-4-6-300k`、`status = 200`、
  `stream_usage_seen = false`，说明请求到达 proxy，但没有拿到有效上游 usage。
- `127.0.0.1:48761` 仍由既有 node 进程监听，符合“发布后未重启 proxy”的表现。

## 根因确认

根因是运行中的 cache proxy 进程未重启，运行代码滞后于已提交的 alias rewrite
实现；不是 OpenCode provider 配置本身缺少 300k model。

## 影响范围

只影响新增 context alias 档位：

- `claude-opus-4-6-200k`
- `claude-opus-4-6-300k`
- `claude-opus-4-6-500k`
- `claude-opus-4-6-1m`

旧模型名 `claude-opus-4-6` 不受该问题影响。

## 修复方案

重启当前监听 `127.0.0.1:48761` 的 cache proxy，使其加载子模块提交 `a2f4b30`
之后的代码。重启后，proxy 会把 alias 写入本地 usage 记录，但上游请求体中的
`model` 会被改写为 `claude-opus-4-6`。

## 后续加固

可以考虑为 proxy 增加运行时代码版本或 commit hash 诊断输出，避免配置更新后旧
进程继续运行时只能从上游错误反推。
