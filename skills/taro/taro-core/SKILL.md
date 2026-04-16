---
name: taro-core
description: "Taro 跨平台小程序框架：React/Vue 语法、多端适配、条件编译、路由、组件、API、插件、CLI。"
tech_stack: [taro, wechat-miniprogram, alipay-miniprogram, douyin-miniprogram, jd-miniprogram]
language: [typescript, javascript]
---

# Taro 跨平台小程序框架（核心知识）

> 来源：https://docs.taro.zone/docs/ / https://github.com/NervJS/taro
> 版本基准：Taro 4.x（React 18 / Vue 3），默认 Webpack5 编译。

## 用途

使用 React 或 Vue 语法编写一次代码，编译到微信/支付宝/抖音/京东/百度/QQ 小程序、H5、React Native 等 9+ 平台。

## 何时使用

- 需要同一套业务代码同时产出多端小程序（微信 + 支付宝 + 抖音等）
- 团队技术栈是 React/Vue，需要快速切入小程序开发
- 需要同时输出小程序和 H5 移动端页面
- 现有 H5 项目需要低成本迁移到小程序
- 需要条件编译处理各平台差异逻辑

## 创建项目

```bash
# 安装 CLI
npm install -g @tarojs/cli
# 或直接使用 npx（推荐）
npx @tarojs/cli init my-app

# 交互式选择：
# - 框架：React / Vue3 / Vue2
# - CSS 预处理：Sass / Less / Stylus
# - 编译工具：Webpack5 / Vite
# - 模板：默认模板 / 各种预置模板

cd my-app
npm install
```

## 编译与开发

```bash
# 开发模式（watch）
npx taro build --type weapp --watch    # 微信小程序
npx taro build --type alipay --watch   # 支付宝小程序
npx taro build --type tt --watch       # 抖音小程序
npx taro build --type jd --watch       # 京东小程序
npx taro build --type swan --watch     # 百度小程序
npx taro build --type qq --watch       # QQ 小程序
npx taro build --type h5 --watch       # H5
npx taro build --type rn --watch       # React Native

# 生产构建（去掉 --watch）
npx taro build --type weapp
```

编译产物位于 `dist/` 目录，用对应平台的开发者工具打开即可预览。

## 项目结构

```
my-app/
├── config/
│   ├── index.ts              # 主编译配置
│   ├── dev.ts                # 开发环境配置
│   └── prod.ts               # 生产环境配置
├── src/
│   ├── app.ts                # 入口文件（生命周期）
│   ├── app.config.ts         # 全局配置（pages、window、tabBar）
│   ├── app.scss              # 全局样式
│   ├── index.html            # H5 模板
│   └── pages/
│       ├── index/
│       │   ├── index.tsx     # 页面组件
│       │   ├── index.config.ts  # 页面配置
│       │   └── index.scss
│       └── detail/
│           ├── index.tsx
│           └── index.config.ts
├── project.config.json       # 微信小程序项目配置
├── tsconfig.json
└── package.json
```

## 全局配置（app.config.ts）

```ts
// src/app.config.ts
export default defineAppConfig({
  pages: [
    'pages/index/index',    // 第一个为首页
    'pages/detail/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: 'My App',
    navigationBarTextStyle: 'black',
  },
  tabBar: {
    list: [
      { pagePath: 'pages/index/index', text: '首页', iconPath: '', selectedIconPath: '' },
      { pagePath: 'pages/mine/index', text: '我的', iconPath: '', selectedIconPath: '' },
    ],
  },
  // 分包配置
  subPackages: [
    {
      root: 'packageA',
      pages: ['pages/cat/index', 'pages/dog/index'],
    },
  ],
})
```

## React 开发（推荐）

### 页面组件

```tsx
// src/pages/index/index.tsx
import { View, Text, Button } from '@tarojs/components'
import { useLoad, useReady, useRouter } from '@tarojs/taro'
import './index.scss'

export default function Index() {
  // Taro 专属 Hooks
  useLoad(() => {
    console.log('页面加载，等同 onLoad')
  })

  useReady(() => {
    console.log('页面初次渲染完成，等同 onReady')
  })

  const handleClick = () => {
    Taro.navigateTo({ url: '/pages/detail/index?id=123' })
  }

  return (
    <View className='index'>
      <Text>Hello Taro!</Text>
      <Button onClick={handleClick}>去详情</Button>
    </View>
  )
}
```

### 页面配置

