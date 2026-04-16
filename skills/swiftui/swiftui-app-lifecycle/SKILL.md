---
name: swiftui-app-lifecycle
description: "SwiftUI App 生命周期：@main/Scene/scenePhase/AppDelegate 适配/深度链接/Widget/推送通知。"
tech_stack: [swiftui, ios, mobile-native]
language: [swift]
---

# SwiftUI App 生命周期与系统集成

> 来源：Apple Developer Documentation https://developer.apple.com/documentation/swiftui/app
> 版本基准：SwiftUI 6 / iOS 18 (Xcode 16)

## 用途

定义 SwiftUI 应用的入口、窗口结构、前后台感知，以及与系统能力（深度链接、Widget、推送通知）的集成方式。

## 何时使用

- 创建新项目时配置 App 入口与 Scene 结构
- 需要在前后台切换时保存数据、暂停任务
- 桥接传统 UIApplicationDelegate 能力（推送 token、后台任务）
- 处理 URL Scheme / Universal Links 深度链接
- 为 Widget 添加交互按钮或可配置参数

---

## @main App 协议

`@main` 标记应用入口，替代传统的 `AppDelegate` + `SceneDelegate`。

```swift
@main
struct MyApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
```

**要点**：
- 整个项目只能有一个 `@main` 标记
- `body` 返回 `some Scene`，可组合多个 Scene
- 可在 App 结构体中声明 `@StateObject`、`@Environment` 等属性，用于全局状态注入
- `init()` 可用于一次性启动配置（SDK 初始化等）

---

## Scene 类型

| Scene | 平台 | 用途 |
|-------|------|------|
| `WindowGroup` | 全平台 | 最常用，管理主窗口；macOS/iPadOS 支持多窗口实例 |
| `DocumentGroup` | 全平台 | 文档型应用，自动管理文件打开/创建/保存 |
| `Settings` | macOS | 设置窗口，自动绑定菜单栏 "Settings..." |
| `Window` | macOS/iPadOS | 单实例唯一窗口（区别于 WindowGroup 的多实例） |
| `MenuBarExtra` | macOS | 菜单栏常驻图标 + 弹出内容 |

**组合示例（macOS 应用）**：

```swift
@main
struct MyApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        #if os(macOS)
        Settings {
            SettingsView()
        }
        MenuBarExtra("Status", systemImage: "circle.fill") {
            StatusMenuView()
        }
        #endif
    }
}
```

---

## scenePhase（前后台监听）

通过 `@Environment(\.scenePhase)` 获取当前场景状态。

### 三个状态

| 状态 | 含义 | 典型场景 |
|------|------|----------|
| `.active` | 前台且可交互 | 正常使用 |
| `.inactive` | 前台但不可交互 | 下拉通知中心、多任务切换中、Siri 覆盖 |
| `.background` | 不可见 | 已切到后台 |

**典型流转**：进入后台 `active -> inactive -> background`；回到前台 `background -> inactive -> active`。

### 在 App 级别监听（推荐用于全局保存）

```swift
@main
struct MyApp: App {
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .onChange(of: scenePhase) { oldPhase, newPhase in
            if newPhase == .background {
                saveAppData()
            }
        }
    }
}
```

### 在 View 级别监听（推荐用于局部暂停/恢复）

```swift
struct PlayerView: View {
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        VideoPlayer(player: player)
            .onChange(of: scenePhase) { _, phase in
                if phase != .active { player.pause() }
            }
    }
}
```

### 已知局限

- **macOS 上不可靠**：多窗口场景下 scenePhase 行为不一致，无法替代 `NSApplicationDelegate` 的 `applicationDidBecomeActive` 等回调
- **缺少 didLaunch / willTerminate**：无法精确捕获首次启动和即将终止事件，需配合 AppDelegate 适配器
- **iPadOS 多窗口**：每个 Scene 实例有独立的 phase，App 级别收到的是所有场景的聚合值

---

## AppDelegate 适配器

当需要传统 `UIApplicationDelegate` 回调（推送 token、后台任务、第三方 SDK 初始化）时使用。

```swift
class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // 第三方 SDK 初始化、推送注册等
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        // 将 token 发送到服务器
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        print("APNs token: \(token)")
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        print("APNs registration failed: \(error)")
    }
}

@main
struct MyApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
```

