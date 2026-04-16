---
name: harmony-arkui-components
description: "ArkUI 常用组件：Text/Image/Button/TextInput/Toggle/Slider/Progress/Select/Search 等核心 UI 元素。"
tech_stack: [harmonyos]
---

# ArkUI 常用组件

> 来源：https://developer.huawei.com/consumer/en/doc/harmonyos-references/arkui-ts-components-V5
> 版本基准：HarmonyOS 5 / API 12+

## 用途

ArkUI 声明式 UI 框架的基础组件集合，覆盖文本、图片、按钮、输入、选择、进度、辅助等常见场景。所有组件通过链式调用设置属性和事件。

## 何时使用

- 构建任何 HarmonyOS 应用的 UI 界面
- 需要文本展示、用户输入、状态切换、进度反馈等交互
- 作为自定义组件的基础构建块

## 文本（Text / Span / RichEditor）

### Text

显示文本，支持富文本样式。构造参数：`Text(content?: string | Resource)`。

```typescript
Text('Hello HarmonyOS')
  .fontSize(18)
  .fontColor('#333333')
  .fontWeight(FontWeight.Bold)
  .maxLines(2)
  .textOverflow({ overflow: TextOverflow.Ellipsis })
  .textAlign(TextAlign.Center)
  .lineHeight(26)
```

常用属性：`fontSize` / `fontColor` / `fontWeight` / `maxLines` / `textOverflow` / `textAlign` / `decoration` / `lineHeight` / `letterSpacing`

**注意**：`textOverflow` 必须配合 `maxLines` 才能生效；单独设置 `textOverflow` 无效果。

### Span

Text 的行内子组件，不能单独使用，只能放在 `Text` 内部。用于同一段文本中混排不同样式。

```typescript
Text() {
  Span('加粗文字').fontWeight(FontWeight.Bold).fontColor(Color.Red)
  Span('普通文字').fontSize(14).fontColor(Color.Grey)
  Span('带下划线')
    .decoration({ type: TextDecorationType.Underline, color: Color.Blue })
}
```

从 API 10 起，Span 可继承父 Text 的 `fontColor`、`fontSize`、`fontWeight` 等属性。

### RichEditor

富文本编辑器，支持图文混排与交互式编辑。通过 controller 动态增删内容。

```typescript
@State controller: RichEditorController = new RichEditorController()

RichEditor({ controller: this.controller })
  .onReady(() => {
    this.controller.addTextSpan('初始文本', {
      style: { fontSize: 16, fontColor: Color.Black }
    })
  })
  .width('100%')
  .height(200)
```

关键方法：`controller.addTextSpan()` / `controller.addImageSpan()` / `controller.deleteSpans()` / `controller.getSpans()`

## 图片（Image）

显示图片，支持本地资源、网络 URL、PixelMap。构造参数：`Image(src: string | Resource | PixelMap)`。

```typescript
// 本地资源
Image($r('app.media.icon'))
  .width(100)
  .height(100)
  .objectFit(ImageFit.Cover)
  .borderRadius(8)

// 网络图片（需声明 ohos.permission.INTERNET 权限）
Image('https://example.com/photo.jpg')
  .width('100%')
  .aspectRatio(1.5)
  .objectFit(ImageFit.Contain)
```

常用属性：`objectFit`（Cover/Contain/Fill/Auto）/ `interpolation` / `borderRadius` / `alt`（加载占位图）

**注意**：网络图片必须在 `module.json5` 中声明网络权限，否则无法加载。`$r('app.media.xxx')` 引用 `resources/base/media/` 下的资源。

## 按钮（Button）

按钮组件，支持文字按钮和自定义子组件按钮。

构造参数：`Button(label?: string, options?: { type?: ButtonType, stateEffect?: boolean })`

```typescript
// 文字按钮
Button('登录', { type: ButtonType.Capsule, stateEffect: true })
  .width('80%')
  .height(44)
  .fontSize(16)
  .backgroundColor('#007DFF')
  .onClick(() => {
    console.info('clicked')
  })

// 包含子组件的按钮
Button({ type: ButtonType.Normal }) {
  Row() {
    Image($r('app.media.icon')).width(20).height(20)
    Text('图标按钮').fontSize(14).margin({ left: 8 })
  }
}
```

ButtonType 枚举：`Capsule`（圆角胶囊，默认）/ `Circle`（圆形）/ `Normal`（矩形）

## 输入（TextInput / TextArea / Search）

### TextInput

单行输入框。构造参数：`TextInput(value?: { placeholder?: string, text?: string, controller?: TextInputController })`

```typescript
@State username: string = ''

TextInput({ placeholder: '请输入用户名', text: this.username })
  .type(InputType.Normal)
  .maxLength(20)
  .width('100%')
  .height(44)
  .onChange((value: string) => { this.username = value })
  .onSubmit((enterKey: EnterKeyType) => { /* 回车提交 */ })
```

InputType 枚举：`Normal` / `Password` / `Email` / `Number` / `PhoneNumber`

### TextArea

多行输入框。构造参数与 TextInput 类似。

```typescript
TextArea({ placeholder: '请输入评论内容' })
  .maxLength(500)
  .showCounter(true)
  .height(120)
  .onChange((value: string) => { this.content = value })
```

### Search

搜索框，自带搜索图标和搜索按钮。构造参数：`Search(options?: { value?: string, placeholder?: string, controller?: SearchController })`

```typescript
Search({ value: this.keyword, placeholder: '搜索商品' })
  .searchButton('搜索')
  .width('100%')
  .height(40)
  .placeholderColor(Color.Grey)
  .onSubmit((value: string) => { this.doSearch(value) })
  .onChange((value: string) => { this.keyword = value })
```

