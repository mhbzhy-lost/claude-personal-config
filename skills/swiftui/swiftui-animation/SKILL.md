---
name: swiftui-animation
description: "SwiftUI 动画：withAnimation/PhaseAnimator/KeyframeAnimator/matchedGeometryEffect/transition/symbolEffect。"
tech_stack: [swiftui, ios, mobile-native]
language: [swift]
capability: [ui-display, theming]
---

# SwiftUI 动画与转场

> 来源：https://developer.apple.com/documentation/swiftui/animations
> 版本基准：SwiftUI 6 / iOS 17-18

## 用途

SwiftUI 的声明式动画系统：通过状态变化自动驱动视图属性插值，无需手动管理帧。覆盖从简单隐式动画到多阶段关键帧、共享元素转场的全部场景。

## 何时使用

- 状态变化需要平滑过渡（颜色、位置、透明度）-- withAnimation / .animation
- 多步骤序列动画（加载指示器、引导动画）-- PhaseAnimator
- 精确时间轴控制（弹跳、缩放组合）-- KeyframeAnimator
- 列表/网格切换时元素需要视觉连续性 -- matchedGeometryEffect
- 视图插入/移除需要出入场效果 -- transition
- SF Symbols 需要动态反馈 -- symbolEffect

---

## withAnimation 基础

```swift
// 显式动画：包裹状态变更，所有依赖该状态的视图属性自动动画
withAnimation(.easeInOut(duration: 0.3)) {
    isExpanded.toggle()
}

// 隐式动画：直接绑定到视图，该属性任何变化都会动画
Circle()
    .scaleEffect(isActive ? 1.2 : 1.0)
    .animation(.spring, value: isActive)
```

**选择原则**：优先用 `withAnimation`（精确控制哪次状态变更触发动画）；`.animation(_:value:)` 适合"该属性永远需要动画"的场景。

---

## Animation 类型

### 内置预设

```swift
.linear(duration: 0.3)
.easeIn(duration: 0.3)
.easeOut(duration: 0.3)
.easeInOut(duration: 0.3)
.spring                          // iOS 17+ 默认弹簧，推荐首选
.bouncy                          // 预设高弹性弹簧
.smooth                          // 预设无回弹弹簧
.snappy                          // 预设快速弹簧
.interactiveSpring               // 手势跟随用，响应更快
```

### spring 参数详解

```swift
.spring(response: 0.55, dampingFraction: 0.825, blendDuration: 0)
```

| 参数 | 默认值 | 含义 |
|------|--------|------|
| `response` | 0.55 | 弹簧周期（秒）。越小越快。设为 0 时等效于 stiffness 无穷大 |
| `dampingFraction` | 0.825 | 阻尼比。0 = 永不停止振荡；1 = 临界阻尼（无回弹）；>1 = 过阻尼 |
| `blendDuration` | 0 | 与前一个动画混合过渡的时长（秒），用于动画中断时平滑衔接 |

**常见配置**：
- 弹性按钮反馈：`response: 0.3, dampingFraction: 0.6`
- 平滑位移：`response: 0.5, dampingFraction: 1.0`（无回弹）
- 活泼弹跳：`response: 0.4, dampingFraction: 0.5`

### 修饰器

```swift
.spring.delay(0.2)               // 延迟
.spring.speed(2)                  // 加速
.spring.repeatForever()           // 无限循环
.spring.repeatCount(3, autoreverses: true) // 重复 3 次并自动反向
```

---

## PhaseAnimator（多阶段动画）

iOS 17+。自动在多个"阶段"间循环，每个阶段定义不同的视图属性。

