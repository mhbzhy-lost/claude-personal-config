---
name: wechat-mp-core
description: "微信小程序框架核心：项目结构、配置、WXML/WXSS/WXS、事件系统、生命周期、自定义组件、路由。"
tech_stack: [wechat-miniprogram]
language: [javascript]
capability: [native-lifecycle, native-navigation, ui-layout, ui-action]
---

# 微信小程序框架核心（Core）

> 来源：https://developers.weixin.qq.com/miniprogram/dev/framework/
> 版本基准：基础库 2.x / 3.x，开发者工具 Stable。

## 用途

掌握微信小程序的项目骨架、配置体系、模板语法、事件机制、生命周期、自定义组件与路由导航，覆盖日常开发 80% 的框架层知识。

## 何时使用

- 新建小程序或接手老项目，快速建立目录与约定心智
- 编写页面模板、处理用户交互事件
- 创建可复用的自定义组件（含 slot / behaviors / relations）
- 实现页面间导航、参数传递、跨页通信
- 配置 tabBar、分包、按需注入、权限弹窗等全局项

---

## 1. 项目结构

```
my-app/
├── app.js              # 小程序入口（App 实例，全局只有一个）
├── app.json            # 全局配置（必须）
├── app.wxss            # 全局样式（可选）
├── project.config.json # 开发者工具配置（自动生成）
├── sitemap.json        # 搜索索引配置
├── pages/
│   ├── index/
│   │   ├── index.js    # 页面逻辑（Page 实例）
│   │   ├── index.wxml  # 页面模板（必须）
│   │   ├── index.wxss  # 页面样式（可选）
│   │   └── index.json  # 页面配置（可选）
│   └── logs/
│       └── ...
├── components/         # 自定义组件（约定目录）
│   └── my-comp/
│       ├── my-comp.js
│       ├── my-comp.wxml
│       ├── my-comp.wxss
│       └── my-comp.json
└── utils/
    └── util.js
```

**页面/组件四件套**：`.js` + `.wxml` + `.wxss` + `.json` 四个**同名文件**，引用路径不写扩展名，框架自动补全。

---

## 2. 全局配置 app.json

```json
{
  "pages": [
    "pages/index/index",
    "pages/logs/logs"
  ],
  "window": {
    "navigationBarBackgroundColor": "#ffffff",
    "navigationBarTitleText": "小程序",
    "navigationBarTextStyle": "black",
    "backgroundColor": "#eeeeee",
    "backgroundTextStyle": "light",
    "enablePullDownRefresh": false
  },
  "tabBar": {
    "color": "#999",
    "selectedColor": "#333",
    "backgroundColor": "#fff",
    "list": [
      { "pagePath": "pages/index/index", "text": "首页",
        "iconPath": "images/home.png", "selectedIconPath": "images/home-active.png" },
      { "pagePath": "pages/logs/logs", "text": "日志",
        "iconPath": "images/logs.png", "selectedIconPath": "images/logs-active.png" }
    ]
  },
  "networkTimeout": {
    "request": 10000,
    "connectSocket": 10000,
    "uploadFile": 10000,
    "downloadFile": 10000
  },
  "permission": {
    "scope.userLocation": { "desc": "你的位置信息将用于小程序定位" }
  },
  "subpackages": [
    { "root": "packageA", "name": "pkgA",
      "pages": ["pages/cat/cat", "pages/dog/dog"] }
  ],
  "preloadRule": {
    "pages/index/index": { "network": "all", "packages": ["pkgA"] }
  },
  "lazyCodeLoading": "requiredComponents",
  "style": "v2",
  "sitemapLocation": "sitemap.json"
}
```

**关键字段速查**：

| 字段 | 作用 | 备注 |
|------|------|------|
| `pages` | 页面路径列表 | **第一项为首页**，路径不含扩展名 |
| `window` | 全局默认窗口表现 | 导航栏/下拉刷新/背景色等 |
| `tabBar` | 底部 Tab 栏 | `list` 最少 2 项、最多 5 项 |
| `networkTimeout` | 各类网络请求超时（ms） | 覆盖默认 60s，避免等待过久 |
| `permission` | 接口权限描述 | 弹窗的说明文字（scope.userLocation 等） |
| `subpackages` | 分包配置 | 主包 2MB，单个分包 2MB，总包 20MB |
| `preloadRule` | 分包预下载 | 进入指定页时预载目标分包 |
| `lazyCodeLoading` | 按需注入 | 设为 `"requiredComponents"` 显著减少启动时间 |
| `style` | 基础组件样式版本 | `"v2"` 为新版 WeUI 风格 |

