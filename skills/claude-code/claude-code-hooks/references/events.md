# Claude Code Hooks - 27 个事件速查

按生命周期分组，列出每个事件的 input 额外字段、matcher 目标、是否可被 exit 2 阻断、典型输出。

---

## Session 级

### SessionStart
- **何时**：session 启动 / 恢复 / clear / 压缩后
- **Matcher**：`startup | resume | clear | compact`
- **可阻断**：否
- **input 额外**：`source`, `model`, `agent_type?`
- **典型输出**：stdout 文本直接加入上下文；或
  ```json
  {"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": "..."}}
  ```
- **特殊**：可写 `$CLAUDE_ENV_FILE` 持久化环境变量
  ```bash
  echo 'export NODE_ENV=production' >> "$CLAUDE_ENV_FILE"
  ```

### SessionEnd
- **何时**：session 终止
- **Matcher**：`clear | resume | logout | prompt_input_exit | ...`
- **可阻断**：否

### InstructionsLoaded
- **何时**：CLAUDE.md / `.claude/rules/*.md` 加载进上下文
- **Matcher**：`session_start | nested_traversal | path_glob_match | include | compact`
- **可阻断**：否
- **input 额外**：`file_path`, `memory_type`, `load_reason`, `globs`, `trigger_file_path`, `parent_file_path`

---

## Per-Turn 级

### UserPromptSubmit
- **何时**：用户提交 prompt，Claude 处理前
- **Matcher**：无（按全部）
- **可阻断**：是
- **input 额外**：`prompt`
- **输出（允许并注入上下文）**：
  ```json
  {"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": "...", "sessionTitle": "..."}}
  ```
  或 exit 0 + stdout 文本
- **输出（阻断）**：
  ```json
  {"decision": "block", "reason": "..."}
  ```

### Stop
- **何时**：Claude 完成响应时（**不包含**用户 interrupt；API 错误走 `StopFailure`）
- **可阻断**：是（让 Claude 继续工作）
- **input 额外**：`stop_hook_active`（防循环必须检查）
- **输出**：
  - `{"continue": true}` 允许停下
  - `{"decision": "block", "reason": "..."}` 继续对话
- **陷阱**：若不判断 `stop_hook_active` 会无限循环

### StopFailure
- **何时**：turn 因 API 错误结束
- **Matcher**：`rate_limit | authentication_failed | billing_error | invalid_request | server_error | max_output_tokens | unknown`
- **可阻断**：否（output 和 exit code 被忽略）

---

## Tool 执行

### PreToolUse
- **何时**：tool 调用前
- **Matcher**：工具名（`Bash`, `Edit|Write`, `mcp__.*`）
- **可阻断**：是（可返回 deny，**即使 bypassPermissions 也生效**）
- **input 额外**：`tool_name`, `tool_input`, `tool_use_id`
- **输出**：
  ```json
  {
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "allow|deny|ask|defer",
      "permissionDecisionReason": "...",
      "updatedInput": { ... },
      "additionalContext": "..."
    }
  }
  ```

### PostToolUse
- **何时**：tool 成功后
- **Matcher**：工具名
- **可阻断**：否（工具已执行）。`decision: "block"` 仅把 `reason` 反馈给 Claude
- **input 额外**：`tool_name`, `tool_input`, `tool_response`, `tool_use_id`

### PostToolUseFailure
- **何时**：tool 失败后
- **Matcher**：工具名
- **可阻断**：否

### PermissionRequest
- **何时**：权限弹窗出现时（**仅交互模式**）
- **Matcher**：工具名（如 `ExitPlanMode`）
- **可阻断**：是
- **input 额外**：`tool_name`, `tool_input`, `permission_suggestions`
- **输出**：
  ```json
  {
    "hookSpecificOutput": {
      "hookEventName": "PermissionRequest",
      "decision": {
        "behavior": "allow|deny",
        "updatedInput": { ... },
        "updatedPermissions": [
          {
            "type": "addRules|replaceRules|removeRules|setMode|addDirectories|removeDirectories",
            "rules": [...],
            "behavior": "allow|deny|ask",
            "destination": "session|localSettings|projectSettings|userSettings",
            "mode": "acceptEdits|bypassPermissions|..."
          }
        ],
        "message": "..."
      }
    }
  }
  ```

