# bug-bailian-proxy-missing-env-loading

## 现象

OpenCode 选 `bailian-custom-cached/qwen3.6-*` 模型发对话时，agent 立即收到上游 401：

```
You didn't provide an API key. You need to provide your API key in an
Authorization header using Bearer auth (i.e. Authorization: Bearer YOUR_KEY).
```

## 调用链

OpenCode 进程 → `@ai-sdk/openai-compatible` provider → 解析
`apiKey: "{env:DASHSCOPE_API_KEY}"` → 拿到空字符串（OpenCode 进程 env 里没有
`DASHSCOPE_API_KEY`） → 不带 `Authorization` header 发请求到 proxy
`http://127.0.0.1:48761/compatible-mode/v1/chat/completions` → proxy
`forwardHeaders` 检测到 `!headers.authorization && apiKey` → 但 proxy 进程
也没有 `process.env.DASHSCOPE_API_KEY`，`apiKey` 是空字符串 → fallback
不触发 → 转发到 token-plan 上游时**无 auth header** → 上游返 401。

## 根因假设

1. **OpenCode 没解析 `{env:VAR}` 占位符** —— 排除：OpenCode 1.14+ 文档明确支持该占位符语法，前置 e2e 验过。
2. **OpenCode 进程 env 不含 DASHSCOPE_API_KEY** —— 实测 `DASHSCOPE_API_KEY: NOT set`，user shell 也没 export。
3. **proxy 进程 env 不含 DASHSCOPE_API_KEY** —— proxy 由 OpenCode plugin spawn 时继承 OpenCode env，OpenCode 没有 → proxy 也没有；proxy 启动入口（`bin/bailian-cache-proxy.mjs`）**未加载 skill-local `.env` 文件**，凭据完全孤立在 `opencode/proxy/.env` 文件里读不到。

假设 2 + 3 同时成立 → fallback 链全断 → 上游 401。

## 验证方式

- `echo $DASHSCOPE_API_KEY` 在 user shell 返回空 ✓
- `cat opencode/proxy/.env | grep -c DASHSCOPE_API_KEY` 返回 1（文件里有但没人读）✓
- 手动 spawn proxy + 用 curl **不带** Authorization header POST → 收到 401（与 OpenCode 现象一致）✓
- 修复后再跑同样 curl → 200 + 正常 chat completion ✓

## 根因确认

`opencode/proxy/bin/bailian-cache-proxy.mjs` 启动时不加载 skill-local `.env`，
导致 proxy 自身既不知道凭据也不知道 upstream URL；只能依赖 spawn 时继承
的 env，而 OpenCode 进程 env 在 GUI / 非交互 shell 启动场景下不含
`DASHSCOPE_API_KEY` / `DASHSCOPE_BASE_URL`。

## 影响范围

- **所有** OpenCode → bailian-custom-cached provider 的调用链：未在 zsh 里
  export 凭据的环境**全部 401**。
- e2e 脚本 `scripts/e2e-bailian-cache.mjs` 已经有自己的 inline `loadEnv()`，
  所以 e2e 测试期间这个 bug 不暴露——这正是为什么单测 e2e 全过却生产
  401 的原因。
- `BAILIAN_UPSTREAM_BASE_URL` 单一变量名也加剧问题：`.env` 用的是
  `DASHSCOPE_BASE_URL`，proxy 只看 `BAILIAN_UPSTREAM_BASE_URL`，user 写在
  `.env` 的 token-plan endpoint 实际**根本没生效**，proxy 默认走公共
  dashscope endpoint —— 当前刚好凑巧公共 endpoint 也不识别 user 的
  qwen3.6 model 名，所以 401 之外还可能 400 Model not exist。

## 修复方案

1. 抽 `src/load-env.mjs` —— 简单 KEY=VAL 解析器，不覆盖已有 env 值。
2. `bin/bailian-cache-proxy.mjs` 启动时调 `loadEnvFile()` 加载 skill-local
   `.env`，把 `DASHSCOPE_API_KEY` / `DASHSCOPE_BASE_URL` 注入 `process.env`。
   proxy 启动 log 多一行 "loaded .env from <path> (N vars)" 便于诊断。
3. `bin/bailian-cache-proxy.mjs` 把 upstream URL 解析改为 `BAILIAN_UPSTREAM_BASE_URL
   || DASHSCOPE_BASE_URL`，让 user 写在 `.env` 里 dashscope 命名空间的变量
   也能生效。
4. `scripts/e2e-bailian-cache.mjs` 改为引用同一份 `loadEnvFile`，去掉本地
   inline 副本，避免两份逻辑漂移。

**不引入新失败模式的论证**：

- `loadEnvFile` 在文件不存在时静默 return（不 throw）；shell 里已 export
  凭据的场景仍然优先生效（caller 已设的 env 不被覆盖）。
- `forwardHeaders` 的 fallback 已经存在，本次只是补齐"让 fallback 真有
  data 可填"。
- 凭据通过本地 .env 加载，proxy 进程 env 不出仓；fetch error stack 里
  也不含 key（key 只在 Authorization header）。

**测试**：

- `test/load-env.test.mjs` 6 个用例覆盖：文件不存在、KEY=VAL 解析、不
  覆盖已有值、quoted value 解包、注释/空行跳过、非法行不抛。
- 现有 47 个单测 + 新增 6 个 = **52/52 ✓**。
- 端到端：kill 旧 proxy → spawn 新 proxy → 不带 Authorization 的 curl →
  proxy 自动 fallback Bearer + 转发 → token-plan 返 200。

## 修复后验证

- ✅ 单测 52/52
- ✅ 真 dashscope curl + chat completion 200
- ⏳ user 启动 OpenCode 选 `bailian-custom-cached/qwen3.6-flash` 发对话验证 401 消失（user 端验证）

## 衍生 memory 条目

修这个 bug 时还踩到一个独立陷阱：`init_opencode.sh` 用 `$PY -c '...'`
单引号包裹一段 Python，在注释里不小心写了 `user's` 这样的 ASCII 单引号
导致 bash 字符串提前关闭、Python 收到不完整脚本。已在 `memory.md` 加新
条目"bash 单引号 Python heredoc 内的 apostrophe 提前终止字符串"，并改
init 脚本删除了 apostrophe。
