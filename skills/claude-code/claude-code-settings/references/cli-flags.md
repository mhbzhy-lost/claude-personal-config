# Claude Code CLI flags 速查

> 来源：https://code.claude.com/docs/en/cli-reference
> 注意：`claude --help` 不会列出全部 flag，以下为文档权威列表。

## 命令

| 命令 | 说明 |
|---|---|
| `claude` | 启动交互 REPL |
| `claude "query"` | 带初始 prompt 启动 |
| `claude -p "query"` | SDK print 模式，一次性输出后退出 |
| `cat f \| claude -p "q"` | 处理管道输入 |
| `claude -c` | 继续当前目录最近一次会话 |
| `claude -r "<id\|name>" "query"` | 恢复指定会话 |
| `claude update` | 升级 |
| `claude auth login` / `logout` / `status` | 登录管理；`login` 支持 `--email` / `--sso` / `--console` |
| `claude agents` | 列出配置的 subagent |
| `claude auto-mode defaults` | 导出内置 auto 分类规则 JSON；`auto-mode config` 显示 effective 配置 |
| `claude mcp` | 管理 MCP 服务器 |
| `claude plugin` / `plugins` | 插件管理 |
| `claude remote-control --name …` | 启动 Remote Control 服务器 |
| `claude setup-token` | 生成 1 年期 OAuth token（不存盘，需 Pro/Max/Team/Enterprise） |

## Session

| Flag | 说明 |
|---|---|
| `--continue`, `-c` | 继续当前目录最近会话 |
| `--resume`, `-r` | 按 ID/名字恢复，或交互选择 |
| `--name`, `-n` | 设置会话显示名 |
| `--fork-session` | resume/continue 时派生新 session ID |
| `--session-id <uuid>` | 指定 session UUID |
| `--no-session-persistence` | 不落盘不可恢复（仅 print 模式） |

## Model & behavior

| Flag | 说明 |
|---|---|
| `--model <id\|alias>` | 模型选择 |
| `--effort <level>` | `low` / `medium` / `high` / `xhigh` / `max`，会话级 |
| `--fallback-model <id>` | 主模型过载回退（仅 `-p`） |
| `--output-style <name>` | 输出样式 |
| `--permission-mode <mode>` | 起始权限模式，覆盖 `defaultMode` |

## Settings & config

| Flag | 说明 |
|---|---|
| `--settings <path\|json>` | 额外加载 settings 文件或 JSON 字符串 |
| `--setting-sources user,project,local` | 只加载指定作用域 |
| `--agent <name>` | 指定 subagent |
| `--agents '<json>'` | 动态定义 subagent（同 frontmatter 字段 + `prompt`） |

## Tools & permissions

| Flag | 说明 |
|---|---|
| `--tools` | 限制内置工具：`""` 全禁 / `"default"` / `"Bash,Edit,Read"` |
| `--allowedTools "Bash(git *)" "Read"` | 追加 allow 规则 |
| `--disallowedTools "Bash(ssh *)"` | 追加 deny 规则，从 context 移除 |
| `--dangerously-skip-permissions` | 等价 `--permission-mode bypassPermissions` |
| `--allow-dangerously-skip-permissions` | 把 bypass 加入 `Shift+Tab` 循环但不起始于它 |

## System prompt

| Flag | 行为 |
|---|---|
| `--system-prompt <text>` | 替换整个默认系统提示 |
| `--system-prompt-file <path>` | 用文件内容替换（与上者互斥） |
| `--append-system-prompt <text>` | 追加到默认系统提示 |
| `--append-system-prompt-file <path>` | 追加文件内容 |

替换 + 追加可以组合：例如 `--system-prompt-file base.txt --append-system-prompt "extra"`。

## Files / dirs

| Flag | 说明 |
|---|---|
| `--add-dir <path…>` | 追加可读写目录；**不**会从那里加载 `.claude/` 配置 |
| `--worktree`, `-w [name]` | 在 `<repo>/.claude/worktrees/<name>` 起隔离 worktree |

## Other

| Flag | 说明 |
|---|---|
| `--print`, `-p` | 非交互输出 |
| `--bare` | 最小化：跳过 hooks/skills/plugins/MCP/auto memory/CLAUDE.md 自动发现，设 `CLAUDE_CODE_SIMPLE=1`；仅给 Bash + 读写文件工具；**不读 `CLAUDE_CODE_OAUTH_TOKEN`** |
| `--debug [filter]` | 开启调试，支持 `"api,hooks"` / `"!statsig,!file"` 过滤 |
| `--debug-file <path>` | 写入特定日志文件，隐含启用 debug，覆盖 `CLAUDE_CODE_DEBUG_LOGS_DIR` |
| `--version`, `-v` | 版本号 |
| `--verbose` | 详细的逐回合输出 |
