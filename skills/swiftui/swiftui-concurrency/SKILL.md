---
name: swiftui-concurrency
description: "SwiftUI 并发：.task modifier、@MainActor、Sendable、AsyncSequence、TaskGroup、Swift 6 严格并发。"
tech_stack: [swiftui]
---

# SwiftUI 中的 Swift Concurrency

> 来源：https://developer.apple.com/documentation/swiftui/view/task(priority:_:)
> https://developer.apple.com/documentation/swift/adoptingswift6
> 版本基准：Swift 6.2 / Xcode 26 / iOS 18+

## 用途

在 SwiftUI 视图中安全地执行异步工作（网络请求、数据流监听、并行计算），同时保证 UI 更新在主线程执行、无数据竞争。

## 何时使用

- 视图出现时发起异步加载（替代 `onAppear` + `Task { }`）
- 监听持续数据流（WebSocket、传感器、通知）
- 并行执行多个独立请求并汇总结果
- 迁移项目到 Swift 6 严格并发模式

## .task Modifier

`.task` 是 SwiftUI 中执行异步工作的首选方式。核心特性：**视图消失时自动取消任务**（协作式取消）。

### 基础版：视图生命周期绑定

```swift
struct ProfileView: View {
    @State private var user: User?

    var body: some View {
        VStack { /* ... */ }
            .task {
                // 视图出现时执行，视图消失时自动取消
                user = try? await api.fetchUser()
            }
    }
}
```

时序：`.task` 在 `onAppear` 之后、首帧渲染之前触发。闭包运行在 `@MainActor` 上下文中（继承自 View）。

### id 版：响应值变化

```swift
struct SearchView: View {
    @State private var query = ""
    @State private var results: [Item] = []

    var body: some View {
        List(results) { item in Text(item.name) }
            .searchable(text: $query)
            .task(id: query) {
                // query 变化时：取消旧任务 → 启动新任务
                try? await Task.sleep(for: .milliseconds(300)) // 防抖
                guard !Task.isCancelled else { return }
                results = (try? await api.search(query)) ?? []
            }
    }
}
```

**关键行为**：`id` 值变化时，SwiftUI 先取消前一个 task，再启动新 task。旧 task 被标记为取消（协作式），不会被强制终止——长耗时操作需检查 `Task.isCancelled` 或使用 `try Task.checkCancellation()`。

### 与 onAppear + Task 的区别

| | `.task` | `onAppear { Task { } }` |
|---|---|---|
| 自动取消 | 视图消失时取消 | 不会，需手动管理 |
| 响应值变化 | `.task(id:)` 内置支持 | 需配合 `onChange` |
| 推荐度 | 首选 | 仅当需要非结构化生命周期时使用 |

## @MainActor 与 UI 更新

`@MainActor` 保证代码在主线程执行，所有 UI 更新必须在此隔离域。

### SwiftUI View 已隐式 @MainActor

Swift 6 起，`View` 协议标注了 `@MainActor`，所有 `body` 及 `.task` 闭包自动在主 actor 上运行，无需手动标注。

### ViewModel 标注

```swift
@Observable
@MainActor
class WeatherViewModel {
    var temperature: Double = 0
    var isLoading = false

    func refresh() async {
        isLoading = true
        defer { isLoading = false }
        // 网络请求在 await 点可能切换到后台执行
        temperature = try? await weatherService.fetch().temp ?? 0
    }
}
```

**规则**：持有 UI 状态的 `@Observable` 类应标 `@MainActor`。重计算逻辑用 `nonisolated` 或 `@concurrent`（Swift 6.2）移到后台。

### 从后台切回主线程

```swift
// 在非 @MainActor 上下文中更新 UI 状态
await MainActor.run {
    self.items = fetchedItems
}
```

## Sendable 约束

`Sendable` 是编译期契约，声明类型可以安全跨隔离域传递。Swift 6 严格模式下违反 Sendable 约束是编译错误。

### 自动 Sendable

值类型（所有存储属性也是 Sendable 的 struct/enum）、actor 类型自动满足。

### 手动处理

```swift
// 方式 1：确保线程安全后标记
final class ImageCache: @unchecked Sendable {
    private let lock = NSLock()
    private var cache: [URL: UIImage] = [:]
    // 所有访问经过 lock 保护
}

// 方式 2：使用 Mutex（Swift 6+）
import Synchronization

final class TokenStore: Sendable {
    let token = Mutex<String?>(.none)
}
```

**SwiftUI 陷阱**：`View` 本身不是 Sendable。不要在 `Task { }` 闭包中捕获整个 view 实例——提取所需值为局部变量再传入。

## AsyncSequence 消费

在 `.task` 中用 `for await` 消费持续数据流，视图消失时流自动终止。

```swift
struct NotificationsView: View {
    @State private var events: [Event] = []

    var body: some View {
        List(events) { event in Text(event.title) }
            .task {
                // 视图消失 → task 取消 → for-await 循环退出
                for await event in notificationService.eventStream {
                    events.append(event)
                }
            }
    }
}
```

