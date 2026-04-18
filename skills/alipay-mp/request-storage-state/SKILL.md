---
name: alipay-mp-request-storage-state
description: 支付宝小程序网络请求、本地存储与全局状态（getApp）的最小工程骨架
tech_stack: [alipay-mp]
language: [javascript]
capability: [http-client, local-storage]
version: "alipay-miniprogram my.request 需基础库 >=1.11.0"
collected_at: 2026-04-18
---

# 支付宝小程序 · 请求 / 存储 / 全局状态

> 来源：bookstack.cn/read/alipay-mini

## 用途
覆盖支付宝小程序的 `my.request` 网络请求、`my.setStorage` 本地缓存，以及用 `getApp().globalData` 做跨页状态共享的最小闭环。

## 何时使用
- 调用业务服务端 HTTPS API
- 持久化 token / 用户偏好（本地自动加密）
- 跨页面共享轻量全局数据

## 基础用法

```javascript
// 请求 + 存储
my.request({
  url: 'https://api.example.com/login',
  method: 'POST',
  data: { from: '支付宝' },
  dataType: 'json',
  success: (res) => {
    my.setStorageSync({ key: 'token', data: res.data.token })
  },
  fail: (res) => my.alert({ content: 'fail' }),
})

// 可取消
const task = my.request({ url: 'https://api.example.com/x' })
task.abort()
```

```javascript
// 全局状态
// app.js
App({ globalData: { user: null } })
// 任意页
const app = getApp()
app.globalData.user = { id: 1 }
```

## 关键 API（摘要）
- `my.request({url, method, headers, data, timeout, dataType, success, fail})`：默认 `Content-Type: application/json`（与 wx/jd 同，但与 form 表单习惯不同）；默认 `timeout=30000ms`
- 返回 task，`task.abort()` 可取消
- `my.uploadFile` / `my.downloadFile`：**不支持个人开发者**
- WebSocket：`my.connectSocket` / `onSocketOpen` / `sendSocketMessage` / `onSocketMessage` / `closeSocket`（单连接）
- `my.setStorage / my.setStorageSync(key, data)`、`my.getStorage / Sync`、`my.removeStorage / Sync`、`my.clearStorage / Sync`、`my.getStorageInfo / Sync`
- `getApp()`：获取 App 实例，访问 `globalData`

## 注意事项

### 网络
- `headers` 默认 `application/json`，传 form 时必须显式改为 `application/x-www-form-urlencoded`
- 错误码：11 无权跨域 / 12 网络错 / 13 超时 / 14 解码失败 / 19 HTTP 错 / 20 限流或已停止

### 存储
- 单条上限 **200KB**（比微信小 5 倍），总容量 10MB
- 数据本地加密，API 自动解密
- WebView 存储与小程序存储相互隔离
- 按账号 + appId 隔离；iOS 会进 iTunes 备份；重装 / 清理支付宝缓存**不会**清除

### 全局状态 / getApp
- `App()` 只能在 `app.js` 调一次
- 不要在 `App()` 内部定义的函数里再 `getApp()`
- `onLaunch` 里页面尚未创建，慎用 `getApp()`
- 不要手工调用生命周期函数

## 组合提示
- 登录 token 存 storage，业务全局态（当前用户、主题）放 `app.globalData`
- 大文件上传 / 下载需企业开发者资质
