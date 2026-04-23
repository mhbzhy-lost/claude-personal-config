---
name: claude-code-subagents
description: "Claude Code 子 agent 系统：.claude/agents/*.md 文件格式、frontmatter 全字段、tools/model/permissionMode 语义、worktree 隔离、调用与并发模式。"
tech_stack: [claude-code]
capability: [cc-subagent]
version: "claude-code-cli 2.1.111"
collected_at: 2026-04-17
---

# Claude Code Subagents（子 agent 系统）

> 来源：https://code.claude.com/docs/en/sub-agents

## 用途

把"可复用、需隔离上下文、需限制工具权限"的专门任务封装成独立 agent 文件，通过 `Agent` 工具或 `@-mention` 由主会话按需委托，避免浪费主上下文。

## 何时使用

- 需要跑测试 / 拉日志 / 翻大量文件等**高 token 输出**任务
- 需要给某类任务**限死工具集**（例如只读代码审查、只读 SQL 查询）
- 跨项目**复用**同一套 system prompt（放在 `~/.claude/agents/`）
- 需要**并行独立研究**，由主 agent 汇总结论
- **不适用**的场景：子 agent 内部还想再调子 agent（不支持嵌套）；需要持续多轮互动的探索性工作（用主会话）；跨会话协同（用 agent teams）

## 文件格式与存放位置

一个 subagent = 一个带 YAML frontmatter 的 Markdown 文件。**frontmatter 之后的正文就是 system prompt**，子 agent 不继承主 Claude Code 的默认 system prompt。

| 位置 | Scope | 优先级 | 用途 |
|------|-------|--------|------|
| Managed settings `.claude/agents/` | 组织级 | 1（最高） | IT 统一下发 |
| `--agents '<json>'` CLI flag | 当前 session | 2 | 临时/自动化 |
| `<project>/.claude/agents/` | 项目级 | 3 | 团队共享，提交 git |
| `~/.claude/agents/` | 用户级 | 4 | 跨项目个人配置 |
| Plugin `agents/` | 插件启用范围 | 5（最低） | 插件分发 |

**同名时高优先级覆盖低优先级。** 手动新增文件需 `/agents` 重新加载或重启 session。项目级只从 CWD 向上查找，`--add-dir` 目录**不**扫描。

插件 agent 出于安全考虑**忽略** `hooks` / `mcpServers` / `permissionMode` 三个字段。

## 最小示例

```markdown
---
name: code-reviewer
description: Expert code review specialist. Use proactively after code changes.
tools: Read, Grep, Glob, Bash
model: sonnet
---

You are a senior code reviewer.
When invoked:
1. Run git diff to see recent changes
2. Focus on modified files
3. Begin review immediately

Review checklist: readability, error handling, secrets, input validation, tests...
```

## Frontmatter 字段速查

只有 `name` / `description` 必填，其余全部可选。完整字段表见 `references/frontmatter-fields.md`。

| 字段 | 典型值 | 作用 |
|------|--------|------|
| `name` | `code-reviewer` | 小写 + 连字符唯一 ID |
| `description` | 一句话说明 | Claude 据此决定**何时自动委托** |
| `tools` | `Read, Grep, Bash` | 允许工具白名单（省略则继承全部） |
| `disallowedTools` | `Write, Edit` | 工具黑名单（先于 `tools` 解析） |
| `model` | `sonnet` / `inherit` / `claude-opus-4-7` | 子 agent 用哪个模型 |
| `permissionMode` | `default` / `acceptEdits` / `plan` / `auto` / `dontAsk` / `bypassPermissions` | 权限模式 |
| `maxTurns` | `20` | 上限轮数，防失控 |
| `skills` | `[api-conventions]` | 启动时注入 skill 全文（**不**继承父 skill） |
| `mcpServers` | 见下文 | 仅该 agent 可见的 MCP server |
| `hooks` | `PreToolUse` / `PostToolUse` / `Stop` | 生命周期钩子（仅运行期生效） |
| `memory` | `user` / `project` / `local` | 持久化记忆目录 |
| `background` | `true` | 默认后台跑 |
| `effort` | `low` / `medium` / `high` / `xhigh` / `max` | 覆盖会话 effort |
| `isolation` | `worktree` | 独立 git worktree |
| `color` | `red` / `blue` / `green` / `yellow` / `purple` / `orange` / `pink` / `cyan` | UI 标识色 |
| `initialPrompt` | 字符串 | 作为主会话 agent（`--agent`）运行时的自动首条 user 消息 |

## 核心字段要点

### tools / disallowedTools

**工具名一律用全名**：`Read, Write, Edit, Bash, PowerShell, Glob, Grep, Agent`，MCP 工具写 `mcp__<server>__<tool>`。

- 省略 `tools` → 继承主会话全部工具（含 MCP）
- 同时设置两者时：**先扣 disallowedTools，再用 tools 白名单过滤剩余池**
- 黑白名单同时列同一工具 → 等同移除

