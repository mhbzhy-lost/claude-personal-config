---
name: langgraph-patterns
description: "LangGraph 常用模式：RetryPolicy、CachePolicy、错误处理、配置、调试与递归限制。"
tech_stack: [langgraph, backend]
language: [python]
---

# LangGraph Patterns（常用模式与最佳实践）

> 版本：langgraph 1.1.x (Python) | 来源：https://docs.langchain.com/oss/python/langgraph/graph-api

## 用途

汇总 LangGraph 中高频使用的横切关注点：重试、缓存、错误处理、运行配置、调试手段，避免重复踩坑。

## 何时使用

- 节点调用外部 API 需要重试或缓存
- 需要优雅处理工具错误 / LLM 故障转移
- 需要配置递归限制、线程 ID、自定义参数
- 调试图执行流程

---

## RetryPolicy -- 节点级重试

```python
from langgraph.types import RetryPolicy

retry = RetryPolicy(
    initial_interval=0.5,  # 首次重试等待秒数
    backoff_factor=2.0,    # 退避倍数
    max_interval=128.0,    # 最大重试间隔秒数
    max_attempts=3,        # 总尝试次数（含首次）
    jitter=True,           # 随机抖动，避免惊群
    retry_on=ValueError,   # 仅对特定异常重试
)

graph.add_node("flaky_api", call_api, retry=retry)
```

### retry_on 参数

`retry_on` 决定哪些异常触发重试，支持三种形式：

```python
# 1. 单个异常类
retry_on=ValueError

# 2. 异常类元组
retry_on=(ValueError, TimeoutError, ConnectionError)

# 3. 自定义判定函数
def should_retry(exc: Exception) -> bool:
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in (429, 502, 503)
    return False

retry_on=should_retry
```

- **默认**：不传 `retry_on` 时，对所有异常重试。
- 首次调用也计入 `max_attempts`，所以 `max_attempts=3` 意味着最多重试 2 次。

---

## CachePolicy -- 节点级缓存

```python
from langgraph.types import CachePolicy
from langgraph.cache.memory import InMemoryCache

graph.add_node("expensive_call", compute, cache_policy=CachePolicy(ttl=120))

# 编译时必须提供 cache 实例
app = graph.compile(cache=InMemoryCache())
```

- **TTL** 单位为秒；超时后缓存自动失效，下次调用重新计算。
- **缓存键**基于节点输入自动生成，输入相同则命中缓存。
- **适用场景**：确定性、高开销的节点（embedding 计算、外部查询等）。
- **不适用**：有副作用或依赖外部状态变化的节点。

---

## 错误处理最佳实践

### ToolNode 错误处理

```python
from langgraph.prebuilt import ToolNode

tool_node = ToolNode(tools, handle_tool_errors=True)
# 工具异常转为 ToolMessage 返回给 LLM，不会中断图
```

开启 `handle_tool_errors=True` 后，工具抛出的异常会被捕获并转换为包含错误信息的 `ToolMessage`，LLM 可据此自行修正调用。

### LLM Fallback（降级链）

```python
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic

primary = ChatOpenAI(model="gpt-4o")
fallback = ChatAnthropic(model="claude-sonnet-4-20250514")
llm = primary.with_fallbacks([fallback])
```

`with_fallbacks` 是 LangChain Runnable 的能力，不限于 LangGraph，但在图节点中非常实用。primary 失败时自动尝试 fallback 列表中的下一个。

### RemainingSteps -- 递归限制保护

```python
from langgraph.types import RemainingSteps
from typing import Annotated, TypedDict
from langchain_core.messages import AIMessage
from langgraph.graph.message import add_messages

class State(TypedDict):
    messages: Annotated[list, add_messages]
    remaining_steps: RemainingSteps  # 自动注入剩余步数

def chatbot(state: State):
    if state["remaining_steps"] < 3:
        # 快要到递归限制了，强制结束
        return {"messages": [AIMessage(content="I need to wrap up.")]}
    return {"messages": [llm.invoke(state["messages"])]}
```

