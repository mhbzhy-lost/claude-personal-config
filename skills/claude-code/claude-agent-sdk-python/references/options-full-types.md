# 完整类型签名（摘自 `claude_agent_sdk.types`）

## ClaudeAgentOptions（完整 dataclass）

```python
@dataclass
class ClaudeAgentOptions:
    tools: list[str] | ToolsPreset | None = None
    allowed_tools: list[str] = field(default_factory=list)
    system_prompt: str | SystemPromptPreset | SystemPromptFile | None = None
    mcp_servers: dict[str, McpServerConfig] | str | Path = field(default_factory=dict)
    permission_mode: PermissionMode | None = None
    continue_conversation: bool = False
    resume: str | None = None
    session_id: str | None = None
    max_turns: int | None = None
    max_budget_usd: float | None = None
    disallowed_tools: list[str] = field(default_factory=list)
    model: str | None = None
    fallback_model: str | None = None
    betas: list[SdkBeta] = field(default_factory=list)
    permission_prompt_tool_name: str | None = None
    cwd: str | Path | None = None
    cli_path: str | Path | None = None
    settings: str | None = None
    add_dirs: list[str | Path] = field(default_factory=list)
    env: dict[str, str] = field(default_factory=dict)
    extra_args: dict[str, str | None] = field(default_factory=dict)
    max_buffer_size: int | None = None
    debug_stderr: Any = sys.stderr                 # 已弃用，改用 stderr callback
    stderr: Callable[[str], None] | None = None
    can_use_tool: CanUseTool | None = None
    hooks: dict[HookEvent, list[HookMatcher]] | None = None
    user: str | None = None
    include_partial_messages: bool = False
    fork_session: bool = False
    agents: dict[str, AgentDefinition] | None = None
    setting_sources: list[SettingSource] | None = None
    sandbox: SandboxSettings | None = None
    plugins: list[SdkPluginConfig] = field(default_factory=list)
    max_thinking_tokens: int | None = None          # 弃用，改用 thinking
    thinking: ThinkingConfig | None = None
    effort: Literal["low","medium","high","max"] | None = None
    output_format: dict[str, Any] | None = None
    enable_file_checkpointing: bool = False
    task_budget: TaskBudget | None = None
```

## Literal 枚举

```python
PermissionMode = Literal["default","acceptEdits","plan","bypassPermissions","dontAsk","auto"]
SettingSource  = Literal["user","project","local"]
SdkBeta        = Literal["context-1m-2025-08-07"]
```

## SystemPrompt / Thinking 配置

```python
class SystemPromptPreset(TypedDict):
    type: Literal["preset"]
    preset: Literal["claude_code"]
    append: NotRequired[str]
    exclude_dynamic_sections: NotRequired[bool]

class SystemPromptFile(TypedDict):
    type: Literal["file"]
    path: str

class ThinkingConfigAdaptive(TypedDict):
    type: Literal["adaptive"]

class ThinkingConfigEnabled(TypedDict):
    type: Literal["enabled"]
    budget_tokens: int

class ThinkingConfigDisabled(TypedDict):
    type: Literal["disabled"]

ThinkingConfig = ThinkingConfigAdaptive | ThinkingConfigEnabled | ThinkingConfigDisabled
```

## MCP Server 配置（4 种）

```python
class McpStdioServerConfig(TypedDict):
    type: NotRequired[Literal["stdio"]]   # 可省略；历史兼容
    command: str
    args: NotRequired[list[str]]
    env: NotRequired[dict[str, str]]

class McpSSEServerConfig(TypedDict):
    type: Literal["sse"]
    url: str
    headers: NotRequired[dict[str, str]]

class McpHttpServerConfig(TypedDict):
    type: Literal["http"]
    url: str
    headers: NotRequired[dict[str, str]]

class McpSdkServerConfig(TypedDict):
    type: Literal["sdk"]
    name: str
    instance: McpServer     # create_sdk_mcp_server() 生成

McpServerConfig = McpStdioServerConfig | McpSSEServerConfig | McpHttpServerConfig | McpSdkServerConfig
```

