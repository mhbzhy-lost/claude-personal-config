---
name: claude-code-hooks
description: "Claude Code hooks 系统完全指南：27 个生命周期事件、4 种 handler 类型、matcher 语法、input/output schema、决策控制与常见模式。"
tech_stack: [claude-code]
capability: [cc-hook]
version: "claude-code-cli 2.1.111"
collected_at: 2026-04-17
---

# Claude Code Hooks（生命周期自动化）

> 来源：https://code.claude.com/docs/en/hooks, https://code.claude.com/docs/en/hooks-guide

## 用途

Hooks 是 Claude Code 在运行期特定生命周期点上自动执行的用户定义动作（shell 命令 / HTTP / prompt / agent），提供**确定性**的行为控制，不依赖 LLM 判断。用于：强制项目规则、自动化重复任务、与外部工具集成。

## 何时使用

- 阻止危险命令或对受保护文件的写入（`PreToolUse` + 退出码 2）
- 编辑后自动格式化 / lint（`PostToolUse` 匹配 `Edit|Write`）
- 桌面通知、审计日志、远程监控（`Notification` / `ConfigChange`）
- 压缩后重新注入上下文（`SessionStart` + `compact` matcher）
- 目录切换时重载 direnv 环境（`CwdChanged` 写 `$CLAUDE_ENV_FILE`）
- 自动批准特定权限弹窗（`PermissionRequest`，交互模式）或 `PreToolUse`（非交互）

## 核心概念（三层嵌套）

```
settings.json → hooks → <EventName> → [ { matcher, hooks: [ handler, ... ] } ]
```

1. **Event**：生命周期事件名（共 27 个，见 references/events.md）
2. **Matcher group**：按工具名 / session 源 / 通知类型等过滤
3. **Handler**：实际执行单元（command / http / prompt / agent）

## 最小示例（桌面通知）

