---
name: harmony-state-management
description: "ArkUI 状态管理：@State/@Prop/@Link/@Provide/@Consume/@Observed/@ObjectLink 装饰器与数据流模式。"
tech_stack: [harmonyos, mobile-native]
language: [arkts]
---

# ArkUI 状态管理

> 来源：https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/arkts-state-management-overview
> 版本基准：HarmonyOS 5 / API 12+

## 用途

ArkUI 通过装饰器驱动的状态管理机制，实现数据变化到 UI 自动刷新的响应式编程。状态变量变更时框架自动重执行 `build()` 中依赖该变量的部分，无需手动操作 DOM。

## 何时使用

- 组件内部有需要驱动 UI 刷新的可变数据
- 父子组件间需要单向或双向数据同步
- 跨多层组件传递共享状态（避免逐层 prop drilling）
- 嵌套对象 / 数组元素的属性变化需要触发 UI 更新
- 需要监听状态变化执行副作用逻辑

## 装饰器总览（选型速查表）

| 装饰器 | 作用域 | 同步方向 | 典型场景 |
|---------|--------|----------|----------|
| `@State` | 组件内 | -- | 组件私有状态，UI 渲染数据源 |
| `@Prop` | 父 -> 子 | 单向下行 | 父传子配置项，子可本地修改但不回传 |
| `@Link` | 父 <-> 子 | 双向 | 表单控件、开关等需要回传的场景 |
| `@Provide` | 祖先 | 向下广播 | 主题色、语言等跨层共享 |
| `@Consume` | 后代 | 接收广播 | 消费 `@Provide` 提供的状态 |
| `@Observed` | class 定义 | -- | 使类实例属性可被框架代理观测 |
| `@ObjectLink` | 子组件 | 双向(属性级) | 接收 `@Observed` 类实例，观测其属性变化 |
| `@Watch` | 附加 | -- | 状态变更后触发回调（副作用） |
| `@Track` | class 属性 | -- | 属性级精准更新，减少冗余渲染 |

## 组件内状态（@State）

组件私有状态，变更触发当前组件 `build()` 重执行。

```typescript
@Entry
@Component
struct Counter {
  @State count: number = 0  // 必须初始化

  build() {
    Column() {
      Text(`${this.count}`)
      Button('+1').onClick(() => { this.count++ })
    }
  }
}
```

**观测范围**：基本类型整体赋值；对象/数组的第一层属性变化。嵌套对象深层属性变化**不可观测**（需 `@Observed`）。

支持类型：`string`、`number`、`boolean`、`enum`、`Object`、`class`、`Date`、以及上述类型的数组。

## 父->子单向同步（@Prop）

父组件 `@State` 变化自动同步到子组件 `@Prop`；子组件修改 `@Prop` 不回传父组件。

```typescript
@Component
struct Child {
  @Prop title: string  // 接收父组件值，可本地修改

  build() { Text(this.title) }
}

@Component
struct Parent {
  @State msg: string = 'Hello'

  build() {
    Child({ title: this.msg })  // 直接传值
  }
}
```

**注意**：`@Prop` 对对象类型做深拷贝，大对象传递有性能开销。

## 父<->子双向同步（@Link）

子组件修改会同步回父组件，父组件变化也同步到子组件。

```typescript
@Component
struct ToggleChild {
  @Link isOn: boolean

  build() {
    Toggle({ type: ToggleType.Switch, isOn: this.isOn })
      .onChange((val: boolean) => { this.isOn = val })
  }
}

@Component
struct Parent {
  @State switchOn: boolean = false

  build() {
    // 传递时用 $ 前缀表示引用（双向绑定语法）
    ToggleChild({ isOn: $switchOn })
  }
}
```

**关键**：父组件传递 `@Link` 变量时必须使用 `$变量名` 语法（如 `$switchOn`），传递的是引用而非值。

## 跨层级传递（@Provide / @Consume）

祖先组件通过 `@Provide` 广播，任意后代通过 `@Consume` 接收，无需逐层传递。

```typescript
@Entry
@Component
struct GrandParent {
  @Provide('theme') themeColor: string = '#FF0000'

  build() {
    Column() {
      Parent()
      Button('换色').onClick(() => { this.themeColor = '#00FF00' })
    }
  }
}

@Component
struct Parent {
  build() { DeepChild() }  // 中间层无需感知 theme
}

@Component
struct DeepChild {
  @Consume('theme') themeColor: string  // 通过别名匹配

  build() { Text('主题色').fontColor(this.themeColor) }
}
```

**注意**：`@Provide/@Consume` 开销大于 `@State/@Prop/@Link`，仅在层级较深（>=3 层）时使用。若 `@Consume` 找不到对应 `@Provide` 会运行时报错。

## 嵌套对象观测（@Observed / @ObjectLink）

`@State` 只能观测第一层属性变化。嵌套对象的属性变更需要 `@Observed` + `@ObjectLink` 配合。

