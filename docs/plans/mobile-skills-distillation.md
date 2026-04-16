# 移动端 Skills 蒸馏规划

> 创建时间：2026-04-16
> 状态：待执行

## 目标

为 iOS (SwiftUI)、Android (Jetpack Compose)、HarmonyOS (ArkUI) 三大移动平台蒸馏知识 skills，
重点覆盖**声明式 UI 框架**、**平台特有机制**、**C++ 混编与工程配置**三个维度。

蒸馏原则：
- 只蒸馏模型内置知识**不足或容易出错**的部分，不蒸馏基础语法
- 重点关注**最新 API**（SwiftUI 6 / Compose BOM 2025 / HarmonyOS 5）
- 工程配置类 skill 与代码类 skill 同等重要
- 每个 skill 文件目标 < 4000 tokens，宁可拆细不要堆砌

## 文档来源

| 平台 | 权威来源 |
|------|---------|
| HarmonyOS | https://developer.huawei.com/consumer/cn/doc/harmonyos-guides |
| iOS/SwiftUI | https://developer.apple.com/documentation/swiftui |
| Android/Compose | https://developer.android.com/develop/ui/compose |

---

## 一、HarmonyOS（优先级最高）

模型对鸿蒙的知识最薄弱，需要最全面的蒸馏。

### tech_stack tag: `harmonyos`

目录结构: `skills/harmonyos/<skill-name>/SKILL.md`

### 1.1 核心框架（批次 A — 无依赖，可并行蒸馏）

| # | skill name | 内容范围 | 蒸馏重点 |
|---|-----------|---------|---------|
| 1 | `harmony-arkts-lang` | ArkTS 语言特性与 TS 差异 | 静态类型约束、不支持的 JS/TS 特性清单、装饰器语法、模块系统 |
| 2 | `harmony-arkui-layout` | ArkUI 布局容器 | Column/Row/Stack/Flex/Grid/List/WaterFlow/RelativeContainer、布局约束、安全区适配 |
| 3 | `harmony-arkui-components` | ArkUI 常用组件 | Text/Image/Button/TextInput/Toggle/Slider/Progress/LoadingProgress/Marquee/Rating/Select/Search/RichEditor |
| 4 | `harmony-arkui-navigation` | 页面路由与导航 | Navigation 组件、NavPathStack、NavDestination、router 模块、页面转场动画 |
| 5 | `harmony-stage-model` | Stage 模型与 Ability | UIAbility/ExtensionAbility 生命周期、AbilityStage、Want、上下文对象、多 Ability 通信 |
| 6 | `harmony-state-management` | 状态管理装饰器 | @State/@Prop/@Link/@Provide/@Consume/@Observed/@ObjectLink/@Watch、状态传递模式、性能陷阱 |

### 1.2 平台能力（批次 B — 依赖批次 A 的基础概念）

| # | skill name | 内容范围 | 蒸馏重点 |
|---|-----------|---------|---------|
| 7 | `harmony-network` | 网络通信 | @ohos.net.http 请求、WebSocket、数据序列化、证书锁定、网络状态监听 |
| 8 | `harmony-data-persistence` | 数据持久化 | Preferences(KV)、RelationalStore(关系型)、DataShareExtensionAbility、文件管理 |
| 9 | `harmony-concurrency` | 并发模型 | TaskPool、Worker、async/await、EventHub、Emitter、线程安全 |
| 10 | `harmony-ui-advanced` | 高级 UI 模式 | 自定义组件、@Builder/@BuilderParam/@Styles/@Extend、动画(属性动画/显式动画/转场动画)、自定义绘制(Canvas/Drawing) |
| 11 | `harmony-media` | 多媒体 | 图片编解码、相机、音视频播放/录制、媒体库访问 |
| 12 | `harmony-permissions` | 权限与安全 | 权限声明、动态申请、权限组、沙箱机制 |

### 1.3 C++ 混编与工程配置（批次 B — 与平台能力并行）

