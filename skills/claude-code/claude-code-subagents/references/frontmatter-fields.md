# Subagent Frontmatter 全字段参考

> 版本基准：Claude Code v2.1.111。`.claude/agents/<name>.md` 与 `--agents '<json>'` JSON 对象均支持下列字段；JSON 版用 `prompt` 字段替代 Markdown body。

## 必填

### name

- 类型：string
- 格式：小写字母 + 连字符，例如 `code-reviewer`
- 用作：`@agent-<name>`、`Agent(<name>)`、transcript 文件名、memory 目录名
- 同名时按 scope 优先级覆盖（Managed > CLI > project > user > plugin）

### description

- 类型：string
- 作用：Claude 据此**自动决定何时委托**。写得越具体越容易被触发
- 建议模板：`<何种专家> + <具体场景> + <"Use proactively" 触发词>`
  - `Expert code review specialist. Proactively reviews code for quality, security, and maintainability. Use immediately after writing or modifying code.`
  - `Debugging specialist for errors, test failures, and unexpected behavior. Use proactively when encountering any issues.`

## 工具权限

### tools

- 类型：逗号分隔字符串 或 字符串数组
- 省略 → 继承主会话**全部工具**（含 MCP）
- 取值：
  - 内置：`Read`, `Write`, `Edit`, `Bash`, `PowerShell`, `Glob`, `Grep`, `Agent`
  - MCP：`mcp__<server>__<tool>`，如 `mcp__playwright__browser_navigate`
  - Agent 限制型：`Agent(<type1>, <type2>)` — 仅对 `claude --agent` 主线程生效
  - Agent 通用型：`Agent`（不带括号）允许 spawn 任意 agent
- 示例：`tools: Read, Grep, Glob, Bash`

### disallowedTools

- 类型：逗号分隔字符串 或 字符串数组
- 作用：黑名单，从继承池/`tools` 白名单中**先扣除**
- 与 `tools` 同时列同一工具 → 工具被移除
- 示例：`disallowedTools: Write, Edit`（保留其他所有工具）

## 模型

### model

- 取值：
  - alias：`sonnet` / `opus` / `haiku`
  - 完整 ID：`claude-opus-4-7` / `claude-sonnet-4-6` / `claude-haiku-4-5` / ...
  - `inherit`（默认）：跟随主会话
- 解析顺序：
  1. `CLAUDE_CODE_SUBAGENT_MODEL` 环境变量
  2. Agent tool 调用时传入的 `model` 参数
  3. 本字段
  4. 主会话模型

### effort

- 类型：`low` / `medium` / `high` / `xhigh` / `max`
- 作用：覆盖会话级 effort；覆盖范围取决于当前模型（不是所有模型都支持所有档）
- Opus 4.7 在 v2.1.111 新增 `xhigh`（介于 high 和 max 之间）

## 权限

### permissionMode

| 值 | 说明 |
|----|------|
| `default` | 标准权限提示 |
| `acceptEdits` | 自动接受文件编辑与常见 FS 操作（仅限 working dir / additionalDirectories） |
| `auto` | 后台分类器评估（Max 订阅，Opus 4.7） |
| `dontAsk` | 自动拒绝所有权限提示（显式 allowed 工具仍可用） |
| `bypassPermissions` | 跳过所有提示（**谨慎**；`.git`/`.claude`/`.vscode`/`.idea`/`.husky` 仍提示，除了 `.claude/commands|agents|skills`） |
| `plan` | 只读探索模式 |

**硬性继承规则**（父 → 子不能降级）：
- 父 `bypassPermissions` / `acceptEdits` → 子**被强制继承**，`permissionMode` 忽略
- 父 `auto` → 子 `permissionMode` 忽略，由分类器用父的 allow/block 规则统一判
- `permissions.deny` > PreToolUse hook `allow`（v2.1.101 起）

### maxTurns

- 类型：number
- 作用：agent 最多执行多少轮就强制停
- 典型值：10 ~ 30

## 上下文注入

### skills

- 类型：string 数组，如 `[api-conventions, error-handling-patterns]`
- 作用：启动时**将整份 skill 内容注入 system prompt**（不是注册供调用）
- 子 agent **不自动继承**父会话的 skill，需要的话必须显式列
- 与 `context: fork` skill 互为反操作

### mcpServers

