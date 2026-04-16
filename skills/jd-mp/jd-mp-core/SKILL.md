---
name: jd-mp-core
description: "京东小程序框架核心：项目结构、JXML/JXSS/JDS、生命周期、自定义组件、路由、与微信差异。"
tech_stack: [jd-miniprogram]
language: [javascript]
---

# 京东小程序 Core（项目骨架与核心约定）

> 来源：https://mp-docs.jd.com/ ；BookStack 镜像 https://www.bookstack.cn/read/mp-jd-20200423/
> 版本基准：2020-04-23 官方文档镜像
> 运行平台：京东 APP、京东金融 APP、京麦 APP

## 用途

建立京东小程序最小可用心智模型。京东小程序与微信小程序在文件扩展名、全局 API 命名空间、能力边界上有系统性差异，**禁止把 wx.* 代码直接抄过来**。

## 何时使用

- 新建京东小程序项目或接手已有项目
- 把微信小程序迁移到京东小程序，需要对照差异清单
- 决定是手写原生还是用 Taro 跨端编译
- 排查 tabBar/路由/网络请求相关的平台兼容问题

## 项目结构

```
my-jdapp/
├── app.js          # 小程序逻辑入口（必须）
├── app.json        # 全局配置（必须）
├── app.jxss        # 全局样式（可选）
├── project.config.json
└── pages/
    └── index/
        ├── index.js    # 页面逻辑（必须）
        ├── index.jxml  # 页面结构（必须）
        ├── index.jxss  # 页面样式（可选）
        └── index.json  # 页面配置（可选）
```

四件套扩展名（与微信对照）：

| 角色 | 京东 | 微信 |
|---|---|---|
| 结构模板 | `.jxml` | `.wxml` |
| 样式 | `.jxss` | `.wxss` |
| 模板脚本 | `.jds` | `.wxs` |
| 逻辑 | `.js` | `.js` |

## app.json 全局配置

```json
{
  "pages": [
    "pages/index/index",
    "pages/detail/detail"
  ],
  "window": {
    "navigationBarTitleText": "我的小程序",
    "navigationBarBackgroundColor": "#ffffff",
    "navigationBarTextStyle": "black",
    "backgroundColor": "#f5f5f5",
    "enablePullDownRefresh": false
  },
  "tabBar": {
    "color": "#999",
    "selectedColor": "#e93b3d",
    "backgroundColor": "#fff",
    "list": [
      { "pagePath": "pages/index/index", "text": "首页", "iconPath": "...", "selectedIconPath": "..." },
      { "pagePath": "pages/mine/mine", "text": "我的", "iconPath": "...", "selectedIconPath": "..." }
    ]
  },
  "networkTimeout": {
    "request": 10000,
    "downloadFile": 10000
  },
  "debug": false
}
```

关键约束：
- `pages[0]` 自动作为启动页
- `tabBar.list` 长度必须为 **2-5**（与微信一致）
- `networkTimeout` 单位毫秒

## JXML 模板

Mustache 数据绑定 `{{ }}`，支持三元、逻辑运算：

```xml
<!-- 条件渲染 -->
<view j:if="{{status === 'ok'}}">成功</view>
<view j:elif="{{status === 'loading'}}">加载中</view>
<view j:else>失败</view>

<!-- 列表渲染 -->
<view j:for="{{list}}" j:key="id">
  {{index}} - {{item.name}}
</view>

<!-- 模板复用 -->
<template name="card">
  <view class="card">{{title}}</view>
</template>
<template is="card" data="{{title: 'Hi'}}" />

<!-- 文件引用 -->
<import src="./tpl.jxml" />
<include src="./header.jxml" />
```

注意指令前缀通常为 `j:`（等同于微信 `wx:`），具体以工具为准。

## JXSS 样式

- 与 CSS 基本兼容
- 支持 `rpx` 单位：**750rpx = 屏幕宽度**，用于多端自适应
- 样式导入：`@import "./common.jxss";`
- 支持局部样式（页面 jxss）与全局样式（`app.jxss`）

## JDS 模板脚本

在模板内做数据格式化计算的独立语言，**不是 JavaScript**（语法子集，不能用 ES6+ 大多数特性，不能调 js 文件里的函数）：

```xml
<jds module="fmt">
  var price = function(n) { return '¥' + n.toFixed(2); }
  module.exports = { price: price };
</jds>

<view>{{ fmt.price(item.price) }}</view>
```

用途：避免把纯展示计算塞进 Page data，减少 setData 开销。

## 事件系统

```xml
<button bindtap="onTap" data-id="{{item.id}}">点击</button>
<view catchtap="onTap">阻止冒泡</view>
```

- `bind*` 绑定但允许冒泡
- `catch*` 绑定并阻止冒泡
- 常见事件：`tap`、`touchstart/move/end`、`input`、`change`、`submit`、`longpress`

