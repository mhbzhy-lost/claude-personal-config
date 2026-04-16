---
name: harmony-arkts-lang
description: "ArkTS 语言特性：与 TypeScript 的差异、静态约束、装饰器、模块系统。"
tech_stack: [harmonyos]
language: [arkts]
---

# ArkTS 语言特性

> 来源：https://developer.huawei.com/consumer/en/doc/harmonyos-guides/typescript-to-arkts-migration-guide-V5
> 版本基准：HarmonyOS 5 / API 12+

## 用途

帮助 LLM 正确生成 ArkTS 代码，避免将 TypeScript/JavaScript 的动态特性带入 ArkTS 导致编译失败。ArkTS 基于 TypeScript 但施加了大量静态约束以换取 AOT 编译性能。

## 何时使用

- 编写或审查 `.ets` 文件时
- 从 TypeScript 项目迁移到 HarmonyOS 时
- 遇到 `arkts-no-*` 系列编译错误时
- 设计 ArkTS 模块的类型与接口时

## 核心差异：ArkTS 禁止的 TS/JS 特性

### 类型系统约束

```typescript
// TS 允许，ArkTS 禁止 ------

let x: any = 42              // arkts-no-any-unknown：禁止 any / unknown
let y = 'hello'              // arkts-no-implicit-type：必须显式标注类型
let z: string | number        // 联合类型受限，仅允许有限场景

// ArkTS 正确写法 ------
let x: number = 42
let y: string = 'hello'
```

**禁止清单**：
- `any` / `unknown` 类型
- 省略类型标注（函数参数、返回值、变量声明均需显式类型）
- 条件类型（`T extends U ? X : Y`）和 `infer` 关键字
- 映射类型（`{ [K in keyof T]: ... }`）
- 交叉类型（`A & B`），改用继承
- 索引签名（`{ [key: string]: any }`），改用 `Record` 或具体类型
- `this` 类型标注
- 类型守卫函数（`x is Type`）的部分用法受限

### 对象与类约束

```typescript
// TS 允许，ArkTS 禁止 ------
let obj: any = { name: 'test' }
obj.age = 18                  // 运行时添加属性：禁止
delete obj.name               // delete 运算符：禁止
obj['name']                   // 字符串索引访问：禁止

// ArkTS 正确写法 ------
class Person {
  name: string = ''
  age: number = 0
}
let obj: Person = new Person()
obj.name                      // 通过 . 运算符访问已声明属性
```

**禁止清单**：
- 运行时修改对象布局（增删属性）
- `delete` 运算符
- 方括号动态属性访问 `obj[expr]`（数组索引除外）
- 对象字面量作为类型（须定义 class / interface）
- 在构造函数中隐式声明字段（须在 class 体内显式声明）
- 结构化类型兼容（ArkTS 采用名义类型，同结构不同类不可互换）
- `#` 私有字段语法，改用 `private` 关键字

### 表达式与运算符约束

- `eval()` 禁止
- `with` 语句禁止
- `var` 禁止，统一用 `let` / `const`
- `typeof` 仅可用于表达式，不可用于类型位置
- `+` 运算符仅适用于 `number`，字符串拼接用模板字符串或 `.concat()`
- 逗号运算符 `,` 禁止（`for` 的初始化和更新表达式除外）
- 解构赋值禁止（对象解构和数组解构均不支持）
- 展开运算符 `...` 仅限数组场景（展开到数组字面量、传给剩余参数）

### 函数约束

```typescript
// TS 允许，ArkTS 禁止 ------
function* gen() { yield 1 }   // Generator 函数：禁止

// ArkTS 正确写法 ------
async function fetchData(): Promise<string> {  // async/await 和 Promise 支持
  return 'data'
}
```

- Generator 函数 / `yield` 禁止
- 函数声明中 `this` 参数类型禁止
- 函数重载的实现签名必须与所有重载签名兼容
- `arguments` 对象禁止

### 其他禁止项

- `Symbol`（不支持）
- 声明合并（Declaration Merging）
- 接口中的构造签名
- `.ts` 文件与 `.ets` 文件的混用受限（须通过模块边界隔离）

## 类型断言