### PermissionDenied
- **何时**：auto 模式分类器拒绝 tool call 时
- **可阻断**：否
- **特殊输出**：`{"retry": true}` 告诉模型可以再试

---

## Agent / Team

### SubagentStart
- **何时**：subagent 被 spawn 时
- **Matcher**：agent 类型名（`Bash`, `Explore`, `Plan` 或自定义）
- **可阻断**：否
- **input 额外**：`agent_id`, `agent_type`

### SubagentStop
- **何时**：subagent 结束
- **Matcher**：agent 类型名
- **可阻断**：是
- **input 额外**：`agent_id`, `agent_type`, `agent_transcript_path`, `last_assistant_message`

### TaskCreated
- **何时**：通过 TaskCreate 创建任务
- **可阻断**：是（exit 2 或 `{"decision": "block", "reason": "..."}`）
- **input 额外**：`task_id`, `task_subject`, `task_description`, `teammate_name`, `team_name`

### TaskCompleted
- **何时**：任务被标记完成
- **可阻断**：是

### TeammateIdle
- **何时**：agent team 的 teammate 将要 idle
- **可阻断**：是

---

## File / Config

### FileChanged
- **何时**：watched 文件磁盘变动
- **Matcher**：**字面量**文件名（`.envrc|.env|Dockerfile`，用 `|` 分隔，**不是正则**）
- **可阻断**：否
- **input 额外**：`file_path`

### ConfigChange
- **何时**：配置文件被外部进程修改
- **Matcher**：`user_settings | project_settings | local_settings | policy_settings | skills`
- **可阻断**：是

### CwdChanged
- **何时**：工作目录变化（Claude 执行 `cd`）
- **Matcher**：无
- **可阻断**：否
- **典型用途**：direnv 集成，写 `$CLAUDE_ENV_FILE`

### WorktreeCreate
- **何时**：`--worktree` 或 `isolation: "worktree"` 创建 worktree（**替代**默认 git 行为）
- **可阻断**：是
- **输出**：
  - command hook：`echo /path/to/worktree` 到 stdout
  - http/json：
    ```json
    {"hookSpecificOutput": {"hookEventName": "WorktreeCreate", "worktreePath": "/path/to/worktree"}}
    ```
  - 退出非零或不写路径 → worktree 创建失败

### WorktreeRemove
- **何时**：session 退出或 subagent 结束时移除 worktree
- **可阻断**：否

---

## Context / Notification

### PreCompact
- **何时**：压缩前
- **Matcher**：`manual | auto`
- **可阻断**：是（可阻止压缩）

### PostCompact
- **何时**：压缩完成后
- **可阻断**：否

### Notification
- **何时**：Claude Code 发送通知时
- **Matcher**：`permission_prompt | idle_prompt | auth_success | elicitation_dialog`
- **可阻断**：否
- **input 额外**：`message`, `title`, `notification_type`

### Elicitation
- **何时**：MCP server 在 tool call 中请求用户输入
- **Matcher**：MCP server 名
- **可阻断**：是
- **input 额外**：`tool_name`, `mcp_server`, `form_schema`
- **输出**：
  ```json
  {"hookSpecificOutput": {"hookEventName": "Elicitation", "action": "accept|decline|cancel", "content": {...}}}
  ```

### ElicitationResult
- **何时**：用户回应 MCP elicitation 后，响应回传前
- **Matcher**：MCP server 名
- **可阻断**：是
- **input 额外**：`tool_name`, `mcp_server`, `user_action`, `user_response`

---

## 通用提示

- Input JSON 都是**单行**发到 stdin，用 `jq` 或 `INPUT=$(cat); echo "$INPUT" | jq ...` 解析
- 多个 hook 并发执行；相同 command 会自动去重
- 输出给 Claude 的反馈最终都落在 `additionalContext` 或 `reason` 字段
