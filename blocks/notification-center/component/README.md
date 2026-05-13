# notification-center SDK

铃铛 + 角标 + 抽屉式通知中心。零数据所有权,host 给 `items` 与
`onMarkRead / onRemove / onLoadMore` 等回调。

```
component/
└── frontend/    NotificationCenter + NotificationItemView + SKILL.md
```

## 整体复制

```bash
cp -r blocks/notification-center/component your-project/sdk/ui-chrome/notification-center
```

## 最小用法

```tsx
import { NotificationCenter } from '@nc/notification-center';
import type { NotificationItem } from '@nc/notification-center';
import '@nc/notification-center/styles.css';

const items: NotificationItem[] = [
  {
    id: '1',
    type: 'info',
    title: '系统升级提醒',
    body: '将于今晚 23:00 进行系统升级,届时可能短暂不可用。',
    timestamp: '2026-05-13T12:30:00Z',
    read: false,
    action: { label: '查看公告', onClick: () => navigate('/announcement/2026-05') },
  },
  {
    id: '2',
    type: 'success',
    title: '订单已发货',
    body: '订单 #20240513001 已通过顺丰发货',
    timestamp: '2026-05-13T08:10:00Z',
    read: true,
    actor: { name: '订单系统', avatar: '/icons/order.png' },
  },
];

<NotificationCenter
  items={items}
  onMarkRead={(id) => markRead(id)}
  onMarkAllRead={() => markAllRead()}
  onRemove={(id) => remove(id)}
  onLoadMore={() => loadMore()}
  hasMore={true}
/>
```

放到 navbar 右槽:host 只把组件挂在 `top-navbar` 的 `right` slot,
默认 trigger(带角标的铃铛 button)就生效。

## 关键设计

- **trigger 默认是 bell + Badge**;`trigger` prop 允许 host 自定义(如悬浮于 hamburger 旁的特殊样式)
- **角标数**:`unreadCount` 显式传,或省略让内部按 `read === false` 计数
- **未读/已读分组**:抽屉内自动分组,各组带 sticky 标题 + 数量
- **类型化样式**:`info/success/warning/error/system` 对应不同 icon + 颜色
- **actor 优先**:有 `actor.avatar` 时展示头像,否则展示类型 icon
- **整 item 是 button**:点击 unread 项触发 `onMarkRead`(已读项不响应);键盘 Enter/Space 同效
- **操作按钮 stopPropagation**:`action.onClick` 和 remove 按钮不会冒泡触发整 item 的"标记已读"
- **a11y**:`role="region"` 容器 + 每项 `role="button" + aria-label`;抽屉自带 Esc 关闭

## pkg

| 资源 | 值 |
|---|---|
| frontend pkg | `@nc/notification-center` |
| 后端 | (无,host 自管) |
| 协议 | (无,host 自管 Notification schema) |

## 何时**不**用

- 短暂浮层提示(toast)→ antd `message` 或 `notification` API
- 弹窗确认 → antd `Modal.confirm`
- 全屏带状态机的消息中心独立页 → `master-detail` + `data-table` 拼
- IM 私信流 → `im-conversation-list`

## 完整 Props 见 SKILL.md