自定义 `AsyncStream` 桥接回调 API：

```swift
let locationStream = AsyncStream<CLLocation> { continuation in
    locationManager.onUpdate = { continuation.yield($0) }
    locationManager.onEnd = { continuation.finish() }
    continuation.onTermination = { _ in locationManager.stop() }
}
```

**注意**：`for await` 循环中抛出错误会终止整个循环。需要容错时在循环体内 `do/catch`，或使用不抛错的 `AsyncStream`（非 `AsyncThrowingStream`）。

## TaskGroup

并行执行多个独立任务并汇总结果。适合"加载多个数据源后合并"场景。

```swift
@MainActor
func loadDashboard() async -> Dashboard {
    await withTaskGroup(of: DashboardSection?.self) { group in
        group.addTask { await self.fetchProfile() }      // 并行
        group.addTask { await self.fetchNotifications() } // 并行
        group.addTask { await self.fetchActivity() }      // 并行

        var sections: [DashboardSection] = []
        for await section in group {
            if let section { sections.append(section) }
        }
        return Dashboard(sections: sections)
    }
}
```

**注意**：`addTask` 闭包继承调用者的 actor 隔离。在 `@MainActor` 上下文中添加的 task 默认也在主 actor 上——如需后台执行，闭包内的函数应标 `nonisolated` 或 `@concurrent`（Swift 6.2）。

## Actor Isolation 最佳实践

```swift
// 自定义 actor 封装共享可变状态
actor DataStore {
    private var items: [Item] = []

    func add(_ item: Item) { items.append(item) }
    func getAll() -> [Item] { items }
}

// 视图中使用
struct ItemListView: View {
    let store = DataStore()
    @State private var items: [Item] = []

    var body: some View {
        List(items) { item in Text(item.name) }
            .task {
                items = await store.getAll()  // 跨 actor 需要 await
            }
    }
}
```

选型指南：
- **@MainActor**：UI 状态、ViewModel → 主线程安全
- **自定义 actor**：共享业务状态（缓存、数据库代理）→ 串行隔离
- **nonisolated**：纯计算、不访问 actor 状态 → 无隔离限制

## Swift 6 严格并发迁移

### 渐进式策略（推荐）

1. **Minimal**（默认）→ 仅检查显式标注的并发代码
2. **Targeted** → 额外检查采用了 Sendable 的代码
3. **Complete** → 全量检查，等同 Swift 6 language mode

Xcode 设置路径：`Build Settings → Swift Compiler → Strict Concurrency Checking`

### 高频修复模式

| 错误 | 修复 |
|---|---|
| `Capture of non-Sendable type` | 提取为 Sendable 类型、使用 actor、或 `@unchecked Sendable` |
| `Call to main-actor-isolated method in non-isolated context` | 加 `await`，或将调用方也标 `@MainActor` |
| `Non-sendable type passed across actor boundary` | 使类型满足 `Sendable`，或复制值再传递 |
| `Mutation of captured var in concurrently-executing code` | 改用 actor 或 `let` 绑定 |

### Swift 6.2 Approachable Concurrency

Swift 6.2（WWDC 2025）大幅降低迁移成本：

```swift
// Package.swift — 新项目默认开启
.target(name: "MyApp", swiftSettings: [
    .defaultIsolation(MainActor.self)  // 所有代码默认 @MainActor
])
```

新行为（开启 defaultIsolation 后）：
- **所有未标注的代码默认在 @MainActor**——不再需要到处写 `@MainActor`
- **需要后台执行时显式标注 `@concurrent`**（替代旧的 nonisolated async）
- **`nonisolated(nonsending)`**：不访问 actor 状态，但在调用方线程执行（不切换）

```swift
// Swift 6.2：显式声明后台工作
@concurrent
func decodeJSON(_ data: Data) throws -> Model {
    try JSONDecoder().decode(Model.self, from: data)
}
```

迁移建议：新项目直接启用 `defaultIsolation(MainActor.self)`；存量项目先用 Complete 模式修完警告，再切换。

## 常见陷阱

1. **`.task` 取消是协作式的**：仅标记取消状态，不会强制终止。长循环必须检查 `Task.isCancelled`，否则视图已消失但任务仍在跑
2. **`.task(id:)` 的 id 必须是 Equatable**：自定义类型需显式遵循。id 值相等时不会重新触发
3. **`@Observable` + `@MainActor` 二者都要标**：`@Observable` 不会自动推导 actor 隔离，遗漏 `@MainActor` 会导致后台线程 UI 更新
4. **TaskGroup 中的错误传播**：`withThrowingTaskGroup` 中任一子任务抛错，其余子任务会被自动取消。仅需部分失败容忍时，返回 `Result` 而非 throw
5. **`@unchecked Sendable` 是安全后门**：编译器不再检查，线程安全由开发者自行保证。仅用于确实无法满足编译器要求的第三方类型包装
6. **Swift 6.2 defaultIsolation 影响范围**：仅影响当前 target，依赖库不受影响。跨模块边界仍需显式标注
