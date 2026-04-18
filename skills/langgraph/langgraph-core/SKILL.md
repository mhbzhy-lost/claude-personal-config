---
name: langgraph-core
description: "LangGraph 核心图 API：StateGraph 构建、节点/边/条件边、编译与执行（invoke/stream）、Pregel 超步模型。"
tech_stack: [langgraph, backend]
language: [python]
capability: [agent-orchestration]
---

# LangGraph Core（核心图 API）

> 版本：langgraph 1.1.x (Python) | 来源：https://docs.langchain.com/oss/python/langgraph/graph-api

## 用途

LangGraph 是基于 Pregel 执行模型的有状态、支持循环的 agent 编排框架。通过 StateGraph 将节点（函数）和边（路由逻辑）组装为有向图，编译后获得可执行的 CompiledStateGraph。可脱离 LangChain 单独使用。

## 何时使用

- 需要构建包含循环、条件分支的 agent 工作流
- 需要在多步推理中维护和更新共享状态
- 需要持久化对话 / 检查点 / human-in-the-loop
- 需要多 agent 协作或层级子图

## 安装

```bash
pip install langgraph          # 当前稳定版 1.1.6
# 常见搭配（按需）
pip install langchain-openai   # OpenAI 集成
pip install langgraph-checkpoint-sqlite  # 本地持久化
```

## 核心导入

```python
from langgraph.graph import StateGraph, START, END, MessagesState
from langgraph.graph.message import add_messages
```

## StateGraph 类

### 构造

```python
StateGraph(state_schema, *, input=None, output=None)
```

- `state_schema` -- 状态类型，可以是 `TypedDict`、`dataclass` 或 Pydantic `BaseModel`
- `input` -- 可选，输入 Schema（限制 invoke 接受的字段）
- `output` -- 可选，输出 Schema（限制 invoke 返回的字段）

### add_node

```python
graph.add_node(name: str, func, *, cache_policy=None, retry=None)
```

- `func` 签名：`(state) -> dict` 或 `(state, config) -> dict`
- 节点函数**返回 dict 作为状态增量更新**，不是完整状态
- 函数名即默认节点名，也可显式传 `name`

### add_edge

```python
graph.add_edge(source: str, target: str)
```

- `source` 可以是 `START`，`target` 可以是 `END`
- 固定路由：source 执行完后**必定**走向 target

### add_conditional_edges

```python
graph.add_conditional_edges(source: str, path: Callable, path_map: dict | None = None)
```

- `path` 函数接收 `state`，返回**节点名字符串**或**节点名列表**（并行分发）
- `path_map`（可选）：将 path 返回值映射为实际节点名
- 返回 `END` 表示终止图执行

### compile

```python
app = graph.compile(
    checkpointer=None,      # 持久化后端（MemorySaver / SqliteSaver 等）
    cache=None,              # 节点级缓存
    interrupt_before=None,   # list[str]，在指定节点前暂停
    interrupt_after=None,    # list[str]，在指定节点后暂停
    debug=False,             # 打印调试信息
)
```

- 编译后返回 `CompiledStateGraph`，不可变
- 编译时会做基础结构校验（孤立节点等）

## 执行 -- CompiledStateGraph

### invoke（同步，返回最终状态）

```python
result = app.invoke(
    {"messages": [("user", "hello")]},
    config={"configurable": {"thread_id": "t1"}, "recursion_limit": 50},
)
```

### stream（同步迭代器）

```python
for chunk in app.stream(
    {"messages": [("user", "hello")]},
    config={"configurable": {"thread_id": "t1"}},
    stream_mode="values",   # 默认 "values"
):
    print(chunk)
```

### 异步变体

```python
result = await app.ainvoke(input, config)
async for chunk in app.astream(input, config, stream_mode="updates"):
    print(chunk)
```

### config 格式

```python
config = {
    # 顶级键
    "recursion_limit": 50,       # 默认 25（注意：不在 configurable 内）
    "tags": ["my-run"],
    "metadata": {"user": "alice"},
    # 嵌套键
    "configurable": {
        "thread_id": "t1",       # 持久化线程标识（需 checkpointer）
    },
}
```

> `recursion_limit` 是 config 的**顶级键**，不要放进 `configurable`。

## 最小完整示例

```python
from typing import Annotated, TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langchain_openai import ChatOpenAI

class State(TypedDict):
    messages: Annotated[list, add_messages]

llm = ChatOpenAI(model="gpt-4o")

def chatbot(state: State):
    return {"messages": [llm.invoke(state["messages"])]}

graph = StateGraph(State)
graph.add_node("chatbot", chatbot)
graph.add_edge(START, "chatbot")
graph.add_edge("chatbot", END)

app = graph.compile()
result = app.invoke({"messages": [("user", "hello")]})
print(result["messages"][-1].content)
```

## 条件边示例（工具路由）

```python
from langgraph.prebuilt import ToolNode

tools = [my_tool]
tool_node = ToolNode(tools)
llm_with_tools = llm.bind_tools(tools)

def chatbot(state: State):
    return {"messages": [llm_with_tools.invoke(state["messages"])]}

def route(state: State):
    last = state["messages"][-1]
    if last.tool_calls:
        return "tools"
    return END

graph = StateGraph(State)
graph.add_node("chatbot", chatbot)
graph.add_node("tools", tool_node)
graph.add_edge(START, "chatbot")
graph.add_conditional_edges("chatbot", route)
graph.add_edge("tools", "chatbot")

app = graph.compile()
```

## 注意事项

- **MessageGraph 已废弃**：1.0 起移除，使用 `StateGraph(MessagesState)` 替代
- **节点返回值是增量**：返回 `{"messages": [new_msg]}` 而不是完整 messages 列表；reducer 负责合并
- **图编译后不可变**：不能对 `CompiledStateGraph` 再 add_node / add_edge
- **Pregel 超步模型**：同一超步内所有可运行节点**并行执行**，状态更新在超步结束时**原子应用**
- **START / END 是特殊常量**：`from langgraph.graph import START, END`，不要用字符串 `"START"` / `"END"`
- **recursion_limit**：每经过一个节点计数 +1，超限抛 `GraphRecursionError`；复杂图适当调大
- **可无 LangChain**：节点函数可以调用任意 Python 代码，不强制使用 LangChain LLM

## 组合提示

| 场景 | 搭配 Skill |
|------|-----------|
| 状态设计 | `langgraph-state` |
| 流式输出 | `langgraph-streaming` |
| 持久化 / 检查点 | `langgraph-persistence` |
| 预置工具节点 / ReAct | `langgraph-prebuilt` |
| 子图嵌套 | `langgraph-subgraph` |
| Human-in-the-loop | `langgraph-hitl` |
