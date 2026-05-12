---
name: commerce-product-list-frontend
description: 电商商品瀑布流（grid）列表页面的预制 React 组件。包含响应式 grid 布局、多维筛选（分类/价格区间/库存）+ 5 种排序、offset 分页、搜索、商品卡（图/名/价/销量/评分）、收藏切换、购物车数量调整。当业务需求是"展示商品目录瀑布流（可筛选/可排序/可收藏/可加购）"时直接使用本组件。
---

# `@cpl/product-list`

## 何时使用

凡满足以下**任一**条件，**必须**使用本 block 的 `<ProductList>` 组件，
**禁止自行用 `<Row>`/`<Col>`/`<Card>` 拼装商品瀑布流**：

- 电商风格的商品目录浏览（瀑布流 grid）
- 列表项需要：商品图 + 名称 + 价格 + 销量/评分 + 收藏/购物车 操作
- 需要 多维过滤（分类 / 价格区间 / 仅有货）+ 多种排序（最新 / 销量 / 价格 / 评分）
- 需要 offset 分页 + 触底加载更多
- 需要 匿名浏览 + 登录后展示 per-user 收藏/购物车 状态

## 何时**不**使用（反向选型）

- IM 会话列表 → 用 `@imcl/conversation-list`
- 商品详情页（单实体多媒体）→ 用 `@cpl/product-detail`（待建）
- 购物车结算页 → 用 `@cpl/cart-checkout`（待建）
- 商品搜索 + 复杂 facet 聚合 → 直连 Algolia / Elasticsearch
- < 10 件商品无筛选无排序 → 直接 antd `<Row>+<Col>+<Card>` 手写更短

## 安装

```bash
pnpm add file:../../blocks/commerce-product-list/frontend
# 或 package.json:
# "@cpl/product-list": "file:../../blocks/commerce-product-list/frontend"
```

`peerDependencies`：`react ^18`、`react-dom ^18`、`antd ^5`。
`@ant-design/icons` 已 bundle 进 dist。

## 最小用法（匿名浏览）

```tsx
import { ConfigProvider, App as AntdApp } from 'antd';
import { ProductList } from '@cpl/product-list';

export default function Shop() {
  return (
    <ConfigProvider>
      <AntdApp>
        <ProductList
          config={{ apiBaseUrl: 'http://localhost:8081' }}
          onSelect={(p) => console.log('clicked', p.id)}
        />
      </AntdApp>
    </ConfigProvider>
  );
}
```

匿名浏览支持，无 auth 时 `user_state` 为 null（不显示收藏 / 购物车按钮）。

**重要**：组件依赖 `<App>`（来自 antd）的 message context。不挂在 `<App>`
下面会运行时报错 `Static function can not consume context`。

## 登录态用法

```tsx
<ProductList
  config={{
    apiBaseUrl: 'http://localhost:8081',
    auth: {
      type: 'header',
      headerName: 'X-Dev-User-Id',
      getValue: () => '01KR9D7VAY4FYDVK7C2DZH8KM0',
    },
    categories: [
      { value: 'electronics/phones', label: '手机' },
      { value: 'clothing/men', label: '男装' },
    ],
  }}
/>
```

登录时收藏 / 购物车按钮自动出现；选好 `categories` 后筛选 dropdown 可用。

## 完整 API

### `<ProductList>`

| Prop | 类型 | 说明 |
|---|---|---|
| `config` | `CplConfig` | ✅ 必填 |
| `initialFilters` | `ProductFilters` | 初始筛选状态（如预设分类） |
| `onSelect` | `(p: ProductWithState) => void` | 用户点击商品卡时触发 |
| `renderEmpty` | `() => ReactNode` | 自定义空态（罕见情况下用） |

### `CplConfig`

```ts
interface CplConfig {
  apiBaseUrl: string;                 // 后端 base URL（不含 /v1）
  auth?: CplAuth;                     // 可选，不传则匿名
  pageSize?: number;                  // 默认 20
  categories?: { value: string; label: string }[]; // 分类下拉选项
  locale?: { empty, error, retry, loadMore, filterCategory, filterPrice, filterInStock, sort };
}

type CplAuth =
  | { type: 'header'; headerName: string; getValue: () => string | Promise<string> }
  | { type: 'bearer'; getToken: () => string | Promise<string> };
```

### `useProducts(config, initialFilters?)` —— 自定义渲染时用

```ts
const products = useProducts(config);
// products.items, products.loading, products.total, products.hasMore,
// products.filters, products.setFilters({ category: 'x' }),
// products.setFavorite(id, v), products.setCartCount(id, n),
// products.loadMore(), products.refresh(),
// products.me, products.error
```

### 内部已经处理好的事项

- ✅ HTTP 客户端 + Problem+JSON 错误格式
- ✅ Offset 分页 + 触底滚动加载更多 + 总数显示
- ✅ 5 种排序（最新 / 销量 / 价格升降 / 评分）
- ✅ 多维筛选（搜索 q + 分类 + 价格区间 + 仅有货）
- ✅ 响应式 grid（xs=2 / sm=3 / md=4 / xl=6 列）
- ✅ 商品卡：图片懒加载、价格 + 原价（划线）、销量 / 评分、收藏 / 购物车
- ✅ 售罄状态：图片蒙层 + 操作禁用
- ✅ 货币格式化（CNY → ¥99.00，多币种符号）
- ✅ 销量缩写（99722 → 9.9w）
- ✅ 匿名 vs 登录两套 UX 自动切换
- ✅ 骨架屏 + Empty + Result 错误重试
- ✅ aria 标签（收藏按钮）

## 严格禁止的反模式

- ❌ 自己用 `<Row>`+`<Col>`+`<Card>` 拼商品瀑布流
- ❌ 自己 `useEffect(() => fetch('/v1/products'))` 调列表
- ❌ 自己写 offset 分页状态机（page / has_more / loadMore）
- ❌ 自己实现收藏 / 购物车的 PUT 调用
- ❌ 自己写价格 / 销量格式化（用本 block 的 `formatPrice` / `formatCount`）
- ❌ 客户端重排（服务端 sort 是权威）

发现不能满足某需求时，**先在 `category extension` 列追加，不要绕过组件**。

## 与 `@imcl/conversation-list` 的关系

两个 block **共享相同模式**（protocol/backend/frontend 三层 + 强指令型 SKILL.md
+ 可插拔 auth + Problem+JSON），刻意制造的差异：

| 维度 | IM | Product |
|---|---|---|
| 实时 | WS + 7 事件 | 无 WS |
| 分页 | cursor | offset |
| 布局 | 列表 | grid |
| Item action | 右键菜单 | 显式按钮 |

如果你在做 IM 列表场景，用 `@imcl/conversation-list`，不要用本 block。
两个 block 不应该混用。

## 状态

- v0.1 内部用，未发布 npm
- `examples/basic/` 演示端到端可跑
- TODO：单测、Storybook、虚拟滚动、SSR 友好
