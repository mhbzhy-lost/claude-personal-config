# order-detail SDK

订单列表 + 详情 SDK——状态机驱动（pending → paid → shipped → delivered），
取消 / 申请退款由 Modal 二次确认。

```
component/
├── frontend/    OrderList + OrderDetail + OrderMasterDetail + StatusBadge + StatusTimeline
├── backend/     FastAPI + 状态机校验 + 退款流程
└── protocol/    OpenAPI + 生成 TS 类型
```

## 整体复制

```bash
cp -r blocks/order-detail/component your-project/sdk/orders
```

如需开箱即用的"左列表 + 右详情"双栏，**还需要一并拷贝 `master-detail` block**：

```bash
cp -r blocks/master-detail/component your-project/sdk/master-detail
```

## 前端

### 双栏（推荐）——一行接入

```tsx
import { ConfigProvider, App as AntdApp } from 'antd';
import { OrderMasterDetail } from '@od/order-detail';
import '@od/order-detail/styles.css';
import '@md/master-detail/styles.css';

<ConfigProvider><AntdApp>
  <OrderMasterDetail config={config} />
</AntdApp></ConfigProvider>
```

`OrderMasterDetail` 内部组合 `@md/master-detail` 的响应式 split/stack 壳：
宽屏左右双栏、窄屏栈式 + 返回按钮，全部内置。**前提是 host 已经把
`master-detail` block 也拷过来**。

### 单独使用 list / detail

如果你想自己控制布局（例如详情走独立路由页），直接挂裸组件：

```tsx
const [selectedId, setSelectedId] = useState(null);

<OrderList
  config={config}
  selectedId={selectedId}
  onSelect={(o) => setSelectedId(o.id)}
/>
<OrderDetail config={config} orderId={selectedId} />
```

`OrderList`、`OrderDetail` 是无侵入入口；`OrderMasterDetail` 是封好的
双栏页面，三个层级按需选。`frontend/SKILL.md` 有完整 props。

## 后端

```bash
cd sdk/orders/backend
uv venv && uv pip install -e '.[dev]'
uv run alembic upgrade head
uv run uvicorn app.main:app --port 8082
```

## 协议

```ts
import type { components } from './sdk/orders/protocol/generated/openapi';
type Order = components['schemas']['OrderDetail'];
```

## 关键设计

- **状态机校验**：`cancel` 只允许 `pending` 状态；`request_refund` 只允许已付款后
- **OrderItem 嵌套**：详情含 items 数组，每个 item 关联 product_id
- **必登录**：所有路由都要 auth；订单天然 per-user
- **退款流程**：req → approved/rejected，记录 refund reason
- **服务端状态推断**：`status` + `events` 时间线由服务端维护

## 端口/前缀

| 资源 | 值 |
|---|---|
| backend HTTP | `:8082` |
| postgres | `:5546` |
| env prefix | `OD_` |
| frontend pkg | `@od/order-detail` |

## 何时**不**用

- 商品列表 → `commerce-product-list`
- 购物车结算 → 待建 `cart-checkout`
- 第三方支付（支付宝/微信）→ host 侧职责，不在 block 内
