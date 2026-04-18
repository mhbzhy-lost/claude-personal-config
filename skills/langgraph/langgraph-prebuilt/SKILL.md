---
name: langgraph-prebuilt
description: "LangGraph 预置组件：create_react_agent、ToolNode、tools_condition 及 create_agent 迁移"
tech_stack: [langgraph, backend]
language: [python]
capability: [agent-orchestration, tool-calling]
---

# Prebuilt（预置组件）

> 版本：langgraph 1.1.x / langgraph-prebuilt 1.0.x | 来源：https://docs.langchain.com/oss/python/langgraph/prebuilt

## 用途

LangGraph 提供的开箱即用组件，快速搭建 ReAct agent 等常见模式，无需手动构建完整图。

## 何时使用

- 快速原型：用一行代码创建能调用工具的 agent
- 标准 ReAct 模式：LLM ↔ 工具循环
- 需要工具执行和错误处理的节点

## 1. create_react_agent — 一行创建 ReAct Agent

```python
from langgraph.prebuilt import create_react_agent
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o")
tools = [search_tool, calculator_tool]

agent = create_react_agent(llm, tools)
result = agent.invoke({"messages": [("user", "What is 2+2?")]})
```

### 关键参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `model` | `BaseChatModel` | LLM 实例 |
| `tools` | `list[BaseTool \| Callable \| dict]` | 工具列表 |
| `prompt` | `str \| SystemMessage` | 系统提示（部分版本中名为 `state_modifier`） |
| `checkpointer` | `BaseCheckpointSaver` | 持久化 |
| `interrupt_before` | `list[str]` | 断点：在指定节点前暂停 |
| `interrupt_after` | `list[str]` | 断点：在指定节点后暂停 |

### 带系统提示

```python
agent = create_react_agent(
    llm, 
    tools,
    prompt="You are a helpful research assistant. Always cite sources."
)
```

## 2. ⚠️ create_agent 迁移（LangChain v1）

`create_react_agent` 在 LangChain v1 中被 `create_agent` 替代：

```python
from langchain.agents import create_agent

agent = create_agent(
    model="gpt-4o",                    # 可直接传模型名字符串
    tools=[search_tool, calc_tool],
    system_prompt="You are a helpful assistant.",
    response_format=MyOutputSchema,    # 结构化输出
    middleware=[my_middleware],         # 中间件钩子
)
```

### create_agent 新增能力

| 特性 | 说明 |
|------|------|
| `model` 字符串 | 直接传模型名，无需实例化 |
| `middleware` | 钩子系统：`before_model` / `after_model` / `wrap_model_call` |
| `response_format` | Pydantic schema 强制结构化输出 |
| `context_schema` | 上下文注入 schema |

> **迁移建议**：`create_react_agent` 仍可使用但已标记废弃，新项目建议用 `create_agent`。

## 3. ToolNode — 工具执行节点

自动解析 LLM 返回的 `tool_calls` 并执行对应工具。

```python
from langgraph.prebuilt import ToolNode

tool_node = ToolNode(
    tools=[search_tool, calc_tool],
    handle_tool_errors=True   # 推荐：异常转为错误消息而非抛出
)

# 在图中使用
graph.add_node("tools", tool_node)
```

### handle_tool_errors 行为

| 值 | 行为 |
|----|------|
| `True` (推荐) | 工具异常 → 返回 ToolMessage(content=error_str) 给 LLM |
| `False` | 工具异常 → 直接抛出，中断图执行 |
| `str` | 自定义错误消息模板 |
| `Callable` | 自定义错误处理函数 |

## 4. tools_condition — 预置路由函数

```python
from langgraph.prebuilt import tools_condition

graph.add_conditional_edges("chatbot", tools_condition)
```

等价于：

```python
def route(state):
    last_message = state["messages"][-1]
    if last_message.tool_calls:
        return "tools"
    return END
```

## 5. ValidationNode — 输出验证

```python
from langgraph.prebuilt import ValidationNode
from pydantic import BaseModel

class Output(BaseModel):
    answer: str
    confidence: float

validation_node = ValidationNode([Output])
graph.add_node("validate", validation_node)
```

验证失败时返回包含错误信息的 ToolMessage，LLM 可据此修正输出。

## 6. 完整手动 ReAct Agent（使用底层组件）

```python
from langgraph.graph import StateGraph, START, END, MessagesState
from langgraph.prebuilt import ToolNode, tools_condition
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o")
tools = [search_tool, calc_tool]
llm_with_tools = llm.bind_tools(tools)

def chatbot(state: MessagesState):
    return {"messages": [llm_with_tools.invoke(state["messages"])]}

graph = StateGraph(MessagesState)
graph.add_node("chatbot", chatbot)
graph.add_node("tools", ToolNode(tools, handle_tool_errors=True))
graph.add_edge(START, "chatbot")
graph.add_conditional_edges("chatbot", tools_condition)
graph.add_edge("tools", "chatbot")

app = graph.compile()
result = app.invoke({"messages": [("user", "Search for LangGraph docs")]})
```

## 7. 给 create_react_agent 添加持久化

```python
from langgraph.checkpoint.memory import InMemorySaver

agent = create_react_agent(llm, tools, checkpointer=InMemorySaver())

config = {"configurable": {"thread_id": "session-1"}}
agent.invoke({"messages": [("user", "hi")]}, config)
agent.invoke({"messages": [("user", "what did I just say?")]}, config)
```

## 注意事项

- `langgraph-prebuilt==1.0.2` 有已知 breaking change（`ToolNode.afunc` 需要 `runtime` 参数），建议 pin 版本
- `handle_tool_errors=True` 是生产必备设置
- `create_react_agent` 返回的是 `CompiledStateGraph`，可直接 `.invoke()` / `.stream()`
- `tools_condition` 硬编码了节点名 `"tools"`，如果你的工具节点名不同需要自定义路由
- `bind_tools()` 是 LangChain ChatModel 的方法，不是 LangGraph 的

## 组合提示

| 场景 | 参考 Skill |
|------|-----------|
| 手动构建图 | `langgraph-core` |
| 多 Agent 编排 | `langgraph-multi-agent` |
| 错误处理与重试 | `langgraph-patterns` |
| 流式输出 | `langgraph-streaming` |
