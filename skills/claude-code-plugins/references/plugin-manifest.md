# plugin.json 完整字段参考

Plugin 根目录下 `.claude-plugin/plugin.json` 的完整 schema。

## 完整示例

```json
{
  "name": "plugin-name",
  "version": "1.2.0",
  "description": "Brief plugin description",
  "author": {
    "name": "Author Name",
    "email": "author@example.com",
    "url": "https://github.com/author"
  },
  "homepage": "https://docs.example.com/plugin",
  "repository": "https://github.com/author/plugin",
  "license": "MIT",
  "keywords": ["keyword1", "keyword2"],

  "skills":     "./custom/skills/",
  "commands":   ["./custom/commands/special.md"],
  "agents":     "./custom/agents/",
  "hooks":      "./config/hooks.json",
  "mcpServers": "./mcp-config.json",
  "lspServers": "./.lsp.json",
  "monitors":   "./monitors.json"
}
```

## 必填

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | kebab-case，不含空格；skill 命名空间前缀 |

## 元数据（全部可选）

| 字段 | 类型 | 说明 |
|------|------|------|
| `version` | string | Semver。决定更新判定 |
| `description` | string | 市场列表/插件管理器展示 |
| `author` | object | `{ name, email?, url? }` |
| `homepage` | string | 文档/主页 URL |
| `repository` | string | 源码 URL |
| `license` | string | SPDX license ID（如 `MIT`） |
| `keywords` | string[] | 搜索标签 |

## 组件路径字段

每个字段都接受 **string 或 string[]**，指向文件或目录。**一旦设置就禁用默认位置扫描**。

| 字段 | 默认位置 | 可替换成 |
|------|----------|----------|
| `skills` | `skills/` | 目录或多个目录 |
| `commands` | `commands/` | 扁平 .md 文件或目录 |
| `agents` | `agents/` | 目录或文件 |
| `hooks` | `hooks/hooks.json` | 配置文件路径或内联 config |
| `mcpServers` | `.mcp.json` | 配置文件或内联 |
| `lspServers` | `.lsp.json` | 配置文件或内联 |
| `monitors` | `monitors/monitors.json` | 配置文件或内联 |

## 依赖 / 频道 / 用户配置（高级）

| 字段 | 用途 |
|------|------|
| `dependencies` | 声明本 plugin 依赖的其他 plugin |
| `channels` | 绑定发布频道（如 stable / beta） |
| `userConfig` | 声明用户可覆盖的配置项，安装时提示用户填充 |

## 路径与环境变量

在所有组件配置（hook command、MCP args、LSP command）中使用：

- `${CLAUDE_PLUGIN_ROOT}` —— 当前版本的插件根目录（随升级变化）
- `${CLAUDE_PLUGIN_DATA}` —— `~/.claude/plugins/data/{id}/`，跨版本持久

示例：

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "hooks": [
          { "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/process.sh" }
        ]
      }
    ]
  },
  "mcpServers": {
    "db": {
      "command": "${CLAUDE_PLUGIN_ROOT}/servers/db-server",
      "env": { "DATA_PATH": "${CLAUDE_PLUGIN_DATA}" }
    }
  }
}
```

## hook 支持的事件

`SessionStart`、`SessionEnd`、`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`PostToolUseFailure`、`PermissionRequest`、`PermissionDenied`、`SubagentStart`、`SubagentStop`、`FileChanged`、`ConfigChange`、`CwdChanged`、`InstructionsLoaded`、`Stop`、`StopFailure`。

## 最佳实践

- `name` 与 marketplace 条目 `name` 保持一致
- `version` 与 marketplace 条目 `version` 保持一致（`strict: true` 时 plugin.json 为权威）
- 所有脚本/二进制路径一律用 `${CLAUDE_PLUGIN_ROOT}`，**禁止硬编码**
- 持久状态（缓存、node_modules、sqlite）全写到 `${CLAUDE_PLUGIN_DATA}`
- 通过 `SessionStart` hook 在 `${CLAUDE_PLUGIN_DATA}` 里做懒安装依赖
