---
name: douyin-mp-core
description: "抖音小程序框架核心：项目结构、TTML/TTSS、生命周期、自定义组件、路由、与微信差异。"
tech_stack: [douyin-miniprogram]
language: [javascript]
capability: [native-lifecycle, routing, native-navigation]
---

# 抖音小程序 Core（框架骨架与约定）

> 来源：
> - https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/guide/start/introduction
> - https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/framework/
>
> 基础库版本区间：v1.0.0 ~ v2.87.0+。使用新 API / 新特性前务必核对 `tt.canIUse()` 或设置 `app.json` 中的最低基础库版本。

## 用途

建立抖音小程序项目的正确心智模型：文件组织、模板语法、样式规则、生命周期钩子、自定义组件模型、路由与跳转。避免把微信小程序的经验 1:1 照搬过来踩坑。

## 何时使用

- 新建抖音小程序或接手一个已有项目需要快速搞懂目录结构与文件约定
- 需要在 `app.json` / `page.json` 中配置全局行为（导航栏、tabBar、网络超时）
- 编写 TTML 模板、TTSS 样式，或封装自定义组件
- 要把一个已有的微信小程序迁移到抖音侧，需要对照差异点

## 项目结构

```
my-app/
├── app.js            # App 入口（必须），调用 App()
├── app.json          # 全局配置（必须）
├── app.ttss          # 全局样式（可选）
├── project.config.json  # IDE / 构建配置
├── sitemap.json      # 搜索索引（可选）
├── pages/
│   └── index/
│       ├── index.js   # Page() 构造器
│       ├── index.json # 页面级配置
│       ├── index.ttml # 页面模板
│       └── index.ttss # 页面样式
└── components/
    └── my-card/
        ├── my-card.js   # Component() 构造器
        ├── my-card.json # 需显式声明 "component": true
        ├── my-card.ttml
        └── my-card.ttss
```

页面四件套中 `js` / `ttml` 必须存在，`json` / `ttss` 可选。`app.js` 必须调用一次 `App({...})`；页面 `js` 必须调用一次 `Page({...})`；组件 `js` 必须调用 `Component({...})`。

## 全局配置（app.json）

```json
{
  "pages": [
    "pages/index/index",
    "pages/detail/detail"
  ],
  "window": {
    "navigationBarTitleText": "示例小程序",
    "navigationBarBackgroundColor": "#ffffff",
    "navigationBarTextStyle": "black",
    "backgroundColor": "#f7f7f7",
    "enablePullDownRefresh": false,
    "onReachBottomDistance": 50
  },
  "tabBar": {
    "color": "#999",
    "selectedColor": "#fa2c19",
    "backgroundColor": "#fff",
    "list": [
      { "pagePath": "pages/index/index", "text": "首页", "iconPath": "...", "selectedIconPath": "..." },
      { "pagePath": "pages/mine/mine",   "text": "我的" }
    ]
  },
  "networkTimeout": {
    "request": 10000,
    "downloadFile": 10000,
    "uploadFile": 10000
  },
  "debug": false
}
```

- `pages` 数组**第一项即启动页**；新增页面必须先登记到 `pages`
- `tabBar.list` 允许 2~5 项；对应的 `pagePath` 必须在 `pages` 中
- `networkTimeout` 单位为毫秒，默认 60000

## TTML 模板

抖音模板语法，作用与微信 WXML 对齐，但**文件后缀和部分指令不同**。

```html
<!-- 数据绑定 -->
<view>{{ user.name }}</view>
<view class="{{ active ? 'on' : '' }}">条件 class</view>

<!-- 列表渲染：tt:for / tt:key，可选 tt:for-item / tt:for-index -->
<block tt:for="{{list}}" tt:key="id">
  <view>{{ index }} - {{ item.title }}</view>
</block>

<!-- 条件渲染 -->
<view tt:if="{{status === 1}}">进行中</view>
<view tt:elif="{{status === 2}}">已完成</view>
<view tt:else>未开始</view>

<!-- 模板复用 -->
<template name="row">
  <view>{{ text }}</view>
</template>
<template is="row" data="{{ text: 'hello' }}" />

<!-- 文件复用 -->
<import src="../common/header.ttml" />   <!-- 只引入 <template> 定义 -->
<include src="../common/footer.ttml" />  <!-- 整段复制插入 -->
```