```swift
// 1. 定义阶段枚举（必须 CaseIterable）
enum Phase: CaseIterable {
    case initial, scale, rotate, fadeOut

    var scaleValue: Double {
        switch self {
        case .initial: 1.0
        case .scale:   1.5
        case .rotate:  1.2
        case .fadeOut:  0.8
        }
    }
    var angle: Angle {
        switch self {
        case .rotate: .degrees(90)
        default:      .degrees(0)
        }
    }
    var opacity: Double {
        self == .fadeOut ? 0.3 : 1.0
    }
}

// 2. 使用 PhaseAnimator（自动循环）
PhaseAnimator(Phase.allCases) { phase in
    Image(systemName: "star.fill")
        .scaleEffect(phase.scaleValue)
        .rotationEffect(phase.angle)
        .opacity(phase.opacity)
} animation: { phase in
    switch phase {
    case .initial: .smooth
    case .scale:   .spring(response: 0.4, dampingFraction: 0.6)
    case .rotate:  .easeInOut(duration: 0.5)
    case .fadeOut:  .easeOut(duration: 0.3)
    }
}

// 3. 触发式（不自动循环，由 trigger 值变化触发一轮）
Text("Tap me")
    .phaseAnimator(Phase.allCases, trigger: tapCount) { content, phase in
        content
            .scaleEffect(phase.scaleValue)
            .opacity(phase.opacity)
    } animation: { phase in
        .spring(response: 0.3, dampingFraction: 0.7)
    }
```

**要点**：phases 数组的第一个元素是"静止态"，动画从第二个元素开始；trigger 版本播完后回到第一个元素。

---

## KeyframeAnimator（关键帧动画）

iOS 17+。为多个属性定义独立的时间轴关键帧，比 PhaseAnimator 更精确。

```swift
// 1. 定义动画值容器
struct AnimValues {
    var scale: Double = 1.0
    var yOffset: Double = 0.0
    var opacity: Double = 1.0
}

// 2. 使用 KeyframeAnimator
KeyframeAnimator(initialValue: AnimValues(), repeating: true) { values in
    Image(systemName: "heart.fill")
        .scaleEffect(values.scale)
        .offset(y: values.yOffset)
        .opacity(values.opacity)
} keyframes: { _ in
    // 每个 KeyframeTrack 控制一个属性的时间线
    KeyframeTrack(\.scale) {
        LinearKeyframe(1.0, duration: 0.2)
        SpringKeyframe(1.5, duration: 0.4, spring: .bouncy)
        SpringKeyframe(1.0, spring: .smooth)
    }
    KeyframeTrack(\.yOffset) {
        CubicKeyframe(-30, duration: 0.3)  // 平滑曲线插值
        CubicKeyframe(0, duration: 0.3)
    }
    KeyframeTrack(\.opacity) {
        LinearKeyframe(1.0, duration: 0.4)
        LinearKeyframe(0.5, duration: 0.2)
        MoveKeyframe(1.0)                   // 瞬时跳变，无插值
    }
}
```

**关键帧类型**：

| 类型 | 插值方式 | 场景 |
|------|----------|------|
| `CubicKeyframe` | 三次贝塞尔曲线 | 平滑过渡（最常用） |
| `SpringKeyframe` | 弹簧物理 | 弹性效果 |
| `LinearKeyframe` | 线性 | 匀速变化 |
| `MoveKeyframe` | 无插值，瞬时跳变 | 重置、闪烁 |

**触发式**：将 `repeating: true` 替换为 `trigger: someValue`。

---

## matchedGeometryEffect（共享元素转场）

在两个视图之间同步位置和大小，实现"英雄动画"效果。

```swift
@Namespace private var animation
@State private var isExpanded = false

var body: some View {
    if isExpanded {
        // 展开态
        RoundedRectangle(cornerRadius: 20)
            .fill(.blue)
            .matchedGeometryEffect(id: "card", in: animation)
            .frame(maxWidth: .infinity, maxHeight: 400)
            .onTapGesture {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                    isExpanded = false
                }
            }
    } else {
        // 收起态
        RoundedRectangle(cornerRadius: 10)
            .fill(.blue)
            .matchedGeometryEffect(id: "card", in: animation)
            .frame(width: 100, height: 100)
            .onTapGesture {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                    isExpanded = true
                }
            }
    }
}
```

