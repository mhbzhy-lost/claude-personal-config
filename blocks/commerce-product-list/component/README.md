# commerce-product-list SDK

商品 grid / 瀑布流 SDK——整个 `component/` 目录拷贝到目标项目即可用。
匿名可读，登录后出现收藏 / 加购按钮。

```
component/
├── frontend/    ProductList / ProductCard / FilterBar + useProducts hook
├── backend/     FastAPI + offset 分页 + per-user 状态（is_favorite / cart_count）
└── protocol/    OpenAPI + 生成 TS 类型
```

## 整体复制

```bash
cp -r blocks/commerce-product-list/component your-project/sdk/products
```

## 前端

```tsx
import { ConfigProvider, App as AntdApp } from 'antd';
import { ProductList } from '@cpl/product-list';
import '@cpl/product-list/styles.css';

<ConfigProvider><AntdApp>
  <ProductList
    config={{
      apiBaseUrl: 'http://your-backend:8081',
      // 匿名 OK；登录后传 auth 触发收藏/加购 UI
      auth: USER_ID ? { type: 'header', headerName: 'X-Dev-User-Id', getValue: () => USER_ID } : undefined,
      categories: [{ value: 'phone', label: '手机' }, { value: 'laptop', label: '笔记本' }],
    }}
    onSelect={(p) => navigate(`/product/${p.id}`)}
  />
</AntdApp></ConfigProvider>
```

完整 API 见 `frontend/SKILL.md`。

## 后端

```bash
cd sdk/products/backend
uv venv && uv pip install -e '.[dev]'
uv run alembic upgrade head
uv run uvicorn app.main:app --port 8081
```

## 协议

```ts
import type { components } from './sdk/products/protocol/generated/openapi';
type Product = components['schemas']['Product'];
```

## 关键设计

- **匿名可读**：未传 auth 时 `user_state` 为 null，前端隐藏收藏/加购按钮
- **offset 分页**：page + page_size（商品稳定排序，churn 不高，用 offset 而非 cursor）
- **per-user 状态**：`user_product_state` 表，`is_favorite` 布尔 + `cart_count` 数值
- **服务端独裁排序**：sort key 由后端决定（price_asc / sold_desc / rating_desc / created_desc）

## 端口/前缀

| 资源 | 值 |
|---|---|
| backend HTTP | `:8081` |
| postgres | `:5545` |
| env prefix | `CPL_` |
| frontend pkg | `@cpl/product-list` |

## 何时**不**用

- 单品详情页 → 待建 `product-detail`
- 购物车结算 → 待建 `cart-checkout`
- 订单详情 → `order-detail`
- 会话列表 → `im-conversation-list`
