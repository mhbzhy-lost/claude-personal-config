---
name: claude-agent-sdk-python
description: "Claude Agent SDK (Python) 编程式驱动 Claude Code：query() 无状态一次性查询 vs ClaudeSDKClient 有状态会话，覆盖权限系统、自定义 MCP 工具、hooks、子 agent 与会话管理。"
tech_stack: [claude-agent-sdk, agent, mcp]
language: [python]
capability: [llm-client, agent-orchestration, tool-calling]
version: "claude-agent-sdk 0.1.61; claude-code-cli 2.1.112"
collected_at: 2026-04-17
---

# Claude Agent SDK (Python)

> 来源：https://docs.anthropic.com/en/docs/claude-code/sdk + 官方 repo `anthropics/claude-agent-sdk-python`

## 用途

在 Python 进程中以库的方式驱动 Claude Code：复用其工具循环、上下文管理、MCP、权限系统与 hooks，但由你决定 prompt、工具白名单、权限回调与交互时机。SDK 依赖本地 Claude Code CLI 作为子进程（SDK 会自带 bundled CLI）。

> 旧名 `claude-code-sdk` 已更名为 `claude-agent-sdk`；import 根也改为 `claude_agent_sdk`。使用 Opus 4.7（`claude-opus-4-7`）需要 ≥ 0.2.111，否则会看到 `thinking.type.enabled` 报错。

## 何时使用

- 构建生产环境的代码/数据/研究类 agent（可读文件、跑命令、编辑代码）
- 需要把 Claude Code 的能力嵌入现有 Python 服务、Lambda、Workflow
- 需要自定义工具（in-process MCP）让模型调用公司内部 API
- 需要对每个工具调用做细粒度权限控制、审计、二次确认
- 需要多轮对话、可中断、可 fork 的长会话 agent

## 安装

```bash
pip install claude-agent-sdk
# SDK 自带 bundled CLI；若要覆盖，设 ClaudeAgentOptions(cli_path=...)
```

运行时需要 `ANTHROPIC_API_KEY`（或已登录的 Claude Code），Python ≥ 3.10。

## 核心导入

```python
from claude_agent_sdk import (
    query, ClaudeSDKClient, ClaudeAgentOptions,
    # 消息 & 内容块
    AssistantMessage, UserMessage, SystemMessage, ResultMessage, StreamEvent,
    TextBlock, ThinkingBlock, ToolUseBlock, ToolResultBlock,
    # 权限
    PermissionResultAllow, PermissionResultDeny, ToolPermissionContext,
    # 工具 & MCP
    tool, create_sdk_mcp_server,
    # Hooks
    HookMatcher,
    # 子 agent
    AgentDefinition,
    # 会话
    list_sessions, get_session_messages, fork_session,
)
```

## 两种入口：`query()` vs `ClaudeSDKClient`

| 特性 | `query()` | `ClaudeSDKClient` |
|------|-----------|-------------------|
| 会话 | 每次新建 | 持久、同一进程多轮 |
| 适用 | 一次性任务、Lambda、CI | 交互式应用、长对话 |
| 图片/多模态输入 | 不支持 | 支持 |
| 中断 `interrupt()` | 不支持 | 支持 |
| 动态切模式 `set_permission_mode` | 不支持 | 支持 |
| Hooks | 支持（初始化时） | 支持（全功能） |
| 流式输入（AsyncIterable） | 支持 | 支持（推荐） |

**默认优先用 `ClaudeSDKClient`**；只有真正无状态的场景才用 `query()`。

### `query()` 最小示例（一问一答）

```python
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions, ResultMessage

async def main():
    async for message in query(
        prompt="Find and fix the bug in auth.py",
        options=ClaudeAgentOptions(allowed_tools=["Read", "Edit", "Bash"]),
    ):
        if isinstance(message, ResultMessage) and message.subtype == "success":
            print(message.result)

asyncio.run(main())
```

签名：
```python
async def query(
    *,
    prompt: str | AsyncIterable[dict[str, Any]],
    options: ClaudeAgentOptions | None = None,
    transport: Transport | None = None,
) -> AsyncIterator[Message]
```

