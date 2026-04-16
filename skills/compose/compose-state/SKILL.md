---
name: compose-state
description: "Compose 状态管理：remember/rememberSaveable/derivedStateOf/snapshotFlow/ViewModel StateFlow/状态提升。"
tech_stack: [compose]
---

# Jetpack Compose 状态管理

> 来源：https://developer.android.com/develop/ui/compose/state
> 版本基准：Compose BOM 2025.01+

## 用途

Compose 的状态系统将 UI 与数据绑定：状态变更自动触发重组（recomposition），无需手动刷新视图。核心思路是「状态驱动 UI」——所有可变数据包装为可观察的 `State<T>`，Compose 运行时追踪读取关系并精准重组。

## 何时使用

- 表单输入、开关、计数器等局部 UI 状态 --> `remember` / `rememberSaveable`
- 跨多个 Composable 共享状态 --> 状态提升 + ViewModel
- 从已有状态派生计算值且希望减少重组 --> `derivedStateOf`
- 需要对 Compose State 做 Flow 操作（filter/debounce/collect）--> `snapshotFlow`
- 屏幕级业务状态（网络数据、分页）--> ViewModel + StateFlow

## remember / rememberSaveable

### remember

在**组合（Composition）存活期间**缓存值，重组时返回缓存而非重新计算。离开组合即丢失；**配置变更（旋转/深色模式切换）后丢失**。

```kotlin
// 基础用法
var count by remember { mutableStateOf(0) }

// 带 key：key 变化时重新计算
val brush = remember(avatarRes) { ShaderBrush(avatarRes) }
```

### rememberSaveable

在 `remember` 基础上将值写入 `savedInstanceState` Bundle，**配置变更和系统回收进程后恢复**。

```kotlin
var name by rememberSaveable { mutableStateOf("") }
```

**自定义类型**需提供 `Saver`（类型必须可序列化到 Bundle）：

```kotlin
// mapSaver
val CitySaver = mapSaver(
    save = { mapOf("name" to it.name, "country" to it.country) },
    restore = { City(it["name"] as String, it["country"] as String) }
)
var city by rememberSaveable(stateSaver = CitySaver) { mutableStateOf(City("Beijing", "CN")) }

// 或用 @Parcelize 自动支持
@Parcelize data class City(val name: String, val country: String) : Parcelable
var city by rememberSaveable { mutableStateOf(City("Beijing", "CN")) }
```

### 核心区别速查

| 特性 | `remember` | `rememberSaveable` |
|------|-----------|-------------------|
| 跨重组保持 | Yes | Yes |
| 配置变更存活 | **No** | **Yes** |
| 进程恢复存活 | No | Yes（Bundle 限制内） |
| 性能开销 | 极低 | 略高（序列化） |
| 适用场景 | 动画、临时交互状态 | 表单输入、滚动位置、Tab 选中 |

## State / MutableState / mutableStateOf

```kotlin
interface State<T> { val value: T }                // 只读
interface MutableState<T> : State<T> { override var value: T }  // 可读写

// 三种等价写法
val state: MutableState<String> = remember { mutableStateOf("") }    // .value 读写
var value by remember { mutableStateOf("") }                          // 委托属性（需 getValue/setValue 导入）
val (value, setValue) = remember { mutableStateOf("") }              // 解构
```

**关键**：对 `value` 的写入会通知 Compose 运行时，所有读取该 State 的 Composable 被标记为待重组。

**集合状态**：使用不可变集合 + 重新赋值，不要用 `mutableListOf` 就地修改：

```kotlin
// 错误 -- 不触发重组
var items by remember { mutableStateOf(mutableListOf<String>()) }
items.add("new")  // 引用没变，Compose 感知不到

// 正确
var items by remember { mutableStateOf(listOf<String>()) }
items = items + "new"  // 新引用，触发重组
```

## derivedStateOf（派生状态）

当一个状态是从其他 State 计算得出时，用 `derivedStateOf` 包裹。**只在计算结果实际变化时才触发下游重组**，避免中间值频繁刷新。

```kotlin
val listState = rememberLazyListState()
// 只关心"是否滚动过第一项"，而非每一帧的 index 变化
val showButton by remember {
    derivedStateOf { listState.firstVisibleItemIndex > 0 }
}
```

### 何时用 derivedStateOf

- 源状态变化频率**远高于**派生结果变化频率（如 scrollOffset -> 是否显示按钮）
- 计算本身有一定开销，避免每次重组都执行

### 何时不用

- 源状态和派生结果 1:1 变化（直接读取即可，加 `derivedStateOf` 反而多一层开销）
- 仅做简单映射且重组频率不高

## snapshotFlow（State -> Flow）

将 Compose `State` 转换为 Kotlin `Flow`，可使用全部 Flow 操作符。内置 `distinctUntilChanged` 语义。

```kotlin
val listState = rememberLazyListState()

LaunchedEffect(listState) {
    snapshotFlow { listState.firstVisibleItemIndex }
        .filter { it > 0 }
        .debounce(300)
        .collect { index ->
            analytics.logScroll(index)
        }
}
```

