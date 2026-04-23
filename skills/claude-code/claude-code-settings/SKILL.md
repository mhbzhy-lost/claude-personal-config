---
name: claude-code-settings
description: "Claude Code 配置系统：settings.json 字段、作用域优先级、permission 规则、env/CLI flag 对应关系。"
tech_stack: [claude-code]
capability: [cc-settings]
version: "claude-code-cli 2.1.111"
collected_at: 2026-04-17
---

# Claude Code Settings 系统

> 来源：https://code.claude.com/docs/en/settings
> 配合：`/en/iam`、`/en/cli-reference`、`/en/statusline`、`/en/output-styles`、`/en/memory`、`/en/terminal-config`

## 用途

为 Claude Code 一次性把「模型、权限、环境变量、MCP、钩子、状态栏」等行为按作用域固化下来，避免每次 `claude` 启动时手动传 flag；支持个人偏好、团队共享、企业强制策略三层隔离。

## 何时使用

- 团队希望把 coding 规范、permission 白名单、模型选择随仓库提交，新成员 `git clone` 即可用
- 个人希望跨项目复用 apiKeyHelper、statusLine、outputStyle
- CI/Agent SDK 场景需要用 `--settings` + 环境变量覆盖交互模式的默认配置
- 企业 IT 要用 managed scope 强制 deny 高危工具

## 作用域与优先级（核心概念）

四个作用域，由低到高覆盖：

| Scope       | 位置                                         | 典型用途                 | 入 git？      |
|-------------|----------------------------------------------|--------------------------|---------------|
| **Managed** | 系统级 `managed-settings.json` / plist / registry | 企业强制策略（deny/env） | IT 部署       |
| **User**    | `~/.claude/settings.json`                    | 个人偏好                 | 否            |
| **Project** | `<repo>/.claude/settings.json`               | 团队共享的项目规范       | 是（建议提交）|
| **Local**   | `<repo>/.claude/settings.local.json`         | 本人私有覆盖（沙盒 URL 等）| 否，写 `.gitignore`|

**加载优先级**（高覆盖低）：
```
CLI flags  >  Local  >  Project  >  User  >  Managed  >  内置默认
```

注意文档里 IAM 部分曾出现「Managed > Local」的企业强制场景描述——Managed 作用域中的 `permissions.deny` 被视为企业策略，会覆盖下层同名规则；普通字段仍按上表覆盖。运行 `/config` 可查看合并后的 effective settings 与每项来源。

## 基础用法

最小 `settings.json`（放到 `~/.claude/settings.json` 或 `.claude/settings.json`）：

```json
{
  "model": "claude-sonnet-4-6",
  "effort": "medium",
  "permissions": {
    "allow": ["Read", "Edit(src/**)", "Bash(git *)"],
    "deny":  ["Bash(ssh *)", "Bash(rm -rf *)"],
    "ask":   ["Bash(curl *)", "Edit(package.json)"]
  },
  "env": { "NODE_ENV": "development" },
  "statusLine": "~/.claude/status.sh",
  "includeCoAuthoredBy": true,
  "cleanupPeriodDays": 30
}
```

所有字段都是可选的，未写的字段回退到内置默认值。

## 关键字段速查

> 完整字段表见 `references/settings-fields.md`

**模型**
- `model` — 模型 ID 或别名（`sonnet` / `opus`），默认跟随认证
- `effort` — `low` / `medium` / `high` / `xhigh` / `max`，支持度因模型而异
- `fallbackModel` — 主模型过载时回退（仅 `-p` 打印模式生效）

**权限**
- `permissions.allow / deny / ask` — 规则数组（语法见下节）
- `defaultMode` — 会话起始权限模式：`default` / `acceptEdits` / `plan` / `auto` / `dontAsk` / `bypassPermissions`

**输出**
- `outputStyle` — `Default` / `Explanatory` / `Learning` / 自定义名
- `statusLine` — 底部状态栏脚本路径（绝对 / `~/` / 相对工作目录）