```typescript
// ArkTS 唯一支持的类型断言语法
let val = someValue as string     // 正确
let val = <string>someValue       // 禁止：尖括号语法不支持

// 注意：ArkTS 的 as 断言在运行时会真正检查类型
// 错误的断言会抛出 ClassCastException，与 TS 的"仅编译期"断言不同
```

## 装饰器体系

ArkTS 装饰器是**编译器内置**的，不是 TS 的实验性装饰器。不可自定义（API 12 起部分支持自定义装饰器）。

| 装饰器 | 作用 | 作用目标 |
|--------|------|----------|
| `@Component` | 声明自定义组件 | `struct` |
| `@Entry` | 标记页面入口组件 | `struct` |
| `@State` | 组件内部状态，变更触发 UI 刷新 | 属性 |
| `@Prop` | 父到子单向传递（值拷贝） | 属性 |
| `@Link` | 父子双向绑定（引用） | 属性 |
| `@Provide` / `@Consume` | 跨层级双向绑定（祖先-后代） | 属性 |
| `@Observed` | 标记类可被深度观察 | `class` |
| `@ObjectLink` | 引用 @Observed 对象（双向） | 属性 |
| `@Watch` | 属性变化回调 | 属性 |
| `@Builder` | 轻量 UI 复用片段 | 函数 |
| `@Styles` | 可复用样式集合 | 函数 |
| `@Extend` | 扩展内置组件样式 | 函数 |

**关键约束**：UI 组件必须用 `struct`（不是 `class`），且不支持继承。

```typescript
@Entry
@Component
struct MyPage {
  @State count: number = 0

  build() {
    Column() {
      Text(`Count: ${this.count}`)
      Button('Add')
        .onClick(() => { this.count++ })
    }
  }
}
```

## 模块系统

### 文件类型

| 扩展名 | 说明 |
|--------|------|
| `.ets` | ArkTS 源文件（可使用装饰器和 ArkUI 组件） |
| `.ts` | 纯 TypeScript 逻辑（受 ArkTS 约束子集限制） |

### 导入导出

```typescript
// 标准 ESM 语法
import { MyComponent } from './MyComponent'
import type { MyInterface } from '../types'
export { MyUtil }
export default class DataService { }

// 系统 API 导入（@ohos 前缀）
import { hilog } from '@kit.PerformanceAnalysisKit'
import { router } from '@kit.ArkUI'

// 三方库（ohpm 管理，存于 oh_modules/）
import { lottie } from '@ohos/lottie'
```

### 包类型

- **HAP**（Harmony Ability Package）：可部署的应用模块
- **HAR**（Harmony Archive）：静态共享库
- **HSP**（Harmony Shared Package）：动态共享库
- 配置文件：`oh-package.json5`（依赖管理），`module.json5`（模块声明）

## 常见陷阱

1. **用对象字面量当类型**：ArkTS 不支持 `{ name: string, age: number }` 作为类型，必须先定义 `class` 或 `interface`。

2. **解构赋值习惯**：`const { a, b } = obj` 在 ArkTS 中不可用，须逐字段赋值 `let a: string = obj.a`。

3. **as 断言当作免费操作**：ArkTS 的 `as` 会在运行时做真实类型检查，错误断言直接抛异常，不像 TS 只在编译期生效。

4. **联合类型滥用**：`string | number` 等联合类型支持有限，优先用接口多态或泛型替代。

5. **忘记初始化字段**：ArkTS 要求所有 class 字段必须有初始值或在构造函数中赋值，不可留 `undefined`。

6. **用 class 写组件**：UI 组件只能用 `struct`，不能用 `class`，且 `struct` 不支持继承。

7. **动态属性访问**：`obj['key']` 在 ArkTS 中是编译错误（数组索引除外），必须用 `obj.key`。

8. **导入路径带 .ets**：导入时不写文件扩展名，`import { Foo } from './Foo'` 而非 `'./Foo.ets'`。

## 组合提示

- 状态管理装饰器 --> `harmony-state-management` skill
- UI 组件与布局 --> `harmony-arkui-components` / `harmony-arkui-layout` skill
- 并发编程（TaskPool / Worker） --> `harmony-concurrency` skill
- 导航与路由 --> `harmony-arkui-navigation` skill
