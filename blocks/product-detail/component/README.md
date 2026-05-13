# product-detail SDK

商品详情页 SDK——**前端形态完整 + 后端 stub mock**。

```
component/
├── frontend/    ProductDetail 组件 + useProductDetail hook + SKILL.md
├── backend/     FastAPI + stub /v1/products/:id (mock 返回 Sony A7M4)
└── protocol/    OpenAPI 占位(完整 schema 待 host 扩展)
```

## 定位:形态参考 + 可启动壳

**前端层**:`ProductDetail` 是一个完整的形态参考——图廊(覆盖图 + 缩略图)
+ 标题/副标题/评分 + SKU 单选 + 库存状态 + 数量 + 加购/立即购买 +
评价列表 + 商品介绍区。开箱可用。

**后端层**:`GET /v1/products/:id` 返回 canned mock(Sony A7M4 商品 +
3 张图 + 3 个 SKU + 2 条评价),让 host 拷贝后立即可 `make install &&
make dev` 启动,与前端对接验证。**完整业务规则**(库存扣减 / 订单 /
支付 / SKU 状态机 / 评价审核)host 在拷贝后扩展(`block-driven-development`
skill 的 Phase 5.3 fork 路径)。

## 整体复制

```bash
cp -r blocks/product-detail/component your-project/sdk/product-detail
```

## 三层接入

### 1. 前端

```bash
pnpm add file:./sdk/product-detail/frontend
```

```tsx
import { ProductDetail } from '@pd/product-detail';
import '@pd/product-detail/styles.css';

<ProductDetail
  config={{ apiBaseUrl: 'http://localhost:8086' }}
  productId="01JBPRODDEMO001"
  onAddToCart={(sku, qty) => addToCart(sku.id, qty)}
  onBuyNow={(sku, qty) => goPay(sku.id, qty)}
/>
```

或直接传 `data`(host 自管 fetch):

```tsx
<ProductDetail data={myProduct} onAddToCart={...} />
```

### 2. 后端

```bash
cd sdk/product-detail/backend
uv venv && uv pip install -e '.[dev]'
uv run uvicorn app.main:app --port 8086
```

会得到:
- `GET /v1/products/01JBPRODDEMO001` → mock Sony A7M4 详情
- `GET /v1/products` → 单条 mock 列表
- `GET /v1/me` + `/healthz`(scaffold 默认,继承通用基础设施)

数据库:postgres 端口 5550(虽然 stub 不写表,但 scaffold 把 alembic /
config 等通用底盘留齐,host 加 models 后 `alembic revision --autogenerate`
即可)。

### 3. 协议

`protocol/openapi.yaml` 是 placeholder。host 填充完整 schema 后跑
`make gen` 出 TS 类型。

## 端口/前缀

| 资源 | 值 |
|---|---|
| backend HTTP | `:8086` |
| postgres | `:5550` |
| env prefix | `PD_` |
| frontend pkg | `@pd/product-detail` |

## 何时**不**用

- 商品列表 → `commerce-product-list`
- 订单状态详情 → `order-detail`
- 支付集成 → host 自管
- 购物车结算流程 → 待建 `cart-checkout`
