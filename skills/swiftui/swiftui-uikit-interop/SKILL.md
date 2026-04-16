---
name: swiftui-uikit-interop
description: "SwiftUI<>UIKit 互操作：UIViewRepresentable/UIViewControllerRepresentable/Coordinator/UIHostingController。"
tech_stack: [swiftui]
language: [swift]
---

# SwiftUI <> UIKit 互操作

> 来源：https://developer.apple.com/documentation/swiftui/uiviewrepresentable
> https://developer.apple.com/documentation/swiftui/uihostingcontroller
> https://developer.apple.com/videos/play/wwdc2022/10072/
> 版本基准：SwiftUI 6 / iOS 18（sizeThatFits/sizingOptions 需 iOS 16+）

## 用途

在 SwiftUI 中使用 UIKit 视图/控制器（UIViewRepresentable），或在 UIKit 导航栈中嵌入 SwiftUI 视图（UIHostingController），实现两套框架的渐进式混合。

## 何时使用

- SwiftUI 缺少对应原生组件（MKMapView、WKWebView、UITextView 富文本等）
- 已有大量 UIKit 自定义控件需要复用，不值得重写
- UIKit 项目渐进式迁移，部分页面先用 SwiftUI 实现
- 需要使用 UIKit 特有能力（UICollectionViewCompositionalLayout、复杂手势识别器等）

## UIViewRepresentable（UIKit View -> SwiftUI）

### 生命周期调用顺序

`makeCoordinator()` -> `makeUIView(context:)` -> `updateUIView(_:context:)` (首次 + 每次状态变化) -> `dismantleUIView(_:coordinator:)` (移除时)

### 最小实现

```swift
struct MyTextField: UIViewRepresentable {
    @Binding var text: String

    func makeUIView(context: Context) -> UITextField {
        let tf = UITextField()
        tf.delegate = context.coordinator
        return tf
    }

    func updateUIView(_ uiView: UITextField, context: Context) {
        // 仅在值不同时更新，避免光标跳动
        if uiView.text != text {
            uiView.text = text
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    // static — 用于移除 observer 等清理工作
    static func dismantleUIView(_ uiView: UITextField, coordinator: Coordinator) {
        // 清理资源
    }
}
```

### sizeThatFits（iOS 16+）

覆写此方法向 SwiftUI 布局系统提供自定义尺寸，返回 `nil` 则走默认算法：

```swift
func sizeThatFits(
    _ proposal: ProposedViewSize,
    uiView: UITextField,
    context: Context
) -> CGSize? {
    let width = proposal.width ?? UIView.layoutFittingExpandedSize.width
    let fitSize = uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
    return fitSize
}
```

## Coordinator 模式（delegate/action 桥接）

Coordinator 是 UIKit delegate/target-action 与 SwiftUI 数据流之间的桥梁。SwiftUI 在 representable 生命周期内保持同一个 Coordinator 实例存活。

### 完整示例：UISearchBar + Coordinator

```swift
struct SearchBar: UIViewRepresentable {
    @Binding var text: String
    var onSearchClicked: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> UISearchBar {
        let bar = UISearchBar()
        bar.delegate = context.coordinator
        bar.autocapitalizationType = .none
        return bar
    }

    func updateUIView(_ uiView: UISearchBar, context: Context) {
        uiView.text = text
    }

    // MARK: - Coordinator
    class Coordinator: NSObject, UISearchBarDelegate {
        // 持有父 struct 的副本以访问 Binding
        var parent: SearchBar

        init(_ parent: SearchBar) {
            self.parent = parent
        }

        func searchBar(_ searchBar: UISearchBar, textDidChange searchText: String) {
            parent.text = searchText          // 写回 Binding
        }

        func searchBarSearchButtonClicked(_ searchBar: UISearchBar) {
            parent.onSearchClicked()
            searchBar.resignFirstResponder()
        }
    }
}

// 使用
struct ContentView: View {
    @State private var query = ""
    var body: some View {
        SearchBar(text: $query, onSearchClicked: { print("search: \(query)") })
    }
}
```

### Coordinator 关键规则

| 规则 | 说明 |
|------|------|
| 引用方向 | Coordinator 持有 parent（值类型副本），不可反向强引用 UIView |
| parent 同步 | `updateUIView` 被调时 SwiftUI 已更新 struct，需在该方法中执行 `context.coordinator.parent = self` 来同步最新 Binding |
| 闭包捕获 | Coordinator 内的闭包若捕获 UIView，务必用 `[weak view]` |
| 多 delegate | 一个 Coordinator 可同时实现多个 delegate 协议 |

```swift
func updateUIView(_ uiView: UISearchBar, context: Context) {
    context.coordinator.parent = self   // <-- 保持 Binding 引用最新
    uiView.text = text
}
```

## UIViewControllerRepresentable

