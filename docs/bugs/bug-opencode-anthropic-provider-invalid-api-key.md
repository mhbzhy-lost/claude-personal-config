# OpenCode Anthropic provider 报 invalid API key

## 现象

OpenCode 已能看到 `anthropic-cached/claude-opus-4-6`，但实际运行时提示
invalid API key。

## 已确认事实

当前 `~/.config/opencode/opencode.json` 中：

```json
{
  "provider": {
    "anthropic-cached": {
      "npm": "@ai-sdk/anthropic",
      "options": {
        "baseURL": "http://127.0.0.1:48761/apps/anthropic/v1",
        "apiKey": "{env:ANTHROPIC_API_KEY}"
      }
    }
  }
}
```

当前 Codex shell 环境里没有导出 `ANTHROPIC_API_KEY`，但 proxy 自己的
`proxy/.env` 里有 `ANTHROPIC_API_KEY` 和 `ANTHROPIC_UPSTREAM_BASE_URL`。

也就是说这里存在两个不同层级的 key：

- **OpenCode provider key**：给 `@ai-sdk/anthropic` 用，会生成发往本地 proxy 的
  `x-api-key`。
- **proxy upstream key**：proxy 从自己的 `.env` 读取，用于访问真实 Anthropic
  兼容上游。

## 调用链

OpenCode
→ `@ai-sdk/anthropic`
→ 本地 `http://127.0.0.1:48761/apps/anthropic/v1/messages`
→ `proxy/src/anthropic-handler.mjs`
→ `forwardHeaders(request, bodyLength, apiKey, ...)`
→ 真实 Anthropic 兼容上游

当前 `forwardHeaders` 的行为是：

- 如果客户端请求已经带 `x-api-key`，就原样转发。
- 只有客户端请求没有 `x-api-key` 时，才使用 proxy `.env` 中的 fallback
  `ANTHROPIC_API_KEY`。

## 根因假设

`anthropic-cached` provider 把 OpenCode 进程环境里的 `ANTHROPIC_API_KEY` 作为
客户端 key 发送给本地 proxy；但这个环境变量未稳定注入到 OpenCode 进程，或其值与
proxy `.env` 中的上游 key 不一致。

更关键的是，OpenCode 官方 provider 文档明确说明：

- custom provider 的凭据应通过 `/connect` / `opencode auth login` 写入
  `~/.local/share/opencode/auth.json`。
- `options.apiKey` 是“不使用 auth 时”的可选配置。

本地 `opencode providers login -p anthropic-cached` 也能进入 `Add credential`
流程，说明 `anthropic-cached` provider ID 可以走 OpenCode 自己的填写 key 流程。

因此当前根因不是“proxy 必须强制接管 key”，而是我们生成 provider 时默认写入了
`options.apiKey: {env:ANTHROPIC_API_KEY}`，把 OpenCode custom provider 从正常的
auth.json 凭据路径拉回了进程环境变量路径。

## 影响范围

- 影响 `anthropic-cached` provider。
- 不影响 `openai-compatible-cached`。
- 不影响 proxy 服务端已实现的 cache/bypass 逻辑。

## 修复方向

建议把 OpenCode `anthropic-cached` provider 的默认配置改回 OpenCode 原生认证流：

1. 默认只写 `options.baseURL`，不写 `options.apiKey`。
2. 用户通过 `opencode auth login -p anthropic-cached` 或 TUI `/connect` 的 Other
   provider 填写 key，凭据进入 OpenCode `auth.json`。
3. 仅当用户显式要求 env 管理时，才通过配置入口写入 `options.apiKey`。
4. proxy 继续保留服务端 `ANTHROPIC_API_KEY` fallback：客户端没带 `x-api-key` 时可由
   proxy `.env` 补齐；客户端带 key 时保持 OpenCode provider auth 的语义。

## 验证方式

修复前应增加 RED：

- 默认生成的 `anthropic-cached` provider 不应包含 `options.apiKey`。
- 显式传入 `anthropicApiKeyEnv` 时，才写入 `{env:<name>}`。
- `init_opencode.sh` 默认不应传 `--opencode-anthropic-api-key-env`。

修复后验证：

```bash
cd vendor/opencode-cache-proxy/proxy
node --test test/anthropic-handler.test.mjs test/client-config.test.mjs
npm test
```

再重跑：

```bash
bash init_opencode.sh
opencode models anthropic-cached
```

## 修复记录

- 默认 `anthropic-cached` provider 不再写 `options.apiKey`。
- `OPENCODE_CACHE_PROXY_ANTHROPIC_API_KEY_ENV` 仅作为显式 opt-in，适用于不想使用
  OpenCode auth storage 的自动化场景。
- 已重跑 `init_opencode.sh`，本机 `~/.config/opencode/opencode.json` 中
  `anthropic-cached.options` 只剩本地 proxy `baseURL`。
- 当前本机 `opencode auth list` 只有 DeepSeek 凭据；要实际请求
  `anthropic-cached`，需要执行 `opencode auth login -p anthropic-cached` 后填入该
  provider 对应 key。
