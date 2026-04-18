---
name: alipay-mp-core
description: "支付宝小程序框架核心：项目结构、AXML/ACSS/SJS、生命周期、自定义组件、路由、与微信差异。"
tech_stack: [alipay-miniprogram]
language: [javascript]
capability: [native-lifecycle, routing, native-navigation]
---

# 支付宝小程序核心框架

> 来源：https://opendocs.alipay.com/mini/framework/overview
> 辅助参考：https://www.bookstack.cn/read/alipay-mini/
> 版本基准：支付宝小程序基础库 2.x，小程序开发者工具（IDE）最新版。

## 用途

掌握支付宝小程序的项目骨架、模板语法、样式系统、生命周期、自定义组件和路由导航，能独立开发完整的支付宝小程序页面。

## 何时使用

- 新建支付宝小程序项目或接手已有项目需要搞懂目录约定
- 编写页面模板（AXML）和样式（ACSS）
- 处理页面/组件生命周期逻辑
- 创建自定义组件并实现组件通信
- 从微信小程序迁移到支付宝小程序

## 项目结构

```
my-alipay-app/
├── app.js              # 应用入口，App() 注册
├── app.json            # 全局配置（页面路径、窗口、tabBar）
├── app.acss            # 全局样式
├── pages/
│   ├── index/
│   │   ├── index.js    # Page() 注册
│   │   ├── index.axml  # 页面模板
│   │   ├── index.acss  # 页面样式
│   │   └── index.json  # 页面配置（可覆盖 window 配置）
│   └── detail/
│       ├── detail.js
│       ├── detail.axml
│       ├── detail.acss
│       └── detail.json
├── components/         # 自定义组件（约定目录）
│   └── my-card/
│       ├── my-card.js
│       ├── my-card.axml
│       ├── my-card.acss
│       └── my-card.json
└── mini.project.json   # IDE 项目配置
```

### app.json 最小配置

```json
{
  "pages": [
    "pages/index/index",
    "pages/detail/detail"
  ],
  "window": {
    "defaultTitle": "我的小程序",
    "titleBarColor": "#ffffff"
  },
  "tabBar": {
    "textColor": "#999999",
    "selectedColor": "#1677ff",
    "backgroundColor": "#ffffff",
    "items": [
      { "pagePath": "pages/index/index", "name": "首页", "icon": "icon/home.png", "activeIcon": "icon/home-active.png" },
      { "pagePath": "pages/mine/mine", "name": "我的", "icon": "icon/mine.png", "activeIcon": "icon/mine-active.png" }
    ]
  }
}
```

**注意**：`pages` 数组的第一项为小程序启动页。`tabBar` 的 `items` 至少 2 个、最多 5 个。

## AXML 模板语法

### 数据绑定

```xml
<!-- 文本插值 -->
<view>{{ message }}</view>

<!-- 属性绑定（必须双引号包裹双花括号） -->
<view class="item-{{ index }}">{{ item.name }}</view>

<!-- 布尔属性 -->
<checkbox checked="{{ isChecked }}" />

<!-- 三元表达式 -->
<view>{{ score >= 60 ? '及格' : '不及格' }}</view>
```

### 列表渲染 a:for

```xml
<!-- 基础列表 -->
<view a:for="{{ list }}" a:for-item="item" a:for-index="idx" key="item-{{ idx }}">
  {{ idx }}: {{ item.name }}
</view>

<!-- 简写：默认 item 和 index -->
<view a:for="{{ list }}">
  {{ index }}: {{ item }}
</view>

<!-- 嵌套循环 -->
<view a:for="{{ groups }}" a:for-item="group">
  <view a:for="{{ group.members }}" a:for-item="member">
    {{ member.name }}
  </view>
</view>
```

**key 属性**：`a:for` 必须提供 `key` 以保证列表高效更新。如果列表项有唯一 id，使用 `key="item-{{ item.id }}"`。

### 条件渲染 a:if

```xml
<view a:if="{{ status === 'loading' }}">加载中...</view>
<view a:elif="{{ status === 'error' }}">加载失败</view>
<view a:else>{{ content }}</view>

<!-- block 不渲染真实 DOM，仅做逻辑分组 -->
<block a:if="{{ showDetail }}">
  <view>标题</view>
  <view>内容</view>
</block>
```

`a:if` vs `hidden`：`a:if` 控制是否渲染（切换开销大），`hidden` 控制是否显示（初始渲染开销大）。频繁切换用 `hidden`，条件不常变用 `a:if`。

### template 模板复用

