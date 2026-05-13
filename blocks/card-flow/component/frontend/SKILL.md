---
name: card-flow-frontend
description: 任何"一堆卡片怎么排"的需求(网格 / 双列瀑布流 / 单列 feed)都必须用 `CardFlow` 壳,禁止自行 grid+useState/column-count 拼。
---

# `@cf/card-flow`

## 何时使用

凡满足以下任一条件,**必须**使用本 block 的 `CardFlow`:

- 同屏列出一堆同形态卡片(商品 / 文章 / 笔记 / feed)
- 需要在"等高网格 / 双列瀑布流 / 单列堆叠"之间切换(`mode` prop)
- 需要响应式列数(屏宽变 N 列)
- 想要列表壳的 a11y 默认(`aria-label` / `aria-busy`)

## 何时**不**使用

- 业务块自带列表壳(`commerce-product-list` / `im-conversation-list` 等)→ 用业务块,它们可能内部已经基于 `CardFlow`
- 左列表 + 右详情同屏 → `master-detail`
- 虚拟滚动(超长列表) → 本块不内置;host 自己切窗口后喂 items
- 一行内复杂排版(图文双列各自不同宽度)→ 直接写 Flex/Grid,本块只解决"卡片是同形态"的场景

## 安装

```bash
pnpm add file:./sdk/ui-chrome/card-flow/frontend
```

`main` / `types` 都指向 `src/index.ts`,无需构建。

## 最小用法

```tsx
import { CardFlow } from '@cf/card-flow';
import '@cf/card-flow/styles.css';

<CardFlow
  items={items}
  getItemId={(x) => x.id}
  renderItem={(x) => <YourCard data={x} />}
  mode="grid"           // 'grid' | 'waterfall' | 'single'
  columns={{ xs: 2, sm: 3, md: 4 }}
  emptyState={<Empty description="暂无数据" />}
  footer={<LoadMoreButton />}
/>
```

## 完整 Props

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `items` | `T[]` | — | 全量列表;host 自管分页/筛选/排序 |
| `getItemId` | `(T) => string` | — | 取 id,React key |
| `renderItem` | `(T) => ReactNode` | — | 卡片渲染(host 自己控外观) |
| `mode` | `'grid' \| 'waterfall' \| 'single'` | `'grid'` | 三档布局 |
| `columns` | `number \| ResponsiveColumns` | `{xs:2,sm:3,md:4,lg:4,xl:6}` | 列数;`single` 时忽略 |
| `gap` | `number` | `16` | 卡片间距 px |
| `emptyState` | `ReactNode` | — | items 为空时显示 |
| `header` | `ReactNode` | — | 卡片上方(toolbar / filter) |
| `footer` | `ReactNode` | — | 卡片下方(load-more / sentinel) |
| `loading` | `boolean` | `false` | 列表 `aria-busy` |
| `ariaLabel` | `string` | `'卡片列表'` | |
| `className` | `string` | — | 根元素附加类 |
| `height` | `string \| number` | `'100%'` | 根元素高度 |

`ResponsiveColumns`:`{ xs?, sm?, md?, lg?, xl? }`,断点同 antd。

## 内部已经处理好的事项

- ✅ `window.resize` 监听 + cleanup(响应式列数)
- ✅ `grid` / `waterfall` / `single` 三档 CSS,无需 host 写 column-count / grid-template-columns
- ✅ waterfall 模式自动 `break-inside: avoid` 防卡片被截断
- ✅ `aria-label` + `aria-busy` + 空态 slot
- ✅ BEM 类名 暴露给 host 覆盖样式
- ✅ `min-width: 0` 防 grid 子元素溢出
- ✅ Header / Body / Footer 三段独立,Body 内部滚动

## 严格禁止的反模式

❌ **自己写 `display: grid` + media query**:本块就是为了消灭这种重复;每次手写都会漏 a11y / 列数响应式 / break-inside

❌ **mode='waterfall' 期待"贪心填最短列"**:本块用 CSS `column-count`(块顺序填列 1 满 → 列 2),不做 JS 测量布局。若必须按"最短列优先"(item 顺序按时间但视觉填充贪心),host 用 react-masonry-css 等 JS 方案;本块不适配

❌ **mode='single' 还传 columns**:被忽略,但容易让读者困惑;单列直接用 `mode='single'` 不传 columns

❌ **把分页 / 加载更多放进 renderItem**:用 `footer` slot 挂 Load-More 按钮或 IntersectionObserver sentinel,renderItem 只渲卡片

❌ **指望本块做虚拟滚动**:不内置;items 全量挂载。超长列表自己用 react-window / react-virtuoso 切窗口后再喂 items

❌ **在 renderItem 外面包外层 div 加 onClick**:已经有外层 cell wrapper;host 把 onClick / role=button / 键盘事件放进 renderItem 返回的元素本身

## 状态

- v0.1 — 首版;未来可考虑:JS-based "fill shortest column" waterfall、虚拟滚动适配、列宽拖拽
