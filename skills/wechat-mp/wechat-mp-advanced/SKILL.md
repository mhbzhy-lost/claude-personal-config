---
name: wechat-mp-advanced
description: "微信小程序高级特性：分包加载、Skyline 渲染引擎、性能优化、插件、Worker、自定义 tabBar。"
tech_stack: [wechat-miniprogram]
language: [javascript]
capability: [native-lifecycle, native-navigation, media-processing]
---

# 微信小程序高级特性（Subpackage / Skyline / Worker / 性能）

> 来源：
> - https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages.html
> - https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/skyline/introduction.html
> - https://developers.weixin.qq.com/miniprogram/dev/framework/performance/tips.html
>
> 版本基准：微信客户端 8.0.40+，基础库 3.0.2+（Skyline 相关特性）

## 用途

覆盖小程序从基础能力迈向生产级所需的进阶技能：突破 2MB 单包限制、通过 Skyline 渲染引擎提升动画流畅度、Worker 卸载重计算、插件化集成、自定义 tabBar 样式，以及一整套已知有效的性能优化手段。

## 何时使用

- 主包 ≥ 2MB 需要拆分 / 首屏包体优化
- 接入第三方小程序插件（地图、支付、直播、客服等）
- 长列表滚动掉帧、手势交互复杂、需要共享元素过渡
- 音视频解码、数据加密、大 JSON 解析等重计算任务
- 需要自定义 tabBar 样式（红点、动效、斜切背景）

---

## 分包加载

### 1. 基础分包

```json
// app.json
{
  "pages": [
    "pages/index/index",
    "pages/logs/logs"
  ],
  "subpackages": [
    {
      "root": "packageA",
      "name": "pack-a",
      "pages": [
        "pages/cat/cat",
        "pages/dog/dog"
      ]
    },
    {
      "root": "packageB",
      "pages": ["pages/apple/apple"]
    }
  ]
}
```

体积限制：
- **主包 ≤ 2MB**（含 tabBar 页面和公共资源）
- **单分包 ≤ 2MB**
- **总体积 ≤ 20MB**
- 分包在首次进入其页面时下载

引用规则：
- 主包 → 分包资源：**禁止**
- 分包 → 主包资源：**允许**
- 分包 A → 分包 B 资源：**禁止**（独立分包完全隔离；普通分包间通过「分包异步化」可突破）

### 2. 独立分包

独立分包可脱离主包单独运行，适合启动速度敏感的活动页、广告落地页：

```json
{
  "subpackages": [
    {
      "root": "moduleA",
      "pages": ["pages/index/index"],
      "independent": true
    }
  ]
}
```

限制：
- 不能引用主包（含公共 JS、自定义组件、npm、插件）
- `App()` 生命周期在独立分包首屏启动时**不会触发主包的 onLaunch/onShow**，`getApp()` 可能返回 `{}`
- 主包进入独立分包页面时，`getApp()` 能拿到主包 App 实例

### 3. 分包预下载

```json
// app.json
{
  "preloadRule": {
    "pages/index/index": {            // 进入该页面时触发
      "network": "all",                // "all" | "wifi"（默认 wifi）
      "packages": ["packageA", "__APP__"]
    }
  }
}
```

- 同一网络类型下，预下载总大小 ≤ 2MB
- `__APP__` 表示主包（独立分包内可预下载主包）
- 支持对「即将到达的页面」做空间换时间优化

### 4. 分包异步化（突破分包隔离）

允许分包间互相引用自定义组件和 JS 模块，加载时按需下载：

```json
// app.json
{
  "subpackages": [
    { "root": "packageA", "pages": ["..."] },
    { "root": "packageB", "pages": ["..."] }
  ],
  "lazyCodeLoading": "requiredComponents"
}
```

```json
// packageA/pages/x/x.json（跨分包引用 packageB 的组件）
{
  "usingComponents": {
    "other-comp": "../../../packageB/components/other/other"
  },
  "componentPlaceholder": {
    "other-comp": "view"   // 下载未完成时占位
  }
}
```

