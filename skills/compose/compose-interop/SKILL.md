---
name: compose-interop
description: "Compose↔View 互操作：AndroidView/ComposeView/Fragment 集成/ViewCompositionStrategy/主题桥接。"
tech_stack: [compose, android, mobile-native]
language: [kotlin]
capability: [native-lifecycle, ui-layout]
---

# Jetpack Compose ↔ View 互操作

> 来源：https://developer.android.com/develop/ui/compose/migrate/interoperability-apis/views-in-compose
> 来源：https://developer.android.com/develop/ui/compose/migrate/interoperability-apis/compose-in-views
> 版本基准：Compose BOM 2025+

## 用途

在增量迁移过程中实现 Compose 与传统 View 系统的双向嵌套：在 Compose 中使用尚无 Compose 替代的控件（MapView、AdView、WebView），或在现有 XML 布局/Fragment 中逐步引入 Compose UI。

## 何时使用

- 项目逐步迁移到 Compose，无法一次性重写全部界面
- 需要嵌入无 Compose 对应物的第三方 View（地图、广告、播放器、编辑器）
- Fragment 架构中逐屏引入 Compose
- 已有 XML 主题需在 Compose 侧复用
- RecyclerView 的 item 中混合使用 Compose 内容

## AndroidView（View → Compose）

`AndroidView` 将传统 View 嵌入 Composable 树。核心是 **factory + update** 双回调模式。

### 基础签名

```kotlin
@Composable
fun <T : View> AndroidView(
    factory: (Context) -> T,       // 创建 View，仅执行一次
    modifier: Modifier = Modifier,
    update: (T) -> Unit = {}       // 重组时更新 View 属性
)
```

### factory 回调

- 接收 `Context`，返回 View 实例
- **仅在首次组合时调用一次**（等价于 inflate）
- 在此设置一次性配置和 View → Compose 通信（listeners）

### update 回调

- factory 完成后立即调用一次，此后每当 **块内读取的 State 变化时** 再次调用
- 用于 Compose → View 的数据推送
- 运行在 UI 线程

```kotlin
@Composable
fun LegacyMapSection(location: LatLng) {
    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { ctx ->
            MapView(ctx).apply {
                onCreate(Bundle())   // 需手动调用生命周期方法
            }
        },
        update = { mapView ->
            mapView.moveCamera(location)  // State 变化时推送到 View
        }
    )
}
```

### Lazy 列表中的 View 复用（1.4.0-rc01+）

在 `LazyColumn`/`LazyRow` 中使用 AndroidView 时，传入 `onReset` 可启用 View 池复用，显著提升滚动性能：

```kotlin
LazyColumn {
    items(100) { index ->
        AndroidView(
            factory = { ctx -> MyItemView(ctx) },
            update = { view -> view.bind(index) },
            onReset = { view -> view.clear() },     // 非 null 即启用复用
            onRelease = { view -> view.dispose() }   // 可选：彻底离开组合时调用
        )
    }
}
```

### AndroidViewBinding

用于嵌入已有 XML 布局（需开启 ViewBinding）：

```kotlin
AndroidViewBinding(MyItemLayoutBinding::inflate) {
    titleText.text = "Hello"
}
```

## ComposeView（Compose → XML）

`ComposeView` 是一个 Android View，可在 XML 布局或代码中创建，内部承载 Composable 内容。

### Activity 中使用

```kotlin
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {                        // activity-compose 库的扩展
            MaterialTheme { MyScreen() }
        }
    }
}
```

### XML 布局中声明

```xml
<androidx.compose.ui.platform.ComposeView
    android:id="@+id/compose_view"
    android:layout_width="match_parent"
    android:layout_height="wrap_content" />
```

```kotlin
findViewById<ComposeView>(R.id.compose_view).apply {
    setViewCompositionStrategy(
        ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed
    )
    setContent { MyComposable() }
}
```

### 多个 ComposeView 并存

同一布局中多个 `ComposeView` 必须设置**不同的 `id`**，否则 `savedInstanceState` 恢复会冲突：

```xml
<!-- res/values/ids.xml -->
<resources>
    <item name="compose_header" type="id" />
    <item name="compose_footer" type="id" />
</resources>
```

## Fragment 中使用 Compose

### 纯 Compose Fragment（无 XML）

```kotlin
class HomeFragment : Fragment() {
    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View = ComposeView(requireContext()).apply {
        setViewCompositionStrategy(
            ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed  // 关键
        )
        setContent {
            MaterialTheme { HomeScreen() }
        }
    }
}
```

### 混合 Fragment（XML + ComposeView）

在 `onCreateView` 中通过 ViewBinding 或 `findViewById` 获取 `ComposeView`，同样需设置 `ViewCompositionStrategy`。

