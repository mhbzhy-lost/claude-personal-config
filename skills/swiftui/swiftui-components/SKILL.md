---
name: swiftui-components
description: "SwiftUI 常用组件：List/Form/Sheet/Alert/ScrollView/ContentUnavailableView/searchable 最新 API。"
tech_stack: [swiftui]
language: [swift]
---

# SwiftUI 常用组件（iOS 17-18 重点）

> 来源：Apple Developer Documentation https://developer.apple.com/documentation/swiftui
> 版本基准：SwiftUI 6 / iOS 18 (Xcode 16)

## 用途

覆盖日常 App 中最高频使用的列表、表单、弹窗、滚动、搜索、空状态等组件在 iOS 17/18 中新增或显著改变的 API，帮助快速查阅正确用法。

## 何时使用

- 构建包含列表滑动操作、折叠分组的数据展示界面
- 需要 Sheet/Inspector/popover 等模态呈现并自定义高度/尺寸
- 使用 ScrollView 实现分页、吸附、程序化滚动
- 展示空状态 / 搜索无结果占位
- 为 NavigationStack 内的视图添加搜索栏

---

## List（swipeActions / disclosureGroupStyle）

### swipeActions（iOS 15+，iOS 17 稳定）

```swift
List {
    ForEach(items) { item in
        Text(item.name)
            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                Button(role: .destructive) { delete(item) } label: {
                    Label("Delete", systemImage: "trash")
                }
                Button { pin(item) } label: {
                    Label("Pin", systemImage: "pin")
                }
                .tint(.yellow)
            }
            .swipeActions(edge: .leading) {
                Button { markUnread(item) } label: {
                    Label("Unread", systemImage: "envelope.badge")
                }
                .tint(.blue)
            }
    }
}
```

- `edge`：`.leading` / `.trailing`（默认 trailing）
- `allowsFullSwipe`：完全滑动触发第一个按钮（默认 true）
- 按钮顺序：离边缘近 -> 远

### DisclosureGroup 自定义样式（iOS 16+）

```swift
struct AccentDisclosureStyle: DisclosureGroupStyle {
    func makeBody(configuration: Configuration) -> some View {
        VStack {
            Button {
                withAnimation { configuration.isExpanded.toggle() }
            } label: {
                HStack {
                    configuration.label
                    Spacer()
                    Image(systemName: "chevron.right")
                        .rotationEffect(.degrees(configuration.isExpanded ? 90 : 0))
                }
            }
            if configuration.isExpanded {
                configuration.content
                    .padding(.leading, 16)
            }
        }
    }
}

// 使用
DisclosureGroup("Section") { ... }
    .disclosureGroupStyle(AccentDisclosureStyle())
```

---

## Form / LabeledContent

### LabeledContent（iOS 16+）

在 Form 内自动对齐 label-value 布局，替代手写 `HStack + Spacer`。

```swift
Form {
    // 纯文本显示
    LabeledContent("Version", value: "2.1.0")

    // 格式化值
    LabeledContent("Progress", value: 0.8, format: .percent)

    // 自定义 content
    LabeledContent("Color") {
        ColorPicker("", selection: $color)
    }

    // 包裹没有内建 label 的控件
    LabeledContent("Volume") {
        Slider(value: $volume, in: 0...100)
    }
}
```

- iOS 对齐规则：label 左对齐，value 右对齐
- macOS 对齐规则：label 右对齐，value 左对齐
- 可通过 `LabeledContentStyle` 协议自定义样式

---

## Sheet / Inspector / popover / fullScreenCover

### Sheet + presentationDetents（iOS 16+，核心 API）

```swift
.sheet(isPresented: $showSheet) {
    SheetContent()
        // 可用停靠高度（必须提供 Set）
        .presentationDetents([.medium, .large, .fraction(0.3), .height(200)])
        // 跟踪当前 detent
        // .presentationDetents([.medium, .large], selection: $selectedDetent)

        .presentationDragIndicator(.visible)       // .visible | .hidden | .automatic
        .presentationCornerRadius(20)               // iOS 16.4+
        .presentationBackgroundInteraction(.enabled(upThrough: .medium)) // iOS 16.4+
        .presentationContentInteraction(.scrolls)   // .scrolls | .resizes（iOS 16.4+）
        .interactiveDismissDisabled()               // 禁止下滑关闭
}
```