事件回调接收 `e`，`e.currentTarget.dataset` 取 `data-*` 参数。

## App 生命周期（app.js）

```js
App({
  onLaunch(options) {
    // 启动，仅一次；options.path / options.query / options.scene
  },
  onShow(options) { /* 前台 */ },
  onHide() { /* 后台 */ },
  onError(err) { /* 脚本错误 */ },
  onPageNotFound(res) { /* 页面不存在，可 jd.redirectTo 兜底 */ },
  globalData: {}
});
```

`getApp()` 取全局 App 实例。

## Page 生命周期（pages/*.js）

```js
Page({
  data: { count: 0 },

  onLoad(query) { /* 首次加载，query 来自路由参数 */ },
  onShow() { /* 每次展示 */ },
  onReady() { /* 首次渲染完成，仅一次 */ },
  onHide() { /* 被切走 */ },
  onUnload() { /* 关闭/重定向 */ },

  // 下拉刷新 / 触底 / 滚动
  onPullDownRefresh() {},
  onReachBottom() {},
  onPageScroll(e) {},

  // 分享（用户点右上角菜单时触发）
  onShareAppMessage() {
    return { title: '标题', path: 'pages/index/index?from=share' };
  },

  onTap() {
    this.setData({ count: this.data.count + 1 });
  }
});
```

`setData` 是唯一合法的数据更新方式，**不要直接赋值 `this.data.x = ...`**。

## 自定义组件

```js
// components/card/index.js
Component({
  properties: {
    title: { type: String, value: '' }
  },
  data: { clicked: false },
  methods: {
    onTap() { this.triggerEvent('select', { id: 1 }); }
  },
  lifetimes: {
    created() {},
    attached() {},
    ready() {},
    detached() {}
  },
  pageLifetimes: {
    show() {},
    hide() {}
  }
});
```

页面 json 引入：

```json
{ "usingComponents": { "card": "/components/card/index" } }
```

## 路由 API

```js
jd.navigateTo({ url: '/pages/detail/detail?id=1' }); // 压栈，最大 10 层
jd.redirectTo({ url: '/pages/a/a' });                // 替换当前
jd.switchTab({ url: '/pages/tab/tab' });             // 切 tabBar 页（不能带 query）
jd.navigateBack({ delta: 1 });                        // 返回
jd.reLaunch({ url: '/pages/home/home' });             // 关闭所有并打开
```

URL 查询参数由目标页 `onLoad(query)` 接收。

## 与微信的关键差异

| 维度 | 京东小程序 | 微信小程序 |
|---|---|---|
| 模板文件 | `.jxml` | `.wxml` |
| 样式文件 | `.jxss` | `.wxss` |
| 模板脚本 | `.jds` | `.wxs` |
| 全局 API | `jd.*` | `wx.*` |
| 主包体积 | **5 MB** | 2 MB |
| 并发请求 | **5 个** | 10 个 |
| Canvas | **不支持** | 支持（2D/WebGL） |
| 插件体系 | **不支持** | 支持 |
| npm | **不支持原生 npm** | 支持（需构建） |
| 云开发 | 无 | 支持 |
| 跨端方案 | 官方推荐 **Taro** | Taro / uni-app |

迁移 checklist：
1. 文件扩展名批量改名 `.wxml → .jxml`、`.wxss → .jxss`、`.wxs → .jds`
2. 代码内 `wx.` 全局替换为 `jd.`
3. 指令 `wx:if / wx:for` → `j:if / j:for`（以工具为准）
4. 主包体积如超过 2 MB 但小于 5 MB，无需拆分；反之仍需分包
5. 涉及 Canvas/插件/云开发的功能需改造或降级
6. 若项目复杂，直接改用 Taro 从微信端编译到京东端

## 常见陷阱

- **JDS 能力受限**：不要在里面写 ES6 class、async、Promise；它只做纯数据变换
- **setData 性能**：大对象频繁 setData 会卡 UI，按需拆字段、用路径（`'list[0].name'`）
- **switchTab 不接 query**：tabBar 页传参只能靠 globalData 或 storage
- **navigateTo 栈上限 10 层**：超出会静默失败，长流程需配合 redirectTo
- **rpx 基于 750 设计稿**：iPhone 6 宽度 375px 时 1rpx = 0.5px
- **京东 APP 环境差异**：京东主 APP、京东金融 APP、京麦 APP 内能力可能不完全一致，关键功能需三端实机验证

## 组合提示

配合 `jd-mp-api`（jd.* API 清单）、`jd-mp-components`（内置组件）形成最小闭环。跨端开发首选 Taro，可另行加载 `taro-core` skill。从微信迁移时并行加载 `wechat-mp-core` 做对照。
