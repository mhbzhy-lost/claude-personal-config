# Bug: OpenCode custom Anthropic provider 不自动提示录入 API key

## 现象

使用 `anthropic-cached/claude-opus-4-6` 发起请求时，OpenCode 没有弹出 API key
输入框，而是直接报错：

```text
Anthropic API key is missing. Pass it using the 'apiKey' parameter or the
ANTHROPIC_API_KEY environment variable.
```

本机 `opencode auth list` 只显示 DeepSeek credential，没有 `anthropic-cached`。
`~/.config/opencode/opencode.json` 中 `anthropic-cached` provider 已存在，但
`options` 里没有 `apiKey`。

## 根因 (6 要素)

1. **触发条件**：OpenCode custom provider `anthropic-cached` 使用
   `@ai-sdk/anthropic`，provider config 不写 `options.apiKey`，且
   `~/.local/share/opencode/auth.json` 中没有 `anthropic-cached` credential。
2. **期望链路**：OpenCode 在使用 custom provider 时应引导用户录入 key，或通过
   `opencode auth login -p anthropic-cached` 录入 credential；之后请求由 OpenCode
   把 key 注入给 provider SDK。
3. **实际链路**：`opencode auth login -p anthropic-cached` 返回
   `Unknown provider "anthropic-cached"`；运行模型时也不自动弹出录入框，`@ai-sdk/anthropic`
   在本地初始化阶段发现没有 key 后直接抛错。
4. **关键假设失效**：之前假定 OpenCode CLI 的 `auth login -p <custom-provider-id>`
   能处理 custom provider。实际 1.15.12 的 CLI `-p` 只识别内置 / models.dev provider；
   官方文档对 custom provider 的 key 录入路径是 TUI `/connect` 里选择 `Other` 后输入
   provider id。
5. **旁证**：
   - `opencode auth login -p anthropic-cached` 实测报 unknown provider。
   - 临时 HOME 中手写 `~/.local/share/opencode/auth.json` 的
     `"anthropic-cached": {"type":"api","key":"..."}` 后，`opencode auth list` 能显示该
     custom credential，说明 credential id 本身是可被读取的。
   - 当前真实 `auth.json` 没有 `anthropic-cached`，所以运行时缺 key。
6. **影响范围**：所有通过仓库生成的 custom provider：
   - `anthropic-cached`
   - `openai-compatible-cached`
   如果用户只运行模型、不先在 TUI `/connect -> Other` 录入同名 credential，就会缺 key。
   非交互 / headless 使用更容易触发，因为没有自然的 TUI `/connect` 步骤。

## 修复方向

推荐不要回到 proxy `.env`，也不要默认把真实 key 写入 `opencode.json`。更合理的修法是：

1. 子仓配置器继续生成 provider config，但额外提供一个 OpenCode credential bootstrap
   命令或脚本，负责向 `auth.json` 写入指定 custom provider id 的 API key。
2. `init_opencode.sh` 只安装 provider，不管理 key；但输出明确提示：
   - TUI 方式：`/connect -> Other -> anthropic-cached`
   - headless 方式：运行子仓提供的 credential 写入命令。
3. credential 写入命令必须：
   - 只写 `~/.local/share/opencode/auth.json`；
   - 保留已有 provider credentials；
   - 文件权限保持 `0600`；
   - 不把 key 写入 repo、`opencode.json` 或 proxy `.env`。

## 验证方式

- 无 credential 时，运行模型能复现缺 key 报错。
- 写入 `anthropic-cached` credential 后，`opencode auth list` 显示该 provider。
- 通过 mock Anthropic upstream 验证 OpenCode 对 `@ai-sdk/anthropic` 请求带
  `x-api-key`，proxy 能继续收到并转发。
- `bash scripts/test-init-opencode-cache-proxy.sh` 仍通过，确保 provider config 不回退
  到 `options.apiKey`。

## 修复记录

- 子仓新增 `proxy/bin/opencode-cache-proxy-auth.mjs` 交互式 bootstrap。
- 命令从现有 `opencode.json` 读取 provider 列表，用户选择 provider 后输入 key。
- key 只写入 `~/.local/share/opencode/auth.json`，保留已有 credential，并强制
  `0600` 权限。
- 写入前获取本地 lock，避免多终端同时 bootstrap 时丢失已有 credential 更新。
- 新增 `proxy/test/opencode-auth.test.mjs` 覆盖 provider 列表、auth 写入和非 TTY
  交互输入。