**`lazyCodeLoading: "requiredComponents"`**：启用后仅加载当前页所需 JS/组件代码，降低启动耗时；要求基础库 2.11.1+。

---

## 3. 页面配置 page.json

页面 `.json` 可覆盖 `app.json` 中 `window` 的同名字段，但**无需写 `window` 键**，字段直接平铺：

```json
{
  "navigationBarTitleText": "日志详情",
  "enablePullDownRefresh": true,
  "onReachBottomDistance": 100,
  "usingComponents": {
    "my-comp": "/components/my-comp/my-comp",
    "van-button": "@vant/weapp/button/index"
  }
}
```

**注意**：页面 JSON 只能配置 window 相关字段 + `usingComponents`，不能配置 `pages`、`tabBar` 等全局项。

---

## 4. WXML 模板语法

### 数据绑定

```html
<!-- 双花括号内为表达式，支持简单运算/三元 -->
<view>{{ message }}</view>
<view>{{ a + b }}</view>
<view>{{ flag ? '是' : '否' }}</view>

<!-- 属性绑定也要花括号 -->
<view id="item-{{ id }}">动态 id</view>
<view hidden="{{ isHidden }}">条件隐藏</view>

<!-- 高频陷阱：布尔属性不加花括号会被当作字符串 "false"（truthy） -->
<checkbox checked="{{ false }}" /> <!-- 正确 -->
<!-- <checkbox checked="false" />     错误，实际为勾选 -->
```

### 列表渲染 wx:for

```html
<!-- 默认变量 item / index -->
<view wx:for="{{ list }}" wx:key="id">
  {{ index }}: {{ item.name }}
</view>

<!-- 自定义变量名 -->
<view wx:for="{{ list }}" wx:for-item="user" wx:for-index="idx" wx:key="id">
  {{ idx }}: {{ user.name }}
</view>

<!-- wx:key 取值：item 的属性名 / *this（item 本身即唯一 string|number） -->
<view wx:for="{{ ['A','B','C'] }}" wx:key="*this">{{ item }}</view>
```

### 条件渲染 wx:if

```html
<view wx:if="{{ score >= 90 }}">优秀</view>
<view wx:elif="{{ score >= 60 }}">及格</view>
<view wx:else>不及格</view>

<!-- block 不渲染真实节点，仅做逻辑分组 -->
<block wx:if="{{ showDetail }}">
  <view>详情标题</view>
  <view>详情内容</view>
</block>
```

**`wx:if` vs `hidden`**：`wx:if` 惰性，切换时销毁/重建；`hidden` 始终渲染只是 `display:none`。频繁切换用 `hidden`，条件很少改变用 `wx:if`。

### template 模板

```html
<!-- 定义 -->
<template name="userCard">
  <view class="card">
    <text>{{ name }}</text>
    <text>{{ age }}岁</text>
  </view>
</template>

<!-- 使用：data 传入对象，展开成模板作用域 -->
<template is="userCard" data="{{ ...userInfo }}" />

<!-- 动态模板名 -->
<template is="{{ templateName }}" data="{{ ...item }}" />
```

### import 与 include

```html
<!-- import：只引入目标文件的 <template>，不递归（import 不具有传递性） -->
<import src="templates/card.wxml" />
<template is="userCard" data="{{ ...user }}" />

<!-- include：将目标文件除 <template>/<wxs> 外的全部内容拷贝到当前位置 -->
<include src="header.wxml" />
<view>页面主体</view>
<include src="footer.wxml" />
```

---

## 5. WXSS 样式

### rpx 响应式单位

```css
/* 规定：750rpx === 屏幕宽度 */
/* iPhone 6（375px 屏）：1rpx = 0.5px */
.container {
  width: 750rpx;    /* 满屏宽 */
  padding: 20rpx;
  font-size: 28rpx; /* ≈ 14px @iPhone6 */
}
```

### @import 导入

```css
/* 相对路径导入另一个 wxss */
@import "common.wxss";
.page { color: #333; }
```

### 选择器限制

| 支持 | 不支持 / 受限 |
|------|--------------|
| `.class` / `#id` / `element` | `*` 通配符 |
| `::after` / `::before` | 属性选择器部分支持（2.x+） |
| 后代 `.a .b` / 子代 `.a > .b` | 复杂组合器行为不稳定 |
| 媒体查询（部分） | 不支持外部字体 url 引用 `@font-face`（需 `wx.loadFontFace`） |