```ts
// src/pages/index/index.config.ts
export default definePageConfig({
  navigationBarTitleText: '首页',
  enablePullDownRefresh: true,
})
```

### Taro Hooks 一览

| Hook | 对应生命周期 | 说明 |
|------|-------------|------|
| `useLoad(fn)` | `onLoad` | 页面加载，可接收路由参数 |
| `useReady(fn)` | `onReady` | 首次渲染完成，可操作 DOM |
| `useDidShow(fn)` | `onShow` | 页面显示/切前台 |
| `useDidHide(fn)` | `onHide` | 页面隐藏/切后台 |
| `useUnload(fn)` | `onUnload` | 页面卸载 |
| `usePullDownRefresh(fn)` | `onPullDownRefresh` | 下拉刷新 |
| `useReachBottom(fn)` | `onReachBottom` | 触底加载 |
| `useShareAppMessage(fn)` | `onShareAppMessage` | 分享 |
| `useRouter()` | — | 获取路由参数（返回 `{ params }`) |
| `useTabItemTap(fn)` | `onTabItemTap` | 点击 tab |

**重要**：React 标准 Hooks（`useState`、`useEffect`、`useRef` 等）完全可用，从 `react` 导入即可。

### 入口组件

```tsx
// src/app.ts
import { PropsWithChildren } from 'react'
import './app.scss'

function App({ children }: PropsWithChildren) {
  return children
}

export default App
```

## Vue 3 开发

### 页面组件

```vue
<!-- src/pages/index/index.vue -->
<template>
  <view class="index">
    <text>Hello Taro!</text>
    <button @tap="handleClick">去详情</button>
  </view>
</template>

<script setup lang="ts">
import Taro, { useLoad, useReady } from '@tarojs/taro'

definePageConfig({
  navigationBarTitleText: '首页',
})

useLoad(() => {
  console.log('页面加载')
})

useReady(() => {
  console.log('页面渲染完成')
})

const handleClick = () => {
  Taro.navigateTo({ url: '/pages/detail/index?id=123' })
}
</script>

<style lang="scss">
.index { padding: 20px; }
</style>
```

Vue 3 中也可以使用 Options API，生命周期写在 `onLoad`、`onShow` 等选项中。

## 路由与导航

### 路由配置

所有页面必须在 `app.config.ts` 的 `pages` 数组中注册，否则无法访问。

### 导航 API

```ts
import Taro from '@tarojs/taro'

// 保留当前页，跳转（栈上限 10 层）
Taro.navigateTo({ url: '/pages/detail/index?id=123&name=test' })

// 关闭当前页，跳转
Taro.redirectTo({ url: '/pages/detail/index' })

// 关闭所有页面，打开某页
Taro.reLaunch({ url: '/pages/index/index' })

// 返回上一页
Taro.navigateBack({ delta: 1 })

// 切换 Tab 页（目标必须是 tabBar 页）
Taro.switchTab({ url: '/pages/index/index' })
```

### 获取路由参数

```tsx
// React
import { useRouter } from '@tarojs/taro'

function Detail() {
  const router = useRouter()
  const { id, name } = router.params  // { id: '123', name: 'test' }
  // ...
}

// 也可在 useLoad 中获取
useLoad((options) => {
  console.log(options.id) // '123'
})
```

### 获取页面栈

```ts
const pages = Taro.getCurrentPages()
const currentPage = pages[pages.length - 1]
```

## 条件编译（多端差异处理）

### 环境变量

```ts
// process.env.TARO_ENV 值：weapp | swan | alipay | tt | qq | jd | h5 | rn
if (process.env.TARO_ENV === 'weapp') {
  // 仅微信小程序执行
} else if (process.env.TARO_ENV === 'h5') {
  // 仅 H5 执行
}
```

### 多端文件（文件级条件编译）

针对不同平台创建同名不同后缀的文件，构建时自动选择：

```
src/pages/index/
├── index.tsx          # 默认实现
├── index.weapp.tsx    # 微信小程序专用（优先于默认）
├── index.h5.tsx       # H5 专用
└── index.alipay.tsx   # 支付宝专用
```

同样适用于样式文件：`index.scss` / `index.weapp.scss` / `index.h5.scss`

### 注释式条件编译

```js
// JS/TS 中
/** @tarojs/runtime */
/*  #ifdef weapp  */
console.log('仅微信')
/*  #endif  */

// 模板中（JSX 不支持，仅 Vue 模板）
<!-- #ifdef weapp -->
<view>仅微信显示</view>
<!-- #endif -->
```

