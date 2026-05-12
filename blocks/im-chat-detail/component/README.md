# im-chat-detail SDK

双人对话详情组件的「整体可复用」SDK——把这个 `component/` 目录原样
拷贝到你的项目里就能用。**不需要打包，不需要 npm publish，不需要
理解内部实现，只读下面的 API**。

```
component/
├── frontend/         React + antd 组件源码 + 类型 + SKILL.md（详细 API 文档）
├── backend/          FastAPI + SQLAlchemy + alembic 服务端
└── protocol/         OpenAPI 契约 + 生成的 TS 类型
```

## 复制到目标项目

```bash
# 整体拷贝
cp -r blocks/im-chat-detail/component your-project/sdk/im-chat-detail
```

## 三层各自如何接入

### 1. 前端（React 组件）

```bash
# 在目标项目中
pnpm add file:./sdk/im-chat-detail/frontend
```

```tsx
import { ConfigProvider, App as AntdApp } from 'antd';
import { ChatDetail } from '@chat/im-chat-detail';
import '@chat/im-chat-detail/styles.css';

<ConfigProvider><AntdApp>
  <ChatDetail
    config={{
      apiBaseUrl: 'http://your-backend:8084',
      auth: { type: 'header', headerName: 'X-Dev-User-Id', getValue: () => CURRENT_USER_ID },
    }}
    peerId="01H..."
  />
</AntdApp></ConfigProvider>
```

`package.json` 的 `main`/`types` 指向 `src/index.ts`，所以现代打包器
（Vite/Next/webpack）直接消费源码，无需我们这边发包或 build。

**完整 props + 反模式禁令**：见 `frontend/SKILL.md`。

### 2. 后端（FastAPI 服务）

把 `backend/app/` 作为子包合到你的 Python 项目里，或独立起一个进程。

```bash
cd sdk/im-chat-detail/backend
uv venv && uv pip install -e '.[dev]'
uv run alembic upgrade head             # 建表
uv run uvicorn app.main:app --port 8084 # 跑起来
```

需要 postgres（连接串通过 `CHAT_DATABASE_URL` 环境变量传入；端口
约定 `:5548`，可自由调整）。

`app/` 子模块：
- `models/`     SQLAlchemy 实体（User / Message）
- `schemas/`   Pydantic 请求/响应模型
- `services/`  业务逻辑（消息收发、撤回、已读、cursor 分页）
- `api/v1/`    REST 路由
- `ws/`        WebSocket hub（in-process，message.new / updated / read 事件）
- `config.py` `auth.py` `db.py` `deps.py`  通用基础设施

### 3. 协议（OpenAPI 契约）

`protocol/openapi.yaml` 是事实源；`protocol/generated/openapi.ts` 是
codegen 出来的 TypeScript 类型（前端 / 任何想自己实现服务端的客户端
都可以直接 import）。

```ts
import type { components } from './sdk/im-chat-detail/protocol/generated/openapi';
type Message = components['schemas']['Message'];
```

## 关键设计契约

- **没有 Conversation 表**——双人对话由 `(sender_id, recipient_id)` 对隐式定义
- **ULID** 26 字符可排序 ID（不是 UUID）
- **cursor 分页**：高 churn 流式消息列表用 base64 URL-safe encoded cursor
- **软撤回**：`recall` 把消息内容改成 `{kind:'recall'}` 并设 `deleted_at`，row 保留
- **pluggable auth**：开发期 `X-Dev-User-Id` header，生产期 JWT Bearer
- **per-user 状态**：已读位置（`message.status`）按消息标记，不耦合到 sender

## 端口/前缀约定

| 资源 | 值 | 改它也行 |
|---|---|---|
| backend HTTP | `:8084` | env var |
| WebSocket | `ws://.../v1/ws` | 与 HTTP 同端口 |
| postgres | `:5548` | docker-compose / env var |
| env prefix | `CHAT_` | hard-coded in config.py |
| frontend pkg | `@chat/im-chat-detail` | package.json |

## 何时**不**用这个 SDK

- 多会话列表（"消息" tab 首页）→ 用 `im-conversation-list`
- 群聊（≥3 人）→ 等 `im-group-chat`（待建）
- 嵌入式评论 → 用 `comment-thread`
- 客服转人工系统（含分配 / 工单生命周期）→ 等 `support-ticket`（待建）