要点：
- `tt:for` 必须配 `tt:key` 否则列表 diff 性能劣化并可能出错
- `<block>` 是逻辑容器，不渲染真实节点，常用于包住 `tt:for` / `tt:if`
- `import` **不递归**：A import B，B import C，A 里用不到 C 的模板

## TTSS 样式

- 单位 `rpx`：**750rpx = 屏幕宽度**，按 iPhone6 375px 设计稿时 1rpx ≈ 0.5px
- `app.ttss` 为全局样式，页面 `.ttss` 可叠加；`@import "../common/base.ttss"` 引入其它样式文件
- **不支持**：CSS 变量在老基础库上有兼容问题；`*` 通配选择器、属性选择器支持有限；伪类仅 `:active` / `:hover` / `:focus` / `:first-child` / `:last-child` 等常用子集
- 局部样式优先级高于全局样式；`!important` 可用但不建议滥用
- 背景图只能用网络图或 base64，不能用本地文件路径

## 事件系统

```html
<button bind:tap="onTap" data-id="{{item.id}}">按钮</button>
<view catch:tap="onOuter">外层（阻止冒泡）</view>
<view capture-bind:tap="onCapture" />  <!-- 捕获阶段触发 -->
```

```js
Page({
  onTap(e) {
    // e.type / e.timeStamp
    // e.target        触发事件的源组件
    // e.currentTarget 当前组件
    // e.detail        事件携带数据（input/change 等）
    // e.currentTarget.dataset  dash-case 转 camelCase： data-user-id -> userId
    // e.mark          从触发节点往上所有 mark:xxx 的合并对象（去父子重复）
    console.log(e.currentTarget.dataset.id);
  },
});
```

- `bind:` 绑定冒泡事件，`catch:` 阻止冒泡；捕获阶段用 `capture-bind:` / `capture-catch:`
- 老语法 `bindtap`（不带冒号）仍可用，但推荐带冒号的新写法
- `dataset` 是字符串类型，数字/布尔值要自行解析

## App 生命周期

```js
// app.js
App({
  globalData: { token: '' },

  onLaunch(options) {
    // 冷启动，options.scene / options.path / options.query
  },
  onShow(options)  { /* 前台展示 */ },
  onHide()         { /* 切到后台 */ },
  onError(err)     { /* 运行时 JS 错误兜底 */ },
  onPageNotFound(res) { /* 页面不存在时触发 */ },
});

// 页面里拿 globalData：
const app = getApp();
app.globalData.token = 'xxx';
```

## Page 生命周期

```js
Page({
  data: { count: 0 },

  onLoad(query)        { /* 仅一次，query 为 URL 参数 */ },
  onShow()             { /* 每次展示 */ },
  onReady()            { /* 页面首次渲染完成 */ },
  onHide()             { /* 切走 */ },
  onUnload()           { /* 销毁 */ },

  onPullDownRefresh()  { tt.stopPullDownRefresh(); },  // 需在 json 开启
  onReachBottom()      { /* 触底 */ },
  onShareAppMessage()  { return { title: '...', path: '...' }; },

  increment() {
    this.setData({ count: this.data.count + 1 });
  },
});
```

- `setData` 是**异步**的，不要读 `this.data` 之后立刻期望同步更新
- 首屏请求建议放在 `onLoad`，依赖返回的 UI 数据用 `setData` 刷新

## 自定义组件

```js
// components/my-card/my-card.js
Component({
  properties: {
    title: { type: String, value: '' },
    count: { type: Number, value: 0, observer(newV, oldV) { /* 属性变化 */ } },
  },
  data: { inner: 0 },
  methods: {
    onTap() {
      this.triggerEvent('change', { value: this.data.inner }, { bubbles: true });
    },
  },
  observers: {
    'count, inner': function (c, i) { /* 数据监听器 */ },
  },
  lifetimes: {
    created()  {},
    attached() {},   // 插入页面节点树，**能拿到 this.data / properties**
    ready()    {},   // 初次渲染完成
    moved()    {},
    detached() {},
  },
  pageLifetimes: {
    show() {}, hide() {}, resize() {},
  },
  relations: {
    '../my-form/my-form': {
      type: 'parent',
      linked(target) {},
    },
  },
  behaviors: ['wx://form-field'],
  externalClasses: ['custom-class'],
});
```

