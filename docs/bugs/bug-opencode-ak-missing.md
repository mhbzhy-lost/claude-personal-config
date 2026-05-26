# bug-opencode-ak-missing

## 现象

启动 OpenCode 后，默认模型 `openai-compatible-cached/qwen3.7-max` 请求本地 proxy：

`http://127.0.0.1:48761/compatible-mode/v1/chat/completions`

上游返回 401：

`You didn't provide an API key. You need to provide your API key in an Authorization header using Bearer auth`

本地复现命令：

`opencode run --print-logs --format json 'Reply with exactly OK.'`

本地 usage 记录显示 2026-05-26 出现多次 `status=401`，而 2026-05-24 同模型请求曾为 `status=200`。

## 调用链

1. OpenCode 读取 `~/.config/opencode/opencode.json`。
2. 当前 provider `openai-compatible-cached` 指向本地 proxy：`http://127.0.0.1:48761/compatible-mode/v1`。
3. OpenCode plugin `~/.config/opencode/plugins/bailian-cache-proxy.js` 启动 `vendor/opencode-cache-proxy/proxy/bin/bailian-cache-proxy.mjs`。
4. proxy 启动时读取 `vendor/opencode-cache-proxy/proxy/.env`。
5. proxy 转发 `/chat/completions` 到 DashScope/OpenAI-compatible upstream。
6. upstream 因请求缺少 `Authorization: Bearer ...` 返回 401。

## 根因假设

1. `proxy/.env` 中密钥变量名仍是旧的 `DASHSCOPE_API_KEY`，但当前 proxy 代码只把 `OPENAI_COMPATIBLE_API_KEY` 作为默认上游密钥。
2. `~/.config/opencode/opencode.json` 的 provider `apiKey` 仍引用 `{env:DASHSCOPE_API_KEY}`，但当前启动环境没有导出该变量，OpenCode 没有给本地 proxy 请求附带 Authorization header。
3. 本地 proxy 未启动或未加载 `.env`，导致请求没有经过预期的密钥注入逻辑。

## 验证方式

- `opencode run --print-logs --format json 'Reply with exactly OK.'` 复现 401。
- OpenCode 日志显示 proxy 成功启动并加载 `.env`：`loaded .env ... (2 new vars)`，排除“proxy 未启动或未读 env”。
- `~/.config/opencode/opencode.json` 中 `openai-compatible-cached.options.apiKey` 为 `{env:DASHSCOPE_API_KEY}`。
- 当前 shell 环境中没有 `DASHSCOPE_API_KEY` / `OPENAI_COMPATIBLE_API_KEY` 等相关 key 导出。
- `proxy/.env` 中存在 `DASHSCOPE_API_KEY` / `DASHSCOPE_BASE_URL`，缺少 `OPENAI_COMPATIBLE_API_KEY` / `OPENAI_COMPATIBLE_UPSTREAM_BASE_URL`。
- 代码确认：`proxy/src/server.mjs` 的默认密钥只读取 `env.OPENAI_COMPATIBLE_API_KEY || ""`；`proxy/bin/bailian-cache-proxy.mjs` 的 upstream URL 只读取 `OPENAI_COMPATIBLE_UPSTREAM_BASE_URL`。

## 根因确认

OpenCode 和 proxy 的密钥变量名处在旧/新配置混用状态：本地 `.env` 只有 `DASHSCOPE_*`，但当前 proxy 默认密钥逻辑只读取 `OPENAI_COMPATIBLE_*`；同时启动环境没有导出 `DASHSCOPE_API_KEY`，所以请求转发到上游时没有 Authorization header。

## 影响范围

- 所有通过 `openai-compatible-cached` provider 访问本地 proxy 的 OpenCode 会话。
- GUI 或非交互 shell 启动 OpenCode 时更容易触发，因为不会读取用户 shell 中临时 export 的 `DASHSCOPE_API_KEY`。
- Qwen Code 或其他客户端如果依赖同一个 `proxy/.env`，且没有单独设置 `OPENAI_COMPATIBLE_API_KEY`，也可能触发同类 401。
- 修复前 `init_opencode.sh` 仍用 `OPENCODE_CACHE_PROXY_API_KEY_ENV:-DASHSCOPE_API_KEY` 生成 OpenCode provider，会继续制造旧变量名配置。

## 修复方案草案

推荐分两层处理：

1. 立即恢复本机可用性：在 `vendor/opencode-cache-proxy/proxy/.env` 中把 `DASHSCOPE_API_KEY` / `DASHSCOPE_BASE_URL` 直接重命名为 `OPENAI_COMPATIBLE_API_KEY` / `OPENAI_COMPATIBLE_UPSTREAM_BASE_URL`，保留原值，然后重启 OpenCode/proxy。
2. 修仓库根因：把 `init_opencode.sh` 的默认 provider env 从 `DASHSCOPE_API_KEY` 改为 `OPENAI_COMPATIBLE_API_KEY`，避免下次重跑 init 后再次写回旧变量名。

第一步只改本地忽略文件，不进 Git；第二步是仓库代码变更，需要补充覆盖初始化配置生成路径的测试或等效验证。

## 修复后验证

- `opencode run --format json 'Reply with exactly OK.'` 不再返回 401；usage 记录出现 `status=200`。
- `bash scripts/test-init-opencode-cache-proxy.sh` 通过，覆盖 OpenCode provider env 名生成路径。
- `bash -n init_opencode.sh` 通过。
- `git diff --check` 通过。