> 必须配置 `componentPlaceholder`，否则下载期间组件缺失会报错。

---

## 插件

### 1. 使用插件

```json
// app.json
{
  "plugins": {
    "myPlugin": {
      "version": "1.0.3",
      "provider": "wxidxxxxxxxxxxxxxxxx"   // 插件 AppID
    }
  }
}
```

```json
// pages/index/index.json
{
  "usingComponents": {
    "hello-component": "plugin://myPlugin/hello-component"
  }
}
```

```js
// 调用插件导出的 JS API
const myPlugin = requirePlugin('myPlugin');
myPlugin.doSomething();
```

### 2. 开发插件

```
plugin/
├── components/
│   └── myComp/          // 对外暴露的组件
├── pages/
│   └── hello/           // 插件页面（可选）
├── api/
│   └── index.js
├── index.js             // 入口：export 所有 JS API
└── plugin.json          // 插件清单
```

```json
// plugin.json
{
  "publicComponents": {
    "my-comp": "components/myComp/myComp"
  },
  "publicPages": {
    "hello-page": "pages/hello/hello"
  },
  "main": "index.js"
}
```

```js
// plugin/index.js
module.exports = {
  doSomething() { /* ... */ }
};
```

宿主小程序通过 `navigator` 跳转到插件页面：`url="plugin://myPlugin/hello-page"`。

---

## 性能优化

### 1. setData 优化

`setData` 会将数据经 JSBridge 序列化跨线程同步到视图层，**数据量与调用频次是两大卡点**：

```js
// 坏：频繁小粒度调用
this.setData({ a: 1 });
this.setData({ b: 2 });
// 好：合并
this.setData({ a: 1, b: 2 });

// 坏：整体替换大数组
this.setData({ list: this.data.list });      // 1000 项全量传输
// 好：路径语法局部更新
this.setData({ 'list[2].name': 'newName' });
this.setData({ 'obj.key': 'value' });

// 坏：把渲染无关数据放入 data
this.setData({ _tmpSocket: ws });            // 会被序列化，还可能循环引用
// 好：挂在 this 上
this._tmpSocket = ws;
```

额外原则：
- `onPageScroll` / 手势回调中避免高频 `setData`，节流到 16ms 以上
- 页面初始 `data` 只放首屏必需字段，延迟字段 `onReady` 后补
- 路径语法的 key 不支持模板字符串字面量，需先拼接再传入：`this.setData({ [`list[${i}].name`]: v })`

### 2. 长列表虚拟滚动

使用官方 `miniprogram-recycle-view`（npm 包）：

```bash
npm i --save miniprogram-recycle-view
# 开发者工具：工具 → 构建 npm
```

```json
// page.json
{
  "usingComponents": {
    "recycle-view": "miniprogram-recycle-view",
    "recycle-item": "miniprogram-recycle-view/recycle-item"
  }
}
```

```html
<!-- page.wxml -->
<recycle-view batch="{{batchSetRecycleData}}" id="recycleId">
  <recycle-item wx:for="{{recycleList}}" wx:key="id">
    <view>{{item.name}}</view>
  </recycle-item>
</recycle-view>
```

```js
const createRecycleContext = require('miniprogram-recycle-view');
Page({
  onReady() {
    this.ctx = createRecycleContext({
      id: 'recycleId',
      dataKey: 'recycleList',
      page: this,
      itemSize: { width: 375, height: 80 }   // 或 (item, idx) => ({...})
    });
    this.ctx.append(this.rawList);
  }
});
```

> Skyline 下优先使用 `<scroll-view type="list">` 或 `type="custom"`，原生虚拟滚动性能更好，无需 `recycle-view`。

### 3. 初始渲染缓存

冷启动时跳过白屏，直接展示上次渲染结果：

```json
// page.json
{
  "initialRenderingCache": "static"   // "static" | "dynamic"
}
```