`~/.claude/settings.json`：

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "osascript -e 'display notification \"Claude needs attention\" with title \"Claude Code\"'"
          }
        ]
      }
    ]
  }
}
```

验证：在 Claude Code 中输入 `/hooks` 打开浏览器确认；切换到其它窗口后让 Claude 等待输入。

## 配置位置与作用域

| 位置                              | 作用域             | 可共享             |
| --------------------------------- | ------------------ | ------------------ |
| `~/.claude/settings.json`         | 所有项目           | 否（本机）         |
| `.claude/settings.json`           | 单个项目           | 是（提交到 repo）  |
| `.claude/settings.local.json`     | 单个项目           | 否（gitignore）    |
| Managed policy settings           | 组织级             | 是（管理员控制）   |
| Plugin `hooks/hooks.json`         | 插件启用时         | 是（随插件分发）   |
| Skill / agent frontmatter         | 组件激活期间       | 是                 |

全局关闭：`"disableAllHooks": true`。

## 4 种 Handler 类型

| type      | 何时选                               | 关键字段                              | 默认 timeout |
| --------- | ------------------------------------ | ------------------------------------- | ------------ |
| `command` | 大多数场景，能用 shell 做的都用这个  | `command`, `async`, `asyncRewake`, `shell` | 600s         |
| `http`    | 要把事件 POST 给远程服务/审计平台    | `url`, `headers`, `allowedEnvVars`    | 30s（建议）  |
| `prompt`  | 需要 LLM 判断但不查文件（单轮，快）  | `prompt`, `model`（默认 Haiku）       | 30s          |
| `agent`   | 需要读文件/跑命令后再决定            | `prompt`, `model`                     | 60s          |

所有 handler 共用的字段：
- `if`：权限规则语法过滤（如 `"Bash(git *)"`、`"Edit(*.ts)"`）
- `timeout`：秒，超时取消
- `statusMessage`：spinner 自定义文本
- `once`：仅 skill 内使用，一次性

### command hook 约定

```json
{
  "type": "command",
  "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/script.sh",
  "timeout": 30
}
```

可用环境变量：
- `$CLAUDE_PROJECT_DIR`：项目根（**引用脚本路径必须用这个**，不要用相对路径）
- `${CLAUDE_PLUGIN_ROOT}`、`${CLAUDE_PLUGIN_DATA}`：插件场景
- `$CLAUDE_ENV_FILE`：SessionStart / CwdChanged 中写入的 `export VAR=...` 行会被 Claude 在每个 Bash 命令前 source

### HTTP hook 约定

- 只有 `2xx` 才能返回结构化决策；状态码本身**不能**阻断动作
- `headers` 支持 `$VAR_NAME` 插值，但必须在 `allowedEnvVars` 中列出

### prompt / agent hook 输出约定

无论 handler 是 prompt 还是 agent，统一返回：
```json
{"ok": true}
```
或
```json
{"ok": false, "reason": "what remains to be done"}
```
`reason` 会作为反馈注入 Claude 的下一步指令。

## Matcher 语法

| matcher 值                            | 评估方式                   | 示例                         |
| ------------------------------------- | -------------------------- | ---------------------------- |
| `""`、`"*"`、省略                     | 匹配全部                   | 适用于 Notification 之类     |
| 仅字母/数字/`_`/`\|`                  | 字面量或 `\|` 分隔列表     | `Bash`, `Edit\|Write`        |
| 包含其它字符                          | **JavaScript 正则**        | `mcp__memory__.*`, `^Note`   |

**事件特定 matcher 目标**：

| 事件族                                            | 匹配的值             |
| ------------------------------------------------- | -------------------- |
| `PreToolUse`/`PostToolUse`/`PermissionRequest` 等 | 工具名（如 `Bash`）  |
| `SessionStart`                                    | `startup`/`resume`/`clear`/`compact` |
| `SessionEnd`                                      | `clear`/`resume`/`logout`/`prompt_input_exit` |
| `Notification`                                    | `permission_prompt`/`idle_prompt`/`auth_success`/`elicitation_dialog` |
| `SubagentStart`/`SubagentStop`                    | agent 类型名         |
| `PreCompact`/`PostCompact`                        | `manual`/`auto`      |
| `ConfigChange`                                    | `user_settings`/`project_settings`/`local_settings`/`policy_settings`/`skills` |
| `FileChanged`                                     | **字面量**文件名（`\|` 分隔，非正则） |
| `StopFailure`                                     | `rate_limit`/`authentication_failed`/... |
| `InstructionsLoaded`                              | `session_start`/`nested_traversal`/`path_glob_match`/`include`/`compact` |

**MCP 工具命名规律**：`mcp__<server>__<tool>`，例如 `mcp__.*__write.*` 匹配所有 MCP 写操作。

完整事件清单与每个事件的 input/output schema 见：`references/events.md`。

## Input / Output 约定

### stdin 公共字段（所有 hook）

```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/current/dir",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "hook_event_name": "EventName"
}
```
Subagent 内还会附加 `agent_id`, `agent_type`。

### 退出码语义

| Exit | 含义                 | 处理                                                      |
| ---- | -------------------- | --------------------------------------------------------- |
| `0`  | 成功                 | stdout 若是合法 JSON 会被解析为结构化输出                 |
| `2`  | 阻断（可阻断的事件） | stdout 忽略；**stderr 作为反馈回传给 Claude**             |
| 其它 | 非阻断错误           | stderr 显示在 transcript 首行和 debug log，流程继续       |

**能被 exit 2 阻断的事件**：`PreToolUse`, `PermissionRequest`, `UserPromptSubmit`, `Stop`, `SubagentStop`, `TeammateIdle`, `TaskCreated`, `TaskCompleted`, `ConfigChange`, `PreCompact`, `Elicitation`, `ElicitationResult`, `WorktreeCreate`。

**已发生无法阻断的事件**（exit 2 无效）：`PostToolUse`, `PostToolUseFailure`, `PermissionDenied`, `StopFailure`, `Notification`, `SubagentStart`, `SessionStart`, `SessionEnd`, `CwdChanged`, `FileChanged`, `PostCompact`, `WorktreeRemove`, `InstructionsLoaded`。

### stdout 顶层输出字段

```json
{
  "continue": true,
  "stopReason": "Stop message",
  "suppressOutput": false,
  "systemMessage": "Warning",
  "hookSpecificOutput": { "hookEventName": "..." }
}
```
- `continue: false` → Claude 整体停下；`stopReason` 作为给用户的原因
- `suppressOutput: true` → stdout 不写入 debug log

### 决策模式（按事件分）

**顶层 `decision` 字段**（`UserPromptSubmit`, `PostToolUse`, `PostToolUseFailure`, `Stop`, `SubagentStop`, `ConfigChange`, `PreCompact`, `TaskCreated`, `TaskCompleted`）：
```json
{"decision": "block", "reason": "..."}
```

**`PreToolUse`**（通过 `hookSpecificOutput`）：
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow|deny|ask|defer",
    "permissionDecisionReason": "...",
    "updatedInput": { "command": "npm run lint" },
    "additionalContext": "Context for Claude"
  }
}
```
- `allow`：跳过交互权限弹窗，但**不能绕过 settings 的 deny 规则**
- `deny`：取消调用（即使 `bypassPermissions` 也阻止）
- `ask`：强制弹出权限询问
- `defer`：仅非交互 `-p` 模式，退出保留 tool call 供外部恢复