**组件样式隔离**：自定义组件的 wxss 默认只对组件内生效，不影响外部，通过 `styleIsolation` 调整（见第 10 节）。

---

## 6. WXS 脚本

WXS（WeiXin Script）是小程序自有脚本语言，**运行在视图层**，不经过逻辑层通信，适合模板内的纯数据格式化/计算。

```html
<!-- 内联 WXS -->
<wxs module="fmt">
  module.exports.price = function(val) {
    return '¥' + (val / 100).toFixed(2);
  }
</wxs>
<view>{{ fmt.price(item.priceInCents) }}</view>

<!-- 外部 WXS 文件 -->
<wxs module="utils" src="./utils.wxs" />
<view>{{ utils.formatDate(timestamp) }}</view>
```

```javascript
// utils.wxs
var formatDate = function(ts) {
  var d = getDate(ts);  // 必须用 getDate() 代替 new Date()
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}
module.exports = { formatDate: formatDate };
```

**WXS 硬约束**：

- **不是 JS**，语法是 ES5 子集：无箭头函数、无 `let/const`、无解构、无 class
- **不能**调用 `wx.xxx` API
- `Date` 必须用函数 `getDate()`，正则必须用函数 `getRegExp(pattern, flags)`，字面量 `new Date()` / `/abc/g` 都不支持
- iOS 上 WXS 相比跨线程 setData 触发的 JS 执行快 **2-20 倍**，长列表/滚动动画中优先 WXS
- 同一 WXML 文件中 `module` 名不能重复

---

## 7. 事件系统

### 绑定方式

```html
<!-- bind：冒泡 -->
<view bindtap="onOuterTap">
  <button bindtap="onButtonTap">点击</button>
</view>
<!-- 点击 button：先 onButtonTap，再冒泡到 onOuterTap -->

<!-- catch：阻止冒泡 -->
<view bindtap="onOuterTap">
  <button catchtap="onButtonTap">点击</button>
</view>

<!-- mut-bind：互斥绑定，同一冒泡路径上只触发一个 mut-bind，但不影响 bind/catch -->
<view mut-bind:tap="onOuterTap">
  <button mut-bind:tap="onButtonTap">点击</button>
</view>

<!-- capture-bind / capture-catch：捕获阶段 -->
<view capture-bind:tap="onCapture" bindtap="onBubble">
  <button bindtap="onButtonTap">点击</button>
</view>
<!-- 顺序：onCapture -> onButtonTap -> onBubble -->
```

**写法等价**：`bindtap` 与 `bind:tap` 相同，冒号写法更清晰；推荐后者。

### 事件对象

```javascript
Page({
  onButtonTap(e) {
    e.type          // "tap"
    e.timeStamp     // 事件时间戳
    e.target        // 触发事件的源组件
    e.currentTarget // 当前处理事件的组件（绑定 handler 的那个）
    e.detail        // 额外信息，如 input 的 { value }
    e.touches       // 触摸事件列表（touch* 类）
  }
})
```

### dataset 传参

```html
<view bindtap="onItemTap"
      data-id="{{ item.id }}"
      data-user-name="{{ item.name }}">
  {{ item.name }}
</view>
```

```javascript
onItemTap(e) {
  // 连字符自动转驼峰
  e.currentTarget.dataset.id       // item.id
  e.currentTarget.dataset.userName // item.name（user-name -> userName）
}
```

**陷阱**：dataset 只取自 `e.currentTarget` 即当前绑定组件；全大写会被 lowercase，不要用 `data-USER-ID`。

### mark 传参（基础库 2.7.1+）

```html
<!-- mark 会沿冒泡路径合并所有组件的 mark -->
<view mark:outerKey="outerVal" bindtap="onTap">
  <button mark:innerKey="innerVal" bindtap="onTap">点击</button>
</view>
```

```javascript
onTap(e) {
  e.mark // { innerKey: "innerVal", outerKey: "outerVal" }
}
```

**mark vs dataset**：dataset 仅当前节点；mark 合并整条路径。

### 常见事件分类

