# im-conversation-list

微信风格的会话列表 business pattern block —— 端到端预制件，含
**前端组件 + 协议契约 + 后端服务**三层配对资产。

## 这个 block 解决的问题

你在做的应用需要"多会话列表 + 实时消息推送 + 未读 / 置顶 / 免打扰
等 per-user 状态"。典型场景：

- 微信 / 钉钉 / Slack 风格的会话列表
- 客服系统的工单消息列表
- 协作工具的频道列表（带未读、置顶、免打扰）

## 何时**不**用这个 block（反向选型）

- 单聊客服 widget（无多会话语义）→ 用更轻的 chat widget
- 评论流 / 通知中心（线性时间线、无会话分组）→ 用 feed / timeline
- 协作文档评论（嵌入式、上下文锚定）→ 用 inline-comment
- 商品列表 → 用 [`commerce-product-list`](../commerce-product-list/)
- 订单列表 → 用 [`order-detail`](../order-detail/)

## 你需要消费什么资源

按需取三层，**不需要把整个目录拷贝进自己项目**：

### 1. 前端组件（最常用）

```bash
pnpm add file:../path/to/blocks/im-conversation-list/frontend
```

```tsx
import { ConfigProvider, App as AntdApp } from 'antd';
import { ConversationList } from '@imcl/conversation-list';

<ConfigProvider><AntdApp>
  <ConversationList
    config={{
      apiBaseUrl: 'http://your-backend:8080',
      auth: {
        type: 'header',
        headerName: 'X-Dev-User-Id',
        getValue: () => YOUR_USER_ID,
      },
    }}
    onSelect={(c) => navigateTo(c.id)}
  />
</AntdApp></ConfigProvider>
```

**重要**：组件依赖 `<App>`（来自 antd）的 message context。

**完整 API + 反模式禁令**：[`frontend/SKILL.md`](./frontend/SKILL.md)

### 2. 后端服务（如果你没有现成的 IM 后端）

```bash
docker run -d --name imcl-pg \
  -e POSTGRES_USER=imcl -e POSTGRES_PASSWORD=imcl -e POSTGRES_DB=imcl \
  -p 5544:5432 postgres:17-alpine
docker exec imcl-pg psql -U imcl -d imcl -c "CREATE DATABASE imcl_test OWNER imcl;"

cd blocks/im-conversation-list/backend
make install && make migrate
make seed-demo                # ~100 conversations
make dev                      # uvicorn :8080
```

生产部署：FastAPI + SQLAlchemy，按常规 Python web 服务部署（gunicorn /
uvicorn workers / 你的 PaaS）。

如果你**已经有 IM 后端**，让它实现下一节的协议契约即可。

### 3. 协议契约（自实现后端时用）

- **OpenAPI**：[`protocol/openapi.yaml`](./protocol/openapi.yaml) — REST endpoints
- **AsyncAPI**：[`protocol/asyncapi.yaml`](./protocol/asyncapi.yaml) — WS events
- **人类可读说明**：[`protocol/types.md`](./protocol/types.md)
- **生成的 TS 类型**：[`protocol/generated/openapi.ts`](./protocol/generated/openapi.ts)
- **生成的 zod schema + zodios 客户端**：[`protocol/generated/zodios.ts`](./protocol/generated/zodios.ts)

让你的后端实现这份契约即可。前端组件只看协议不看后端实现。

## 端口/前缀

| 资源 | 值 |
|---|---|
| backend HTTP | `:8080` |
| backend WebSocket | `ws://.../v1/ws` |
| postgres | `:5544` |
| env prefix | `IMCL_` |
| frontend pkg | `@imcl/conversation-list` |

## 这个 block 包含什么（开发者向）

```
im-conversation-list/
├── protocol/      契约层（OpenAPI + AsyncAPI + codegen + spectral lint）
├── backend/       FastAPI 服务（11 endpoints / 21 tests / 74% coverage）
└── frontend/      React lib（<ConversationList> + useConversations）
```

修 bug / 加特性：进对应层目录，看里面的 README。
新增类似 block：调 `new-block` skill（位于 `claude-skills/new-block/`）。