**限制子 agent 能再 spawn 哪些 agent**（仅对用 `claude --agent` 作为主线程的 agent 生效；真正的子 agent 无法嵌套）：

```yaml
tools: Agent(worker, researcher), Read, Bash    # 只允许 worker/researcher
tools: Agent, Read, Bash                        # 允许任意 agent
# 不列 Agent                                    # 完全禁止 spawn
```

> v2.1.63 `Task` 工具重命名为 `Agent`，旧 `Task(...)` 语法仍作为 alias 保留。

禁止主会话 spawn 某个具体 agent：在 `settings.json` 的 `permissions.deny` 加 `Agent(<name>)`。

### model 解析顺序（高到低）

1. 环境变量 `CLAUDE_CODE_SUBAGENT_MODEL`
2. 单次调用时传入的 `model` 参数（Agent tool 调用参数）
3. Frontmatter 的 `model` 字段
4. 主会话当前模型

取值：`sonnet` / `opus` / `haiku`，或完整 ID（`claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5`），或 `inherit`（= 默认，跟随主会话）。

### permissionMode 与继承规则

| 模式 | 行为 |
|------|------|
| `default` | 标准权限提示 |
| `acceptEdits` | 自动接受文件编辑与常见 FS 操作（限工作目录/additionalDirectories） |
| `auto` | 后台分类器审查（Max 订阅可用） |
| `dontAsk` | 自动拒绝权限提示（allowlist 工具仍可用） |
| `bypassPermissions` | **跳过所有提示**（`.git`/`.claude`/`.vscode`/`.idea`/`.husky` 仍会问；`.claude/commands|agents|skills` 例外） |
| `plan` | 只读探索模式 |

**父 → 子继承的硬规则**：
- 父 `bypassPermissions` 或 `acceptEdits` → 子**无法降级**，强制继承
- 父 `auto` → 子的 `permissionMode` **被忽略**，统一由分类器评判
- Deny 规则 > PreToolUse hook 的 `allow`（v2.1.101 起）

### isolation: worktree

```yaml
isolation: worktree     # 在临时 git worktree 里跑，退出时若无改动自动清理
```

**已知限制（务必在生产前验证）**：
- Windows 11 可能报 "not in a git repository"（#40164）
- 上下文压缩后 CWD 漂移可能导致嵌套 worktree（#27881）
- 非 Git 目录可能被强制用 worktree 模式（#31819）
- 曾出现"静默失败，其实跑在主 repo"（#39886，已修）

配合 `worktree.sparsePaths` 设置可做 sparse checkout，适合大 monorepo。子 agent 内 `cd` 不在 Bash 调用间保留，且不影响主会话 CWD。

### mcpServers

```yaml
mcpServers:
  - playwright:                        # 内联定义：仅此 agent 可见
      type: stdio
      command: npx
      args: ["-y", "@playwright/mcp@latest"]
  - github                             # 按名引用：复用已有连接
```

内联 server 用 `.mcp.json` 同款 schema（`stdio` / `http` / `sse` / `ws`）。**把仅某 agent 用的大型 MCP 放这里**，可避免其工具描述吃掉主会话上下文。

### hooks

两种配置位置，用途不同：

**a) frontmatter hooks**（仅当该 agent 作为**子 agent** 被 spawn 时触发；通过 `--agent` 作为主线程时**不**触发）

```yaml
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/validate-readonly-query.sh"
  PostToolUse:
    - matcher: "Edit|Write"
      hooks:
        - type: command
          command: "./scripts/run-linter.sh"
  Stop:                # 运行时自动转为 SubagentStop
    - hooks: [{ type: command, command: "./scripts/cleanup.sh" }]
```

hook 命令收到 JSON via stdin（含 `tool_input.command` 等），`exit 2` 阻断并把 stderr 返回给 Claude。

**b) settings.json 中的主会话 hooks**：监听 `SubagentStart` / `SubagentStop`，matcher 填 agent name。

### memory

| scope | 目录 | 适用 |
|-------|------|------|
| `user` | `~/.claude/agent-memory/<name>/` | 跨项目知识 |
| `project` | `<repo>/.claude/agent-memory/<name>/` | 项目知识，随 git 共享（推荐默认） |
| `local` | `<repo>/.claude/agent-memory-local/<name>/` | 项目专属但不入库 |

启用后：system prompt 注入 `MEMORY.md` 前 200 行 / 25KB（两者取先）；Read/Write/Edit 自动开启，子 agent 可自己读写维护。

## 调用方式

自动（推荐）/ 半自动 / 显式 / session 级四档：

1. **自动委托**：Claude 根据你的 prompt + 子 agent `description` 决定是否派发。想让它"更主动"，`description` 里加 `Use proactively after code changes.`
2. **自然语言点名**：`Use the code-reviewer subagent to ...`（仍由 Claude 决定是否真的派发）
3. **@-mention 保证派发**：`@"code-reviewer (agent)" look at auth changes`（插件来源显示为 `<plugin>:<agent>`）
4. **整场 session 作为某 agent 运行**：
   ```bash
   claude --agent code-reviewer           # 本地 agent
   claude --agent myplugin:code-reviewer  # 插件 agent
   ```
   或在 `.claude/settings.json` 写 `{ "agent": "code-reviewer" }`（CLI flag 覆盖 settings）。

