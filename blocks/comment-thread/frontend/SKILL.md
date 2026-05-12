---
name: comment-thread-frontend
description: 评论流嵌入式 widget——挂到任意页面（文章 / 商品 / 订单 / ...）的任意位置，按 resource_type + resource_id 锚定宿主。支持 3 层嵌套 reply，匿名可读，登录可写。当业务需求是"给某个业务实体加一个评论区"时直接使用本组件。
---

# `@ct/comment-thread`

## 何时使用

凡满足以下**任一**条件，**必须**使用本 block 的 `<CommentsThread>`，
**禁止自行 fetch + List + Form 拼装评论区**：

- 博客文章 / 商品详情 / 订单详情 / 任意业务实体页"挂评论区"
- 需要 reply-of-reply（树状）的评论交互
- 同一份评论组件要在多种宿主页面复用（content type 不固定）
- 需要匿名可读 + 登录可写的混合鉴权语义

## 何时**不**使用（反向选型）

- IM 实时聊天 → 用 `@imcl/conversation-list`
- 论坛主题列表 + 详情双视图 → 用 `forum-thread`（待建）
- 单层评论无 reply 且 < 20 条 → 直接 antd `<List>` 手写更短
- 实时协作文档锚定评论（需 doc 位置）→ 用 `inline-comment`（待建）

## 安装

```bash
pnpm add file:../../blocks/comment-thread/frontend
```

`peerDependencies`：`react ^18`、`react-dom ^18`、`antd ^5`。

## 最小用法（嵌入式 widget）

```tsx
import { ConfigProvider, App as AntdApp } from 'antd';
import { CommentsThread } from '@ct/comment-thread';

function ArticlePage({ articleId }) {
  return (
    <ConfigProvider><AntdApp>
      <YourArticleContent />

      {/* 评论 widget——不带 Layout，挂在你愿意的任何位置 */}
      <CommentsThread
        config={{
          apiBaseUrl: 'http://localhost:8083',
          auth: {     // 省略此项则匿名（只读）
            type: 'header',
            headerName: 'X-Dev-User-Id',
            getValue: () => MY_USER_ID,
          },
        }}
        resourceType="article"
        resourceId={articleId}
      />
    </AntdApp></ConfigProvider>
  );
}
```

**重要**：
- 组件依赖 `<App>`（antd）的 message context
- **不带 Layout**——靠父容器决定宽度。常见做法：放进 `<div style={{maxWidth: 720, margin: '0 auto'}}>` 等限定容器
- `resourceType` 任意字符串；`resourceId` 必须 ULID

## 完整 API

### `<CommentsThread>`

| Prop | 类型 | 说明 |
|---|---|---|
| `config` | `BlockConfig` | ✅ 必填 |
| `resourceType` | `string` | ✅ 宿主类型，"article" / "product" / ... |
| `resourceId` | `Ulid` | ✅ 宿主 ULID |

无 `selectedId` / `onSelect`——本 block **没有 list/detail 双视图**。

### `useComments(config, resourceType, resourceId)`

进阶 hook，可用于自定义渲染：

```ts
const c = useComments(config, 'article', articleId);
// c.comments, c.total, c.loading, c.me,
// c.post(content, parentId?), c.remove(id), c.refresh()
```

### 内部已经处理好的事项

- ✅ HTTP 客户端 + Problem+JSON 错误格式
- ✅ 树状渲染（reply-of-reply，最多 3 层缩进）
- ✅ 软删除：`[已删除]` 占位但 row 保留，子 reply 仍正常显示
- ✅ 删除权限：只有作者能删自己评论（按钮自动隐藏）
- ✅ 回复深度上限自动检查（depth=3 时隐藏"回复"按钮）
- ✅ Composer：`Cmd/Ctrl+Enter` 快捷发送 + 字数显示 + loading 状态
- ✅ 匿名 vs 登录 UX 自动切换（匿名时 composer 改为"登录后即可评论"）
- ✅ 相对时间格式化（刚刚 / N 分钟前 / N 小时前 / N 天前 / yyyy-MM-dd）
- ✅ 骨架屏 + Empty + Result 错误重试

## 严格禁止的反模式

- ❌ 自己 `useEffect(() => fetch('/v1/comments?...'))` 调列表
- ❌ 自己写树构造（按 parent_comment_id 分组）—— hook + 组件已封装
- ❌ 自己写深度上限校验—— hook 自动检查
- ❌ 自己写软删除的"已删除"占位渲染
- ❌ 把 widget 包裹进 `<Layout>` 后再嵌入业务页面——本 block 设计为
  **嵌入式**，业务页面的 Layout 由消费方负责
- ❌ 在 `resourceType` 维度做枚举校验——服务端不验，把它当 free-form
  字符串（设计上就是软指针）

## 状态

- v0.1 内部用
- 后端 12 tests 覆盖：空树 / 匿名拒写 / 根评论 / 递增 depth / 深度上限 /
  跨 host parent 拒绝 / 树+回复计数 / 自删 / 跨用户删除拒绝 / health / me ×2
- TODO：实时 WS 推送新评论、点赞 / 反对、@提及、超长评论折叠