**自定义 Detent**（iOS 16+）：

```swift
extension PresentationDetent {
    static let small = Self.custom(SmallDetent.self)
}
struct SmallDetent: CustomPresentationDetent {
    static func height(in context: Context) -> CGFloat? {
        max(context.maxDetentValue * 0.2, 120)
    }
}
```

### Inspector（iOS 17+ 新增）

在 regular 宽度下显示为右侧栏，compact 下自动降级为 sheet。

```swift
NavigationSplitView { ... } detail: {
    DetailView()
        .inspector(isPresented: $showInspector) {
            InspectorContent()
                .inspectorColumnWidth(min: 200, ideal: 300, max: 400)
                // compact 下降级为 sheet 时可加 detent
                .presentationDetents([.medium, .large])
        }
}
// 切换
.toolbar { Button("Inspector") { showInspector.toggle() } }
```

### popover（iOS 18 行为变化）

```swift
.popover(isPresented: $show, attachmentAnchor: .point(.top)) {
    PopoverContent()
        .frame(idealWidth: 300, idealHeight: 200)
}
```

- iOS 17：`arrowEdge` 是建议值，系统会自动调整防止裁切
- iOS 18：`arrowEdge` 变为强制值，可能导致裁切。建议使用 **无 arrowEdge 的新重载**（iOS 18+），让系统自动选择方向
- iPhone 上 popover 会自动降级为 sheet

### fullScreenCover

```swift
.fullScreenCover(isPresented: $showFull) {
    FullView()
        .interactiveDismissDisabled()  // 通常全屏需手动加关闭按钮
}
```

---

## Alert / ConfirmationDialog

### Alert（iOS 15+ 现代 API）

```swift
.alert("Delete Item?", isPresented: $showAlert, presenting: item) { item in
    Button("Delete", role: .destructive) { delete(item) }
    Button("Cancel", role: .cancel) {}
} message: { item in
    Text("This will permanently delete \"\(item.name)\".")
}
```

### ConfirmationDialog

```swift
.confirmationDialog("Share Photo", isPresented: $showDialog, titleVisibility: .visible) {
    Button("Save to Library") { ... }
    Button("Copy Link") { ... }
    Button("Delete", role: .destructive) { ... }
} message: {
    Text("Choose an action for this photo.")
}
```

**iOS 17 新增修饰符**：
- `.dialogIcon(Image(...))` — 为对话框添加图标
- `.dialogSuppressionToggle(isSuppressed: $suppressed)` — "不再提示" 复选框（跨平台可用）

---

## ScrollView 增强（scrollPosition / scrollTargetBehavior）

### scrollPosition — 程序化滚动

**iOS 17（基于 ID）**：

```swift
@State private var scrolledID: Item.ID?

ScrollView {
    LazyVStack {
        ForEach(items) { item in
            ItemRow(item: item)
        }
    }
    .scrollTargetLayout()  // 必须配合使用
}
.scrollPosition(id: $scrolledID)
```

**iOS 18（ScrollPosition 结构体，更强大）**：

```swift
@State private var position = ScrollPosition(edge: .top)

ScrollView {
    // content...
}
.scrollPosition($position)

// 程序化滚动
Button("Top")    { position.scrollTo(edge: .top) }
Button("Bottom") { position.scrollTo(edge: .bottom) }
Button("Item")   { position.scrollTo(id: "avatar", anchor: .center) }
Button("Offset") { position.scrollTo(x: 0, y: 500) }
```

### scrollTargetBehavior（iOS 17+）

```swift
ScrollView(.horizontal) {
    LazyHStack(spacing: 16) {
        ForEach(cards) { card in
            CardView(card: card)
                .containerRelativeFrame(.horizontal, count: 1, spacing: 16)
        }
    }
    .scrollTargetLayout()  // 告知 SwiftUI 哪些子视图是吸附目标
}
.scrollTargetBehavior(.viewAligned)  // 吸附到子视图边缘
// 或
.scrollTargetBehavior(.paging)       // 整页翻页
```

