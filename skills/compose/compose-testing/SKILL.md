---
name: compose-testing
description: "Compose 测试：ComposeTestRule、semantics 查询、断言、Espresso 共存、截图测试。"
tech_stack: [compose, android, mobile-native]
language: [kotlin]
capability: [unit-testing, integration-testing]
---

# Jetpack Compose 测试

> 来源：https://developer.android.com/develop/ui/compose/testing
> 版本基准：Compose BOM 2025.01+

## 用途

为 Compose UI 编写可靠的自动化测试，通过 Semantics 树查找节点、执行操作、验证状态，覆盖单元/集成/截图三层。

## 何时使用

- 验证 Composable 在不同状态下的渲染是否正确
- 模拟用户交互（点击、滑动、输入）并断言结果
- 回归截图比对，防止 UI 意外变更
- 在混合项目中同时测试 Compose 与 View 组件
- 测试 ViewModel 驱动的屏幕级集成逻辑

## 依赖配置

```kotlin
// build.gradle.kts (module)
androidTestImplementation("androidx.compose.ui:ui-test-junit4")
debugImplementation("androidx.compose.ui:ui-test-manifest")

// 截图测试 (Roborazzi) - 放在 test 而非 androidTest
testImplementation("io.github.takahirom.roborazzi:roborazzi:1.7+")
testImplementation("io.github.takahirom.roborazzi:roborazzi-compose:1.7+")
testImplementation("org.robolectric:robolectric:4.11+")

// 截图测试 (Paparazzi) - 需在 library module 中使用
// plugins { id("app.cash.paparazzi") }
```

## ComposeTestRule

```kotlin
// 独立测试 Composable（最常用）
@get:Rule val rule = createComposeRule()

// 需要 Activity 上下文时
@get:Rule val rule = createAndroidComposeRule<MainActivity>()

@Test fun greeting_shows_name() {
    rule.setContent { Greeting(name = "World") }   // setContent 只能调用一次
    rule.onNodeWithText("Hello, World").assertIsDisplayed()
}
```

`createComposeRule()` 内部启动空白 `ComponentActivity`，无需自定义 Activity。
`createAndroidComposeRule<T>()` 启动指定 Activity，可通过 `rule.activity` 访问。

## Semantics 树与节点查询

Compose 测试基于 Semantics 树（与无障碍服务共用），不依赖视图层级。

### 查询速查表

| Finder | 用途 |
|---|---|
| `onNodeWithText("Login")` | 按显示文本 |
| `onNodeWithTag("btn_submit")` | 按 testTag |
| `onNodeWithContentDescription("Close")` | 按无障碍描述 |
| `onNode(hasText("A") and hasClickAction())` | 组合匹配器 |
| `onAllNodesWithTag("item")` | 返回多节点集合 |
| `onRoot()` | 根节点（调试用） |

**常用参数**：`substring = true`（模糊匹配）、`ignoreCase = true`、`useUnmergedTree = true`（查看未合并子节点）。

### 层级匹配器

```kotlin
onNode(hasParent(hasTestTag("list")))
onNode(hasAnyAncestor(hasText("Section")))
```

### 选择器链

```kotlin
rule.onNode(hasTestTag("list"))
    .onChildren()
    .filter(hasClickAction())
    .assertCountEquals(3)
    .onFirst()
    .assert(hasText("Item 1"))
```

### 调试

```kotlin
rule.onRoot().printToLog("TREE")                        // 合并树
rule.onRoot(useUnmergedTree = true).printToLog("TREE")  // 未合并树
```

## 操作（perform*）

| API | 说明 |
|---|---|
| `performClick()` | 点击 |
| `performScrollTo()` | 滚动到可见区域 |
| `performTextInput("hello")` | 输入文字 |
| `performTextClearance()` | 清空输入 |
| `performImeAction()` | 触发 IME action |
| `performTouchInput { swipeUp() }` | 手势：swipeLeft/Right/Up/Down |
| `performSemanticsAction(SemanticsActions.OnClick)` | 执行语义动作 |

操作可链式调用：`.performClick().performTextInput("text")`

## 断言（assert*）

| API | 说明 |
|---|---|
| `assertIsDisplayed()` | 可见 |
| `assertIsNotDisplayed()` | 不可见 |
| `assertExists()` / `assertDoesNotExist()` | 节点存在/不存在 |
| `assertIsEnabled()` / `assertIsNotEnabled()` | 启用/禁用 |
| `assertIsSelected()` | 已选中 |
| `assertIsOn()` / `assertIsOff()` | 开关状态 |
| `assertTextEquals("OK")` | 文本完全匹配 |
| `assertContentDescriptionEquals("Icon")` | 描述匹配 |
| `assertHasClickAction()` | 有点击行为 |
| `assertCountEquals(n)` | 集合节点数 |
| `assert(hasText("A") or hasText("B"))` | 自定义组合断言 |

## testTag 策略

