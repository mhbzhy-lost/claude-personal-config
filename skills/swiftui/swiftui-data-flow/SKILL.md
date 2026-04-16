---
name: swiftui-data-flow
description: "SwiftUI 数据流：@Observable/Observation 框架、@State/@Binding/@Environment、SwiftData 集成。"
tech_stack: [swiftui]
language: [swift]
---

# SwiftUI 数据流

> 来源：https://developer.apple.com/documentation/observation
> https://developer.apple.com/documentation/swiftdata
> 版本基准：SwiftUI 6 / iOS 17+ (Observation) / iOS 17+ (SwiftData)

## 用途

管理 SwiftUI 视图与数据模型之间的响应式绑定，以及通过 SwiftData 实现声明式持久化。

## 何时使用

- 视图需要响应模型属性变化自动刷新
- 多视图共享同一数据源（用户会话、设置等）
- 需要本地持久化结构化数据（替代 Core Data）
- 父子视图之间双向传递值类型或引用类型数据

## Observation 框架（@Observable）

iOS 17 引入的 `Observation` 框架用 `@Observable` 宏替代 `ObservableObject` 协议。核心优势：**属性级别的精细追踪**——视图只在它实际读取的属性变化时才刷新，不再因任何 `@Published` 变化就全量重绘。

```swift
import Observation

@Observable
class UserProfile {
    var name = ""
    var avatar: URL?
    @ObservationIgnored var internalCache: [String: Any] = [:] // 不触发视图刷新
}
```

关键点：
- 所有存储属性默认被追踪（包括 `private`），无需标 `@Published`
- 用 `@ObservationIgnored` 排除不需要触发刷新的属性（如缓存、计时器）
- `@Observable` 只能用于 `class`，不能用于 `struct`

## @Observable vs ObservableObject 迁移

| 旧（Combine）| 新（Observation）|
|---|---|
| `class VM: ObservableObject` | `@Observable class VM` |
| `@Published var x` | `var x`（自动追踪）|
| `@StateObject var vm = VM()` | `@State var vm = VM()` |
| `@ObservedObject var vm` | `var vm`（普通属性）|
| `@EnvironmentObject var vm` | `@Environment(VM.self) var vm` |

迁移步骤：
1. 删除 `ObservableObject` 一致性，加 `@Observable` 宏
2. 删除所有 `@Published`
3. 对不需要追踪的属性加 `@ObservationIgnored`
4. 视图侧：`@StateObject` -> `@State`，`@ObservedObject` -> 普通属性，`@EnvironmentObject` -> `@Environment`

**性能差异**：旧模式下任一 `@Published` 变化会通知所有订阅视图；新模式下只有读取了变化属性的视图才刷新。万行列表修改单行数据，只有该行视图重绘。

## @State / @Binding

```swift
// @State：视图拥有的本地状态（值类型或 @Observable 引用类型）
struct CounterView: View {
    @State private var count = 0          // 值类型
    @State private var profile = UserProfile()  // @Observable 对象的所有权

    var body: some View {
        ChildView(count: $count)  // $ 前缀创建 Binding
    }
}

// @Binding：子视图读写父视图的状态，不拥有数据
struct ChildView: View {
    @Binding var count: Int
    var body: some View {
        Button("Increment") { count += 1 }
    }
}
```

规则：**只有创建实例的视图用 `@State`，其余视图不加任何 wrapper 或用 `@Binding`。**

## @Environment / @Bindable

**@Environment** 从祖先视图注入的共享数据中读取：

```swift
// 注入
@main struct MyApp: App {
    @State private var settings = AppSettings()
    var body: some Scene {
        WindowGroup { ContentView() }
            .environment(settings)  // @Observable 对象注入环境
    }
}

// 读取
struct SettingsView: View {
    @Environment(AppSettings.self) var settings
    var body: some View { Text(settings.theme) }
}
```

**@Bindable** 为外部传入的 `@Observable` 对象创建双向绑定：

```swift
struct EditProfileView: View {
    @Bindable var profile: UserProfile  // 非 @State 创建，需要绑定

    var body: some View {
        TextField("Name", text: $profile.name)  // $ 需要 @Bindable
    }
}
```

何时需要 `@Bindable`：对象不是通过 `@State` 创建的（来自父视图传入或环境注入），但你需要用 `$` 语法绑定其属性到控件。若对象由 `@State` 持有，`$` 已经可用，无需 `@Bindable`。

## SwiftData（@Model / @Query）

`@Model` 将 Swift 类转为持久化模型（底层基于 Core Data），`@Query` 在视图中声明式查询。