| # | skill name | 内容范围 | 蒸馏重点 |
|---|-----------|---------|---------|
| 13 | `harmony-napi-binding` | Node-API (NAPI) C++ 绑定 | napi_value 类型映射、ArkTS↔C++ 类型转换(string/number/ArrayBuffer/TypedArray/object)、回调注册、异步 NAPI(napi_create_async_work)、生命周期管理(ref/ref_cleanup)、线程安全函数(napi_threadsafe_function) |
| 14 | `harmony-native-project` | 原生工程配置 | DevEco Studio Native C++ 模板、目录结构(entry/src/main/cpp/)、CMakeLists.txt 编写、oh-package.json5 中 externalNativeOptions 配置、ohpm 与 CMake 的协同(find_package/target_link)、.so 产物路径、多 ABI 构建(arm64-v8a/x86_64)、系统库链接(libace_napi.z.so/libhilog_ndk.z.so 等) |
| 15 | `harmony-native-advanced` | 高级原生开发 | XComponent + EGL/Vulkan 渲染、rawfile 访问 C++ 侧、native 侧调用 ArkTS(napi_call_function)、第三方 C++ 库交叉编译(工具链文件 ohos.toolchain.cmake)、LLVM sanitizers 在鸿蒙的使用 |

### 1.4 分布式特性（批次 C — 低优先级，按需蒸馏）

| # | skill name | 内容范围 | 蒸馏重点 |
|---|-----------|---------|---------|
| 16 | `harmony-distributed` | 分布式能力 | 分布式数据对象、跨设备迁移、多设备协同、分布式文件系统 |

---

## 二、iOS / SwiftUI

模型有基础但在新 API 上容易出错，重点蒸馏 SwiftUI 5/6 的变化。

### tech_stack tag: `swiftui`

目录结构: `skills/swiftui/<skill-name>/SKILL.md`

### 2.1 声明式 UI（批次 A — 可并行）

| # | skill name | 内容范围 | 蒸馏重点 |
|---|-----------|---------|---------|
| 1 | `swiftui-layout` | 布局系统 | HStack/VStack/ZStack/Grid/ViewThatFits/Layout 协议、GeometryReader、safeAreaInset、containerRelativeFrame |
| 2 | `swiftui-navigation` | 导航体系 | NavigationStack/NavigationSplitView/navigationDestination(for:)、NavigationPath 序列化、TabView(新 Tab API)、toolbar 体系 |
| 3 | `swiftui-data-flow` | 数据流 | @Observable(Observation 框架替代 ObservableObject)、@State/@Binding/@Environment/@Bindable、SwiftData(@Model/@Query)、与 Core Data 共存 |
| 4 | `swiftui-components` | 常用组件最新 API | List(自定义 swipe/disclosure)、Form/LabeledContent、Sheet/Inspector/popover、Alert/ConfirmationDialog、ScrollView(scrollPosition/scrollTargetBehavior) |
| 5 | `swiftui-animation` | 动画与转场 | withAnimation/Animation 协议/PhaseAnimator/KeyframeAnimator、matchedGeometryEffect、transition、CustomAnimation 协议 |

### 2.2 平台集成（批次 B）

| # | skill name | 内容范围 | 蒸馏重点 |
|---|-----------|---------|---------|
| 6 | `swiftui-concurrency` | Swift Concurrency 在 UI 中的使用 | .task modifier、@MainActor、Sendable 约束、AsyncSequence 消费、TaskGroup、actor isolation 在 SwiftUI 中的最佳实践 |
| 7 | `swiftui-uikit-interop` | UIKit 互操作 | UIViewRepresentable/UIViewControllerRepresentable、Coordinator 模式、UIKit 导航嵌入 SwiftUI、SwiftUI 嵌入 UIKit(UIHostingController) |
| 8 | `swiftui-app-lifecycle` | App 生命周期与系统集成 | @main App 协议、Scene(WindowGroup/DocumentGroup)、AppDelegate 适配器、深度链接、Widget 与 App Intent、推送通知 |
| 9 | `swiftui-accessibility` | 无障碍 | accessibilityLabel/Value/Hint、accessibilityRepresentation、VoiceOver 测试要点、Dynamic Type 适配 |

---

## 三、Android / Jetpack Compose

模型有基础但 Compose API 仍在快速演进。

### tech_stack tag: `compose`

目录结构: `skills/compose/<skill-name>/SKILL.md`

### 3.1 声明式 UI（批次 A — 可并行）

| # | skill name | 内容范围 | 蒸馏重点 |
|---|-----------|---------|---------|
| 1 | `compose-layout` | 布局体系 | Row/Column/Box/ConstraintLayout/LazyColumn/LazyVerticalGrid/LazyVerticalStaggeredGrid、Modifier 链顺序语义、intrinsic measurements |
| 2 | `compose-navigation` | Navigation Compose | NavHost/NavController、type-safe routes(Kotlin Serialization 方式)、嵌套导航图、deep link、BottomNavigation 集成 |
| 3 | `compose-state` | 状态管理 | remember/rememberSaveable、State/MutableState、derivedStateOf、snapshotFlow、ViewModel + StateFlow.collectAsState、状态提升模式 |
| 4 | `compose-material3` | Material Design 3 组件 | TopAppBar/BottomSheet/NavigationBar/NavigationRail/Scaffold/ModalDrawer/SearchBar/DatePicker/TimePicker、动态取色(DynamicColors)、主题定制 |
| 5 | `compose-side-effects` | 副作用 API | LaunchedEffect/DisposableEffect/SideEffect/rememberCoroutineScope/rememberUpdatedState/snapshotFlow、生命周期感知 |

