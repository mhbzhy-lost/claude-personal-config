# commerce-product-list

电商商品瀑布流 business pattern block —— 端到端预制件，含
**前端组件 + 协议契约 + 后端服务**三层配对资产。

## 这个 block 解决的问题

你在做的应用需要"电商商品目录浏览 + 多维筛选 + 排序 + 收藏 + 加购"。
典型场景：

- 电商首页 / 分类页 / 搜索结果页
- 内容平台带购买入口的瀑布流
- 后台商品管理列表

支持匿名浏览（不登录也能看），登录后展示用户私有状态（收藏 / 购物车数量）。

## 何时**不**用这个 block（反向选型）

- IM 会话列表 → 用 [`im-conversation-list`](../im-conversation-list/)
- 订单列表 → 用 [`order-detail`](../order-detail/)
- 商品详情页（单实体 + 多媒体 + 规格） → 用 `commerce-product-detail`（待建）
- 购物车结算 → 用 `commerce-cart-checkout`（待建）
- 复杂 facet 聚合搜索 → 直连 Algolia / Elasticsearch
- < 10 件商品无筛选无排序 → 直接 antd `<Row>` + `<Col>` + `<Card>` 手写更短

## 你需要消费什么资源

### 1. 前端组件

```bash
pnpm add file:../path/to/blocks/commerce-product-list/frontend
```

```tsx
import { ConfigProvider, App as AntdApp } from 'antd';
import { ProductList } from '@cpl/product-list';

const CATEGORIES = [
  { value: 'electronics/phones', label: '手机' },
  { value: 'clothing/men', label: '男装' },
];

<ConfigProvider><AntdApp>
  <ProductList
    config={{
      apiBaseUrl: 'http://your-backend:8081',
      auth: {            // 可选，不传则匿名浏览
        type: 'header',
        headerName: 'X-Dev-User-Id',
        getValue: () => YOUR_USER_ID,
      },
      categories: CATEGORIES,
    }}
    onSelect={(p) => navigateTo(p.id)}
  />
</AntdApp></ConfigProvider>
```

**完整 API + 反模式禁令**：[`frontend/SKILL.md`](./frontend/SKILL.md)

### 2. 后端服务

```bash
docker run -d --name cpl-pg \
  -e POSTGRES_USER=cpl -e POSTGRES_PASSWORD=cpl -e POSTGRES_DB=cpl \
  -p 5545:5432 postgres:17-alpine
docker exec cpl-pg psql -U cpl -d cpl -c "CREATE DATABASE cpl_test OWNER cpl;"

cd blocks/commerce-product-list/backend
make install && make migrate
make seed-demo               # 100 products
make dev                     # uvicorn :8081
```

### 3. 协议契约（自实现后端时用）

- **OpenAPI**：[`protocol/openapi.yaml`](./protocol/openapi.yaml)
- **人类可读说明**：[`protocol/types.md`](./protocol/types.md)
- **TS 类型**：[`protocol/generated/openapi.ts`](./protocol/generated/openapi.ts)
- **zod + zodios**：[`protocol/generated/zodios.ts`](./protocol/generated/zodios.ts)

## 端口/前缀

| 资源 | 值 |
|---|---|
| backend HTTP | `:8081` |
| postgres | `:5545` |
| env prefix | `CPL_` |
| frontend pkg | `@cpl/product-list` |

## 这个 block 包含什么（开发者向）

```
commerce-product-list/
├── protocol/   OpenAPI + codegen + spectral lint
├── backend/    FastAPI 服务（5 endpoints / 16 tests / 69% coverage）
└── frontend/   React lib（<ProductList> + useProducts）
```
