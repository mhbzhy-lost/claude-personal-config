---
name: langgraph-deployment
description: "LangGraph Server 部署、客户端 SDK（Python/JS）、langgraph.json 配置、前端流式对接"
tech_stack: [langgraph]
language: [python, typescript]
---

# Deployment（部署与客户端对接）

> 版本：langgraph-sdk 0.3.x (Python) / @langchain/langgraph-sdk 1.8.x (JS) / langgraph-cli | 来源：https://docs.langchain.com/langsmith/deployment

## 用途

将 LangGraph 图部署为 HTTP 服务，并通过客户端 SDK 或原生 SSE 从前端/其他服务消费流式输出。

## 何时使用

- Python 跑 pipeline，前端（React/Vue/Next.js）做展示
- 需要多客户端（Web/Mobile/API）共享同一 agent 服务
- 需要线程管理、状态持久化、人机协作的生产级 agent 服务

## 1. LangGraph Server — CLI 命令

### langgraph dev（开发模式，无需 Docker）

```bash
pip install "langgraph-cli[inmem]"
langgraph dev -c langgraph.json
# 默认端口 2024，自动热重载，自动打开 Studio Web UI
```

常用参数：
- `--port INTEGER` — 默认 `2024`
- `--no-reload` — 禁用热重载
- `--no-browser` — 不自动打开浏览器
- `--debug-port INTEGER` — IDE 远程调试端口

### langgraph up（Docker 生产模式）

```bash
langgraph up -c langgraph.json
# 启动 3 个容器：API server + PostgreSQL + Redis
# 默认端口 8123
```

常用参数：
- `-p, --port INTEGER` — 默认 `8123`
- `--watch` — 开启热重载
- `--postgres-uri TEXT` — 外接已有 Postgres

### langgraph build（构建 Docker 镜像）

```bash
langgraph build -t my-agent:latest -c langgraph.json
```

## 2. langgraph.json 配置文件

```json
{
  "python_version": "3.12",
  "dependencies": ["langchain_openai", "./my_agent"],
  "graphs": {
    "agent": "./my_agent/graph.py:agent"
  },
  "env": "./.env"
}
```

### 完整字段参考

| 字段 | 类型 | 说明 |
|------|------|------|
| `graphs` | `object` | **必填**。图名 → 导入路径 (`"./pkg/file.py:graph"`) |
| `dependencies` | `string[]` | PyPI 包或本地路径 |
| `env` | `object \| string` | 环境变量 dict 或 `.env` 文件路径 |
| `python_version` | `string` | `"3.11"` / `"3.12"` / `"3.13"`，默认 3.11 |
| `auth.path` | `string` | 自定义 Auth 实例的导入路径 |
| `http.cors` | `object` | CORS 配置：`allow_origins` / `allow_methods` 等 |
| `store.index` | `object` | 向量索引配置：`embed` / `dims` / `fields` |

### 带 CORS 的前端对接配置

```json
{
  "dependencies": ["langchain_openai", "./my_agent"],
  "graphs": {
    "agent": "./my_agent/graph.py:agent"
  },
  "http": {
    "cors": {
      "allow_origins": ["http://localhost:3000", "https://myapp.com"],
      "allow_methods": ["GET", "POST"],
      "allow_credentials": true
    }
  }
}
```

## 3. REST API 核心端点

Server 暴露完整 REST API（文档：`/docs`，OpenAPI：`/openapi.json`）。

### 线程管理

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/threads` | 创建线程 |
| GET | `/threads/:id` | 获取线程 |
| GET | `/threads/:id/state` | 获取当前状态 |
| POST | `/threads/:id/state` | 更新状态 |
| GET | `/threads/:id/history` | 检查点历史 |

### 运行（流式）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/threads/:tid/runs/stream` | 创建运行并流式返回 (SSE) |
| POST | `/threads/:tid/runs/wait` | 创建运行并等待完成 |
| POST | `/runs/stream` | 无状态流式运行 |
| POST | `/runs/wait` | 无状态等待运行 |