**认证**
- `apiKeyHelper` — 返回 API key 的 shell 脚本，每 5 分钟或 HTTP 401 调用一次
- `forceLoginMethod` — `anthropic` / `console` / `bedrock` / `vertex` / `foundry` / `sso`
- `forceLoginOrgUUID` — console 登录强制组织

**内存**
- `autoMemoryEnabled` — 默认 `true`
- `autoMemoryDirectory` — 默认 `~/.claude/projects/<project>/memory/`
- `claudeMdExcludes` — 要跳过的 CLAUDE.md glob 数组

**会话行为**
- `includeCoAuthoredBy` — git commit 追加 `Co-Authored-By` 行，默认 `true`
- `disableAllHooks` — 禁用全部 init/cleanup 钩子
- `cleanupPeriodDays` — 超过 N 天的 session 文件清理，默认 30

**环境变量**
- `env` — 对象，值会作为环境变量传给所有工具进程（Bash、MCP 等）

**MCP**
- `mcpServers` — 与 `.claude/mcp.json` 同结构的 MCP 服务器定义
- `enableAllProjectMcpServers` — 自动启用仓库内全部 `.claude/mcp.json`，默认 `false`（安全默认）

**高级**
- `awsAuthRefresh` — 自动刷新 Bedrock 凭证，默认 `true`
- `editorMode` — `default` / `vim`（Vim mode 也可改 `~/.claude.json` 的 `editorMode`）

## Permission 规则语法

规则匹配语法（同时用于 settings、`--allowedTools`、`--disallowedTools`）：

| 形式                     | 含义                                |
|--------------------------|-------------------------------------|
| `"Read"`                 | 精确匹配工具名                      |
| `"Bash(git *)"`          | Bash 且参数匹配 `git *` glob        |
| `"Edit(src/**/*.ts)"`    | Edit 且文件路径匹配 glob            |
| `"*"`                    | 所有工具                            |

Glob 语义：`*` 单段通配、`**` 跨路径段、`?` 单字符、`[abc]` 字符集。

**评估顺序**（每次工具调用都走一遍）：
1. `deny` 命中 → 拒绝（最高优先级）
2. `ask` 命中 → 弹窗询问
3. `allow` 命中 → 放行
4. 都没命中 → 由当前 `permission mode` 决定

Permission mode 默认行为：

| 模式                | 未命中规则时的行为                        |
|---------------------|------------------------------------------|
| `default`           | 弹窗询问                                 |
| `acceptEdits`       | 自动批准文件编辑，其余询问               |
| `plan`              | 只展示计划不实际执行                     |
| `auto`              | 自动批准「安全」工具，风险项询问         |
| `dontAsk`           | 自动批准全部                             |
| `bypassPermissions` | 跳过所有权限检查（等价 `--dangerously-skip-permissions`）|

## CLI flag 与 settings 字段对应

CLI flag 优先级高于所有 settings 文件。常用对应：

| CLI flag                | 覆盖的字段 / 行为                                |
|-------------------------|--------------------------------------------------|
| `--model <name>`        | `model`                                          |
| `--effort <level>`      | `effort`（会话级，不持久化）                     |
| `--fallback-model <n>`  | `fallbackModel`（仅 `-p`）                        |
| `--output-style <name>` | `outputStyle`                                    |
| `--permission-mode <m>` | `defaultMode`                                    |
| `--settings <path\|json>` | 额外加载一个 settings 文件或 JSON 字符串       |
| `--setting-sources`     | 逗号分隔 `user,project,local`，选择加载哪些作用域 |
| `--tools`               | 限制可用内置工具（`""` 全禁 / `"default"` / `"Bash,Edit,Read"`） |
| `--allowedTools`        | 追加 allow 规则                                   |
| `--disallowedTools`     | 追加 deny 规则并从 context 中移除                 |
| `--dangerously-skip-permissions` | `permission-mode bypassPermissions` 的快捷方式 |
| `--allow-dangerously-skip-permissions` | 把 bypassPermissions 加入 `Shift+Tab` 循环但不起始于它 |
| `--add-dir`             | 追加工作目录（不继承那里的 `.claude/` 配置）      |
| `--bare`                | 跳过 hooks/skills/plugins/MCP/auto memory/CLAUDE.md 自动发现，并设 `CLAUDE_CODE_SIMPLE=1` |
| `--system-prompt[-file]`| 替换整个默认系统提示（与 `-file` 互斥）          |
| `--append-system-prompt[-file]` | 追加到默认系统提示（可与替换组合）        |