- `static`：仅缓存不依赖 `data` 的静态结构（`<view>` 文字等）
- `dynamic`：可缓存含 `data` 的结构，需在 `onLoad` 前调用 `this.setInitialRenderingCache(data)` 显式注入
- 不适用于包含登录态、个性化内容的页面

### 4. 图片

- 使用 CDN + WebP，按屏幕尺寸裁剪（服务端传参：`?x-oss-process=image/resize,w_750`）
- `<image>` 默认尺寸 300x225，必须显式设置 `mode`（常用 `aspectFill` / `widthFix`）
- 长列表中不可见图片设 `lazy-load="{{true}}"`
- 避免 WXML 中大图 base64 内联

### 5. 数据预拉取与周期性更新

```js
// app.js（冷启动时读取预拉取的数据）
App({
  onLaunch() {
    wx.getBackgroundFetchData({
      fetchType: 'pre',    // "pre" 预拉取 | "periodic" 周期更新
      success(res) {
        console.log(res.fetchedData);
      }
    });
  }
});
```

```json
// 后台配置（在 mp.weixin.qq.com → 开发管理 → 接口设置中启用）
// 或通过 backgroundFetchRules 声明
{
  "backgroundFetchRules": [
    {
      "requireNetworkType": "wifi",
      "autoInvokeUrl": "https://example.com/fetch",
      "minInterval": 60
    }
  ]
}
```

---

## Skyline 渲染引擎

### 核心差异

| 维度 | WebView 渲染 | Skyline 渲染 |
|---|---|---|
| 渲染层 | 每页一个 WebView | 所有 Skyline 页面共享渲染线程 |
| 组件框架 | 双线程（逻辑↔渲染分离） | 单线程（glass-easel，同进程） |
| 动画 | JS 驱动 / CSS 动画 | Worklet（渲染线程直接执行） |
| 手势 | 无内置 | tap/pan/scale/long-press 内置 |
| 路由 | 默认切换动画 | 可自定义（半屏、分屏、共享元素） |
| 版本 | 全量 | 微信 8.0.40+，基础库 3.0.2+ |

### 启用

```json
// app.json（全局启用）
{
  "renderer": "skyline",
  "lazyCodeLoading": "requiredComponents",
  "componentFramework": "glass-easel",
  "rendererOptions": {
    "skyline": { "disableABTest": true, "defaultDisplayBlock": true }
  }
}
```

```json
// 单页面覆盖
// page.json
{ "renderer": "skyline" }

// 或回退到 webview
{ "renderer": "webview" }
```

### Worklet 动画

Worklet 函数跑在渲染线程，读写 `shared` 值不触发跨线程序列化：

```js
// 页面 JS
import { shared, timing, Easing } from 'wx.worklet';

Page({
  onReady() {
    this.offsetY = shared(0);   // 跨线程响应式变量

    // 绑定 shared 到节点样式（渲染线程直接更新）
    this.applyAnimatedStyle('.box', () => {
      'worklet';
      return { transform: `translateY(${this.offsetY.value}px)` };
    });
  },

  play() {
    this.offsetY.value = timing(100, {
      duration: 300,
      easing: Easing.out(Easing.cubic)
    });
  }
});
```

关键点：
- 函数首行 `'worklet'` 指令标记，缺失则跑在 JS 线程
- 只能使用 `shared` 值、`Math`、普通 JS 语法；**禁止** `wx.xxx` API、闭包外变量
- 用 `runOnJS(fn)(args)` 从 worklet 回调 JS 线程；`runOnUI(fn)` 反向

### 手势系统

```html
<!-- 单个手势 -->
<pan-gesture-handler onGestureEvent="handlePan">
  <view class="box" />
</pan-gesture-handler>

<!-- 组合：同时识别 pan + scale -->
<simultaneous-gesture-handler>
  <pan-gesture-handler onGestureEvent="handlePan">
    <scale-gesture-handler onGestureEvent="handleScale">
      <view class="box" />
    </scale-gesture-handler>
  </pan-gesture-handler>
</simultaneous-gesture-handler>
```

