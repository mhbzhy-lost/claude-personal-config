# OpenCode 看不到 Anthropic 缓存 provider

## 现象

OpenCode 当前全局配置 `~/.config/opencode/opencode.json` 的 `provider` 里只有
`openai-compatible-cached`，看不到刚为 Opus API 设计的 Anthropic provider。

本机复现：

```text
Object.keys(provider) = ["openai-compatible-cached"]
```

## 期望行为

运行 `init_opencode.sh` 或 cache proxy 的配置入口后，OpenCode 应同时看到：

- `openai-compatible-cached`：Qwen/OpenAI-compatible 缓存 provider
- 一个 Anthropic provider：走 `@ai-sdk/anthropic`，`baseURL` 指向本地 proxy 的
  `/apps/anthropic` 路径，用于 Opus API 缓存链路

## 调用链

`init_opencode.sh`
→ `configure_opencode_cache_proxy`
→ `vendor/opencode-cache-proxy/proxy/bin/bailian-cache-proxy-configure.mjs opencode`
→ `configureOpenCodeCacheProxy()`
→ `buildOpenCodeProvider()`
→ 写入 `opencode.json.provider["openai-compatible-cached"]`

当前链路只写 OpenAI-compatible provider，没有任何 Anthropic provider 构造函数或
upsert 逻辑。

## 根因

上一轮修复只完成了 proxy 服务端的 Anthropic Messages API 路由、cache/bypass 模式、
UA 兼容和 `metadata.user_id` 注入；没有同步扩展 OpenCode 客户端配置生成器。

因此手工临时测试里的 `@ai-sdk/anthropic` provider 没有进入可复现安装路径，
`init_opencode.sh` 重跑后仍不会写入该 provider。

## 影响范围

- OpenCode 无法直接从模型列表选择 Opus Anthropic 缓存 provider。
- 已提交的 proxy 服务端能力仍可用，但只能通过手工临时 `opencode.json` 使用。
- Qwen/OpenAI-compatible cached provider 不受影响。

## 修复计划

1. 在 `client-config.mjs` 增加 Anthropic OpenCode provider 构造和 upsert。
2. provider 使用 `npm: "@ai-sdk/anthropic"`，`baseURL` 指向
   `http://127.0.0.1:<port>/apps/anthropic`。
3. 默认不写 `apiKey`，使用 OpenCode auth storage；保留显式 env 模式用于自动化。
4. 至少提供一个 Opus 模型条目，模型 id 与实际上游配置保持可通过参数覆盖。
5. 更新 configure CLI 参数、README、`.env.example` 或安装文档。
6. 先补 RED 测试证明当前缺失，再实现并跑完整测试。

## 修复结果

已实现：

- OpenCode 配置生成器新增 `anthropic-cached` provider。
- provider 使用 `@ai-sdk/anthropic`，本地 base URL 为
  `http://127.0.0.1:<port>/apps/anthropic/v1`。
- 默认模型为 `claude-opus-4-6`，可通过
  `--opencode-anthropic-models` 或
  `OPENCODE_CACHE_PROXY_ANTHROPIC_MODELS` 覆盖。
- 默认不写 `apiKey`，让 `opencode auth login -p anthropic-cached` 接管 provider
  key；如需 env 模式，可显式传
  `--opencode-anthropic-api-key-env` 或设置
  `OPENCODE_CACHE_PROXY_ANTHROPIC_API_KEY_ENV`。

## 验证方式

已验证：

```bash
cd vendor/opencode-cache-proxy/proxy
node --test test/client-config.test.mjs
npm test
cd ../../..
bash scripts/test-init-opencode-cache-proxy.sh
```

本机安装验证已执行：

```bash
bash init_opencode.sh
opencode models anthropic-cached
```

输出包含：

```text
anthropic-cached/claude-opus-4-6
```
