---
name: langgraph-subgraph
description: "LangGraph 子图：嵌套图组合、共享/独立状态模式、状态转换、checkpointer 继承、子图流式传输与状态访问。"
tech_stack: [langgraph]
---

# LangGraph 子图

> 版本：langgraph 1.1.x | 来源：https://langchain-ai.github.io/langgraph/how-tos/subgraph/

## 用途

将复杂图拆分为可复用的子图模块，支持独立开发测试、状态隔离和嵌套组合，实现大型 agent 系统的模块化架构。

## 何时使用

- 图逻辑过于复杂，需要拆分为独立模块
- 需要在多个父图中复用同一子流程
- 子流程有独立的状态定义，需要状态转换
- 子 agent 需要独立的多轮对话记忆
- 团队协作中不同成员负责不同子图

## 两种模式

| 模式 | 条件 | 挂载方式 |
|------|------|----------|
| 共享状态 | 父子图使用相同 State Schema | 直接挂载编译后的子图 |
| 不同状态 | 父子图 State 不同 | 用函数包装，手动转换状态 |

## 共享状态子图

父子图使用完全相同的 State 类型，直接将编译后的子图作为节点添加。

```python
from langgraph.graph import StateGraph, START, END
from typing import TypedDict, Annotated
from operator import add

class State(TypedDict):
    messages: Annotated[list, add]
    result: str

# 子图 -- 与父图共享相同 State
sub_builder = StateGraph(State)
sub_builder.add_node("sub_step1", step1_fn)
sub_builder.add_node("sub_step2", step2_fn)
sub_builder.add_edge(START, "sub_step1")
sub_builder.add_edge("sub_step1", "sub_step2")
sub_builder.add_edge("sub_step2", END)
sub_graph = sub_builder.compile()

# 父图
parent_builder = StateGraph(State)
parent_builder.add_node("pre_process", pre_fn)
parent_builder.add_node("sub", sub_graph)  # 直接挂载编译后的子图
parent_builder.add_node("post_process", post_fn)
parent_builder.add_edge(START, "pre_process")
parent_builder.add_edge("pre_process", "sub")
parent_builder.add_edge("sub", "post_process")
parent_builder.add_edge("post_process", END)
app = parent_builder.compile()
```

## 不同状态子图 -- 函数包装

父子图 State 不同时，用普通函数包装子图调用，在函数内完成状态转换。

```python
class ParentState(TypedDict):
    input: str
    result: str

class SubState(TypedDict):
    sub_input: str
    sub_output: str

# 构建子图（使用 SubState）
sub_builder = StateGraph(SubState)
sub_builder.add_node("analyze", analyze_fn)
sub_builder.add_node("summarize", summarize_fn)
sub_builder.add_edge(START, "analyze")
sub_builder.add_edge("analyze", "summarize")
sub_builder.add_edge("summarize", END)
sub_graph = sub_builder.compile()

# 用函数包装，处理状态转换
def call_sub(state: ParentState):
    # 转换状态: Parent -> Sub
    sub_result = sub_graph.invoke({"sub_input": state["input"]})
    # 转换状态: Sub -> Parent
    return {"result": sub_result["sub_output"]}

parent_builder = StateGraph(ParentState)
parent_builder.add_node("sub", call_sub)  # 用函数包装
parent_builder.add_edge(START, "sub")
parent_builder.add_edge("sub", END)
app = parent_builder.compile()
```

## 子图 Checkpointer 模式

| 设置 | 行为 | 用途 |
|------|------|------|
| `checkpointer=None`（默认） | 每次调用从头开始 | 无状态子任务 |
| `checkpointer=True` | 继承父图的 checkpointer | 子 agent 需要多轮记忆 |
| `checkpointer=False` | 显式无状态 | 强制无状态 |

```python
# 子 agent 有自己的持久化（继承父图 checkpointer）
sub_graph = sub_builder.compile(checkpointer=True)

# 父图挂载后，子图自动使用父图的 checkpointer
parent_builder.add_node("sub_agent", sub_graph)
app = parent_builder.compile(checkpointer=InMemorySaver())
```

