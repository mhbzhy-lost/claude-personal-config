# opencode-cache-proxy-auth 只显示两个 provider

## 1. 现象

运行 `proxy/bin/opencode-cache-proxy-auth.mjs` 时，provider 菜单只显示：

- `anthropic-idealab-cached`
- `openai-compatible-cached`

没有显示新期望的：

- `openai-bailiab-api`
- `openai-bailian-token-plan`

## 2. 影响

用户无法通过 auth bootstrap 为 `openai-bailiab-api` 和
`openai-bailian-token-plan` 录入 API key。旧的
`openai-compatible-cached` 仍出现在菜单里，和新的 provider 配置语义不一致。

## 3. 复现步骤

在 `vendor/opencode-cache-proxy` 下执行：

```bash
node --input-type=module -e 'import { defaultOpenCodeConfigPath } from "./proxy/src/client-config.mjs"; import { listOpenCodeProviderChoices } from "./proxy/src/opencode-auth.mjs"; const configPath=defaultOpenCodeConfigPath(); console.log("configPath="+configPath); const choices=await listOpenCodeProviderChoices({configPath}); for (const p of choices) console.log(`${p.id}\t${p.name}\t${p.npm}`);'
```

实际输出只包含两个 provider：

```text
configPath=/Users/leshi.zhy/.config/opencode/opencode.json
anthropic-idealab-cached    Anthropic Idealab cached    @ai-sdk/anthropic
openai-compatible-cached    OpenAI-compatible cached    @ai-sdk/openai-compatible
```

## 4. 根因

`opencode-cache-proxy-auth.mjs` 不生成 provider，也不会调用配置生成器。
它只读取当前 `opencode.json` 的 `provider` 字段并展示。

当前默认配置文件 `/Users/leshi.zhy/.config/opencode/opencode.json` 仍是旧状态：

- 仍包含 `openai-compatible-cached`
- 不包含 `openai-bailiab-api`
- 不包含 `openai-bailian-token-plan`

同一份新代码在临时配置文件上调用 `configureOpenCodeCacheProxy` 已验证会生成 3 个
provider：

```text
anthropic-idealab-cached
openai-bailiab-api
openai-bailian-token-plan
```

因此问题不是 auth 脚本的排序或过滤逻辑，也不是 Anthropic endpoint 误路由；而是
实际被 auth 脚本读取的 OpenCode 配置文件尚未用新配置生成器刷新。

## 5. 方案

推荐先执行配置刷新，再运行 auth：

```bash
node proxy/bin/bailian-cache-proxy-configure.mjs opencode
node proxy/bin/opencode-cache-proxy-auth.mjs
```

若希望 `opencode-cache-proxy-auth.mjs` 单独运行时也更不容易踩坑，可以增强 auth
脚本：当发现旧 `openai-compatible-cached` 且缺少新 provider 时，输出明确提示用户先
运行 configure，而不是静默展示旧菜单。

## 6. 验证方式

刷新配置后验证：

```bash
node --input-type=module -e 'import { listOpenCodeProviderChoices } from "./proxy/src/opencode-auth.mjs"; console.log((await listOpenCodeProviderChoices()).map((p) => p.id).join("\n"))'
```

期望包含：

```text
anthropic-idealab-cached
openai-bailiab-api
openai-bailian-token-plan
```

同时保留自动化测试：

```bash
npm test -- test/client-config.test.mjs test/opencode-auth.test.mjs
```
