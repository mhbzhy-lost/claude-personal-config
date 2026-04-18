---
name: harmony-arkui-layout
description: "ArkUI 布局容器：Column/Row/Stack/Flex/Grid/List/WaterFlow/RelativeContainer、约束与安全区。"
tech_stack: [harmonyos, mobile-native]
language: [arkts]
capability: [ui-layout]
---

# ArkUI 布局容器

> 来源：https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/arkts-build-layout
> 版本基准：HarmonyOS 5 / API 12+

## 用途

ArkUI 提供声明式布局容器，通过嵌套组合实现页面结构。所有容器共享通用尺寸属性（width/height/padding/margin/layoutWeight），子组件通过链式调用设置约束。

## 何时使用（选择指南）

| 场景 | 推荐容器 |
|---|---|
| 纵向/横向排列、表单 | Column / Row |
| 需要换行的标签流 | Flex（wrap: FlexWrap.Wrap） |
| 浮层、徽标叠加 | Stack |
| 等宽卡片矩阵 | Grid |
| 长列表 + 复用 | List + LazyForEach |
| 不等高卡片流 | WaterFlow + LazyForEach |
| 复杂对齐、减少嵌套 | RelativeContainer |

## 线性布局（Column / Row）

最常用容器。Column 主轴垂直，Row 主轴水平。

```ts
Column({ space: 12 }) {
  Text('A')
  Text('B')
}
.alignItems(HorizontalAlign.Center) // 交叉轴（水平）
.justifyContent(FlexAlign.SpaceBetween) // 主轴（垂直）
.width('100%')

Row({ space: 8 }) {
  Text('L')
  Text('R').layoutWeight(1) // 占满剩余空间
}
.alignItems(VerticalAlign.Center) // 交叉轴（垂直）
```

**核心属性**

| 属性 | Column | Row |
|---|---|---|
| `space` | 构造参数，子项间距 | 同左 |
| `alignItems` | HorizontalAlign（Start/Center/End） | VerticalAlign（Top/Center/Bottom） |
| `justifyContent` | FlexAlign（Start/Center/End/SpaceBetween/SpaceAround/SpaceEvenly） | 同左 |

子组件可用 `layoutWeight(n)` 按权重分配主轴剩余空间，`flexGrow` / `flexShrink` 也可用。

## 层叠布局（Stack）

子组件依次叠放，后添加的在上层。

```ts
Stack({ alignContent: Alignment.BottomEnd }) {
  Image($r('app.media.bg')).width('100%').height(200)
  Text('Badge').fontSize(12).zIndex(2)
}
```

- `alignContent: Alignment` -- 9 宫格对齐（TopStart / Top / TopEnd / Start / Center / End / BottomStart / Bottom / BottomEnd）
- 子组件通过 `.zIndex(n)` 手动控制层级，值越大越靠上

## 弹性布局（Flex）

功能上是 Row/Column 的超集，支持换行与反向排列。

```ts
Flex({ direction: FlexDirection.Row, wrap: FlexWrap.Wrap, justifyContent: FlexAlign.Start }) {
  ForEach(this.tags, (tag: string) => {
    Text(tag).margin(4).padding(8)
  })
}
```

**构造参数**

| 参数 | 说明 |
|---|---|
| `direction` | FlexDirection.Row / RowReverse / Column / ColumnReverse |
| `wrap` | FlexWrap.NoWrap / Wrap / WrapReverse |
| `justifyContent` | 主轴对齐，同 Column/Row |
| `alignItems` | ItemAlign.Start / Center / End / Stretch / Baseline |
| `alignContent` | 多行时行间对齐 |

**Flex vs Row/Column 关键差异**

- Flex 渲染时会触发**二次布局**，性能低于 Row/Column；无需换行时优先用 Row/Column
- Flex 子组件默认会**拉伸填满**主轴方向；Row/Column 默认随子组件尺寸收缩
- 需要 `wrap` 换行时只能用 Flex

## 网格布局（Grid / GridItem）

```ts
Grid() {
  ForEach(this.items, (item: string) => {
    GridItem() {
      Text(item).textAlign(TextAlign.Center)
    }
  })
}
.columnsTemplate('1fr 1fr 1fr')   // 3 等宽列
.rowsTemplate('1fr 1fr')          // 2 等高行
.columnsGap(10)
.rowsGap(10)
```

- `columnsTemplate` / `rowsTemplate` -- 用 `fr` 单位定义比例，如 `'4fr 2fr 3fr'`
- 不设 `rowsTemplate` 时行数自适应（滚动模式）
- GridItem 可用 `.rowStart(n).rowEnd(m).columnStart(n).columnEnd(m)` 跨行跨列
- 大数据量配合 `LazyForEach` 实现按需渲染