```typescript
@Observed
class Task {
  title: string
  done: boolean = false
  constructor(title: string) { this.title = title }
}

@Component
struct TaskItem {
  @ObjectLink task: Task  // 接收 @Observed 实例

  build() {
    Row() {
      Text(this.task.title)
      Toggle({ type: ToggleType.Checkbox, isOn: this.task.done })
        .onChange((val: boolean) => { this.task.done = val }) // 属性修改可观测
    }
  }
}

@Entry
@Component
struct TaskList {
  @State tasks: Task[] = [new Task('学习'), new Task('运动')]

  build() {
    Column() {
      ForEach(this.tasks, (item: Task) => {
        TaskItem({ task: item })  // 传递 @Observed 实例
      })
    }
  }
}
```

**核心陷阱**：

1. **类必须加 `@Observed`**：未装饰的类属性变化不会触发 UI 更新
2. **禁止对 `@ObjectLink` 变量整体赋值**：`this.task = new Task('x')` 会断开同步链，只能修改其属性（`this.task.done = true`）
3. **多层嵌套需逐层装饰**：如果 `Task` 中包含 `SubTask` 类属性，`SubTask` 也必须加 `@Observed`，且需要拆分出独立子组件用 `@ObjectLink` 接收
4. **数组元素属性变化不可直接观测**：`@State arr: Task[]` 能观测增删，但 `arr[0].done = true` 不触发更新，必须通过 `@ObjectLink` 子组件观测

## 状态监听（@Watch）

附加在状态装饰器上，状态变更后同步调用回调方法。

```typescript
@Component
struct Cart {
  @State @Watch('onCountChange') count: number = 0
  @State total: number = 0

  onCountChange() {
    this.total = this.count * 10  // 可在回调中修改其他状态
  }

  build() {
    Column() {
      Text(`数量: ${this.count}, 总价: ${this.total}`)
      Button('+').onClick(() => { this.count++ })
    }
  }
}
```

**规则**：
- 回调方法名以字符串传入：`@Watch('methodName')`
- 首次初始化**不触发**回调，仅后续变更触发
- 回调中修改其他 `@Watch` 变量会级联触发（注意避免循环）
- 使用严格相等 `===` 判断是否变化

## 性能优化（@Track / 最小化重渲染）

`@Track` 装饰 class 属性，实现属性级精准更新：仅被修改的 `@Track` 属性关联的 UI 刷新。

```typescript
class LogInfo {
  @Track time: string = ''
  @Track level: string = 'INFO'
  // 未装饰的属性不能在 UI 中使用！
  internalId: number = 0
}
```

**关键规则**：一旦 class 中使用了 `@Track`，未被 `@Track` 装饰的属性**禁止在 UI 中绑定**，否则运行时报错。

**其他性能建议**：
- 避免在 `build()` 中创建新对象赋给状态变量（每次都触发更新）
- `@Prop` 深拷贝大对象开销高，考虑用 `@Link` 或 `@ObjectLink` 替代
- 尽量将状态下沉到最小使用范围的组件，减少 `build()` 波及面
- 数组场景用 `ForEach` + `@ObjectLink` 子组件实现元素级更新

## 状态传递层级决策树

```
需要状态驱动 UI?
  |
  +-- 仅组件内部使用 --> @State
  |
  +-- 需要传递给子组件
       |
       +-- 子组件只读 / 本地可改但不回传 --> @Prop
       |
       +-- 子组件修改需同步回父组件 --> @Link (传递用 $语法)
       |
       +-- 跨越 >= 3 层组件 --> @Provide / @Consume
       |
       +-- 传递的是嵌套对象，需观测其属性变化
            |
            +-- 类加 @Observed，子组件用 @ObjectLink 接收
```

## 常见陷阱

| 陷阱 | 症状 | 解决方案 |
|------|------|----------|
| 嵌套属性修改无效 | `obj.sub.field = x` 不刷新 UI | 对 `sub` 的类加 `@Observed`，拆子组件用 `@ObjectLink` |
| 数组元素属性修改无效 | `arr[i].field = x` 不刷新 | 同上：`@Observed` 类 + `@ObjectLink` 子组件 |
| `@ObjectLink` 整体赋值 | 赋值后 UI 不再响应 | 只修改属性，不要 `this.xxx = new Obj()` |
| `@Link` 传值忘加 `$` | 编译报错或单向同步 | 父组件传递时用 `$变量名` |
| `@Consume` 找不到 `@Provide` | 运行时崩溃 | 确保祖先链上有匹配的 `@Provide` |
| `@Watch` 循环触发 | 页面卡死 / 栈溢出 | 回调中不要修改自身监听的变量 |
| `@Track` 部分属性未装饰 | 运行时报错 | 一旦用 `@Track`，所有 UI 绑定属性都必须加 |
| `@Prop` 传大对象卡顿 | 性能下降 | 改用 `@Link` 或 `@ObjectLink` 避免深拷贝 |
