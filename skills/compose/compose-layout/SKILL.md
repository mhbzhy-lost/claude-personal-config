---
name: compose-layout
description: "Jetpack Compose 布局：Row/Column/Box/ConstraintLayout/Lazy 列表/Grid/Modifier 链语义/自定义 Layout。"
tech_stack: [compose]
language: [kotlin]
---

# Jetpack Compose 布局体系

> 来源：https://developer.android.com/develop/ui/compose/layouts/basics
> 版本基准：Compose BOM 2025.x / Material 3

## 用途

提供声明式布局原语，用于排列、对齐、滚动和懒加载 UI 元素。

## 何时使用

- 线性排列子项 -- Row / Column
- 堆叠/层叠子项 -- Box
- 复杂相对定位 -- ConstraintLayout
- 大量同质数据滚动 -- LazyColumn / LazyRow / LazyVerticalGrid / LazyVerticalStaggeredGrid
- 以上皆不满足 -- 自定义 Layout

## Row / Column / Box

```kotlin
// Column：纵向排列
Column(
    modifier = Modifier.fillMaxWidth(),
    verticalArrangement = Arrangement.spacedBy(8.dp),   // 子项间距
    horizontalAlignment = Alignment.CenterHorizontally   // 交叉轴对齐
) { Text("A"); Text("B") }

// Row：横向排列（参数对称：horizontalArrangement + verticalAlignment）
Row(
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.CenterVertically
) { Text("Left"); Spacer(Modifier.weight(1f)); Text("Right") }

// Box：堆叠，后声明的子项在上层
Box(contentAlignment = Alignment.Center) {
    Image(...)          // 底层
    Text("Overlay")     // 顶层
}
```

**weight**：仅在 `RowScope` / `ColumnScope` 中可用，按比例分配剩余空间。

## Modifier 链顺序语义（核心）

Modifier 从左到右依次包裹，**每个 Modifier 作用于"它右边所有内容形成的整体"**。理解为洋葱模型：先写的在外层。

### padding 与 background 的经典对比

```kotlin
// 写法 A：background 在外 → padding 在内 → 背景覆盖 padding 区域
Modifier
    .background(Color.Blue)
    .padding(16.dp)
// 视觉：蓝色区域包含 16dp 内边距，文字在蓝色框内部

// 写法 B：padding 在外 → background 在内 → 背景不覆盖 padding 区域
Modifier
    .padding(16.dp)
    .background(Color.Blue)
// 视觉：先留 16dp 透明间距，蓝色仅填充内部内容区

// 模拟 "margin + padding + 背景"
Modifier
    .padding(12.dp)          // 外边距（margin 效果）
    .background(Color.Gray)  // 背景
    .padding(16.dp)          // 内边距
```

### clickable 位置

```kotlin
// clickable 在 padding 前 → 整个区域（含 padding）可点击
Modifier.clickable { }.padding(16.dp)

// clickable 在 padding 后 → 仅内容区可点击
Modifier.padding(16.dp).clickable { }
```

### 推荐顺序模板

```
.then(外部传入的 modifier)   // 第一位：尊重调用方
.padding(外边距)
.size / fillMaxWidth
.clip(shape)
.background / border
.clickable
.padding(内边距)
```

## ConstraintLayout

需额外依赖：`androidx.constraintlayout:constraintlayout-compose:1.1.1`

```kotlin
ConstraintLayout(modifier = Modifier.fillMaxSize()) {
    val (title, subtitle, icon) = createRefs()

    Text("Title", Modifier.constrainAs(title) {
        top.linkTo(parent.top, 16.dp)
        start.linkTo(parent.start, 16.dp)
    })
    Text("Sub", Modifier.constrainAs(subtitle) {
        top.linkTo(title.bottom, 8.dp)
        start.linkTo(title.start)
    })
    // Guideline / Barrier / Chain 也可用
    val barrier = createEndBarrier(title, subtitle)
    Icon(Icons.Default.Star, null, Modifier.constrainAs(icon) {
        start.linkTo(barrier, 12.dp)
        top.linkTo(title.top)
    })
}
```

**何时用**：三层以上嵌套 Row/Column 仍无法表达时再考虑；简单布局用 Row/Column 更易读。

## LazyColumn / LazyRow

```kotlin
LazyColumn(
    contentPadding = PaddingValues(16.dp),
    verticalArrangement = Arrangement.spacedBy(8.dp)
) {
    item { Header() }                         // 单项
    items(dataList, key = { it.id }) { item -> // 列表项 + key
        ItemCard(item)
    }
    item { Footer() }
}
```

### key -- 必须提供