### `ClaudeSDKClient` 最小示例（多轮）

```python
import asyncio
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions, AssistantMessage, TextBlock

async def main():
    opts = ClaudeAgentOptions(allowed_tools=["Read", "Edit", "Glob", "Grep"])
    async with ClaudeSDKClient(options=opts) as client:
        await client.query("分析 auth 模块")
        async for msg in client.receive_response():
            if isinstance(msg, AssistantMessage):
                for b in msg.content:
                    if isinstance(b, TextBlock): print(b.text)

        # 同一 session 继续
        await client.query("现在重构成 JWT 方式")
        async for msg in client.receive_response():
            pass

asyncio.run(main())
```

`ClaudeSDKClient` 关键方法：
- `connect(prompt=None)` — 连接（也可用 `async with`）
- `query(prompt)` — 发送新请求；`prompt` 可以是 `str` 或 `AsyncIterable[dict]`
- `receive_messages()` — 异步迭代所有消息直到会话结束
- `receive_response()` — 异步迭代到下一个 `ResultMessage` 为止（一轮对话的"响应"）
- `interrupt()` — 中断当前执行，之后要消费 drain 剩余消息
- `set_permission_mode(mode)` / `set_model(model)` — 中途切模式/模型
- `rewind_files(user_message_id)` — 回滚文件到某条用户消息时的快照（需 `enable_file_checkpointing=True`）
- `get_mcp_status()` / `get_context_usage()` / `get_server_info()` — 运行时状态
- `reconnect_mcp_server(name)` / `toggle_mcp_server(name, enabled)` / `stop_task(task_id)`
- `disconnect()`

## `ClaudeAgentOptions` 全字段速查

```python
@dataclass
class ClaudeAgentOptions:
    # —— 工具与 system prompt ——
    tools: list[str] | ToolsPreset | None = None
    allowed_tools: list[str] = []            # 自动批准列表
    disallowed_tools: list[str] = []          # 永远拒绝（优先级最高，bypassPermissions 下仍生效）
    system_prompt: str | SystemPromptPreset | SystemPromptFile | None = None

    # —— 权限 ——
    permission_mode: PermissionMode | None = None   # 见下节 6 种模式
    can_use_tool: CanUseTool | None = None           # 回调

    # —— MCP & 子 agent ——
    mcp_servers: dict[str, McpServerConfig] | str | Path = {}
    agents: dict[str, AgentDefinition] | None = None
    hooks: dict[HookEvent, list[HookMatcher]] | None = None

    # —— 会话 ——
    continue_conversation: bool = False    # 续最近一次
    resume: str | None = None              # 指定 session_id 续
    fork_session: bool = False             # 从 resume 的 session 分叉到新 id
    session_id: str | None = None

    # —— 模型 & 思考 ——
    model: str | None = None               # "claude-opus-4-7" / "sonnet" / ...
    fallback_model: str | None = None
    thinking: ThinkingConfig | None = None  # {"type": "adaptive"} | {"type":"enabled","budget_tokens":N} | {"type":"disabled"}
    effort: Literal["low","medium","high","max"] | None = None

    # —— 预算 & 限制 ——
    max_turns: int | None = None
    max_budget_usd: float | None = None
    task_budget: TaskBudget | None = None

    # —— 环境与设置源 ——
    cwd: str | Path | None = None
    add_dirs: list[str | Path] = []
    env: dict[str, str] = {}
    setting_sources: list[SettingSource] | None = None  # ["user","project","local"]；[] 完全禁用
    settings: str | None = None

    # —— 高级 ——
    include_partial_messages: bool = False   # 开启后会 yield StreamEvent
    enable_file_checkpointing: bool = False  # 允许 rewind_files()
    sandbox: SandboxSettings | None = None   # Bash 沙箱
    plugins: list[SdkPluginConfig] = []
    betas: list[SdkBeta] = []                # e.g. "context-1m-2025-08-07"
    output_format: dict[str, Any] | None = None  # {"type":"json_schema","schema":{...}}
    extra_args: dict[str, str | None] = {}   # 透传任意 CLI flag

    # —— 调试 ——
    stderr: Callable[[str], None] | None = None
    cli_path: str | Path | None = None
```

