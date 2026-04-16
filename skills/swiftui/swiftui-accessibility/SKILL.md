---
name: swiftui-accessibility
description: "SwiftUI 无障碍：accessibilityLabel/Representation、Dynamic Type、VoiceOver、减少动效。"
tech_stack: [swiftui]
---

# SwiftUI 无障碍

> 来源：https://developer.apple.com/documentation/swiftui/view-accessibility
> 版本基准：SwiftUI 6 / iOS 18 / Xcode 16

## 用途

为依赖辅助技术（VoiceOver、Switch Control、Voice Control）的用户提供等价的应用体验。SwiftUI 内置控件默认具备基础无障碍支持，但自定义视图、复合控件和纯装饰元素需要开发者显式标注。

## 何时使用

- 自定义视图缺少有意义的 VoiceOver 朗读内容
- 复合视图需要合并/拆分为逻辑化的无障碍元素
- 自定义控件需要映射为系统原生控件的交互行为
- 固定尺寸的间距/图标需要随 Dynamic Type 同步缩放
- 动画需要响应用户的"减少动效"偏好

## accessibilityLabel / Value / Hint

三者分工明确，VoiceOver 按 **Label -> Value -> Trait -> Hint** 的顺序朗读。

```swift
// Label：元素是什么（必填级别，最常遗漏的 API）
Button(action: send) {
    Image(systemName: "paperplane.fill")
}
.accessibilityLabel("发送消息")  // 没有 label，VoiceOver 只会读 "按钮"

// Value：当前状态/数值（仅在与 label 不同时设置）
Slider(value: $volume, in: 0...100)
    .accessibilityValue("\(Int(volume))%")

// Hint：执行后会发生什么（延迟朗读，可选）
Button("删除") { delete() }
    .accessibilityHint("双击将永久删除此项目")
```

**要点**：
- `Text("xxx")` 自动成为其父控件的 label，**无需重复设置**。
- `Image(systemName:)` 的 SF Symbol 名称会被自动作为 label；若不准确需手动覆盖。
- `Image(decorative:)` 或 `.accessibilityHidden(true)` 隐藏纯装饰元素。
- Label 应简洁描述**是什么**，而非**怎么做**（"播放"而非"双击以播放"）。

## accessibilityRepresentation

将自定义控件的无障碍树**替换为**一个系统原生控件的无障碍信息，省去手动配置 traits、actions、value 的繁琐步骤。闭包中的视图不会被渲染，仅用于生成无障碍元素。

```swift
// 自定义 Toggle：用原生 Toggle 的无障碍行为替代
HStack {
    Text("飞行模式")
    Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
}
.onTapGesture { isOn.toggle() }
.accessibilityRepresentation {
    Toggle("飞行模式", isOn: $isOn)
}

// 自定义评分：映射为 Stepper
StarsView(rating: $rating)
    .accessibilityRepresentation {
        Stepper("\(rating) 星评分", value: $rating, in: 0...5, step: 1)
    }
```

**适用场景**：自定义控件的交互逻辑与某个系统控件（Toggle / Slider / Stepper / Picker）等价时。

## accessibilityElement / accessibilityChildren

控制视图树在无障碍树中的结构映射。

### accessibilityElement(children:)

```swift
// .combine -- 合并子视图 label 为单个元素（逗号分隔朗读）
HStack {
    Image(systemName: "star.fill")
    Text("收藏")
    Text("128 项")
}
.accessibilityElement(children: .combine)
// VoiceOver 朗读："star.fill, 收藏, 128 项"

// .ignore -- 忽略子视图，用自定义 label 替代
HStack { Image(systemName: "star.fill"); Text("收藏") }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("收藏，共 128 项")

// .contain -- 保持子视图为独立元素，但包裹在容器中
VStack { /* 多个可独立操作的子视图 */ }
    .accessibilityElement(children: .contain)
```

### accessibilityChildren(children:)

为视图创建一组**虚拟无障碍子元素**，适用于可视内容与无障碍结构不一致的场景（典型：自定义图表）。

```swift
BarChartShape(data: data)
    .accessibilityLabel("销售额图表")
    .accessibilityChildren {
        ForEach(data) { point in
            Rectangle()
                .accessibilityLabel(point.month)
                .accessibilityValue("\(point.value) 万")
        }
    }
```

**与 accessibilityRepresentation 的区别**：`accessibilityRepresentation` 替换整个元素；`accessibilityChildren` 仅添加子元素，保留当前元素自身的 label/trait。

## accessibilityAction

为无障碍用户提供额外的交互入口，补充手势无法传达的操作。

```swift
// 命名 action（VoiceOver 用户可通过"操作"菜单访问）
MessageCell(message: msg)
    .accessibilityAction(named: "回复") { reply(to: msg) }
    .accessibilityAction(named: "删除") { delete(msg) }

// Magic Tap（双指双击）-- 全局快捷操作
PlayerView()
    .accessibilityAction(.magicTap) { togglePlayPause() }

// Escape（双指 Z 字划）-- 关闭/返回
ModalView()
    .accessibilityAction(.escape) { dismiss() }

// 自定义可调节值（上下滑动调节）
.accessibilityAdjustableAction { direction in
    switch direction {
    case .increment: rating = min(rating + 1, 5)
    case .decrement: rating = max(rating - 1, 0)
    @unknown default: break
    }
}
```

## Dynamic Type（@ScaledMetric / dynamicTypeSize）

