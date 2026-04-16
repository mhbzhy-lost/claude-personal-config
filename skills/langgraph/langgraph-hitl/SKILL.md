---
name: langgraph-hitl
description: "LangGraph 人机协作：interrupt() 动态中断、Command(resume) 恢复执行、静态断点、多步审批流程。"
tech_stack: [langgraph, backend]
language: [python]
---

# LangGraph 人机协作

> 版本：langgraph 1.1.x | 来源：https://langchain-ai.github.io/langgraph/concepts/human_in_the_loop/

## 用途

在图执行过程中插入人类决策点，实现审批、确认、修正等人机交互流程，确保关键操作在人类监督下执行。

## 何时使用

- 敏感操作需要人类审批（删除数据、发送邮件、执行交易）
- 需要人类提供额外输入或修正 AI 输出
- 多步审批/签名流程
- 调试时需要在特定节点暂停检查状态

## 两种方式

| 方式 | 语法 | 适用场景 |
|------|------|----------|
| 动态 `interrupt()` | 节点内调用 `interrupt(value)` | **生产推荐**，灵活控制 |
| 静态断点 | `compile(interrupt_before=[...])` | 调试、简单场景 |

## interrupt() 基础用法

```python
from langgraph.types import interrupt, Command

def human_review(state):
    # 发送待审批内容，暂停等待人类响应
    decision = interrupt({
        "question": "Approve this action?",
        "proposed_action": state["action"]
    })
    # decision 是人类通过 Command(resume=...) 传入的值
    if decision == "approve":
        return {"status": "approved"}
    return {"status": "rejected"}
```

## 恢复执行 -- Command(resume=...)

```python
config = {"configurable": {"thread_id": "review-thread"}}

# 第一次调用：触发 interrupt，图暂停
app.invoke({"action": "delete_records"}, config)

# 查看暂停状态
state = app.get_state(config)
print(state.next)  # ('human_review',) -- 等待恢复的节点

# 恢复执行：传入人类决策
result = app.invoke(Command(resume="approve"), config)
```

## 多步审批 -- 单节点内多次 interrupt

```python
def multi_step_review(state):
    # 第一步：审批
    approval = interrupt({"step": "approval", "data": state["proposal"]})
    if approval != "approve":
        return {"status": "rejected"}

    # 第二步：签名
    signature = interrupt({"step": "signature", "message": "Please sign"})
    return {"status": "approved", "signature": signature}
```

恢复流程：

```python
config = {"configurable": {"thread_id": "multi-step"}}

# 触发第一个 interrupt
app.invoke({"proposal": "budget plan"}, config)

# 恢复第一步
app.invoke(Command(resume="approve"), config)
# 此时触发第二个 interrupt

# 恢复第二步
result = app.invoke(Command(resume="Alice Smith"), config)
# result["status"] == "approved", result["signature"] == "Alice Smith"
```

**关键约束**：多次 interrupt 必须在每次执行中以相同顺序出现，不能有条件分支改变 interrupt 的执行顺序。

## 静态断点

```python
app = graph.compile(
    checkpointer=checkpointer,
    interrupt_before=["dangerous_action"]
)

config = {"configurable": {"thread_id": "t1"}}
app.invoke(inputs, config)  # 在 dangerous_action 前暂停

# 审查状态后继续
app.invoke(None, config)  # 传 None 从断点继续
```

也支持 `interrupt_after`：

```python
app = graph.compile(
    checkpointer=checkpointer,
    interrupt_after=["generate_response"]  # 在节点执行后暂停
)
```

## Command 的其他用法

`Command` 除了 `resume` 外，还可以组合状态更新和路由：

```python
# 恢复 + 更新状态
Command(resume="approve", update={"reviewer": "alice"})

# 恢复 + 路由到指定节点
Command(resume="approve", goto="execute")

# 恢复 + 更新 + 路由
Command(resume="approve", update={"reviewer": "alice"}, goto="execute")
```

`Command` 也可在节点内作为返回值使用，用于同时更新状态和控制路由：

```python
def my_node(state):
    # 同时更新状态并指定下一节点
    return Command(update={"key": "value"}, goto="next_node")
```

## 完整示例

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import interrupt, Command

class State(TypedDict):
    request: str
    status: str

def process_request(state):
    return {"request": state["request"]}

def human_approval(state):
    decision = interrupt({
        "message": f"Approve request: {state['request']}?",
        "options": ["approve", "reject"]
    })
    return {"status": decision}

def execute(state):
    if state["status"] == "approve":
        return {"status": "executed"}
    return {"status": "cancelled"}

builder = StateGraph(State)
builder.add_node("process", process_request)
builder.add_node("approval", human_approval)
builder.add_node("execute", execute)
builder.add_edge(START, "process")
builder.add_edge("process", "approval")
builder.add_edge("approval", "execute")
builder.add_edge("execute", END)

checkpointer = InMemorySaver()
app = builder.compile(checkpointer=checkpointer)

config = {"configurable": {"thread_id": "demo"}}

# 触发中断
app.invoke({"request": "deploy v2.0"}, config)

# 人类审批后恢复
result = app.invoke(Command(resume="approve"), config)
print(result["status"])  # "executed"
```

## 关键 API

| API | 说明 |
|-----|------|
| `interrupt(value)` | 暂停图执行，向外部发送 value |
| `Command(resume=value)` | 恢复执行，将 value 传给 interrupt 的返回值 |
| `Command(update=dict)` | 更新状态 |
| `Command(goto=node)` | 路由到指定节点 |
| `compile(interrupt_before=[...])` | 静态断点：在指定节点前暂停 |
| `compile(interrupt_after=[...])` | 静态断点：在指定节点后暂停 |
| `app.get_state(config).next` | 查看当前等待恢复的节点 |

## 注意事项

- `interrupt()` 内部使用异常机制，**绝不能**包在裸 `try/except` 中（会被意外捕获）
- `interrupt()` 只接受 JSON 可序列化的值
- `interrupt()` 前的副作用在恢复时会重新执行 -- 确保使用幂等操作
- 必须配合 checkpointer 使用，否则无法恢复暂停的状态
- 多个 interrupt 必须在每次执行中以完全相同的顺序出现
- 静态断点中恢复时传 `None`（`app.invoke(None, config)`），动态 interrupt 恢复时传 `Command(resume=...)`

## 组合提示

- 与 **langgraph-persistence** 搭配：interrupt 强依赖 checkpointer
- 与 **langgraph-streaming** 搭配：暂停状态下可通过流式接口监听等待事件
- 与 **langgraph-subgraph** 搭配：子图内也可使用 interrupt，但需父图传递 checkpointer
