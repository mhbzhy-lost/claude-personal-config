---
name: compose-material3
description: "Compose Material 3：TopAppBar/BottomSheet/NavigationBar/Scaffold/SearchBar/DatePicker/TimePicker/动态取色/主题定制。"
tech_stack: [compose, android, mobile-native]
language: [kotlin]
---

# Jetpack Compose Material Design 3

> 来源：https://developer.android.com/develop/ui/compose/designsystems/material3
> 版本基准：Material 3 Compose 1.3+ / Compose BOM 2025

## 用途

Material 3 (M3) 是 Android 官方设计系统的最新版本，提供动态取色、自适应布局与完整的 UI 组件集，覆盖导航、输入、选择等核心场景。

## 何时使用

- 新 Android 应用默认选择 M3（取代 Material 2）
- 需要 Android 12+ 壁纸动态取色能力
- 构建手机/平板/折叠屏自适应导航
- 需要 DatePicker / TimePicker / SearchBar / BottomSheet 等开箱即用组件

## Scaffold 骨架

Scaffold 是 M3 应用的页面骨架，协调 topBar / bottomBar / FAB / snackbar 的布局。

```kotlin
val snackbarHostState = remember { SnackbarHostState() }

Scaffold(
    topBar = { /* TopAppBar */ },
    bottomBar = { /* NavigationBar */ },
    floatingActionButton = {
        FloatingActionButton(onClick = { /* ... */ }) {
            Icon(Icons.Default.Add, contentDescription = "Add")
        }
    },
    snackbarHost = { SnackbarHost(snackbarHostState) }
) { innerPadding ->
    // 主体内容 -- 必须消费 innerPadding
    Content(modifier = Modifier.padding(innerPadding))
}
```

**关键点**：`content` lambda 的 `PaddingValues` 参数必须应用到子布局，否则内容会被 topBar/bottomBar 遮挡。

## TopAppBar（small / medium / large）

四种变体：`TopAppBar`(small)、`CenterAlignedTopAppBar`、`MediumTopAppBar`、`LargeTopAppBar`。

三种滚动行为（`TopAppBarDefaults`）：
| 行为 | 说明 | 适用 |
|---|---|---|
| `pinnedScrollBehavior()` | 固定不动 | Small |
| `enterAlwaysScrollBehavior()` | 上滑隐藏 / 下滑立即出现 | Medium |
| `exitUntilCollapsedScrollBehavior()` | 上滑折叠 / 滚到顶才展开 | Large |

```kotlin
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppScreen() {
    val scrollBehavior = TopAppBarDefaults.exitUntilCollapsedScrollBehavior(
        rememberTopAppBarState()
    )
    Scaffold(
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        topBar = {
            LargeTopAppBar(
                title = { Text("Page Title") },
                navigationIcon = {
                    IconButton(onClick = { /* back */ }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                },
                actions = {
                    IconButton(onClick = {}) { Icon(Icons.Default.Search, "Search") }
                },
                scrollBehavior = scrollBehavior
            )
        }
    ) { innerPadding ->
        LazyColumn(contentPadding = innerPadding) { /* items */ }
    }
}
```

**注意**：使用滚动行为时，`Modifier.nestedScroll(scrollBehavior.nestedScrollConnection)` 必须加到 Scaffold 上。

## NavigationBar / NavigationRail / NavigationDrawer

按屏幕宽度选择导航组件：手机用 NavigationBar，平板用 NavigationRail，大屏用 NavigationDrawer。

```kotlin
// 底部导航（手机）
NavigationBar {
    items.forEachIndexed { index, item ->
        NavigationBarItem(
            icon = { Icon(item.icon, contentDescription = item.label) },
            label = { Text(item.label) },
            selected = selectedIndex == index,
            onClick = { selectedIndex = index }
        )
    }
}

// 侧边导航轨（平板）
NavigationRail(
    header = {
        FloatingActionButton(onClick = {}) { Icon(Icons.Default.Edit, "Compose") }
    }
) {
    items.forEachIndexed { index, item ->
        NavigationRailItem(
            icon = { Icon(item.icon, item.label) },
            label = { Text(item.label) },
            selected = selectedIndex == index,
            onClick = { selectedIndex = index }
        )
    }
}

// 抽屉导航（大屏 / 汉堡菜单）
val drawerState = rememberDrawerState(DrawerValue.Closed)
ModalNavigationDrawer(
    drawerState = drawerState,
    drawerContent = {
        ModalDrawerSheet {
            items.forEach { item ->
                NavigationDrawerItem(
                    label = { Text(item.label) },
                    icon = { Icon(item.icon, item.label) },
                    selected = item == currentItem,
                    onClick = { /* navigate */ }
                )
            }
        }
    }
) {
    Scaffold { /* page content */ }
}
```

**自适应提示**：`NavigationSuiteScaffold`（material3-adaptive-navigation-suite 库）可根据 WindowSizeClass 自动切换三种导航形态。

## BottomSheet（Modal / Standard）

M3 Compose 仅提供 `ModalBottomSheet`；Standard BottomSheet 需用 Material 2 或自行实现。

```kotlin
val sheetState = rememberModalBottomSheetState(
    skipPartiallyExpanded = false   // true 则跳过半展开态
)
var showSheet by remember { mutableStateOf(false) }

if (showSheet) {
    ModalBottomSheet(
        onDismissRequest = { showSheet = false },
        sheetState = sheetState
    ) {
        // Sheet 内容
        Button(onClick = {
            scope.launch { sheetState.hide() }.invokeOnCompletion {
                if (!sheetState.isVisible) showSheet = false
            }
        }) { Text("Close") }
    }
}
```

