---
name: swiftui-layout
description: "SwiftUI 布局系统：Stack/Grid/ViewThatFits/Layout 协议、GeometryReader、安全区、ScrollView。"
tech_stack: [swiftui, ios, mobile-native]
language: [swift]
capability: [ui-layout]
---

# SwiftUI 布局系统

> 来源：https://developer.apple.com/documentation/swiftui/view-layout
> 版本基准：SwiftUI 6 / iOS 18 / Xcode 16

## 用途

SwiftUI 布局系统负责将视图树中每个节点的大小与位置确定下来。核心流程为三步循环：父视图向子视图提出尺寸建议（proposal） -> 子视图返回自身所需尺寸 -> 父视图将子视图放置到坐标系中。

## 何时使用

- 排列一组视图为行、列或层叠结构 -- Stack 系列
- 构建二维网格、瀑布流 -- Grid / LazyVGrid
- 同一位置根据可用空间自动选择布局方案 -- ViewThatFits
- 内置容器无法满足的排列逻辑 -- Layout 协议
- 需要读取父容器或自身尺寸做计算 -- GeometryReader / containerRelativeFrame
- 控制可滚动内容的位置与吸附 -- ScrollView + scrollPosition

## Stack 系列（HStack / VStack / ZStack）

```swift
// spacing: 子视图间距；alignment: 交叉轴对齐
HStack(alignment: .top, spacing: 8) { A(); B(); C() }
VStack(alignment: .leading, spacing: 12) { A(); B() }
ZStack(alignment: .bottomTrailing) { Background(); Badge() }
```

**布局行为**：
- HStack/VStack 将可用空间按子视图灵活度分配（固定尺寸优先，弹性视图均分剩余）。
- ZStack 将所有子视图叠放于同一区域，最后的子视图在最上层。
- `Spacer()` 在 Stack 中贪婪吸收剩余空间；`Spacer(minLength: 0)` 允许压缩到零。
- `.layoutPriority(1)` 可提升某个子视图的分配优先级。

## Lazy Stack（LazyHStack / LazyVStack）

```swift
ScrollView {
    LazyVStack(alignment: .leading, spacing: 10, pinnedViews: [.sectionHeaders]) {
        Section(header: Text("Header")) {
            ForEach(items) { item in ItemView(item: item) }
        }
    }
}
```

**与普通 Stack 的区别**：
- 仅在即将进入可见区域时才创建子视图（按需加载）。
- **必须嵌在 ScrollView 内**才有意义。
- `pinnedViews` 参数可实现粘性 section header/footer。
- 不支持 `Spacer()` 的弹性行为（无限长度）。

## Grid（固定网格 vs 自适应网格）

### 静态 Grid（iOS 16+）

```swift
Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 8) {
    GridRow {
        Text("Name"); TextField("", text: $name)
    }
    GridRow {
        Text("Email"); TextField("", text: $email)
    }
    // 不放在 GridRow 中的视图独占整行
    Divider()
}
```

- 列宽由各列最宽子视图决定；行高同理。
- `gridCellColumns(_:)` 让一个子视图横跨多列。

### LazyVGrid / LazyHGrid（iOS 14+）

```swift
let columns = [
    GridItem(.fixed(80)),                        // 固定 80pt
    GridItem(.flexible(minimum: 60, maximum: 200)), // 弹性范围
    GridItem(.adaptive(minimum: 50)),            // 尽可能塞入多个 >=50pt 的列
]
LazyVGrid(columns: columns, spacing: 16) {
    ForEach(items) { item in Cell(item: item) }
}
```

**GridItem.Size 三种模式**：
| 模式 | 行为 |
|---|---|
| `.fixed(CGFloat)` | 列宽固定 |
| `.flexible(min:max:)` | 在范围内弹性 |
| `.adaptive(minimum:maximum:)` | 自动计算列数，每列 >= minimum |

## ViewThatFits（iOS 16+）

```swift
ViewThatFits(in: .horizontal) {
    HStack { Icon(); Title(); Subtitle() }   // 优先：横排
    VStack { Icon(); Title(); Subtitle() }   // 回退：竖排
    Icon()                                    // 最小方案
}
```

- 按声明顺序依次测量子视图，**选中第一个在指定轴上不超出可用空间的方案**。
- 参数 `in:` 可指定 `.horizontal`、`.vertical` 或两者（默认两轴都检查）。
- 典型用途：响应式布局（横竖屏切换、Widget 多尺寸适配）。

## Layout 协议（自定义布局，iOS 16+）

实现 `Layout` 协议需要两个必选方法：

```swift
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) -> CGSize {
        let containerWidth = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for sub in subviews {
            let size = sub.sizeThatFits(.unspecified)
            if x + size.width > containerWidth && x > 0 {
                y += rowHeight + spacing
                x = 0; rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: containerWidth, height: y + rowHeight)
    }

    func placeSubviews(
        in bounds: CGRect,
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for sub in subviews {
            let size = sub.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX && x > bounds.minX {
                y += rowHeight + spacing
                x = bounds.minX; rowHeight = 0
            }
            sub.place(at: CGPoint(x: x, y: y), proposal: .init(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

// 使用
FlowLayout(spacing: 6) {
    ForEach(tags) { tag in TagView(tag) }
}
```

**要点**：
- `Cache` 关联类型默认为 `()`；对复杂布局可用 `makeCache(subviews:)` 缓存计算结果。
- `ProposedViewSize` 有快捷值：`.zero`、`.infinity`、`.unspecified`。
- 可用 `AnyLayout` 在不同 Layout 间动态切换并获得动画过渡。