**要点**：
- macOS 对应 `@NSApplicationDelegateAdaptor`
- 若 AppDelegate 遵循 `ObservableObject`，自动作为 `@EnvironmentObject` 注入所有视图
- 不要在 AppDelegate 中实现 Scene 相关方法（`configurationForConnecting` 等），这些由 SwiftUI 管理

---

## 深度链接（onOpenURL）

### URL Scheme

1. 在 Xcode > Target > Info > URL Types 添加 Scheme（如 `myapp`）
2. 使用 `onOpenURL` 接收：

```swift
@main
struct MyApp: App {
    @State private var selectedTab: Tab = .home

    var body: some Scene {
        WindowGroup {
            ContentView(selectedTab: $selectedTab)
                .onOpenURL { url in
                    // myapp://product/123
                    guard url.scheme == "myapp" else { return }
                    if url.host == "product",
                       let id = url.pathComponents.dropFirst().first {
                        selectedTab = .product(id)
                    }
                }
        }
    }
}
```

### Universal Links

配置 Apple App Site Association 文件后，`onOpenURL` 同样接收 `https://` 链接。

### 多处理器

可在不同视图各自声明 `onOpenURL`，系统会同时调用所有已注册的处理器，适合模块化处理。

**安全提醒**：始终验证 URL 参数，丢弃格式异常的链接，防止注入攻击。

---

## Widget 与 App Intent

### Widget 基本结构

Widget 作为独立 Extension Target，通过 `TimelineProvider` 提供数据：

```swift
@main
struct MyWidget: Widget {
    let kind = "MyWidget"

    var body: some WidgetConfiguration {
        // 静态配置（无用户可选参数）
        StaticConfiguration(kind: kind, provider: MyProvider()) { entry in
            MyWidgetView(entry: entry)
        }
        .configurationDisplayName("My Widget")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
```

### 交互式 Widget（iOS 17+）

Button 和 Toggle 支持 `AppIntent`，实现 Widget 内直接操作：

```swift
struct ToggleTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Toggle Task"
    @Parameter(title: "Task ID") var taskID: String

    func perform() async throws -> some IntentResult {
        TaskStore.shared.toggle(taskID)
        return .result()
    }
}

// Widget View 中
Button(intent: ToggleTaskIntent(taskID: task.id)) {
    Label("Done", systemImage: "checkmark")
}
```

### 可配置 Widget（AppIntentConfiguration）

用 `AppIntentConfiguration` 替代 `StaticConfiguration`，让用户在编辑 Widget 时选择参数：

```swift
struct SelectCityIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Select City"
    @Parameter(title: "City") var city: CityEntity?
}
```

### 数据共享

Widget Extension 与主 App 通过 **App Group** 共享数据（UserDefaults suite / 共享文件容器）。

---

## 推送通知集成

SwiftUI 没有原生推送 API，需桥接 `UIApplicationDelegate` + `UNUserNotificationCenter`。

### 完整流程

```swift
class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
            guard granted else { return }
            DispatchQueue.main.async {
                application.registerForRemoteNotifications()
            }
        }
        return true
    }

    // 收到 token
    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        // 上报服务器
    }

    // 前台收到通知时的展示策略
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .badge, .sound]
    }

    // 用户点击通知
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let userInfo = response.notification.request.content.userInfo
        // 解析 payload，触发导航
    }
}

@main
struct MyApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup { ContentView() }
    }
}
```

**要点**：`registerForRemoteNotifications()` 必须在主线程调用；先请求授权再注册。

---

## 常见陷阱

| 问题 | 说明 |
|------|------|
| scenePhase 在 macOS 不可靠 | 多窗口下聚合值不准确，关键逻辑应使用 `NSApplicationDelegateAdaptor` |
| AppDelegate 中实现 Scene 方法 | `configurationForConnecting` 等会被 SwiftUI 忽略，不要写 |
| Widget 无法直接访问主 App 数据 | 必须通过 App Group 共享，否则拿到空数据 |
| onOpenURL 未校验参数 | URL 是外部输入，必须做防御性解析 |
| 推送注册在后台线程 | `registerForRemoteNotifications()` 必须在主线程 |
| @StateObject 在 App 中的生命周期 | App 结构体的 `init()` 可能被多次调用，`@StateObject` 只初始化一次，不要在 `init` 中做有副作用的操作 |
| onChange(of:) API 变更 | iOS 17+ 使用双参数闭包 `{ old, new in }`；iOS 16 及以下为单参数 `{ newValue in }` |
