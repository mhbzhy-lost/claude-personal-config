---
name: swiftui-image-loading
description: SwiftUI 远程图片加载方案对比——AsyncImage（系统内置）、Kingfisher、SDWebImageSwiftUI
tech_stack: [swiftui, ios, kingfisher, sdwebimage]
language: [swift]
capability: [media-processing]
version: "AsyncImage iOS 15.0+ / macOS 12.0+; Kingfisher 8.0 (iOS 13+, SwiftUI iOS 14+); SDWebImageSwiftUI 3.x (iOS 14+, macOS 11+)"
collected_at: 2026-04-18
---

# SwiftUI 远程图片加载

> 来源：developer.apple.com/documentation/swiftui/asyncimage | github.com/onevcat/Kingfisher | github.com/SDWebImage/SDWebImageSwiftUI

## 用途
在 SwiftUI 中异步下载并显示网络图片，带占位符、缓存、进度与失败状态。提供系统 API 与两大主流三方库的选型参考。

## 何时使用
- iOS 15+ 简单图标/头像，无需 GIF/WebP、无需复杂缓存控制 → **AsyncImage**
- 需要磁盘缓存、图片处理器（圆角/降采样）、Low Data Mode、纯 Swift 依赖 → **Kingfisher**
- 需要动画图（GIF/APNG/WebP/HEIF/AVIF）、SVG/PDF 矢量图、渐进式加载、Firebase/PhotosKit 加载器 → **SDWebImageSwiftUI**

## 选型对照

| 维度 | AsyncImage | Kingfisher (`KFImage`) | SDWebImageSwiftUI (`WebImage`/`AnimatedImage`) |
|---|---|---|---|
| 最低 iOS | 15 | 14 (SwiftUI) | 14 |
| 磁盘缓存 | 无（仅 URLCache） | 内置多层 | 内置多层 |
| 动画图格式 | 不支持 | 需插件 | GIF/APNG/WebP/HEIF/AVIF 原生 |
| 矢量图 SVG/PDF | 不支持 | 不支持 | 需 Coder 插件 |
| 图片处理器 | 无 | 内置 + 可组合 | 通过 Transformer |
| 依赖 | 零 | 纯 Swift | Objc + Swift |

## 基础用法

### AsyncImage（系统）

```swift
// 最简
AsyncImage(url: URL(string: "https://example.com/a.png"))
    .frame(width: 200, height: 200)

// 自定义占位符 + resizable
AsyncImage(url: url) { image in
    image.resizable().scaledToFit()     // 注意：resizable 必须作用在 Image 闭包参数上
} placeholder: {
    ProgressView()
}
.frame(width: 50, height: 50)

// 三态处理
AsyncImage(url: url) { phase in
    switch phase {
    case .empty:              ProgressView()
    case .success(let image): image.resizable().scaledToFit()
    case .failure:            Image(systemName: "photo")
    @unknown default:         EmptyView()
    }
}
```

### Kingfisher

```swift
import Kingfisher

// 最简 SwiftUI
KFImage(URL(string: "https://example.com/a.png"))

// 链式配置（推荐）
KFImage.url(url)
    .placeholder { ProgressView() }
    .setProcessor(DownsamplingImageProcessor(size: CGSize(width: 200, height: 200))
                  |> RoundCornerImageProcessor(cornerRadius: 12))
    .cacheOriginalImage
    .fade(duration: 0.25)
    .onSuccess { result in }
    .onFailure { error in }

// UIKit
imageView.kf.setImage(with: url, placeholder: UIImage(named: "ph"),
                      options: [.processor(processor), .transition(.fade(0.25))])
```

安装（SPM）：`https://github.com/onevcat/Kingfisher.git`，8.0.0 起。

### SDWebImageSwiftUI

```swift
import SDWebImageSwiftUI

// 静态图（推荐优先用 WebImage）
WebImage(url: URL(string: "https://example.com/a.heic")) { image in
    image.resizable()       // 必须显式 resizable
} placeholder: {
    Rectangle().foregroundColor(.gray)
}
.onSuccess { image, data, cacheType in }
.indicator(.activity)
.transition(.fade(duration: 0.5))
.scaledToFit()
.frame(width: 300, height: 300)

// 动画图（GIF/WebP 等高级控制）
@State var isAnimating = true
AnimatedImage(url: url, isAnimating: $isAnimating)
    .customLoopCount(1)
    .playbackRate(2.0)
    .resizable()
    .scaledToFit()          // 注意必须在 AnimatedImage 上直接调用
```