### 3.2 平台集成（批次 B）

| # | skill name | 内容范围 | 蒸馏重点 |
|---|-----------|---------|---------|
| 6 | `compose-animation` | 动画 | animateXxxAsState/updateTransition/AnimatedVisibility/AnimatedContent/Crossfade、共享元素转场(SharedTransitionLayout)、手势动画 |
| 7 | `compose-interop` | View 互操作 | AndroidView(嵌入传统 View)、ComposeView(嵌入 Compose 到 XML)、Fragment 集成、互操作中的生命周期陷阱 |
| 8 | `compose-testing` | Compose 测试 | ComposeTestRule、onNodeWithText/onNodeWithTag、semantics 树、与 Espresso 共存、截图测试 |

### 3.3 C++ 混编与工程配置（批次 B — 与平台集成并行）

| # | skill name | 内容范围 | 蒸馏重点 |
|---|-----------|---------|---------|
| 9 | `android-ndk-cmake` | NDK + CMake 工程配置 | build.gradle(.kts) 中 externalNativeBuild 配置、CMakeLists.txt 标准写法、ANDROID_ABI/ANDROID_PLATFORM 变量、多 ABI 构建与过滤(abiFilters)、.so 打包路径、CMake 版本选择、prefab 消费第三方 native 库 |
| 10 | `android-jni-binding` | JNI 绑定模式 | JNI 函数签名规则、Java/Kotlin ↔ C++ 类型映射、字符串处理(GetStringUTFChars)、数组与 ByteBuffer、全局引用管理、线程附着(AttachCurrentThread)、JNI 异常处理 |
| 11 | `android-native-advanced` | 高级原生开发 | 第三方 C++ 库交叉编译(toolchain file)、NDK 预置库链接(liblog/libandroid/libGLESv3)、ASan/HWASan 在 Android 的使用、ndk-stack 符号化、Prefab 发布 native AAR |

---

## 四、跨平台工程 Skills（补充）

### tech_stack tag: `mobile-native`（与平台 tag 联合使用）

| # | skill name | tech_stack | 内容范围 |
|---|-----------|-----------|---------|
| 1 | `cmake-cross-compile` | [mobile-native] | CMake 交叉编译通用模式：toolchain file 编写、find_package 在交叉编译下的行为、静态库 vs 动态库选择、符号可见性控制、LTO 配置 |

---

## 执行计划

### 阶段 1: HarmonyOS（最高优先级）
- **批次 A**: skill 1-6（核心框架，6 个文件，可并行）
- **批次 B**: skill 7-15（平台能力 + C++ 混编，9 个文件，可并行）
- **批次 C**: skill 16（分布式，1 个文件，按需）
- **小计**: 15-16 个 skills

### 阶段 2: SwiftUI + Compose（可并行执行两个平台）
- **SwiftUI 批次 A**: skill 1-5（5 个，可并行）
- **SwiftUI 批次 B**: skill 6-9（4 个，可并行）
- **Compose 批次 A**: skill 1-5（5 个，可并行）
- **Compose 批次 B**: skill 6-11（6 个，可并行）
- **小计**: 20 个 skills

### 阶段 3: 跨平台工程
- 1 个 skill
- **小计**: 1 个 skill

### 总计: 36-37 个 skills

---

## 蒸馏标准

每个 SKILL.md 应包含：

```markdown
---
name: <skill-name>
description: "<一句话描述>"
tech_stack: [<tag>]
---

# <标题>

> 来源：<官方文档 URL>
> 版本基准：<框架版本>

## 用途
<这个 skill 解决什么问题>

## 何时使用
<触发条件>

## <核心内容>
<API 签名、代码示例、配置模板>

## 常见陷阱
<模型容易犯的错误>
```

工程配置类 skill 额外要求：
- 必须包含**完整可运行的配置文件模板**（CMakeLists.txt / build.gradle.kts / oh-package.json5）
- 必须列出**目录结构**示意
- 必须覆盖**多 ABI 构建**场景
- 必须说明**调试方法**（日志、符号化、sanitizer）
