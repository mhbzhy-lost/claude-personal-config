---
name: jd-mp-request-storage-state
description: 京东小程序 jd.request / jd.setStorage 与 getApp 全局状态的工程骨架
tech_stack: [jd-mp]
language: [javascript]
capability: [http-client, local-storage]
version: "jd-miniprogram unversioned (docs mp-jd-20200423)"
collected_at: 2026-04-18
---

# 京东小程序 · 请求 / 存储 / 全局状态

> 来源：bookstack.cn/read/mp-jd-20200423

## 用途
覆盖京东小程序 `jd.request` 网络请求、`jd.setStorage` 本地缓存及 `getApp()` 全局状态的最小闭环。

## 何时使用
- 调用业务 HTTPS API，需要取消时使用 `requestTask.abort()`
- 持久化轻量 KV 数据（token、偏好等）
- 跨页共享全局态（用户信息、配置）

## 基础用法

```javascript
// 请求（可取消）
const task = jd.request({
  url: 'https://api.example.com/login',
  method: 'POST',
  data: { name: 'cortana' },
  header: { 'content-type': 'application/json' },
  success(res) {
    jd.setStorage({ key: 'token', data: res.data.token })
  },
})
// task.abort()

// 同步读
const token = jd.getStorageSync('token')
```

## 关键 API（摘要）
- `jd.request({url, data, header, method, dataType, responseType, success, fail, complete})` → `requestTask` with `.abort()`
- method 取值仅 `GET` / `POST`（必须大写）；默认 `GET`、`dataType=json`、`responseType=text`
- Success 返回 `{ data, statusCode, header }`
- Storage Async：`jd.setStorage / getStorage / removeStorage / clearStorage / getStorageInfo`
- Storage Sync：`jd.setStorageSync(key, data)`、`jd.getStorageSync(key)` 直接返回值、`jd.removeStorageSync / clearStorageSync / getStorageInfoSync`
- `getApp()`：获取 App 实例访问 `globalData`，`app.js` 内部用 `this`

## 注意事项

### 网络
- 默认 `Content-Type: application/json`
- `header` 不允许设置 `Referer`
- Cookie header 含中文必须 URL 编码
- GET → query string（URL encode）；POST + json → JSON 序列化；POST + form-urlencoded → query string
- method 值必须大写，否则无效

### 存储
- 本地存储总量上限 10MB
- 同步 API 需 try/catch 捕获异常

### 全局状态
- `App()` 只在 `app.js` 调一次
- 页面创建前（`onLaunch` 早期）不要用 `getApp()`
- 可在 App 中定义 `onPageNotFound` 做目标页不存在时的兜底跳转

## 组合提示
- 登录态：`jd.login` code → 服务端换 token → `jd.setStorage` 持久化 → `getApp().globalData` 驱动 UI
- 长列表分页等可能中途切走的请求，务必保存 `requestTask` 以便 `abort()`