### 统一接口 + 多端实现

```ts
// src/utils/share.ts          — 默认
// src/utils/share.weapp.ts    — 微信
// src/utils/share.h5.ts       — H5
// 导入时只写 import { share } from './share'，构建时自动解析
```

## 组件（@tarojs/components）

所有组件从 `@tarojs/components` 导入，跨平台统一接口：

```tsx
import {
  View,          // 视图容器（等同 div）
  Text,          // 文本（行内元素）
  Image,         // 图片
  Button,        // 按钮
  Input,         // 输入框
  Textarea,      // 多行输入
  ScrollView,    // 可滚动视图
  Swiper,        // 轮播
  SwiperItem,    // 轮播子项
  Navigator,     // 导航链接
  RichText,      // 富文本
  Form,          // 表单
  Picker,        // 选择器
  Switch,        // 开关
  Checkbox,      // 复选框
  Radio,         // 单选
  Slider,        // 滑块
  Map,           // 地图
  Camera,        // 相机
  Video,         // 视频
  WebView,       // 网页容器
} from '@tarojs/components'
```

### 常用组件示例

```tsx
// ScrollView 下拉刷新 + 触底
<ScrollView
  scrollY
  style={{ height: '100vh' }}
  onScrollToLower={() => loadMore()}
  refresherEnabled
  refresherTriggered={isRefreshing}
  onRefresherRefresh={() => refresh()}
>
  {list.map(item => <View key={item.id}>{item.name}</View>)}
</ScrollView>

// Swiper 轮播
<Swiper autoplay interval={3000} indicatorDots circular>
  {banners.map(b => (
    <SwiperItem key={b.id}>
      <Image src={b.url} mode='aspectFill' style={{ width: '100%' }} />
    </SwiperItem>
  ))}
</Swiper>

// Image 常用 mode
<Image src={url} mode='aspectFit' />   // 保持比例，完整显示
<Image src={url} mode='aspectFill' />  // 保持比例，填满裁剪
<Image src={url} mode='widthFix' />    // 宽度不变，高度自适应
```

**注意**：Taro 中不能直接使用 HTML 标签（`<div>`、`<span>` 等），必须使用 Taro 组件。H5 端会自动映射为对应 HTML 元素。

## API（Taro.*）

### 网络请求

```ts
// Taro.request 返回 Promise
const res = await Taro.request({
  url: 'https://api.example.com/data',
  method: 'GET',            // GET | POST | PUT | DELETE
  header: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
  data: { page: 1 },
  timeout: 10000,           // 毫秒
})
console.log(res.data, res.statusCode)

// 上传文件
Taro.uploadFile({
  url: 'https://api.example.com/upload',
  filePath: tempFilePath,
  name: 'file',
  formData: { userId: '1' },
})

// 下载文件
const { tempFilePath } = await Taro.downloadFile({
  url: 'https://example.com/file.pdf',
})
```

### 存储

```ts
// 同步（推荐在初始化阶段使用）
Taro.setStorageSync('key', { name: 'value' })  // 单个 key 最大 1MB
const data = Taro.getStorageSync('key')
Taro.removeStorageSync('key')

// 异步
await Taro.setStorage({ key: 'key', data: value })
const { data } = await Taro.getStorage({ key: 'key' })
```

### 交互反馈

```ts
// Toast
Taro.showToast({ title: '成功', icon: 'success', duration: 2000 })
Taro.showToast({ title: '加载中', icon: 'loading' })
Taro.showToast({ title: '提示信息', icon: 'none' })  // 无图标，可显示更长文字

// Loading
Taro.showLoading({ title: '加载中' })
Taro.hideLoading()

// Modal 对话框
const { confirm } = await Taro.showModal({
  title: '提示',
  content: '确认删除？',
  confirmText: '删除',
  confirmColor: '#ff0000',
})
if (confirm) { /* 用户点了确认 */ }

// ActionSheet
const { tapIndex } = await Taro.showActionSheet({
  itemList: ['选项1', '选项2', '选项3'],
})
```

### 媒体

```ts
// 选择图片
const { tempFilePaths } = await Taro.chooseImage({
  count: 9,
  sizeType: ['compressed'],
  sourceType: ['album', 'camera'],
})

// 预览图片
Taro.previewImage({
  current: tempFilePaths[0],
  urls: tempFilePaths,
})

// 获取图片信息
const info = await Taro.getImageInfo({ src: url })
```

### 设备