### `system_prompt` 的三种形态

```python
# 1) 完全自定义（替换默认）
ClaudeAgentOptions(system_prompt="你是 Python 专家...")

# 2) 用 Claude Code preset（保留默认能力 + 追加）
ClaudeAgentOptions(system_prompt={
    "type": "preset",
    "preset": "claude_code",
    "append": "总是写 type hints 和 docstring。",
    "exclude_dynamic_sections": True,   # 剥离 cwd/memory/git status，便于跨用户 prompt cache
})

# 3) 从文件加载
ClaudeAgentOptions(system_prompt={"type": "file", "path": "./prompts/reviewer.md"})
```

**默认行为**：SDK 默认只注入"最小 system prompt"（只含工具说明）。要获得 Claude Code 完整 system prompt（含 CLAUDE.md、git 状态等），必须显式 `system_prompt={"type":"preset","preset":"claude_code"}`。

### `setting_sources` 默认行为（0.1.60 修复）

- `None`（默认）→ 加载 CLI 默认：user + project + local；CLAUDE.md、`.claude/commands/`、`.claude/agents/` 全部生效
- `[]`（空 list）→ 完全禁用文件系统设置源（0.1.60 前曾被当 falsy 丢弃，注意升级）
- `["user"]` / `["user","project"]` → 精确控制

## 权限系统

### 6 种 `permission_mode`

| 模式 | 行为 |
|------|------|
| `default` | 标准；未匹配到 allow/deny 的工具触发 `can_use_tool` 回调 |
| `acceptEdits` | 自动批准文件编辑和 `mkdir/touch/rm/mv/cp/sed` 等文件操作 |
| `plan` | 禁止所有工具执行；只让 Claude 规划 |
| `dontAsk` | 把"询问"转成"拒绝"；只有 `allowed_tools` 显式列出的能跑；**不会调用 `can_use_tool`** |
| `bypassPermissions` | 跳过所有检查，全部放行（**仅 `disallowed_tools` 仍生效**） |
| `auto` | 与 TS SDK/CLI v2.1.90+ 对齐的自动模式 |

### 评估顺序

1. **Hooks** → 2. **deny 规则**（`disallowed_tools`）→ 3. **permission_mode** → 4. **allow 规则**（`allowed_tools`）→ 5. **`can_use_tool` 回调**

> 陷阱：`allowed_tools=["Read"] + permission_mode="bypassPermissions"` **仍会放行所有工具**。要限制就用 `disallowed_tools` 或换成 `dontAsk`。

### `can_use_tool` 回调签名

```python
from claude_agent_sdk import (
    PermissionResultAllow, PermissionResultDeny, ToolPermissionContext,
)

async def can_use_tool(
    tool_name: str,
    input_data: dict,
    context: ToolPermissionContext,  # .suggestions, .tool_use_id, .agent_id
) -> PermissionResultAllow | PermissionResultDeny:
    if tool_name == "Bash" and "rm -rf" in input_data.get("command", ""):
        return PermissionResultDeny(
            message="危险命令被拦截",
            interrupt=False,              # True 会终止整个 turn
        )
    if tool_name == "Write":
        # 修改参数后放行：把目标重定向到 ./safe/
        new_input = {**input_data, "file_path": f"./safe/{input_data['file_path'].split('/')[-1]}"}
        return PermissionResultAllow(updated_input=new_input)
    return PermissionResultAllow()
```

- `PermissionResultAllow(updated_input=..., updated_permissions=[PermissionUpdate(...)])`
  - `updated_input` 会替换模型给的工具参数（用于 path sanitization）
  - `updated_permissions` 可以追加 allow/deny 规则到 session / project / user settings
- `PermissionResultDeny(message, interrupt=False)` — `interrupt=True` 中止当前 turn

> 只有在 `permission_mode="default"`（或未解决的工具）时 `can_use_tool` 才会被调用。`dontAsk` / `bypassPermissions` 绕过它。

## 消息类型

```python
Message = UserMessage | AssistantMessage | SystemMessage | ResultMessage | StreamEvent | RateLimitEvent
```