```xml
<!-- 定义模板 -->
<template name="userCard">
  <view class="card">
    <text>{{ name }}</text>
    <text>{{ age }}岁</text>
  </view>
</template>

<!-- 使用模板，data 传入数据 -->
<template is="userCard" data="{{ ...user }}" />
```

### import 与 include

```xml
<!-- import：引入目标文件的 template 定义 -->
<import src="./templates/card.axml" />
<template is="userCard" data="{{ ...user }}" />

<!-- include：将目标文件整体（除 template 定义外）插入当前位置 -->
<include src="./header.axml" />
```

`import` 有作用域：只引入直接定义的 template，不会递归引入。`include` 相当于代码拷贝。

## ACSS 样式

### rpx 单位

```css
/* rpx：响应式像素，750rpx = 屏幕宽度 */
.container {
  width: 750rpx;       /* 满宽 */
  padding: 24rpx;
  font-size: 28rpx;    /* 约 14px（在 375px 宽设备上） */
}
```

换算关系：在 375px 宽设备上，`1rpx = 0.5px`；在 750px 宽设备上，`1rpx = 1px`。

### 样式导入

```css
/* app.acss 或页面 acss */
@import './common.acss';

.page { background: #f5f5f5; }
```

### 选择器支持

支持：`.class`、`#id`、`element`、`::after`、`::before`、`:nth-child()`。
不支持：`*` 通配符选择器、属性选择器 `[attr]`、`>` 直接子代选择器（部分版本已支持）。

**作用域**：页面 acss 只作用于当前页面；组件 acss 默认样式隔离，外部样式不影响组件内部。

## SJS 脚本

SJS（Safe/Sandboxed JavaScript）是运行在视图层的脚本语言，类似微信的 WXS，用于在模板中执行过滤和计算，减少逻辑层与视图层通信。

```javascript
// utils.sjs
function formatPrice(price) {
  return (price / 100).toFixed(2);
}
export default { formatPrice };
```

```xml
<!-- 在 AXML 中引入 -->
<import-sjs name="utils" from="./utils.sjs" />
<view>{{ utils.formatPrice(item.price) }}</view>
```

**限制**：SJS 不能调用小程序 API（`my.*`）、不能修改页面 data、不支持 ES6+ 新语法（如可选链、解构赋值部分受限）。适合纯计算/格式化场景。

## 事件系统

### 事件绑定

```xml
<!-- onTap：冒泡事件 -->
<view onTap="handleTap">点击我</view>

<!-- catchTap：阻止冒泡 -->
<view catchTap="handleTap">点击不冒泡</view>
```

### 事件类型速查

| 事件 | 触发条件 |
|------|----------|
| `onTap` | 手指触摸后马上离开（点击） |
| `onLongTap` | 手指触摸后超过 500ms 离开 |
| `onTouchStart` / `onTouchMove` / `onTouchEnd` | 触摸事件 |
| `onTransitionEnd` / `onAnimationStart` / `onAnimationEnd` | 动画事件 |
| `onChange` / `onInput` / `onFocus` / `onBlur` | 表单事件 |

### 事件对象与数据传递

```xml
<!-- 通过 data-xxx 传递数据 -->
<view data-id="{{ item.id }}" data-name="{{ item.name }}" onTap="handleTap">
  {{ item.name }}
</view>
```

```javascript
Page({
  handleTap(e) {
    // e.target.dataset 获取 data-xxx
    const { id, name } = e.target.dataset;
    console.log(id, name);

    // e.currentTarget：绑定事件的元素（推荐）
    // e.target：触发事件的元素（可能是子元素）
    // e.detail：组件事件的附加数据（如 input 的 value）
  },
});
```

**注意**：`data-xxx` 中的驼峰会被转为全小写。`data-userId` 在 dataset 中变为 `userid`。建议用连字符：`data-user-id`，在 dataset 中自动变为 `userId`。

## App 生命周期

```javascript
// app.js
App({
  onLaunch(options) {
    // 小程序初始化（全局只触发一次）
    // options.query — 启动参数
    // options.path — 启动页面路径
    console.log('启动场景值:', options.scene);
  },
  onShow(options) {
    // 小程序从后台切到前台
  },
  onHide() {
    // 小程序从前台切到后台
  },
  onError(msg) {
    // 脚本错误或 API 调用报错
    console.error('全局错误:', msg);
  },
  // 全局数据
  globalData: {
    userInfo: null,
  },
});
```

获取 App 实例：`const app = getApp();`，然后通过 `app.globalData` 读写全局数据。

## Page 生命周期

