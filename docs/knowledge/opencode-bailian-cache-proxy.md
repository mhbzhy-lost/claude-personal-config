---
title: OpenCode 百炼缓存代理
kind: integration
status: active
applies_to:
  - init_opencode.sh
  - opencode/plugins/bailian-cache-proxy.js
  - opencode/proxy/
last_verified: 2026-05-23
source: manual
---

# OpenCode 使用 `bailian-custom-cached` provider 走本地百炼缓存代理

OpenCode 只有选中 `bailian-custom-cached` provider 时才会经过本地代理。
其他 provider 不得复用这层代理。

## 适用场景

修改 OpenCode 百炼模型接入、显式缓存策略、provider 配置、代理生命周期或
`init_opencode.sh` 同步逻辑时，必须检查本文。

## 项目事实 / 约定

`init_opencode.sh` 会写入自定义 provider：

```json
{
  "provider": {
    "bailian-custom-cached": {
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "http://127.0.0.1:48761/compatible-mode/v1",
        "apiKey": "{env:DASHSCOPE_API_KEY}"
      }
    }
  }
}
```

`opencode/plugins/bailian-cache-proxy.js` 负责在 OpenCode 进程内启动代理并发送
heartbeat。`opencode/proxy/` 中的代理收到请求后，将 OpenAI-compatible chat
completions 请求注入百炼显式缓存 marker，再转发到默认 upstream：

```text
https://dashscope.aliyuncs.com/compatible-mode/v1
```

代理生命周期跟随 OpenCode 活跃 pid：只要仍有 pid 通过 heartbeat 存活，代理保持
运行；全部 pid 退出并超过 idle timeout 后，代理自行退出。

代理仅转发 chat completions 路径。`/__bailian_cache_proxy/*` 是本地控制接口，
其他路径返回 `404`。代理只接受未压缩 JSON 请求体，非 `identity` 的
`content-encoding` 返回 `415`。

## 原因

百炼显式缓存依赖请求体中的 `cache_control` marker，且受最多 4 个 marker、20 个
content block 回溯窗口和最小 cacheable token 数限制。把策略放在本地代理中，可以
独立于 OpenCode 的通用 provider 缓存逻辑迭代，并且不会影响其他 provider。

## Usage 观测（缓存命中率统计）

每次经过代理的 `/chat/completions` 请求结束后，都会把一条
**metadata-only** 记录（不含 prompt/completion 原文）追加到：

```text
${BAILIAN_CACHE_PROXY_USAGE_LOG:-${XDG_CACHE_HOME:-~/.cache}/bailian-cache-proxy/usage.jsonl}
```

字段含 `ts / proxy_pid / opencode_pid / model / status / duration_ms /
prompt_tokens / cached_tokens / cache_creation_input_tokens /
completion_tokens / cache_hit_ratio / request_id / is_stream /
stream_usage_seen`。

并发安全：写入用 `fs.promises.appendFile`（POSIX `O_APPEND`），单行 JSON
≤ PIPE_BUF (4096B)，多 OpenCode 进程共用一个代理时同进程内并发请求、
极端 race 下多个代理实例并发 append 都不会交错。

**Streaming 注入**：OpenCode AI SDK 默认 `stream=true`，代理在请求侧
自动注入 `stream_options.include_usage=true`（除非客户端显式设
`include_usage=false`），保证 SSE 末帧带 usage。否则 stream 路径完全
采不到 usage。

分析工具：

```bash
node opencode/proxy/scripts/cache-stats.mjs           # 默认 since=today
node opencode/proxy/scripts/cache-stats.mjs --since 2h
node opencode/proxy/scripts/cache-stats.mjs --since all --by status
node opencode/proxy/scripts/cache-stats.mjs --since today --json   # 给后续脚本喂数据
```

输出包括 overall + 按 model（或 status）分组的总命中率、avg duration、
streaming usage capture 率等。失败请求（status >= 400）也会记录，
便于看错误分布。

## 修改时注意

- provider id 固定为 `bailian-custom-cached`；不要改回通用 `bailian` 或影响其他
  provider。
- 插件通过 `../proxy/bin/bailian-cache-proxy.mjs` 启动代理，所以
  `init_opencode.sh` 必须同步 `~/.config/opencode/proxy -> 本仓 opencode/proxy`。
- 新增脚本或 shell 输出里变量紧邻中文标点时，用 `${var}`，避免 bash UTF-8 变量名坑。
- 代理默认拒绝超过 `BAILIAN_CACHE_PROXY_MAX_BODY_BYTES` 的请求，默认上限为
  `10485760` 字节。
- 代理测试需要监听 `127.0.0.1` 临时端口；在 Codex 沙箱中通常需要提权运行。

## 验证方式

```bash
cd opencode/proxy
npm test
```

```bash
bash -n init_opencode.sh
git diff --check
```

如果修改插件入口，也运行：

```bash
node --check opencode/plugins/bailian-cache-proxy.js
```

## 相关资料

- `opencode/proxy/README.md`
- `opencode/proxy/src/cache-planner.mjs`
- `opencode/proxy/src/server.mjs`
- `opencode/plugins/bailian-cache-proxy.js`