| 类型 | 关键字段 | 说明 |
|------|---------|------|
| `UserMessage` | `content: str \| list[ContentBlock]` | 用户 prompt / tool result |
| `AssistantMessage` | `content: list[ContentBlock]`, `model`, `usage`, `session_id`, `stop_reason` | Claude 的一轮回复 |
| `SystemMessage` | `subtype`, `data` | 初始化、compact、状态等。`subtype=="init"` 的 `data` 含 `slash_commands`, `mcp_servers` |
| `ResultMessage` | `subtype`, `result`, `total_cost_usd`, `duration_ms`, `num_turns`, `session_id`, `permission_denials`, `structured_output` | 本轮终结消息；**捕获 `session_id` 在这里** |
| `StreamEvent` | `event: dict`（原始 Anthropic stream event） | 仅 `include_partial_messages=True` 时出现 |
| `RateLimitEvent` | `rate_limit_info` | 限流状态变化（可作退避信号） |

### 内容块（Content Blocks）

```python
ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock

TextBlock(text: str)
ThinkingBlock(thinking: str, signature: str)
ToolUseBlock(id: str, name: str, input: dict)
ToolResultBlock(tool_use_id: str, content: str | list[dict] | None, is_error: bool | None)
```

典型消费模式：

```python
async for msg in client.receive_response():
    if isinstance(msg, AssistantMessage):
        for block in msg.content:
            if isinstance(block, TextBlock):
                print(block.text)
            elif isinstance(block, ToolUseBlock):
                print(f"[tool] {block.name}({block.input})")
            elif isinstance(block, ThinkingBlock):
                print(f"[thinking] {block.thinking[:80]}...")
    elif isinstance(msg, ResultMessage):
        print(f"turns={msg.num_turns} cost=${msg.total_cost_usd:.4f} session={msg.session_id}")
```

## 自定义工具（in-process MCP）

```python
from claude_agent_sdk import tool, create_sdk_mcp_server, query, ClaudeAgentOptions

@tool("get_temperature", "Get current temperature at a location",
      {"latitude": float, "longitude": float})
async def get_temperature(args: dict) -> dict:
    # 业务逻辑...
    return {"content": [{"type": "text", "text": f"72°F"}]}

# 装箱为 in-process MCP server
weather = create_sdk_mcp_server(name="weather", version="1.0.0", tools=[get_temperature])

options = ClaudeAgentOptions(
    mcp_servers={"weather": weather},                     # key 即 server 名
    allowed_tools=["mcp__weather__get_temperature"],       # 注意命名规则
)
```

### 关键规则

- **工具命名**：对外是 `mcp__<server_name>__<tool_name>`；通配 `mcp__weather__*` 也可
- 返回 `{"content": [...], "is_error": True}` 告诉 Claude 工具失败
- `content` 支持 `text` / `image`（base64）/ `resource` / `resource_link`
- `@tool` 的 `input_schema` 支持：`{"name": str}` / TypedDict 类 / 完整 JSON Schema dict
- 用 `Annotated[str, "描述文字"]` 给参数加说明
- `ToolAnnotations(readOnlyHint=True)` 启用并行批量（只读类工具必加）

### 三种外部 MCP server 配置

```python
# 1) Stdio（本地子进程）
{"command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"],
 "env": {"GITHUB_TOKEN": os.environ["GITHUB_TOKEN"]}}

# 2) HTTP
{"type": "http", "url": "https://api.example.com/mcp",
 "headers": {"Authorization": f"Bearer {token}"}}

# 3) SSE
{"type": "sse", "url": "https://api.example.com/mcp/sse",
 "headers": {"Authorization": f"Bearer {token}"}}

# 4) SDK in-process（上面那种）— 用 create_sdk_mcp_server() 返回的 dict
```

从 `SystemMessage.data["mcp_servers"]` 查询连接状态，或 `await client.get_mcp_status()`。

## Hooks（SDK 层回调）

与 CLI hooks（shell 命令）不同，**SDK hooks 是 Python async callable**，走 control protocol 进程内执行。

