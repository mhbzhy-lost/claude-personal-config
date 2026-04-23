# Hooks 速查表

SDK hooks 通过 control protocol 在 Python 进程内被调起，签名统一为：

```python
HookCallback = Callable[
    [HookInput, str | None, HookContext],
    Awaitable[HookJSONOutput],
]
```

## 10 种事件的输入字段

所有事件都含 `BaseHookInput` 的：`session_id`、`transcript_path`、`cwd`、可选 `permission_mode`。另外：

| 事件 | 额外字段 |
|------|---------|
| `PreToolUse` | `tool_name`, `tool_input`, `tool_use_id`, (可选) `agent_id`, `agent_type` |
| `PostToolUse` | `tool_name`, `tool_input`, `tool_response`, `tool_use_id`, (可选) `agent_id`, `agent_type` |
| `PostToolUseFailure` | `tool_name`, `tool_input`, `tool_use_id`, `error: str`, (可选) `is_interrupt`, `agent_id`, `agent_type` |
| `UserPromptSubmit` | `prompt: str` |
| `Stop` | `stop_hook_active: bool` |
| `SubagentStop` | `stop_hook_active`, `agent_id`, `agent_transcript_path`, `agent_type` |
| `SubagentStart` | `agent_id`, `agent_type` |
| `PreCompact` | `trigger: "manual" \| "auto"`, `custom_instructions: str \| None` |
| `Notification` | `message: str`, `notification_type: str`, (可选) `title` |
| `PermissionRequest` | `tool_name`, `tool_input`, (可选) `permission_suggestions`, `agent_id`, `agent_type` |

## 返回 `HookJSONOutput`

### 通用控制字段（`SyncHookJSONOutput`）

| 字段 | 类型 | 说明 |
|------|------|------|
| `continue_` | `bool` | 默认 True；发 CLI 时映射为 `continue`。False 终止当前 turn |
| `stopReason` | `str` | 和 `continue_=False` 搭配，给用户看的终止原因 |
| `suppressOutput` | `bool` | 从 transcript 里隐藏 stdout |
| `decision` | `"block"` | 泛用阻断指示（非 PreToolUse 场景） |
| `systemMessage` | `str` | 显示给用户的警告/提示 |
| `reason` | `str` | 反馈给 Claude 的理由，让它调整后续行为 |
| `hookSpecificOutput` | 见下 | 事件特定输出 |

### 异步推迟执行（`AsyncHookJSONOutput`）

```python
return {"async_": True, "asyncTimeout": 30000}   # 毫秒
```

> `async_` / `continue_` 是为避开 Python 关键字冲突；发 CLI 时自动去掉下划线。

## 各事件的 `hookSpecificOutput`

### PreToolUse

```python
{
  "hookEventName": "PreToolUse",
  "permissionDecision": "allow" | "deny" | "ask",
  "permissionDecisionReason": "...",
  "updatedInput": { ... },      # 替换 tool_input
  "additionalContext": "...",    # 追加到 assistant 上下文
}
```

### PostToolUse

```python
{
  "hookEventName": "PostToolUse",
  "additionalContext": "...",        # 追加文本到下一条 assistant 消息
  "updatedMCPToolOutput": ...,        # 重写 MCP 工具输出（仅 MCP 工具）
}
```

### UserPromptSubmit / SessionStart / SubagentStart / Notification / PostToolUseFailure

共同支持：`additionalContext: str` — 在对应时间点注入上下文，无法 block。

### PermissionRequest

```python
{
  "hookEventName": "PermissionRequest",
  "decision": {...},   # 自定义决策对象
}
```

## HookMatcher 语法

```python
HookMatcher(
    matcher="Bash",                  # 单个工具
    matcher="Write|Edit|MultiEdit",   # 多个工具（竖线分隔）
    matcher=None,                    # 所有工具
    hooks=[callback1, callback2],
    timeout=60,                      # 秒；默认 60
)
```

## 典型模式

### 拦截危险命令

```python
async def h(inp, tid, ctx):
    if inp["tool_name"] == "Bash":
        cmd = inp["tool_input"].get("command","")
        if any(p in cmd for p in ["rm -rf /", "mkfs", ":(){:|:&};:"]):
            return {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": "Dangerous command blocked",
                },
                "systemMessage": "🚫 命令被安全策略拦截",
            }
    return {}
```

### 给 prompt 注入隐藏上下文

```python
async def inject(inp, tid, ctx):
    return {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": "当前用户偏好语言: zh-CN",
        }
    }

opts = ClaudeAgentOptions(hooks={
    "UserPromptSubmit": [HookMatcher(matcher=None, hooks=[inject])],
})
```

### 发现严重错误立即停

```python
async def stop_on_critical(inp, tid, ctx):
    if "critical" in str(inp.get("tool_response","")).lower():
        return {
            "continue_": False,
            "stopReason": "Tool 输出中出现 critical 关键字，安全终止",
        }
    return {}
```

### PostToolUse 改写 MCP 输出（脱敏）

```python
async def redact(inp, tid, ctx):
    if inp["tool_name"].startswith("mcp__db__"):
        resp = inp.get("tool_response")
        # 脱敏 email
        new = re.sub(r"[\w.]+@[\w.]+", "***@***", str(resp))
        return {
            "hookSpecificOutput": {
                "hookEventName": "PostToolUse",
                "updatedMCPToolOutput": new,
            }
        }
    return {}
```
