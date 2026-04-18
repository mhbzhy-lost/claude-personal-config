---
name: compose-image-loading
description: 在 Jetpack Compose 中用 painterResource 加载本地图片、用 Coil 3 的 AsyncImage 异步加载网络图片
tech_stack: [compose, android, coil]
language: [kotlin]
capability: [media-processing]
version: "coil 3.4.0"
collected_at: 2026-04-18
---

# Compose 图片加载（Coil 3 + painterResource）

> 来源：developer.android.com/develop/ui/compose/graphics/images/loading · coil-kt.github.io/coil · coil-kt/coil CHANGELOG

## 用途
- **本地图片/矢量**：`Image(painter = painterResource(...))`
- **网络图片**：Coil 3 的 `AsyncImage` / `rememberAsyncImagePainter` / `SubcomposeAsyncImage`，自动处理缓存、采样、协程与生命周期

## 何时使用
- 资源内置 PNG/JPG/WEBP/SVG/VectorDrawable → `painterResource`
- 网络 URL / `Uri` / `File` / `ByteArray` 渲染 → `AsyncImage`（首选）
- 需要 `Painter` 实例或订阅 `state` → `rememberAsyncImagePainter`
- 按加载状态切换不同 composable 槽（loading/success/error） → `SubcomposeAsyncImage`
- Compose Multiplatform 资源 → `AsyncImage(model = Res.getUri("drawable/x.jpg"))`

## 基础用法

**依赖**
```kotlin
implementation("io.coil-kt.coil3:coil-compose:3.4.0")
implementation("io.coil-kt.coil3:coil-network-okhttp:3.4.0") // CMP 改用 coil-network-ktor3
```

**本地**
```kotlin
Image(
    painter = painterResource(R.drawable.dog),
    contentDescription = stringResource(R.string.dog_desc) // 装饰性图片传 null
)
```

**网络（AsyncImage）**
```kotlin
AsyncImage(
    model = "https://example.com/image.jpg",
    contentDescription = "描述",
    contentScale = ContentScale.Crop,
    placeholder = painterResource(R.drawable.placeholder),
    error = painterResource(R.drawable.error)
)
```

**全局 ImageLoader 配置（开启 crossfade）**
```kotlin
class App : Application(), SingletonImageLoader.Factory {
    override fun newImageLoader(context: Context) =
        ImageLoader.Builder(context).crossfade(true).build()
}
// 或在 setContent 前：
SingletonImageLoader.setSafe { ctx ->
    ImageLoader.Builder(ctx).crossfade(true).build()
}
```

**订阅加载状态**
```kotlin
val painter = rememberAsyncImagePainter("https://...")
val state by painter.state.collectAsState()
Image(painter, contentDescription = null)
when (state) { is AsyncImagePainter.State.Loading -> ...; else -> ... }
```

## 关键 API
- `painterResource(id)`：支持 `BitmapDrawable`(PNG/JPG/WEBP)、`VectorDrawable`、`AnimatedVectorDrawable`、`ColorDrawable`
- `AsyncImage(model, contentDescription, modifier, placeholder, error, fallback, onState, contentScale, alpha, colorFilter, filterQuality)`
- `rememberAsyncImagePainter(model)` → `Painter`，`painter.state: StateFlow<AsyncImagePainter.State>`
- `SubcomposeAsyncImage(model, loading = {}, success = {}, error = {})`
- `ImageRequest.Builder`：`.crossfade(true)` / `.useExistingImageAsPlaceholder()` / `.preferEndFirstIntrinsicSize()` / `.sizeResolver(...)` / `.diskCacheKey(...)` / `.memoryCacheKey(...)`
- `ImageLoader.Builder`：`.crossfade(...)` / `.memoryCacheMaxSizePercentWhileInBackground(...)` / `.repeatCount(n)`（gif）
- 类型互转：`image.asDrawable(resources)`、`drawable.asImage()`、`image.toBitmap()`、`bitmap.asImage()`、`image.asPainter()`（coil-compose-core）
- 可选模块：`coil-gif`、`coil-svg`、`coil-video`、`coil-network-cache-control`、`coil-test`、`coil-bom`

## 注意事项
- **预览不跑网络**：Studio Preview 禁网，URL 图片会失败；由 `LocalAsyncImagePreviewHandler` 控制。仅 Android 资源可用。
- **`rememberAsyncImagePainter` 默认按 `Size.ORIGINAL` 加载**（3.0.0-alpha07 起不再等待 `onDraw`），大图会浪费内存；需要按布局尺寸加载请用 `AsyncImage`，或给 `ImageRequest` 设 `DrawScopeSizeResolver`。
- `SubcomposeAsyncImage` 比普通 composition 慢，仅在确实需要立即观测状态时用。
- `AsyncImagePainter.state` 类型在 3.0.0-alpha07 改为 `StateFlow<State>`，必须 `collectAsState()`。
- **BREAKING 3.0.0-rc01**：`addLastModifiedToFileCacheKey` 默认关闭。
- **BREAKING 3.0.0-alpha10**：`networkObserverEnabled` 被替换为 `ConnectivityChecker`；要禁用传 `ConnectivityChecker.ONLINE` 给 `OkHttpNetworkFetcherFactory`/`KtorNetworkFetcherFactory`。
- **BREAKING 3.0.0-alpha07**：不再支持 `android.resource://pkg/drawable/name` URI；需手动注册 `ResourceUriMapper` 恢复。
- `maxBitmapSize` 默认 4096×4096，避免 `Size.ORIGINAL` 导致 OOM。
- Coil 3.2.0+ 的 `coil-compose` 要求 Java 11 bytecode（Compose 1.8.0 约束）；3.1.0+ 若用 KN 需 Kotlin 2.1+。
- `DeDupeConcurrentRequestStrategy` (3.4.0) 仍处实验阶段，默认关闭。
- **Compose Multiplatform** 必须用 `coil-network-ktor3`，不要用 OkHttp。
- 为无障碍，装饰性图像 `contentDescription = null`；有意义的图像必须提供可翻译文案。

## 组合提示
常与 `compose-networking`（后端返回的 URL 列表）、`LazyColumn` / `LazyVerticalGrid`（图片流），以及 `Modifier.clip` + `ContentScale.Crop` 搭配实现头像/卡片封面。
