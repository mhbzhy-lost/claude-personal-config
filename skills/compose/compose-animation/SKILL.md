---
name: compose-animation
description: "Compose 动画：animateAsState/AnimatedVisibility/AnimatedContent/SharedTransition/updateTransition/Animatable。"
tech_stack: [compose, android, mobile-native]
language: [kotlin]
capability: [ui-display]
---

# Jetpack Compose 动画

> 来源：https://developer.android.com/develop/ui/compose/animation
> 版本基准：Compose BOM 2025 / Animation 1.7+

## 用途

提供声明式动画 API，覆盖从简单状态过渡到手势驱动动画的全场景。核心理念：**状态变化即动画触发**。

## 何时使用

- 属性随状态变化平滑过渡（颜色、大小、位置、透明度）
- 组件出现/消失需要进场退场效果
- 页面间共享元素的连续转场
- 内容切换时需要过渡动画（计数器、页面切换）
- 拖拽/滑动等手势需要物理动画（惯性、回弹）

## 动画 API 选型速查

| 场景 | 推荐 API | 特点 |
|------|----------|------|
| 单属性随状态变化 | `animateXxxAsState` | 最简单，fire-and-forget |
| 组件显示/隐藏 | `AnimatedVisibility` | 支持 EnterTransition + ExitTransition 组合 |
| 内容切换（不同布局） | `AnimatedContent` | 支持 transitionSpec 自定义进出 |
| 简单交叉淡入淡出 | `Crossfade` | AnimatedContent 的轻量替代 |
| 多属性联动同一状态 | `updateTransition` | 多个 animate* 子动画同步 |
| 共享元素转场 | `SharedTransitionLayout` | 列表→详情的 hero 动画 |
| 精细控制/手势 | `Animatable` | 协程驱动，支持 snapTo/stop/decay |
| 无限循环 | `rememberInfiniteTransition` | 呼吸灯、旋转等持续动画 |
| 尺寸变化自动动画 | `Modifier.animateContentSize()` | 一行代码搞定 |

## animateXxxAsState（状态驱动）

最常用的一组 API，状态变化时自动启动动画，自动处理中断和速度传递。

**可用类型**：`Float`、`Dp`、`Color`、`Offset`、`Size`、`Rect`、`Int`、`IntOffset`、`IntSize`，其他类型用 `animateValueAsState` + `TwoWayConverter`。

```kotlin
var enabled by remember { mutableStateOf(true) }
// 透明度动画
val alpha by animateFloatAsState(
    targetValue = if (enabled) 1f else 0.5f,
    animationSpec = tween(300),  // 可选，默认 spring
    label = "alpha"
)
Box(Modifier.graphicsLayer { this.alpha = alpha })

// 颜色动画
val bgColor by animateColorAsState(
    targetValue = if (enabled) Color.Green else Color.Gray,
    label = "bg"
)
```

**AnimationSpec 选项**：`spring`（默认，物理弹簧）、`tween`（时长+缓动）、`keyframes`（关键帧）、`snap`（立即跳变）。

## AnimatedVisibility

控制组件的进场/退场动画。动画结束后组件从 Composition 移除。

```kotlin
AnimatedVisibility(
    visible = showPanel,
    enter = slideInVertically { -it } + fadeIn(),
    exit  = slideOutVertically { it } + fadeOut()
) {
    PanelContent()
}
```

**进场**：`fadeIn`、`slideIn`、`slideInHorizontally`、`slideInVertically`、`expandIn`、`expandHorizontally`、`expandVertically`、`scaleIn`。
**退场**：对应 `xxxOut` / `shrinkXxx`。用 `+` 组合多个。

子元素可用 `Modifier.animateEnterExit()` 独立设置动画；内部通过 `transition` 属性接入自定义动画。

## AnimatedContent

根据 targetState 变化在不同内容间做动画切换。

```kotlin
AnimatedContent(
    targetState = count,
    transitionSpec = {
        // 新值从底部滑入，旧值向上滑出
        (slideInVertically { it } + fadeIn()) togetherWith
        (slideOutVertically { -it } + fadeOut()) using
        SizeTransform(clip = false)
    },
    label = "counter"
) { target ->
    Text("$target", fontSize = 24.sp)
}
```

专属过渡：`slideIntoContainer` / `slideOutOfContainer`（根据容器尺寸自动计算距离）。`SizeTransform` 控制新旧内容尺寸不同时的过渡。

## Crossfade

AnimatedContent 的简化版，仅做交叉淡入淡出：

```kotlin
Crossfade(targetState = currentPage, label = "page") { page ->
    when (page) { "A" -> PageA(); "B" -> PageB() }
}
```

## updateTransition（多属性联动）

多个属性绑定到同一状态枚举，状态切换时所有动画同步执行。

```kotlin
enum class CardState { Collapsed, Expanded }

val transition = updateTransition(cardState, label = "card")
val height by transition.animateDp(label = "h") { state ->
    if (state == CardState.Expanded) 300.dp else 80.dp
}
val color by transition.animateColor(
    transitionSpec = { tween(500) }, label = "color"
) { state ->
    if (state == CardState.Expanded) Color.White else Color.LightGray
}
val cornerRadius by transition.animateDp(label = "corner") { state ->
    if (state == CardState.Expanded) 0.dp else 16.dp
}

// transition 还支持 .AnimatedVisibility { } 和 .AnimatedContent { }
```

