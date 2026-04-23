---
name: claude-code-mcp
description: "Claude Code MCP 集成：三种 transport、三层 scope、.mcp.json 全字段、OAuth / dynamic headers 认证、CLI 命令族与权限写法。"
tech_stack: [claude-code]
capability: [cc-mcp]
version: "claude-code-cli 2.1.111; mcp-protocol 2025-06-18"
collected_at: 2026-04-17
---

# Claude Code MCP 集成

> 来源：https://code.claude.com/docs/en/mcp
> 协议：https://modelcontextprotocol.io/specification/2025-06-18/basic/transports

## 用途

把 Claude Code 连接到外部工具/数据源（GitHub、Sentry、Figma、数据库、内部 API），一次配置后 Claude 可直接读取、检索、写操作，替代反复复制粘贴。MCP 是 AI 应用与外部系统的标准桥接协议（JSON-RPC over stdio / HTTP）。

## 何时使用

- 开发者需要让 Claude 访问 issue tracker、监控、数据库、设计稿等现成服务
- 团队希望将一组标准 MCP 服务器随仓库提交（`.mcp.json`）
- 企业 IT 要集中控制员工可用的 MCP 服务器（`managed-mcp.json` / allowlist）
- 自研内部工具希望通过标准协议暴露给 Claude Code

## 三种 Transport

| Transport           | 位置   | 典型用途              | 认证                  | 性能          | 推荐度     |
|---------------------|--------|-----------------------|-----------------------|---------------|------------|
| **stdio**           | 本地   | CLI 包装、本地数据库、文件系统 | 系统/env var          | 10k+ ops/sec  | 本地首选   |
| **Streamable HTTP** | 远程   | 云服务 SaaS、团队内部 API | Bearer / OAuth / headersHelper | 100–1k ops/sec | 远程首选（新标准）|
| **SSE**             | 远程   | 向后兼容旧服务器      | HTTP headers          | 100–1k ops/sec | **Deprecated**，有 HTTP 就别用 |

HTTP endpoint 是单一 URL，同时接受 POST（客户端→服务端）与 GET（开 SSE 流），HTTP 头中携带 `MCP-Protocol-Version: 2025-06-18` 与 `Mcp-Session-Id`。详情见 `references/transports.md`。

## 三层 Scope（重要）

| Scope       | 加载范围           | 团队共享 | 存储位置                    |
|-------------|--------------------|----------|-----------------------------|
| **local**（默认） | 当前项目且仅自己可见 | ✖        | `~/.claude.json` 对应 project 条目 |
| **project** | 当前项目团队成员   | ✔（入 git）| `<repo>/.mcp.json`          |
| **user**    | 你所有项目全局     | ✖        | `~/.claude.json`            |

**合并优先级**（同名服务器，高覆盖低）：
```
local  >  project  >  user  >  plugin  >  claude.ai
```
Plugin 和 claude.ai 按 URL/command 匹配重复项；三层 scope 按**服务器名称**匹配。

### 项目 scope 安全

Claude Code 首次使用 `.mcp.json` 中的 project-scoped 服务器前会弹窗确认。重置授权：
```bash
claude mcp reset-project-choices
```

## 基础用法

### 最常用：`claude mcp add`（HTTP + Bearer）

```bash
# 选项必须放在 name 之前；-- 分隔后面的 command
claude mcp add --transport http notion https://mcp.notion.com/mcp

claude mcp add --transport http secure-api https://api.example.com/mcp \
  --header "Authorization: Bearer $TOKEN"

claude mcp add --transport stdio --env AIRTABLE_API_KEY=YOUR_KEY airtable \
  -- npx -y airtable-mcp-server
```

进入会话后 `/mcp` 查看状态 / 触发 OAuth / 清除认证。

### `.mcp.json`（project scope，推荐提交到 git）

