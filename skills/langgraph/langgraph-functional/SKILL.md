---
name: langgraph-functional
description: "LangGraph 函数式 API：@entrypoint、@task 装饰器与 entrypoint.final 用法"
tech_stack: [langgraph, backend]
language: [python]
capability: [agent-orchestration]
---

# Functional API（函数式 API）

> 版本：langgraph 1.1.x (Python) | 来源：https://docs.langchain.com/oss/python/langgraph/use-functional-api

## 用途

函数式 API 是 LangGraph 1.0 引入的替代编程模型，用 Python 装饰器代替显式图构建，适合线性或简单分支的工作流。

## 何时使用

- 工作流主体是顺序执行，不需要复杂的条件路由或循环
- 希望用普通 Python 控制流（if/while/for）代替图的条件边
- 快速原型，不需要图的可视化能力

## 1. 核心导入

```python
from langgraph.func import entrypoint, task
from langgraph.types import interrupt, RetryPolicy, CachePolicy
```

## 2. @task — 工作单元

定义一个可重试、可缓存的独立计算单元。调用后返回 **Future**，需 `.result()` 取值。

```python
from langgraph.func import task
from langgraph.types import RetryPolicy

@task
def fetch_data(url: str) -> dict:
    import requests
    return requests.get(url).json()

@task(retry_policy=RetryPolicy(max_attempts=3))
def call_llm(prompt: str) -> str:
    return llm.invoke(prompt).content
```

## 3. @entrypoint — 工作流入口

等价于 `StateGraph.compile()`，将函数包装为可执行的 Runnable（具有 `.invoke()` / `.stream()` 等方法）。

```python
from langgraph.func import entrypoint, task
from langgraph.checkpoint.memory import InMemorySaver

@task
def analyze(text: str) -> str:
    return f"analysis of: {text}"

@task
def summarize(analysis: str) -> str:
    return f"summary: {analysis}"

@entrypoint(checkpointer=InMemorySaver())
def workflow(inputs: dict) -> str:
    data = inputs["data"]
    result = analyze(data).result()       # .result() 解析 Future
    summary = summarize(result).result()
    return summary

# 调用（与 CompiledStateGraph 相同的接口）
result = workflow.invoke({"data": "hello world"})
```

## 4. entrypoint.final — 分离返回值与持久化值

```python
@entrypoint(checkpointer=saver)
def counter_workflow(inputs: dict, *, previous=None):
    # previous: 上次 checkpoint 保存的值（首次为 None）
    count = (previous or 0) + 1
    result = process(inputs).result()
    # value → 返回给调用者；save → 写入 checkpoint
    return entrypoint.final(value=result, save=count)

# 第一次调用
config = {"configurable": {"thread_id": "t1"}}
workflow.invoke({"data": "a"}, config)  # previous=None, count=1
# 第二次调用
workflow.invoke({"data": "b"}, config)  # previous=1, count=2
```

## 5. 并行执行

先创建 Future（不阻塞），再一起解析：

```python
@entrypoint(checkpointer=saver)
def parallel_workflow(inputs: dict):
    # 并行启动
    future_a = task_a(inputs["a"])
    future_b = task_b(inputs["b"])
    future_c = task_c(inputs["c"])
    # 同时等待结果
    return {
        "a": future_a.result(),
        "b": future_b.result(),
        "c": future_c.result(),
    }
```

## 6. 使用 interrupt 实现人机协作

```python
from langgraph.types import interrupt, Command

@entrypoint(checkpointer=saver)
def review_workflow(inputs: dict):
    draft = generate_draft(inputs).result()
    # 暂停，等待人类审批
    decision = interrupt({"draft": draft, "question": "Approve?"})
    if decision == "approve":
        return publish(draft).result()
    return "rejected"

# 触发
config = {"configurable": {"thread_id": "review-1"}}
review_workflow.invoke({"topic": "AI"}, config)  # 暂停在 interrupt

# 恢复
review_workflow.invoke(Command(resume="approve"), config)
```

## 7. 自定义流式输出

```python
from langgraph.config import get_stream_writer

@task
def slow_task(data: str) -> str:
    writer = get_stream_writer()
    for i in range(5):
        writer({"progress": i / 4})
        # ... 处理 ...
    return "done"

@entrypoint(checkpointer=saver)
def streaming_workflow(inputs: dict):
    return slow_task(inputs["data"]).result()

# 消费自定义流
for chunk in streaming_workflow.stream(inputs, stream_mode="custom"):
    print(chunk)  # {"progress": 0.0}, {"progress": 0.25}, ...
```

## 8. Graph API vs Functional API

| 维度 | Graph API (`StateGraph`) | Functional API (`@entrypoint`/`@task`) |
|------|-------------------------|---------------------------------------|
| 复杂分支/循环 | 原生支持 | 用 Python if/while 代替 |
| 状态管理 | 显式 Schema + Reducer | 隐式（函数参数 + 返回值） |
| 并行执行 | 图结构自动推导 | Future 手动控制 |
| 可视化 | `get_graph().draw_mermaid()` | 不支持 |
| 学习曲线 | 较高 | 较低 |
| 子图嵌套 | `add_node(compiled_subgraph)` | 嵌套 `@entrypoint` 调用 |

## 注意事项

- `@task` 返回的是 **Future**，忘记调用 `.result()` 是最常见错误
- `@entrypoint` 函数自动成为 Runnable，有 `.invoke()` / `.stream()` / `.ainvoke()` / `.astream()`
- 函数式 API **仅 Python** 支持，JS/TS 无对应实现
- 不支持图可视化（无法生成 Mermaid 图）
- `previous` 参数名是约定，必须用 keyword-only 参数（`*` 后）

## 组合提示

| 场景 | 参考 Skill |
|------|-----------|
| 需要复杂路由/循环 | `langgraph-core`（Graph API） |
| 持久化配置 | `langgraph-persistence` |
| 人机协作 | `langgraph-hitl` |
| 重试与缓存策略 | `langgraph-patterns` |