```js
Page({
  handlePan(e) {
    'worklet';    // 渲染线程执行，直接改 shared 无需 setData
    const { translationX, translationY, state } = e;
    this.posX.value += translationX;
  }
});
```

内置手势：`tap-gesture-handler`、`pan-gesture-handler`、`scale-gesture-handler`、`long-press-gesture-handler`、`vertical-drag-gesture-handler`、`horizontal-drag-gesture-handler`。

共存容器：
- `<simultaneous-gesture-handler>`：多个子手势同时识别
- `<exclusive-gesture-handler>`：按优先级识别一个
- `<competing-gesture-handler>`：同级互斥

### 自定义路由（半屏弹出 / 分屏）

```js
// app.js
wx.router.addRouteBuilder('mySlideUp', (ctx) => {
  const { primaryAnimation, secondaryAnimation } = ctx;
  return {
    opaque: false,            // 透明背景，可见下层页面
    barrierDismissible: true, // 点击遮罩关闭
    handleForwardAnimation(page) {
      'worklet';
      page.style.transform = `translateY(${(1 - primaryAnimation.value) * 100}%)`;
    },
    handleBackwardAnimation(page) {
      'worklet';
      page.style.transform = `translateY(${primaryAnimation.value * 100}%)`;
    }
  };
});
```

```json
// 目标页 page.json
{
  "renderer": "skyline",
  "customRouteKeyName": "mySlideUp"
}
```

### 共享元素动画

```html
<!-- 页面 A -->
<share-element key="hero-img" duration="300">
  <image src="{{imgSrc}}" mode="aspectFill" />
</share-element>

<!-- 页面 B -->
<share-element key="hero-img" duration="300">
  <image src="{{imgSrc}}" mode="aspectFill" />
</share-element>
```

条件：
- 两端 `key` 完全一致
- 两个页面都必须是 Skyline 渲染
- 仅在 `navigateTo` / `navigateBack` 时生效

### 迁移注意

- `scroll-view` 需显式 `type="list"` / `type="custom"`，旧 `scroll-y` 属性行为不同
- `position: fixed` 需配合 `inset` 写法，模拟器与真机表现可能差异较大
- 第三方 UI 库（WeUI / Vant Weapp）部分组件未适配 Skyline，接入前查官方兼容列表
- `wx.createSelectorQuery` 不能在 worklet 内使用；改用 `this.selectAnimatedElement()`

---

## Worker 多线程

```json
// app.json
{
  "workers": "workers"    // Worker 脚本所在目录（相对项目根）
}
```

```js
// workers/request/index.js
worker.onMessage(function (res) {
  // 收到主线程消息
  const result = heavyCompute(res.payload);
  worker.postMessage({ type: 'done', result });
});
```

```js
// 主线程
const worker = wx.createWorker('workers/request/index.js');

worker.onMessage(function (res) {
  if (res.type === 'done') console.log(res.result);
});

worker.onProcessKilled(() => {
  // 被系统杀掉后需重建
  this.worker = wx.createWorker('workers/request/index.js');
});

worker.postMessage({ payload: largeJson });

// 用完销毁
worker.terminate();
```

限制：
- 同一小程序进程**仅能存在 1 个 Worker**；并发靠 Worker 内排队
- Worker 内可用 API 极其有限，**不可用**：DOM、`wx.request`、`wx.getStorageSync`、`wx.navigateTo` 等
- **可用**：`wx.getFileSystemManager()`、`setTimeout/setInterval`、纯 JS 计算
- `postMessage` 使用结构化克隆，大对象序列化本身就是开销，传 `ArrayBuffer` 更快（可转移所有权）
- Worker 脚本不支持 npm 包，只能 `require` 同一 workers 目录下的文件

---

## 自定义 tabBar

