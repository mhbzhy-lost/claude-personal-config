---
name: compose-side-effects
description: "Compose 副作用 API：LaunchedEffect/DisposableEffect/SideEffect/rememberCoroutineScope/produceState。"
tech_stack: [compose, android, mobile-native]
language: [kotlin]
---

# Jetpack Compose 副作用 API

> 来源：https://developer.android.com/develop/ui/compose/side-effects
> 版本基准：Compose BOM 2025 / Lifecycle 2.7+

## 用途

在 Compose 声明式模型中以受控方式执行"超出纯渲染"的操作（网络请求、订阅、注册回调、写日志等），确保副作用与组合生命周期正确绑定、可取消、可清理。

## 何时使用

- Composable 进入组合时需要启动协程（加载数据、动画循环）
- 需要注册/注销监听器或观察者
- 需要在用户事件回调中启动协程
- 需要将 Flow / LiveData / RxJava 转为 Compose State
- 需要将 Compose State 转为 Flow 供下游消费
- 需要响应 Android 生命周期事件（ON_START / ON_RESUME）

## 副作用 API 速查表

| 场景 | 选用 API | 是否有 key | 清理方式 |
|---|---|---|---|
| 进入组合时启动协程 | `LaunchedEffect` | 有，key 变 -> 取消重启 | 协程自动取消 |
| 注册/注销监听器 | `DisposableEffect` | 有，key 变 -> dispose + 重建 | `onDispose {}` 必填 |
| 每次成功重组后同步状态 | `SideEffect` | 无 | 无 |
| 事件回调中启动协程 | `rememberCoroutineScope` | 无（绑定组合点） | scope 离开组合时取消 |
| 长生命周期 effect 中引用最新值 | `rememberUpdatedState` | 无 | 无 |
| 外部数据源 -> Compose State | `produceState` | 有 | 协程取消 / `awaitDispose` |
| Compose State -> Flow | `snapshotFlow` | 无（在 LaunchedEffect 内使用） | 随 collect 所在协程取消 |
| 响应 ON_START / ON_RESUME | `LifecycleStartEffect` / `LifecycleResumeEffect` | 有 | `onStopOrDispose` / `onPauseOrDispose` |
| 响应任意生命周期事件（无需清理） | `LifecycleEventEffect` | 无 | 无 |

## LaunchedEffect

进入组合时启动协程；**key 变化 -> 取消当前协程 -> 用新 key 重新启动**；离开组合时取消。

```kotlin
// key = url：url 变化时取消旧请求、发起新请求
LaunchedEffect(url) {
    val data = repository.fetch(url)   // suspend
    state = data
}

// key = Unit：仅在首次进入组合时执行一次
LaunchedEffect(Unit) {
    delay(3000)
    onTimeout()
}
```

**key 语义要点**：
- 传入的 key 是 `equals` 比较；任一 key 变化即触发重启
- `Unit` / `true` 作为 key = 绑定到调用点生命周期，不会重启
- effect 块内用到的可变值**要么作为 key，要么用 `rememberUpdatedState` 包装**

## DisposableEffect

需要清理资源的副作用（注册/注销监听器、BroadcastReceiver 等）。key 变化时先执行 `onDispose`，再重新执行 effect 块。

```kotlin
DisposableEffect(lifecycleOwner) {
    val observer = LifecycleEventObserver { _, event -> /* ... */ }
    lifecycleOwner.lifecycle.addObserver(observer)

    onDispose {                           // 必须是最后一条语句
        lifecycleOwner.lifecycle.removeObserver(observer)
    }
}
```

## SideEffect

每次**成功重组后**执行，用于将 Compose 状态同步到非 Compose 系统（如 analytics SDK）。无 key、无清理。

```kotlin
SideEffect {
    analytics.setUserProperty("userType", user.userType)
}
```

## rememberCoroutineScope

返回绑定到当前组合点的 `CoroutineScope`，离开组合自动取消。**用于事件回调中启动协程**（onClick、onDrag 等），不能用 `LaunchedEffect` 替代，因为后者不应在回调中调用。

```kotlin
val scope = rememberCoroutineScope()

Button(onClick = {
    scope.launch { snackbarHostState.showSnackbar("Done") }
}) { Text("Save") }
```

**与 LaunchedEffect 的区别**：
- `LaunchedEffect`：组合驱动（进入/key 变化时自动启动）
- `rememberCoroutineScope`：事件驱动（手动调用 `scope.launch`）

## rememberUpdatedState

创建一个 `State<T>` 引用，值始终为最新传入值，但**不会导致 effect 重启**。解决"长生命周期 effect 内闭包捕获过期值"的问题。

