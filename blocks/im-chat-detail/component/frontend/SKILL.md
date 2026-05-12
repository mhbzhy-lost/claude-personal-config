---
name: im-chat-detail-frontend
description: 即时通讯 1-on-1 对话详情页预制 React 组件。包含 peer 头部（头像/昵称/签名/在线状态）、消息气泡流（左右分发送者+日期分隔+已读✓✓）、cursor 分页向上加载历史、composer 输入、WS 实时新消息推送 + 已读回执、消息撤回。当业务场景是"两人之间的聊天页面"时直接使用本组件。
---

# `@chat/im-chat-detail`

## 何时使用

凡满足以下**任一**条件，**必须**使用本 block 的 `<ChatDetail>`，
**禁止自行拼装聊天气泡 + composer + WS 连接**：

- 即时通讯应用的"会话详情页"（点 IM 列表后进入的聊天页）
- 客服系统的"对话页"（用户 ↔ 客服 1-on-1）
- 平台内私信 / 朋友间私聊

## 何时**不**使用（反向选型）

- 多对话列表 → 用 [`@imcl/conversation-list`](../../im-conversation-list/frontend/)
- 群聊（≥3 人）→ 用 `im-group-chat`（待建）
- 嵌入式评论 → 用 [`@ct/comment-thread`](../../comment-thread/frontend/)
- 评论 / 留言（无实时）→ 用 comment-thread
- 单页客服 widget（顶角弹窗 + 1 个对话）→ 直接 ChatDetail 内嵌即可

## 安装

```bash
pnpm add file:../../blocks/im-chat-detail/frontend
```

`peerDependencies`：`react ^18`、`react-dom ^18`、`antd ^5`。

## 最小用法

```tsx
import { ConfigProvider, App as AntdApp } from 'antd';
import { ChatDetail } from '@chat/im-chat-detail';

function ChatPage({ peerId }: { peerId: string }) {
  return (
    <ConfigProvider><AntdApp>
      <div style={{ height: '100vh', maxWidth: 480, margin: '0 auto' }}>
        <ChatDetail
          config={{
            apiBaseUrl: 'http://localhost:8084',
            auth: {
              type: 'header',
              headerName: 'X-Dev-User-Id',
              getValue: () => MY_USER_ID,
            },
          }}
          peerId={peerId}
        />
      </div>
    </ConfigProvider></AntdApp>
  );
}
```

**重要**：
- 组件**占满父容器高度**（`height: 100%`）。父容器必须有明确高度
- 依赖 `<App>`（antd）的 message context
- `peerId` 改变时 hook 内部自动重建状态机，无需手动 key={peerId}

## 完整 API

### `<ChatDetail>`

| Prop | 类型 | 说明 |
|---|---|---|
| `config` | `BlockConfig` | ✅ 必填 |
| `peerId` | `Ulid` | ✅ 对端用户 ID |

### `BlockConfig`

```ts
interface BlockConfig {
  apiBaseUrl: string;          // 后端 base URL
  auth: Auth;                   // 必填——chat 写需登录
  pageSize?: number;            // 历史消息分页 limit，默认 30
}
```

### `useChat(config, peerId)` —— 自定义渲染时用

```ts
const chat = useChat(config, peerId);
// chat.peer, chat.me, chat.messages（asc 排序）, chat.wsConnected,
// chat.hasMore, chat.loading, chat.error,
// chat.loadMore(), chat.send({kind:'text', text}),
// chat.recall(id), chat.markRead(messageId)
```

### 工具函数

```ts
import { formatTime, formatDateLabel, formatLastSeen } from '@chat/im-chat-detail';
```

## 内部已经处理好的事项

- ✅ HTTP 客户端 + Problem+JSON 错误格式
- ✅ WebSocket 自动重连（指数退避）
- ✅ 3 类 WS 事件路由（message.new / message.updated / message.read）
- ✅ Cursor 分页（base64 编码，URL-safe）+ 向上滚动加载历史
- ✅ 自动滚到底部（新消息到达 + 初次加载）
- ✅ 自动标记已读（最新对方消息进入视口后调 markRead）
- ✅ 消息气泡：左右分发送者、自己蓝色 / 对方灰色、头像、时间戳、撤回按钮
- ✅ 已读 ✓✓ 蓝色高亮 / 已送达 ✓✓ 灰色 / 已发送 ✓
- ✅ 日期分隔（今天 / 昨天 / 周X / yyyy-MM-dd）
- ✅ Peer header：头像 + 在线状态点（绿/黄/灰）+ bio + last_seen
- ✅ Composer：自适应高度 textarea + ⌘/Ctrl+Enter 发送 + loading 状态
- ✅ 撤回消息展示"[消息已撤回]"占位
- ✅ 图片 / 文件类消息基本渲染（图片懒加载，文件展示 📎 + name）

## 严格禁止的反模式

- ❌ 自己 `fetch('/v1/messages')` 调消息列表
- ❌ 自己写 WS 连接 + 重连 + 事件路由
- ❌ 自己手撕气泡布局（左/右对齐 + 头像 + 时间戳）
- ❌ 自己实现状态指示符（✓ / ✓✓ / 已读颜色）
- ❌ 自己写"自动滚到底部"逻辑
- ❌ 自己 hard-code 撤回的"[消息已撤回]"占位
- ❌ 把 ChatDetail 放进无高度限定的容器（会 collapse）

## 与其他 block 的关系

| Block | 关系 |
|---|---|
| `@imcl/conversation-list` | 配对：list 显示所有会话，detail 显示一个会话内部消息流 |
| `@ui/top-navbar` | 组合：用 NavBar 包 ChatDetail 做带返回按钮的二级页面 |

```tsx
<NavBarPage title={peer?.name ?? '聊天'} onBack={() => router.back()}>
  <ChatDetail config={...} peerId={...} />
</NavBarPage>
```

## 状态

- v0.1 内部用
- 后端 13 tests 覆盖：peer 资料 / 鉴权 / 收发消息 / cursor 分页 /
  跨用户 404 / 已读 / 撤回（own / others' 拒绝）
- 前端 playwright 视觉验证：peer header / 消息气泡左右分发 / 已读 ✓✓ /
  撤回按钮 / 日期分隔 / composer 发送
- TODO：图片上传（含 presigned URL）、typing 指示、群聊扩展、消息编辑、消息搜索
