# Bug: OpenCode Anthropic provider upstream 与 key 来源不匹配

## 现象

`opencode-cache-proxy-auth` 已正常写入 `anthropic-cached` key，`opencode auth list`
能看到：

```text
anthropic-cached api
```

但启动 OpenCode 后输入 `hello`，或者直接运行非交互命令：

```bash
opencode run --model anthropic-cached/claude-opus-4-6 --print-logs --log-level DEBUG --format json hello
```

报错：

```json
{
  "error": {
    "type": "forbidden",
    "message": "Request not allowed"
  }
}
```

## 根因 (6 要素)

1. **触发条件**：OpenCode 使用 `anthropic-cached/claude-opus-4-6`，provider key 已通过
   OpenCode auth storage 写入，但 `~/.config/opencode/opencode.json` 中
   `anthropic-cached.options.headers["x-cache-proxy-upstream-base-url"]` 仍是
   `https://api.anthropic.com`。
2. **期望链路**：OpenCode → `@ai-sdk/anthropic` → 本地 proxy
   `/apps/anthropic/v1/messages` → 用户实际 key 对应的 Anthropic-compatible gateway。
3. **实际链路**：OpenCode 确实打到本地 proxy，但 provider 控制头要求 proxy 转发到
   `https://api.anthropic.com`。用户当前 key 来自内部中转站，不是 Anthropic 官方
   API key，因此官方域名返回 403。
4. **关键假设失效**：之前把 provider key 迁到 OpenCode auth 后，默认 upstream 仍写死为
   `https://api.anthropic.com`；这只适合官方 Anthropic key，不适合所有
   Anthropic-compatible gateway。
5. **旁证**：
   - 非交互 `opencode run ...` 日志确认模型是
     `anthropic-cached/claude-opus-4-6`。
   - OpenCode 错误中的 URL 是本地 proxy：
     `http://127.0.0.1:48761/apps/anthropic/v1/messages`，说明本地 provider 与 auth
     链路已进入 proxy。
   - upstream 响应头包含 `server: cloudflare`、`cf-ray`，响应体是
     `{"type":"forbidden","message":"Request not allowed"}`，说明 403 来自被转发的
     upstream，不是本地 proxy 自己拒绝。
   - 当前 `~/.claude/idealab-settings.json` 中 Anthropic-compatible endpoint 是
     `https://idealab.alibaba-inc.com/api/anthropic`，与 OpenCode provider 的
     `https://api.anthropic.com` 不一致。
6. **影响范围**：所有使用非官方 Anthropic-compatible gateway key 的
   `anthropic-cached` OpenCode 请求都会失败；官方 Anthropic key 可能不受影响。
   重新运行 `init_opencode.sh` 还会继续把 upstream 写回默认官方域名。

## 修复方向

改为 provider 即平台配置单元，不再用环境变量或启动参数改写 Anthropic upstream：

1. 删除通用 `anthropic-cached` provider，新增 `anthropic-idealab-cached`。
2. `anthropic-idealab-cached` 固定使用 `@ai-sdk/anthropic`、本地 proxy
   `/apps/anthropic/v1`，并在 provider headers 中写入
   `https://idealab.alibaba-inc.com/api/anthropic`。
3. 移除 `bailian-cache-proxy-configure.mjs` 的 Anthropic upstream/cache/model 覆盖参数；
   主仓 `init_opencode.sh` 只传 repo/config/plugin 路径与本地端口。
4. 不把 key 写回 `.env` 或 `opencode.json`；key 仍由 OpenCode auth storage 管理。
5. 如果未来接入另一个 Anthropic-compatible 平台，新增另一个平台专属 provider，
   而不是在一个 provider 上再挂多套配置。

## 验证命令

重新生成 OpenCode 配置：

```bash
bash init_opencode.sh
```

确认模型与请求：

```bash
opencode models anthropic-idealab-cached
opencode run --model anthropic-idealab-cached/claude-opus-4-6 --format json hello
```

## 验证方式

- `opencode run --model anthropic-idealab-cached/claude-opus-4-6 --print-logs --log-level DEBUG --format json hello`
  不再返回 403。
- `~/.config/opencode/opencode.json` 中
  `anthropic-idealab-cached.options.headers["x-cache-proxy-upstream-base-url"]` 等于
  `https://idealab.alibaba-inc.com/api/anthropic`。
- `~/.config/opencode/opencode.json` 不再包含旧 `anthropic-cached` provider。
- `bash scripts/test-init-opencode-cache-proxy.sh` 覆盖默认配置和旧 provider 清理。