```python
from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient, HookMatcher
from claude_agent_sdk.types import HookInput, HookContext, HookJSONOutput

async def block_dangerous_bash(
    input_data: HookInput, tool_use_id: str | None, context: HookContext
) -> HookJSONOutput:
    if input_data["tool_name"] == "Bash":
        cmd = input_data["tool_input"].get("command", "")
        if "rm -rf /" in cmd:
            return {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": "危险命令",
                }
            }
    return {}

opts = ClaudeAgentOptions(
    allowed_tools=["Bash"],
    hooks={
        "PreToolUse": [HookMatcher(matcher="Bash", hooks=[block_dangerous_bash])],
    },
)
```

### 支持的事件

`PreToolUse` / `PostToolUse` / `PostToolUseFailure` / `UserPromptSubmit` / `Stop` / `SubagentStop` / `SubagentStart` / `PreCompact` / `Notification` / `PermissionRequest`

### `HookCallback` 签名与返回字段

```python
HookCallback = Callable[[HookInput, str | None, HookContext], Awaitable[HookJSONOutput]]
```

返回 dict 支持：
- `continue_: bool`（Python 名，发 CLI 时转 `continue`）— False 终止 turn
- `stopReason: str` — 搭配 `continue_=False`
- `suppressOutput: bool`
- `systemMessage: str` — 给用户看的提示
- `reason: str` — 给模型看的反馈
- `decision: "block"`
- `hookSpecificOutput: {hookEventName, permissionDecision: "allow"|"deny"|"ask", permissionDecisionReason, updatedInput, additionalContext}`

`HookMatcher(matcher="Bash|Write|Edit", hooks=[...], timeout=60)` — matcher 为 `None` 表示匹配所有。

## 子 agent（Subagent）

```python
from claude_agent_sdk import AgentDefinition, ClaudeAgentOptions, query

async for msg in query(
    prompt="Review auth module for security",
    options=ClaudeAgentOptions(
        allowed_tools=["Read", "Grep", "Glob", "Agent"],   # 必须包含 Agent
        agents={
            "code-reviewer": AgentDefinition(
                description="代码审查专家，擅长安全与性能",
                prompt="你是资深安全审查员……",
                tools=["Read", "Grep", "Glob"],
                model="sonnet",             # "sonnet" | "opus" | "haiku" | "inherit" | 全模型 id
            ),
            "test-runner": AgentDefinition(
                description="跑测试并分析失败",
                prompt="你是测试执行专家……",
                tools=["Bash", "Read"],
            ),
        },
    ),
):
    ...
```

`AgentDefinition` 字段：`description` / `prompt`（必填）、`tools` / `disallowedTools` / `model` / `skills` / `memory` / `mcpServers` / `initialPrompt` / `maxTurns` / `background` / `effort` / `permissionMode`。

**关键约束**：
- 子 agent 的 `tools` 里**不要**放 `Agent`（不能再递归 spawn）
- 子 agent 继承：自己的 system prompt、项目 CLAUDE.md（需 setting_sources 开启）、工具定义；**不继承**父的对话历史、父的 system prompt
- 父用 `bypassPermissions` / `acceptEdits` 时，子 agent 强制继承且不可覆盖
- 也可用文件系统方式：`.claude/agents/*.md`，启动时加载；改完要重启 session

## 会话管理

### 捕获 / resume / fork

```python
from claude_agent_sdk import query, ClaudeAgentOptions, ResultMessage

# 1) 捕获 session_id（只在 ResultMessage 上可靠）
session_id = None
async for msg in query(prompt="分析 auth 模块", options=ClaudeAgentOptions(
        allowed_tools=["Read","Glob","Grep"])):
    if isinstance(msg, ResultMessage):
        session_id = msg.session_id

# 2) 恢复特定 session
async for msg in query(prompt="现在实现之前建议的重构",
        options=ClaudeAgentOptions(resume=session_id,
            allowed_tools=["Read","Edit","Write"])):
    pass

# 3) Fork（从 session_id 分叉到新 id，原 session 不受影响）
async for msg in query(prompt="改用 OAuth2",
        options=ClaudeAgentOptions(resume=session_id, fork_session=True)):
    if isinstance(msg, ResultMessage):
        forked_id = msg.session_id   # ≠ session_id

# 4) 续最近一次（无需 id）
ClaudeAgentOptions(continue_conversation=True)
```