**CLI 临时定义**（一次性，不落盘）：

```bash
claude --agents '{
  "code-reviewer": {
    "description": "Expert code reviewer. Use proactively after code changes.",
    "prompt": "You are a senior code reviewer...",
    "tools": ["Read", "Grep", "Glob", "Bash"],
    "model": "sonnet"
  }
}'
```

`prompt` 字段等价于文件版的 Markdown body。

## 前后台与并行

- **前台**：阻塞主会话，权限提示与 `AskUserQuestion` 透传给你
- **后台**：启动前一次性提示所有需要的权限（审批后不再询问；未审批的自动拒绝），主会话可继续。Ctrl+B 把运行中的任务转后台；`background: true` 默认后台。关闭：`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`
- **并行**：`Research the auth, db and api modules in parallel using separate subagents`，多个子 agent 同时跑，主 agent 汇总
  - 注意：每个子 agent 完成时结果都回写主上下文，太多并发仍可能把上下文撑爆
  - 需要真正独立上下文的长任务 → 改用 [agent teams](https://code.claude.com/docs/en/agent-teams)

## 内置 subagent

| Agent | Model | 工具 | 用途 |
|-------|-------|------|------|
| **Explore** | Haiku | 只读（无 Write/Edit） | 快速代码检索，Claude 会传 `quick` / `medium` / `very thorough` 三档彻底度 |
| **Plan** | inherit | 只读 | Plan mode 下搜集上下文（避免无限嵌套） |
| **general-purpose** | inherit | 全部 | 复杂多步任务，探索 + 修改兼顾 |
| statusline-setup | Sonnet | — | 跑 `/statusline` 时自动用 |
| Claude Code Guide | Haiku | — | 问 Claude Code 功能时自动用 |

禁用任一内置 agent：`settings.json` 的 `permissions.deny` 加 `Agent(Explore)` 即可。

## 关键限制与陷阱

- **子 agent 不能再 spawn 子 agent**。需要嵌套逻辑用 Skills 或由主会话串联多个子 agent。
- **skills 不继承**。主会话里预装的 skill，子 agent 用不到，必须在 `skills:` 显式列。
- **frontmatter hooks** 只在"作为子 agent 被 spawn"时生效；`--agent` 启动主线程时不生效，要进 `settings.json`。
- **worktree isolation** 在 Windows / 非 Git 目录 / 上下文压缩后有已知 bug，生产前实测。
- **权限继承**：`bypassPermissions` / `acceptEdits` / `auto` 这三种父模式**会吃掉**子 agent 的 `permissionMode`。
- **每次调用是新实例**。想续跑必须让 Claude `SendMessage`（需 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`），或用主会话 resume session + agent 已有 transcript（`~/.claude/projects/<project>/<sessionId>/subagents/agent-<id>.jsonl`）。
- **自动压缩**：子 agent 也会在 ~95% 触发 auto-compact，可通过 `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=50` 提前。
- **`--add-dir` 不扫描 agent**，跨项目共享 agent 用 `~/.claude/agents/` 或 plugin。
- **后台子 agent 如果遇到需要问你的工具调用**（例如 `AskUserQuestion`）会失败但继续，最好用前台重试。

## 编写建议

- **一个 agent 只做一件事**；description 写清楚"何时该派它上"
- **工具最小权限**：只读 reviewer 就只给 Read/Grep/Glob/Bash（甚至去掉 Bash）
- **在 body 里给"被调用时的动作清单"**，别只说角色：
  > When invoked: 1. git diff 2. focus on modified files 3. begin review ...
- **项目级 agent 入 git**，让团队共用和迭代
- **复杂工具权限**：优先用 PreToolUse hook 脚本做动态校验（如只放行 SELECT），比纯 `tools` 白名单灵活

## 组合提示

- 与 **Skills**：skill 注入主会话上下文，适合复用指令；subagent 隔离上下文，适合高 token / 权限受限任务。`skills:` 字段可把 skill 预装到子 agent。
- 与 **Hooks**：PreToolUse 做输入校验（如只读 SQL 拦截），PostToolUse 自动跑 lint/format，SubagentStart/Stop 在主会话侧做资源准备与清理。
- 与 **MCP**：内联 `mcpServers` 把昂贵工具描述隔离到子 agent，主会话不吃这份上下文成本。
- 与 **Plugins**：分发团队 agent；记得插件 agent **不支持** `hooks` / `mcpServers` / `permissionMode`，需要的话拷贝到 `.claude/agents/`。
- 与 **Agent Teams**：当你需要跨 session 持续协同、每个 worker 独立上下文时，切换到 agent teams。

## 补充参考

- `references/frontmatter-fields.md` — 全字段详细说明（类型、默认值、取值枚举）
- `references/examples.md` — code-reviewer / debugger / data-scientist / db-reader 完整示例