### 健康检查

```bash
curl http://localhost:2024/ok
# {"ok": true}
```

认证：通过 `X-Api-Key` 请求头传递 LangSmith API key。

## 4. Python 客户端 SDK (`langgraph-sdk`)

```bash
pip install langgraph-sdk
```

### 初始化

```python
# 异步客户端（推荐）
from langgraph_sdk import get_client
client = get_client(url="http://localhost:2024")

# 同步客户端
from langgraph_sdk import get_sync_client
client = get_sync_client(url="http://localhost:2024")
```

### 线程 + 流式调用

```python
# 创建线程
thread = await client.threads.create()

# 流式运行
async for chunk in client.runs.stream(
    thread["thread_id"],
    "agent",                    # assistant_id（langgraph.json 中的 graph 名）
    input={"messages": [{"role": "user", "content": "hello"}]},
    stream_mode="messages-tuple",
):
    print(chunk.event, chunk.data)
```

### 等待完成（非流式）

```python
result = await client.runs.wait(
    thread["thread_id"],
    "agent",
    input={"messages": [{"role": "user", "content": "hello"}]},
)
```

### 状态管理

```python
# 获取状态
state = await client.threads.get_state(thread["thread_id"])

# 更新状态（模拟人类审批）
await client.threads.update_state(
    thread["thread_id"],
    values={"messages": [{"role": "user", "content": "approved"}]},
)

# 历史
history = await client.threads.get_history(thread["thread_id"], limit=10)
```

### 流式模式

| 模式 | 说明 |
|------|------|
| `"values"` | 每步完整状态快照 |
| `"updates"` | 每个节点的增量变更 |
| `"messages-tuple"` | LLM token 级流式 + 元数据 |
| `"custom"` | 节点内 `get_stream_writer()` 发送的自定义数据 |
| `"debug"` | 最详细的调试信息 |

多模式组合：`stream_mode=["updates", "custom"]`

断点续流：`last_event_id="<ID>"` 参数支持重连续传。

## 5. JS/TS 客户端 SDK (`@langchain/langgraph-sdk`)

```bash
npm install @langchain/langgraph-sdk
```

### 初始化

```typescript
import { Client } from "@langchain/langgraph-sdk";

const client = new Client({
  apiUrl: "http://localhost:2024",
  // 生产环境需要 apiKey
});
```

### 线程 + 流式调用

```typescript
const thread = await client.threads.create();

const stream = client.runs.stream(
  thread.thread_id,
  "agent",
  {
    input: { messages: [{ role: "user", content: "hello" }] },
    streamMode: "messages-tuple",
  }
);

for await (const chunk of stream) {
  console.log(chunk.event, chunk.data);
}
```

### 等待完成

```typescript
const result = await client.runs.wait(
  thread.thread_id,
  "agent",
  { input: { messages: [{ role: "user", content: "hello" }] } }
);
```

## 6. React useStream Hook（推荐前端方案）

```bash
npm install @langchain/langgraph-sdk
```

```tsx
import { useStream } from "@langchain/langgraph-sdk/react";

function Chat() {
  const thread = useStream({
    apiUrl: "http://localhost:2024",
    assistantId: "agent",
    messagesKey: "messages",
  });

  return (
    <div>
      {thread.messages.map((msg, i) => (
        <div key={i}>{msg.content}</div>
      ))}

      <button onClick={() =>
        thread.submit({
          messages: [{ role: "user", content: "hello" }],
        })
      }>
        Send
      </button>

      {thread.isLoading && <span>Loading...</span>}

      {/* 人机协作：interrupt 自动暴露 */}
      {thread.interrupt && (
        <div>
          <p>{thread.interrupt.question}</p>
          <button onClick={() => thread.submit(
            { messages: [] },
            { command: { resume: "approve" } }
          )}>
            Approve
          </button>
        </div>
      )}
    </div>
  );
}
```

### useStream 返回值

