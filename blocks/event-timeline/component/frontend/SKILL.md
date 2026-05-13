---
name: event-timeline-frontend
description: 事件流(audit log / 工单流转 / 订单事件 / 项目活动)必须用 `EventTimeline`,禁止自行 antd Timeline + groupBy + 颜色映射拼。
---

# `@et/event-timeline`

## 何时使用

凡满足以下任一条件,**必须**使用本 block 的 `EventTimeline`:

- 业务事件流(订单状态变迁 / 工单流转 / 项目活动 / git commit 流)
- 审计日志(audit log)+ 类型过滤 + 按日分组
- 用户/系统操作历史展示

## 何时**不**使用

- 聊天消息(双人/群) → `im-chat-detail`
- 通知中心 → `notification-center`
- 纯装饰时间轴(无 type,无分组) → antd `Timeline`
- 日历视图 → calendar(待建)

## 安装

```bash
pnpm add file:./sdk/ui-chrome/event-timeline/frontend
```

## 最小用法

```tsx
import { EventTimeline } from '@et/event-timeline';
import '@et/event-timeline/styles.css';

<EventTimeline
  items={events}
  typeMeta={{
    'order.created': { icon: <ShoppingCartOutlined />, color: '#1677ff', label: '下单' },
    'order.paid':    { icon: <CheckCircleOutlined />,  color: '#52c41a', label: '已付款' },
  }}
  groupBy="day"
  order="desc"
  showFilter
  onClickItem={(e) => navigate(`/audit/${e.id}`)}
/>
```

## 完整 Props

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `items` | `EventItem[]` | — | 事件列表(host 管) |
| `typeMeta` | `Record<EventType, EventTypeMeta>` | — | type → {icon, color, label} 字典 |
| `defaultColor` | `string` | `'#8c8c8c'` | 未知 type fallback |
| `groupBy` | `'none' \| 'day' \| 'month'` | `'day'` | 分组策略 |
| `order` | `'asc' \| 'desc'` | `'desc'` | 时序 |
| `filterTypes` | `EventType[]` | — | 受控过滤;省略 = 全部 |
| `onFilterTypesChange` | `(types) => void` | — | 受控配套 |
| `showFilter` | `boolean` | `false` | 是否显示 filter pills |
| `onClickItem` | `(item) => void` | — | item 可点击(整体 button) |
| `loading` | `boolean` | `false` | |
| `hasMore` | `boolean` | `false` | 决定是否显示加载更多 |
| `onLoadMore` | `() => void` | — | 加载更多 |
| `emptyState` | `ReactNode` | antd Empty | items 空 |
| `ariaLabel` | `string` | `'事件时间线'` | |
| `className` | `string` | — | |
| `height` | `string \| number` | `'100%'` | |

`EventItem`:`{ id, type, timestamp, title, body?, actor?, meta? }`

`EventTypeMeta`:`{ icon?, color?, label? }`

## 内部已经处理好的事项

- ✅ 时间戳解析容错:无效 timestamp 不进入分组
- ✅ "今天" / "昨天" / "YYYY-MM-DD" / "YYYY-MM" 智能 group label
- ✅ Sticky group headers + 灰底标签视觉
- ✅ Filter pills:基于 typeMeta keys 渲染 CheckableTag,checked 时背景上色
- ✅ 倒序 / 正序在 item 内部 sort,host 不需要预排
- ✅ Dot 颜色 ← typeMeta.color,icon ← typeMeta.icon(无图则空圆)
- ✅ actor.avatar 优先于 actor.name 渲染(头像 + 名称粗体)
- ✅ a11y:容器 aria-label、列表 role="list"、clickable item role="button" + tabIndex + Enter/Space

## 严格禁止的反模式

❌ **自己 antd Timeline + map**:本块就是为了消灭"groupBy / typeMeta / 过滤 pills"的重复

❌ **items 自行 sort 后传入**:本块内部 sort,host 重复 sort 浪费

❌ **typeMeta 在 render 内部新建对象**:每次新引用都触发 filter pills 重建;**用 useMemo 缓存或挂在常量**

❌ **想用本块做"双人聊天气泡"**:形态不同(IM 是气泡左右分发,本块是单列 dot 线);用 `im-chat-detail`

❌ **showFilter=true 不传 onFilterTypesChange**:filter pills 渲染但点击无效;**两个一起传**(受控)

❌ **改 sdk 内组件**:想加"按 actor 分组"→ 在 host 派生 items;真要大改请考虑是不是建新 block

## 状态

- v0.1 — 首版;后续可考虑:按 actor 分组、虚拟滚动、嵌套子事件、collapsible group