```ts
// 系统信息
const sysInfo = Taro.getSystemInfoSync()
// sysInfo.platform: 'ios' | 'android' | 'devtools'
// sysInfo.screenWidth / screenHeight / windowWidth / windowHeight / statusBarHeight

// 剪贴板
Taro.setClipboardData({ data: 'text' })
const { data } = await Taro.getClipboardData()

// 振动
Taro.vibrateShort()    // 短振动（15ms）
Taro.vibrateLong()     // 长振动（400ms）

// 扫码
const { result } = await Taro.scanCode({ onlyFromCamera: false })
```

### 位置

```ts
// 获取定位（需用户授权）
const { latitude, longitude } = await Taro.getLocation({
  type: 'gcj02',
})

// 打开地图选择位置
const location = await Taro.chooseLocation({})
```

### 事件总线

```ts
// 发送
Taro.eventCenter.trigger('eventName', arg1, arg2)
// 监听
Taro.eventCenter.on('eventName', (arg1, arg2) => { /* ... */ })
// 取消监听
Taro.eventCenter.off('eventName', handler)
```

## 编译配置（config/index.ts）

```ts
// config/index.ts
import { defineConfig } from '@tarojs/cli'

export default defineConfig({
  projectName: 'my-app',
  date: '2024-01-01',
  designWidth: 750,            // 设计稿宽度（常用 750）
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,                    // 750 设计稿 1:1
    375: 2,                    // 375 设计稿 x2
    828: 1.81 / 2,
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  compiler: 'webpack5',        // 'webpack5' | 'vite'

  // 小程序通用配置
  mini: {
    postcss: {
      pxtransform: {
        enable: true,
        config: {},             // 750 设计稿下直接写 px，自动转 rpx
      },
      cssModules: {
        enable: true,           // 启用 CSS Modules（.module.scss）
        config: {
          namingPattern: 'module',
          generateScopedName: '[name]__[local]___[hash:base64:5]',
        },
      },
    },
    // Webpack 优化
    webpackChain(chain) {
      // 自定义 webpack 配置
    },
    // 分包优化（提取公共依赖，减少主包体积）
    optimizeMainPackage: {
      enable: true,
    },
  },

  // H5 特定配置
  h5: {
    publicPath: '/',
    staticDirectory: 'static',
    esnextModules: ['@tarojs/components', 'taro-ui'],  // 需要编译的 node_modules
    postcss: {
      autoprefixer: { enable: true },
    },
    devServer: {
      port: 10086,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
    router: {
      mode: 'browser',          // 'browser' | 'hash'
    },
  },

  // 平台特定插件
  plugins: [],
})
```

### designWidth 与 rpx 换算

- `designWidth: 750` 时，CSS 中写 `100px` 会被编译为 `100rpx`（小程序）
- `designWidth: 375` 时，CSS 中写 `100px` 会被编译为 `200rpx`
- 不想转换的值写大写 `PX`：`border: 1PX solid #ccc`（保持 1 物理像素）

## 分包优化

```ts
// app.config.ts
export default defineAppConfig({
  pages: ['pages/index/index'],      // 主包页面
  subPackages: [
    {
      root: 'packageA',
      pages: ['pages/cat/index'],
    },
    {
      root: 'packageB',
      pages: ['pages/dog/index'],
    },
  ],
  preloadRule: {
    'pages/index/index': {
      network: 'all',
      packages: ['packageA'],         // 进入首页时预加载 packageA
    },
  },
})
```

分包注意事项：
- 微信小程序主包限制 2MB，总包 20MB
- `tabBar` 页面必须在主包
- 分包之间不能互相引用对方的资源
- 使用 `optimizeMainPackage` 自动提取分包间的公共依赖

## 插件系统

### 编写自定义插件

```ts
// my-plugin.ts
export default (ctx, options) => {
  // ctx.onBuildStart — 构建开始
  ctx.onBuildStart(() => {
    console.log('编译开始')
  })

  // ctx.modifyWebpackChain — 修改 webpack 配置
  ctx.modifyWebpackChain(({ chain }) => {
    chain.plugin('define').tap(args => {
      args[0]['MY_VAR'] = JSON.stringify('value')
      return args
    })
  })

  // ctx.onBuildComplete — 构建完成
  ctx.onBuildComplete(() => {
    console.log('编译完成')
  })
}
```

### 使用插件

```ts
// config/index.ts
export default defineConfig({
  plugins: [
    '@tarojs/plugin-platform-weapp',   // 内置平台插件
    '@tarojs/plugin-platform-alipay',
    ['./my-plugin', { option1: 'value' }],  // 自定义插件 + 配置
    'taro-plugin-tailwind',             // 社区插件
  ],
})
```

