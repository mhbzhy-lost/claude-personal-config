---
name: android-navigation
description: Android Jetpack Navigation：Compose / Fragment 导航图、类型安全路由、深链
tech_stack: [android]
language: [kotlin, java]
capability: [native-navigation]
version: "Navigation 2.9.7; kotlinx-serialization-json 1.7.3"
collected_at: 2026-04-18
---

# Android 导航（Jetpack Navigation）

> 来源：https://developer.android.com/guide/navigation , https://developer.android.com/develop/ui/compose/navigation

## 用途
Jetpack Navigation 统一管理 Compose 与 Fragment 的导航图、回退栈、动画、深链、ViewModel 作用域。2.8+ 通过 `kotlinx.serialization` 提供类型安全路由。

## 何时使用
- Compose 多屏应用用 `NavHost` + 可序列化 route 对象
- Fragment 传统应用用 `NavHostFragment` + XML 导航图或 Kotlin DSL
- 混合 View / Compose：先用 Fragment Navigation，各 Fragment 内部再用 Compose
- 需要处理通知 / Widget 深链，用 `NavDeepLinkBuilder` 或 `navDeepLink`

## 基础用法

**Gradle**
```kotlin
plugins { kotlin("plugin.serialization") version "2.0.21" }

dependencies {
  val nav = "2.9.7"
  implementation("androidx.navigation:navigation-compose:$nav")
  implementation("androidx.navigation:navigation-fragment:$nav")
  implementation("androidx.navigation:navigation-ui:$nav")
  implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
}
```

**Compose 最小示例**
```kotlin
@Serializable data class Profile(val name: String)
@Serializable object FriendsList

@Composable
fun MyApp() {
  val navController = rememberNavController()
  NavHost(navController, startDestination = Profile(name = "John")) {
    composable<Profile> { entry ->
      val p: Profile = entry.toRoute()
      ProfileScreen(p, onNavigateToFriends = { navController.navigate(FriendsList) })
    }
    composable<FriendsList> {
      FriendsListScreen(onNavigateToProfile = {
        navController.navigate(Profile(name = "Aisha"))
      })
    }
  }
}
```

**Fragment Kotlin DSL**
```kotlin
navController.graph = navController.createGraph(startDestination = Profile(name = "John")) {
    fragment<ProfileFragment, Profile> { label = "Profile" }
    fragment<FriendsListFragment, FriendsList> { label = "Friends" }
}
```

## 关键 API

**核心类型**
- `NavHost`（Compose）/ `NavHostFragment`（Fragment）：导航宿主
- `NavController`：协调导航；`rememberNavController()` / `findNavController()`
- Route：任意 `@Serializable` object / data class

**Compose 专用**
- `composable<T> { backStackEntry -> ... }`：注册 destination
- `backStackEntry.toRoute<T>()`：取出类型安全的 route 参数
- `dialog<T> { ... }`：对话框型 destination
- `navController.navigate(Profile(id))` / `popBackStack()`
- `navDeepLink<T>(basePath = "$uri/profile")`：声明深链

**ViewModel 取参**
```kotlin
class VM(state: SavedStateHandle) : ViewModel() {
    private val profile = state.toRoute<Profile>()
}
```

**深链（显式）**
```kotlin
val pi = NavDeepLinkBuilder(context)
    .setGraph(R.navigation.nav_graph)
    .setDestination(R.id.android)
    .setArguments(args)
    .createPendingIntent()
```

**深链（隐式）**：在 manifest 注册 `<nav-graph android:value="@navigation/nav_graph" />`，Navigation 自动生成 intent-filter；URI 无 scheme 默认匹配 http/https，路径占位用 `{name}`。

**Adaptive**
- `NavigationSuiteScaffold` 按 `WindowSizeClass` 自动切换 bottom bar / navigation rail

## 注意事项
- 路由**只传最小标识**（如 userId），不要传复杂对象
- `singleTop` 等非 standard launch mode 需手动 `navController.handleDeepLink(intent)` in `onNewIntent`
- 显式深链打开 app 会**清空回退栈**并替换为深链目标
- 隐式深链未设 `FLAG_ACTIVITY_NEW_TASK` 时，Back 按键回到来源 app（仍在其 task 栈）
- 可组合项测试友好写法：把导航回调作为参数传入，而不是传 `navController`
- `ActivityResultRegistry` 推荐使用带 `LifecycleOwner` 的重载，生命周期销毁时自动注销 launcher

## 组合提示
- 与 `kotlinx.serialization` 搭配实现类型安全 route
- 与 Hilt：`hiltViewModel()` 自动拿到 destination 作用域的 ViewModel
- 与 Compose `SharedTransitionLayout`：跨 destination 共享元素
- 测试：`TestNavHostController` + `ComposeNavigator`