| 类型 | 冒泡 | 说明 |
|------|------|------|
| `tap` | 是 | 手指触摸后离开 |
| `longpress` | 是 | 超过 350ms，触发后 tap 不再触发 |
| `touchstart/move/end/cancel` | 是 | 触摸事件 |
| `input` | 否 | 输入框输入，`e.detail.value` |
| `submit` | 否 | 表单提交 |
| `scroll` | 否 | scroll-view 滚动 |

---

## 8. App 生命周期

```javascript
// app.js
App({
  onLaunch(options) {
    // 小程序初始化（冷启动时全局只触发一次）
    // options.scene —— 场景值（1001/1005/…），用于统计来源
    // options.query —— 启动参数
    console.log('场景值:', options.scene)
  },
  onShow(options) {
    // 小程序进入前台（冷启动 onLaunch 之后，以及从后台回前台）
  },
  onHide() {
    // 小程序从前台进入后台（被切走/锁屏）
  },
  onError(msg) {
    // 脚本错误或 API 调用失败，做上报
  },
  onPageNotFound(res) {
    // 打开的页面不存在 —— 兜底跳转
    wx.redirectTo({ url: '/pages/index/index' })
  },
  onThemeChange({ theme }) {
    // 系统主题变更：'dark' | 'light'
  },

  // 全局数据（所有页面/组件共享）
  globalData: { userInfo: null }
})

// 其他文件获取 App 实例
const app = getApp()
console.log(app.globalData.userInfo)
```

---

## 9. Page 生命周期

```javascript
Page({
  data: { list: [], loading: false },

  // ===== 生命周期 =====
  onLoad(options) {
    // 页面加载（只触发一次），options 为路由参数
    // navigateTo('...?id=123') -> options.id === "123"
    this.loadData(options.id)
  },
  onShow()    { /* 每次进入都触发，含从后台返回 */ },
  onReady()   { /* 页面初次渲染完成（只触发一次），此后可用 createSelectorQuery */ },
  onHide()    { /* 页面被 navigateTo 切走或小程序切后台 */ },
  onUnload()  { /* 页面 redirectTo / navigateBack 时销毁 */ },

  // ===== 页面事件处理 =====
  onPullDownRefresh() {
    // 需页面 json 开启 enablePullDownRefresh: true
    this.loadData().then(() => wx.stopPullDownRefresh())
  },
  onReachBottom() {
    // 触底加载更多（距离受 onReachBottomDistance 控制）
    if (!this.data.loading) this.loadMore()
  },
  onShareAppMessage(res) {
    // 右上角菜单 / <button open-type="share"> 点击触发
    return {
      title: '分享标题',
      path: '/pages/index/index?from=share',
      imageUrl: '/images/share.png' // 可选，默认页面截图
    }
  },
  onShareTimeline() {
    // 分享到朋友圈（Android + iOS 均支持，基础库 2.11.3+）
    return { title: '朋友圈标题', query: 'from=timeline' }
  },
  onPageScroll(e) {
    // 频繁触发，非必要不要绑定（绑了会触发视图->逻辑层通信）
    // e.scrollTop
  },
  onTabItemTap(item) {
    // 点击当前 tabBar tab（含再次点击已激活 tab）
    // item.index / item.pagePath / item.text
  },

  // ===== 自定义方法 =====
  loadData(id) {
    this.setData({ loading: true })
    return wx.request({ /* ... */ })
  }
})
```

**首次进入页面**：`onLoad` -> `onShow` -> `onReady`；**再次回到页面**：仅 `onShow`。

### setData 性能要点

- `setData` 同步更新 `this.data`，异步批量触发视图更新
- 每次 `setData` 都会把数据序列化跨线程发送到视图层，**高频 / 大数据量会卡顿**
- 支持路径写法，避免整对象替换：
  ```javascript
  this.setData({
    'list[0].name': '新名字',
    'obj.a.b': 1
  })
  ```
- 单次 `setData` 数据量建议 **< 256KB**
- 不要直接赋值 `this.data.xxx =`，视图不会更新

---

## 10. 自定义组件

### 基本结构

```json
// components/my-comp/my-comp.json
{ "component": true, "usingComponents": {} }
```