`claude --help` 未列出全部 flag，未显示 ≠ 不存在。

## 环境变量清单

| 变量 | 用途 |
|---|---|
| `CLAUDE_CONFIG_DIR` | 覆盖配置目录（默认 `~/.claude`） |
| `CLAUDE_CODE_API_KEY_HELPER_TTL_MS` | `apiKeyHelper` 缓存时长，默认 5 分钟 |
| `CLAUDE_CODE_DISABLE_AUTO_MEMORY` | `1` 关闭 auto memory |
| `CLAUDE_CODE_SIMPLE` | bare 模式标志（由 `--bare` 自动设置） |
| `CLAUDE_CODE_OAUTH_TOKEN` | CI 用的长期 OAuth token（由 `claude setup-token` 生成） |
| `ANTHROPIC_API_KEY` | 直连 Anthropic API（优先级高于 OAuth 订阅，已批准后永久生效） |
| `ANTHROPIC_AUTH_TOKEN` | Bearer token，经 LLM 网关/代理 |
| `CLAUDE_CODE_USE_BEDROCK` / `_USE_VERTEX` / `_USE_FOUNDRY` | 切换云厂商后端 |
| `CLAUDE_CODE_DEBUG_LOGS_DIR` | 调试日志目录（`--debug-file` 会覆盖它） |
| `CLAUDE_REMOTE_CONTROL_SESSION_NAME_PREFIX` | Remote Control session 名前缀 |

**认证优先级**（凭证多个同时存在时的选择顺序）：

1. 云厂商：`CLAUDE_CODE_USE_BEDROCK` / `_USE_VERTEX` / `_USE_FOUNDRY`
2. `ANTHROPIC_AUTH_TOKEN`（Authorization: Bearer）
3. `ANTHROPIC_API_KEY`（X-Api-Key，交互模式下首次询问后记住）
4. `apiKeyHelper` 脚本输出
5. `CLAUDE_CODE_OAUTH_TOKEN`（**注意**：`--bare` 不读这个变量）
6. 订阅 OAuth（`/login`）

坑：活跃订阅 + `ANTHROPIC_API_KEY` 同时存在时，key 优先被批准后永远覆盖订阅；若 key 所在组织被禁用会导致认证失败，`unset ANTHROPIC_API_KEY` 或用 `/status` 确认。

## 典型场景

### 1. 团队共享的项目配置（入 git）

```jsonc
// .claude/settings.json — 提交到仓库
{
  "model": "claude-sonnet-4-6",
  "permissions": {
    "allow": [
      "Read", "Edit(src/**)", "Edit(tests/**)",
      "Bash(git *)", "Bash(pnpm *)", "Bash(node *)"
    ],
    "deny": ["Bash(ssh *)", "Bash(rm -rf /*)", "Edit(.env*)"],
    "ask":  ["Bash(curl *)", "Edit(package.json)"]
  },
  "defaultMode": "acceptEdits",
  "includeCoAuthoredBy": true,
  "enableAllProjectMcpServers": false
}
```

### 2. 本地私有覆盖（不入 git）