## 列表（List / ListItem）

滚动长列表首选，内置复用与懒加载。

```ts
List({ space: 8 }) {
  LazyForEach(this.dataSource, (item: ItemData) => {
    ListItem() {
      Text(item.title)
    }
  })
}
.lanes(2)                           // 多列列表
.sticky(StickyStyle.Header)         // 分组吸顶
.scrollBar(BarState.Auto)
.divider({ strokeWidth: 0.5, color: '#e8e8e8' })
.nestedScroll({ scrollForward: NestedScrollMode.PARENT_FIRST })
```

**常用属性**：`lanes`（多列）、`sticky`（吸顶）、`edgeEffect`（回弹）、`cachedCount`（预加载数量）。分组用 `ListItemGroup` + `header`/`footer` builder。

## 瀑布流（WaterFlow）

不等高卡片的瀑布排列，仅接受 `FlowItem` 子组件。

```ts
WaterFlow() {
  LazyForEach(this.dataSource, (item: CardData) => {
    FlowItem() {
      Column() {
        Image(item.img).width('100%')
        Text(item.title)
      }
    }
  })
}
.columnsTemplate('1fr 1fr')
.columnsGap(8)
.rowsGap(8)
.cachedCount(5)
```

必须配合 `LazyForEach` 使用以获得性能；`columnsTemplate` 控制列数。

## 相对布局（RelativeContainer）

用锚点规则定位子组件，减少嵌套深度。DevEco Studio 新建页面默认根容器。

```ts
RelativeContainer() {
  Text('Center')
    .id('center')
    .alignRules({
      middle: { anchor: '__container__', align: HorizontalAlign.Center },
      center: { anchor: '__container__', align: VerticalAlign.Center }
    })
  Text('Below')
    .id('below')
    .alignRules({
      top: { anchor: 'center', align: VerticalAlign.Bottom },
      left: { anchor: 'center', align: HorizontalAlign.Start }
    })
    .margin({ top: 12 })
}
```

**关键概念**

- 锚点（anchor）：`'__container__'` 指父容器，或子组件 `.id()` 字符串
- AlignRules 方向：`top/bottom/left/right/middle/center`
- Guideline：虚拟参考线，`{ id, direction: Axis.Vertical, position: { start: '30%' } }`
- Barrier：依赖一组子组件边界的虚拟线，`{ id, direction: BarrierDirection.RIGHT, referencedId: ['a','b'] }`
- 子组件的 margin 表示距锚点距离，无锚点方向时 margin 不生效

## 安全区适配

```ts
// 组件扩展至安全区（状态栏/导航栏/键盘）
Column() { ... }
  .expandSafeArea([SafeAreaType.SYSTEM, SafeAreaType.KEYBOARD], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
```

- `SafeAreaType`：SYSTEM（状态栏/导航栏）、CUTOUT（刘海/挖孔）、KEYBOARD（虚拟键盘）
- `SafeAreaEdge`：TOP / BOTTOM / START / END
- 键盘避让模式通过 `window.setKeyboardAvoidMode()` 切换：
  - `KeyboardAvoidMode.OFFSET` -- 页面整体上移
  - `KeyboardAvoidMode.RESIZE` -- 压缩页面高度（此模式下 `expandSafeArea([KEYBOARD])` 不生效）

## 常见陷阱

1. **Flex 性能**：Flex 有二次布局开销。不需要 wrap 时一律用 Row/Column 替代
2. **layoutWeight 与固定尺寸冲突**：设了 `layoutWeight` 就不要再设同方向的 width/height，否则 layoutWeight 失效
3. **Grid 滚动 vs 固定**：同时设 `columnsTemplate` + `rowsTemplate` 为固定网格（不可滚动）；只设一个方向模板则另一方向可滚动
4. **List 不复用**：用 `ForEach` 而非 `LazyForEach` 会导致全量渲染，长列表必须用 LazyForEach + DataSource
5. **RelativeContainer 无 id**：子组件不设 `.id()` 就无法被其他子组件用作锚点
6. **安全区 RESIZE + expandSafeArea 冲突**：KeyboardAvoidMode.RESIZE 下 expandSafeArea(KEYBOARD) 无效，需切换到 OFFSET 模式
7. **Stack 点击穿透**：上层组件即使透明也会拦截事件，需要 `.hitTestBehavior(HitTestMode.Transparent)` 放行
