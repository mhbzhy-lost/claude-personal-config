---
name: master-detail-frontend
description: 任何"左列表右详情""master-detail""双栏 split view"形态，必须用 `MasterDetail` 容器壳承担选中态、响应式塌缩与 a11y，禁止自行 flex+useState 拼。
---

# `@md/master-detail`

## 何时使用

凡满足以下任一条件，**必须**使用本 block 的 `MasterDetail`：

- 同屏需要"左列表 + 右详情"两栏布局
- 列表和详情共享一个 selected id，且要在宽屏并列、窄屏切换
- 想要 master-detail 形态的 a11y 默认（`listbox` / `option` / 键盘 Enter/Space）
- 想要响应式自动塌缩（split ↔ stack 不用自己写 matchMedia）

**反向选型**见下方"何时不使用"。

## 何时**不**使用

- 只有列表无详情 → `commerce-product-list` 或直接 antd `List`/`Table`
- 详情是 modal/抽屉/popover 浮层 → 用 antd `Modal`/`Drawer`/`Popover`
- 详情在独立路由页面（不需同屏并列） → host 自管两个 Route
- 三栏布局（list / detail / 子详情）→ 本块不适配，找多层 split panel 方案
- **数据本身就是 block 自带的**（例如订单/聊天）→ 用对应的业务 block；它们内部可能已经基于 master-detail 做了双栏布局

## 安装

```bash
pnpm add file:./sdk/ui-chrome/master-detail/frontend
```

`main` / `types` 都指向 `src/index.ts`，无需构建。

## 最小用法

```tsx
import { useState } from 'react';
import { MasterDetail } from '@md/master-detail';
import '@md/master-detail/styles.css';

const [selected, setSelected] = useState<string | null>(null);

<MasterDetail
  items={rows}
  getItemId={(r) => r.id}
  selectedId={selected}
  onSelect={setSelected}
  renderItem={(r, sel) => <Row data={r} selected={sel} />}
  renderDetail={(id) => <DetailPanel id={id} />}
  placeholder={<Empty description="选一项查看详情" />}
  emptyList={<Empty description="暂无数据" />}
  renderBackButton={(onBack) => (
    <Button type="link" icon={<LeftOutlined />} onClick={onBack}>返回</Button>
  )}
/>
```

## 完整 Props

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `items` | `T[]` | — | 全量列表项；host 自管分页/筛选/排序 |
| `getItemId` | `(T) => string` | — | 取项 id；用作 React key 与 `selectedId` 对照 |
| `selectedId` | `string \| null` | — | 当前选中（受控） |
| `onSelect` | `(id \| null) => void` | — | 选中变更；窄屏返回会传 `null` |
| `renderItem` | `(item, selected) => ReactNode` | — | 行渲染；`selected` 用于高亮 |
| `renderDetail` | `(id) => ReactNode` | — | 详情渲染 |
| `placeholder` | `ReactNode` | — | split 模式未选时显示在右栏 |
| `emptyList` | `ReactNode` | — | `items.length===0` 时显示在左栏 |
| `renderBackButton` | `(onBack) => ReactNode` | — | stack 模式详情顶部；不传则无返回 affordance |
| `layout` | `'auto' \| 'split' \| 'stack'` | `'auto'` | 'auto' = 跟随 breakpoint |
| `splitBreakpoint` | `number` | `768` | px |
| `splitRatio` | `[number, number]` | `[1, 2]` | list : detail flex 比例 |
| `loading` | `boolean` | `false` | 列表 `aria-busy` |
| `ariaListLabel` | `string` | `'列表'` | |
| `ariaDetailLabel` | `string` | `'详情'` | |
| `className` | `string` | — | 加到根元素 |
| `height` | `string \| number` | `'100%'` | 根元素高度 |

## 内部已经处理好的事项

- ✅ `matchMedia` 监听 + 卸载 cleanup（auto 模式响应式塌缩）
- ✅ 选中行 `aria-selected="true"` + `role="option"`、列表 `role="listbox"`
- ✅ 键盘 Enter / Space 选中
- ✅ stack 模式下未选时只显示列表，选中后只显示详情（用 display 切换，不卸载组件）
- ✅ 行 hover / focus-visible / selected 三态样式
- ✅ 左右栏独立滚动 + min-width: 0 防 flex 溢出
- ✅ BEM 类名暴露给 host 写覆盖样式
- ✅ 可选 antd token 主题桥（读 `--ant-color-primary-bg`）

## 严格禁止的反模式

❌ **自己 flex 拼 + useState 存 selected**：本块就是为了消灭这种重复，每次重写都会漏 a11y / 响应式 / 键盘 / focus 样式

❌ **改 sdk 内的 MasterDetail.tsx**：在 host 包 Adapter（`renderItem` / `renderDetail` 注入差异）或写 CSS 覆盖，不要直接改源码

❌ **把 items 缓存进组件内部 useState**：组件设计为零数据所有权，host 必须管 items；想缓存就在 host 写一个 hook

❌ **`layout='split'` 又指望窄屏好看**：split 永远双栏，窄屏会挤。窄屏想可用必须走 `'auto'`

❌ **在 `renderItem` 里再开 onClick→onSelect**：行外层已经接了 onClick + 键盘，再嵌套会引发双触发

❌ **stack 模式不传 `renderBackButton` 又指望有返回按钮**：本块不内置 navbar，host 必须提供返回 UI（或外挂一个 navbar block）

❌ **用 `selectedId` 之外的字段决定高亮**：单一事实源，否则视觉与 aria-selected 会脱钩

## 状态

- v0.1 — 首版；后续可能加：虚拟滚动适配、列宽拖拽、多选模式
