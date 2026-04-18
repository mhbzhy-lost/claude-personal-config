---
name: compose-networking
description: 在 Jetpack Compose 应用中用 Retrofit + kotlinx.serialization + StateFlow 完成 REST 网络请求与 UDF 状态暴露
tech_stack: [compose, android, retrofit]
language: [kotlin]
capability: [http-client, state-management]
version: "retrofit 3.0.0; lifecycle-runtime-ktx 2.4.0+"
collected_at: 2026-04-18
---

# Compose 网络层（Retrofit + StateFlow）

> 来源：developer.android.com/codelabs/basic-android-kotlin-compose-getting-data-internet · compose/architecture · kotlin/flow/stateflow-and-sharedflow · square/retrofit CHANGELOG

## 用途
在 Compose 应用里以单向数据流（UDF）方式完成 HTTP REST 调用：`Retrofit` 负责网络 + 序列化，`ViewModel` 持有 `StateFlow<UiState>`，Composable 通过 `collectAsState` 响应式订阅。

## 何时使用
- 需要调用 REST/JSON 后端并在 Compose UI 中展示
- 要把网络结果的 Loading/Success/Error 状态暴露给 UI
- 需要可测试、可组合的 ViewModel 层
- 多订阅者热流（`shareIn`）或周期性刷新场景（`MutableSharedFlow`）

## 基础用法

**依赖**（Retrofit 3 + kotlinx.serialization）
```kotlin
plugins { id("org.jetbrains.kotlin.plugin.serialization") version "1.8.10" }
dependencies {
    implementation("com.squareup.retrofit2:retrofit:2.9.0") // 或 3.0.0
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.5.1")
    implementation("com.jakewharton.retrofit:retrofit2-kotlinx-serialization-converter:1.0.0")
    implementation("com.squareup.okhttp3:okhttp:4.11.0")
}
```

`AndroidManifest.xml`：`<uses-permission android:name="android.permission.INTERNET" />`

**数据模型 + Service**
```kotlin
@Serializable
data class MarsPhoto(val id: String, @SerialName("img_src") val imgSrc: String)

interface MarsApiService {
    @GET("photos") suspend fun getPhotos(): List<MarsPhoto>
}

object MarsApi {
    private val retrofit = Retrofit.Builder()
        .addConverterFactory(Json.asConverterFactory("application/json".toMediaType()))
        .baseUrl("https://android-kotlin-fun-mars-server.appspot.com")
        .build()
    val retrofitService: MarsApiService by lazy { retrofit.create(MarsApiService::class.java) }
}
```

**ViewModel + UiState sealed**
```kotlin
sealed interface MarsUiState {
    data class Success(val photos: List<MarsPhoto>) : MarsUiState
    object Error : MarsUiState
    object Loading : MarsUiState
}

class MarsViewModel : ViewModel() {
    var marsUiState: MarsUiState by mutableStateOf(MarsUiState.Loading); private set
    init { getMarsPhotos() }
    private fun getMarsPhotos() = viewModelScope.launch {
        marsUiState = try { MarsUiState.Success(MarsApi.retrofitService.getPhotos()) }
        catch (e: IOException) { MarsUiState.Error }
    }
}
```

**Composable 按状态分支渲染**
```kotlin
@Composable fun HomeScreen(state: MarsUiState) = when (state) {
    is MarsUiState.Loading -> LoadingScreen()
    is MarsUiState.Success -> ResultScreen(state.photos)
    is MarsUiState.Error   -> ErrorScreen()
}
```

## 关键 API
- `@GET/@POST/@PUT/@DELETE + suspend fun`：Kotlin 协程式 Retrofit 接口（2.6.0+）
- `@Path / @Query / @Header / @Body / @Url / @Tag`：参数注解
- `Json.asConverterFactory("application/json".toMediaType())`：kotlinx.serialization 转换器
- `mutableStateOf(...)`：Compose 可观察状态
- `MutableStateFlow(initial)` / `StateFlow<T>`：热流，必须带初值；`_state.value = ...` 更新
- `Flow.stateIn(scope, SharingStarted.WhileSubscribed(5_000), initial)`：冷流转热流
- `Flow.shareIn(scope, replay, SharingStarted.WhileSubscribed())`：多订阅者共享
- `MutableSharedFlow(replay, onBufferOverflow)`：自定义回放/背压策略
- `viewModel.uiState.collectAsState()`：Compose 侧消费

## 注意事项
- **UI 侧禁止**直接 `launch { flow.collect }`——视图 STOPPED 后仍会处理事件，会崩。必须 `lifecycleScope.launch { repeatOnLifecycle(STARTED) { flow.collect { ... } } }`（需 `lifecycle-runtime-ktx:2.4.0+`）。Compose 端首选 `collectAsState()`/`collectAsStateWithLifecycle()`。
- `StateFlow` 需要初值，`LiveData` 不要；`StateFlow` 不会随生命周期自动停止收集。
- `mutableStateOf` + `remember` 只在 composition 内存活；跨配置变更用 `rememberSaveable`。
- UI 层只通过事件 lambda 上抛，不要在 composable 内直接改状态，否则破坏 UDF。
- Composable 参数**只传所需最小字段**（如 `title/subtitle`），不要整个 `News` 对象，减少无谓重组。
- Retrofit 2.10.0 起：`suspend fun` 不能返回 `Call<Body>`；所有 `Throwable` 子类都被捕获。
- Retrofit 2.0.0 起不再默认捆绑 Gson，必须显式加 converter。
- Retrofit 2.7.0+ 要求 Java 8 / Android 5+；3.0.0 升级到 OkHttp 4.12 并引入 Kotlin 传递依赖。
- `SharingStarted.WhileSubscribed()` 是生产侧推荐策略；`Eagerly` 立即启动，`Lazily` 首订阅后永不停止。

## 组合提示
常与 `compose-persistence`（Room 本地缓存）、`compose-image-loading`（Coil 渲染远程图片 URL）、`viewModel()` + Navigation 组合。Repository 层统一 Flow 接口，ViewModel 通过 `stateIn` 暴露 `StateFlow`。