系统文字和 SF Symbols 自动缩放，但**自定义间距、图标尺寸、固定布局**需要手动适配。

### @ScaledMetric

```swift
// 基础：值随 Dynamic Type 等比缩放
@ScaledMetric private var iconSize: CGFloat = 24

// 绑定到特定文字样式（与对应字号同步缩放）
@ScaledMetric(relativeTo: .caption) private var badgePadding: CGFloat = 4
@ScaledMetric(relativeTo: .body) private var avatarSize: CGFloat = 40

var body: some View {
    HStack {
        Image(systemName: "person.circle")
            .resizable()
            .frame(width: avatarSize, height: avatarSize)
        Text("用户名")
    }
}
```

**典型用途**：padding、cornerRadius、图标 frame、分隔线高度 -- 任何硬编码的 `CGFloat`，若相邻有文字，都应考虑用 `@ScaledMetric`。

### dynamicTypeSize 环境值

```swift
@Environment(\.dynamicTypeSize) private var typeSize

var body: some View {
    if typeSize.isAccessibilitySize {
        // 无障碍大字号时切换为纵向布局、移除装饰图片
        VStack { content }
    } else {
        HStack { decorativeImage; content }
    }
}

// 限制支持的字号范围（谨慎使用，会降低无障碍体验）
Text("固定区域文字")
    .dynamicTypeSize(.small ... .accessibility1)
```

## 减少动效（accessibilityReduceMotion）

```swift
@Environment(\.accessibilityReduceMotion) private var reduceMotion

// 模式一：有条件地禁用动画
.animation(reduceMotion ? nil : .spring(), value: isExpanded)

// 模式二：替换为更温和的过渡
.transition(reduceMotion ? .opacity : .slide)

// 模式三：封装为可复用计算属性
private var gentleAnimation: Animation? {
    reduceMotion ? nil : .easeInOut(duration: 0.3)
}

// 模式四：withAnimation 也需要适配
func toggle() {
    if reduceMotion {
        isExpanded.toggle()
    } else {
        withAnimation(.spring()) { isExpanded.toggle() }
    }
}
```

**注意**：`withAnimation()` 和隐式 `.animation()` **都不会**自动尊重 Reduce Motion 设置，必须手动检查。

## VoiceOver 测试要点

### 工具

| 工具 | 用途 | 启动方式 |
|---|---|---|
| Accessibility Inspector | 开发时快速检查元素属性 | Xcode -> Open Developer Tool -> Accessibility Inspector |
| VoiceOver (真机) | 最终验证，**不可替代** | 设置 -> 辅助功能 -> VoiceOver，或三击侧边按钮 |
| VoiceOver (模拟器) | 粗略验证 | Xcode 15+：模拟器菜单 -> Features -> Accessibility |

### 核心手势

| 手势 | 作用 |
|---|---|
| 左/右滑动 | 上一个/下一个元素 |
| 双击 | 激活当前元素 |
| 上/下滑动 | 调节可调节值（Slider/Stepper） |
| 三指滑动 | 滚动 |
| 双指双击 | Magic Tap |
| 双指 Z 字划 | Escape（返回/关闭） |
| 转子（两指旋转） | 切换导航模式（标题/链接/容器等） |

### 检查清单

1. **所有可交互元素都有 label**：逐一滑动遍历，确认每个按钮/控件朗读内容有意义。
2. **焦点顺序合理**：从上到下、从左到右，与视觉布局一致。
3. **装饰元素已隐藏**：分隔线、纯装饰图片不应出现在焦点序列中。
4. **动态内容有通知**：内容更新后用 `AccessibilityNotification.Announcement("已加载").post()` 通知 VoiceOver。
5. **模态视图限制焦点**：`.accessibilityAddTraits(.isModal)` 防止焦点逃逸到遮罩后方。
6. **大字号下布局不截断**：在"设置 -> 辅助功能 -> 显示与文字大小"中开到最大，检查文字是否溢出。

## 常见陷阱

1. **Image 缺少 label**：`Image("icon")` 默认以文件名为 label（通常无意义）。用 `Image(decorative:)` 隐藏，或用 `.accessibilityLabel()` 覆盖。

2. **Button 中只有 Image**：`Button { } label: { Image(systemName: "xmark") }` 朗读为"close, 按钮"——SF Symbol 名称翻译可能不准确，需手动设置 `.accessibilityLabel("关闭")`。

3. **accessibilityElement(children: .combine) 信息冗余**：合并后所有子 label 拼接朗读，可能过长。此时应改用 `.ignore` + 自定义 label。

4. **@ScaledMetric 在 PreviewProvider 中不生效**：需要在 Preview 上设置 `.environment(\.sizeCategory, .accessibilityExtraExtraExtraLarge)` 才能看到缩放效果。

5. **withAnimation 不尊重 Reduce Motion**：必须手动读取 `accessibilityReduceMotion` 环境值并条件化动画，系统不会自动处理。

6. **VoiceOver 焦点被隐藏视图捕获**：`.opacity(0)` 和 `.hidden()` 的行为不同--`.opacity(0)` 仍可被 VoiceOver 聚焦，`.hidden()` 则完全移除。需要隐藏时用 `.accessibilityHidden(true)` 最为明确。

7. **accessibilityIdentifier 与 accessibilityLabel 混淆**：`identifier` 仅供 UI 测试定位元素，用户不可见；`label` 是 VoiceOver 朗读内容。两者独立，不要用 identifier 替代 label。
