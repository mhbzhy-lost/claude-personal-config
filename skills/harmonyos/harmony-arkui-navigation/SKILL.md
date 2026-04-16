---
name: harmony-arkui-navigation
description: "ArkUI 导航体系：Navigation/NavPathStack/NavDestination/Tabs/router 模块与页面转场。"
tech_stack: [harmonyos]
language: [arkts]
---

# ArkUI 页面路由与导航

> 来源：https://developer.huawei.com/consumer/en/doc/harmonyos-guides-V5/arkts-navigation-navigation-V5
> 版本基准：HarmonyOS 5 / API 12+

## 用途

在鸿蒙应用中实现页面间跳转、参数传递、返回控制和标签页切换。Navigation 是官方推荐的组件级路由方案，取代传统 router 模块。

## 何时使用

- 应用内多页面栈式导航（详情页、设置页等）
- 底部 / 顶部标签栏切换（首页多 Tab 场景）
- 跨模块（HAR/HSP）解耦路由
- 需要自定义转场动画或共享元素过渡
- 适配手机单栏 / 平板分栏 / 折叠屏自适应布局

## Navigation 组件（推荐方案）

Navigation 是根视图容器，管理页面栈、标题栏和工具栏，内部通过 NavPathStack 驱动子页面切换。

```typescript
@Entry
@Component
struct Index {
  @Provide('navStack') navStack: NavPathStack = new NavPathStack()

  // 方式一：@Builder pageMap 手动映射
  @Builder
  pageMap(name: string) {
    if (name === 'detail') {
      DetailPage()
    } else if (name === 'settings') {
      SettingsPage()
    }
  }

  build() {
    Navigation(this.navStack) {
      // 首页内容
      Button('去详情')
        .onClick(() => this.navStack.pushPath({ name: 'detail', param: { id: 1 } }))
    }
    .navDestination(this.pageMap)   // 绑定路由映射
    .title('首页')
    .mode(NavigationMode.Stack)     // Stack | Split | Auto
  }
}
```

**显示模式**：`Stack`（手机单栏）、`Split`（平板双栏）、`Auto`（根据屏幕宽度自适应）。

## NavPathStack 路由栈操作

NavPathStack 是编程式导航的核心，通过 `@Provide` / `@Consume` 在组件树中共享。

```typescript
const stack: NavPathStack = new NavPathStack()

// 入栈
stack.pushPath({ name: 'detail', param: { id: 42 } })
stack.pushPathByName('detail', { id: 42 })

// 带返回回调的入栈
stack.pushPathByName('edit', params, (popInfo) => {
  console.log('返回结果:', JSON.stringify(popInfo.result))
})

// 出栈
stack.pop()                      // 弹出栈顶
stack.pop(result)                // 弹出并携带返回数据
stack.popToName('home')          // 回退到指定页面
stack.popToIndex(0)              // 回退到指定索引

// 替换
stack.replacePath({ name: 'login' })
stack.replacePathByName('login', params)

// 清空
stack.clear()                    // 回到根页面

// 查询
stack.size()                     // 栈深度
stack.getAllPathName()            // 所有页面名称
```

## NavDestination 页面定义

NavDestination 是子页面的根容器，每个可导航页面都需要包裹在其中。

```typescript
@Component
struct DetailPage {
  @Consume('navStack') navStack: NavPathStack

  build() {
    NavDestination() {
      Column() {
        Text('详情页')
        Button('返回').onClick(() => this.navStack.pop())
      }
    }
    .title('详情')
    .hideTitleBar(false)
    .onReady((ctx: NavDestinationContext) => {
      // 获取路由参数
      const param = ctx.pathInfo.param as Record<string, Object>
    })
    .onAppear(() => { /* 页面显示 */ })
    .onDisAppear(() => { /* 页面隐藏 */ })
  }
}
```

**生命周期顺序**：`onReady` -> `onWillShow` -> `onAppear`（显示） / `onWillHide` -> `onDisAppear`（隐藏）。

### 系统路由表（API 12+ 推荐）

无需 `@Builder pageMap`，通过配置文件自动映射，实现模块解耦。

**1. module.json5 注册**：
```json
{ "module": { "routerMap": "$profile:route_map" } }
```

**2. resources/base/profile/route_map.json**：
```json
{
  "routerMap": [
    {
      "name": "detail",
      "pageSourceFile": "src/main/ets/pages/DetailPage.ets",
      "buildFunction": "DetailBuilder"
    }
  ]
}
```

**3. 页面文件导出 Builder**：
```typescript
@Builder
export function DetailBuilder() {
  DetailPage()
}
```

系统会根据 `name` 自动匹配，`pushPath({ name: 'detail' })` 即可跳转，无需手动维护 pageMap。

