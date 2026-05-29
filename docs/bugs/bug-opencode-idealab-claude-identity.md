# Bug: OpenCode Idealab Anthropic provider 缺少 Claude 身份头

## 现象

`anthropic-idealab-cached` 已能被 OpenCode 识别，provider 的 upstream 也已指向
`https://idealab.alibaba-inc.com/api/anthropic`。但真实请求：

```bash
opencode run --model anthropic-idealab-cached/claude-opus-4-6 --print-logs --log-level DEBUG --format json hello
```

仍失败，上游返回：

```json
{"type":"invalid_request_error","message":"opus计划仅限在claude code中使用"}
```

## 根因 (6 要素)

1. **触发条件**：OpenCode 使用 `@ai-sdk/anthropic` 发送请求，经本地 proxy 转发到
   Idealab Opus 上游。
2. **期望链路**：OpenCode provider 把平台所需 upstream、cache strategy、
   `metadata.user_id` 和上游身份头都写入 provider headers；proxy 只负责剥离控制头并
   转发为真实上游请求。
3. **实际链路**：provider 只写了 upstream/cache/user_id，没有写
   `x-cache-proxy-upstream-user-agent`，proxy 因此保留 OpenCode/AI SDK 原始
   user-agent。
4. **关键假设失效**：之前已有 proxy 层支持 `upstreamUserAgent`，但新
   `anthropic-idealab-cached` provider 没有把该控制头纳入平台配置，导致已有能力没有
   被 OpenCode 路径启用。
5. **旁证**：
   - OpenCode 日志显示模型为
     `anthropic-idealab-cached/claude-opus-4-6`，URL 是本地
     `/apps/anthropic/v1/messages`。
   - 上游响应头包含 `x-idealab-reqid` 与 Idealab 网关字段，说明 upstream 已正确。
   - 错误文案是身份限制，不是 403、missing API key 或官方 Anthropic 域名拒绝。
   - 代码中 `proxy-control-headers.mjs` 和 `anthropic-handler.mjs` 已支持
     `x-cache-proxy-upstream-user-agent`，缺口在 provider 生成。
6. **影响范围**：所有通过 OpenCode 使用 `anthropic-idealab-cached` 的 Opus 请求都会
   被 Idealab 身份探测拒绝；Qwen/OpenAI-compatible provider 不受影响。

## 修复方向

在 `anthropic-idealab-cached` provider headers 固定写入
`x-cache-proxy-upstream-user-agent`，值复用 proxy 已有 Claude-compatible 默认
user-agent。这样仍然不依赖 `.env` 或启动参数，平台配置完整保留在 provider 中。

同时删除 proxy 入口/构造层的 `ANTHROPIC_CACHE_PROXY_*` 与
`upstreamUserAgent` / `metadataUserId` 开关，避免同一个 Idealab Opus provider 存在多套
身份配置来源。proxy 只消费 provider 传入的 `x-cache-proxy-*` 控制头。

## 验证方式

- `node --test test/client-config.test.mjs` 覆盖 provider header。
- `bash scripts/test-init-opencode-cache-proxy.sh` 覆盖本机 init 生成的 provider header。
- `opencode run --model anthropic-idealab-cached/claude-opus-4-6 --format json hello`
  不再返回“opus计划仅限在claude code中使用”。

## 验证记录

2026-05-30 本机验证：

```bash
opencode run --model anthropic-idealab-cached/claude-opus-4-6 --format json hello
```

返回正常文本 `Hello! How can I help you today?`，OpenCode 统计显示首次请求
`cache.write=35191`、`cache.read=0`。