```json
// my-card.json
{ "component": true, "usingComponents": {} }
```

```html
<!-- 在页面使用 -->
<my-card title="标题" bind:change="onChange">
  <view slot="header">插槽内容</view>
</my-card>
```

要点：
- **多 slot** 需在 `Component({ options: { multipleSlots: true } })` 开启，然后 `<slot name="header" />`
- `triggerEvent(name, detail, opts)` 中 `opts.bubbles` / `composed` / `capturePhase` 控制事件传播
- `properties` 的 `observer` 在属性赋值后触发；**`observers` 支持监听 data 子字段**（`'list[0].name'` / `'obj.**'`）

## 路由

```js
// 跳转到非 tabBar 页，入栈
tt.navigateTo({ url: '/pages/detail/detail?id=1' });

// 替换当前页
tt.redirectTo({ url: '/pages/login/login' });

// 切换 tab（只能切 tabBar 配置过的页）
tt.switchTab({ url: '/pages/mine/mine' });

// 返回，默认 delta=1
tt.navigateBack({ delta: 1 });

// 关闭所有页面并打开目标（清栈）
tt.reLaunch({ url: '/pages/index/index' });
```

- **页面栈最多 10 层**，超过 `navigateTo` 会失败，常见做法改用 `redirectTo` 或 `reLaunch`
- URL 以 `/` 开头为绝对路径；query 会进入目标页 `onLoad(options)` 的参数
- 跳转 tabBar 必须用 `switchTab`，用 `navigateTo` 跳会报错

## 与微信小程序差异（迁移速查）

| 维度 | 微信 | 抖音 |
|---|---|---|
| 模板文件 | `.wxml` | `.ttml` |
| 样式文件 | `.wxss` | `.ttss` |
| 指令前缀 | `wx:for` / `wx:if` | `tt:for` / `tt:if` |
| API 命名空间 | `wx.*` | `tt.*`（大多 API 名称对齐） |
| 登录凭证 | `wx.login` 换 openid | `tt.login` 换 anonymous_code，换 openid 走抖音开放平台 |
| 分享 | 支持朋友圈/群 | 分享到抖音 IM / 发视频，参数有差异 |
| `nextTick` | `wx.nextTick` 可用 | **不支持** |
| `getOpenerEventChannel` | 支持 | **不支持**，页面间通信用 `getCurrentPages()` 或全局事件总线 |
| 自定义组件多层嵌套 | 稳定 | **历史版本存在 bug**（4 层以上 slot/事件有概率失效），复杂结构需测试验证 |
| `usingComponents` 动态注入 | 支持 | 有限支持 |

迁移建议：优先替换后缀与指令，然后批量把 `wx.` 替换为 `tt.`，逐页回归 `onShareAppMessage`、登录、支付等业务链路。

## 基础库与兼容

```js
// 运行时特性检测
if (tt.canIUse('getUserInfo.object.success.userInfo')) { /* ... */ }

// 基础库版本
const { SDKVersion } = tt.getSystemInfoSync();
```

- 开发时在 `project.config.json` 中配置 `libVersion` 锁定调试基础库
- 重大 breaking 多出现在 2.x：如登录信息返回结构调整、API Promise 化、组件 `slot` 行为修正——发版前看官方 `CHANGELOG`

## 常见陷阱

- `setData` 一次 payload 过大（> 256KB）会报错，大列表分片 `setData`
- `data` 中不要塞非序列化对象（函数、Symbol、Date 实例），渲染层拿到的会失真
- `tt:for` 的 `tt:key` 写 `*this` 只适合列表项本身是基本类型
- 页面 `json` 里引用的 `usingComponents` 路径相对当前 json，**不是**相对 ttml
- TTSS 中 `rpx` 在极宽屏可能溢出，关键布局用 `flex` + `rpx` 组合而非硬编码
- `tt.request` 默认超时继承 `app.json networkTimeout.request`，未配置时为 60s，上传大文件建议单独调长

## 组合提示

配合 `douyin-mp-api`（`tt.*` API 清单与数据/存储/网络/媒体用法）和 `douyin-mp-components`（内置组件 view/button/scroll-view/input 等）形成完整知识闭环。迁移项目时优先阅读本篇"与微信差异"一节。
