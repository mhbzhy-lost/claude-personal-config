---
name: langgraph-streaming
description: "LangGraph 7 种流式模式（values/updates/messages/custom/checkpoints/tasks/debug）、v2 格式、自定义流、子图流式。"
tech_stack: [langgraph]
language: [python]
---

# LangGraph Streaming（流式输出）

> 版本：langgraph 1.1.x (Python) | 来源：https://docs.langchain.com/oss/python/langgraph/streaming

## 用途

通过 `stream()` / `astream()` 方法实时获取图执行过程中的状态变化、LLM token、自定义事件等，用于构建响应式 UI。

## 何时使用

- 需要在聊天界面逐 token 显示 LLM 输出
- 需要展示 agent 多步推理的中间状态
- 需要自定义进度上报（进度条、日志）
- 需要调试图的执行过程

## 7 种 stream_mode

| 模式 | 说明 | 典型用途 |
|------|------|---------|
| `"values"` | 每个节点执行后输出**完整状态快照** | 调试、状态追踪 |
| `"updates"` | 仅输出每个节点的**变更字段** | 增量 UI 更新 |
| `"messages"` | LLM **token 级**流式 + 元数据 | 聊天界面逐字显示 |
| `"custom"` | 节点内用 `get_stream_writer()` **主动发送** | 进度条、日志、自定义事件 |
| `"checkpoints"` | checkpoint 保存事件（需 checkpointer） | 持久化状态监控 |
| `"tasks"` | 任务开始/完成及结果/错误 | 任务执行追踪 |
| `"debug"` | checkpoints + tasks + 完整元数据 | 全面调试 |

## 基础用法

### values 模式（默认）

```python
for state_snapshot in app.stream(inputs, stream_mode="values"):
    # state_snapshot 是每个节点执行后的完整状态
    print(state_snapshot["messages"][-1])
```

### updates 模式

```python
for chunk in app.stream(inputs, stream_mode="updates"):
    # chunk 格式: {"node_name": {"field": new_value, ...}}
    for node_name, updates in chunk.items():
        print(f"{node_name}: {updates}")
```

### messages 模式（逐 token）

```python
for msg, metadata in app.stream(inputs, stream_mode="messages"):
    # msg: AIMessageChunk（含 .content token 片段）
    # metadata: {"langgraph_node": "chatbot", ...}
    if metadata["langgraph_node"] == "chatbot":
        print(msg.content, end="", flush=True)
```

> `stream_mode="messages"` 要求节点内使用 **LangChain 兼容的 LLM**（实现了 chat model 接口）。

## 多模式组合

传入列表同时接收多种流数据：

```python
for event in app.stream(inputs, stream_mode=["updates", "messages"]):
    # event 是 tuple: (stream_mode_name, data)
    mode, data = event
    if mode == "messages":
        msg, metadata = data
        print(msg.content, end="", flush=True)
    elif mode == "updates":
        print(f"State update: {data}")
```

## v2 格式（推荐生产使用）

使用 `version="v2"` 获得**统一结构**的 `StreamPart`：

```python
for event in app.stream(inputs, stream_mode="updates", version="v2"):
    print(event.type)  # "updates" | "messages" | "custom" | ...
    print(event.ns)    # namespace 元组，如 () 或 ("subgraph_name",)
    print(event.data)  # 实际数据
```

多模式 + v2：

```python
for event in app.stream(
    inputs,
    stream_mode=["updates", "messages", "custom"],
    version="v2",
):
    if event.type == "messages":
        # event.data 是 (msg_chunk, metadata) tuple
        msg, meta = event.data
        print(msg.content, end="", flush=True)
    elif event.type == "custom":
        print(f"Custom: {event.data}")
    elif event.type == "updates":
        print(f"Update: {event.data}")
```

> v2 格式统一了所有 stream_mode 的输出结构，推荐在生产环境使用。

## 自定义流 -- get_stream_writer()

在节点内主动发射自定义数据：

```python
from langgraph.config import get_stream_writer

def my_node(state):
    writer = get_stream_writer()
    writer({"progress": 0.0, "status": "starting"})

    # ... 耗时操作 ...
    writer({"progress": 0.5, "status": "processing"})

    # ... 更多操作 ...
    writer({"progress": 1.0, "status": "done"})

    return {"result": "completed"}
```

消费端：

```python
for chunk in app.stream(inputs, stream_mode="custom"):
    print(chunk)
    # {"progress": 0.0, "status": "starting"}
    # {"progress": 0.5, "status": "processing"}
    # {"progress": 1.0, "status": "done"}
```

混合消费（自定义 + 状态更新）：

```python
for event in app.stream(inputs, stream_mode=["custom", "updates"], version="v2"):
    if event.type == "custom":
        update_progress_bar(event.data)
    elif event.type == "updates":
        update_state_display(event.data)
```

## 异步流

```python
async for chunk in app.astream(inputs, stream_mode="updates"):
    print(chunk)

# 异步 + v2
async for event in app.astream(inputs, stream_mode="updates", version="v2"):
    print(event.type, event.data)
```

## 子图流式

使用 `subgraphs=True` 接收子图内部的流事件：

```python
for ns, chunk in app.stream(inputs, stream_mode="updates", subgraphs=True):
    # ns: namespace 元组，() 表示顶层图，("sub",) 表示名为 "sub" 的子图
    if ns:
        print(f"Subgraph {ns}: {chunk}")
    else:
        print(f"Main graph: {chunk}")
```

v2 格式下子图信息在 `event.ns` 中：

```python
for event in app.stream(
    inputs, stream_mode="updates", version="v2", subgraphs=True
):
    if event.ns:
        print(f"[{'/'.join(event.ns)}] {event.data}")
    else:
        print(f"[root] {event.data}")
```

## 完整实战：聊天机器人流式输出

```python
from typing import Annotated, TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langchain_openai import ChatOpenAI

class State(TypedDict):
    messages: Annotated[list, add_messages]

llm = ChatOpenAI(model="gpt-4o", streaming=True)

def chatbot(state: State):
    return {"messages": [llm.invoke(state["messages"])]}

graph = StateGraph(State)
graph.add_node("chatbot", chatbot)
graph.add_edge(START, "chatbot")
graph.add_edge("chatbot", END)
app = graph.compile()

# 逐 token 输出
for msg, metadata in app.stream(
    {"messages": [("user", "explain quantum computing")]},
    stream_mode="messages",
):
    if metadata["langgraph_node"] == "chatbot":
        print(msg.content, end="", flush=True)
print()  # 换行
```

## 注意事项

1. **messages 模式依赖 LangChain LLM**：节点必须使用实现了 LangChain chat model 接口的 LLM，原生 API 调用不会产生 messages 流事件
2. **get_stream_writer 的异步限制**：在异步节点中可能需要将 `writer` 作为参数传递而非通过 `get_stream_writer()` 获取，Python >= 3.11 推荐以避免 ContextVar 传播问题
3. **v2 是推荐格式**：提供统一的 `StreamPart(type, ns, data)` 结构，避免不同模式输出格式不一致的问题
4. **subgraphs=True 增加输出量**：按需使用，仅在需要监控子图内部行为时开启
5. **stream_mode 默认值**：`stream()` 默认为 `"values"`，每步输出完整状态
6. **空状态更新不产生事件**：如果节点返回空 dict `{}`，updates 模式下不会收到该节点的事件

## 组合提示

| 场景 | 搭配 Skill |
|------|-----------|
| 图构建 | `langgraph-core` |
| 状态设计 | `langgraph-state` |
| 持久化检查点 | `langgraph-persistence` |
| 子图流式 | `langgraph-subgraph` |