**关键点**：用 `showSheet` 布尔值控制 Sheet 的组合/移除；用 `sheetState.hide()` 做动画隐藏后再置 false。

## SearchBar

`SearchBar` 展开为全屏搜索，`DockedSearchBar` 展开为锚定面板（适合平板）。

```kotlin
var query by rememberSaveable { mutableStateOf("") }
var expanded by rememberSaveable { mutableStateOf(false) }

SearchBar(
    inputField = {
        SearchBarDefaults.InputField(
            query = query,
            onQueryChange = { query = it },
            onSearch = { expanded = false },
            expanded = expanded,
            onExpandedChange = { expanded = it },
            placeholder = { Text("Search") },
            leadingIcon = { Icon(Icons.Default.Search, "Search") }
        )
    },
    expanded = expanded,
    onExpandedChange = { expanded = it }
) {
    // 搜索建议 / 结果列表
    LazyColumn {
        items(results) { item ->
            ListItem(
                headlineContent = { Text(item) },
                modifier = Modifier.clickable {
                    query = item; expanded = false
                }
            )
        }
    }
}
```

## DatePicker / TimePicker

均为实验性 API，需 `@OptIn(ExperimentalMaterial3Api::class)`。

```kotlin
// --- DatePicker（Modal Dialog）---
val dateState = rememberDatePickerState()

DatePickerDialog(
    onDismissRequest = onDismiss,
    confirmButton = {
        TextButton(onClick = {
            onDateSelected(dateState.selectedDateMillis)  // Long? 毫秒时间戳
            onDismiss()
        }) { Text("OK") }
    },
    dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
) {
    DatePicker(state = dateState)
}

// --- TimePicker ---
val timeState = rememberTimePickerState(
    initialHour = 14, initialMinute = 30, is24Hour = true
)

TimePickerDialog(             // 1.3+ 新增 TimePickerDialog
    onDismissRequest = onDismiss,
    confirmButton = {
        TextButton(onClick = {
            val h = timeState.hour; val m = timeState.minute
            onDismiss()
        }) { Text("OK") }
    }
) {
    TimePicker(state = timeState)   // 表盘式；TimeInput 为键盘输入式
}
```

**提示**：`selectedDateMillis` 基于 UTC，转本地日期需注意时区处理。

## 动态取色（Dynamic Colors）

Android 12+ 独有，从壁纸提取主色生成 ColorScheme。

```kotlin
@Composable
fun AppTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context)
            else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }
    MaterialTheme(
        colorScheme = colorScheme,
        typography = AppTypography,
        shapes = AppShapes,
        content = content
    )
}
```

**回退策略**：Android 11 及以下不支持动态取色，必须提供 `lightColorScheme()` / `darkColorScheme()` 静态配色作为 fallback。可用 [Material Theme Builder](https://m3.material.io/theme-builder) 导出配色代码。

## 主题定制（MaterialTheme）

MaterialTheme 由三大子系统组成：ColorScheme、Typography、Shapes。

```kotlin
// 配色
private val LightColorScheme = lightColorScheme(
    primary = Color(0xFF6750A4),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFEADDFF),
    // ... secondary, tertiary, surface, error 等角色
)

// 字体
val AppTypography = Typography(
    displayLarge  = TextStyle(fontSize = 57.sp, fontWeight = FontWeight.Normal),
    headlineMedium = TextStyle(fontSize = 28.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge      = TextStyle(fontSize = 16.sp, lineHeight = 24.sp),
    labelSmall     = TextStyle(fontSize = 11.sp, letterSpacing = 0.5.sp)
)

// 形状
val AppShapes = Shapes(
    small      = RoundedCornerShape(8.dp),
    medium     = RoundedCornerShape(12.dp),
    large      = RoundedCornerShape(16.dp),
    extraLarge = RoundedCornerShape(28.dp)
)
```

组件中通过 `MaterialTheme.colorScheme.primary`、`MaterialTheme.typography.bodyLarge`、`MaterialTheme.shapes.medium` 访问主题值。

## 常见陷阱

1. **Scaffold innerPadding 未消费**：不把 `innerPadding` 传给子布局是最常见的布局 bug，内容会被 AppBar 或 NavigationBar 遮挡。
2. **nestedScroll 遗漏**：TopAppBar 设了 scrollBehavior 但忘记在 Scaffold 上加 `Modifier.nestedScroll()`，导致滚动折叠不生效。
3. **动态取色版本守卫缺失**：在 Android 11 调用 `dynamicLightColorScheme()` 会崩溃，必须检查 `Build.VERSION.SDK_INT >= S`。
4. **ModalBottomSheet 状态管理**：不能只靠 `sheetState.hide()` 移除 Sheet——需要在隐藏动画结束后将控制布尔置 false，否则重组时 Sheet 仍在组合树中。
5. **DatePicker 时区**：`selectedDateMillis` 是 UTC 毫秒，直接用 `SimpleDateFormat` 转换可能偏差一天，推荐用 `Instant.ofEpochMilli()` + `ZoneId`。
6. **实验性 API**：TopAppBar、SearchBar、DatePicker、TimePicker、ModalBottomSheet 均需要 `@OptIn(ExperimentalMaterial3Api::class)`，升级版本时注意签名变更。
7. **Standard BottomSheet**：M3 Compose 目前无原生 Standard BottomSheet 组件，需用 Material 2 的 `BottomSheetScaffold` 或第三方方案。