## Tabs 标签导航

用于底部导航栏、顶部标签页等场景。

```typescript
@Entry
@Component
struct MainPage {
  @State currentIndex: number = 0

  build() {
    Tabs({ barPosition: BarPosition.End }) {   // End=底部, Start=顶部
      TabContent() {
        HomePage()
      }.tabBar('首页')

      TabContent() {
        MinePage()
      }.tabBar('我的')
    }
    .onChange((index: number) => { this.currentIndex = index })
    .scrollable(false)           // 禁止滑动切换
    .barMode(BarMode.Fixed)      // Fixed=等宽 | Scrollable=可滚动
  }
}
```

**自定义 TabBar**：通过 `@Builder` 构建图标 + 文字 + 角标等复杂样式，传入 `.tabBar(this.customBuilder(index))`。

**侧边导航**：设置 `.vertical(true)` 配合 `.barWidth()` / `.barHeight()` 实现左侧导航栏。

## router 模块（传统方案）

> `import { router } from '@kit.ArkUI'`（旧写法 `import router from '@ohos.router'`）

```typescript
// 跳转（保留当前页）
router.pushUrl({
  url: 'pages/Detail',
  params: { id: 100 }
})

// 跳转（替换当前页）
router.replaceUrl({ url: 'pages/Login' })

// 返回
router.back()
router.back({ url: 'pages/Home' })   // 返回到指定页

// 获取参数
const params: Record<string, Object> = router.getParams() as Record<string, Object>
```

**RouterMode**：`Standard`（默认，多实例）、`Single`（单实例，复用栈中已有页面）。

**局限**：页面栈上限 32 层；不支持从栈中移除任意页面；不支持分栏布局；转场动画能力弱；页面级路由导致模块耦合度高。

## 页面转场动画

### Navigation 自定义转场（推荐）

通过 `customNavContentTransition` 事件自定义子页面切换动画：

```typescript
Navigation(this.navStack) { ... }
  .customNavContentTransition((from, to, operation) => {
    // 返回自定义动画对象，控制 from/to 页面的属性动画
  })
```

支持 `geometryTransition` 实现 NavDestination 间的共享元素过渡。

### router 页面转场（传统）

在页面中定义 `pageTransition()` 方法：

```typescript
pageTransition() {
  PageTransitionEnter({ type: RouteType.Push, duration: 300 })
    .slide(SlideEffect.Right)
  PageTransitionExit({ type: RouteType.Push, duration: 300 })
    .slide(SlideEffect.Left)
}
```

## Navigation vs router 选型指南

| 维度 | Navigation | router |
|------|-----------|--------|
| 官方推荐 | 是（API 9+，12+ 系统路由表） | 否（维护模式） |
| 路由粒度 | 组件级 | 页面级 |
| 栈操作 | 支持移除任意页、替换、清空 | 仅 push/replace/back |
| 分栏适配 | Stack/Split/Auto 三模式 | 不支持 |
| 跨模块解耦 | 系统路由表自动加载 | 需手动管理 URL |
| 转场动画 | customNavContentTransition + 共享元素 | pageTransition，能力有限 |
| 页面栈限制 | 无硬性上限 | 最多 32 层 |

**结论**：新项目一律使用 Navigation；存量项目逐步迁移，优先将高频导航路径切换到 Navigation。

## 常见陷阱

- **NavPathStack 未共享**：忘记用 `@Provide` / `@Consume` 传递，子组件拿不到路由栈实例。可用全局单例模式兜底
- **route_map.json 的 name 与 pushPath 不匹配**：name 必须严格一致（区分大小写），否则静默失败不跳转
- **pageSourceFile 路径错误**：路径相对于模块 src 目录，写错不会编译报错但运行时找不到页面
- **router 的 32 层栈溢出**：反复 pushUrl 不清理会到上限，需要用 `router.clear()` 或改用 Navigation
- **Tabs 与 Navigation 嵌套**：Navigation 嵌套 Tabs 时，Tab 切换不影响 NavPathStack；但 Tabs 内每个 Tab 若需独立导航栈，需各自维护 NavPathStack
- **NavDestination 缺少 onReady 就取参数**：在 build 阶段直接取 pathInfo 可能为空，应在 `onReady` 回调中获取

## 组合提示

- 与 `harmony-state-management` 联动：NavPathStack 通常通过 `@Provide/@Consume` 或 AppStorage 全局共享
- 与 `harmony-arkui-components` 联动：Navigation 的 titleBar / toolBar 可自定义组件
- 与 `harmony-stage-model` 联动：跨 Ability 跳转仍需 Want，Navigation 仅管理 Ability 内的页面栈