```javascript
// pages/index/index.js
Page({
  data: {
    list: [],
    loading: true,
  },

  onLoad(query) {
    // 页面创建（只触发一次）
    // query 为路由参数，如 ?id=123 → query.id === '123'
    this.loadData(query.id);
  },
  onShow() {
    // 页面显示（每次切入前台都触发）
  },
  onReady() {
    // 页面初次渲染完成（只触发一次）
  },
  onHide() {
    // 页面隐藏（navigateTo 或 Tab 切换）
  },
  onUnload() {
    // 页面卸载（redirectTo 或 navigateBack）
  },

  // 页面事件
  onPullDownRefresh() {
    // 下拉刷新（需在 json 中配 "pullRefresh": true）
    this.loadData().then(() => my.stopPullDownRefresh());
  },
  onReachBottom() {
    // 滚动到底部（加载更多）
  },
  onShareAppMessage() {
    // 用户点击右上角分享
    return { title: '分享标题', path: '/pages/index/index' };
  },

  // 自定义方法
  async loadData(id) {
    this.setData({ loading: true });
    const res = await my.request({ url: 'https://api.example.com/data' });
    // 注意：my.request 返回的不是 Promise（旧版），推荐用 my.call 或封装
    this.setData({ list: res.data, loading: false });
  },
});
```

### setData 注意事项

```javascript
// 正确：路径更新，只更新指定字段
this.setData({ 'list[0].name': '新名称' });
this.setData({ 'obj.key': 'value' });

// 避免：一次传入过大的数据（setData 数据会序列化传输到视图层）
// 单次 setData 数据量建议不超过 256KB
```

## 自定义组件

### 组件构造器

```javascript
// components/my-card/my-card.js
Component({
  // 外部传入的属性（类似 React props）
  props: {
    title: '',           // 默认值
    count: 0,
    onAction: (data) => {}, // 事件回调（函数 prop）
  },

  // 组件内部状态
  data: {
    innerCount: 0,
  },

  // 生命周期
  didMount() {
    // 组件挂载完成（类似 React componentDidMount）
    // 可以访问 this.props、this.data、调用 this.setData
    this.setData({ innerCount: this.props.count });
  },
  didUpdate(prevProps, prevData) {
    // props 或 data 变更后触发（类似 React componentDidUpdate）
    if (prevProps.count !== this.props.count) {
      this.setData({ innerCount: this.props.count });
    }
  },
  didUnmount() {
    // 组件卸载（清理定时器等）
  },

  // 组件方法
  methods: {
    handleTap() {
      const next = this.data.innerCount + 1;
      this.setData({ innerCount: next });
      // 通过函数 prop 通知父组件
      this.props.onAction({ count: next });
    },
  },
});
```

### 组件模板

```xml
<!-- components/my-card/my-card.axml -->
<view class="card">
  <text class="title">{{ title }}</text>
  <text>计数: {{ innerCount }}</text>
  <button onTap="handleTap">+1</button>
  <!-- 插槽 -->
  <slot />
</view>
```

### 组件配置与使用

```json
// components/my-card/my-card.json
{ "component": true }
```

```json
// pages/index/index.json（使用方页面）
{
  "usingComponents": {
    "my-card": "/components/my-card/my-card"
  }
}
```

```xml
<!-- pages/index/index.axml -->
<my-card title="标题" count="{{ 5 }}" onAction="handleCardAction">
  <view>这是插槽内容</view>
</my-card>
```

```javascript
// pages/index/index.js
Page({
  handleCardAction(data) {
    console.log('来自组件的数据:', data.count);
  },
});
```

### ref 获取组件实例

```xml
<my-card ref="handleCardRef" />
```

```javascript
Page({
  handleCardRef(ref) {
    // ref 是组件实例，可调用组件 methods 中的方法
    this.cardRef = ref;
  },
  someMethod() {
    this.cardRef.handleTap(); // 直接调用组件方法
  },
});
```

**注意**：`ref` 接收的是函数（非字符串），在组件 didMount 时调用。

### mixins 复用

```javascript
// mixins/pagination.js
export default {
  data: { page: 1, hasMore: true },
  methods: {
    nextPage() {
      this.setData({ page: this.data.page + 1 });
    },
  },
};
```

```javascript
import pagination from '../../mixins/pagination';

Component({
  mixins: [pagination],
  // pagination 的 data 和 methods 会合并进来
});
```

## 路由导航

```javascript
// 保留当前页，跳转（页面栈 +1，最多 10 层）
my.navigateTo({ url: '/pages/detail/detail?id=123' });

// 关闭当前页，跳转（替换栈顶）
my.redirectTo({ url: '/pages/detail/detail?id=123' });

// 关闭所有页，跳转
my.reLaunch({ url: '/pages/index/index' });

// 返回上一页（delta 指定回退层数）
my.navigateBack({ delta: 1 });

// 切换 Tab 页（会关闭其他非 Tab 页面）
my.switchTab({ url: '/pages/home/home' });
```

