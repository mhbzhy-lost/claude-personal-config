---
name: swiftui-persistence
description: SwiftUI 应用的数据持久化方案——SwiftData（iOS 17+）、Core Data @FetchRequest 与 @AppStorage
tech_stack: [swiftui, ios, swiftdata, coredata]
language: [swift]
capability: [local-storage]
version: "SwiftData iOS 17.0+ / macOS 14.0+; FetchRequest iOS 13.0+; AppStorage iOS 14.0+"
collected_at: 2026-04-18
---

# SwiftUI 数据持久化（SwiftData / Core Data / AppStorage）

> 来源：developer.apple.com/documentation/swiftdata | swiftui/fetchrequest | swiftui/appstorage | coredata/adopting-swiftdata-for-a-core-data-app

## 用途
为 SwiftUI 应用提供三档持久化能力：
- **@AppStorage**：轻量 kv（偏好设置），背靠 `UserDefaults`
- **SwiftData**（iOS 17+）：声明式 ORM，替代 Core Data 的现代方案
- **Core Data + @FetchRequest**：iOS 13+ 兼容场景或遗留项目

## 何时使用
- 保存用户偏好/开关/最近选择 → `@AppStorage`
- 新项目且最低部署 iOS 17+，需持久化对象图 → **SwiftData**
- 需兼容 iOS 13–16，或已有 Core Data 模型 → Core Data + `@FetchRequest`
- iCloud 多设备同步 → SwiftData（声明 `cloudKitDatabase`）或 Core Data + CloudKit
- 缓存远程 API 响应（离线可用）→ SwiftData

## 基础用法

### @AppStorage

```swift
struct SettingsView: View {
    @AppStorage("isDarkMode") private var isDarkMode = false
    @AppStorage("username") private var username = ""
    var body: some View {
        Toggle("深色模式", isOn: $isDarkMode)
        TextField("用户名", text: $username)
    }
}
```

### SwiftData — 定义模型

```swift
import SwiftData

@Model
final class Trip {
    #Unique<Trip>([\.name, \.startDate])
    #Index<Trip>([\.startDate])

    var name: String
    var destination: String
    var startDate: Date
    var endDate: Date

    @Relationship(deleteRule: .cascade, inverse: \BucketItem.trip)
    var bucketList: [BucketItem] = []

    @Transient var transientNote: String = ""   // 不持久化

    init(name: String, destination: String, startDate: Date, endDate: Date) {
        self.name = name; self.destination = destination
        self.startDate = startDate; self.endDate = endDate
    }
}
```

### SwiftData — 配置 Container 与 CRUD

```swift
@main
struct MyApp: App {
    var body: some Scene {
        WindowGroup { ContentView() }
            .modelContainer(for: Trip.self)   // 注入 container + 默认 context
    }
}

struct ContentView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \Trip.startDate, order: .forward) private var trips: [Trip]

    var body: some View {
        List(trips) { trip in Text(trip.name) }
            .toolbar {
                Button("新增") {
                    let t = Trip(name: "东京", destination: "Tokyo",
                                 startDate: .now, endDate: .now.addingTimeInterval(86400))
                    modelContext.insert(t)
                    // autosave 会在 UI 生命周期事件/定时器上触发；需要立刻写盘用 try? modelContext.save()
                }
                Button("删除首个") {
                    if let first = trips.first { modelContext.delete(first) }
                }
            }
    }
}
```

### SwiftData — 动态 Predicate

```swift
var descriptor = FetchDescriptor<Trip>(
    predicate: #Predicate { $0.name.contains(searchText) },
    sortBy: [SortDescriptor(\.startDate, order: .reverse)]
)
descriptor.fetchLimit = 50
let results = try modelContext.fetch(descriptor)
```

### Core Data — @FetchRequest

```swift
struct QuakeList: View {
    @FetchRequest(
        sortDescriptors: [SortDescriptor(\.time, order: .reverse)],
        predicate: NSPredicate(format: "magnitude > %f", 5.0),
        animation: .default
    )
    private var quakes: FetchedResults<Quake>   // 必须 private

    var body: some View {
        List(quakes) { q in Text(q.place ?? "") }
    }
}

// App 入口注入 viewContext
ContentView()
    .environment(\.managedObjectContext, PersistenceController.shared.container.viewContext)
```

## 关键 API（摘要）

### SwiftData
- `@Model` — 将 class 标记为持久化实体
- `@Attribute(.unique / .preserveValueOnDeletion)` / `@Relationship(deleteRule:inverse:)` / `@Transient`
- `#Unique<T>([\.keyPath])` / `#Index<T>([\.keyPath])`
- `ModelContainer` / `ModelContext` — 容器与上下文
- `@Query(filter:sort:)` / `@Query(sort:order:)` — View 内声明式查询
- `FetchDescriptor<T>` + `#Predicate { }` — 命令式查询
- `modelContext.insert(_:)` / `.delete(_:)` / `.save()`
- `.modelContainer(for:)` / `@Environment(\.modelContext)`

### SwiftUI Core Data
- `@FetchRequest(sortDescriptors:predicate:animation:)` — 必须 private
- `FetchedResults<T>` — 可迭代的托管对象集合
- `@Environment(\.managedObjectContext)` — 读取上下文
- `FetchRequest.Configuration`（`$quakes` 的 projectedValue）— 动态改 predicate/sort

### @AppStorage
- `@AppStorage("key") var x: Bool = false` — 支持 Bool/Int/Double/String/URL/Data/RawRepresentable
- `init(wrappedValue:_:store:)` — 可指定自定义 `UserDefaults`（如 App Group）

## 注意事项
- **SwiftData 自动保存**：UI 生命周期事件和定时器触发 autosave；关键节点仍建议显式 `try? modelContext.save()`
- **默认存储位置**：Application Support 目录；若配置 App Group entitlement，则存到 group 容器，SwiftData 会迁移旧库
- **@FetchRequest 必须 private**：防止被外层 View 的 memberwise init 意外覆盖
- **@FetchRequest 依赖环境 context**：忘记注入 `\.managedObjectContext` 会运行时崩溃
- **Core Data + SwiftData 共存**：共享同一 store file 时，Core Data 侧必须手动开启持久化历史：`description.setOption(true as NSNumber, forKey: NSPersistentHistoryTrackingKey)`（SwiftData 自动开启）
- **@AppStorage 只适合小数据**：别存大 JSON；超过几 KB 请用文件或 SwiftData
- **@Query 不支持复杂动态条件**：需要运行时切换 predicate 时用 `FetchDescriptor` + `modelContext.fetch()`
- **@Model class 必须是 final 或 open**：继承关系需要显式 `super.init`

## 组合提示
- SwiftUI 列表 + `@Query` / `@FetchRequest` 实现自动刷新
- 设置页用 `@AppStorage` + 表单控件 Binding
- 远程 API（`swiftui-networking`）拉取数据 → SwiftData 缓存 → `@Query` 驱动 UI
- iCloud 同步：SwiftData 使用 `ModelConfiguration(cloudKitDatabase: .automatic)`