```kotlin
@Composable
fun LandingScreen(onTimeout: () -> Unit) {
    val currentOnTimeout by rememberUpdatedState(onTimeout)

    LaunchedEffect(Unit) {          // 不因 onTimeout 变化而重启
        delay(3000)
        currentOnTimeout()          // 始终调用最新的 lambda
    }
}
```

**典型搭配**：`LaunchedEffect(Unit)` + `rememberUpdatedState(lambda)`，用于"只执行一次但需要引用最新回调"的场景。

## produceState

将外部异步数据源（Flow、回调、suspend 函数）转为 Compose `State<T>`。内部等价于 `remember { mutableStateOf(initialValue) }` + `LaunchedEffect`。

```kotlin
val imageState by produceState<Result<Image>>(
    initialValue = Result.Loading,
    url                                   // key：url 变化时重新加载
) {
    value = try {
        Result.Success(repo.load(url))
    } catch (e: Exception) {
        Result.Error(e)
    }
}
```

对于非挂起数据源，使用 `awaitDispose` 做清理：

```kotlin
val currentValue by produceState(initialValue) {
    val disposable = source.subscribe { value = it }
    awaitDispose { disposable.dispose() }
}
```

## snapshotFlow

将 Compose `State` 读取转为冷 Flow，自动去重（等价于内置 `distinctUntilChanged`）。通常在 `LaunchedEffect` 内 collect。

```kotlin
LaunchedEffect(listState) {
    snapshotFlow { listState.firstVisibleItemIndex }
        .filter { it > 0 }
        .collect { analytics.sendScrolledEvent() }
}
```

## LifecycleEventEffect

> 依赖：`androidx.lifecycle:lifecycle-runtime-compose:2.7.0+`

响应特定 `Lifecycle.Event`，无需手动注册 Observer。**不支持 ON_DESTROY**（组合在该信号前已结束）。

```kotlin
LifecycleEventEffect(Lifecycle.Event.ON_START) {
    viewModel.startPolling()
}
```

需要清理的场景使用配对 API：

```kotlin
// ON_START + ON_STOP 配对
LifecycleStartEffect(Unit) {
    val conn = bindService()
    onStopOrDispose { conn.unbind() }    // 必填
}

// ON_RESUME + ON_PAUSE 配对
LifecycleResumeEffect(cameraId) {        // key 变化时也会 dispose + 重建
    camera.start()
    onPauseOrDispose { camera.stop() }   // 必填
}
```

## 副作用选型决策

```
需要执行副作用
  |
  |-- 需要协程？
  |     |-- 自动启动（组合驱动）？ --> LaunchedEffect
  |     |-- 手动启动（事件驱动）？ --> rememberCoroutineScope
  |
  |-- 需要注册+清理？ --> DisposableEffect
  |
  |-- 每次重组同步非 Compose 状态？ --> SideEffect
  |
  |-- 外部数据 -> State？ --> produceState
  |
  |-- State -> Flow？ --> snapshotFlow
  |
  |-- 响应 Android 生命周期？
        |-- 无需清理 --> LifecycleEventEffect
        |-- START/STOP 配对 --> LifecycleStartEffect
        |-- RESUME/PAUSE 配对 --> LifecycleResumeEffect
```

## 常见陷阱

1. **LaunchedEffect 遗漏 key**：effect 块内读取了可变值却未将其作为 key，导致 effect 不随数据变化而重启，永远使用旧值。规则：块内用到的可变量要么加 key，要么 `rememberUpdatedState`。

2. **rememberUpdatedState 误用/漏用**：长生命周期 `LaunchedEffect(Unit)` 内直接引用外部 lambda，lambda 更新后 effect 仍调用初始版本。必须通过 `val current by rememberUpdatedState(lambda)` 间接引用。

3. **在回调中调用 LaunchedEffect**：`LaunchedEffect` 是 Composable 函数，不能在 `onClick` 等非 Composable 作用域调用。事件触发的协程应使用 `rememberCoroutineScope`。

4. **DisposableEffect 缺少 onDispose**：编译器不会报错但运行时行为未定义。`onDispose {}` 即使为空也必须写。

5. **effect 内做主线程重活**：`LaunchedEffect` 默认在主线程调度器运行，IO 操作需 `withContext(Dispatchers.IO)`。

6. **key 使用可变对象引用**：key 比较用 `equals`；若传入 List 等可变集合，内容变了但引用不变则不会重启。建议传入不可变数据或拆出原始值作为 key。

7. **LifecycleEventEffect 监听 ON_DESTROY**：组合在 ON_DESTROY 前已被移除，回调不会触发。如需 destroy 清理逻辑，使用 `DisposableEffect` 的 `onDispose`。
