# settings.json 完整字段表

> 来源：https://code.claude.com/docs/en/settings

## Model configuration

| Setting | Type | Default | Description |
|---|---|---|---|
| `model` | string | Auto-detected from auth | 模型 ID（如 `claude-opus-4-1`、`claude-sonnet-4-6`）或别名 `sonnet` / `opus` |
| `effort` | string | `medium` | `low` / `medium` / `high` / `xhigh` / `max`，具体支持视模型而定 |
| `fallbackModel` | string | none | 主模型过载时回退（仅 `-p` print mode 生效） |

## Permissions

| Setting | Type | Default | Description |
|---|---|---|---|
| `permissions` | object | 全部工具放行 | 子字段见下 |
| `permissions.allow` | array | 全部工具 | 无需询问的工具 |
| `permissions.deny` | array | 空 | 完全禁止 |
| `permissions.ask` | array | 空 | 每次都询问 |
| `defaultMode` | string | `default` | 会话起始 permission mode：`default` / `acceptEdits` / `plan` / `auto` / `dontAsk` / `bypassPermissions` |

## Output

| Setting | Type | Default | Description |
|---|---|---|---|
| `outputStyle` | string | `Default` | `Default` / `Explanatory` / `Learning` / 自定义样式名 |
| `statusLine` | string | none | 生成状态栏内容的 shell 脚本路径 |

## Authentication

| Setting | Type | Default | Description |
|---|---|---|---|
| `apiKeyHelper` | string | none | 返回 API key 的 shell 脚本（每 5 min 或 401 时调用） |
| `forceLoginMethod` | string | none | `anthropic` / `console` / `bedrock` / `vertex` / `foundry` / `sso` |
| `forceLoginOrgUUID` | string | none | Console 认证下强制选定组织 |

## Memory & persistence

| Setting | Type | Default | Description |
|---|---|---|---|
| `autoMemoryEnabled` | boolean | `true` | 开启 auto memory |
| `autoMemoryDirectory` | string | `~/.claude/projects/<project>/memory/` | auto memory 存储目录 |
| `claudeMdExcludes` | array | 空 | 要跳过的 CLAUDE.md glob 列表 |

## Session behavior

| Setting | Type | Default | Description |
|---|---|---|---|
| `includeCoAuthoredBy` | boolean | `true` | git commit 追加 `Co-Authored-By: Claude …` |
| `disableAllHooks` | boolean | `false` | 关闭全部 init/cleanup 钩子 |
| `cleanupPeriodDays` | number | `30` | 清理 N 天前的 session 文件 |

## Environment

| Setting | Type | Default | Description |
|---|---|---|---|
| `env` | object | 继承 shell | 键值对，传给所有工具进程（Bash、MCP 等） |

示例：
```json
{
  "env": {
    "PATH": "/usr/local/bin:$PATH",
    "ANTHROPIC_API_KEY": "sk-...",
    "NODE_ENV": "development"
  }
}
```

## MCP

| Setting | Type | Default | Description |
|---|---|---|---|
| `mcpServers` | object | 空 | MCP 服务器配置（同 `.claude/mcp.json` 结构） |
| `enableAllProjectMcpServers` | boolean | `false` | 自动启用仓库 `.claude/mcp.json` 内全部服务器 |

```json
{
  "mcpServers": {
    "my-server": { "command": "node", "args": ["./mcp-server.js"] }
  }
}
```

## Advanced

| Setting | Type | Default | Description |
|---|---|---|---|
| `awsAuthRefresh` | boolean | `true` | 自动刷新 Bedrock AWS 凭证 |
| `editorMode` | string | `default` | `default` / `vim` |

## 优先级速记

```
CLI flags  >  Local  >  Project  >  User  >  Managed  >  Defaults
```

Managed 作用域中的 **permission deny** 被视为企业强制策略，不可在下层被放宽。