**`PermissionRequest`**：
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "allow|deny",
      "updatedInput": { ... },
      "updatedPermissions": [
        { "type": "setMode", "mode": "acceptEdits", "destination": "session" }
      ],
      "message": "..."
    }
  }
}
```

**上下文注入**（`UserPromptSubmit`, `SessionStart`, `PostToolUse`）：
```json
{"hookSpecificOutput": {"hookEventName": "...", "additionalContext": "..."}}
```
对 `UserPromptSubmit` / `SessionStart`，**退出码 0 时 stdout 文本直接进入 Claude 上下文**。

## 权限规则与 hook 决策的交互（关键）

**最保守原则**：
- `PreToolUse` 返回 `"allow"` **不覆盖** settings 中的 `deny` 规则；managed deny list 始终优先
- `PreToolUse` 返回 `"deny"` 在 `bypassPermissions` 或 `--dangerously-skip-permissions` 下**依然生效**，因此 hooks 可用于强制策略用户无法关闭
- 多个 hook 同时 match：结果取最严格（任一 `deny` 必阻；任一 `ask` 必弹；只有全 `allow` 才 allow）
- 所有 hook 的 `additionalContext` 会被合并注入

结论：**hooks 只能收紧权限，不能放宽超过规则允许的范围**。

## 常见模式

### 1. 阻止受保护文件编辑

`.claude/hooks/protect-files.sh`：
```bash
#!/bin/bash
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
for p in ".env" "package-lock.json" ".git/"; do
  if [[ "$FILE_PATH" == *"$p"* ]]; then
    echo "Blocked: $FILE_PATH 匹配受保护模式 '$p'" >&2
    exit 2
  fi
done
exit 0
```
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{"type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/protect-files.sh"}]
    }]
  }
}
```
记得 `chmod +x` 脚本。

