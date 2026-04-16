---
name: langgraph-state
description: "LangGraph 状态设计：TypedDict/Pydantic 定义、Annotated reducer 机制、add_messages、MessagesState、多 Schema 模式。"
tech_stack: [langgraph]
language: [python]
---

# LangGraph State（状态设计与 Reducer）

> 版本：langgraph 1.1.x (Python) | 来源：https://docs.langchain.com/oss/python/langgraph/graph-api

## 用途

定义图的共享状态结构，并通过 reducer 函数控制节点输出如何合并到全局状态。状态设计直接决定了图的数据流和节点间通信方式。

## 何时使用

- 新建 StateGraph 前需要设计状态 Schema
- 需要列表追加而非覆盖（消息列表、日志列表等）
- 需要区分图的输入/输出/内部字段
- 需要消息去重、删除等高级消息管理

## 状态定义 -- 三种方式

### TypedDict（推荐）

```python
from typing import Annotated, TypedDict
from langgraph.graph.message import add_messages

class State(TypedDict):
    messages: Annotated[list, add_messages]
    context: str                               # 默认 reducer：覆盖
    count: Annotated[int, lambda a, b: a + b]  # 自定义 reducer：累加
```

### dataclass

```python
from dataclasses import dataclass, field

@dataclass
class State:
    messages: Annotated[list, add_messages] = field(default_factory=list)
    context: str = ""
```

### Pydantic BaseModel

```python
from pydantic import BaseModel

class State(BaseModel):
    messages: Annotated[list, add_messages] = []
    context: str = ""
```

> Pydantic 模型可提供**运行时类型验证**，但有性能开销；TypedDict 最轻量，生产环境推荐。

## Reducer 机制

### 默认行为：覆盖

未标注 `Annotated` 的字段，节点返回的新值**直接替换**旧值：

```python
class State(TypedDict):
    answer: str   # 后写入的值覆盖前值
```

### 自定义 reducer

使用 `Annotated[type, reducer_fn]`，reducer 签名：

```python
def reducer(existing_value, new_value) -> merged_value
```

当节点返回该字段时，LangGraph 调用 `reducer(current, update)` 得到新值。

### 常见 reducer

```python
import operator
from langgraph.graph.message import add_messages

class State(TypedDict):
    items: Annotated[list, operator.add]     # 列表追加
    messages: Annotated[list, add_messages]   # 消息列表（按 ID 去重）
    total: Annotated[int, lambda a, b: a + b] # 数值累加
```

## 内置 reducer 详解

### operator.add

```python
items: Annotated[list, operator.add]
```

- 简单列表拼接：`existing + new`
- **无去重能力**，适合日志、事件流等只追加场景

### add_messages（消息专用，强烈推荐）

```python
from langgraph.graph.message import add_messages

messages: Annotated[list, add_messages]
```

核心行为：
1. **追加**：新消息追加到列表末尾
2. **按 ID 去重**：相同 `id` 的新消息**替换**旧消息（而非重复追加）
3. **删除**：支持 `RemoveMessage(id=msg_id)` 删除指定消息
4. **tuple 语法**：`("user", "hello")` 自动转为 `HumanMessage`

```python
from langchain_core.messages import RemoveMessage

def summarize(state: State):
    # 保留最近 3 条，删除其余
    to_remove = [RemoveMessage(id=m.id) for m in state["messages"][:-3]]
    return {"messages": to_remove + [summary_msg]}
```

> 处理消息列表**始终用 `add_messages`**，不要用 `operator.add`（无去重和删除能力）。

## MessagesState -- 预置状态

```python
from langgraph.graph import MessagesState

# 等价于：
class MessagesState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
```

**扩展 MessagesState**：

```python
class State(MessagesState):
    context: str
    iteration: Annotated[int, lambda a, b: a + b]
```

## 自定义 reducer 示例

### 列表可清空

```python
def reduce_list(existing: list, new: list | str) -> list:
    if isinstance(new, str) and new == "CLEAR":
        return []
    return existing + new

class State(TypedDict):
    items: Annotated[list, reduce_list]

# 节点中清空：return {"items": "CLEAR"}
# 节点中追加：return {"items": ["new_item"]}
```

### 保留最新 N 条

```python
def keep_last_n(n: int):
    def reducer(existing: list, new: list) -> list:
        return (existing + new)[-n:]
    return reducer

class State(TypedDict):
    logs: Annotated[list, keep_last_n(100)]
```

### 集合去重

```python
def union_set(existing: set, new: set) -> set:
    return existing | new

class State(TypedDict):
    visited: Annotated[set, union_set]
```

## 多 Schema 模式

当图的输入/输出只需暴露部分字段时，使用多 Schema：

```python
class InputState(TypedDict):
    question: str

class OutputState(TypedDict):
    answer: str

class InternalState(TypedDict):
    question: str
    answer: str
    context: str                              # 仅内部使用
    messages: Annotated[list, add_messages]    # 仅内部使用

graph = StateGraph(InternalState, input=InputState, output=OutputState)
```

- **input Schema**：限制 `invoke()` 接受的字段
- **output Schema**：限制 `invoke()` 返回的字段
- **state_schema**（第一个参数）：节点内部可访问的完整字段集
- 三个 Schema 之间是字段子集关系，input/output 的字段必须存在于 state_schema 中

## 最佳实践

1. **所有 list 字段都应配 reducer**：否则节点返回 list 会覆盖而非追加，这几乎不是你想要的
2. **消息用 `add_messages`**：不要用 `operator.add`，后者无去重和删除能力
3. **避免在状态中存储大型二进制数据**：图状态会被序列化到 checkpointer，大对象影响性能
4. **优先 TypedDict**：除非需要运行时验证，否则不必引入 Pydantic 开销
5. **reducer 必须是纯函数**：不要在 reducer 中产生副作用或调用外部 API
6. **默认值**：TypedDict 字段没有默认值，首次 invoke 时必须提供或在首个节点中初始化；dataclass/Pydantic 可设默认值

## 组合提示

| 场景 | 搭配 Skill |
|------|-----------|
| 构建图 | `langgraph-core` |
| 消息流式输出 | `langgraph-streaming` |
| 状态持久化 | `langgraph-persistence` |
| 子图间状态传递 | `langgraph-subgraph` |
