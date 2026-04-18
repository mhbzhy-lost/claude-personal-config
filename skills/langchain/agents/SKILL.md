---
name: langchain-agents
description: LangChain v1 create_agent 构建可调用工具的推理 agent，含工具定义、中间件、动态模型/prompt、结构化输出
tech_stack: [langchain, langgraph]
language: [python]
capability: [agent-orchestration, tool-calling]
version: "langchain 1.x"
collected_at: 2026-04-18
---

# LangChain Agents（create_agent）

> 来源：https://docs.langchain.com/oss/python/langchain/agents ；/tools ；/migrate/langchain-v1

## 用途
`create_agent` 是 LangChain v1 的生产级 agent 入口，基于 LangGraph 构建。agent 在循环中运行：接收输入 → 模型决策 → 执行工具 → 观察结果 → 继续，直到无更多 tool call 或达到迭代上限。**取代 v0 的 `langgraph.prebuilt.create_react_agent` 和 `create_tool_calling_agent`。**

## 何时使用
- 任务需要迭代推理 + 动态选择工具
- 执行顺序事先未知的多步问题求解
- 需要工具（搜索、数据库、代码执行、API 调用）扩展 LLM 能力
- 需要结构化输出、人工审批、对话总结等能力——通过 middleware 组合

## 基础用法

```python
from langchain.agents import create_agent
from langchain.tools import tool

@tool
def search(query: str) -> str:
    """Search for information."""
    return f"Results for: {query}"

agent = create_agent(
    model="claude-sonnet-4-6",
    tools=[search],
    system_prompt="You are a helpful assistant.",
)

result = agent.invoke({
    "messages": [{"role": "user", "content": "AI 安全趋势"}]
})
```

### 静态 context
```python
from dataclasses import dataclass

@dataclass
class Context:
    user_id: str
    session_id: str

agent = create_agent(model=..., tools=[...], context_schema=Context)
agent.invoke({"messages": [...]}, context=Context(user_id="123", session_id="abc"))
```

### 结构化输出
```python
from langchain.agents.structured_output import ToolStrategy
from pydantic import BaseModel

class Weather(BaseModel):
    temperature: float
    condition: str

agent = create_agent("gpt-4.1-mini", tools=[weather_tool], response_format=ToolStrategy(Weather))
result = agent.invoke({"messages": [...]})
result["structured_response"]  # Weather(...)
```

### Middleware（预置 + 自定义）
```python
from langchain.agents.middleware import (
    PIIMiddleware, SummarizationMiddleware, HumanInTheLoopMiddleware,
    AgentMiddleware, ModelRequest,
)

agent = create_agent(
    model="claude-sonnet-4-6",
    tools=[read_email, send_email],
    middleware=[
        PIIMiddleware("email", strategy="redact", apply_to_input=True),
        SummarizationMiddleware(model="claude-sonnet-4-6", trigger={"tokens": 500}),
        HumanInTheLoopMiddleware(interrupt_on={
            "send_email": {"allowed_decisions": ["approve", "edit", "reject"]}
        }),
    ],
)
```

自定义 middleware（动态模型 + tool 选择）：
```python
class ExpertiseMiddleware(AgentMiddleware):
    def wrap_model_call(self, request: ModelRequest, handler):
        level = request.runtime.context.user_expertise
        model = ChatOpenAI(model="gpt-5" if level == "expert" else "gpt-5-nano")
        return handler(request.override(model=model, tools=[...]))
```

### 流式
```python
for chunk in agent.stream({"messages": [...]}, stream_mode="values"):
    ...  # chunk 是完整 state 快照
```

## 关键 API
- `create_agent(model, tools, system_prompt=None, name=None, state_schema=None, middleware=None, context_schema=None, response_format=None, checkpointer=None, store=None)`
- `@tool`：函数 → 工具，需要 type hints + docstring
- 工具返回值支持 `str` / dict / `Command`（更新 state）
- `ToolRuntime` 参数：`state` / `context` / `store` / `stream_writer` / `execution_info`
- 预置 middleware：`PIIMiddleware` / `SummarizationMiddleware` / `HumanInTheLoopMiddleware`
- Middleware hook：`before_agent` / `before_model` / `wrap_model_call` / `wrap_tool_call` / `after_model` / `after_agent`
- 装饰器：`@dynamic_prompt` / `@wrap_model_call` / `@wrap_tool_call`
- 结构化输出：`ToolStrategy` / `ProviderStrategy`
- `response.content_blocks`：跨 provider 统一的内容块（text / reasoning / tool_call / image）

## 注意事项（v1 迁移必读）
- `create_agent` 取代 `create_react_agent` / `create_tool_calling_agent`（后者 404 已移除）
- 参数改名：`prompt` → `system_prompt`，接受字符串或 `SystemMessage`
- **State 必须是 `TypedDict`**，不支持 Pydantic / dataclass；通过 `state_schema=` 或 middleware 扩展
- **不再支持预先 bind 的模型**，动态模型需用 `wrap_model_call` middleware
- 工具错误处理从参数移到 `@wrap_tool_call` middleware
- 流式节点名从 `"agent"` 改为 `"model"`
- Python 3.10+ 必需
- 聊天模型返回类型统一为 `AIMessage`
- 消息 `.text()` 变为 property（非方法）
- `AIMessage` 移除了 `example` 参数
- **保留参数**：tool 参数名禁止用 `config` 与 `runtime`（框架占用）
- Agent `name` 用 snake_case（跨 provider 兼容）
- 避免不可信 `jinja2` 模板（任意代码执行风险）

## 组合提示
- 记忆：`checkpointer=InMemorySaver()` + `store=InMemoryStore()`（见 `langchain-memory`）
- Prompt 模板：与 `ChatPromptTemplate` / `PydanticOutputParser` 配合（见 `langchain-prompts-parsers`）
- 复杂编排：`RunnableParallel` / `RunnableBranch` 在 agent 外层组合（见 `langchain-chains`）
- RAG：工具中调用 retriever，见 `langchain-retrievers` / `langchain-rag-chain`
