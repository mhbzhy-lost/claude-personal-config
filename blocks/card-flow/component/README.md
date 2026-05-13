# card-flow SDK

卡片流 (Card Flow) UI chrome SDK——把"一堆卡片怎么排"这件事抽成
**三档可切的纯壳子**:

| mode | 形态 | 典型用途 |
|---|---|---|
| `grid` (默认) | N 列等高 CSS Grid | 商品 / 文章卡片目录,每张卡同高 |
| `waterfall` | N 列 CSS column-count masonry | 小红书 / Pinterest 风,卡片自适高 |
| `single` | 单列垂直堆叠 | feed / 朋友圈 / timeline |

零业务态、零数据获取、零滚动管理。host 给 `items` 数组 + `renderItem` 函数,
组件只负责"怎么摆"。

```
component/
└── frontend/    CardFlow 组件 + SKILL.md(强指令)
```

## 整体复制

```bash
cp -r blocks/card-flow/component your-project/sdk/ui-chrome/card-flow
```

## 最小用法

```tsx
import { CardFlow } from '@cf/card-flow';
import '@cf/card-flow/styles.css';

type Item = { id: string; title: string; cover: string };

<CardFlow<Item>
  items={items}
  getItemId={(x) => x.id}
  renderItem={(x) => (
    <div style={{ background: '#fff', borderRadius: 8 }}>
      <img src={x.cover} alt={x.title} style={{ width: '100%' }} />
      <p>{x.title}</p>
    </div>
  )}
  mode="grid"
  columns={{ xs: 2, sm: 3, md: 4, lg: 4, xl: 6 }}
  emptyState={<Empty description="暂无数据" />}
  footer={<LoadMoreButton />}
/>
```

## 三档 mode 行为

### `grid`
- CSS `display: grid; grid-template-columns: repeat(N, minmax(0, 1fr))`
- 每行卡片**同高**(grid 默认行为,host 想固定宽高比时自己锁)
- 适合标品 / 商品目录 / 需要整齐感的场景

### `waterfall`
- CSS `column-count: N`
- 卡片**自然高度**保留,`break-inside: avoid` 防止单卡被截
- **填充顺序是 column-by-column**(item₁ 填列 1,item₂ 也填列 1 直到列满,再到列 2)
  ——不是"贪心填最短列",顺序与时间流一致但视觉上可能列间高度有差异
- 不需要 JS 测量,纯 CSS,SSR 友好
- 适合内容流(图文混排 / 笔记 / 摄影)

### `single`
- flex 垂直堆叠
- 等价于 grid columns=1,但语义更明确(且不受 `columns` prop 影响)
- 适合 feed / timeline / 朋友圈

## 响应式列数

```tsx
columns={{ xs: 2, sm: 3, md: 4, lg: 4, xl: 6 }}
```

断点同 antd:`<576 xs`、`≥576 sm`、`≥768 md`、`≥992 lg`、`≥1200 xl`。
解析时按"当前断点 → 向下 fallback 到最近定义值";全空则用默认 `{xs:2, sm:3, md:4, lg:4, xl:6}`。

也可以传单个数字:`columns={3}` = 所有断点都是 3 列。

## 关键设计

- **零数据所有权**:items / 分页 / 搜索 / loadMore 全部 host 管;组件只读
- **slot 灵活**:`header` / `footer` / `emptyState` / `loading` 四个 slot 满足列表壳通用需求
- **a11y 默认**:列表区 `aria-label` + `aria-busy`,但**不包**卡片的 role —— host 在 renderItem 内自定义(如 `role="button" tabIndex={0}`)
- **样式覆盖**:BEM 类名 `cf-card-flow__*`,host 用普通 CSS 覆盖
- **不绑虚拟滚动**:items 全量渲染。需要虚拟滚动时,host 把 items 切窗口后再喂给 CardFlow

## pkg

| 资源 | 值 |
|---|---|
| frontend pkg | `@cf/card-flow` |
| 后端 | (无) |
| 协议 | (无) |

## 何时**不**用

- 已有合适的**业务块**带列表(`commerce-product-list` 内置筛选/排序/per-user 状态)→ 用业务块,本块只是它的下层壳
- 详情同屏并列(左列表右详情)→ `master-detail`
- 三栏 IDE 风、可拖拽列宽 → 不适配
- 虚拟滚动(列表超长 / 性能敏感)→ 本块不内置,需要 host 切窗口

## 完整 Props 见 SKILL.md