| 属性 | 类型 | 说明 |
|------|------|------|
| `messages` | `Message[]` | 自动拼接的消息数组（含流式 token 合并） |
| `values` | `object` | 完整线程状态 |
| `isLoading` | `boolean` | 是否正在流式传输 |
| `error` | `Error \| null` | 最后一次错误 |
| `interrupt` | `any` | 当前 interrupt 值（人机协作） |
| `submit` | `(input, options?) => void` | 发送新输入 |
| `stop` | `() => void` | 停止当前流 |
| `setBranch` | `(checkpointId) => void` | 时间旅行 |

## 7. Next.js API 代理（生产模式）

生产环境不应将 API Key 暴露给前端，使用 Next.js Route Handler 做代理：

```typescript
// app/api/agent/stream/route.ts
import { Client } from "@langchain/langgraph-sdk";

const client = new Client({
  apiUrl: process.env.LANGGRAPH_API_URL!,
  apiKey: process.env.LANGGRAPH_API_KEY!,
});

export async function POST(req: Request) {
  const { messages, threadId } = await req.json();

  const thread = threadId
    ? { thread_id: threadId }
    : await client.threads.create();

  const stream = client.runs.stream(
    thread.thread_id,
    "agent",
    {
      input: { messages },
      streamMode: "messages-tuple",
    }
  );

  return new Response(stream.toReadableStream(), {
    headers: {
      "Content-Type": "text/event-stream",
      "X-Thread-Id": thread.thread_id,
    },
  });
}
```

## 8. 自建 FastAPI + SSE（不依赖 LangGraph Server）

```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from langgraph.graph import StateGraph, MessagesState
import json

app = FastAPI()
graph = build_my_graph()  # 你的 StateGraph
compiled = graph.compile(checkpointer=checkpointer)

@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    async def generate():
        async for chunk in compiled.astream(
            {"messages": [("user", request.message)]},
            config={"configurable": {"thread_id": request.thread_id}},
            stream_mode="messages",
        ):
            msg, metadata = chunk
            yield f"data: {json.dumps({'content': msg.content, 'node': metadata['langgraph_node']})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
```

前端用 `EventSource` 或 `fetch` + ReadableStream 消费。

## 9. 部署模式选择

| 模式 | 命令 | 适用场景 |
|------|------|---------|
| `langgraph dev` | 开发本地调试 | 开发阶段 |
| `langgraph up` | Docker 本地生产 | 本地集成测试 |
| `langgraph build` + Docker Compose | 自托管 | 自有基础设施 |
| LangSmith Deployment (SaaS) | UI/CLI 部署 | 全托管 |
| 自建 FastAPI | 自定义 | 不需要 LangGraph Server 的完整功能 |

## 10. LangGraph Studio

可视化调试桌面 IDE，支持：
- 图拓扑可视化
- 时间旅行调试（回退到任意 checkpoint、编辑状态、分叉执行）
- 实时状态编辑
- Interrupt 单步调试

使用方式：
- `langgraph dev` 自动打开 Studio Web UI
- 或访问 `https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024`

## 注意事项

- `langgraph dev` 端口 **2024**，`langgraph up` 端口 **8123** — 注意客户端 URL 区分
- `@langchain/langgraph-sdk` 是**轻量客户端**，不是图运行时 `@langchain/langgraph`
- 生产环境必须通过后端代理隐藏 API Key，不要直接从浏览器连接
- `useStream` 自动处理消息拼接、chunk 合并、interrupt 状态，是 React 首选方案
- `stream.toReadableStream()` 可将 SDK 流直接转为 Web API 标准流
- 自托管需要 PostgreSQL + Redis，`langgraph dev` 用内存替代

## 组合提示

| 场景 | 参考 Skill |
|------|-----------|
| 图的构建 | `langgraph-core` |
| 流式模式详解 | `langgraph-streaming` |
| 持久化配置 | `langgraph-persistence` |
| 人机协作对接 | `langgraph-hitl` |
| JS 端独立运行图 | `langgraph-js` |