### 会话枚举 API

```python
from claude_agent_sdk import list_sessions, get_session_messages, get_session_info

for info in list_sessions():        # SDKSessionInfo[]
    print(info.session_id, info.summary, info.cwd, info.last_modified)

for m in get_session_messages(session_id):  # SessionMessage[]
    print(m.type, m.message)
```

同系列还有 `rename_session`、`tag_session`、`delete_session`、`fork_session`、`list_subagents`、`get_subagent_messages`（0.1.60+）。

### 会话文件位置

`~/.claude/projects/<encoded-cwd>/<session-id>.jsonl` — **只存在本机**。跨主机要么 rsync 这份文件，要么把结果提炼为 application state 传入新 session 的 prompt。

## 流式输入（推荐模式）

`ClaudeSDKClient.query()` 接受 `AsyncIterable[dict]`，可逐条 yield 用户消息（支持图片）：

```python
async def msg_gen():
    yield {"type":"user","message":{"role":"user","content":"Review codebase"}}
    await asyncio.sleep(1)
    # 带图的后续消息
    yield {"type":"user","message":{"role":"user","content":[
        {"type":"text","text":"Also review this diagram"},
        {"type":"image","source":{"type":"base64","media_type":"image/png","data": b64}},
    ]}}

async with ClaudeSDKClient(opts) as client:
    await client.query(msg_gen())
    async for m in client.receive_response(): ...
```

单消息模式（`query()` + str）不支持图片、动态队列、中断、hooks 全部能力。

## 思考（Extended Thinking）

```python
ClaudeAgentOptions(thinking={"type":"adaptive"})                         # 模型决定
ClaudeAgentOptions(thinking={"type":"enabled","budget_tokens":20000})   # 固定预算
ClaudeAgentOptions(thinking={"type":"disabled"})                         # 关闭
# 或者简化写 effort："low" | "medium" | "high" | "max"
```

> 0.1.57 修了个坑：`{"type":"adaptive"}` 过去被错误映射成 `--max-thinking-tokens 32000`；现在正确走 `--thinking adaptive`。`max_thinking_tokens` 已弃用，统一用 `thinking`。

消费 `ThinkingBlock`：

```python
for b in msg.content:
    if isinstance(b, ThinkingBlock):
        print(b.thinking)   # 推理过程
```

## 错误类型

```python
from claude_agent_sdk import (
    ClaudeSDKError,        # 基类
    CLINotFoundError,      # 找不到 Claude CLI
    CLIConnectionError,    # 连接失败
    ProcessError,          # CLI 子进程异常
    CLIJSONDecodeError,    # CLI 输出 JSON 解析失败
)
```

## 常见模式

### 1. 锁死的只读代理

```python
ClaudeAgentOptions(
    allowed_tools=["Read","Grep","Glob"],
    permission_mode="dontAsk",         # 其他工具一律拒绝，不走 can_use_tool
    system_prompt={"type":"preset","preset":"claude_code"},
)
```

### 2. 自动接受编辑的 coding agent

```python
ClaudeAgentOptions(
    allowed_tools=["Read","Edit","Write","Bash","Grep","Glob"],
    permission_mode="acceptEdits",
    enable_file_checkpointing=True,    # 允许后续 rewind_files
    cwd="/path/to/project",
    setting_sources=["project"],       # 加载项目 CLAUDE.md
)
```

### 3. 中断长任务

```python
async with ClaudeSDKClient() as client:
    await client.query("一步步列出 1 到 100")
    await asyncio.sleep(2)
    await client.interrupt()
    async for _ in client.receive_response():   # drain
        pass
```

### 4. 动态权限升级

```python
async with ClaudeSDKClient(opts) as client:
    await client.set_permission_mode("plan")
    await client.query("先给我方案")
    async for _ in client.receive_response(): ...

    await client.set_permission_mode("acceptEdits")
    await client.query("OK 开始执行")
    async for _ in client.receive_response(): ...
```