```kotlin
// 生产代码 -- 给需要测试定位的节点加 tag
Box(modifier = Modifier.testTag("profile_avatar")) { ... }

// 测试代码
rule.onNodeWithTag("profile_avatar").assertIsDisplayed()
```

**命名规范建议**：`<screen>_<element>`，如 `login_email_field`、`home_fab`。
避免对所有节点加 tag -- 优先用 `onNodeWithText` / `onNodeWithContentDescription`，仅在文本不稳定或有多个同类元素时才用 testTag。

## 与 Espresso 共存

混合项目中 Compose 和 View 测试可在同一个 test 中共存，无需额外配置：

```kotlin
@Test fun hybrid_test() {
    // Espresso 操作 View 层级
    Espresso.onView(withText("Legacy Title")).check(matches(isDisplayed()))

    // Compose 操作 Semantics 树
    rule.onNodeWithText("Compose Button").performClick()

    // 再回到 Espresso 验证 View 变化
    Espresso.onView(withText("Updated")).check(matches(isDisplayed()))
}
```

**UiAutomator 互操作**：若需从 UiAutomator 访问 Compose 节点，在根 Composable 上设置 `Modifier.semantics { testTagsAsResourceId = true }`，之后用 `By.res("myTag")` 查找。

## 截图测试

### Roborazzi（推荐 -- 支持交互 + Robolectric）

```kotlin
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ScreenshotTest {
    @get:Rule val rule = createAndroidComposeRule<ComponentActivity>()

    @Test fun profile_default() {
        rule.setContent { ProfileScreen(state = ProfileState.Default) }
        rule.onRoot().captureRoboImage("snapshots/profile_default.png")
    }
}
```

```bash
./gradlew recordRoborazziDebug   # 首次录制基准图
./gradlew verifyRoborazziDebug   # CI 比对差异
```

### Paparazzi（纯 JVM，不支持交互）

```kotlin
class CardSnapshotTest {
    @get:Rule val paparazzi = Paparazzi(
        deviceConfig = DeviceConfig.PIXEL_5,
        theme = "android:Theme.Material3.DayNight"
    )
    @Test fun card_light() {
        paparazzi.snapshot { UserCard(name = "Alice") }
    }
}
```

```bash
./gradlew :ui:recordPaparazziDebug  # 录制
./gradlew :ui:verifyPaparazziDebug  # 验证
```

**选型**：需要交互截图或 Hilt 注入选 Roborazzi；只做静态组件快照且追求速度选 Paparazzi。Paparazzi 不兼容 Robolectric。

## 测试 ViewModel 集成

### 方式一：直接注入 Fake（推荐，不依赖 Hilt）

```kotlin
@Test fun counter_increments() {
    val vm = CounterViewModel(FakeCounterRepository())
    rule.setContent { CounterScreen(viewModel = vm) }

    rule.onNodeWithText("0").assertIsDisplayed()
    rule.onNodeWithText("+").performClick()
    rule.onNodeWithText("1").assertIsDisplayed()
}
```

关键：Composable 接受 `viewModel` 参数，默认值用 `hiltViewModel()` 生产注入，测试时传入手动构造的实例。

### 方式二：Hilt 替换 Module

```kotlin
@HiltAndroidTest
@UninstallModules(DataModule::class)
class LoginScreenTest {
    @get:Rule(order = 0) val hiltRule = HiltAndroidRule(this)
    @get:Rule(order = 1) val composeRule = createAndroidComposeRule<MainActivity>()

    @Module @InstallIn(SingletonComponent::class)
    object FakeDataModule {
        @Provides fun repo(): UserRepository = FakeUserRepository()
    }

    @Test fun login_success() {
        composeRule.onNodeWithTag("email").performTextInput("a@b.com")
        composeRule.onNodeWithTag("password").performTextInput("123456")
        composeRule.onNodeWithText("Login").performClick()
        composeRule.onNodeWithText("Welcome").assertIsDisplayed()
    }
}
```

注意：HiltAndroidRule 必须 `order = 0` 先于 ComposeTestRule 执行。

## 常见陷阱

| 问题 | 原因与解决 |
|---|---|
| 找不到节点 | 文本不匹配（注意空格/换行）；试用 `printToLog` 查看实际树；考虑 `useUnmergedTree = true` |
| `setContent` 调用两次崩溃 | 每个测试只能调用一次 `setContent` |
| 动画导致断言不稳定 | 测试中禁用动画：`rule.mainClock.autoAdvance = false` 然后手动 `advanceTimeBy()` |
| LazyColumn 项不可见 | 先 `performScrollTo()` 再断言 |
| Espresso IdlingResource 不同步 | Compose 有自己的同步机制，用 `rule.waitForIdle()` 或 `rule.waitUntil { ... }` |
| Paparazzi 在 app module 报错 | Paparazzi 只能用在 library module，不能用在 application module |
| Roborazzi 截图全黑 | 必须加 `@GraphicsMode(GraphicsMode.Mode.NATIVE)` |
