---
name: android-networking
description: Android HTTP 网络栈：OkHttp 客户端 + Retrofit 声明式 REST 接口
tech_stack: [android]
language: [kotlin, java]
capability: [http-client]
version: "OkHttp 5.3.0; Retrofit version unknown"
collected_at: 2026-04-18
---

# Android 网络（OkHttp + Retrofit）

> 来源：https://square.github.io/okhttp/ , https://square.github.io/retrofit/

## 用途
OkHttp 是底层 HTTP 客户端，提供 HTTP/2、连接池、GZIP、响应缓存、TLS 1.3、证书固定。Retrofit 在 OkHttp 之上把 REST 接口转成声明式 Java/Kotlin interface。

## 何时使用
- 需要在 Android 5.0+ / Java 8+ 上发起 HTTP 请求
- 希望以注解声明 REST endpoint，自动完成 JSON / Protobuf 等序列化
- 需要拦截器做鉴权头注入、日志、重试、压缩
- 需要自定义 TLS 版本、Cipher Suite 或证书固定

## 基础用法

**OkHttp 同步 GET**
```java
OkHttpClient client = new OkHttpClient();
Request request = new Request.Builder().url(url).build();
try (Response response = client.newCall(request).execute()) {
  return response.body().string();
}
```

**OkHttp POST JSON**
```java
MediaType JSON = MediaType.get("application/json");
RequestBody body = RequestBody.create(json, JSON);
Request request = new Request.Builder().url(url).post(body).build();
```

**Retrofit 声明 + 调用**
```kotlin
interface GitHubService {
  @GET("users/{user}/repos")
  suspend fun listRepos(@Path("user") user: String): List<Repo>
}

val retrofit = Retrofit.Builder()
    .baseUrl("https://api.github.com/")
    .addConverterFactory(GsonConverterFactory.create())
    .build()
val service = retrofit.create(GitHubService::class.java)
```

## 关键 API

**OkHttp**
- `OkHttpClient.Builder.addInterceptor(...)`：应用拦截器，每个逻辑请求调用一次，不处理重定向/重试
- `addNetworkInterceptor(...)`：网络拦截器，每次实际网络请求都调用（含重定向/重试），缓存命中时跳过
- `chain.proceed(request)`：执行请求；如需多次调用，必须先 close 前一次的 response.body
- `ConnectionSpec.MODERN_TLS` / `COMPATIBLE_TLS` / `RESTRICTED_TLS` / `CLEARTEXT`：连接规格
- `CertificatePinner`：证书固定（上线前需管理员审批）

**Retrofit 注解**
- `@GET / @POST / @PUT / @PATCH / @DELETE / @HEAD / @OPTIONS / @HTTP`
- `@Path("id")`：URL 占位替换；`@Query` / `@QueryMap`：查询参数
- `@Body`：请求体（需 Converter）；`@FormUrlEncoded` + `@Field`；`@Multipart` + `@Part`
- `@Headers("K: V")` 静态头；`@Header` / `@HeaderMap` 动态头
- Kotlin `suspend fun`：可返回 `Response<T>` 或直接 `T`（非 2xx 抛 `HttpException`）

**Converter / CallAdapter**
- Gson、Moshi、Jackson、Kotlinx Serialization、Protobuf、Scalars
- CallAdapter：RxJava 1/2/3、`CompletableFuture`、`ListenableFuture`、Kotlin `suspend`

## 注意事项
- 拦截器中多次 `chain.proceed()` 必须关闭之前的 response body，否则连接泄漏
- 响应改写（response rewriting）被文档明确标为"更危险"，优先修服务端
- `CertificatePinner` 与自定义 `SSLContext / sslSocketFactory` 会限制服务端灵活性，需管理员授权
- Retrofit `Call` 单次使用，复用需 `clone()`
- Android 上 Retrofit 回调在主线程；JVM 上在 HTTP 线程
- TLS 握手失败 99% 是客户端/服务端没有共同的 TLS 版本或 cipher，用 Qualys SSL Labs 核查

## 组合提示
- 搭配 `coil-network-okhttp`（Coil 图片加载共享同一 `OkHttpClient`）
- 搭配 Kotlin Coroutines / Flow，用 `suspend` 接口直接拿结果
- 日志拦截器 `HttpLoggingInterceptor` 做调试