### 2. 编辑后自动 Prettier

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{"type": "command", "command": "jq -r '.tool_input.file_path' | xargs npx prettier --write"}]
    }]
  }
}
```

### 3. 压缩后重新注入上下文

```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "compact",
      "hooks": [{"type": "command", "command": "echo 'Reminder: 本项目用 Bun，提交前跑 bun test。当前迭代：auth 重构。'"}]
    }]
  }
}
```
stdout 直接拼入 Claude 上下文。

### 4. 审计配置变更

```json
{
  "hooks": {
    "ConfigChange": [{
      "matcher": "",
      "hooks": [{"type": "command", "command": "jq -c '{timestamp: now | todate, source: .source, file: .file_path}' >> ~/claude-config-audit.log"}]
    }]
  }
}
```

### 5. 目录切换重载 direnv

```json
{
  "hooks": {
    "CwdChanged": [{
      "hooks": [{"type": "command", "command": "direnv export bash >> \"$CLAUDE_ENV_FILE\""}]
    }]
  }
}
```
`CLAUDE_ENV_FILE` 中写入的 `export X=y` 会在每个 Bash 调用前被 source。

### 6. 自动批准 ExitPlanMode

```json
{
  "hooks": {
    "PermissionRequest": [{
      "matcher": "ExitPlanMode",
      "hooks": [{"type": "command", "command": "echo '{\"hookSpecificOutput\":{\"hookEventName\":\"PermissionRequest\",\"decision\":{\"behavior\":\"allow\"}}}'"}]
    }]
  }
}
```
**保持 matcher 狭窄**，不要用 `.*` 或留空——否则所有权限弹窗都会被自动通过。

### 7. prompt hook：Stop 前检查任务是否完成

```json
{
  "hooks": {
    "Stop": [{
      "hooks": [{
        "type": "prompt",
        "prompt": "检查所有任务是否完成。如未完成回 {\"ok\": false, \"reason\": \"...\"}。"
      }]
    }]
  }
}
```

### 8. agent hook：跑测试再允许停止

```json
{
  "hooks": {
    "Stop": [{
      "hooks": [{
        "type": "agent",
        "prompt": "运行测试套件并检查结果。$ARGUMENTS",
        "timeout": 120
      }]
    }]
  }
}
```

## 高级特性

- **async**：`"async": true` 后台执行，不阻塞
- **asyncRewake**：后台执行，exit 2 时作为 system reminder 唤醒 Claude
- **Plugin 内**：`hooks/hooks.json` 与 settings 格式相同
- **Skill frontmatter**：在 YAML 中内联 hooks 配置，组件激活期间生效
- **`/hooks` 命令**：只读浏览当前所有已加载的 hooks（按事件分组，展示 matcher 数、类型、source、命令）

## 常见陷阱

1. **Stop hook 无限循环**：Stop hook 返回 block 让 Claude 继续工作，Claude 完成后又触发 Stop hook……必须检查 stdin 的 `stop_hook_active` 字段，为 `true` 时立即 exit 0。
2. **JSON 解析错误**：shell 启动时 source 了 `.bashrc` / `.zshrc`，其中的无条件 `echo` 会被前置到 hook 的 stdout。**解决**：把 echo 包在 `[[ $- == *i* ]] && echo ...` 中，只在交互 shell 里输出。
3. **路径错误**：不要用相对路径引用脚本，用 `"$CLAUDE_PROJECT_DIR"/.claude/hooks/xxx.sh`。
4. **脚本没权限**：`chmod +x` 之后才能被 Claude Code 执行。
5. **非交互模式下 PermissionRequest 不触发**：Agent SDK / `-p` 模式下改用 `PreToolUse` 做自动决策。
6. **多个 PreToolUse 同时改 `updatedInput`**：hooks 并发执行，谁最后完成谁覆盖——**不要让多个 hook 同时重写同一 tool 的输入**。
7. **PostToolUse 无法 undo**：工具已经执行完，`decision: "block"` 只把 `reason` 作为反馈给 Claude，不回滚动作。
8. **matcher 大小写敏感**：`bash` 不会匹配 `Bash`。
9. **FileChanged 的 matcher 是字面量**而非正则（用 `|` 分隔文件名），与工具事件的正则语义不同。
10. **settings JSON**：不允许尾逗号、注释；修改后一般自动热加载，若未生效重启 session。

## 调试

- `/hooks`：列出当前所有已加载的 hook
- `Ctrl+O`（transcript 视图）：每个触发的 hook 会有一行摘要
- `claude --debug-file /tmp/claude.log` 启动，然后 `tail -f /tmp/claude.log` 看完整执行日志；或中途 `/debug` 开启

## 组合提示

- 与 `claude-code-settings`（settings.json 配置）搭配：hooks 只是其中一节，整体的 permissions / env 也在同一文件
- 与 `claude-code-plugins` / `claude-code-slash-commands` 搭配：插件可打包 hooks，slash commands 可触发 hook 链路
- 跟 Skills / Agents：skill 或 agent frontmatter 可内联 `hooks:` 块，随组件生命周期生效

## 参考

- `references/events.md`：27 个事件的 input/output schema 速查
- `references/decision-matrix.md`：选 handler 类型 / 退出码 vs JSON / matcher vs `if` 的决策矩阵