## 子图流式传输

使用 `subgraphs=True` 参数可同时接收父图和子图的流式事件。

```python
for ns, chunk in app.stream(inputs, config, stream_mode="updates", subgraphs=True):
    # ns 是命名空间元组
    # () 表示父图
    # ("sub",) 表示名为 "sub" 的子图
    # ("sub", "nested",) 表示嵌套子图
    if ns:
        print(f"子图 {ns}: {chunk}")
    else:
        print(f"父图: {chunk}")
```

异步版：

```python
async for ns, chunk in app.astream(inputs, config, stream_mode="updates", subgraphs=True):
    if ns:
        print(f"子图 {ns}: {chunk}")
    else:
        print(f"父图: {chunk}")
```

## 子图状态访问

```python
# 获取子图当前状态（需要 subgraphs=True）
state = app.get_state(config, subgraphs=True)

# state.tasks 包含子图的 StateSnapshot
for task in state.tasks:
    if hasattr(task, 'state'):
        print(f"子图状态: {task.state.values}")
```

## 完整示例 -- 不同状态的研究助手子图

```python
from typing import TypedDict, Annotated
from operator import add
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver

# 子图状态
class ResearchState(TypedDict):
    topic: str
    findings: Annotated[list[str], add]

def search(state: ResearchState):
    return {"findings": [f"Found info about {state['topic']}"]}

def compile_findings(state: ResearchState):
    return {"findings": [f"Summary: {len(state['findings'])} sources"]}

# 构建子图
research_builder = StateGraph(ResearchState)
research_builder.add_node("search", search)
research_builder.add_node("compile", compile_findings)
research_builder.add_edge(START, "search")
research_builder.add_edge("search", "compile")
research_builder.add_edge("compile", END)
research_graph = research_builder.compile()

# 父图状态
class MainState(TypedDict):
    query: str
    answer: str

def call_research(state: MainState):
    result = research_graph.invoke({"topic": state["query"]})
    return {"answer": "; ".join(result["findings"])}

def generate_response(state: MainState):
    return {"answer": f"Based on research: {state['answer']}"}

# 构建父图
main_builder = StateGraph(MainState)
main_builder.add_node("research", call_research)
main_builder.add_node("respond", generate_response)
main_builder.add_edge(START, "research")
main_builder.add_edge("research", "respond")
main_builder.add_edge("respond", END)

app = main_builder.compile(checkpointer=InMemorySaver())

config = {"configurable": {"thread_id": "research-1"}}
result = app.invoke({"query": "quantum computing"}, config)
print(result["answer"])
```

## 关键 API

| API | 说明 |
|-----|------|
| `builder.add_node("name", compiled_graph)` | 挂载共享状态子图 |
| `builder.add_node("name", wrapper_fn)` | 挂载函数包装的子图 |
| `sub_builder.compile(checkpointer=True)` | 子图继承父图 checkpointer |
| `app.stream(..., subgraphs=True)` | 流式接收子图事件 |
| `app.get_state(config, subgraphs=True)` | 获取包含子图的状态 |

## 注意事项

- 大多数场景使用 `checkpointer=None`（默认），子图不需要跨调用记忆
- 仅当子 agent 需要多轮对话记忆时使用 `checkpointer=True`
- 不同状态的子图用函数包装是最灵活的方式，推荐作为默认选择
- 子图增加了架构复杂度，简单场景直接在节点函数中调用其他 graph 即可
- 共享状态模式下，子图的输出会直接合并到父图状态，注意 Annotated reducer 的行为
- 嵌套子图的命名空间会叠加，如 `("parent_sub", "child_sub")`

## 组合提示

- 与 **langgraph-persistence** 搭配：`checkpointer=True` 让子图继承持久化
- 与 **langgraph-hitl** 搭配：子图内可使用 `interrupt()`，需确保父图有 checkpointer
- 与 **langgraph-streaming** 搭配：`subgraphs=True` 实现全链路流式输出
- 与 **langgraph-multi-agent** 搭配：每个 agent 可作为独立子图组合
