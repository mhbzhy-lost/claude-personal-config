---
name: harmony-ui-advanced
description: "ArkUI 高级 UI：@Builder/@Styles/@Extend、动画系统、Canvas 绘制、自定义弹窗。"
tech_stack: [harmonyos]
---

# ArkUI 高级 UI 模式

> 来源：https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/arkui
> 版本基准：HarmonyOS 5 / API 12+

## 用途

提供超越基础布局与组件的高级 UI 能力：UI 片段复用（@Builder/@BuilderParam）、样式复用（@Styles/@Extend）、三类动画、Canvas 自定义绘制、自定义弹窗。

## 何时使用

- 多处重复的 UI 片段需要抽取复用 --> @Builder / @BuilderParam
- 多组件共享样式属性 --> @Styles / @Extend
- 状态变化需要平滑过渡 --> 属性动画 / 显式动画
- 组件插入/删除需要出入场效果 --> 转场动画
- 内置组件无法满足绘制需求 --> Canvas
- 需要自定义弹窗内容 --> promptAction.openCustomDialog

## 自定义组件生命周期

### 组件级（@Component）

| 回调 | 时机 | 可否改状态 |
|------|------|-----------|
| `aboutToAppear` | 实例创建后、build() 前 | 可以 |
| `aboutToDisappear` | 组件销毁前 | **禁止**改 @Link |

### 页面级（@Entry 独有，额外拥有）

| 回调 | 时机 |
|------|------|
| `onPageShow` | 页面每次显示（含前台恢复） |
| `onPageHide` | 页面每次隐藏 |
| `onBackPress` | 返回键，返回 true 拦截默认行为 |

执行顺序：`aboutToAppear` -> `onPageShow` -> `build()` -> ... -> `onPageHide` -> `aboutToDisappear`

## @Builder / @BuilderParam（UI 片段复用）

### @Builder：自定义构建函数

```typescript
// ---- 全局 Builder（多页面复用）----
@Builder function InfoCard($$: { title: string; count: number }) {
  Row() {
    Text($$.title)
    Text(`${$$.count}`).fontColor(Color.Red)
  }
}

// ---- 组件内 Builder ----
@Component struct Parent {
  @State count: number = 0
  @Builder itemBuilder() {       // 可访问 this
    Text(`count = ${this.count}`)
  }
  build() {
    Column() {
      this.itemBuilder()                       // 组件内调用
      InfoCard({ title: '消息', count: this.count }) // 全局调用
    }
  }
}
```

### 参数传递规则（核心易错点）

| 传递方式 | 参数形式 | 状态同步 | 适用场景 |
|---------|---------|---------|---------|
| **按值** | 直接传基本类型 `ABuilder(this.label)` | 不同步，快照 | 静态展示 |
| **按引用** | 传对象字面量 `ABuilder({ paramA1: this.label })` + 形参用 `$$` | **自动同步** | 需要响应状态变化 |

> **规则**：需要 UI 随状态刷新时，**必须用按引用传递**（参数命名为 `$$`，传入对象字面量）。

### @BuilderParam：接收外部 Builder

用途：让父组件向子组件"注入" UI 片段，类似 slot。

```typescript
@Component struct Card {
  @Prop title: string
  @BuilderParam content: () => void   // 声明插槽

  build() {
    Column() {
      Text(this.title).fontSize(20)
      this.content()                    // 渲染插槽
    }
  }
}

@Entry @Component struct Page {
  @Builder detailContent() {
    Text('这是注入的内容')
  }
  build() {
    Column() {
      // 方式 1：显式赋值
      Card({ title: '卡片', content: this.detailContent })
      // 方式 2：尾随闭包（仅限组件有且仅有一个 @BuilderParam 时）
      Card({ title: '卡片' }) {
        Text('尾随闭包内容')
      }
    }
  }
}
```

**注意**：尾随闭包只在子组件恰好有 **1 个** @BuilderParam 时可用；有多个时必须显式赋值。

## @Styles / @Extend（样式复用）

### @Styles：通用属性复用

```typescript
// 全局
@Styles function cardStyle() {
  .width('100%')
  .padding(16)
  .borderRadius(12)
  .backgroundColor(Color.White)
}
// 组件内（可访问 this 状态）
@Component struct Demo {
  @State bgColor: ResourceColor = Color.White
  @Styles pressedStyle() {
    .backgroundColor(this.bgColor)
    .opacity(0.8)
  }
  build() {
    Column() { ... }.cardStyle().pressedStyle()
  }
}
```

- **不支持参数**
- 仅可设置**通用属性**（所有组件共有的）

### @Extend：指定组件扩展

```typescript
@Extend(Text) function titleStyle(size: number) {
  .fontSize(size)
  .fontWeight(FontWeight.Bold)
  .fontColor('#333')
}
// 使用
Text('标题').titleStyle(24)
```

- **支持参数**
- 可设置**组件私有属性与事件**（如 Text 的 fontColor）
- **仅全局定义**，不可在组件内

| 对比项 | @Styles | @Extend |
|--------|---------|---------|
| 参数 | 不支持 | 支持 |
| 作用域 | 全局 + 组件内 | 仅全局 |
| 属性范围 | 通用属性 | 通用 + 指定组件私有属性 |

## 属性动画（animation）

状态变化时**自动插值**，声明式最简动画方式。

```typescript
@Entry @Component struct Demo {
  @State btnWidth: number = 100
  build() {
    Button('点击')
      .width(this.btnWidth)
      .height(50)
      .animation({                  // 必须在被动画属性之后声明
        duration: 300,
        curve: Curve.EaseOut,
        iterations: 1,
        playMode: PlayMode.Normal
      })
      .onClick(() => { this.btnWidth = this.btnWidth === 100 ? 250 : 100 })
  }
}
```

