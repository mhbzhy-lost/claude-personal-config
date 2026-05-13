# event-timeline SDK

事件流时间轴 UI chrome:**type → meta schema 化 + 按日/月分组 +
sticky 标题 + 类型过滤 pills + 倒/正序 + load-more**。

```
component/
└── frontend/    EventTimeline + utils + SKILL.md
```

## 整体复制

```bash
cp -r blocks/event-timeline/component your-project/sdk/ui-chrome/event-timeline
```

## 最小用法

```tsx
import { EventTimeline } from '@et/event-timeline';
import type { EventItem } from '@et/event-timeline';
import { CheckCircleOutlined, ShoppingCartOutlined, RocketOutlined } from '@ant-design/icons';
import '@et/event-timeline/styles.css';

const typeMeta = {
  'order.created': { icon: <ShoppingCartOutlined />, color: '#1677ff', label: '下单' },
  'order.paid':    { icon: <CheckCircleOutlined />,  color: '#52c41a', label: '已付款' },
  'order.shipped': { icon: <RocketOutlined />,       color: '#fa8c16', label: '发货' },
};

const items: EventItem[] = [
  { id: 'e1', type: 'order.created', timestamp: '2026-05-13T08:01:00Z', title: '订单 #20240513001 创建' },
  { id: 'e2', type: 'order.paid',    timestamp: '2026-05-13T08:02:30Z', title: '微信支付 ¥199.00' },
  { id: 'e3', type: 'order.shipped', timestamp: '2026-05-13T12:30:00Z', title: '顺丰发货', body: '运单号 SF1234567890' },
];

<EventTimeline
  items={items}
  typeMeta={typeMeta}
  groupBy="day"
  order="desc"
  showFilter
  onClickItem={(e) => navigate(`/audit/${e.id}`)}
/>
```

## 关键设计

- **EventItem schema**:`{ id, type, timestamp, title, body?, actor?, meta? }`;`type` 是 host 自由命名(订单 / 工单 / commit 类型等)
- **typeMeta 字典**:`type → {icon, color, label}`,一份配置全局生效
- **按日 / 月分组**:`groupBy='day'`(默认)生成"今天 / 昨天 / 2026-05-12 / 2026-05" sticky 标题;`'none'` 不分组(平铺)
- **过滤 pills**(可选):`showFilter` 打开后,基于 `typeMeta` 的 keys 渲染 CheckableTag;受控传 `filterTypes + onFilterTypesChange`
- **倒序/正序**:`order='desc'`(默认,新在上);`'asc'` 早在上(适配 audit log 时序)
- **可点击 item**:传 `onClickItem` 后 item 整体成 `role="button"` + 键盘 + 高亮
- **a11y**:容器 `aria-label`;item 列表 `role="list"`,clickable item `role="button"` + Enter/Space

## pkg

| 资源 | 值 |
|---|---|
| frontend pkg | `@et/event-timeline` |
| 后端 | (无,host 自管) |
| 协议 | (无,host 自定 EventItem schema) |

## 何时**不**用

- 聊天消息(双人/群) → `im-chat-detail`
- 通知中心(铃铛 + 角标 + 抽屉) → `notification-center`
- 纯装饰性时间轴(无事件类型 / 不分组) → antd `Timeline`
- 复杂日历视图(月/周/日切换) → 找 calendar 方案

## 完整 Props 见 SKILL.md
