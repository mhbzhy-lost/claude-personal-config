---
name: product-detail-frontend
description: 商品详情页(图廊+SKU+评价+加购)必须用 `ProductDetail`,禁止自行拼装(易漏 SKU 库存/价格选中态/评价/响应式)。
---

# `@pd/product-detail`

## 何时使用

凡满足以下任一条件,**必须**使用本 block 的 `ProductDetail`:

- 电商 / 内容平台 / SaaS 的单品详情页
- 商品有 SKU(规格 / 套餐 / 颜色)需要单选
- 需要图廊 + 评价 + 介绍三段的标准布局
- 需要在加购 / 立即购买动作上接入 host 业务

## 何时**不**使用

- 商品列表(网格 / 瀑布)→ `commerce-product-list`
- 订单详情(状态机)→ `order-detail`
- 复杂富文本介绍 → 用 `rich-text-editor` + 描述区(host 包)
- 视频频道 / 节目详情 → 不适配

## 安装

```bash
pnpm add file:./sdk/product-detail/frontend
```

## 最小用法

```tsx
import { ProductDetail } from '@pd/product-detail';
import '@pd/product-detail/styles.css';

// A) 自动 fetch(连后端 stub)
<ProductDetail
  config={{ apiBaseUrl: 'http://localhost:8086' }}
  productId="01JBPRODDEMO001"
  onAddToCart={(sku, qty) => addToCart(sku.id, qty)}
  onBuyNow={(sku, qty) => checkout(sku.id, qty)}
/>

// B) Host 自管 data
<ProductDetail data={product} onAddToCart={...} />
```

## 完整 Props

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `data` | `ProductDetailData` | — | 优先级高于 fetch;传后不再 fetch |
| `config` | `BlockConfig` | — | 走 fetch 必填 |
| `productId` | `string` | — | 走 fetch 必填 |
| `selectedSkuId` | `string` | 第一个 sku | 受控 |
| `onSelectSku` | `(sku) => void` | — | SKU 切换 |
| `onAddToCart` | `(sku, qty) => void` | — | 加购,省略则不显示 |
| `onBuyNow` | `(sku, qty) => void` | — | 立即购买,省略则不显示 |
| `onSubmitReview` | `({rating, body}) => void` | — | 评价提交(写评价按钮) |
| `className` | `string` | — | |
| `height` | `string \| number` | `'100%'` | |

`ProductDetailData`:`{ id, title, subtitle?, description?, media, skus, reviews?, rating?, rating_count?, currency?, meta? }`

`ProductSku`:`{ id, label, price, stock, meta? }`

## 内部已经处理好的事项

- ✅ 自动 fetch:`config + productId` 时 GET `/v1/products/:id`;errored / loading / 空态自管
- ✅ `data` 优先于 fetch(host 已有数据时直接传,节省一次请求)
- ✅ SKU 单选 + 库存状态(售罄 disable / 余量提示)
- ✅ 数量受 SKU 库存约束(InputNumber max)
- ✅ 价格高亮(红 24px 加粗) + 货币兜底(CNY → ¥)
- ✅ 评分:Rate 只读 + count
- ✅ 响应式 grid(< 768 px 单列)
- ✅ a11y:radiogroup + aria-checked(SKU);Title 用 antd Typography 自带 heading 层级

## 严格禁止的反模式

❌ **自己拼图廊 + SKU + 评价**:本块就是为了消灭这种重复;每次手写都漏 stock / 价格切换 / 响应式

❌ **`onAddToCart` 内部不 catch error**:本块原样调用(支持 Promise);host 自己处理失败提示(antd message)

❌ **price 用最小单位(分)传入但又指望本块格式化为元**:本块按 `price` 数字直接展示,host 自己确保单位一致;**注意 currency 字段只控制货币符号,不做精度转换**

❌ **SKU `label` 塞超长内容**:label 是按钮内文字,过长会撑破布局;长描述放 `meta` 在卡片下方展示(本块 v0.1 未展示 meta,留给 v0.2)

❌ **改 sdk 内 ProductDetail.tsx**:想加"图廊浮层"→ host 包一层,把 `media` 字段喂给 `media-gallery` block

## 状态

- v0.1 — 首版形态参考;未来:多 SKU 矩阵(2 维)、库存预警动画、加购 success toast、推荐位、富文本介绍消费 rich-text-editor
