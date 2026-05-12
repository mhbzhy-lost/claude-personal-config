# im-conversation-list SDK

多会话列表 SDK（微信 / Slack 风格首页 tab）——整个 `component/` 目录
原样拷贝到目标项目即可用。

```
component/
├── frontend/         React + antd 组件 + 类型 + SKILL.md（详细 API）
├── backend/          FastAPI + SQLAlchemy + alembic（会话/消息/per-user 状态）
└── protocol/         OpenAPI + AsyncAPI 契约 + 生成的 TS 类型
```

## 整体复制

```bash
cp -r blocks/im-conversation-list/component your-project/sdk/im-conversation-list
```

## 三层接入

### 1. 前端

```bash
pnpm add file:./sdk/im-conversation-list/frontend
```

```tsx
import { ConfigProvider, App as AntdApp } from 'antd';
import { ConversationList } from '@imcl/conversation-list';
import '@imcl/conversation-list/styles.css';

<ConfigProvider><AntdApp>
  <ConversationList
    config={{
      apiBaseUrl: 'http://your-backend:8080',
      auth: { type: 'header', headerName: 'X-Dev-User-Id', getValue: () => CURRENT_USER_ID },
    }}
    onSelect={(c) => navigate(`/chat/${c.id}`)}
  />
</AntdApp></ConfigProvider>
```

`main`/`types` 指向 `src/index.ts`，目标项目直接消费 TS 源码，无需 build。

**完整 props + 反模式禁令**：见 `frontend/SKILL.md`。

### 2. 后端

```bash
cd sdk/im-conversation-list/backend
uv venv && uv pip install -e '.[dev]'
uv run alembic upgrade head
uv run uvicorn app.main:app --port 8080
```

`app/` 模块：`models/` `schemas/` `services/` `api/v1/` `ws/`。

### 3. 协议

```ts
import type { components } from './sdk/im-conversation-list/protocol/generated/openapi';
type Conversation = components['schemas']['Conversation'];
```

## 关键设计契约

- **per-user 状态分表**：`user_conversation_state` 装 pin / mute / unread——同一会话不同用户独立状态
- **cursor 分页**：按 `last_activity_at desc` + ULID 排序，base64 URL-safe encoded
- **soft delete-per-user**：删除只对当前用户生效
- **WS 三类事件**：`message.new` `conversation.created/updated/deleted`
- **pluggable auth**：开发 `X-Dev-User-Id`，生产 JWT Bearer
- **服务端独裁排序**，client 不重排

## 端口/前缀

| 资源 | 值 |
|---|---|
| backend HTTP | `:8080` |
| WebSocket | `ws://.../v1/ws` |
| postgres | `:5544` |
| env prefix | `IMCL_` |
| frontend pkg | `@imcl/conversation-list` |

## 何时**不**用

- 双人对话详情页 → `im-chat-detail`
- 评论流 / 通知中心（线性时间线）→ 用 feed / timeline 类
- 嵌入式评论 → `comment-thread`
- 商品 / 订单列表 → `commerce-product-list` / `order-detail`