- `RemainingSteps` 是特殊类型标注，LangGraph 运行时自动填充，无需手动赋值。
- 适合在 agent 循环中做"安全降落"——在即将耗尽步数时主动返回总结而非被 `GraphRecursionError` 打断。

---

## 配置 (Config)

```python
config = {
    "recursion_limit": 50,       # 顶级键，默认 25
    "configurable": {
        "thread_id": "my-thread",  # 持久化必需
        # 自定义配置
        "user_id": "u123",
        "model_name": "gpt-4o",
    },
}

result = app.invoke({"messages": [("user", "hello")]}, config=config)
```

### 节点内访问 config

```python
from langchain_core.runnables import RunnableConfig

def my_node(state: State, config: RunnableConfig) -> dict:
    user_id = config["configurable"]["user_id"]
    step = config["metadata"]["langgraph_step"]  # 当前步数
    return {"result": f"step {step} for {user_id}"}
```

### 关键配置项

| 键 | 位置 | 说明 |
|---|---|---|
| `recursion_limit` | 顶级 | 最大超级步数，默认 25 |
| `thread_id` | `configurable` | 持久化 / checkpointer 必需 |
| `langgraph_step` | `metadata`（只读） | 当前执行步数 |
| 自定义键 | `configurable` | 业务参数透传 |

---

## 递归限制

- **默认值** 25，通过 `config["recursion_limit"]` 设置。
- 达到限制时抛出 `GraphRecursionError`。
- 使用 `RemainingSteps` 在状态中主动检查，优雅退出。
- **建议**：始终显式设置，不依赖默认值。

```python
# 推荐做法
config = {"recursion_limit": 50, "configurable": {"thread_id": "t1"}}
```

---

## 节点函数签名

```python
from langchain_core.runnables import RunnableConfig
from langgraph.store.base import BaseStore

# 最简 -- 只接收状态
def node(state: State) -> dict:
    ...

# 带 config -- 需要读取运行配置
def node(state: State, config: RunnableConfig) -> dict:
    ...

# 带 store -- 需要跨线程共享存储（compile 时须传入 store）
def node(state: State, config: RunnableConfig, *, store: BaseStore) -> dict:
    ...
```

- 节点函数返回 `dict`（部分更新），**不是**完整状态。
- `store` 必须作为关键字参数（keyword-only）。

---

## 图的可视化

```python
# 生成 Mermaid 文本
print(app.get_graph().draw_mermaid())

# 在 Jupyter 中渲染 PNG（需要 pygraphviz 或 grandalf）
from IPython.display import Image
Image(app.get_graph().draw_mermaid_png())
```

---

## 调试技巧

| 手段 | 用法 | 详细程度 |
|------|------|---------|
| `compile(debug=True)` | 编译时开启 | 打印每步执行详情 |
| `stream_mode="debug"` | 流式调用时指定 | 最详细的流式输出 |
| LangGraph Studio | 桌面应用 | 可视化调试，支持回放 |
| LangSmith | 云服务 / 自托管 | 生产追踪和监控 |

```python
# debug 编译
app = graph.compile(debug=True)

# debug 流式
async for event in app.astream(inputs, config, stream_mode="debug"):
    print(event)
```

---

## 注意事项

- `recursion_limit` 是 config **顶级键**，不在 `configurable` 内。
- `RetryPolicy` 和 `CachePolicy` 都从 `langgraph.types` 导入。
- `InMemoryCache` 从 `langgraph.cache.memory` 导入。
- 节点返回 `dict`（部分更新），不是完整状态对象。
- `handle_tool_errors=True` 仅影响工具执行异常，不影响 LLM 调用异常。
- `RemainingSteps` 是运行时自动注入的，不需要在初始输入中提供。