- 无 key 时 Compose 以 **索引** 识别项；增删项导致索引偏移，所有后续项全部重组。
- 提供 key 后仅变更项重组。删除 1 项：无 key 重组 N-1 次 vs 有 key 重组 1 次。
- key 类型须能存入 `Bundle`（Int / Long / String / Parcelable）以支持状态恢复。

### contentType -- 异构列表必填

```kotlin
items(elements, key = { it.id }, contentType = { it.type }) { elem ->
    when (elem) {
        is Header -> HeaderRow(elem)
        is Photo  -> PhotoCard(elem)
    }
}
```

- 类似 RecyclerView 的 ViewType；Compose 仅在相同 contentType 间复用 composition slot。
- 未指定时不同类型项互相复用会导致全量重组，滚动卡顿。

### 禁忌

- **不要嵌套同方向滚动**：`Column(Modifier.verticalScroll) { LazyColumn {} }` 会崩溃。把所有内容放进同一个 LazyColumn 的 `item { }` / `items { }` 中。
- 避免在 `items` lambda 中放多个根元素；每多一个根元素就多一个 composition slot 开销。

## LazyVerticalGrid / LazyVerticalStaggeredGrid

```kotlin
// 固定列数
LazyVerticalGrid(columns = GridCells.Fixed(3)) {
    items(photos, key = { it.id }) { PhotoCard(it) }
}

// 自适应列宽（响应式）
LazyVerticalGrid(columns = GridCells.Adaptive(minSize = 128.dp)) {
    items(photos, key = { it.id }) { PhotoCard(it) }
}

// 瀑布流（子项高度不等）
LazyVerticalStaggeredGrid(
    columns = StaggeredGridCells.Adaptive(200.dp),
    verticalItemSpacing = 4.dp,
    horizontalArrangement = Arrangement.spacedBy(4.dp)
) {
    items(photos, key = { it.id }) { photo ->
        AsyncImage(
            model = photo.url,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxWidth().wrapContentHeight()
        )
    }
}
```

GridCells.Adaptive 会在可用宽度内尽可能多放列，剩余宽度均分给各列。

## Intrinsic Measurements

解决"子项尺寸需要互相协商"的场景，无需二次测量。

```kotlin
Row(modifier = Modifier.height(IntrinsicSize.Min)) {
    Text("Hello", modifier = Modifier.weight(1f))
    Divider(                                      // Divider 需要知道行高
        modifier = Modifier
            .fillMaxHeight()                      // 填满 Row 高度
            .width(1.dp),
        color = Color.Gray
    )
    Text("World", modifier = Modifier.weight(1f))
}
```

- `IntrinsicSize.Min`：询问子项"你最少需要多高/多宽才能正确显示"。
- `IntrinsicSize.Max`：询问子项"你最多需要多高/多宽"。
- 自定义 Layout 需覆写 `MeasurePolicy` 的 `minIntrinsicWidth/Height`、`maxIntrinsicWidth/Height`。

## 自定义 Layout

Compose 强制 **单次测量**：每个子项在一次布局 pass 中只能被 measure 一次。

```kotlin
@Composable
fun VerticalStack(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    Layout(modifier = modifier, content = content) { measurables, constraints ->
        // 1. 测量所有子项
        val placeables = measurables.map { it.measure(constraints) }
        // 2. 计算自身尺寸
        val width = placeables.maxOf { it.width }
        val height = placeables.sumOf { it.height }
        // 3. 放置子项
        layout(width, height) {
            var y = 0
            placeables.forEach { placeable ->
                placeable.placeRelative(0, y)  // 自动适配 RTL
                y += placeable.height
            }
        }
    }
}
```

步骤：`measurables.map { it.measure(constraints) }` → `layout(w, h) { placeable.placeRelative(x, y) }`。

## 常见陷阱

| 陷阱 | 说明 |
|------|------|
| Modifier 顺序写反 | `padding` 在 `background` 前 = 背景不覆盖边距（最常见错误） |
| LazyColumn 不加 key | 列表增删时全部重组，滚动卡顿 |
| LazyColumn 不加 contentType | 异构列表 composition slot 跨类型复用，性能退化 |
| 嵌套同方向滚动 | `verticalScroll { LazyColumn }` 直接崩溃 |
| ConstraintLayout 过度使用 | 简单布局用 Row/Column 即可，ConstraintLayout 有额外开销 |
| 自定义 Layout 二次 measure | 编译期不报错但运行时崩溃，Compose 禁止多次测量 |
| weight 在 Box 中使用 | `weight` 仅限 RowScope/ColumnScope，Box 中不可用 |
| Lazy 列表 0 像素占位 | 初始高度 0 的 item 会被一次性全部 compose，丧失懒加载意义 |