## AgentDefinition

```python
@dataclass
class AgentDefinition:
    description: str
    prompt: str
    tools: list[str] | None = None
    disallowedTools: list[str] | None = None
    model: str | None = None                # "sonnet"|"opus"|"haiku"|"inherit"|全 id
    skills: list[str] | None = None
    memory: Literal["user","project","local"] | None = None
    mcpServers: list[str | dict[str, Any]] | None = None
    initialPrompt: str | None = None
    maxTurns: int | None = None
    background: bool | None = None
    effort: Literal["low","medium","high","max"] | int | None = None
    permissionMode: PermissionMode | None = None
```

## Permission

```python
@dataclass
class ToolPermissionContext:
    signal: Any | None = None
    suggestions: list[PermissionUpdate] = field(default_factory=list)
    tool_use_id: str | None = None
    agent_id: str | None = None

@dataclass
class PermissionResultAllow:
    behavior: Literal["allow"] = "allow"
    updated_input: dict[str, Any] | None = None
    updated_permissions: list[PermissionUpdate] | None = None

@dataclass
class PermissionResultDeny:
    behavior: Literal["deny"] = "deny"
    message: str = ""
    interrupt: bool = False

PermissionResult = PermissionResultAllow | PermissionResultDeny
CanUseTool = Callable[[str, dict[str, Any], ToolPermissionContext], Awaitable[PermissionResult]]

@dataclass
class PermissionUpdate:
    type: Literal["addRules","replaceRules","removeRules","setMode","addDirectories","removeDirectories"]
    rules: list[PermissionRuleValue] | None = None
    behavior: Literal["allow","deny","ask"] | None = None
    mode: PermissionMode | None = None
    directories: list[str] | None = None
    destination: Literal["userSettings","projectSettings","localSettings","session"] | None = None
```

## 会话相关

```python
@dataclass
class SDKSessionInfo:
    session_id: str
    summary: str
    last_modified: int           # epoch ms
    file_size: int | None = None
    custom_title: str | None = None
    first_prompt: str | None = None
    git_branch: str | None = None
    cwd: str | None = None
    tag: str | None = None
    created_at: int | None = None

@dataclass
class SessionMessage:
    type: Literal["user","assistant"]
    uuid: str
    session_id: str
    message: Any                  # 原始 Anthropic API message dict
    parent_tool_use_id: None = None
```

## 消息类型（完整）

```python
@dataclass
class AssistantMessage:
    content: list[ContentBlock]
    model: str
    parent_tool_use_id: str | None = None
    error: AssistantMessageError | None = None     # "rate_limit" | "billing_error" | ...
    usage: dict[str, Any] | None = None
    message_id: str | None = None
    stop_reason: str | None = None
    session_id: str | None = None
    uuid: str | None = None

@dataclass
class ResultMessage:
    subtype: str                  # "success" | "error" | ...
    duration_ms: int
    duration_api_ms: int
    is_error: bool
    num_turns: int
    session_id: str
    stop_reason: str | None = None
    total_cost_usd: float | None = None
    usage: dict[str, Any] | None = None
    result: str | None = None
    structured_output: Any = None     # output_format 定义时
    model_usage: dict[str, Any] | None = None
    permission_denials: list[Any] | None = None
    errors: list[str] | None = None
    uuid: str | None = None
```

## RateLimit

```python
RateLimitStatus = Literal["allowed","allowed_warning","rejected"]
RateLimitType = Literal["five_hour","seven_day","seven_day_opus","seven_day_sonnet","overage"]

@dataclass
class RateLimitInfo:
    status: RateLimitStatus
    resets_at: int | None = None
    rate_limit_type: RateLimitType | None = None
    utilization: float | None = None
    overage_status: RateLimitStatus | None = None
    overage_resets_at: int | None = None
    overage_disabled_reason: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)
```
