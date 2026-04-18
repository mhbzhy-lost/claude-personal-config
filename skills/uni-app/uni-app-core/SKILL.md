---
name: uni-app-core
description: "uni-app 跨平台框架：Vue3 语法、条件编译、pages.json、组件、API、跨平台适配。"
tech_stack: [uni-app, wechat-miniprogram, alipay-miniprogram, douyin-miniprogram, jd-miniprogram]
language: [javascript, typescript]
capability: [routing, native-lifecycle, native-navigation]
---

# uni-app Core（跨平台应用骨架与心智模型）

> 来源：https://uniapp.dcloud.net.cn/ · https://github.com/dcloudio/uni-app
> 版本基准：uni-app（Vue3 编译器），uni-app x（UTS + uvue）并行推荐。

## 用途

一份代码发布到 15+ 平台（iOS / Android / HarmonyOS / H5 / 微信·支付宝·抖音·百度·QQ·京东·快手·钉钉·飞书·小红书 小程序），基于 Vue.js，差异点由条件编译与平台 API 抹平。

## 何时使用

- 需要同时覆盖多端小程序 + App + H5，且希望以 Vue 单技术栈维护
- 已有 Vue/Web 团队，想低成本进入小程序/App 生态
- 接手一个 uni-app 项目要理清项目结构、`pages.json`、条件编译约定
- 判断是选经典 uni-app（Vue3 JS 栈）还是 uni-app x（UTS 原生栈）

## 创建项目

两种主流方式：

1. **HBuilderX（可视化 IDE，DCloud 官方）**：新建 `uni-app` 项目，内置运行/发行到各端入口，云端打包。
2. **Vue CLI（纯命令行）**：
   ```bash
   npx degit dcloudio/uni-preset-vue#vite-ts my-app   # Vue3 + Vite + TS
   cd my-app
   pnpm i
   pnpm dev:h5              # H5
   pnpm dev:mp-weixin       # 微信小程序（dist/dev/mp-weixin 导入微信开发者工具）
   pnpm dev:app             # App（需 HBuilderX 运行）
   ```
   运行脚本命名：`dev:<platform>` / `build:<platform>`，`<platform>` 对应 `h5`、`mp-weixin`、`mp-alipay`、`mp-toutiao`、`mp-baidu`、`mp-qq`、`mp-jd`、`mp-kuaishou`、`mp-lark`、`mp-xhs`、`app`、`quickapp-webview` 等。

## 目录约定

```
my-app/
├── src/
│   ├── pages/                 # 页面，一页一目录（约定）
│   │   └── index/
│   │       └── index.vue
│   ├── components/            # 组件，按 easycom 规范命名可免 import
│   │   └── my-card/
│   │       └── my-card.vue
│   ├── static/                # 静态资源，按路径打包进各端
│   ├── uni_modules/           # 插件市场下载的插件（自包含）
│   ├── App.vue                # 应用级组件，承载 onLaunch 等全局生命周期
│   ├── main.js / main.ts      # 应用入口（createSSRApp 创建实例）
│   ├── pages.json             # 页面路由 + 窗口样式 + tabBar 等
│   ├── manifest.json          # 应用元信息 + 各端差异配置
│   └── uni.scss               # 全局 SCSS 变量
├── index.html                 # H5 入口
├── vite.config.ts
└── package.json
```

未使用 `src/` 时，以上 `src/` 下的内容直接放项目根。

## `main.ts`（Vue3 入口）

```ts
import { createSSRApp } from 'vue';
import App from './App.vue';

export function createApp() {
  const app = createSSRApp(App);
  // app.use(pinia) / app.use(i18n) ...
  return { app };
}
```

注意：uni-app 要求导出 `createApp` 工厂，由框架在各端按需挂载，**不要直接 `app.mount()`**。

## `App.vue`（全局生命周期 + globalData）

```vue
<script setup>
import { onLaunch, onShow, onHide, onError } from '@dcloudio/uni-app';

onLaunch((options) => {
  // 冷启动只触发一次，options.path / options.scene / options.query
});
onShow(() => {});
onHide(() => {});
onError((err) => { console.error(err); });
</script>

<style>
/* 全局样式；uni-app 不支持组件 scoped 样式影响到子页面 */
</style>
```

`globalData` 通过 `<script>` 导出的 `globalData` 字段（Options API）或自行在 app 上挂属性。跨页共享推荐 Pinia。

## `pages.json`（路由 + 窗口配置）

