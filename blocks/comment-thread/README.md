# comment-thread

评论流嵌入式 widget business pattern block —— 端到端预制件，含
**前端组件 + 协议契约 + 后端服务**三层配对资产。

## 这个 block 解决的问题

你做的页面（博客文章 / 商品详情 / 订单详情 / 任意业务实体）需要"挂一个
评论区"。本 block 提供一个**嵌入式 widget**——挂到任意页面的任意位置，
通过 `resourceType + resourceId` 锚定到宿主。

特征：
- **嵌入式**：不是独立页面，不带 Layout，靠父容器决定大小位置
- **树状**：支持 reply-of-reply，最多 3 层嵌套
- **跨资源**：同一份 block 可被多种业务实体复用（article / product / order ...）
- **匿名可读，登录可写**

## 何时**不**用这个 block（反向选型）

- IM 多对话列表 → 用 [`im-conversation-list`](../im-conversation-list/)
- 商品瀑布流 → 用 [`commerce-product-list`](../commerce-product-list/)
- 订单详情主页 → 用 [`order-detail`](../order-detail/)
- 通知中心（线性时间线，无 reply） → 用 `notification-center`（待建）
- 论坛主题列表 + 详情双视图 → 用 `forum-thread`（待建）
- 实时聊天室 → 用 IM block
- 单层评论无 reply → 直接 antd `<List>` 手写更短

## 你需要消费什么资源

### 1. 前端 widget

```bash
pnpm add file:../path/to/blocks/comment-thread/frontend
```

```tsx
import { ConfigProvider, App as AntdApp } from 'antd';
import { CommentsThread } from '@ct/comment-thread';

function ArticlePage({ articleId }) {
  return (
    <ConfigProvider><AntdApp>
      {/* 你的文章正文 */}
      <Article id={articleId} />

      {/* 评论挂在文章下面 —— 没有 Layout，自适应父容器 */}
      <CommentsThread
        config={{
          apiBaseUrl: 'http://your-backend:8083',
          auth: {           // 可选；省略则匿名（只读）
            type: 'header',
            headerName: 'X-Dev-User-Id',
            getValue: () => YOUR_USER_ID,
          },
        }}
        resourceType="article"
        resourceId={articleId}
      />
    </AntdApp></ConfigProvider>
  );
}
```

资源锚定模式：`resourceType` 是字符串（"article" / "product" / "order"
/ 任意），`resourceId` 是 ULID。后端把它们当软指针——**不验证宿主实体
是否真存在**（由消费应用保证）。

**完整 API + 反模式禁令**：[`frontend/SKILL.md`](./frontend/SKILL.md)

### 2. 后端服务

```bash
docker run -d --name ct-pg \
  -e POSTGRES_USER=ct -e POSTGRES_PASSWORD=ct -e POSTGRES_DB=ct \
  -p 5547:5432 postgres:17-alpine
docker exec ct-pg psql -U ct -d ct -c "CREATE DATABASE ct_test OWNER ct;"

cd blocks/comment-thread/backend
make install && make migrate
make dev                     # uvicorn :8083
```

### 3. 协议契约（自实现后端时用）

- **OpenAPI**：[`protocol/openapi.yaml`](./protocol/openapi.yaml)
- **TS 类型**：[`protocol/generated/openapi.ts`](./protocol/generated/openapi.ts)
- **zod + zodios**：[`protocol/generated/zodios.ts`](./protocol/generated/zodios.ts)

关键约束（自实现时必须保留）：
- 树状深度限制 3 层（depth ≤ 3），超出返 422 `comment.depth_exceeded`
- 跨 host 引用 parent → 404 `comment.parent_not_found`
- 非作者删除 → 403 `comment.not_author`
- 删除是软删除，row 保留以维持树结构，`is_deleted=true` 时 `content=""`

## 端口/前缀

| 资源 | 值 |
|---|---|
| backend HTTP | `:8083` |
| postgres | `:5547` |
| env prefix | `CT_` |
| frontend pkg | `@ct/comment-thread` |

## 这个 block 包含什么（开发者向）

```
comment-thread/
├── protocol/   OpenAPI + codegen + spectral lint
├── backend/    FastAPI 服务（3 endpoints / 12 tests / 状态机校验）
└── frontend/   React lib（<CommentsThread> + 树状渲染 + composer）
```