与 UIViewRepresentable 对称，用于包装整个 UIViewController。生命周期方法命名为 `makeUIViewController` / `updateUIViewController` / `dismantleUIViewController`。

```swift
struct ImagePicker: UIViewControllerRepresentable {
    @Binding var selectedImage: UIImage?
    @Environment(\.dismiss) var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    class Coordinator: NSObject, UINavigationControllerDelegate, UIImagePickerControllerDelegate {
        let parent: ImagePicker
        init(_ parent: ImagePicker) { self.parent = parent }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            parent.selectedImage = info[.originalImage] as? UIImage
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}
```

## UIHostingController（SwiftUI -> UIKit）

将 SwiftUI View 嵌入 UIKit 视图层级。

### 基本用法

```swift
let hostingVC = UIHostingController(rootView: MySwiftUIView())
navigationController?.pushViewController(hostingVC, animated: true)
```

### 作为子控制器嵌入

```swift
let hosting = UIHostingController(rootView: MySwiftUIView())
addChild(hosting)
view.addSubview(hosting.view)
hosting.view.translatesAutoresizingMaskIntoConstraints = false
NSLayoutConstraint.activate([
    hosting.view.topAnchor.constraint(equalTo: view.topAnchor),
    hosting.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
    hosting.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
    hosting.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
])
hosting.didMove(toParent: self)
```

### sizingOptions（iOS 16+）

```swift
let hosting = UIHostingController(rootView: PopoverContent())
hosting.sizingOptions = .preferredContentSize   // popover 自动跟随内容尺寸
hosting.modalPresentationStyle = .popover
present(hosting, animated: true)
```

| 选项 | 作用 |
|------|------|
| `.intrinsicContentSize` | view 的 `intrinsicContentSize` 随 SwiftUI 内容自动更新 |
| `.preferredContentSize` | VC 的 `preferredContentSize` 随内容自动更新（适合 popover/sheet） |

默认值为空（不自动跟踪），启用会有轻微性能开销（每次 view update 都计算理想尺寸）。

### safeAreaRegions

```swift
hosting.safeAreaRegions = []   // 去掉 hosting 额外添加的 safe area，避免双重 inset
```

### UIHostingConfiguration（iOS 16+ Cell）

在 UICollectionView/UITableView cell 中直接使用 SwiftUI：

```swift
cell.contentConfiguration = UIHostingConfiguration {
    HStack {
        Image(systemName: "heart.fill")
        Text("SwiftUI in Cell")
    }
}
.margins(.horizontal, 16)
```

## 数据流桥接策略

| 场景 | 推荐方案 |
|------|----------|
| SwiftUI -> UIKit 单向 | 直接赋值 `hosting.rootView = MyView(data: newData)` |
| SwiftUI -> UIKit 自动 | 共享 `ObservableObject`，SwiftUI 用 `@ObservedObject`（iOS 17+用 `@Observable`），UIKit 侧用 Combine `sink` 或直接传入 |
| UIKit -> SwiftUI | Coordinator 写入 `@Binding`（delegate 回调中 `parent.value = x`） |
| UIKit -> SwiftUI 事件 | Coordinator 调用父 struct 中的闭包（`parent.onEvent()`） |
| 双向 | `@Binding` + Coordinator 组合；`updateUIView` 读、delegate 写 |

## 常见陷阱

1. **updateUIView 中无条件赋值** -- 对 UITextField/UITextView 直接 `uiView.text = text` 会导致光标归零。先比较 `uiView.text != text` 再赋值。

2. **Coordinator.parent 未同步** -- SwiftUI 每次重建 struct 时 Binding 地址可能变化。必须在 `updateUIView` 中 `context.coordinator.parent = self`，否则 delegate 回调写入的是旧 Binding。

3. **dismantleUIView 是 static 方法** -- 不能访问实例属性。清理逻辑通过 coordinator 参数传递状态。

4. **UIHostingController 未加入子控制器层级** -- 仅 `addSubview(hosting.view)` 而不调 `addChild` / `didMove(toParent:)` 会导致生命周期回调丢失、旋转/trait collection 不传递。

5. **Coordinator 闭包强引用 UIView** -- Coordinator 中的闭包若捕获 UIView 实例而不用 `[weak]`，可能造成循环引用（UIView -> SwiftUI 环境 -> Coordinator -> UIView）。

6. **sizingOptions 性能** -- `sizingOptions` 非空时每次 SwiftUI 内容变化都触发尺寸计算。大量 cell 使用 UIHostingConfiguration 时注意性能，避免在 SwiftUI 内容中放置高开销布局。

7. **safeAreaRegions 双重 inset** -- UIHostingController 默认添加 safe area insets。当 hosting view 已嵌入有 safe area 的容器时，设置 `safeAreaRegions = []` 避免内容被过度缩进。