**封装模式**：创建 `TransitionData` 类持有所有动画 State，通过 `@Composable` 函数返回，保持调用侧简洁。

## 共享元素转场（SharedTransitionLayout）

> Compose 1.7+ 新增，实验性 API。

实现列表→详情的 hero 动画，两个 modifier 满足不同场景：

| | `sharedElement` | `sharedBounds` |
|---|---|---|
| 适用 | 完全相同的内容（图片、图标） | 容器变换（内容不同） |
| 过渡时 | 仅渲染目标内容 | 新旧内容同时可见（fade） |
| 参数 | 无 enter/exit | 有 enter/exit 参数 |

**基本结构**：

```kotlin
SharedTransitionLayout {                        // 提供 SharedTransitionScope
    AnimatedContent(showDetail, label = "nav") { isDetail ->
        if (!isDetail) {
            // --- 列表项 ---
            Image(
                painter = painterResource(R.drawable.hero),
                modifier = Modifier
                    .sharedElement(                // 相同 key 自动匹配
                        rememberSharedContentState(key = "hero-img"),
                        animatedVisibilityScope = this@AnimatedContent
                    )
                    .size(80.dp)
                    .clip(CircleShape)
            )
        } else {
            // --- 详情页 ---
            Image(
                painter = painterResource(R.drawable.hero),
                modifier = Modifier
                    .sharedElement(
                        rememberSharedContentState(key = "hero-img"),
                        animatedVisibilityScope = this@AnimatedContent
                    )
                    .size(240.dp)
                    .clip(RoundedCornerShape(16.dp))
            )
        }
    }
}
```

**与 Navigation 集成**：`NavHost` 自带 `AnimatedVisibilityScope`，将 `SharedTransitionLayout` 包在 `NavHost` 外层，通过参数或 `CompositionLocal` 传递 scope。

**深层嵌套传递 scope**：
```kotlin
val LocalSharedTransition = compositionLocalOf<SharedTransitionScope> { error("No scope") }
val LocalAnimatedVisibility = compositionLocalOf<AnimatedVisibilityScope> { error("No scope") }
```

**要点**：key 用 data class（自带 equals/hashCode）；尺寸修饰符放在 sharedElement **之前**；必须有 `AnimatedVisibilityScope`（来自 AnimatedContent / AnimatedVisibility / NavHost）。

## Animatable（自定义动画值）

协程驱动的底层 API，适合手势联动和精细控制。

**核心方法**：

| 方法 | 用途 |
|------|------|
| `animateTo(target)` | 动画到目标值，可传 animationSpec 和 initialVelocity |
| `snapTo(value)` | 立即跳到值（拖拽同步用） |
| `animateDecay(velocity, spec)` | 惯性衰减（fling） |
| `stop()` | 停止当前动画 |
| `updateBounds(lower, upper)` | 设置值域边界 |

**手势动画模式**（拖拽 + fling）：

```kotlin
val offsetX = remember { Animatable(0f) }
Modifier.pointerInput(Unit) {
    val decay = splineBasedDecay<Float>(this)
    coroutineScope {
        while (true) {
            val tracker = VelocityTracker()
            offsetX.stop()                              // 1. 触摸时停止动画
            awaitPointerEventScope {
                val id = awaitFirstDown().id
                horizontalDrag(id) { change ->
                    launch { offsetX.snapTo(offsetX.value + change.positionChange().x) }  // 2. 拖拽时 snapTo
                    tracker.addPosition(change.uptimeMillis, change.position)
                }
            }
            val velocity = tracker.calculateVelocity().x
            launch {
                offsetX.animateDecay(velocity, decay)   // 3. 松手后惯性滑动
            }
        }
    }
}
```

## 常见陷阱

1. **animateContentSize 修饰符顺序**：必须放在 `size()` / `height()` 等尺寸修饰符**之前**，否则无效。
2. **AnimatedVisibility vs alpha 动画**：AnimatedVisibility 结束后移除 Composition；若只需淡入淡出但保留布局占位，用 `animateFloatAsState` + `graphicsLayer { alpha = ... }`。
3. **性能**：优先用 `Modifier.graphicsLayer { }` 的 lambda 版本（仅触发 draw 阶段），避免 `Modifier.offset(x, y)` 等触发 recomposition 的写法。
4. **label 参数**：所有动画 API 都有 `label` 参数，用于 Animation Preview / Inspector 调试，生产代码也建议填写。
5. **SharedTransitionLayout 的 AnimatedVisibilityScope**：`sharedElement` / `sharedBounds` 必须在 AnimatedVisibilityScope 内调用，否则编译通过但运行无效果。
6. **LazyColumn 中的动画**：不要在 item lambda 内直接用 `LaunchedEffect + Animatable`，滚出屏幕再滚回会重新触发；需要将动画状态提升到 item 外部。
7. **spring 是默认 spec**：所有 animate*AsState 默认用 spring，不指定 duration；如需精确时长用 `tween`。
