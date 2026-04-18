---
name: android-image-loading
description: Android 图片加载：Coil（Kotlin/Compose 优先）与 Glide（成熟 View 体系）
tech_stack: [android]
language: [kotlin, java]
capability: [media-processing]
version: "Coil 3.4.0; Glide v4 (exact version unknown)"
collected_at: 2026-04-18
---

# Android 图片加载（Coil + Glide）

> 来源：https://coil-kt.github.io/coil/ , https://bumptech.github.io/glide/

## 用途
Coil 是 Kotlin-first、Compose 友好的多平台图片加载库，基于协程与 OkHttp/Ktor。Glide 是成熟的 View 体系库，专注 RecyclerView 场景的自动回收与多层缓存。

## 何时使用
- 项目用 Compose、Kotlin、Multiplatform → **Coil**
- 已有大量 View / Java 代码、需要丰富的转换与缓存策略 → **Glide**
- RecyclerView 里加载大量缩略图 → Glide（自动 view recycling）或 Coil `imageView.load`

## 基础用法

**Coil（Compose）**
```kotlin
implementation("io.coil-kt.coil3:coil-compose:3.4.0")
implementation("io.coil-kt.coil3:coil-network-okhttp:3.4.0")

AsyncImage(model = "https://example.com/image.jpg", contentDescription = null)
```

**Coil（View）**
```kotlin
imageView.load("https://example.com/image.jpg")
```

**Coil 单例 ImageLoader**
```kotlin
class App : Application(), SingletonImageLoader.Factory {
    override fun newImageLoader(context: Context) =
        ImageLoader.Builder(context).crossfade(true).build()
}
```

**Glide 基础**
```java
Glide.with(fragment).load(url).into(imageView);
Glide.with(fragment).clear(imageView);  // 取消加载
```

**Glide 选项**
```java
Glide.with(fragment)
    .load(url)
    .placeholder(R.drawable.ph)
    .centerCrop()
    .transition(withCrossFade())
    .diskCacheStrategy(DiskCacheStrategy.ALL)
    .into(imageView);
```

## 关键 API

**Coil**
- `AsyncImage(model, contentDescription)` / `SubcomposeAsyncImage`（Compose）
- `ImageView.load(url) { placeholder(...); transformations(...) }`
- `ImageLoader.Builder().memoryCache { ... }.diskCache { ... }.crossfade(true)`
- 单例配置入口：`SingletonImageLoader.setSafe { ... }`、`SingletonImageLoader.Factory`（Application）、`setSingletonImageLoaderFactory { ... }`（Compose）
- 构件：`coil`、`coil-core`、`coil-compose`、`coil-network-okhttp`、`coil-gif/svg/video`

**Glide**
- `Glide.with(fragment).load(model).into(view)`
- `.placeholder()`、`.error()`、`.fallback()`、`.thumbnail(0.25f)`
- `.diskCacheStrategy(DiskCacheStrategy.{ALL, NONE, DATA, RESOURCE, AUTOMATIC})`
- `.skipMemoryCache(true)` / `.onlyRetrieveFromCache(true)`
- `.signature(ObjectKey(version))` 用于缓存失效
- `RequestOptions` 可共享并 `.apply()` 到多个 `RequestBuilder`
- `Glide.get(ctx).setMemoryCategory(...)` / `clearMemory()`（主线程）/ `clearDiskCache()`（后台线程）

## 注意事项
- **Coil**：同一 app 应共用一个 `ImageLoader`——每个实例独立缓存与 `OkHttpClient`
- **Coil 库作者**：如果你写的是依赖 Coil 的库，**不要**读写单例 `ImageLoader`
- Compose Multiplatform 下 Coil 用 `coil-network-ktor3` 而非 OkHttp
- **Glide `clearMemory()` 必须主线程，`clearDiskCache()` 必须后台线程**
- Glide `TransitionOptions` 按资源类型分：Bitmap 用 `BitmapTransitionOptions`，Drawable 用 `DrawableTransitionOptions`
- Glide 多个 `RequestOptions` 冲突时，**后 apply 的覆盖前面的**
- Glide 自定义 model 作缓存 key 时必须实现 `hashCode()` / `equals()`
- Glide `.error(fallbackUrl)` 作为 RequestBuilder 回退自 v4.3.0
- RecyclerView 的非图片 position 必须显式 `Glide.with(fragment).clear(view)`，否则出现错位

## 组合提示
- 与 OkHttp 共享：Coil `coil-network-okhttp` 可复用项目里现有的 `OkHttpClient`
- Compose + Coil：`AsyncImage` / `rememberAsyncImagePainter`
- Glide + Paging：在 `onBindViewHolder` 里正常 `.load().into()`，无需手动管理
