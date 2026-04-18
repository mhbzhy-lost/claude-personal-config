---
name: langgraph-persistence
description: "LangGraph 持久化：Checkpointer 体系（InMemory/Sqlite/Postgres）、线程配置、状态快照与时间旅行、Store 长期记忆。"
tech_stack: [langgraph, backend]
language: [python]
capability: [agent-orchestration, state-management]
---

# LangGraph 持久化

> 版本：langgraph 1.1.x | 来源：https://langchain-ai.github.io/langgraph/concepts/persistence/

## 用途

为 LangGraph 图提供状态持久化能力，使对话可中断恢复、支持多轮记忆、状态审计与时间旅行，以及跨会话的长期记忆存储。

## 何时使用

- 需要多轮对话记忆（同一 thread 内状态延续）
- 需要审查或回滚历史状态（时间旅行）
- 需要人机协作（interrupt 依赖 checkpointer）
- 需要跨线程/跨会话的长期用户记忆（Store）
- 生产部署需要持久化存储

## Checkpointer 体系

| Checkpointer | 包 | 用途 |
|---|---|---|
| `InMemorySaver` | `langgraph-checkpoint` | 开发/测试 |
| `SqliteSaver` | `langgraph-checkpoint-sqlite` | 本地持久化 |
| `PostgresSaver` | `langgraph-checkpoint-postgres` | **生产环境** |

安装（按需）：

```bash
pip install langgraph-checkpoint-sqlite
pip install langgraph-checkpoint-postgres
```

`InMemorySaver` 随 `langgraph` 主包自带，无需额外安装。

## 基础用法

```python
from langgraph.checkpoint.memory import InMemorySaver

checkpointer = InMemorySaver()
app = graph.compile(checkpointer=checkpointer)

config = {"configurable": {"thread_id": "user-123"}}
result = app.invoke({"messages": [("user", "hi")]}, config)
# 同一 thread_id 后续调用会延续之前的状态
result2 = app.invoke({"messages": [("user", "what did I say?")]}, config)
```

## PostgresSaver 生产配置

同步版：

```python
from langgraph.checkpoint.postgres import PostgresSaver
import psycopg

conn_string = "postgresql://user:pass@host:5432/db"
with psycopg.Connection.connect(conn_string) as conn:
    saver = PostgresSaver(conn)
    saver.setup()  # 创建必要的表，仅首次运行
    app = graph.compile(checkpointer=saver)
```

异步版：

```python
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
import psycopg

async with await psycopg.AsyncConnection.connect(conn_string) as conn:
    saver = AsyncPostgresSaver(conn)
    await saver.setup()
    app = graph.compile(checkpointer=saver)
```

## 状态快照与时间旅行

```python
# 获取当前状态
snapshot = app.get_state(config)
print(snapshot.values)       # 当前状态值
print(snapshot.next)         # 下一步将执行的节点

# 遍历历史
for state in app.get_state_history(config):
    print(state.config, state.values)

# 时间旅行：从历史状态恢复
old_config = history_state.config
app.invoke(None, old_config)  # 从该 checkpoint 继续
```

## 手动更新状态

```python
app.update_state(config, {"messages": [("user", "override")]})

# 也可指定 as_node 模拟某节点的输出
app.update_state(config, {"result": "manual"}, as_node="processor")
```

## Store -- 长期记忆

Store 提供跨线程/跨会话的长期记忆能力，按命名空间组织数据。

```python
from langgraph.store.memory import InMemoryStore

store = InMemoryStore()

# 写入
store.put(("users", "user-123"), "preferences", {"theme": "dark"})
# 读取
item = store.get(("users", "user-123"), "preferences")
print(item.value)  # {"theme": "dark"}
# 搜索
results = store.search(("users", "user-123"))
```

在图中使用：

```python
app = graph.compile(checkpointer=checkpointer, store=store)

# 节点通过 config 访问 store
def my_node(state, config, *, store):
    memories = store.search(("user", config["configurable"]["user_id"]))
    # 使用记忆信息辅助决策
    ...
```

## thread_id vs Store 的区别

| 维度 | thread_id (Checkpointer) | Store |
|------|--------------------------|-------|
| 作用域 | 单个线程/会话 | 跨线程/跨会话 |
| 生命周期 | 短期记忆 | 长期记忆 |
| 数据组织 | 按 thread_id 隔离 | 按自定义命名空间组织 |
| 典型用途 | 多轮对话状态 | 用户偏好、历史总结 |

## 关键 API

| API | 说明 |
|-----|------|
| `graph.compile(checkpointer=saver)` | 编译图时绑定 checkpointer |
| `app.invoke(inputs, config)` | config 中需包含 `thread_id` |
| `app.get_state(config)` | 获取当前状态快照 |
| `app.get_state_history(config)` | 遍历历史状态 |
| `app.update_state(config, values)` | 手动更新状态 |
| `saver.setup()` | 初始化存储表（Postgres/Sqlite） |
| `store.put(namespace, key, value)` | 写入长期记忆 |
| `store.get(namespace, key)` | 读取长期记忆 |
| `store.search(namespace)` | 搜索长期记忆 |

## 注意事项

- 生产环境必须使用 `PostgresSaver`，`InMemorySaver` 进程重启后数据丢失
- `thread_id` 是 `configurable` 内的必填字段，缺失会报错
- `saver.setup()` 是幂等的，可安全重复调用
- 状态快照包含完整序列化数据，大状态注意内存占用
- `SqliteSaver` 适合本地开发和小规模单机部署，不适合多进程并发
- `update_state` 的 `as_node` 参数会影响图的执行路径（下一个节点的选择）

## 组合提示

- 与 **langgraph-hitl**（人机协作）搭配：`interrupt()` 必须配合 checkpointer 才能暂停/恢复
- 与 **langgraph-subgraph** 搭配：子图可通过 `checkpointer=True` 继承父图的 checkpointer
- 与 **langgraph-streaming** 搭配：流式输出与持久化可同时启用
