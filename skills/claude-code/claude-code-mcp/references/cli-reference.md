# `claude mcp` CLI 完整参考

> 来源：https://code.claude.com/docs/en/mcp

## 语法通则

```
claude mcp <subcommand> [FLAGS] <name> [-- <command> [args...]]
```

- **所有 flag 必须在 `<name>` 之前**
- `--` 之后是 stdio 服务器的启动命令与参数，防止 flag 冲突
- 默认 scope 为 `local`（当前项目私有，写入 `~/.claude.json`）

## 子命令

### `add` — 注册服务器

**HTTP（推荐）**
```bash
claude mcp add --transport http <name> <url>

# 带 Bearer
claude mcp add --transport http secure-api https://api.example.com/mcp \
  --header "Authorization: Bearer your-token"

# project scope
claude mcp add --transport http stripe --scope project https://mcp.stripe.com
```

**SSE（deprecated，仅向后兼容）**
```bash
claude mcp add --transport sse asana https://mcp.asana.com/sse
claude mcp add --transport sse private-api https://api.company.com/sse \
  --header "X-API-Key: your-key-here"
```

**stdio**
```bash
claude mcp add --transport stdio --env AIRTABLE_API_KEY=YOUR_KEY airtable \
  -- npx -y airtable-mcp-server

# 传参给子进程
claude mcp add --transport stdio db -- npx -y @bytebase/dbhub \
  --dsn "postgresql://readonly:pass@prod.db.com:5432/analytics"

# Windows（原生，不含 WSL）必须 cmd /c
claude mcp add --transport stdio my-server -- cmd /c npx -y @some/package
```

**OAuth 变体**
```bash
# 动态注册 + 固定回调端口
claude mcp add --transport http --callback-port 8080 \
  my-server https://mcp.example.com/mcp

# 预配置 clientId / secret（secret 以 keychain 方式暂存）
claude mcp add --transport http \
  --client-id your-client-id --client-secret --callback-port 8080 \
  my-server https://mcp.example.com/mcp

# CI：env 提供 secret
MCP_CLIENT_SECRET=your-secret claude mcp add --transport http \
  --client-id your-client-id --client-secret --callback-port 8080 \
  my-server https://mcp.example.com/mcp
```

### `add-json` — 从 JSON 字符串添加

```bash
claude mcp add-json <name> '<json>'
```

示例：
```bash
# HTTP
claude mcp add-json weather-api \
  '{"type":"http","url":"https://api.weather.com/mcp","headers":{"Authorization":"Bearer token"}}'

# stdio
claude mcp add-json local-weather \
  '{"type":"stdio","command":"/path/to/weather-cli","args":["--api-key","abc123"],"env":{"CACHE_DIR":"/tmp"}}'

# HTTP + OAuth 预配
claude mcp add-json my-server \
  '{"type":"http","url":"https://mcp.example.com/mcp","oauth":{"clientId":"your-client-id","callbackPort":8080}}' \
  --client-secret
```

要点：
- shell 里对 JSON 做好转义
- JSON 必须符合 MCP 配置 schema
- 可叠加 `--scope user`

### `list` / `get` / `remove`

```bash
claude mcp list                     # 所有 server + 状态
claude mcp get github               # 单个 server 配置与 OAuth 状态
claude mcp remove github
```

### `add-from-claude-desktop`

从 Claude Desktop 的配置导入（仅 macOS / WSL）：
```bash
claude mcp add-from-claude-desktop
claude mcp add-from-claude-desktop --scope user
```
重名会追加数字后缀（`server_1`）。

### `reset-project-choices`

重置 `.mcp.json` 的项目级批准状态：
```bash
claude mcp reset-project-choices
```

### `serve`

把 Claude Code **本身**作为 stdio MCP server 暴露：
```bash
claude mcp serve
```

在 Claude Desktop 的 `claude_desktop_config.json` 消费：
```json
{
  "mcpServers": {
    "claude-code": {
      "type": "stdio",
      "command": "/usr/local/bin/claude",
      "args": ["mcp", "serve"],
      "env": {}
    }
  }
}
```
`command` 必须是 claude 可执行文件的**绝对路径**（`which claude`），否则 `spawn claude ENOENT`。

## Flag 速查

| Flag | 适用子命令 | 说明 |
|------|-----------|------|
| `--transport http\|sse\|stdio` | `add` | 传输协议 |
| `--scope local\|project\|user` | `add` / `add-json` / `add-from-claude-desktop` | 写入位置 |
| `--env KEY=value` | `add` | 注入 env var（可多次） |
| `--header "K: V"` | `add` | 静态 HTTP 头（可多次） |
| `--callback-port <N>` | `add` / 通过 oauth 字段 `add-json` | 固定 OAuth callback 端口（`http://localhost:N/callback`） |
| `--client-id <id>` | `add` / `add-json` | 预注册 OAuth client ID |
| `--client-secret` | `add` / `add-json` | 交互输入或读 `MCP_CLIENT_SECRET` env |

## 会话内命令

| 命令 | 作用 |
|------|------|
| `/mcp` | 查看所有 server 状态、触发 OAuth 登录、清除认证 |
| `/mcp__<server>__<prompt> [args...]` | 执行服务器暴露的 prompt |
| `@<server>:<protocol>://<path>` | 引用 MCP 资源，如 `@github:issue://123` |
| `/reload-plugins` | 重新连接 plugin 携带的 MCP server |

## 相关环境变量

| 变量 | 默认 | 作用 |
|------|------|------|
| `MCP_TIMEOUT` | 30000 ms | 启动超时 |
| `MAX_MCP_OUTPUT_TOKENS` | 25000 | 单工具输出上限 |
| `ENABLE_TOOL_SEARCH` | auto（含 `true`/`false`/`auto:N`）| 工具延迟加载策略 |
| `ENABLE_CLAUDEAI_MCP_SERVERS` | true | 关掉从 claude.ai 同步的 server |
| `MCP_CLIENT_SECRET` | — | 供 CI 的 OAuth secret |
| `CLAUDE_CODE_MCP_SERVER_NAME` | — | headersHelper 被调用时自动注入 |
| `CLAUDE_CODE_MCP_SERVER_URL`  | — | headersHelper 被调用时自动注入 |

## 配置文件速查

| 文件 | 作用域 | 备注 |
|------|--------|------|
| `<repo>/.mcp.json` | project | 入 git，团队共享 |
| `~/.claude.json` | local / user | 所有 CLI 修改最终都落盘这里 |
| 系统 `managed-mcp.json` | 企业 | 用户不可绕过（路径见 SKILL.md） |
| `<plugin>/.mcp.json` 或 `plugin.json` 的 `mcpServers` | plugin | 启用插件后自动生效 |

## 常用命令小抄

```bash
# GitHub（公有）
claude mcp add --transport http github https://api.githubcopilot.com/mcp/

# Sentry
claude mcp add --transport http sentry https://mcp.sentry.dev/mcp

# 本地 PostgreSQL 只读查询
claude mcp add --transport stdio db -- npx -y @bytebase/dbhub \
  --dsn "postgresql://readonly:pass@localhost:5432/mydb"

# 团队共享 API（project scope + token 从 env 读）
claude mcp add --transport http team-api --scope project https://api.company.com/mcp \
  --header "Authorization: Bearer ${TEAM_API_KEY}"

# Anthropic 官方 filesystem（本地）
claude mcp add --transport stdio fs -- npx -y @modelcontextprotocol/server-filesystem ~/code
```