```json
// app.json
{
  "tabBar": {
    "custom": true,
    "color": "#000",            // 仍需配置，作为兜底
    "selectedColor": "#f60",
    "backgroundColor": "#fff",
    "list": [
      { "pagePath": "pages/index/index", "text": "首页" },
      { "pagePath": "pages/mine/mine",  "text": "我的" }
    ]
  }
}
```

目录结构（**名称固定**为 `custom-tab-bar`，放项目根目录）：

```
custom-tab-bar/
├── index.js
├── index.json
├── index.wxml
└── index.wxss
```

```js
// custom-tab-bar/index.js
Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/index/index', text: '首页', icon: '/img/home.png',  selectedIcon: '/img/home-on.png' },
      { pagePath: '/pages/mine/mine',  text: '我的', icon: '/img/mine.png', selectedIcon: '/img/mine-on.png' }
    ]
  },
  methods: {
    switchTab(e) {
      const { path, index } = e.currentTarget.dataset;
      wx.switchTab({ url: path });
      this.setData({ selected: index });
    }
  }
});
```

```js
// 每个 tabBar 页面的 onShow 中同步选中态
Page({
  onShow() {
    const tabBar = typeof this.getTabBar === 'function' && this.getTabBar();
    if (tabBar) tabBar.setData({ selected: 0 });  // 当前页在 list 中的索引
  }
});
```

原生 tabBar API（`wx.setTabBarBadge` / `wx.showTabBarRedDot`）对自定义 tabBar **不生效**，红点、徽标需自行在组件 data 里维护。

---

## TypeScript 支持

安装类型定义：

```bash
npm i -D miniprogram-api-typings
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "lib": ["ES2020"],
    "types": ["miniprogram-api-typings"],
    "strict": true
  }
}
```

```ts
// 页面泛型
Page<
  { count: number; list: string[] },    // IData
  Record<string, never>                  // ICustom（自定义属性）
>({
  data: { count: 0, list: [] },
  onLoad() {
    this.setData({ count: 1 });          // this 已自动推断
  }
});

// 组件泛型：Component<IData, IProperty, IMethod>
Component<
  { label: string },
  { value: { type: StringConstructor; value: string } },
  { reset(): void }
>({
  data: { label: '' },
  properties: { value: { type: String, value: '' } },
  methods: {
    reset() { this.setData({ label: '' }); }
  }
});
```

`wx.*` API 的返回值 / 回调都在全局命名空间 `WechatMiniprogram.*` 下，IDE 可自动补全参数类型。

---

## 注意事项

- **分包路径**：`subpackages[].root` 对应实际目录名，`pages` 数组中的路径**不含 root 前缀**
- **独立分包 App 生命周期**：独立分包首屏启动时 `getApp()` 可能为空对象，不要在独立分包依赖主包 App 的初始化数据
- **预下载上限**：`preloadRule` 在同一网络类型下总量 ≤ 2MB，超出被静默忽略
- **Skyline 真机优先**：Worklet / 手势 / 共享元素的模拟器表现与真机差异大，以真机为准
- **Worker 单实例**：同时只能有 1 个；被系统杀掉会触发 `onProcessKilled`，需在回调里重建
- **自定义 tabBar 选中态**：漏写 `onShow` 里的 `getTabBar().setData({ selected })` 会导致切换后高亮不跟随
- **setData 路径语法**：字符串键不支持模板字面量动态键，需先拼好字符串再传入 `setData`
- **分包异步化必须占位**：跨分包组件需配置 `componentPlaceholder`，否则下载中渲染报错

## 组合提示

- `wechat-mp-core`：基础生命周期、路由、组件注册——进阶特性前置
- `wechat-mp-api`：网络、存储、媒体 API，数据预拉取、Worker 消息桥的上游
- `wechat-mp-components`：内置组件用法，迁移 Skyline 时 `scroll-view` 差异必读
- `wechat-mp-cloud`：云函数可承载重计算，绕开 Worker 单实例限制
