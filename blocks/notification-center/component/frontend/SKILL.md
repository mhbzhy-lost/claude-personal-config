---
name: notification-center-frontend
description: 站内通知中心(铃铛+角标+抽屉+分组列表+已读/删除)必须用 `NotificationCenter`,禁止自行 Badge + Drawer + List + useState 拼。
---

# `@nc/notification-center`

## 何时使用

凡满足以下任一条件,**必须**使用本 block 的 `NotificationCenter`:

- 需要站内通知入口(navbar 右侧铃铛)+ 角标 + 抽屉列表
- 通知有"未读/已读"状态,需要分组展示和"标记已读"行为
- 通知有类型化样式(info/success/warning/error/system)
- 需要单条删除 + 全部已读 + 加载更多组合

## 何时**不**使用

- 短暂浮层提示(操作反馈)→ antd `message` 或 `notification` API
- 弹窗确认 → antd `Modal.confirm`
- 全屏带筛选的消息中心独立页 → `master-detail` + `data-table` 拼
- IM 私信 / 会话列表 → `im-conversation-list`

## 安装

```bash
pnpm add file:./sdk/ui-chrome/notification-center/frontend
```

## 最小用法

```tsx
import { NotificationCenter } from '@nc/notification-center';
import '@nc/notification-center/styles.css';

<NotificationCenter
  items={items}
  onMarkRead={(id) => markRead(id)}
  onMarkAllRead={() => markAllRead()}
  onRemove={(id) => remove(id)}
/>
```

## 完整 Props

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `items` | `NotificationItem[]` | — | 当前列表(host 全量管理) |
| `loading` | `boolean` | `false` | 初次加载或 load-more 中 |
| `unreadCount` | `number` | derived | 显式覆盖角标数 |
| `onMarkRead` | `(id) => void` | — | 单条标已读(**必填**) |
| `onMarkAllRead` | `() => void` | — | 全部已读(省略则不展示按钮) |
| `onRemove` | `(id) => void` | — | 单条删除(省略则不展示按钮) |
| `onLoadMore` | `() => void` | — | 加载更多(省略则不展示按钮) |
| `hasMore` | `boolean` | `false` | 决定是否显示"加载更多" |
| `open` | `boolean` | — | 受控抽屉开关(默认内部) |
| `onOpenChange` | `(o) => void` | — | 受控时配套 |
| `placement` | `'left' \| 'right'` | `'right'` | 抽屉方向 |
| `width` | `number` | `380` | 抽屉宽 px |
| `emptyState` | `ReactNode` | antd Empty | items 为空 |
| `drawerTitle` | `ReactNode` | `'通知'` | 抽屉标题 |
| `trigger` | `ReactNode` | 默认 bell+Badge | 自定义触发器 |
| `ariaLabel` | `string` | `'打开通知中心'` | bell aria |
| `className` | `string` | — | 抽屉根类 |

`NotificationItem`:`{ id, type, title, body?, timestamp, read, actor?, action? }`

`NotificationType`:`'info' | 'success' | 'warning' | 'error' | 'system'`

## 内部已经处理好的事项

- ✅ 角标数自动 derive(items 中 `read === false` 计数,可被 `unreadCount` 覆盖)
- ✅ 未读 / 已读自动分组 + sticky 组标题 + 各组数量
- ✅ 类型化 icon + 颜色映射(5 种)
- ✅ `actor.avatar` 优先于 type icon(用户主动行为通知)
- ✅ 整 item 为 button + Enter/Space + aria-label
- ✅ 内部按钮(action / remove)stopPropagation 不冒泡触发 markRead
- ✅ 智能时间格式("刚刚" / "5 分钟前" / "今天 14:30" / "昨天" / 日期)
- ✅ Drawer Esc 关闭(antd 自带)
- ✅ 未读视觉强化:背景色 + 红点

## 严格禁止的反模式

❌ **自己拼 Badge + Drawer + List**:本块就是为了消灭这种重复;每次手写都漏分组 / 未读样式 / 键盘

❌ **点击 item 时同时调 onMarkRead 和 navigate**:item 整体 onClick 只触发 markRead(且仅 unread 项);**跳转走 `action.onClick` 或 host 用 trigger 自定义包一层**

❌ **`Notification.body` 塞超长文本**:本块 `body` CSS 限制最多 2 行 line-clamp,长内容应放在 `action` 跳转到详情页

❌ **依赖默认 trigger 的同时又传 `open` 受控**:同时控制会冲突;选其一(若用 `trigger`,通常不需要 `open`)

❌ **改 sdk 内部组件**:想换分组排序(如 type)→ 在 host 自己排好 items 再喂入;真要大改请考虑是不是建新 block

## 状态

- v0.1 — 首版;后续可考虑:按类型筛选、批量删除、虚拟滚动、不同 type 的 muted 设置、WebSocket 实时推送 hook
