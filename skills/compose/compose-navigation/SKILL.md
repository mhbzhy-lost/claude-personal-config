---
name: compose-navigation
description: "Compose Navigation：NavHost/NavController、type-safe routes、嵌套图、deep link、返回结果。"
tech_stack: [compose]
---

# Jetpack Compose Navigation

> 来源：https://developer.android.com/develop/ui/compose/navigation
> https://developer.android.com/guide/navigation/design/type-safety
> 版本基准：Navigation Compose 2.8+ / Kotlin Serialization routes

## 用途

单 Activity 架构下管理 Composable 画面间的跳转、参数传递、返回栈与 deep link。

## 何时使用

- 多画面 App 的画面切换与参数传递
- BottomNavigation / NavigationRail 多 Tab 切换
- 外部链接 / 通知跳转到指定画面（deep link）
- 模块化拆分独立导航子图

## 依赖配置

```kotlin
// build.gradle.kts
plugins {
    id("org.jetbrains.kotlin.plugin.serialization") version "2.0.0"
}

dependencies {
    implementation("androidx.navigation:navigation-compose:2.8.0") // 或更高
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")
}
```

## NavHost / NavController 基础

```kotlin
val navController = rememberNavController()

NavHost(navController = navController, startDestination = Home) {
    composable<Home> {
        HomeScreen(onGoProfile = { id ->
            navController.navigate(Profile(id = id))
        })
    }
    composable<Profile> { backStackEntry ->
        val profile: Profile = backStackEntry.toRoute()
        ProfileScreen(userId = profile.id)
    }
}
```

- `rememberNavController()` 创建并记住 NavHostController
- `NavHost` 是容器，声明导航图，`startDestination` 指定起始路由
- 将 `navController` 只暴露给顶层，画面本身通过 lambda 回调解耦

## Type-Safe Routes（Kotlin Serialization 方式）

Navigation 2.8.0 引入，用 `@Serializable` 类型替代字符串路由，获得编译期类型安全。

### 定义路由

```kotlin
import kotlinx.serialization.Serializable

@Serializable data object Home                        // 无参数 -> object
@Serializable data class Profile(val id: String)      // 有参数 -> data class
@Serializable data class Settings(val theme: String = "dark") // 有默认值
```

### 在 NavHost 中声明

```kotlin
NavHost(navController, startDestination = Home) {
    composable<Home> { /* ... */ }
    composable<Profile> { entry ->
        val profile: Profile = entry.toRoute()
        ProfileScreen(profile.id)
    }
}
```

### 导航

```kotlin
navController.navigate(Profile(id = "user123"))
```

### 在 ViewModel 中取参

```kotlin
class ProfileViewModel(savedStateHandle: SavedStateHandle) : ViewModel() {
    private val profile = savedStateHandle.toRoute<Profile>()
    val userId = profile.id
}
```

## 参数传递

| 类型 | 方式 |
|------|------|
| 基本类型 | 直接作为 data class 属性 |
| 可选参数 | 属性设默认值或声明为 `String?` |
| 复杂对象 | 自定义 `NavType<T>` + `typeMap` |

自定义 NavType 示例：

```kotlin
val SearchFilterType = object : NavType<SearchFilter>(isNullableAllowed = false) {
    override fun get(bundle: Bundle, key: String) =
        Json.decodeFromString<SearchFilter>(bundle.getString(key)!!)
    override fun parseValue(value: String) =
        Json.decodeFromString<SearchFilter>(Uri.decode(value))
    override fun put(bundle: Bundle, key: String, value: SearchFilter) =
        bundle.putString(key, Json.encodeToString(value))
    override fun serializeAsValue(value: SearchFilter) =
        Uri.encode(Json.encodeToString(value))
}

// 注册
composable<Search>(
    typeMap = mapOf(typeOf<SearchFilter>() to SearchFilterType)
) { /* ... */ }
```

**最佳实践**：只传 ID，在目标画面/ViewModel 里从 Repository 加载完整数据。

## 嵌套导航图

用 `navigation<Route>()` 将相关画面分组，可用于模块化或 Tab 内独立栈：

```kotlin
NavHost(navController, startDestination = HomeGraph) {
    navigation<HomeGraph>(startDestination = Feed) {
        composable<Feed> { /* ... */ }
        composable<FeedDetail> { /* ... */ }
    }
    navigation<SettingsGraph>(startDestination = SettingsList) {
        composable<SettingsList> { /* ... */ }
        composable<SettingsDetail> { /* ... */ }
    }
}

// 路由类型同样需要 @Serializable
@Serializable data object HomeGraph
@Serializable data object SettingsGraph
```