### 5. 探索性 fork

用户觉得当前方向不对，另起分支对比两条路径：

```python
base_sid = ...  # 之前捕获
# 继续原 session
async for _ in query(prompt="继续 JWT 方案",
        options=ClaudeAgentOptions(resume=base_sid)): ...

# Fork 到 OAuth 方案
async for msg in query(prompt="改用 OAuth2",
        options=ClaudeAgentOptions(resume=base_sid, fork_session=True)):
    if isinstance(msg, ResultMessage):
        oauth_sid = msg.session_id
```

### 6. 生产环境审计

```python
def audit_hook_factory(logger):
    async def h(inp, tid, ctx):
        logger.info("tool=%s input=%s", inp.get("tool_name"), inp.get("tool_input"))
        return {}
    return h

opts = ClaudeAgentOptions(
    hooks={"PreToolUse": [HookMatcher(matcher=None, hooks=[audit_hook_factory(log)])]},
    can_use_tool=strict_callback,
    disallowed_tools=["WebFetch"],     # 即便 bypassPermissions 也拦住
    max_budget_usd=5.0,
    max_turns=50,
)
```

## 注意事项

- **默认 system prompt 是"最小"的**。不显式设 preset，CLAUDE.md 不会被模型看到（仍由 `setting_sources` 控制文件加载，但没加 preset 的话初始上下文很稀）。生产推荐 `{"type":"preset","preset":"claude_code"}`
- **`setting_sources=[]` 在 < 0.1.60 是 no-op**，会被当作 falsy 丢弃。要禁用请升级
- **`bypassPermissions` 是核弹**：`allowed_tools` 在这种模式下不生效，只有 `disallowed_tools` 和 hooks 能拦住。生产强烈反对默认启用
- **`can_use_tool` 只在 `default` 模式下被调用**；`dontAsk`/`bypassPermissions` 不走它
- **`session_id` 只在 `ResultMessage` 上是权威的**；中途 `AssistantMessage.session_id` 也会有，但习惯在 Result 捕获更稳
- **`Opus 4.7` 需要 SDK ≥ 0.2.111**，否则 `thinking.type.enabled` 会报错
- **子 agent 不能 spawn 子 agent**：不要在 `AgentDefinition.tools` 里加 `Agent`
- **父 agent 的权限模式会下渗到子 agent 且不可覆盖**（仅 `bypassPermissions` / `acceptEdits`）
- **Hooks 是进程内 Python 回调**，和 CLI 层 `~/.claude/settings.json` 里的 shell hooks 是两套机制，但同名事件会一起触发
- **会话文件本地化**：跨机器部署不要依赖 `resume`，用应用状态 + 新 session 更可靠
- **`include_partial_messages=True`** 会显著增加消息量（每个 token 一批 `StreamEvent`），只在做实时 UI 时打开
- **`extra_args`** 是逃生舱：CLI 新增 flag 但 SDK 没暴露时，用 `extra_args={"new-flag": "value", "bool-flag": None}` 透传

## 组合提示

- 与 **`mcp`** 生态：用 `create_sdk_mcp_server` 把内部 RPC 封装成工具；外部 server 用 stdio/HTTP/SSE 接入
- 与 **`langgraph` / `pydantic-ai`**：把 `query()` 包成一个节点/工具；SDK 负责一个回合内的 Claude Code 式工具循环
- 与 **`pytest` / CI**：无状态 `query()` + `permission_mode="dontAsk"` + `max_budget_usd` 做审查机器人
- 与 **`fastapi`**：用 `ClaudeSDKClient` 承接长连接 WebSocket，把 `receive_response()` 的消息向前端透传，图片走流式输入
- 与 **`opentelemetry`**：装 `claude-agent-sdk[otel]`，自动把 W3C trace context（`TRACEPARENT`/`TRACESTATE`）透传进 CLI 子进程（0.1.60+）

## 参考文件

- `references/hooks-cheatsheet.md` — Hook 事件字段与返回值完整表
- `references/options-full-types.md` — 完整 TypedDict / dataclass 类型签名