```json
{
  "mcpServers": {
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "${HOME}/projects"],
      "env": {}
    },
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "Bearer ${GITHUB_TOKEN}"
      }
    },
    "sentry": {
      "type": "http",
      "url": "https://mcp.sentry.dev/mcp",
      "oauth": {
        "clientId": "your-client-id",
        "callbackPort": 8080,
        "scopes": "read:project read:issue"
      }
    },
    "internal-api": {
      "type": "http",
      "url": "${COMPANY_API_BASE_URL}/mcp",
      "headersHelper": "/opt/bin/get-mcp-auth-headers.sh"
    }
  }
}
```

## `.mcp.json` 字段全览

通用顶层：
```jsonc
{
  "mcpServers": {
    "<server-name>": { ... }
  }
}
```

| 字段 | 适用 type | 含义 |
|------|-----------|------|
| `type` | all | `"stdio"` / `"http"` / `"sse"` |
| `command` | stdio | 可执行文件路径或命令名（必填） |
| `args` | stdio | 字符串数组，命令行参数 |
| `env` | stdio | 对象，注入到子进程的环境变量 |
| `url` | http/sse | MCP endpoint（必填） |
| `headers` | http/sse | 静态 HTTP 头（如 `Authorization`） |
| `headersHelper` | http/sse | 动态头脚本，stdout 输出 JSON（10s 超时） |
| `oauth.clientId` | http/sse | 预配置的 OAuth client ID |
| `oauth.callbackPort` | http/sse | 固定 OAuth 回调端口，对应 `http://localhost:PORT/callback` |
| `oauth.authServerMetadataUrl` | http/sse | 覆盖 metadata 发现（默认走 RFC 9728 / 8414），需 Claude Code ≥ 2.1.64，必须 https |
| `oauth.scopes` | http/sse | 空格分隔的 scope 字符串，优先级高于 metadataUrl 和 `/.well-known` |

### 环境变量展开

支持 `${VAR}` 和 `${VAR:-default}`，可出现在：`command`、`args`、`env`、`url`、`headers`。

```json
{
  "mcpServers": {
    "api": {
      "type": "http",
      "url": "${API_BASE_URL:-https://api.example.com}/mcp",
      "headers": { "Authorization": "Bearer ${API_KEY}" }
    }
  }
}
```

必填变量未设置且无默认值 → 解析失败。**变量从 Claude Code 进程的 shell 环境继承，不会自动加载 `.env` 文件**。

### Plugin 专用变量

在 plugin 的 `.mcp.json` 或 `plugin.json.mcpServers` 中：
- `${CLAUDE_PLUGIN_ROOT}` → plugin 根目录
- `${CLAUDE_PLUGIN_DATA}` → plugin 持久数据目录（插件升级后保留）

## 认证路径

| 场景 | 推荐方案 |
|------|----------|
| 静态 token（API key）| `headers` + `${TOKEN}` 环境变量 |
| 动态注册 OAuth（RFC 7591）| 裸 `claude mcp add`，`/mcp` 触发浏览器登录 |
| 预配置 OAuth（无动态注册）| `--client-id`、`--client-secret`（或 `MCP_CLIENT_SECRET` env） + `--callback-port`；secret 存 keychain |
| 自定义 scope 限制 | `oauth.scopes` 空格分隔，会自动追加 `offline_access`（如服务器支持） |
| 覆盖 OAuth 发现端点 | `oauth.authServerMetadataUrl`（https） |
| Kerberos / 短时 token / 内部 SSO | `headersHelper` 脚本 |
| env var / CI | `env` 字段或 CLI `--env` |

### `headersHelper` 要点

- 必须向 stdout 输出 `{"Header-Name": "value", ...}`，纯 JSON 字符串键值
- Shell 执行，超时 10 秒，**每次连接/重连都重跑**（无缓存，自己实现复用）
- 动态头会覆盖同名静态 `headers`
- 自动注入：`CLAUDE_CODE_MCP_SERVER_NAME`、`CLAUDE_CODE_MCP_SERVER_URL`（可写统一脚本服务多 server）
- **project/local scope 必须通过 workspace trust 弹窗才会执行**（任意 shell 命令风险）

