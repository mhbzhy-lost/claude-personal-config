# order-detail SDK

订单列表 + 详情 SDK——状态机驱动（pending → paid → shipped → delivered），
取消 / 申请退款由 Modal 二次确认。

```
component/
├── frontend/    OrderList + OrderDetail + StatusBadge + StatusTimeline
├── backend/     FastAPI + 状态机校验 + 退款流程
└── protocol/    OpenAPI + 生成 TS 类型
```

## 整体复制

```bash
cp -r blocks/order-detail/component your-project/sdk/orders
```

## 前端

```tsx
import { ConfigProvider, App as AntdApp } from 'antd';
import { OrderList, OrderDetail } from '@od/order-detail';
import '@od/order-detail/styles.css';

const [selectedId, setSelectedId] = useState(null);

<ConfigProvider><AntdApp>
  <div style={{ display: 'flex' }}>
    <OrderList
      config={config}
      selectedId={selectedId}
      onSelect={(o) => setSelectedId(o.id)}
    />
    <OrderDetail config={config} orderId={selectedId} />
  </div>
</AntdApp></ConfigProvider>
```

两个组件解耦——你可以只挂 OrderList（路由跳详情页）、只挂 OrderDetail
（深链直达）或并列双栏布局。`frontend/SKILL.md` 有完整 props。

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
