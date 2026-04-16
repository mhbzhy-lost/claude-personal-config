---
name: swiftui-navigation
description: "SwiftUI 导航：NavigationStack/NavigationSplitView/NavigationPath/TabView/toolbar 体系。"
tech_stack: [swiftui]
---

# SwiftUI 导航体系

> 来源：https://developer.apple.com/documentation/swiftui/navigation
> 版本基准：SwiftUI 6 / iOS 18 (Xcode 16)

## 用途

SwiftUI 导航体系提供栈式导航（NavigationStack）、分栏导航（NavigationSplitView）、标签页（TabView）三种核心范式，配合 NavigationPath 实现数据驱动的编程式路由，替代 iOS 16 前已废弃的 NavigationView。

## 何时使用

- 单栏 push/pop 流程（设置页、详情钻入）-- NavigationStack
- iPad / macOS 多栏主从布局 -- NavigationSplitView
- App 顶层 tab 切换 -- TabView
- 深链接 / 状态恢复需要序列化导航栈 -- NavigationPath + Codable
- 导航栏按钮 / 底部工具栏 -- toolbar 体系

## NavigationStack（栈式导航）

### 基础用法

```swift
NavigationStack {
    List(items) { item in
        NavigationLink(item.title, value: item) // value-based
    }
    .navigationDestination(for: Item.self) { item in
        ItemDetailView(item: item)
    }
    .navigationTitle("Items")
}
```

### 绑定 path 实现编程式导航

```swift
@State private var path = NavigationPath()

NavigationStack(path: $path) {
    Button("Go to Detail") {
        path.append(MyRoute.detail(id: 42))
    }
    .navigationDestination(for: MyRoute.self) { route in
        switch route {
        case .detail(let id): DetailView(id: id)
        case .settings:       SettingsView()
        }
    }
}

// 返回根视图
path.removeLast(path.count)
```

> **要点**：一个 NavigationStack 可注册多个 `navigationDestination(for:)`，但同一类型只能注册一次。

## navigationDestination(for:)

```swift
.navigationDestination(for: SomeHashable.self) { value in
    DestinationView(data: value)
}
```

- 参数类型必须遵循 `Hashable`（若需序列化还需 `Codable`）
- 修饰符放在 NavigationStack 内部的**任意子视图**上均可，SwiftUI 会向上查找最近的栈
- 适用于 NavigationStack 与 NavigationSplitView 内嵌的栈

### 用枚举统一路由

```swift
enum AppRoute: Hashable, Codable {
    case profile(userId: String)
    case settings
    case article(id: Int)
}

// 在 NavigationStack 内注册一次即可覆盖所有路由
.navigationDestination(for: AppRoute.self) { route in
    switch route {
    case .profile(let uid): ProfileView(userId: uid)
    case .settings:         SettingsView()
    case .article(let id):  ArticleView(id: id)
    }
}
```

## NavigationPath（类型擦除路由栈）

NavigationPath 是类型擦除容器，可混合存放不同 Hashable 类型的导航值。

### 核心 API

| 方法/属性 | 说明 |
|-----------|------|
| `append(_:)` | 压入值，触发 push |
| `removeLast(_:)` | 弹出指定数量 |
| `count` | 当前栈深度 |
| `isEmpty` | 栈是否为空 |
| `codable` | 返回 `CodableRepresentation?`（所有值须 Codable） |

### Codable 序列化（状态恢复核心）

```swift
@Observable
class Router {
    var path = NavigationPath()

    // 保存到 UserDefaults
    func save() {
        guard let representation = path.codable else { return }
        guard let data = try? JSONEncoder().encode(representation) else { return }
        UserDefaults.standard.set(data, forKey: "navigationPath")
    }

    // 从 UserDefaults 恢复
    func restore() {
        guard let data = UserDefaults.standard.data(forKey: "navigationPath"),
              let representation = try? JSONDecoder().decode(
                  NavigationPath.CodableRepresentation.self, from: data
              ) else { return }
        path = NavigationPath(representation)
    }
}
```

> **关键约束**：`path.codable` 仅在栈内**所有值均遵循 Codable** 时返回非 nil。只要混入一个非 Codable 的 Hashable 值，序列化即失败。

## NavigationSplitView（分栏导航）

### 两栏

```swift
@State private var selectedItem: Item?

NavigationSplitView {
    List(items, selection: $selectedItem) { item in
        NavigationLink(item.title, value: item)
    }
} detail: {
    if let item = selectedItem {
        ItemDetailView(item: item)
    } else {
        Text("Select an item")
    }
}
```

### 三栏

```swift
NavigationSplitView {
    // sidebar
    List(categories, selection: $selectedCategory) { ... }
} content: {
    // 二级列表
    List(filteredItems, selection: $selectedItem) { ... }
} detail: {
    // 详情
    DetailView(item: selectedItem)
}
```

### 列可见性控制

```swift
@State private var visibility: NavigationSplitViewVisibility = .automatic

NavigationSplitView(columnVisibility: $visibility) {
    ...
} detail: {
    ...
}
```

值：`.automatic` | `.all` | `.doubleColumn` | `.detailOnly`

