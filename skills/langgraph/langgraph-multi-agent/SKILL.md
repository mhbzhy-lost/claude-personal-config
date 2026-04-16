---
name: langgraph-multi-agent
description: "LangGraph 多 Agent 架构：Supervisor 中心调度、Swarm 去中心化交接、Send 并行扇出"
tech_stack: [langgraph]
---

# Multi-Agent（多 Agent 架构）

> 版本：langgraph 1.1.x / langgraph-supervisor / langgraph-swarm | 来源：https://github.com/langchain-ai/langgraph-supervisor-py, https://github.com/langchain-ai/langgraph-swarm-py

## 用途

将复杂任务拆分给多个专业化 agent 协作完成。LangGraph 提供三种主要模式：Supervisor（中心调度）、Swarm（去中心化交接）、Map-Reduce（并行扇出）。

## 何时使用

- 单一 agent 无法胜任所有子任务（如同时需要搜索、编码、写作能力）
- 需要动态路由到不同专业 agent
- 需要对同一任务进行并行处理（如批量摘要）

## 1. Supervisor 模式 — 中心 Agent 分配任务

```bash
pip install langgraph-supervisor
```

```python
from langgraph_supervisor import create_supervisor
from langgraph.prebuilt import create_react_agent
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o")

# 定义子 agent
researcher = create_react_agent(llm, [search_tool],
    prompt="You are a researcher. Find accurate information.")
writer = create_react_agent(llm, [write_tool],
    prompt="You are a writer. Create well-structured content.")

# 创建 supervisor
supervisor = create_supervisor(
    agents=[researcher, writer],
    model=llm,
    prompt="You coordinate research and writing tasks. "
           "Delegate to researcher for information gathering, "
           "to writer for content creation."
)
app = supervisor.compile()

result = app.invoke({
    "messages": [("user", "Write a report on AI trends in 2025")]
})
```

## 2. Swarm 模式 — Agent 间直接交接

```bash
pip install langgraph-swarm
```

```python
from langgraph_swarm import create_swarm, create_handoff_tool

# 创建交接工具
handoff_to_writer = create_handoff_tool(
    agent_name="writer",
    description="Hand off to writer when content needs to be written"
)
handoff_to_researcher = create_handoff_tool(
    agent_name="researcher",
    description="Hand off to researcher when information needs to be found"
)

researcher = create_react_agent(
    llm, [search_tool, handoff_to_writer],
    prompt="You are a researcher."
)
writer = create_react_agent(
    llm, [write_tool, handoff_to_researcher],
    prompt="You are a writer."
)

swarm = create_swarm(
    agents=[researcher, writer],
    default_active_agent="researcher"
)
app = swarm.compile()
```

## 3. Supervisor vs Swarm

| 维度 | Supervisor | Swarm |
|------|-----------|-------|
| 控制方式 | 中心化，supervisor 决定路由 | 去中心化，agent 自行交接 |
| Token 消耗 | 较高（supervisor 每步参与） | 较低（仅活跃 agent 消耗） |
| 灵活性 | 较低，依赖 supervisor 判断 | 较高，agent 自主决策 |
| 可预测性 | 较高 | 较低 |
| 适用场景 | 任务分配明确，需要统一管控 | 动态协作，agent 专业性强 |

## 4. Map-Reduce — Send 并行扇出

```python
import operator
from typing import Annotated, TypedDict
from langgraph.types import Send
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    topics: list[str]
    summaries: Annotated[list[str], operator.add]

def fan_out(state: State):
    """为每个 topic 创建一个并行 Send"""
    return [Send("summarize", {"topic": t}) for t in state["topics"]]

def summarize(state: dict):
    topic = state["topic"]
    summary = llm.invoke(f"Summarize {topic} in one sentence")
    return {"summaries": [summary.content]}

graph = StateGraph(State)
graph.add_node("summarize", summarize)
graph.add_conditional_edges(START, fan_out)
graph.add_edge("summarize", END)
app = graph.compile()

result = app.invoke({"topics": ["AI", "ML", "NLP"]})
# result["summaries"] 包含 3 个并行生成的摘要
```

### Send 要点

- 每个 `Send` 实例创建该节点的一个独立副本，携带独立状态
- 所有 Send 并行执行
- 结果通过 reducer（如 `operator.add`）合并回父状态
- Send 的 state 参数不需要匹配图的 State schema — 它是该节点实例的局部输入

## 5. 手动 Supervisor（不依赖库）

```python
from langgraph.graph import StateGraph, START, END, MessagesState

def supervisor(state: MessagesState):
    response = llm.invoke([
        {"role": "system", "content": "Route to: researcher or writer. Reply with just the name."},
        *state["messages"]
    ])
    return {"next_agent": response.content.strip()}

def route_to_agent(state):
    return state.get("next_agent", END)

class State(MessagesState):
    next_agent: str

graph = StateGraph(State)
graph.add_node("supervisor", supervisor)
graph.add_node("researcher", researcher_fn)
graph.add_node("writer", writer_fn)
graph.add_edge(START, "supervisor")
graph.add_conditional_edges("supervisor", route_to_agent)
graph.add_edge("researcher", "supervisor")  # 完成后回到 supervisor
graph.add_edge("writer", "supervisor")
app = graph.compile()
```

## 6. Command 路由 — 节点内直接指定下一跳

```python
from langgraph.types import Command

def agent_a(state):
    result = do_work(state)
    if needs_review(result):
        return Command(update={"result": result}, goto="reviewer")
    return Command(update={"result": result}, goto=END)

graph.add_node("agent_a", agent_a)
graph.add_node("reviewer", reviewer_fn)
# 无需 add_conditional_edges — Command.goto 直接路由
```

## 7. 子 Agent 持久化

```python
# 子 agent 需要多轮记忆时
sub_agent = sub_graph.compile(checkpointer=True)  # 继承父图的 checkpointer

# 子 agent 不需要记忆时（默认）
sub_agent = sub_graph.compile()  # checkpointer=None
```

## 注意事项

- `langgraph-supervisor` 和 `langgraph-swarm` 是独立包，需单独 pip install
- Supervisor 模式中 agent name 很重要，supervisor 根据名字路由
- 生产环境为每个子 agent 设置 `recursion_limit` 防止无限循环
- Send 的并行度取决于运行时，不保证完全同时执行
- Command 的 `goto` 字段支持单个节点名或节点名列表（多路扇出）
- 使用 Command 路由时，不需要为该节点添加 `add_edge` 或 `add_conditional_edges`

## 组合提示

| 场景 | 参考 Skill |
|------|-----------|
| 子图嵌套 | `langgraph-subgraph` |
| 快速创建子 agent | `langgraph-prebuilt` |
| 流式输出（子图） | `langgraph-streaming` |
| 人机协作审批 | `langgraph-hitl` |
