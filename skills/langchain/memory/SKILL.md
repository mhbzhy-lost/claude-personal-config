---
name: langchain-memory
description: LangChain v1 短期/长期记忆方案——checkpointer 线程内记忆、store 跨会话记忆、RunnableWithMessageHistory 包装器
tech_stack: [langchain, langgraph]
language: [python]
capability: [agent-orchestration]
version: "langchain 1.x"
collected_at: 2026-04-18
---

# LangChain Memory（短期与长期记忆）

> 来源：https://docs.langchain.com/oss/python/langchain/short-term-memory ；/long-term-memory ；/concepts/memory

## 用途
为 agent 与 chain 提供对话记忆能力：
- **短期记忆**：单线程会话内的消息历史，由 LangGraph checkpointer 持久化
- **长期记忆**：跨会话、跨线程的 JSON 文档存储，由 LangGraph store 持久化
- **RunnableWithMessageHistory**：为纯 Runnable 包一层 `session_id` 路由的历史管理

## 何时使用
- Agent 需要在一轮对话内记住上下文 → 短期 checkpointer
- 需要跨 session 记住用户偏好 / 历史事实 / 规则 → 长期 store
- 对话超过 LLM 上下文窗口 → trim / delete / `SummarizationMiddleware`
- 非 agent 的 Runnable 需要按 `session_id` 分组历史 → `RunnableWithMessageHistory`

## 基础用法

### 短期记忆：checkpointer
```python
from langchain.agents import create_agent
from langgraph.checkpoint.memory import InMemorySaver  # 生产换 PostgresSaver

agent = create_agent(
    model="claude-sonnet-4-6",
    tools=[...],
    checkpointer=InMemorySaver(),
)

# 通过 thread_id 区分会话
agent.invoke(
    {"messages": [{"role": "user", "content": "我叫 Alice"}]},
    config={"configurable": {"thread_id": "user-123"}},
)
```

### 长期记忆：store
```python
from langgraph.store.memory import InMemoryStore  # 生产换 PostgresStore

store = InMemoryStore()
agent = create_agent(model=..., tools=[...], store=store)

# 在 tool 中读写
from langchain.tools import tool

@tool
def save_pref(pref: str, runtime) -> str:
    """保存用户偏好"""
    runtime.store.put(("user", runtime.context.user_id), "pref", {"value": pref})
    return "saved"

@tool
def load_pref(runtime) -> str:
    item = runtime.store.get(("user", runtime.context.user_id), "pref")
    return item.value["value"] if item else "none"
```

### 长对话压缩
```python
from langchain.agents.middleware import SummarizationMiddleware

agent = create_agent(
    model="claude-sonnet-4-6",
    tools=[...],
    middleware=[SummarizationMiddleware(
        model="claude-sonnet-4-6",
        trigger={"tokens": 4000},  # 超过 4k token 触发总结
    )],
)
```

### RunnableWithMessageHistory
```python
from langchain_core.runnables.history import RunnableWithMessageHistory

with_history = RunnableWithMessageHistory(
    runnable=chain,
    get_session_history=lambda sid: get_history_for(sid),  # 返回 BaseChatMessageHistory
    input_messages_key="input",
    history_messages_key="history",
)
with_history.invoke(
    {"input": "你好"},
    config={"configurable": {"session_id": "bar"}},
)
```

## 关键 API
- `create_agent(..., checkpointer=...)`：短期记忆入口
- `create_agent(..., store=...)`：长期记忆入口
- `InMemorySaver` / `PostgresSaver`：checkpointer 实现
- `InMemoryStore` / `PostgresStore`：store 实现（命名空间 + 键 + JSON 值）
- `store.get(namespace, key)` / `store.put(namespace, key, data)` / `store.search(...)`
- `SummarizationMiddleware(model, trigger={"tokens": N})`：自动总结
- `RunnableWithMessageHistory(runnable, get_session_history, ...)`
- 自定义 state：继承 `AgentState`（必须是 `TypedDict`），通过 `state_schema=` 传入

## 注意事项
- **测试用 InMemory*，生产必须用 Postgres/Redis 等持久化实现**——进程重启会丢失内存态
- `AgentState` 只能是 `TypedDict`，不支持 Pydantic / dataclass
- 长上下文会降低模型质量、增加延迟与成本——主动 trim / summarize，而非无脑堆历史
- Long-term store 的 tool 访问必须通过 `runtime.store`，namespace 一般以 user_id / org_id 组织，需通过 dataclass `context_schema` 注入
- 记忆三分类：语义（事实）/ 情景（过往经验，常用 few-shot）/ 程序（prompt、规则）——设计时先想清楚归类
- `RunnableWithMessageHistory` 默认要 `session_id`，可通过 `history_factory_config=[ConfigurableFieldSpec(...)]` 自定义为 user_id + conversation_id 组合

## 组合提示
- 与 `langchain-agents` 的 `create_agent` 搭配使用 checkpointer + store
- 需要人工审批敏感操作时配合 `HumanInTheLoopMiddleware`
- 长期记忆 + 向量检索 → 参考 langchain-retrievers / langchain-vector-stores