安装（SPM）：`https://github.com/SDWebImage/SDWebImageSwiftUI.git`，3.0.0 起。

### SDWebImageSwiftUI — 全局 Coder/Cache/Loader 初始化

```swift
@main
struct MyApp: App {
    init() {
        SDImageCodersManager.shared.addCoder(SDImageWebPCoder.shared)
        SDImageCodersManager.shared.addCoder(SDImageAVIFCoder.shared)
        SDImageCodersManager.shared.addCoder(SDImageSVGCoder.shared)
    }
    var body: some Scene { WindowGroup { ContentView() } }
}
```

## 关键 API（摘要）

### AsyncImage
- `init(url:scale:)` — 最简，默认占位符
- `init(url:scale:content:placeholder:)` — 自定义 Image 与 placeholder
- `init(url:scale:transaction:content:)` — `AsyncImagePhase`（empty/success/failure）
- 底层复用 `URLSession.shared`

### Kingfisher
- `KFImage(url)` / `KFImage.url(url)` — SwiftUI View
- `.placeholder { }` / `.setProcessor(_)` / `.fade(duration:)` / `.cacheOriginalImage`
- `.lowDataModeSource(.network(lowResURL))` — Low Data Mode
- `.onSuccess` / `.onFailure` / `.onProgress`
- `UIImageView.kf.setImage(with:placeholder:options:)` — UIKit 侧
- 处理器：`DownsamplingImageProcessor`、`RoundCornerImageProcessor`，`|>` 组合

### SDWebImageSwiftUI
- `WebImage(url:content:placeholder:)` — 静态/简单动画，基于 `Image`
- `AnimatedImage(url:placeholderImage:)` — 基于 `UIViewRepresentable`，高级动画/矢量
- `.indicator(.activity / .progress)` / `.transition(.fade)`
- `.customLoopCount(_)` / `.playbackRate(_)` / `.playbackMode(.bounce)`
- `.onSuccess` / `.onFailure` / `.onViewUpdate { view, ctx in }`
- `ImageManager`（`@ObservedObject`）— 自定义 View 图中直接驱动

## 注意事项

**AsyncImage**
- 图片 modifier（`resizable` / `renderingMode`）不能直接作用在 `AsyncImage` 上，必须作用在 content 闭包里的 `Image` 参数

**Kingfisher**
- 用 `DownsamplingImageProcessor` 配合 `scaleFactor(UIScreen.main.scale)` 防列表内存飙升
- `cacheOriginalImage` 可在详情页复用原图避免重下

**SDWebImageSwiftUI**
- **List/LazyVStack/LazyGrid 中状态丢失**：`WebImage`/`AnimatedImage` 有自身 `@State`，滚出屏幕会重置；必须包一层专用 sub-view struct 持有 `@State` 才能保持
- **Button/NavigationLink 默认 overlay 染色**：包 `WebImage` 时会变蓝，需加 `.buttonStyle(PlainButtonStyle())` 或图片侧 `.renderingMode(.original)`
- **AnimatedImage 方法名冲突**：`.transition`/`.indicator`/`.aspectRatio` 与 `SwiftUI.View` 同名，类型不同，歧义时需全限定
- **`.scaledToFit()` 调用顺序**：必须在 `AnimatedImage` 本身上调用，不能在 View modifier 之后（Swift 协议扩展静态派发）
- **AnimatedImage tint**：`.foregroundColor(_)` 不生效，用 `.tint(_)` / `.accentColor(_)`
- **v3.0.0 起放弃 iOS 13**：需 iOS 13 兼容请锁 2.x

**通用**
- SwiftUI 的 `resizable()` 是图片铺满容器的关键，三者都需要显式调用
- 占位符要给明确尺寸（`.frame`），否则 ProgressView 会占满父容器

## 组合提示
- 列表头像/缩略图 + 降采样处理器，避免内存飙升
- 与 `swiftui-networking` 分工：API JSON 走 URLSession，图片走专用库
- 需要离线 → Kingfisher/SDWebImageSwiftUI 的磁盘缓存自动生效