```swift
let layout = isGrid ? AnyLayout(GridLayout()) : AnyLayout(FlowLayout())
layout { /* subviews */ }
```

## GeometryReader

```swift
// 反模式：直接包裹内容（会撑满父容器）
GeometryReader { geo in
    Text("W: \(geo.size.width)")
}

// 推荐：放在 background/overlay 中，通过 PreferenceKey 传递尺寸
SomeView()
    .background(GeometryReader { geo in
        Color.clear.preference(key: SizeKey.self, value: geo.size)
    })
    .onPreferenceChange(SizeKey.self) { size = $0 }
```

**iOS 18+ 替代方案**：`onGeometryChange`（已回溯至 iOS 16）。

```swift
SomeView()
    .onGeometryChange(for: CGSize.self) { proxy in proxy.size }
    transform: { size in self.viewSize = size }
```

**原则**：GeometryReader 会消耗全部建议空间并破坏理想尺寸传递——仅在确实需要读取坐标/尺寸时使用，且优先放在 background/overlay 中。

## 安全区（safeAreaInset / safeAreaPadding / ignoresSafeArea）

| 修饰符 | 引入版本 | 作用 |
|---|---|---|
| `.ignoresSafeArea(_:edges:)` | iOS 14 | 让视图内容延伸到安全区外（背景铺满屏幕） |
| `.safeAreaInset(edge:content:)` | iOS 15 | 在指定边插入额外视图，**同时收缩**内容区安全区域 |
| `.safeAreaPadding(_:)` | iOS 17 | 在安全区边缘添加额外间距（无需附加视图） |

```swift
// 底部浮动按钮 + 列表内容自动让出空间
List { /* ... */ }
    .safeAreaInset(edge: .bottom) {
        Button("确认") { }
            .frame(maxWidth: .infinity)
            .padding()
            .background(.bar)
    }

// 为 ScrollView 内容添加水平安全区间距
ScrollView(.horizontal) { /* ... */ }
    .safeAreaPadding(.horizontal, 16)
```

## containerRelativeFrame（iOS 17+）

替代 GeometryReader 的常见场景——让视图尺寸相对于最近的容器（ScrollView、NavigationSplitView 列、窗口）。

```swift
// 宽度等于容器宽度
Image("hero")
    .containerRelativeFrame(.horizontal)

// 将容器宽度分为 5 份，该视图占 2 份
ItemView()
    .containerRelativeFrame(.horizontal, count: 5, span: 2, spacing: 8)

// 自定义计算
ItemView()
    .containerRelativeFrame(.horizontal) { length, axis in
        length * 0.8  // 占容器宽度 80%
    }
```

**常见容器**：ScrollView、NavigationSplitView 的列、TabView、窗口。普通 VStack/HStack **不是**容器。

## ScrollView（scrollPosition / scrollTargetBehavior）

### iOS 17：scrollPosition(id:)

```swift
@State private var selectedID: Item.ID?

ScrollView {
    LazyVStack {
        ForEach(items) { item in
            ItemView(item: item)
                .id(item.id)
        }
    }
    .scrollTargetLayout()        // 标记子视图为滚动目标
}
.scrollPosition(id: $selectedID)
.scrollTargetBehavior(.viewAligned) // 吸附到子视图边界
```

### iOS 18：ScrollPosition 类型（增强）

```swift
@State private var position = ScrollPosition(edge: .top)

ScrollView {
    ForEach(items) { item in ItemView(item: item).id(item.id) }
}
.scrollPosition($position)

// 程序化滚动
Button("到底部") { position.scrollTo(edge: .bottom) }
Button("到某项") { position.scrollTo(id: targetID) }
Button("到偏移") { position.scrollTo(point: CGPoint(x: 0, y: 300)) }
```

**scrollTargetBehavior 预设**：
- `.paging` -- 整页翻动
- `.viewAligned` -- 吸附到最近子视图
- 自定义：遵守 `ScrollTargetBehavior` 协议

**scrollIndicators / scrollClipDisabled**：
```swift
ScrollView {  }
    .scrollIndicators(.hidden)
    .scrollClipDisabled()  // 允许内容溢出 ScrollView 可视区域
```

## 常见陷阱

1. **GeometryReader 撑满空间**：直接包裹内容会导致视图贪婪地占据所有建议空间。改用 `.background(GeometryReader{...})` 或 iOS 16+ 的 `onGeometryChange`。

2. **LazyStack 中使用 Spacer**：LazyVStack/LazyHStack 的长度可能无限，Spacer 无法按预期工作。需要固定尺寸或改用普通 Stack。

3. **Grid vs LazyVGrid 选错**：`Grid`（iOS 16+）适合行数已知的静态表单；`LazyVGrid` 适合数据驱动的长列表。两者 API 完全不同。

4. **scrollPosition 需要 scrollTargetLayout**：使用 `.scrollPosition(id:)` 时，**必须**在 LazyVStack 上添加 `.scrollTargetLayout()`，否则绑定不会更新。

5. **containerRelativeFrame 的容器不是任意父视图**：仅 ScrollView、NavigationSplitView 列、TabView、窗口被视为容器。嵌套在 HStack/VStack 中不会生效。

6. **ignoresSafeArea 与 safeAreaInset 混用**：`ignoresSafeArea` 扩展视图到安全区外，`safeAreaInset` 收缩安全区。两者作用方向相反，叠加使用时注意顺序。

7. **AnyLayout 切换动画**：用 `AnyLayout` 在两种 Layout 间切换时，需要保持子视图的 identity 一致（相同 id），否则不会获得平滑的过渡动画。
