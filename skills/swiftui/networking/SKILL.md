---
name: swiftui-networking
description: 在 SwiftUI/iOS 应用中使用 URLSession + JSONDecoder 进行 HTTP 请求、文件下载与 JSON 解析
tech_stack: [swiftui, ios, foundation]
language: [swift]
capability: [http-client]
version: "URLSession iOS 7.0+ / macOS 10.9+; JSONDecoder iOS 8.0+; URLSessionDownloadTask iOS 7.0+"
collected_at: 2026-04-18
---

# SwiftUI 网络请求（URLSession + JSONDecoder）

> 来源：developer.apple.com/documentation/foundation/urlsession | jsondecoder | urlsessiondownloadtask

## 用途
基于 Foundation 的 URLSession 体系在 SwiftUI 应用中发起 HTTP/HTTPS 请求、下载文件、WebSocket 通信，并用 `JSONDecoder` 将响应反序列化为 `Codable` 模型。

## 何时使用
- REST API 调用（GET/POST/PUT/DELETE），解析 JSON
- 大文件下载（支持后台任务、断点续传）
- 上传图片/文件到服务端
- WebSocket 双向通信
- 需要进度回调、代理认证、自定义 Session 配置的场景

## 基础用法

### async/await 数据请求（推荐，iOS 15+）

```swift
struct Product: Codable { let name: String; let points: Int }

func fetchProduct() async throws -> Product {
    let url = URL(string: "https://api.example.com/product")!
    let (data, response) = try await URLSession.shared.data(from: url)
    guard let http = response as? HTTPURLResponse,
          (200...299).contains(http.statusCode) else {
        throw URLError(.badServerResponse)
    }
    return try JSONDecoder().decode(Product.self, from: data)
}

// 在 SwiftUI View 中调用
.task {
    do { product = try await fetchProduct() } catch { /* handle */ }
}
```

### completion handler 数据请求（兼容旧版本）

```swift
let task = URLSession.shared.dataTask(with: url) { data, response, error in
    if let error = error { return self.handleClientError(error) }
    guard let http = response as? HTTPURLResponse,
          (200...299).contains(http.statusCode) else {
        return self.handleServerError(response)
    }
    DispatchQueue.main.async { /* 更新 UI */ }
}
task.resume()   // Tasks 创建后处于 suspended 状态，必须 resume()
```

### 自定义 Session 配置

```swift
private lazy var session: URLSession = {
    let cfg = URLSessionConfiguration.default
    cfg.waitsForConnectivity = true       // 无网时等待而非立即失败
    cfg.timeoutIntervalForRequest = 30
    return URLSession(configuration: cfg, delegate: self, delegateQueue: nil)
}()
```

### 下载任务

```swift
let (tempURL, response) = try await URLSession.shared.download(from: url)
// tempURL 是临时文件，必须立即移动到沙盒目录，否则被清理
let dest = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    .appendingPathComponent("file.zip")
try FileManager.default.moveItem(at: tempURL, to: dest)
```

### JSONDecoder 策略

```swift
let decoder = JSONDecoder()
decoder.keyDecodingStrategy = .convertFromSnakeCase   // user_name -> userName
decoder.dateDecodingStrategy = .iso8601
let result = try decoder.decode(MyModel.self, from: data)
```

## 关键 API（摘要）

### URLSession
- `URLSession.shared` — 单例，适合轻量请求，不可配代理
- `data(from:)` / `data(for:)` — async 版本，返回 `(Data, URLResponse)`
- `download(from:)` / `upload(for:from:)` — async 下载/上传
- `bytes(from:)` — 返回 `AsyncSequence<UInt8>`，流式消费
- `dataTask(with:completionHandler:)` — completion handler 版本
- `webSocketTask(with:)` — WebSocket
- `invalidateAndCancel()` / `finishTasksAndInvalidate()` — 用完必须调用避免泄漏
- `URLSessionConfiguration.default/.ephemeral/.background(withIdentifier:)` — 三种配置
- `waitsForConnectivity = true` — 自定义 Session 时推荐开启

### JSONDecoder
- `decode(_:from:)` — 核心解码方法
- `keyDecodingStrategy = .convertFromSnakeCase`
- `dateDecodingStrategy = .iso8601 / .formatted(_:) / .secondsSince1970`
- `dataDecodingStrategy = .base64`

### URLSessionDownloadTask
- `cancel(byProducingResumeData:)` — 暂停并产出 resumeData
- `session.downloadTask(withResumeData:)` — 用 resumeData 恢复

## 注意事项
- **Session 持有 delegate 强引用**：不调用 `invalidateAndCancel()` / `finishTasksAndInvalidate()` 会导致内存泄漏直到 app 退出
- **Task 默认 suspended**：`dataTask(with:)` 返回后必须 `resume()` 才会发起请求；`data(from:)` async 版本不需要
- **Completion handler 不在主线程**：更新 UI 必须 `DispatchQueue.main.async` 或 `@MainActor`
- **不要到处新建 Session**：相同配置的请求应共享一个 Session 实例（属性/单例）
- **ATS 强制 HTTPS**：iOS 9+ 默认禁止明文 HTTP，需 HTTPS 或在 Info.plist 配置 `NSAppTransportSecurity` 例外
- **下载完成回调中的临时文件**：`didFinishDownloadingTo` 传入的 URL 在回调返回后立即失效，必须同步移动到永久位置
- **Download error 语义**：`didCompleteWithError` 的 error 只表示客户端错误（如 DNS 解析失败），服务器 4xx/5xx 需自行检查 `HTTPURLResponse.statusCode`
- **Combine 可选**：`dataTaskPublisher(for:)` 用于 Combine 管道，但新项目优先 async/await

## 组合提示
- 与 `@Observable` / `ObservableObject` ViewModel 搭配，View 通过 `.task {}` 触发加载
- 配合 `swiftui-image-loading` 的 AsyncImage 处理图片
- 错误/加载状态用 `enum LoadState { case idle, loading, loaded(T), failed(Error) }` 驱动 UI