### 传参与接收

```javascript
// 发送方
my.navigateTo({ url: '/pages/detail/detail?id=123&type=book' });

// 接收方（在 onLoad 中）
Page({
  onLoad(query) {
    console.log(query.id);   // '123'（注意：始终是字符串）
    console.log(query.type); // 'book'
  },
});
```

**页面栈限制**：`navigateTo` 最多 10 层。超限时需要用 `redirectTo` 或 `reLaunch`。

## 与微信小程序差异速查

| 维度 | 支付宝小程序 | 微信小程序 |
|------|-------------|-----------|
| 模板文件 | `.axml` | `.wxml` |
| 样式文件 | `.acss` | `.wxss` |
| 脚本层 | SJS（`import-sjs`） | WXS（`<wxs>`） |
| API 前缀 | `my.*` | `wx.*` |
| 组件属性 | `props`（直接对象） | `properties`（需 type/value 描述） |
| 组件生命周期 | `didMount` / `didUpdate` / `didUnmount` | `attached` / `observers` / `detached` |
| 事件绑定 | `onTap` / `catchTap` | `bindtap` / `catchtap` |
| 条件渲染 | `a:if` / `a:elif` / `a:else` | `wx:if` / `wx:elif` / `wx:else` |
| 列表渲染 | `a:for` / `a:for-item` / `a:for-index` | `wx:for` / `wx:for-item` / `wx:for-index` |
| 列表 key | `key="item-{{ id }}"` | `wx:key="id"` |
| 事件对象 | `e.target.dataset` | `e.currentTarget.dataset` |
| 组件事件通信 | 函数 prop（`props.onXxx(data)`） | `triggerEvent('xxx', data)` |
| ref | `ref` 属性接收函数 | `selectComponent` / `this.selectComponent` |
| 分享 | `onShareAppMessage` | `onShareAppMessage`（相同） |
| 下拉刷新配置 | `"pullRefresh": true` | `"enablePullDownRefresh": true` |
| 页面配置 key | `defaultTitle` | `navigationBarTitleText` |

### 迁移关键注意点

1. **事件绑定语法完全不同**：`bindtap="fn"` 改为 `onTap="fn"`，`catchtap` 改为 `catchTap`
2. **组件通信模型不同**：微信用 `triggerEvent` 派发 + 父组件 `bind:xxx` 监听；支付宝用函数 prop 直接调用，更接近 React
3. **`properties` 改为 `props`**：无需声明 `type`、`value`，直接给默认值
4. **API 名称存在差异**：部分 API 参数和回调字段不同，不能简单替换 `wx.` 为 `my.`（如 `wx.getStorageSync` 对应 `my.getStorageSync`，但 `wx.request` 的参数与 `my.request` 有细微差异）
5. **`key` 语法不同**：微信 `wx:key="id"` 传属性名；支付宝 `key="item-{{ item.id }}"` 传完整字符串表达式

## 常见陷阱

- **setData 性能**：避免在 `setData` 中传递超大对象或频繁调用。用路径更新（`'list[0].checked': true`）代替整体替换
- **props 是只读的**：组件内不能直接修改 `this.props`，需要通过 `setData` 管理内部状态，再通过函数 prop 通知父组件
- **页面栈溢出**：`navigateTo` 超过 10 层不会报错但会失败，长链路跳转务必用 `redirectTo`
- **路由参数类型**：`onLoad(query)` 中所有参数值都是字符串，数字类型需要手动转换
- **`a:for` 必须加 `key`**：否则列表更新时可能出现渲染错乱
- **组件样式隔离**：默认组件 acss 与页面 acss 互不影响。如需外部控制组件样式，使用 `externalClasses`
- **异步 API 的回调风格**：旧版 API（如 `my.request`）使用 success/fail 回调而非 Promise。基础库 2.x 起部分 API 支持 Promise，但不是全部；建议统一封装

## 组合提示

本 skill 覆盖框架骨架。实际开发中还需要：
- **支付宝小程序 API**：存储（`my.setStorage`）、网络（`my.request`）、支付（`my.tradePay`）、扫码、定位等平台能力
- **小程序UI组件库**：如 mini-ali-ui（支付宝官方组件库）或 antd-mini
- **分包加载**：大型项目需要配置 `subpackages` 实现按需加载
- **插件与云开发**：如需使用支付宝开放能力（芝麻信用、花呗等）需接入对应插件
