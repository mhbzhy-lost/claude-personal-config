# im-chat-detail

双人对话详情 business pattern block —— 端到端预制件，含
**前端组件 + 协议契约 + 后端服务**三层配对资产。

## 这个 block 解决的问题

你做的应用需要"两个用户之间的聊天界面"——典型场景：

- 即时通讯 App 的会话详情（点 IM 列表里某对话 → 进聊天页）
- 客服对话页（用户 ↔ 客服）
- 平台内私信（用户 ↔ 用户的 1-on-1 IM）

**和 [`im-conversation-list`](../im-conversation-list/) 配对**：list 显示
所有会话，detail 显示一个会话内部的消息流。两 block 独立可用——detail 可
被深链直达，list 也可不带 detail。两套共享相同的概念模型但**后端独立**
（消费应用如需数据一致可让一个 FastAPI 进程同时挂两个 block backend）。

## 何时**不**用这个 block（反向选型）

- 多对话列表（"消息" tab 的首页）→ 用 [`im-conversation-list`](../im-conversation-list/)
- 群聊（≥3 人）→ 用 `im-group-chat`（待建）
- 嵌入式评论 → 用 [`comment-thread`](../comment-thread/)
- 客服转人工系统（含分配 / 工单生命周期）→ 用 `support-ticket`（待建）

## 你需要消费什么资源

### 1. 前端组件

```bash
pnpm add file:../path/to/blocks/im-chat-detail/frontend
```

```tsx
import { ConfigProvider, App as AntdApp } from 'antd';
import { ChatDetail } from '@chat/im-chat-detail';

<ConfigProvider><AntdApp>
  <ChatDetail
    config={{
      apiBaseUrl: 'http://your-backend:8084',
      auth: {
        type: 'header',
        headerName: 'X-Dev-User-Id',
        getValue: () => YOUR_USER_ID,
      },
    }}
    peerId="01H..."  // 决定和谁聊
  />
</AntdApp></ConfigProvider>
```

`<ChatDetail>` 占满父容器高度，挂在固定尺寸容器内（如手机壳 mockup
`<div style={{height: '100vh', maxWidth: 480}}>`），或者配合
[`@ui/top-navbar`](../top-navbar/) + Layout 包裹。

**完整 API + 反模式禁令**：[`frontend/SKILL.md`](./frontend/SKILL.md)

### 2. 后端服务

```bash
docker run -d --name chat-pg \
  -e POSTGRES_USER=chat -e POSTGRES_PASSWORD=chat -e POSTGRES_DB=chat \
  -p 5548:5432 postgres:17-alpine
docker exec chat-pg psql -U chat -d chat -c "CREATE DATABASE chat_test OWNER chat;"

cd blocks/im-chat-detail/backend
make install && make migrate
make seed-demo               # 2 users (Alice/Bob) + 6 sample messages
make dev                     # uvicorn :8084
```

### 3. 协议契约（自实现后端时用）

- **OpenAPI**：[`protocol/openapi.yaml`](./protocol/openapi.yaml)
- **TS 类型**：[`protocol/generated/openapi.ts`](./protocol/generated/openapi.ts)
- **zod + zodios**：[`protocol/generated/zodios.ts`](./protocol/generated/zodios.ts)

关键设计：
- **没有 Conversation 表**——两人对话由 (sender_id, recipient_id) 对隐式定义
- `User` 含 `bio` / `online_status` / `last_seen_at`（公开 profile 字段）
- 消息软删除：`recall` 把内容改成 `{kind:'recall'}` 并设 `deleted_at`，row 保留
- 实时 WS：message.new / message.updated / message.read 三类事件

## 端口/前缀

| 资源 | 值 |
|---|---|
| backend HTTP | `:8084` |
| WebSocket | `ws://.../v1/ws` |
| postgres | `:5548` |
| env prefix | `CHAT_` |
| frontend pkg | `@chat/im-chat-detail` |

## 这个 block 包含什么（开发者向）

```
im-chat-detail/
├── protocol/   OpenAPI + codegen + spectral lint
├── backend/    FastAPI 服务（含 WS hub / 13 tests / 状态机校验）
└── frontend/   React lib（<ChatDetail> + useChat + 子组件）
```