**要点**：Fragment 的 View 生命周期短于 Fragment 自身——`onDestroyView` 时 View 被销毁但 Fragment 可能存活。默认的 `DisposeOnDetachedFromWindowOrReleasedFromPool` 会在 View detach 时立即释放组合，导致返回时状态丢失。必须切换到生命周期感知策略。

## ViewCompositionStrategy

控制 `ComposeView` 中 Composition 的释放时机。**在 Fragment 中使用 ComposeView 时必须显式设置**。

### 四种策略速查

| 策略 | 释放时机 | 适用场景 |
|------|---------|---------|
| `DisposeOnDetachedFromWindow` | View 从 Window detach 时 | 仅限 Activity 直属 View（已被默认策略取代） |
| `DisposeOnDetachedFromWindowOrReleasedFromPool` **（默认）** | detach 时释放，但在 RecyclerView 池中延迟释放 | Activity 直属 ComposeView、RecyclerView item |
| **`DisposeOnViewTreeLifecycleDestroyed`** | ViewTreeLifecycleOwner 被销毁时 | **Fragment 首选**——Lifecycle 未知时安全绑定 |
| `DisposeOnLifecycleDestroyed(lifecycle)` | 指定 Lifecycle 被销毁时 | Lifecycle 已知且需精确控制释放时机 |

### 选型决策

```
ComposeView 在哪？
├── Activity 直属 / RecyclerView item --> 默认策略即可
├── Fragment --> DisposeOnViewTreeLifecycleDestroyed（推荐）
└── 有明确 Lifecycle 对象 --> DisposeOnLifecycleDestroyed(lifecycle)
```

## 主题互操作

### 现状（2025）

原 `MdcTheme` / `AppCompatTheme`（material-components-android-compose-theme-adapter）**已废弃**。后续维护转移到 Accompanist：

| 原库 | Accompanist 替代 |
|------|-----------------|
| `compose-theme-adapter` | `accompanist-themeadapter-material` |
| `compose-theme-adapter-3` | `accompanist-themeadapter-material3` |

**官方推荐路径**：使用 [Material Theme Builder](https://m3.material.io/theme-builder) 同时生成 XML 和 Compose 主题代码，避免运行时桥接。

### 过渡期使用 Accompanist

```kotlin
// build.gradle
implementation("com.google.accompanist:accompanist-themeadapter-material3:<version>")

// 使用
Mdc3Theme {       // 读取当前 Activity 的 MDC3 XML 主题
    MyScreen()    // 内部 MaterialTheme 颜色/排版/形状自动映射
}
```

**限制**：桥接只能映射 XML 主题中 Material 规范定义的属性（颜色、排版、形状）。自定义属性不会被自动读取。

## 常见陷阱

1. **Fragment 中忘设 ViewCompositionStrategy**：默认策略在 View detach 时释放组合。Fragment 返回栈恢复时 View 重新 attach，但组合已丢失，滚动位置和输入状态全部重置。**必须设置 `DisposeOnViewTreeLifecycleDestroyed`**。

2. **AndroidView 包裹的 View 有自己的生命周期（MapView/WebView）**：Compose 不会自动转发生命周期事件，需用 `DisposableEffect` + `LifecycleEventObserver` 手动管理：

   ```kotlin
   @Composable
   fun LifecycleAwareMapView() {
       val lifecycle = LocalLifecycleOwner.current.lifecycle
       AndroidView(factory = { ctx ->
           MapView(ctx).also { map ->
               val observer = LifecycleEventObserver { _, event ->
                   when (event) {
                       Lifecycle.Event.ON_CREATE  -> map.onCreate(Bundle())
                       Lifecycle.Event.ON_START   -> map.onStart()
                       Lifecycle.Event.ON_RESUME  -> map.onResume()
                       Lifecycle.Event.ON_PAUSE   -> map.onPause()
                       Lifecycle.Event.ON_STOP    -> map.onStop()
                       Lifecycle.Event.ON_DESTROY -> map.onDestroy()
                       else -> {}
                   }
               }
               lifecycle.addObserver(observer)
           }
       })
   }
   ```

3. **LazyColumn 中 AndroidView 性能差**：未传 `onReset` 时每次复用都销毁重建 View 实例。传入 `onReset` 回调即可启用池化复用。

4. **update 块中创建对象**：`update` 在每次相关 State 变化时都执行——不要在其中 new Listener 或创建昂贵对象，应在 `factory` 中一次性创建并持有引用。

5. **多个 ComposeView 无 id**：同一布局中的多个 ComposeView 未设不同 id，导致 `savedInstanceState` 恢复时状态互相覆盖。

6. **主题桥接遗漏**：在 ComposeView 中直接使用 `MaterialTheme {}` 但未桥接 XML 主题，导致 Compose 侧颜色/字体与 View 侧不一致。要么使用 Accompanist 桥接，要么统一生成双端主题。

7. **在 RecyclerView.ViewHolder 中手动 dispose**：默认策略已处理池化场景。手动调用 `disposeComposition()` 反而破坏复用优化。