- 类型：数组，每项是字符串（引用已配置的 server）或内联对象
- 内联 schema 同 `.mcp.json` 的 server 条目（`stdio` / `http` / `sse` / `ws`）
- 内联 server 在子 agent 启动时连接、结束时断开；字符串引用复用父 session 连接
- **用法诀窍**：仅子 agent 用的 MCP 放这里，可以让主会话**完全不见**这些工具的描述，节省上下文
- v2.1.101 修复：子 agent 继承动态注入的 MCP server

### initialPrompt

- 类型：string
- 作用：当该 agent 通过 `claude --agent <name>` 作为**主线程**运行时，自动作为首条 user 消息提交
- Commands / skills 在此被处理；会被 prepend 到用户实际输入前
- 仅对 `--agent` 和 `agent` 设置路径生效，作为子 agent 被 spawn 时忽略

## 生命周期与存储

### hooks

结构：

```yaml
hooks:
  <EventName>:
    - matcher: "<regex | tool name>"
      hooks:
        - type: command
          command: "<shell command>"
```

**仅在被作为子 agent spawn 时生效**（`--agent` 主线程模式下不触发；session-wide 要写在 `settings.json`）。

可用事件：
- `PreToolUse`：matcher = 工具名（支持 `|` 正则），在工具执行前跑；exit 2 阻断并把 stderr 回传
- `PostToolUse`：工具调用后
- `Stop`：子 agent 结束（自动转为 `SubagentStop`）
- 其他 `/en/hooks` 列出的事件都支持

主 session 侧（settings.json）可用：
- `SubagentStart` — matcher = agent name
- `SubagentStop` — matcher = agent name

hook 命令收到 JSON via stdin，取值如 `.tool_input.command` / `.tool_input.file_path`。

### memory

| 值 | 目录 | 用途 |
|----|------|------|
| `user` | `~/.claude/agent-memory/<name>/` | 跨项目 |
| `project` | `<repo>/.claude/agent-memory/<name>/` | 项目级，入 git（**推荐默认**） |
| `local` | `<repo>/.claude/agent-memory-local/<name>/` | 项目级不入 git |

启用后：
- 子 agent 的 system prompt 注入 `MEMORY.md` 前 200 行或 25KB（两者取先）
- 超出时 Claude 会被提示去 curate
- Read / Write / Edit 工具**自动启用**（即便 `tools` 没列）
- 建议在 body 里嘱咐 "Update your agent memory as you discover codepaths, patterns, ..."

## 运行形态

### background

- `true` → 默认后台运行，启动时一次性提示所有需要的权限
- 后台 agent 若遇到 `AskUserQuestion` 之类 → 调用失败但 agent 继续
- 关闭所有后台任务：`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`
- 运行中按 `Ctrl+B` 把前台任务转后台

### isolation

- `worktree`：创建临时 git worktree，结束时若无改动自动清理
- 配合 `worktree.sparsePaths` settings 做大 monorepo sparse checkout
- 子 agent 内 `cd` 不跨 Bash 调用保留，也不影响主会话 CWD
- **已知问题**：
  - #40164 Windows 11 可能报 "not in a git repository"
  - #39886 静默失败跑回主 repo（已修）
  - #27881 压缩后 CWD 漂移导致嵌套 worktree
  - #31819 非 Git 目录被强制 worktree
  - #27023 字段一度未出现在官方文档中

### color

- 取值：`red` / `blue` / `green` / `yellow` / `purple` / `orange` / `pink` / `cyan`
- 作用：在任务列表和 transcript 里的显示色（视觉区分多个并行 subagent）

## CLI JSON 差异

`--agents '<json>'` 接受同一套字段，但：
- 用 `prompt` 代替 Markdown body
- `tools` 用数组而非逗号串：`"tools": ["Read", "Grep", "Glob", "Bash"]`

示例：

```bash
claude --agents '{
  "code-reviewer": {
    "description": "Expert code reviewer. Use proactively after code changes.",
    "prompt": "You are a senior code reviewer. Focus on code quality, security, and best practices.",
    "tools": ["Read", "Grep", "Glob", "Bash"],
    "model": "sonnet",
    "permissionMode": "default"
  },
  "debugger": {
    "description": "Debugging specialist for errors and test failures.",
    "prompt": "You are an expert debugger. Analyze errors, identify root causes, and provide fixes."
  }
}'
```
