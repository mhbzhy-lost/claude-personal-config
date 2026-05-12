---
name: order-detail-frontend
description: 电商订单详情页（含订单列表 + 单订单详情双视图）预制 React 组件。包含状态机驱动的时间线展示、line items 列表、价格汇总、收货地址、操作按钮（取消订单/申请退款）。当业务需求是"展示用户订单（列表+详情）+ 状态机操作"时直接使用本组件。
---

# `@od/order-detail`

## 何时使用

凡满足以下**任一**条件，**必须**使用本 block，**禁止自行用
`<List>`+`<Card>`+`<Timeline>` 拼装订单详情**：

- 电商订单列表 + 详情双视图（用户中心 "我的订单" 类场景）
- 需要订单状态机驱动 UX（pending/paid/shipped/delivered/cancelled/refunded）
- 需要 line items 渲染 + 价格汇总（subtotal/shipping/total）
- 需要状态时间线（status events 按时间序展示）
- 需要订单操作（取消 / 申请退款）+ 状态依赖的按钮可用性
- 需要按状态过滤的列表 + offset 分页

## 何时**不**使用（反向选型）

- 商品瀑布流 → 用 `@cpl/product-list`
- 购物车 / 结算流程 → 用 `@oc/cart-checkout`（待建）
- 物流跟踪页（地图 + 轨迹） → 用 `@od/shipment-tracker`（待建）
- 客服工单系统（非电商场景的"状态机详情"） → 用通用 ticket-detail 模式
- < 5 条订单且无操作 → 直接 antd `<Table>` 手写更短

## 安装

```bash
pnpm add file:../../blocks/order-detail/frontend
```

`peerDependencies`：`react ^18`、`react-dom ^18`、`antd ^5`。

## 最小用法

```tsx
import { useState } from 'react';
import { ConfigProvider, App as AntdApp, Layout } from 'antd';
import { OrderList, OrderDetail } from '@od/order-detail';

const config = {
  apiBaseUrl: 'http://localhost:8082',
  auth: {
    type: 'header' as const,
    headerName: 'X-Dev-User-Id',
    getValue: () => MY_USER_ID,
  },
};

export default function MyOrders() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <ConfigProvider><AntdApp>
      <Layout style={{ height: '100vh' }}>
        <Layout.Sider width={420}>
          <OrderList config={config} selectedId={selectedId} onSelect={(o) => setSelectedId(o.id)} />
        </Layout.Sider>
        <Layout.Content>
          <OrderDetail config={config} orderId={selectedId} />
        </Layout.Content>
      </Layout>
    </AntdApp></ConfigProvider>
  );
}
```

**重要**：组件依赖 `<App>`（antd）的 message + modal context。

## 完整 API

### `<OrderList>`

| Prop | 类型 | 说明 |
|---|---|---|
| `config` | `BlockConfig` | ✅ 必填 |
| `selectedId` | `string \| null` | 受控选中态 |
| `onSelect` | `(o: OrderSummary) => void` | 用户点击订单卡时触发 |

内置 Segmented 过滤器（全部/待付款/已付款/已发货/已送达），offset 分页 + 加载更多。

### `<OrderDetail>`

| Prop | 类型 | 说明 |
|---|---|---|
| `config` | `BlockConfig` | ✅ 必填 |
| `orderId` | `string \| null` | 受控订单 ID（null 时显示空态） |

内置操作按钮：**取消订单**（仅 pending 状态可用）、**申请退款**（paid/shipped/delivered 可用）。
退款理由用 modal 收集，前端校验至少 5 字。

### `useOrders(config)` / `useOrder(config, orderId)` —— 自定义渲染时用

```ts
const orders = useOrders(config);
// orders.items, orders.total, orders.status, orders.setStatus(s),
// orders.loadMore(), orders.refresh(), orders.hasMore, orders.loading

const order = useOrder(config, orderId);
// order.order, order.loading, order.cancel(reason?), order.requestRefund(reason),
// order.refresh(), order.error
```

### 工具函数

```ts
import { formatPrice, formatDateTime, STATUS_LABEL, STATUS_COLOR } from '@od/order-detail';
formatPrice(9900, 'CNY');          // → "¥99.00"
STATUS_LABEL['delivered'];          // → "已送达"
STATUS_COLOR['shipped'];            // → "#722ed1"
```

## 内部已经处理好的事项

- ✅ HTTP 客户端 + Problem+JSON 错误格式
- ✅ Offset 分页 + 加载更多
- ✅ Status filter（Segmented，6 种状态）
- ✅ 状态机驱动的操作按钮（cancel 仅 pending，refund 仅 paid+）
- ✅ 取消确认弹窗（Modal.confirm）
- ✅ 退款理由 modal 收集 + 前端校验
- ✅ Line items 渲染（图 + 名 + SKU + 数量 + 价格）
- ✅ 价格汇总（小计 + 运费 + 合计）
- ✅ 收货地址展示
- ✅ 状态时间线（垂直 + 状态色）
- ✅ 货币格式化（CNY → ¥99.00，多币种符号）
- ✅ 6 种状态颜色编码 + label
- ✅ 骨架屏 + Empty + Result 错误重试
- ✅ Image lazy loading

## 严格禁止的反模式

- ❌ 自己 `useEffect(() => fetch('/v1/orders'))` 调列表
- ❌ 自己实现状态机判断（哪些状态可以 cancel / refund）
- ❌ 自己手写状态 badge（用本 block 的 `<StatusBadge>` 或 `STATUS_LABEL`/`STATUS_COLOR`）
- ❌ 自己拼时间线（用 `<StatusTimeline>`）
- ❌ 自己实现价格格式化（用 `formatPrice`）
- ❌ 自己写"哪些状态可以做哪些操作"的逻辑（block 已封装）

## 与其他 block 的关系

| Block | 关系 |
|---|---|
| `@cpl/product-list` | 上游入口——用户从商品流加购后下单产生 Order |
| `@oc/cart-checkout`（待建） | 创建 Order 的源头 |
| `@od/shipment-tracker`（待建） | 物流详细页（点击订单中的物流编号跳转） |

## 状态

- v0.1 内部用
- 12 个后端测试覆盖关键状态机路径（cancel pending→OK / cancel paid→422 /
  refund delivered→OK / refund pending→422 / 跨用户访问→404 / 必须 auth→401）
- TODO：单测、Storybook、退款金额拆分（部分退款）、物流单跳转