```json
{
  "pages": [
    { "path": "pages/index/index", "style": { "navigationBarTitleText": "首页" } },
    { "path": "pages/detail/detail", "style": { "navigationBarTitleText": "详情" } }
  ],
  "globalStyle": {
    "navigationBarTextStyle": "black",
    "navigationBarBackgroundColor": "#FFFFFF",
    "backgroundColor": "#F8F8F8",
    "enablePullDownRefresh": false
  },
  "tabBar": {
    "color": "#7A7E83",
    "selectedColor": "#3cc51f",
    "borderStyle": "black",
    "backgroundColor": "#ffffff",
    "list": [
      { "pagePath": "pages/index/index", "text": "首页", "iconPath": "static/tab/home.png", "selectedIconPath": "static/tab/home-active.png" },
      { "pagePath": "pages/my/my", "text": "我的", "iconPath": "static/tab/my.png", "selectedIconPath": "static/tab/my-active.png" }
    ]
  },
  "easycom": {
    "autoscan": true,
    "custom": { "^my-(.*)": "@/components/my-$1/my-$1.vue" }
  },
  "subPackages": [
    { "root": "pagesA", "pages": [ { "path": "list/list" } ] }
  ],
  "preloadRule": {
    "pages/index/index": { "network": "all", "packages": ["pagesA"] }
  }
}
```

要点：

- `pages` 数组第一项 = 启动页
- 每个页面 `style` 内字段与当前端原生 window 配置对齐（微信 / 支付宝 / H5 自有差异，已被抹平）
- `tabBar` 最多 5 项
- `easycom` 按正则自动注册组件（放在 `components/组件名/组件名.vue` 会被 `autoscan` 命中）
- `subPackages` 主要针对小程序分包加载，主包体积每端有上限（微信 2MB 主包 / 20MB 总包）

## `manifest.json`（应用元信息 + 各端差异）

关键节点：

```jsonc
{
  "name": "我的应用",
  "appid": "__UNI__XXXXXXX",          // DCloud appid，由 HBuilderX 生成
  "versionName": "1.0.0",
  "versionCode": "100",
  "app-plus": {                        // App 端（iOS/Android）
    "distribute": {
      "ios": { "dSYMs": false },
      "android": { "minSdkVersion": 21, "targetSdkVersion": 30, "permissions": [/* ... */] }
    },
    "modules": { /* 按需开启原生模块 */ },
    "compilerVersion": 3               // 启用 Vue3 运行时
  },
  "mp-weixin":   { "appid": "wx...",  "setting": { "urlCheck": false }, "usingComponents": true },
  "mp-alipay":   { "usingComponents": true },
  "mp-toutiao":  { "appid": "tt..." },
  "mp-baidu":    { "appid": "..." },
  "mp-qq":       { "appid": "..." },
  "mp-jd":       { "appid": "..." },
  "mp-harmony":  { "appid": "..." },
  "h5": {
    "router": { "mode": "hash", "base": "/" },
    "devServer": { "port": 8080, "proxy": { "/api": { "target": "https://api.example.com" } } }
  },
  "vueVersion": "3"
}
```

每个平台 appid 独立在此声明；权限、原生模块、分包体积、SDK Key 等都按端分组。

## 页面与生命周期

```vue
<!-- pages/index/index.vue -->
<template>
  <view class="container">
    <text>{{ title }}</text>
    <button @click="onTap">去详情</button>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import {
  onLoad, onShow, onReady, onHide, onUnload,
  onPullDownRefresh, onReachBottom, onShareAppMessage
} from '@dcloudio/uni-app';

const title = ref('Hello uni-app');

onLoad((query) => { /* 仅首次打开时触发，可取 query 参数 */ });
onShow(() => {});
onReady(() => {});
onHide(() => {});
onUnload(() => {});

onPullDownRefresh(() => { setTimeout(() => uni.stopPullDownRefresh(), 500); });
onReachBottom(() => { /* 加载下一页 */ });
onShareAppMessage(() => ({ title: '分享', path: '/pages/index/index' }));

function onTap() {
  uni.navigateTo({ url: '/pages/detail/detail?id=1' });
}
</script>

<style lang="scss" scoped>
.container { padding: 30rpx; }
</style>
```

注意：

- `onPullDownRefresh` 需要在 `pages.json` 对应页面 `style.enablePullDownRefresh: true` 才生效
- `onShareAppMessage` 仅微信 / QQ / 抖音等支持转发的小程序端有效
- 页面 `onLoad(query)` 的 `query` 即 `navigateTo` URL 上的参数，已自动 decode

## 条件编译（核心差异处理机制）