## CLI 命令族

```bash
# 添加服务器（见基础用法）
claude mcp add --transport http|sse|stdio [FLAGS] <name> <url|-- cmd args...>
claude mcp add-json <name> '<json-string>'
claude mcp add-from-claude-desktop           # macOS / WSL 专用

# 查询与管理
claude mcp list                               # 所有已配置 server
claude mcp get <name>                         # 查看单个（含 OAuth 状态）
claude mcp remove <name>
claude mcp reset-project-choices              # 重置 .mcp.json 审批

# 启动 Claude Code 本身为 MCP server（stdio）
claude mcp serve
```

**`add` 常用 flags**（必须放在 `<name>` 之前）：

| Flag | 作用 |
|------|------|
| `--transport http\|sse\|stdio` | 传输类型 |
| `--scope local\|project\|user` | 写入位置，默认 local |
| `--env KEY=value` | 注入 env var（可多次） |
| `--header "K: V"` | HTTP 头（可多次） |
| `--callback-port <N>` | 固定 OAuth 回调端口 |
| `--client-id <id>` | 预配置 OAuth client ID |
| `--client-secret` | 提示输入 secret（或读 `MCP_CLIENT_SECRET` env） |

### 会话内命令

- `/mcp` —— 服务器状态、OAuth 登录、清除认证
- `@<server>:<protocol>://<path>` —— 引用资源，如 `@github:issue://123`
- `/mcp__<server>__<prompt> [args]` —— 调用服务器暴露的 prompt，如 `/mcp__jira__create_issue "Bug" high`

## 工具命名与权限

MCP 工具统一命名：
```
mcp__<server>__<tool>
```
示例：`mcp__github__create_issue`、`mcp__playwright__browser_snapshot`。

Plugin 来源则再加前缀：
```
mcp__plugin_<plugin-name>_<server>__<tool>
```

### 权限写法（`settings.json` / `.claude/settings.json`）

```json
{
  "permissions": {
    "allow": [
      "mcp__*",                            // 所有 MCP 工具
      "mcp__context7__*",                  // 整个 context7 server
      "mcp__github__read_*",               // 前缀通配
      "mcp__playwright__browser_snapshot"  // 精确到工具
    ],
    "deny": [
      "mcp__dangerous-server__*"
    ]
  }
}
```

### 关联 settings.json 字段

- `enableAllProjectMcpServers: true` —— 自动信任 `.mcp.json` 所有 server（跳过审批弹窗）
- `enabledMcpjsonServers: ["github", "sentry"]` —— 仅启用白名单中的项目 server
- `disabledMcpjsonServers: ["legacy"]` —— 明确禁用
- `mcpServers` —— 直接在 settings 内嵌服务器配置（等价 `.mcp.json`）

## 企业集中管控

两种方案，可叠加：

### 方案 1：`managed-mcp.json`（完全接管）

部署到系统目录后，用户无法 `mcp add` 新服务器，仅能用文件里定义的：

| OS | 路径 |
|----|------|
| macOS | `/Library/Application Support/ClaudeCode/managed-mcp.json` |
| Linux / WSL | `/etc/claude-code/managed-mcp.json` |
| Windows | `C:\Program Files\ClaudeCode\managed-mcp.json` |

格式同 `.mcp.json`。

### 方案 2：allowlist / denylist（策略模式）

在 managed settings 文件中：
```json
{
  "allowedMcpServers": [
    { "serverName": "github" },
    { "serverCommand": ["npx", "-y", "@modelcontextprotocol/server-filesystem"] },
    { "serverUrl": "https://mcp.company.com/*" },
    { "serverUrl": "https://*.internal.corp/*" }
  ],
  "deniedMcpServers": [
    { "serverName": "dangerous-server" },
    { "serverUrl": "https://*.untrusted.com/*" }
  ]
}
```