```swift
import SwiftData

@Model
class Task {
    var title: String
    var isCompleted: Bool
    var createdAt: Date

    init(title: String, isCompleted: Bool = false) {
        self.title = title
        self.isCompleted = isCompleted
        self.createdAt = .now
    }
}
```

视图中 CRUD：

```swift
struct TaskListView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \Task.createdAt, order: .reverse) var tasks: [Task]

    var body: some View {
        List {
            ForEach(tasks) { task in
                Text(task.title)
            }
            .onDelete { indexSet in
                for i in indexSet { context.delete(tasks[i]) } // Delete
            }
        }
        .toolbar {
            Button("Add") {
                context.insert(Task(title: "New"))  // Create
                // Update：直接修改属性即可 task.title = "Updated"
            }
        }
    }
}
```

带过滤的 `@Query`：

```swift
@Query(
    filter: #Predicate<Task> { $0.isCompleted == false },
    sort: [SortDescriptor(\Task.createdAt)]
) var pendingTasks: [Task]
```

动态查询（运行时改变条件）：

```swift
init(searchText: String) {
    _tasks = Query(filter: #Predicate<Task> {
        searchText.isEmpty ? true : $0.title.localizedStandardContains(searchText)
    }, sort: [SortDescriptor(\Task.createdAt)])
}
```

## ModelContainer / ModelContext

```swift
@main struct MyApp: App {
    var body: some Scene {
        WindowGroup { ContentView() }
            .modelContainer(for: [Task.self])  // 自动创建容器和上下文
    }
}
```

- **ModelContainer**：管理数据库文件（SQLite），通过 `ModelConfiguration` 控制存储位置、是否只读、是否仅内存
- **ModelContext**：执行 CRUD 的工作区。通过 `@Environment(\.modelContext)` 获取
- `context.insert(item)` 插入，`context.delete(item)` 删除，直接修改属性即更新
- SwiftData 默认自动保存；需要立即持久化时调用 `try context.save()`

自定义配置：

```swift
let config = ModelConfiguration("MyStore", isStoredInMemoryOnly: false)
let container = try ModelContainer(for: Task.self, configurations: config)
```

## SwiftData 与 Core Data 共存

适用场景：渐进式迁移，或需要支持 iOS 17 以下版本的 Core Data 后备。

三条硬性要求：
1. **开启持久化历史追踪**：Core Data 侧必须设置 `NSPersistentHistoryTrackingKey = true`（SwiftData 默认开启，两侧必须匹配）
2. **类名不能冲突**：`NSManagedObject` 子类与 `@Model` 类不能同名，至少一方需要加命名空间前缀（但实体名保持一致）
3. **Schema 同步**：两侧的模型定义必须保持一致，不能各自演进

实践建议：
- 新功能用 SwiftData，存量模块保留 Core Data，逐步迁移
- 如果可以只支持 iOS 17+，建议一步到位迁移到 SwiftData，避免长期维护两套栈
- 共存期间两个栈操作同一个 `.sqlite` 文件，需注意并发写入问题

## 数据流选型决策

```
数据从哪来？
├── 视图自身创建的简单值 → @State
├── 视图自身创建的 @Observable 对象 → @State
├── 父视图传入的值类型（需双向写） → @Binding
├── 父视图传入的 @Observable（只读） → 普通属性（无 wrapper）
├── 父视图传入的 @Observable（需绑定控件） → @Bindable
├── 祖先注入的全局共享对象 → @Environment
└── 持久化数据 → @Query + @Environment(\.modelContext)
```

## 常见陷阱

1. **@State 用于引用类型的含义变了**：`@State var vm = VM()` 不再等于 `@StateObject`——它持有引用并提供 `$` 绑定能力，但前提是 `VM` 必须是 `@Observable` 的
2. **@Observable 不是 ObservableObject 的无脑替换**：`@Observable` 不支持 Combine `objectWillChange` 发布者；依赖该特性的代码需要重构
3. **computed property 的追踪陷阱**：如果计算属性不依赖任何存储属性，Observation 无法自动追踪。需手动调用 `access(keyPath:)` / `withMutation(keyPath:)`
4. **willSet 语义**：Observation 回调在属性变化前触发（willSet），此时读取的仍是旧值
5. **@ObservationIgnored 容易遗漏**：`private` 属性仍然被追踪，内部缓存/计时器等不影响 UI 的属性务必标注
6. **SwiftData 自动保存时机不确定**：关键写入后显式调用 `try context.save()`，不要依赖隐式自动保存
7. **@Query 不支持跨线程**：`@Query` 只能在主线程（视图）中使用；后台操作需创建独立 `ModelContext`