> **关键**：`.animation()` 只对其**前面**声明的属性生效；后面的属性无动画。

## 显式动画（animateTo）

在回调闭包中修改状态，框架对闭包中**所有变化的属性**统一施加动画。

```typescript
@Entry @Component struct Demo {
  @State angle: number = 0
  @State scale: number = 1
  build() {
    Image($r('app.media.icon'))
      .rotate({ angle: this.angle })
      .scale({ x: this.scale, y: this.scale })
      .onClick(() => {
        animateTo({
          duration: 500,
          curve: Curve.Friction
        }, () => {
          this.angle += 90
          this.scale = this.scale === 1 ? 1.5 : 1
        })
      })
  }
}
```

### 属性动画 vs 显式动画

| 维度 | animation（属性） | animateTo（显式） |
|------|-------------------|-------------------|
| 作用对象 | 单个组件的指定属性 | 闭包内所有状态变化涉及的 UI |
| 适用场景 | 简单属性过渡 | 多属性 / 跨组件联动动画 |
| 声明位置 | 组件链式调用 | 事件回调中 |

## 转场动画（transition）

组件**插入/删除**时的出入场效果，需配合 `if` / `ForEach` 的条件渲染及 `animateTo`。

```typescript
@Entry @Component struct Demo {
  @State show: boolean = true
  build() {
    Column() {
      if (this.show) {
        Text('Hello')
          .transition(
            TransitionEffect.OPACITY
              .animation({ duration: 300, curve: Curve.Ease })
              .combine(TransitionEffect.translate({ y: -20 }))
          )
      }
      Button('Toggle').onClick(() => {
        animateTo({ duration: 300 }, () => { this.show = !this.show })
      })
    }
  }
}
```

常用 TransitionEffect：`OPACITY`、`SLIDE`、`translate()`、`rotate()`、`scale()`，可通过 `.combine()` 组合。

## Canvas 自定义绘制

```typescript
@Entry @Component struct CanvasDemo {
  private settings: RenderingContextSettings = new RenderingContextSettings(true)
  private ctx: CanvasRenderingContext2D = new CanvasRenderingContext2D(this.settings)

  build() {
    Canvas(this.ctx)
      .width('100%')
      .height(300)
      .onReady(() => {
        // 矩形
        this.ctx.fillStyle = '#0097D4'
        this.ctx.fillRect(20, 20, 100, 80)
        // 圆弧
        this.ctx.beginPath()
        this.ctx.arc(200, 60, 40, 0, Math.PI * 2)
        this.ctx.fill()
        // 文字
        this.ctx.font = '24vp sans-serif'
        this.ctx.fillText('Hello Canvas', 20, 150)
      })
  }
}
```

API 与 Web Canvas 2D 高度一致：`fillRect` / `strokeRect` / `arc` / `lineTo` / `bezierCurveTo` / `drawImage` / `fillText` 等。

动态更新：在状态变化回调中重新调用 ctx 绑定方法即可重绘。

## 自定义弹窗（CustomDialog）

### 推荐方式：promptAction.openCustomDialog（API 11+）

```typescript
import { promptAction } from '@kit.ArkUI'
import { ComponentContent } from '@kit.ArkUI'

// 1. 定义弹窗内容
@Builder function dialogContent(params: { message: string; close: () => void }) {
  Column({ space: 16 }) {
    Text(params.message).fontSize(18)
    Button('关闭').onClick(() => params.close())
  }
  .padding(24)
  .backgroundColor(Color.White)
  .borderRadius(16)
}

// 2. 打开弹窗
const ctx = this.getUIContext()                       // 在组件方法中获取
const contentNode = new ComponentContent(
  ctx,
  wrapBuilder(dialogContent),
  { message: '提示信息', close: () => promptAction.closeCustomDialog(contentNode) }
)
promptAction.openCustomDialog(contentNode, {
  alignment: DialogAlignment.Center,
  autoCancel: true
})
```

### 旧方式：@CustomDialog（官方已标注"不推荐"）

```typescript
@CustomDialog struct OldDialog {
  controller: CustomDialogController
  build() {
    Text('旧式弹窗')
  }
}
// 在父组件中
dialogCtrl: CustomDialogController = new CustomDialogController({ builder: OldDialog() })
this.dialogCtrl.open()
```

> **迁移建议**：新代码统一使用 `promptAction.openCustomDialog` + `ComponentContent`，可脱离组件树在纯逻辑层调用，更灵活。

## 常见陷阱

1. **@Builder 按值传递不刷新**：传基本类型给 @Builder 后修改状态，UI 不更新。必须用 `$$` 对象按引用传递。
2. **animation 声明顺序**：`.animation()` 只对其**之前**的属性生效，放在 `.width()` 前面则 width 无动画。
3. **transition 必须配合 animateTo**：单独设置 `.transition()` 不会生效，条件渲染的状态变化必须包裹在 `animateTo` 闭包中。
4. **@BuilderParam this 指向**：传入的 Builder 在子组件中调用时，`this` 指向子组件而非定义处的父组件，访问父组件状态需通过参数传递。
5. **aboutToDisappear 中改 @Link**：会导致不可预期行为，此回调中禁止修改 @Link 变量。
6. **Canvas 坐标单位**：默认 vp，与组件布局一致；文字用 `'24vp sans-serif'` 格式指定字号。
7. **@Styles 不支持参数**：需要参数化样式时应使用 @Extend 或 @Builder。
8. **CustomDialogController 必须在组件内创建**：不能在纯函数/工具类中实例化，这也是推荐迁移到 promptAction 的原因。
