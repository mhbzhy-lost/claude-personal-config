# comment-thread SDK

嵌入式评论流 widget SDK——挂到任意业务实体（文章 / 商品 / 订单 / 任意
资源）下面就能用。匿名可读，登录可写，最多 3 层嵌套。

```
component/
├── frontend/    CommentsThread + CommentNode + CommentComposer + useComments
├── backend/     FastAPI + 树状 reply + 软指针 host（resource_type+resource_id）
└── protocol/    OpenAPI + 生成 TS 类型
```

## 整体复制

```bash
cp -r blocks/comment-thread/component your-project/sdk/comments
```

## 前端

```tsx
import { ConfigProvider, App as AntdApp } from 'antd';
import { CommentsThread } from '@ct/comment-thread';
import '@ct/comment-thread/styles.css';

<ConfigProvider><AntdApp>
  {/* 挂到商品详情页 */}
  <CommentsThread
    config={config}
    resourceType="product"
    resourceId="01H..."  // 当前商品 ID
  />

  {/* 挂到博客文章页 — 同一组件，不同 resource */}
  <CommentsThread config={config} resourceType="article" resourceId="01H..." />
</AntdApp></ConfigProvider>
```

匿名时 config.auth 不传：能看，不能发；登录后给 auth：出现回复 / 删除按钮。

## 后端

```bash
cd sdk/comments/backend
uv venv && uv pip install -e '.[dev]'
uv run alembic upgrade head
uv run uvicorn app.main:app --port 8083
```

## 协议

```ts
import type { components } from './sdk/comments/protocol/generated/openapi';
type Comment = components['schemas']['Comment'];
```

## 关键设计

- **软指针 host**：`(resource_type, resource_id)` 元组锚定到任意业务实体；不引用
  外键，host 资源删除时评论不级联（业务自己决定怎么处理）
- **树状 reply**：自指 FK `parent_comment_id`，**最多 3 层**（reply-of-reply-of-reply）
- **跨 host 父校验**：reply 时的 parent 必须 attach 到同一 (resource_type, resource_id)
- **soft delete**：删除把 content 改成 placeholder 并设 `deleted_at`，保留行
- **匿名可读**：未传 auth 时只接受 GET；POST/PUT/DELETE 要 auth
- **混合鉴权**：list 接受匿名，write 接受 dev header / JWT Bearer

## 端口/前缀

| 资源 | 值 |
|---|---|
| backend HTTP | `:8083` |
| postgres | `:5547` |
| env prefix | `CT_` |
| frontend pkg | `@ct/comment-thread` |

## 何时**不**用

- IM 多对话 → `im-conversation-list`
- 商品 / 订单列表（独立页面）→ `commerce-product-list` / `order-detail`
- 通知中心（线性、无 reply） → 待建 `notification-center`
- 论坛主题列表 + 详情双视图 → 待建 `forum-thread`
- 实时聊天室 → `im-chat-detail`