```javascript
// components/my-comp/my-comp.js
Component({
  options: {
    multipleSlots: true,
    styleIsolation: 'isolated'  // 默认；也可 'apply-shared' / 'shared'
  },

  // ===== 外部传入 =====
  properties: {
    title: { type: String, value: '默认标题' },
    count: { type: Number, value: 0 },
    list:  { type: Array,  value: [] }
  },

  // ===== 组件内部数据 =====
  data: { innerFlag: false },

  // ===== 数据监听器（基础库 2.6.1+） =====
  observers: {
    'count'(newVal)       { /* count 变化 */ },
    'list.**'(newList)    { /* 深度监听（包括 setData 路径写法触发） */ },
    'a, b'(aVal, bVal)    { this.setData({ sum: aVal + bVal }) },
    // 注意：组件初始化时 observers 会以初始值触发一次，避免副作用
  },

  // ===== 方法 =====
  methods: {
    onTap() {
      this.setData({ innerFlag: true })
      // 触发自定义事件通知父组件
      this.triggerEvent('change', { value: this.data.count + 1 })
    },
    // 公开方法：父组件 selectComponent('#myComp').doSomething()
    doSomething() { /* ... */ }
  },

  // ===== 组件生命周期 =====
  lifetimes: {
    created()  { /* 实例创建，不能 setData */ },
    attached() { /* 进入页面节点树（最常用，可 setData/发请求） */ },
    ready()    { /* 布局完成 */ },
    moved()    { /* 节点被移动到另一位置 */ },
    detached() { /* 从节点树移除，清理定时器 */ }
  },

  // ===== 所在页面的生命周期 =====
  pageLifetimes: {
    show()       { /* 页面 onShow 时 */ },
    hide()       { /* 页面 onHide 时 */ },
    resize(size) { /* 页面尺寸变化 */ }
  }
})
```

### 使用组件

```json
// pages/index/index.json
{ "usingComponents": { "my-comp": "/components/my-comp/my-comp" } }
```

```html
<my-comp title="自定义标题" count="{{ num }}" bind:change="onCompChange" />
```

```javascript
Page({
  data: { num: 0 },
  onCompChange(e) { this.setData({ num: e.detail.value }) }
})
```

### slot 插槽

```html
<!-- 单 slot（默认） -->
<view class="wrapper"><slot /></view>

<!-- 多 slot：需组件 options.multipleSlots = true -->
<view class="wrapper">
  <slot name="header" />
  <view class="content"><slot /></view>
  <slot name="footer" />
</view>
```

```html
<!-- 使用多 slot -->
<my-comp>
  <view slot="header">头部</view>
  <view>默认内容</view>
  <view slot="footer">底部</view>
</my-comp>
```

### behaviors（混入复用）

```javascript
// behaviors/pagination.js
module.exports = Behavior({
  data: { page: 1, hasMore: true },
  methods: {
    nextPage() { this.setData({ page: this.data.page + 1 }) }
  }
})

// 使用
const pagination = require('../../behaviors/pagination')
Component({
  behaviors: [pagination]   // data / methods / lifetimes 会按规则合并
})
```

### relations（组件关系）

```javascript
// 父组件
Component({
  relations: {
    './child-comp': {
      type: 'child',  // 或 'descendant'（任意后代）
      linked(target)   { /* 子组件 attached 时触发 */ },
      unlinked(target) { /* 子组件 detached 时触发 */ }
    }
  }
})

// 子组件 —— 双向声明才生效
Component({
  relations: {
    './parent-comp': {
      type: 'parent',  // 或 'ancestor'
      linked(target) { /* 建立关系时触发 */ }
    }
  }
})

// 父组件收集子组件实例
// this.getRelationNodes('./child-comp') -> [childInstance, ...]
```

### styleIsolation 样式隔离

| 值 | 含义 |
|----|------|
| `isolated`（默认） | 完全隔离：组件与外部样式互不影响 |
| `apply-shared` | 页面 wxss 影响组件，组件 wxss 不影响页面 |
| `shared` | 双向影响（谨慎使用，容易样式污染） |

---

## 11. 路由与页面栈

### 栈规则

- 页面栈**最多 10 层**，栈满后 `navigateTo` 静默失败
- `getCurrentPages()` 返回当前栈数组，末位是栈顶（当前页）

### 五大 API 对比

| API | 作用 | 页面栈变化 | 能否跳 tabBar | url 是否可带参数 |
|-----|------|-----------|--------------|----------------|
| `wx.navigateTo` | 保留当前页，进新页 | 入栈 +1 | 否 | 是 |
| `wx.redirectTo` | 关闭当前页，跳新页 | 替换栈顶 | 否 | 是 |
| `wx.navigateBack` | 返回前 N 页 | 出栈 -N | 否 | — |
| `wx.switchTab`  | 跳到 tabBar 页 | 清除所有非 tab 页 | 是（仅 tab 页） | **否** |
| `wx.reLaunch`   | 关闭所有页，跳任意页 | 清空重建 | 是 | 是 |