**关键参数**：
- `id`：匹配标识，两端必须相同
- `in`：`@Namespace` 命名空间
- `properties`：`.frame`（默认）/ `.position` / `.size`
- `isSource`：默认 true；同一 id 只能有一个 source 为 true

---

## transition（视图转场）

控制视图在 `if/switch` 条件插入或移除时的进场/退场动画。

```swift
// 内置转场
.transition(.opacity)                // 淡入淡出
.transition(.scale)                  // 缩放
.transition(.slide)                  // 从左侧滑入
.transition(.move(edge: .bottom))    // 从指定边缘滑入
.transition(.push(from: .trailing))  // iOS 17+，推入推出

// 组合与非对称
.transition(.opacity.combined(with: .scale))
.transition(.asymmetric(
    insertion: .move(edge: .top).combined(with: .opacity),
    removal: .scale(scale: 0.5).combined(with: .opacity)
))

// 使用
if showDetail {
    DetailView()
        .transition(.move(edge: .bottom))
}
// 状态切换必须包裹在 withAnimation 中才能触发转场
```

---

## symbolEffect（SF Symbols 动画）

iOS 17+。为 SF Symbols 添加内置动画效果。

```swift
// 离散效果：由值变化触发一次
Image(systemName: "bell.fill")
    .symbolEffect(.bounce, value: bellTapped)   // 弹跳
    .symbolEffect(.pulse, value: alertCount)    // 脉冲

// 持续效果：isActive 为 true 时持续播放
Image(systemName: "wifi")
    .symbolEffect(.variableColor.iterative, isActive: isSearching)

// 可选配置
Image(systemName: "star.fill")
    .symbolEffect(.bounce, options: .speed(2).repeat(3), value: trigger)

// 替换动画：在两个 symbol 间切换时使用
Image(systemName: isPlaying ? "pause.fill" : "play.fill")
    .contentTransition(.symbolEffect(.replace))
```

**常用效果**：`.bounce`、`.pulse`、`.variableColor`、`.scale`、`.appear`、`.disappear`、`.replace`、`.breathe`（iOS 18+）、`.rotate`（iOS 18+）

---

## CustomAnimation 协议

iOS 17+。完全自定义动画曲线。

```swift
struct WiggleAnimation: CustomAnimation {
    var frequency: Double = 3

    // 必须实现：返回 nil 表示动画结束
    func animate<V: VectorArithmetic>(
        value: V, time: TimeInterval, context: inout AnimationContext<V>
    ) -> V? {
        if time > 1.0 { return nil }   // 1 秒后结束
        let progress = 1 - cos(time * frequency * .pi * 2) * (1 - time)
        return value.scaled(by: progress)
    }

    // 可选：是否与前一个动画合并
    func shouldMerge<V: VectorArithmetic>(
        previous: Animation, value: V, time: TimeInterval,
        context: inout AnimationContext<V>
    ) -> Bool { false }
}

// 使用
withAnimation(Animation(WiggleAnimation(frequency: 5))) {
    offset = 20
}
```

---

## 常见陷阱

1. **withAnimation 包裹范围**：只有闭包内变更的状态才会动画。在闭包外修改的状态不会参与动画。
2. **transition 不生效**：视图插入/移除必须由 `if/switch` 驱动且状态变更在 `withAnimation` 内；仅用 `.opacity(show ? 1 : 0)` 不是转场，不会触发 `.transition`。
3. **matchedGeometryEffect 闪烁**：确保同一时刻同一 id 只有一个视图存在（用 `if-else`，不要两个视图同时出现）。
4. **spring 动画"不停"**：dampingFraction 接近 0 时振荡极慢衰减。实际使用保持 >= 0.5。
5. **.animation(nil)** 已废弃（iOS 15+）。用 `.transaction { $0.animation = nil }` 或 `.animation(.default, value:)` 替代。
6. **PhaseAnimator 性能**：phases 数量过多会导致大量重绘；保持 3-5 个阶段为宜。
7. **KeyframeAnimator 中的 duration**：各关键帧的 duration 是相对于上一个关键帧的持续时间，不是从动画起点的绝对时间。