语法：`#ifdef` / `#ifndef` / `#endif`，以注释形式出现在 JS / HTML / CSS 中。

```js
// #ifdef MP-WEIXIN
wx.login({ success: (r) => console.log(r.code) });
// #endif

// #ifdef H5
location.reload();
// #endif

// #ifndef MP-ALIPAY
console.log('除支付宝外都会执行');
// #endif
```

```html
<template>
  <!-- #ifdef MP-WEIXIN -->
  <official-account />
  <!-- #endif -->

  <!-- #ifdef APP-PLUS || H5 -->
  <video src="..." />
  <!-- #endif -->
</template>

<style>
/* #ifdef H5 */
.container { max-width: 960px; margin: 0 auto; }
/* #endif */
</style>
```

常用平台标识：

| 标识 | 含义 |
|---|---|
| `APP-PLUS` | App（iOS / Android） |
| `APP-HARMONY` | HarmonyOS Next（uni-app x） |
| `H5` | Web / H5 |
| `MP-WEIXIN` | 微信小程序 |
| `MP-ALIPAY` | 支付宝小程序 |
| `MP-TOUTIAO` | 抖音小程序 |
| `MP-BAIDU` | 百度智能小程序 |
| `MP-QQ` | QQ 小程序 |
| `MP-JD` | 京东小程序 |
| `MP-KUAISHOU` | 快手小程序 |
| `MP-LARK` | 飞书小程序 |
| `MP-XHS` | 小红书小程序 |
| `MP` | 所有小程序 |
| `VUE3` | Vue3 编译器 |

支持 `||`（或）、`!`（非），如 `#ifdef H5 || MP-WEIXIN`。文件级条件编译：同一目录下 `foo.h5.ts` / `foo.mp-weixin.ts`，构建时按平台选择。

## 内置组件（跨端抹平层）

常用组件，命名与微信小程序对齐，H5 上由 uni-app 做 Web Component 垫片：

- 视图容器：`<view>`（万能块级盒子）、`<scroll-view>`（可滚动区域）、`<swiper>` + `<swiper-item>`、`<movable-view>`
- 文本与按钮：`<text>`（**只有 `<text>` 内才能选中文字**）、`<button>`、`<checkbox>`、`<radio>`、`<input>`、`<textarea>`、`<picker>`、`<slider>`、`<switch>`
- 媒体：`<image>`（注意默认宽高 300x225，需自定义样式）、`<video>`、`<audio>`、`<live-player>`、`<camera>`
- 导航：`<navigator url="/pages/detail/detail" open-type="navigate">...</navigator>`
- 地图 / 画布：`<map>`、`<canvas>`
- 端专属组件：`<official-account>`（仅微信）、`<ad>`（广告，按端差异）

样式单位：`rpx`（responsive pixel，750rpx = 屏幕宽度，跨端自动换算）。

## 跨平台 API（`uni.*`）

一套 `uni.*` API，底层映射到各端原生 API。常用片段：

```js
// 网络请求：Promise 风格 + 超时 + SSL 校验
const [err, res] = await uni.request({
  url: 'https://api.example.com/list',
  method: 'GET',
  data: { page: 1 },
  header: { 'Content-Type': 'application/json' },
  timeout: 10_000,
  sslVerify: true,
}).then((r) => [null, r]).catch((e) => [e, null]);

// 存储：同步 / 异步
uni.setStorageSync('token', 'xxx');
const token = uni.getStorageSync('token');
uni.removeStorageSync('token');

// 交互反馈
uni.showToast({ title: '成功', icon: 'success', duration: 1500 });
uni.showLoading({ title: '加载中', mask: true });
uni.hideLoading();
const { confirm } = await uni.showModal({ title: '提示', content: '确定吗？' });
const { tapIndex } = await uni.showActionSheet({ itemList: ['A', 'B', 'C'] });

// 路由
uni.navigateTo({ url: '/pages/detail/detail?id=1' });   // 压栈
uni.redirectTo({ url: '/pages/login/login' });          // 替换当前页
uni.switchTab({ url: '/pages/home/home' });             // 跳 tabBar
uni.reLaunch({ url: '/pages/index/index' });            // 关闭所有，打开新页
uni.navigateBack({ delta: 1 });

// 设备 & 系统
const info = uni.getSystemInfoSync();   // platform / screenWidth / statusBarHeight
uni.getLocation({ type: 'gcj02', success: (r) => console.log(r) });
```

存储容量上限（常见陷阱）：