**典型场景**：滚动埋点、输入防抖、将 Compose UI 状态桥接到非 Compose 层（Repository / UseCase）。

**反向桥接**（Flow -> State）使用 `collectAsState` 或 `produceState`。

## ViewModel + StateFlow

屏幕级状态推荐放在 ViewModel 中，通过 `StateFlow` 暴露，Composable 层收集为 State。

```kotlin
class SearchViewModel : ViewModel() {
    private val _uiState = MutableStateFlow(SearchUiState())
    val uiState: StateFlow<SearchUiState> = _uiState.asStateFlow()

    fun onQueryChange(query: String) {
        _uiState.update { it.copy(query = query) }
    }
}

@Composable
fun SearchScreen(viewModel: SearchViewModel = viewModel()) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    SearchContent(query = uiState.query, onQueryChange = viewModel::onQueryChange)
}
```

### collectAsState vs collectAsStateWithLifecycle

| | `collectAsState` | `collectAsStateWithLifecycle` |
|---|---|---|
| 生命周期感知 | No（后台仍收集） | Yes（STARTED 以下自动暂停） |
| 依赖 | compose-runtime | `lifecycle-runtime-compose` |
| 推荐场景 | 多平台 / 始终可见的 UI | **Android 屏幕级 Composable（首选）** |

## 状态提升模式（State Hoisting）

将状态从 Composable 内部上移到调用方，使组件变为无状态（stateless）+ 可复用 + 可测试。遵循**单向数据流（UDF）**：状态向下流、事件向上流。

```kotlin
// Stateful -- 持有状态（通常是屏幕级入口）
@Composable
fun CounterScreen() {
    var count by rememberSaveable { mutableStateOf(0) }
    CounterContent(count = count, onIncrement = { count++ })
}

// Stateless -- 仅接收状态 + 事件回调（可复用、可预览、可测试）
@Composable
fun CounterContent(count: Int, onIncrement: () -> Unit) {
    Button(onClick = onIncrement) { Text("Count: $count") }
}
```

**提升到哪一层？** 提升到读取该状态的所有 Composable 的**最近公共祖先**。若涉及业务逻辑则继续上提到 ViewModel。

## 重组优化要点

1. **参数稳定性**：Composable 的所有参数均为 stable 类型时，Compose 可跳过未变更的重组。基本类型、String、函数类型、`@Immutable`/`@Stable` 注解类均为 stable。
2. **避免不稳定参数**：`List<T>`（接口，编译器无法推断不可变）默认 unstable；用 `kotlinx.collections.immutable.ImmutableList` 或对持有类加 `@Immutable`。
3. **lambda 稳定性**：不捕获可变变量的 lambda 自动 stable；捕获了 unstable 变量则导致父组件每次重组时子组件无法跳过。
4. **延迟读取（defer reads）**：将 State 读取尽量推迟到 Layout/Draw 阶段（如传 `() -> State` lambda 到 `Modifier.offset { }` 而非直接传值），可减少 Composition 阶段重组。
5. **key 标识**：`LazyColumn` 的 `items(key = ...)` 保证列表项身份稳定，避免不必要的重组和动画丢失。

## 状态选型决策

```
该状态是否只在当前 Composable 内使用？
├── Yes：是否需要在配置变更后恢复？
│   ├── Yes --> rememberSaveable
│   └── No  --> remember
└── No：是否涉及业务逻辑 / 网络请求 / 跨屏幕共享？
    ├── Yes --> ViewModel + StateFlow + collectAsStateWithLifecycle
    └── No  --> 状态提升到最近公共祖先（remember / rememberSaveable）
```

补充判断：
- 需要对 State 做 Flow 操作 --> `snapshotFlow`
- 高频变化但下游只关心粗粒度结果 --> `derivedStateOf`
- 需要从 Flow/LiveData 转为 Compose State --> `collectAsState` / `produceState`

## 常见陷阱

1. **`mutableStateOf` 不包 `remember`**：每次重组都创建新 State，值永远被重置。必须 `remember { mutableStateOf(...) }`。
2. **就地修改集合**：`list.add()` 不改变引用，Compose 不触发重组。必须用不可变集合 + 重新赋值。
3. **`remember` 当 `rememberSaveable` 用**：旋转屏幕后表单数据丢失。用户可见的输入状态应始终用 `rememberSaveable`。
4. **ViewModel 中用 `mutableStateOf`**：在非主线程修改会抛 `IllegalStateException`。ViewModel 中推荐 `MutableStateFlow` + `update {}`（线程安全）。
5. **滥用 `derivedStateOf`**：源状态与派生值 1:1 变化时，反而增加对象分配和间接层，没有性能收益。
6. **`collectAsState` 代替 `collectAsStateWithLifecycle`**：Android 上 App 进入后台后仍在收集 Flow，浪费资源甚至触发不必要的副作用。
7. **在 Composable 中创建 Flow 但不 remember**：每次重组都产生新 Flow 实例并重新收集，导致重复请求或状态闪烁。