- `.viewAligned`：吸附到最近的子视图。可加 `limitBehavior: .alwaysByOne` 限制每次只滚一个
- `.paging`：按 ScrollView 可见尺寸翻页
- 可实现 `ScrollTargetBehavior` 协议自定义行为

### scrollClipDisabled（iOS 17+）

```swift
ScrollView(.horizontal) { ... }
    .scrollClipDisabled()  // 内容可溢出 ScrollView 边界显示（阴影/装饰不被裁切）
```

### onScrollGeometryChange（iOS 18+）

```swift
ScrollView {
    // content...
}
.onScrollGeometryChange(for: CGFloat.self) { geometry in
    geometry.contentOffset.y
} action: { oldValue, newValue in
    isScrolledDown = newValue > 50
}
```

---

## ContentUnavailableView

iOS 17+ 新增，用于展示空状态 / 无内容 / 搜索无结果。

```swift
// 基础用法
ContentUnavailableView("No Bookmarks",
    systemImage: "bookmark",
    description: Text("Items you bookmark will appear here."))

// 带操作按钮
ContentUnavailableView {
    Label("No Network", systemImage: "wifi.slash")
} description: {
    Text("Check your internet connection and try again.")
} actions: {
    Button("Retry") { reload() }
        .buttonStyle(.borderedProminent)
}

// 内建搜索空状态（自动显示搜索词）
ContentUnavailableView.search
// 或指定搜索词
ContentUnavailableView.search(text: searchText)
```

典型模式：

```swift
List { ... }
    .overlay {
        if filteredItems.isEmpty {
            ContentUnavailableView.search(text: searchText)
        }
    }
```

---

## searchable modifier

### 基础用法（iOS 15+）

```swift
NavigationStack {
    ItemList()
        .searchable(text: $searchText, prompt: "Search items")
}
```

### iOS 17 新增：isPresented

```swift
.searchable(text: $searchText, isPresented: $isSearching, prompt: "Search")
// isSearching 绑定：程序化控制搜索栏的激活/关闭
```

### searchScopes（iOS 16+）

```swift
.searchable(text: $searchText)
.searchScopes($scope, activation: .onSearchPresentation) {
    Text("All").tag(SearchScope.all)
    Text("Books").tag(SearchScope.books)
    Text("Videos").tag(SearchScope.videos)
}
```

- `activation`：`.onSearchPresentation`（展开搜索时显示）| `.onTextEntry`（输入文字后显示）

### searchSuggestions（iOS 16+）

```swift
.searchable(text: $searchText)
.searchSuggestions {
    ForEach(suggestions) { s in
        Text(s.name)
            .searchCompletion(s.name)  // 点击后填入搜索栏
    }
}
```

### Tokens（iOS 16+）

```swift
.searchable(text: $searchText, tokens: $activeTokens, suggestedTokens: $suggestedTokens) { token in
    Label(token.name, systemImage: token.icon)
}
```

### placement

```swift
.searchable(text: $searchText, placement: .navigationBarDrawer(displayMode: .always))
// .automatic | .sidebar | .toolbar | .navigationBarDrawer
```

---

## 常见陷阱

1. **scrollTargetLayout 遗漏**：使用 `.scrollTargetBehavior(.viewAligned)` 时必须在内部 LazyStack 上加 `.scrollTargetLayout()`，否则吸附不生效
2. **presentationDetents 传空集合**：`.presentationDetents([])` 会导致 sheet 无法正常显示
3. **popover iOS 18 裁切**：iOS 18 严格遵守 `arrowEdge`，升级后如出现裁切，改用无 `arrowEdge` 参数的新重载
4. **searchable 必须在 NavigationStack 内**：`.searchable` 需要外层有导航容器才能渲染搜索栏
5. **Inspector compact 降级**：Inspector 在 iPhone 上降级为 sheet，需额外加 `.presentationDetents` 否则默认 `.large`
6. **scrollPosition(id:) vs scrollPosition(_:)**：iOS 17 用 `id: Binding<ID?>` 版本；iOS 18 用 `ScrollPosition` 结构体版本，两者不要混用
7. **ContentUnavailableView.search** 只适合搜索场景；通用空状态应使用自定义初始化器
8. **swipeActions 按钮顺序**：trailing 侧第一个按钮离右边缘最近（用于 fullSwipe），容易搞反