```jsonc
// .claude/settings.local.json — 加到 .gitignore
{
  "env": {
    "DATABASE_URL": "postgres://localhost/mydb_dev",
    "SANDBOX_URL": "https://my-sandbox.internal"
  },
  "outputStyle": "Explanatory"
}
```

### 3. CI / Headless 场景

```bash
# 生成长期 token（一次性）
claude setup-token
export CLAUDE_CODE_OAUTH_TOKEN=...

# CI 中运行
claude -p "run tests and fix failures" \
  --settings ./ci-settings.json \
  --permission-mode acceptEdits \
  --tools "Bash,Edit,Read" \
  --no-session-persistence
```

`ci-settings.json` 可以把 deny 规则收紧、禁用钩子、关闭 auto memory：

```json
{
  "permissions": { "deny": ["Bash(rm *)", "Bash(sudo *)"] },
  "disableAllHooks": true,
  "autoMemoryEnabled": false,
  "fallbackModel": "sonnet"
}
```

### 4. 企业强制策略（managed）

管理员部署到系统级 `managed-settings.json`，用户无法在本地关掉：

```json
{
  "permissions": {
    "deny": ["Bash(ssh *)", "Bash(curl * | *sh)", "WebFetch"]
  },
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "<gateway-token>"
  },
  "forceLoginMethod": "sso",
  "autoMemoryEnabled": false
}
```

### 5. 自定义 statusLine

```bash
# ~/.claude/status.sh  (chmod +x)
#!/bin/bash
read -r json
echo "$json" | jq -r '"[\(.branch)\(if .isDirty then "*" else "" end)] \(.model) | $\(.costThisSession)"'
```

```json
{ "statusLine": "~/.claude/status.sh" }
```

stdin JSON 字段：`model`、`workingDir`、`contextUsed`、`contextAvailable`、`costThisSession`、`branch`、`isDirty`、`timestamp`、`messageCount`、`effort`。脚本每次 session 状态变更都会跑，避免调 `git status` 等重操作——用传入的 `branch` / `isDirty` 字段即可。

## 注意事项

- **`/config` 是真相源**：合并后的 effective settings 在这里查看，比靠脑内推测优先级靠谱
- **outputStyle 修改需要新 session 才生效**：它进系统提示参与 prompt caching
- **`--settings` 既可传路径也可传 JSON 字符串**，在 SDK 里直接用字符串
- **`--add-dir` 只授予文件读写访问**，不会从额外目录加载 `.claude/` 配置
- **`--bare` 不读 `CLAUDE_CODE_OAUTH_TOKEN`**：bare 脚本必须用 `ANTHROPIC_API_KEY` 或 `apiKeyHelper`
- **`apiKeyHelper` 超过 10 秒会显示警告**：优化脚本或用 `CLAUDE_CODE_API_KEY_HELPER_TTL_MS` 调大 TTL
- **Claude Desktop / Remote Control 不调用 `apiKeyHelper`**：它们仅走 OAuth
- **`enableAllProjectMcpServers` 默认 `false`**：显式打开才会加载 `.claude/mcp.json`，避免仓库投毒
- **权限规则顺序**：deny > ask > allow > permission mode；写 deny 规则时不要被 allow 的广泛匹配遮蔽——deny 总是先判
- **Vim mode 既可在 `settings.json` 写 `editorMode: "vim"`，也可改 `~/.claude.json`**；两处以 settings 优先

## 组合提示

- 与 **Claude Code hooks**（init/cleanup 钩子）配合：用 `disableAllHooks` 临时关停
- 与 **Claude Code skills / plugins**：用 `--bare` 测试最小环境、或用 `--setting-sources` 只加载 user 配置来复现用户问题
- 与 **CLAUDE.md 内存**：permission 规则属于强约束，常识性 coding 规范放 CLAUDE.md；见 `references/memory-and-claude-md.md`
- 与 **MCP**：`mcpServers` 里的服务器进程会继承 `env` 字段；需要给 MCP 传 secret 时写进 `env` 即可
