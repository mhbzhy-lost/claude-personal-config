---
name: taro-routing
description: Taro 跨端路由：页面导航 API、参数传递、react-router/vue-router 集成与 H5 适配
tech_stack: [taro]
language: [javascript, typescript]
capability: [routing]
version: "taro unversioned (docs at docs.taro.zone)"
collected_at: 2026-04-18
---

# Taro Routing（Taro 路由）

> 来源：https://docs.taro.zone/docs/router, https://docs.taro.zone/docs/router-extend/

## 用途
提供 Taro 应用的页面级路由能力，遵循微信小程序路由规范，同时在 H5/Taro 3.6+ 支持 react-router / vue-router 等前端路由库。

## 何时使用
- 在小程序 + H5 多端项目中做页面跳转与参数传递
- 需要在 H5 端使用标准前端路由库（路由守卫、嵌套路由、basename 等）
- 需要读取页面启动参数或响应 URL 变化

## 基础用法

### 注册页面
在 `app.config.js`（全局配置）的 `pages` 字段中声明各页面路径。

### 页面跳转与传参
```js
import Taro from '@tarojs/taro'

// 新开页面
Taro.navigateTo({ url: '/pages/detail/index?id=2&type=test' })

// 当前栈替换
Taro.redirectTo({ url: '/pages/home/index' })
```

### 读取参数
```js
// 目标页 onLoad / setup 中
const params = Taro.getCurrentInstance().router.params
// => { id: '2', type: 'test' }
```

## 前端路由库接入（Taro 3.6+，H5 为主）

### 启用 HTML 插件
```json
// config/index.js
{ "plugins": ["@tarojs/plugin-html"] }
```

### React + react-router
```jsx
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'

<BrowserRouter>
  <Link to="/pages/router/index/view1?a=1&b=2">view1</Link>
  <Routes>
    <Route path="/pages/router/index/view1" element={<View1 />} />
  </Routes>
</BrowserRouter>
```

### Vue + vue-router
```js
import { createRouter, createWebHistory } from 'vue-router'
const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/tab1', component: Tab1 }]
})
```

## 关键 API（摘要）
- `Taro.navigateTo({ url })` — 新开页面（有返回栈）
- `Taro.redirectTo({ url })` — 替换当前页面
- `Taro.getCurrentInstance().router.params` — 读取当前页参数
- `window.location` — 运行时提供 `protocol / hostname / pathname / search / hash`，支持 `hashchange`
- `window.history` — 运行时提供 `go / back / forward / pushState / replaceState`，支持 `popstate`
- H5 专属：路由模式、`basename`、路由守卫（详见 H5 文档）

## 注意事项
- **不要直接赋值 `location.href` 实现跳转**，必须走 `Taro.navigateTo` 等 API
- **支付宝小程序**：`navigator` 组件有限制，需用 `as` 转换元素类型：`<a as="view">` 或 `<Link as="view" to="xxx" />`
- 参数通过 query 字符串传递，值会被当作字符串（数字/布尔需自行转换）
- 页面路由状态按页面级缓存，而非整站单一路由树

## 组合提示
- 与 `@tarojs/plugin-html` 搭配以启用 DOM 语义的路由库
- 与 `Taro.addInterceptor`（见 taro-request skill）组合，可在跳转前后拦截网络请求
