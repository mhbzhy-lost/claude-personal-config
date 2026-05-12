# order-detail

电商订单详情 business pattern block —— 端到端预制件，含
**前端组件 + 协议契约 + 后端服务**三层配对资产。

## 这个 block 解决的问题

你在做的应用需要"用户订单列表 + 单订单详情 + 状态机驱动的操作
（取消订单 / 申请退款）"。典型场景：

- 用户中心"我的订单"页（列表 + 详情双视图）
- 客服后台订单查询 + 处理
- 任何含 `pending → paid → shipped → delivered`（+ `cancelled` / `refunded` 分支）状态机的"业务记录详情"页

## 何时**不**用这个 block（反向选型）

- IM 会话列表 → 用 [`im-conversation-list`](../im-conversation-list/)
- 商品瀑布流 → 用 [`commerce-product-list`](../commerce-product-list/)
- 物流跟踪页（地图 + 轨迹） → 用 `shipment-tracker`（待建）
- 购物车结算 → 用 `commerce-cart-checkout`（待建）
- 客服工单（非订单语义的状态机） → 用通用 ticket-detail 模式
- < 5 条订单且无操作 → 直接 antd `<Table>` 手写更短

## 你需要消费什么资源

### 1. 前端组件

```bash
pnpm add file:../path/to/blocks/order-detail/frontend
```

```tsx
import { useState } from 'react';
import { ConfigProvider, App as AntdApp, Layout } from 'antd';
import { OrderList, OrderDetail } from '@od/order-detail';

const config = {
  apiBaseUrl: 'http://your-backend:8082',
  auth: {
    type: 'header' as const,
    headerName: 'X-Dev-User-Id',
    getValue: () => YOUR_USER_ID,
  },
};

function MyOrders() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <ConfigProvider><AntdApp>
      <Layout style={{ height: '100vh' }}>
        <Layout.Sider width={420}>
          <OrderList
            config={config}
            selectedId={selectedId}
            onSelect={(o) => setSelectedId(o.id)}
          />
        </Layout.Sider>
        <Layout.Content>
          <OrderDetail config={config} orderId={selectedId} />
        </Layout.Content>
      </Layout>
    </AntdApp></ConfigProvider>
  );
}
```

组件已内置：状态过滤（Segmented）、状态色编码、价格汇总、收货地址、
状态时间线、Modal 确认取消、Modal 收集退款理由。

**完整 API + 反模式禁令**：[`frontend/SKILL.md`](./frontend/SKILL.md)

### 2. 后端服务

```bash
docker run -d --name od-pg \
  -e POSTGRES_USER=od -e POSTGRES_PASSWORD=od -e POSTGRES_DB=od \
  -p 5546:5432 postgres:17-alpine
docker exec od-pg psql -U od -d od -c "CREATE DATABASE od_test OWNER od;"

cd blocks/order-detail/backend
make install && make migrate
make seed-demo               # 20 orders, mixed statuses
make dev                     # uvicorn :8082
```

### 3. 协议契约（自实现后端时用）

- **OpenAPI**：[`protocol/openapi.yaml`](./protocol/openapi.yaml)
- **人类可读说明**：[`protocol/types.md`](./protocol/types.md)
- **TS 类型**：[`protocol/generated/openapi.ts`](./protocol/generated/openapi.ts)
- **zod + zodios**：[`protocol/generated/zodios.ts`](./protocol/generated/zodios.ts)

后端状态机约束（自实现时必须保留）：
- `cancel` 仅 `pending` 可调
- `refund` 仅 `paid / shipped / delivered` 可调
- 跨用户访问订单 → 404（不是 403，避免信息泄漏）

## 端口/前缀

| 资源 | 值 |
|---|---|
| backend HTTP | `:8082` |
| postgres | `:5546` |
| env prefix | `OD_` |
| frontend pkg | `@od/order-detail` |

## 这个 block 包含什么（开发者向）

```
order-detail/
├── protocol/   OpenAPI + codegen + spectral lint
├── backend/    FastAPI 服务（5 endpoints / 12 tests / 状态机校验）
└── frontend/   React lib（<OrderList> + <OrderDetail> + StatusTimeline）
```