规则：
- 每条必须**恰好一个** `serverName` / `serverCommand` / `serverUrl` 字段
- `serverCommand` 数组**完全精确匹配**（顺序、数量、值都要一致）
- `serverUrl` 支持 `*` 通配
- allowlist 有 `serverCommand` → stdio 服务器必须命中命令；单凭 name 不够
- allowlist 有 `serverUrl` → 远程服务器必须命中 URL
- `allowedMcpServers: []` = 完全禁用 MCP
- **denylist 绝对优先**，即便 allowlist 也通过
- 两方案叠加：`managed-mcp.json` 接管写入，allow/deny 再过滤这些托管服务器

## 相关环境变量

| 变量 | 默认值 | 作用 |
|------|--------|------|
| `MCP_TIMEOUT` | 30000 (ms) | 服务器启动超时 |
| `MAX_MCP_OUTPUT_TOKENS` | 25000 | 单次工具输出 token 上限（> 10k 会警告），可被工具的 `anthropic/maxResultSizeChars` 覆盖（硬上限 500k 字符）|
| `ENABLE_TOOL_SEARCH` | 默认开启 | `true` / `false` / `auto` / `auto:<N>`（阈值模式占上下文 N%） |
| `ENABLE_CLAUDEAI_MCP_SERVERS` | true | 设 `false` 屏蔽从 claude.ai 同步的 MCP |
| `MCP_CLIENT_SECRET` | — | 提供 OAuth secret 的 CI 友好通道 |

## 注意事项

- **参数顺序**：`claude mcp add [FLAGS] <name> -- <command>`，flag 放在 name 之前，否则被当成 server 参数
- **Windows + npx**：原生 Windows（非 WSL）必须 `cmd /c` 包装，否则 "Connection closed"
  ```bash
  claude mcp add --transport stdio my-server -- cmd /c npx -y @some/package
  ```
- **`.mcp.json` 不读 `.env`**：环境变量必须在启动 `claude` 的 shell 中已存在
- **JSON 无尾逗号**、Windows 路径要双反斜杠转义 `C:\\path\\to\\exe`
- **HTTP 自动重连**：最多 5 次指数退避（1s→2s→4s→8s→16s），`/mcp` 面板可手动重试；stdio 进程**不会**自动重启
- **输出限制**：单次工具输出 > 10k token 会警告，>25k 被截断落盘（留下文件引用），必要时调 `MAX_MCP_OUTPUT_TOKENS`
- **Tool Search** 默认延迟加载 MCP 工具定义，减少上下文占用；若 `ANTHROPIC_BASE_URL` 指向非官方代理且不支持 `tool_reference`，需显式 `ENABLE_TOOL_SEARCH=true` 或切 `auto`
- **`claude mcp serve`** 把 Claude Code 自身暴露成 stdio MCP server，被 Claude Desktop 等客户端消费时要给绝对路径（`which claude`），否则 `spawn claude ENOENT`
- **`headersHelper` 在非 user scope 必须先信任 workspace**，别在 CI 上指望它默默运行

## 组合提示

- 搭配 `claude-code-settings`：在 `.claude/settings.json` 用 `permissions.allow/deny` 锁定 `mcp__*` 工具，搭配 `enableAllProjectMcpServers` / `enabledMcpjsonServers` 控制项目服务器
- 搭配 plugin：`plugin.json` 或 plugin 根 `.mcp.json` 自带服务器，启用后自动起；引用 `${CLAUDE_PLUGIN_ROOT}` 定位捆绑可执行
- 企业部署：`managed-mcp.json`（强制集） + `allowedMcpServers`（URL/命令白名单） + `permissions.deny`（工具级兜底）三层联动
- 需要把第三方 SaaS 工具共享给团队 → project scope `.mcp.json`，敏感 token 用 `${VAR}`，`.env` 本地注入
- 更多 transport 协议细节见 `references/transports.md`，完整 CLI 速查见 `references/cli-reference.md`