### 常用示例

```javascript
// 跳转并传参
wx.navigateTo({
  url: '/pages/detail/detail?id=123&type=news',
  fail(err) { console.error('跳转失败', err) }
})

// 目标页接收
Page({
  onLoad(options) {
    options.id   // "123"
    options.type // "news"
  }
})

// 返回
wx.navigateBack({ delta: 1 })

// 返回前给上一页塞数据（旧写法）
const pages = getCurrentPages()
const prev  = pages[pages.length - 2]
prev.setData({ selectedItem: item })
wx.navigateBack()

// 切 Tab（url 不能带参数！）
wx.switchTab({ url: '/pages/index/index' })

// 重启到登录页
wx.reLaunch({ url: '/pages/login/login' })
```

### EventChannel 跨页面通信（基础库 2.7.3+）

推荐替代"操作上一页 setData"的脏写法，形成双向通道。

```javascript
// 发起页
wx.navigateTo({
  url: '/pages/picker/picker',
  events: {
    selected(data) { console.log('用户选了:', data.item) }
  },
  success(res) {
    res.eventChannel.emit('init', { defaultId: 1 })
  }
})

// 目标页（picker）
Page({
  onLoad() {
    const channel = this.getOpenerEventChannel()
    channel.on('init', (data) => console.log(data.defaultId))
    // 用户选择后回传
    channel.emit('selected', { item: { id: 2, name: '选项B' } })
  }
})
```

### `<navigator>` 组件（声明式导航）

```html
<navigator url="/pages/detail/detail?id=123" open-type="navigate">跳转详情</navigator>
<navigator url="/pages/index/index"         open-type="switchTab">回到首页</navigator>
<navigator open-type="navigateBack" delta="1">返回</navigator>
```

---

## 12. 高频陷阱

1. **setData 性能**：单次 < 256KB；避免 `onPageScroll` 中频繁 setData；用路径增量更新
2. **页面栈溢出**：10 层上限；列表->详情->再列表 的深层场景用 `redirectTo` 替代
3. **switchTab 不能传参**：必须走 globalData / EventChannel / Storage
4. **WXML 布尔陷阱**：`checked="false"` 实为 truthy，必须 `checked="{{ false }}"`
5. **`wx:key` 必须写**：不写会警告，列表更新性能差且状态错位
6. **WXS 不是 JS**：无 ES6、无 `wx.*`、日期用 `getDate()`、正则用 `getRegExp()`
7. **组件 `created` 中不能 setData**：节点树还没建好，放 `attached` 或之后
8. **`relations` 双向声明**：父子双方路径互相对应才生效
9. **`observers` 初始触发**：组件初始化时会用 data 初值跑一次，注意避免副作用
10. **包大小**：主包 / 单分包 2MB，总包 20MB；图片等用 CDN
11. **样式限制**：不支持 `*` 通配、复杂组合器受限；外部字体用 `wx.loadFontFace` 而非 `@font-face url()`
12. **API 兼容**：`wx.canIUse('API名')` 先判断可用性，避免低版本基础库报错

---

## 13. 兼容性速查

| 特性 | 最低基础库 |
|------|-----------|
| `Component` 构造器 | 1.6.3 |
| `observers` 数据监听器 | 2.6.1 |
| `mark` 自定义标记 | 2.7.1 |
| `EventChannel` | 2.7.3 |
| `lazyCodeLoading` 按需注入 | 2.11.1 |
| `onShareTimeline` 朋友圈分享 | 2.11.3 |

---

## 组合提示

- **网络 / 存储 / 媒体 API**：见 `wechat-mp-api`（wx.request / wx.login / wx.getStorage 等）
- **内置组件**：见 `wechat-mp-components`（view / scroll-view / swiper / input / button ...）
- **高级能力**：见 `wechat-mp-advanced`（分包、插件、主题、性能优化、开放能力）
- **云开发**：见 `wechat-mp-cloud`（数据库、云函数、云存储）
- **UI 组件库**：WeUI 官方、Vant Weapp、iView Weapp
- **状态管理**：MobX-miniprogram（官方推荐）、或 globalData + EventChannel 原生方案
- **跨端**：uni-app / Taro（多一层编译，调试链变长，按需选用）