样式：`.navigationSplitViewStyle(.balanced)` 或 `.prominentDetail`

> 在 iPhone 紧凑宽度下自动折叠为栈式导航。

## TabView（标签页）

### iOS 18 新 Tab API

```swift
enum AppTab: Hashable {
    case home, search, profile
}

@State private var selectedTab: AppTab = .home

TabView(selection: $selectedTab) {
    Tab("Home", systemImage: "house", value: .home) {
        HomeView()
    }
    Tab("Profile", systemImage: "person", value: .profile) {
        ProfileView()
    }
    Tab(role: .search) {   // 特殊角色：搜索
        SearchView()
    }
}
```

### TabSection + sidebarAdaptable（iPadOS 18）

```swift
TabView {
    Tab("Home", systemImage: "house") {
        HomeView()
    }
    TabSection("Media") {
        Tab("Movies", systemImage: "film") { MoviesView() }
        Tab("Music", systemImage: "music.note") { MusicView() }
    }
    TabSection("Social") {
        Tab("Messages", systemImage: "message") { MessagesView() }
    }
}
.tabViewStyle(.sidebarAdaptable) // iPad 上可在 tab bar / sidebar 间切换
```

> **注意**：`TabSection` 与 `selection` 绑定同时使用时存在已知兼容性问题，两者不能混用。需要 programmatic selection 时避免使用 TabSection。

### 旧写法（iOS 17 及以下）

```swift
TabView(selection: $selectedTab) {
    HomeView().tabItem { Label("Home", systemImage: "house") }.tag(0)
    ProfileView().tabItem { Label("Profile", systemImage: "person") }.tag(1)
}
```

## toolbar 体系

### 基本结构

```swift
.toolbar {
    ToolbarItem(placement: .topBarTrailing) {
        Button("Add", systemImage: "plus") { ... }
    }
    ToolbarItemGroup(placement: .bottomBar) {
        Button("Share") { ... }
        Spacer()
        Button("Delete", role: .destructive) { ... }
    }
}
```

### 常用 placement

| Placement | 位置 |
|-----------|------|
| `.topBarLeading` | 导航栏左侧（iOS 17+ 命名，替代 `.navigationBarLeading`） |
| `.topBarTrailing` | 导航栏右侧 |
| `.principal` | 导航栏中央（自定义标题区） |
| `.bottomBar` | 底部工具栏 |
| `.keyboard` | 键盘上方（输入辅助） |
| `.confirmationAction` | Sheet 确认按钮位 |
| `.cancellationAction` | Sheet 取消按钮位 |
| `.destructiveAction` | Sheet 危险操作位 |

### 控制可见性

```swift
.toolbar(.hidden, for: .navigationBar)   // 隐藏导航栏
.toolbar(.hidden, for: .tabBar)          // 隐藏 tab bar
.toolbarBackground(.visible, for: .navigationBar) // 强制显示背景
.toolbarColorScheme(.dark, for: .navigationBar)   // 导航栏暗色
```

## NavigationStack vs NavigationView 迁移

| NavigationView（已废弃） | 新 API |
|--------------------------|--------|
| `NavigationView { ... }` | `NavigationStack { ... }`（单栏）或 `NavigationSplitView`（多栏） |
| `NavigationLink(destination: SomeView())` | `NavigationLink(value: someHashable)` + `.navigationDestination(for:)` |
| `.navigationViewStyle(.columns)` | `NavigationSplitView` |
| 无法编程式 push/pop | `NavigationPath` + `path.append()` / `path.removeLast()` |
| 无法序列化导航状态 | `NavigationPath.CodableRepresentation` |

> **迁移陷阱**：不要在 NavigationStack 内嵌套另一个 NavigationStack，会导致双层导航栏。

## 常见陷阱

1. **重复嵌套 NavigationStack** -- 只在最外层放一个栈，子视图不要再包 NavigationStack
2. **navigationDestination 注册位置错误** -- 必须放在 NavigationStack 内部视图上，放在栈外无效
3. **同类型多次注册 navigationDestination** -- 同一 Hashable 类型在同一栈内只能注册一次，重复注册行为未定义
4. **NavigationPath.codable 返回 nil** -- 检查栈内是否混入了非 Codable 的值
5. **路由枚举变更导致反序列化失败** -- 修改路由 case 结构后旧的序列化数据无法解码，需做版本兼容或清除旧数据
6. **NavigationSplitView 在 iPhone 上的行为** -- 紧凑宽度自动折叠为栈，selection 绑定变为 push 触发器，注意测试两种布局
7. **TabSection 与 selection 绑定冲突** -- iOS 18 已知问题，需要编程式选择时不要使用 TabSection
8. **toolbar 修饰符需在 NavigationStack 内** -- `.toolbar {}` 放在 NavigationStack 外部不生效

## 组合提示

| 场景 | 搭配 Skill |
|------|-----------|
| 列表/表单等内容视图 | `swiftui-components` |
| 视图间数据传递与状态管理 | `swiftui-data-flow` |
| 导航转场动画 | `swiftui-animation` |
| 自适应布局（紧凑/正常宽度） | `swiftui-layout` |
| UIKit 页面混合导航 | `swiftui-uikit-interop` |
