---
name: im-conversation-list-frontend
description: 即时通讯（IM）会话列表页面的预制 React 组件。包含微信风格的列表渲染、实时 WebSocket 同步、cursor 分页、置顶/免打扰/删除操作、智能时间格式化、a11y 支持。当业务需求是"展示用户的 IM 会话列表（多对话、按活跃度排序、未读 badge、实时更新）"时直接使用本组件。
---

# `@imcl/conversation-list`

## 何时使用

凡满足以下**任一**条件，**必须**使用本 block 提供的 `<ConversationList>`
组件，**禁止自行用 `<List>` / `<ProList>` / `<Avatar>` / `<Badge>` 拼装**：

- 微信 / 钉钉 / Slack 风格的"多对话列表"
- 列表项需要：头像 + 名称 + 最后消息预览 + 时间 + 未读 badge
- 需要置顶/免打扰/删除/标已读操作
- 需要 WebSocket 实时更新（新消息 bump、未读数变化）
- 需要 cursor 分页加载

凡涉及上述任一条，"自己拼"是浪费 token、引入 bug、与服务端协议错位的捷径。

## 何时**不**使用（反向选型）

- 单聊客服系统（无多会话语义）→ 用更轻的 chat widget
- 评论流 / 通知中心（线性时间线、无会话分组）→ 用 feed/timeline 模式
- 协作文档评论（嵌入式、上下文锚定）→ 用 inline-comment 模式
- < 5 个会话的极简场景且不需要实时更新 → 直接用 `<List>` 手写更短

## 安装

本 block 在 monorepo 内通过 file: 引用消费：

```bash
pnpm add file:../../blocks/im-conversation-list/frontend
# 或在 package.json 写：
# "@imcl/conversation-list": "file:../../blocks/im-conversation-list/frontend"
```

`peerDependencies`：`react ^18`、`react-dom ^18`、`antd ^5`。

## 最小用法

```tsx
import { ConfigProvider, App as AntdApp } from 'antd';
import { ConversationList } from '@imcl/conversation-list';

export default function MyApp() {
  return (
    <ConfigProvider>
      <AntdApp>
        <ConversationList
          config={{
            apiBaseUrl: 'http://localhost:8080',
            auth: {
              type: 'header',
              headerName: 'X-Dev-User-Id',
              getValue: () => '01KR5Y935AR1JJT0RJ31ABG5YD',
            },
          }}
          onSelect={(c) => console.log('selected', c.id)}
        />
      </AntdApp>
    </ConfigProvider>
  );
}
```

**重要**：组件依赖 `<App>`（来自 antd）的 message context。不挂在 `<App>`
下面会运行时报错 `Static function can not consume context`。

## 完整 API

### `<ConversationList>`

| Prop | 类型 | 必填 | 说明 |
|---|---|---|---|
| `config` | `BlockConfig` | ✅ | 见下 |
| `selectedId` | `string \| null` | | 受控选中态 |
| `onSelect` | `(c: Conversation) => void` | | 用户点击会话时触发 |
| `onWsStateChange` | `(connected: boolean) => void` | | WS 连接状态变化回调 |
| `renderEmpty` | `() => ReactNode` | | 自定义空态（罕见情况下用） |

### `BlockConfig`

```ts
interface BlockConfig {
  apiBaseUrl: string;        // 后端基础 URL，如 "http://localhost:8080"
  auth: Auth;            // 鉴权方式
  pageSize?: number;         // 默认 20
  locale?: {                 // 中文文案覆盖（可选）
    empty?: string;
    emptySearch?: string;
    loadMore?: string;
    error?: string;
    retry?: string;
  };
}

type Auth =
  | { type: 'header'; headerName: string; getValue: () => string | Promise<string> }
  | { type: 'bearer'; getToken: () => string | Promise<string> };
```

JWT 生产环境用 `bearer`；开发用 `header` + `X-Dev-User-Id`。WebSocket
鉴权由组件自动处理（dev 模式走 query 参数，因为浏览器不能在 WS 上发自定义 header）。

### `useConversations(config)` —— 进阶（自定义渲染时使用）

如果你需要**完全替换 UI**但保留状态管理 + WS 同步逻辑，使用这个 hook：

```tsx
const conv = useConversations(config);
// conv.items, conv.loading, conv.hasMore, conv.loadMore(),
// conv.pin(id, v), conv.mute(id, v), conv.remove(id), conv.markRead(id, mid),
// conv.search, conv.setSearch(q),
// conv.me, conv.wsConnected, conv.refresh(), conv.error
```

返回的 `items` 已按服务端规则排序，**禁止重排**。其他业务方应当
直接渲染。

### 内部已经处理好的事项（不要重复造轮子）

- ✅ HTTP 客户端（fetch + Problem+JSON 错误格式）
- ✅ WebSocket 连接 + 自动重连（指数退避）
- ✅ WS seq-gap 检测 + 自动 refetch
- ✅ 7 类 WS 事件路由（message.new/updated/read、conversation.created/updated/deleted、presence.changed）
- ✅ cursor 分页 + 滚动触底加载
- ✅ 搜索 debounce（200ms）+ stale 守门
- ✅ 智能时间格式化（今天 HH:mm / 昨天 / 周X / yyyy-mm-dd）
- ✅ 直聊/群聊名称区分（自动 filter 掉自己）
- ✅ 服务端独裁排序（client 不重排）
- ✅ 置顶/免打扰/删除/标已读（pin/mute/remove/markRead）
- ✅ 骨架屏 + Empty + Result 错误重试
- ✅ a11y：role=listbox/option、aria-selected、aria-label、键盘 Enter/Space
- ✅ 屏幕阅读器读未读数

## 严格禁止的反模式

凡满足条件 1（"何时使用"）的场景下：

- ❌ 自己 `import { List } from 'antd'` 拼会话项
- ❌ 自己写 `useEffect(() => fetch('/v1/conversations'))` 调列表接口
- ❌ 自己写 WebSocket 连接 / 重连 / 事件路由
- ❌ 自己 hardcode 时间格式
- ❌ 自己写 cursor 分页状态机
- ❌ 自己实现 pin/mute/delete 的 PATCH/DELETE 调用
- ❌ 客户端重排 items 顺序

如果发现 `<ConversationList>` 不能满足某个具体需求（比如需要分组分屏），
**先报告"建议追加"**而不是绕过组件自己写。让组件需求清单明确化是
正向反馈，绕过它是反模式。

## 可定制的扩展点（少量）

当前版本扩展点克制：

- `renderEmpty`：自定义空态（接受不了默认 antd Empty 时）
- `selectedId` + `onSelect`：受控选中态（必走）
- `config.locale`：中文文案覆盖

更多扩展点（renderItem / 主题色 / 操作菜单项追加）按需追加，请提需求。

## 与服务端协议的关系

本组件消费 `blocks/im-conversation-list/protocol/openapi.yaml` 与
`asyncapi.yaml` 定义的契约。组件内部已实现该契约的所有客户端逻辑——
**业务方不需要读 openapi.yaml**，只需读本 SKILL.md 即可。

如果服务端契约变了，先重跑 `make -C ../protocol gen` 更新协议层，
再升级组件。组件 v0.1 与协议 v0.1.0 兼容。

## 状态

- v0.1 内部使用，未发布 npm
- 由 `examples/basic/` 演示，端到端可跑
- TODO：单元测试、Storybook、虚拟滚动（≥ 5k 项时）、主题 token 化