## Deep Link

```kotlin
val baseUri = "https://example.com"

composable<Profile>(
    deepLinks = listOf(
        navDeepLink<Profile>(basePath = "$baseUri/profile")
        // URL: https://example.com/profile/{id} 自动映射到 Profile.id
    )
) { entry ->
    val profile: Profile = entry.toRoute()
    ProfileScreen(profile.id)
}
```

AndroidManifest 中声明 intent-filter：

```xml
<activity android:name=".MainActivity">
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="https" android:host="example.com" />
    </intent-filter>
</activity>
```

## BottomNavigation 集成

```kotlin
// 定义 Tab 路由
@Serializable data object HomeGraph
@Serializable data object SearchGraph
@Serializable data object ProfileGraph

data class TopLevelRoute(val label: String, val icon: ImageVector, val route: Any)

val topRoutes = listOf(
    TopLevelRoute("Home", Icons.Default.Home, HomeGraph),
    TopLevelRoute("Search", Icons.Default.Search, SearchGraph),
    TopLevelRoute("Profile", Icons.Default.Person, ProfileGraph),
)

@Composable
fun MainScreen() {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination

    Scaffold(
        bottomBar = {
            NavigationBar {
                topRoutes.forEach { item ->
                    NavigationBarItem(
                        selected = currentDestination
                            ?.hierarchy
                            ?.any { it.hasRoute(item.route::class) } == true,
                        onClick = {
                            navController.navigate(item.route) {
                                popUpTo(navController.graph.findStartDestination().id) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(item.icon, contentDescription = item.label) },
                        label = { Text(item.label) }
                    )
                }
            }
        }
    ) { padding ->
        NavHost(
            navController,
            startDestination = HomeGraph,
            modifier = Modifier.padding(padding)
        ) {
            navigation<HomeGraph>(startDestination = Feed) { /* ... */ }
            navigation<SearchGraph>(startDestination = SearchHome) { /* ... */ }
            navigation<ProfileGraph>(startDestination = ProfileHome) { /* ... */ }
        }
    }
}
```

关键三参数：`saveState = true` + `restoreState = true` + `launchSingleTop = true`，实现 Tab 切换时保持各栈状态。

**注意**：`hasRoute` 需要导入 `import androidx.navigation.NavDestination.Companion.hasRoute`。

## 返回结果传递（SavedStateHandle）

画面 B 返回数据给画面 A：

```kotlin
// 画面 B：写入结果后 pop
navController.previousBackStackEntry
    ?.savedStateHandle
    ?.set("selected_item", selectedId)
navController.popBackStack()

// 画面 A：读取结果（响应式）
val result = navController.currentBackStackEntry
    ?.savedStateHandle
    ?.getStateFlow("selected_item", "")
    ?.collectAsStateWithLifecycle()
```

- 用 `getStateFlow()` 获取 Flow，配合 `collectAsStateWithLifecycle()` 自动响应
- 只能传 Bundle 支持的类型（基本类型、Parcelable、Serializable）

## 字符串路由 vs Type-Safe 路由迁移

| 旧写法 | 新写法 |
|--------|--------|
| `composable("profile/{id}")` | `composable<Profile>` |
| `backStackEntry.arguments?.getString("id")` | `backStackEntry.toRoute<Profile>().id` |
| `navController.navigate("profile/$id")` | `navController.navigate(Profile(id = id))` |
| `NavHost(startDestination = "home")` | `NavHost(startDestination = Home)` |

迁移步骤：1) 添加 Serialization 插件 -> 2) 定义 `@Serializable` 路由类 -> 3) 逐个替换 composable/navigate 调用。可渐进式迁移，两种写法可共存。

## 常见陷阱

- **忘记 Serialization 插件**：只加 `kotlinx-serialization-json` 依赖但没配 Gradle 插件 -> 编译报错
- **`hasRoute` 导入错误**：必须导入 `NavDestination.Companion.hasRoute`，否则匹配失败
- **大对象塞导航参数**：超过 Bundle 限制会崩溃；只传 ID，在目标画面加载数据
- **Tab 切换丢状态**：忘记 `saveState`/`restoreState` 导致每次切 Tab 重建画面
- **deep link 不触发**：AndroidManifest 缺少 intent-filter 或 scheme/host 不匹配
- **Compose Preview 里用 navController**：Preview 无法创建真实 NavController，画面组件应通过 lambda 回调解耦
- **popBackStack 后读 savedStateHandle**：必须在 pop 之前写入 previousBackStackEntry，pop 之后该 entry 已销毁