- **微信小程序**：单 key 最大 1MB，总 10MB
- **支付宝小程序**：单条约 200KB，总 10MB
- **抖音小程序**：总 10MB
- **App / H5**：App 端由 localStorage / plus.storage 承载，H5 受浏览器限制（约 5MB）

不要把大图/长列表缓存塞进 storage，优先用文件系统 API（`uni.saveFile` / `uni.getFileSystemManager`）。

## easycom（组件自动注册）

在 `pages.json` 打开后，符合 `components/组件名/组件名.vue` 结构的组件**无需 import、无需在 `components` 注册即可直接使用**：

```vue
<template>
  <my-card title="Hi" />      <!-- 自动解析到 components/my-card/my-card.vue -->
</template>
```

插件市场下的 `uni_modules` 插件也通过 `easycom` 规则被发现。自定义匹配规则通过 `easycom.custom` 注册正则。

## CSS 兼容性要点

- 单位优先使用 `rpx`；静态像素用 `px`；H5 可用 `vw/vh`
- 布局**优先 flexbox**；低版本 Android WebView、部分小程序内核对 grid、`aspect-ratio`、`gap`、`position: sticky` 支持有限
- `:hover` 在小程序无效，用 `hover-class="..."`（`<button>` / `<view>` 等）
- 不要依赖全局选择器穿透（各端 scoped 实现不同），样式隔离以父类名 + BEM 为主
- 微信小程序对 `*` 通配符选择器和 `tag` 选择器支持受限，能写类名就写类名
- 字体图标使用本地字体文件（iconfont 下载）或 SVG 组件，远程字体在小程序端会被拦截

## 开发模式：HBuilderX vs CLI

| 维度 | HBuilderX | Vue CLI / Vite |
|---|---|---|
| 安装 | DCloud 官方 IDE，内置 uni-app 编译器 | 纯命令行 + 任意 IDE |
| 原生 App 能力 | 一键云打包 / 原生 SDK / 自定义基座 | 需要 HBuilderX 打包 App，CLI 跑不了 App 真机 |
| 插件市场 | 一键导入 `uni_modules` | 需手动 npm install 或 git 拉 `uni_modules` 目录 |
| 多人协作 | IDE 锁定 | 与标准 Node 工作流兼容（推荐） |

推荐：**常规 Web / 小程序团队用 CLI + VS Code，需要打包 App 时借助 HBuilderX**。

## uni_modules 插件系统

目录 `src/uni_modules/<plugin-id>/`，自包含 `components/` + `js_sdk/` + `package.json`，可通过 `easycom` 自动注册组件，`import` 其 `js_sdk`。插件市场（ext.dcloud.net.cn）是官方分发渠道。

## uni-app x（新一代，简介）

- 新栈：**UTS**（类 TypeScript 的强类型语言，可编译到 Kotlin/Swift/JS）+ **uvue**（类 Vue 的模板语言）
- 目标：真正的原生渲染性能（App / HarmonyOS Next），不再是 WebView
- 与经典 uni-app **不完全互通**：语法子集差异、API 子集差异、部分 JS 动态特性不支持
- 选型建议：需要接近原生性能且团队能接受 UTS → `uni-app x`；追求一份代码覆盖更多端、动态性更强 → 经典 uni-app

## 常见陷阱

- 入口必须 `export function createApp()` 返回 `{ app }`，直接 `mount` 会导致小程序端运行异常
- `pages.json` 路径**不要加扩展名**，`pages.path: "pages/index/index"` 而不是 `".../index.vue"`
- 每次新增页面必须在 `pages.json` 登记，否则小程序端构建失败
- `<text>` 以外的组件内写文本会在部分小程序端报错 / 样式异常，文本一律包一层 `<text>`
- `<image>` 默认尺寸 300x225，不设样式会留白
- 条件编译注释**必须成对出现**，漏掉 `#endif` 会导致整块代码被静默丢弃
- App 端调试需 HBuilderX 打自定义基座，CLI `dev:app` 仅产出物料，不含运行时
- 微信小程序单包 2MB 上限，超限必须用 `subPackages` 分包
- TypeScript 环境里，`uni` 全局类型需引入 `@dcloudio/types`，否则 `uni.xxx` 无类型提示

## 组合提示

与 `uni-app-routing`（路由与传参进阶）、`uni-app-components`（高频组件用法）、`uni-app-api`（网络 / 存储 / 支付 / 登录）、`uni-app-platform-adapt`（各端差异表）组成最小闭环。状态管理建议搭配 `pinia`；请求层搭配 `uni-request` / `luch-request` 封装；UI 库推荐 `uview-plus`、`uni-ui`、`wot-design-uni`。