### 内置平台插件

| 插件 | 平台 |
|------|------|
| `@tarojs/plugin-platform-weapp` | 微信小程序 |
| `@tarojs/plugin-platform-alipay` | 支付宝小程序 |
| `@tarojs/plugin-platform-tt` | 抖音小程序 |
| `@tarojs/plugin-platform-jd` | 京东小程序 |
| `@tarojs/plugin-platform-swan` | 百度小程序 |
| `@tarojs/plugin-platform-qq` | QQ 小程序 |

## CLI 常用命令

```bash
# 初始化项目
taro init my-app

# 编译（开发 / 生产）
taro build --type weapp --watch
taro build --type weapp

# 更新 Taro 到最新版
taro update self          # 更新 CLI
taro update project       # 更新项目依赖

# 环境信息（排查问题用）
taro info

# 诊断项目问题
taro doctor
```

## 样式方案

```scss
// 直接使用 px（750 设计稿），自动转 rpx
.container {
  padding: 20px;            // => 20rpx
  font-size: 28px;          // => 28rpx
  border: 1PX solid #eee;   // 大写 PX 不转换，保持 1px
}

// 支持 Sass/Less/Stylus（创建项目时选择）
// 支持 CSS Modules
import styles from './index.module.scss'
<View className={styles.container}>...</View>
```

全局样式在 `src/app.scss` 中编写，页面样式在页面目录的 `.scss` 文件中编写。

## 第三方 UI 库

| 库 | 框架 | 说明 |
|---|---|---|
| `taro-ui` | React | 官方 UI 库，组件齐全 |
| `@antmjs/vantui` | React | Vant 风格组件 |
| `nut-ui` | Vue 3 | 京东风格组件（NutUI） |

```bash
npm install taro-ui
```
```tsx
import { AtButton, AtList, AtListItem } from 'taro-ui'
import 'taro-ui/dist/style/index.scss'  // 全局引入样式（或按需引入）
```

H5 端使用第三方库时，需在配置中将其加入 `esnextModules` 数组。

## 注意事项

1. **组件必须用 Taro 组件**：不能用 `<div>`/`<span>` 等 HTML 标签，必须用 `<View>`/`<Text>` 等。H5 端 Taro 会自动映射
2. **事件名差异**：React 中用 `onClick`、`onInput`；Vue 中用 `@tap`、`@input`。小程序原生没有 `click` 事件，Taro React 做了兼容映射
3. **页面必须注册**：所有页面必须在 `app.config.ts` 的 `pages` 或 `subPackages` 中声明，否则路由不可达
4. **存储限制**：`setStorage` 单个 key 最大 1MB，总存储约 10MB（各平台略有差异）
5. **包体积限制**：微信主包 2MB、总包 20MB；支付宝主包 2MB、总包 8MB（偏小，需注意）
6. **不支持动态路由**：路由路径必须是静态字符串，不能动态拼接页面路径注册
7. **React 中不能用 DOM API**：如 `document.querySelector`，应使用 `Taro.createSelectorQuery()`
8. **样式限制**：小程序不支持级联选择器的后代选择器跨组件穿透；不支持 `*` 通配符选择器
9. **组件事件回调参数**：事件对象结构与 Web 不同，取值方式为 `e.detail.value`（非 `e.target.value`）
10. **版本对齐**：`@tarojs/cli`、`@tarojs/taro`、`@tarojs/components` 等所有 `@tarojs/*` 包必须版本一致，否则编译报错。使用 `taro doctor` 检查
11. **H5 端跨域**：H5 开发时使用 `devServer.proxy` 配置代理；生产环境需服务端配置 CORS 或 Nginx 反代
12. **条件编译 tree-shaking**：`if (process.env.TARO_ENV === 'xxx')` 在编译时会被静态替换，非目标平台的分支代码会被移除

## 组合提示

- 微信小程序专属能力（如微信支付、订阅消息）需通过条件编译调用 `wx.*` 原生 API
- 状态管理推荐 `mobx`（官方示例）、`zustand` 或 `redux`，与 React/Vue 生态完全兼容
- 网络请求封装推荐基于 `Taro.request` 二次封装拦截器模式，不建议直接用 `axios`（小程序端不可用）
- 搭配 `taro-ui`（React）或 `nut-ui`（Vue 3）快速搭建 UI