## 选择（Toggle / Select / Rating / Slider）

### Toggle

切换组件，支持开关/勾选/按钮三种形态。构造参数：`Toggle(options: { type: ToggleType, isOn?: boolean })`

```typescript
// 开关
Toggle({ type: ToggleType.Switch, isOn: false })
  .selectedColor('#007DFF')
  .switchPointColor(Color.White)
  .onChange((isOn: boolean) => { this.enabled = isOn })

// 勾选框
Toggle({ type: ToggleType.Checkbox, isOn: true })
  .selectedColor('#007DFF')
  .onChange((isOn: boolean) => { /* ... */ })
```

ToggleType 枚举：`Switch` / `Checkbox` / `Button`（Button 类型需包含子组件作为标签文字）

### Select

下拉选择菜单。构造参数：`Select(options: Array<SelectOption>)`，其中 `SelectOption = { value: string, icon?: string }`。

```typescript
Select([
  { value: '选项一' },
  { value: '选项二' },
  { value: '选项三' }
])
.selected(0)
.value('请选择')
.font({ size: 16 })
.onSelect((index: number, value: string) => {
  console.info(`selected: ${index} - ${value}`)
})
```

常用属性：`.selected(index)` 设置默认选中项 / `.value(text)` 设置按钮显示文字 / `.optionFont()` / `.selectedOptionFont()`

### Rating

评分条组件。构造参数：`Rating(options?: { rating: number, indicator?: boolean })`

```typescript
Rating({ rating: 3.5, indicator: false })
  .stars(5)
  .stepSize(0.5)
  .onChange((value: number) => { this.score = value })
```

`indicator: true` 时为只读展示模式，`false` 时允许用户交互评分。`stepSize` 取值范围 `[0.1, stars]`。

### Slider

滑动条。构造参数：`Slider(options?: { value?: number, min?: number, max?: number, step?: number, style?: SliderStyle })`

```typescript
Slider({ value: this.volume, min: 0, max: 100, step: 1 })
  .blockColor('#007DFF')
  .trackColor('#E0E0E0')
  .selectedColor('#007DFF')
  .showSteps(false)
  .onChange((value: number, mode: SliderChangeMode) => {
    this.volume = value
  })
```

SliderStyle 枚举：`OutSet`（滑块在滑轨外，默认）/ `InSet`（滑块在滑轨内）

## 进度（Progress / LoadingProgress）

### Progress

进度条。构造参数：`Progress(options: { value: number, total?: number, type?: ProgressType })`

```typescript
// 线性进度条
Progress({ value: 40, total: 100, type: ProgressType.Linear })
  .style({ strokeWidth: 10 })
  .color(Color.Blue)
  .backgroundColor('#E0E0E0')
  .width('80%')

// 环形进度条
Progress({ value: 70, total: 100, type: ProgressType.Ring })
  .style({ strokeWidth: 15 })
  .width(100)
  .height(100)
```

ProgressType 枚举：`Linear`（线性）/ `Ring`（环形）/ `ScaleRing`（带刻度环形）/ `Eclipse`（月食形）/ `Capsule`（胶囊形）

### LoadingProgress

加载动画，无构造参数，无法包含子组件。

```typescript
LoadingProgress()
  .color(Color.Blue)
  .width(60)
  .height(60)
```

## 辅助（Divider / Blank / Marquee）

### Divider

分割线。无构造参数。

```typescript
Divider()
  .strokeWidth(1)
  .color('#F0F0F0')
  .margin({ top: 8, bottom: 8 })

// 垂直分割线
Divider()
  .vertical(true)
  .height(20)
  .strokeWidth(1)
```

### Blank

空白填充组件，在 Row/Column 中自动填充剩余空间（类似 CSS 的 `flex: 1`）。

```typescript
Row() {
  Text('左侧')
  Blank()          // 填充中间空白
  Text('右侧')
}
.width('100%')
```

**注意**：Blank 仅在 `Row` / `Column` 中生效，其他容器中无效。可传入 `Blank(minWidth)` 设置最小宽度。

### Marquee

跑马灯，文本超出宽度时自动滚动。构造参数：`Marquee(options: { start: boolean, step?: number, loop?: number, fromStart?: boolean, src: string })`

```typescript
Marquee({
  start: true,
  step: 6,
  loop: -1,           // -1 = 无限循环
  fromStart: true,     // true = 从右向左
  src: '这是一条很长的滚动通知消息...'
})
.width(200)
.fontSize(14)
.fontColor('#333333')
.onBounce(() => { /* 每轮滚动完成 */ })
```

**注意**：文本宽度未超出组件宽度时不会滚动。`step` 控制速度（默认 6vp）。

## 常见陷阱

1. **textOverflow 不生效**：必须同时设置 `maxLines`，否则省略号不显示
2. **网络图片白屏**：忘记在 `module.json5` 的 `requestPermissions` 中声明 `ohos.permission.INTERNET`
3. **Blank 无效果**：Blank 只在 Row/Column 的主轴方向上填充，放在其他容器中不生效
4. **Toggle 的 Button 类型不显示文字**：ToggleType.Button 必须包含子组件（如 Text），不会自动显示标签
5. **Slider onChange 频繁触发**：回调的第二个参数 `SliderChangeMode` 区分 Begin/Moving/End，避免在 Moving 阶段做重操作
6. **RichEditor 初始内容**：不能直接传文本，必须在 `onReady` 回调中通过 controller 添加
7. **Search 与 TextInput 混淆**：Search 自带搜索图标和按钮，纯表单场景用 TextInput 即可
8. **Rating indicator**：默认 `indicator: false`（可交互），只读展示需显式设 `indicator: true`
