---
name: wechat-mp-request-storage-state
description: 微信小程序网络请求、本地存储、登录态与 MobX 状态管理的工程化骨架
tech_stack: [wechat-mp]
language: [javascript, typescript]
capability: [http-client, local-storage, state-management]
version: "wechat-miniprogram unversioned; mobx-miniprogram-bindings 需基础库 >=2.11.0"
collected_at: 2026-04-18
---

# 微信小程序 · 请求 / 存储 / 登录态 / MobX

> 来源：developers.weixin.qq.com + wechat-miniprogram/mobx-miniprogram-bindings

## 用途
覆盖微信小程序四件套：`wx.request` 网络请求、`wx.setStorage` 本地持久化、`wx.login` 登录态换取、`mobx-miniprogram-bindings` 跨页状态同步。

## 何时使用
- 需要在小程序内调用业务 HTTPS API
- 需要持久化 token / 用户偏好到本地
- 需要完成「code → 换 session → 拿自定义 token」登录闭环
- 页面 / 组件需要响应式订阅全局 store

## 基础用法

### 登录 + 请求 + 存储联动
```javascript
wx.login({
  success(res) {
    if (!res.code) return console.log('login fail:', res.errMsg)
    wx.request({
      url: 'https://your-server.com/api/login',
      method: 'POST',
      data: { code: res.code },
      success(loginRes) {
        wx.setStorageSync('token', loginRes.data.token)
      },
    })
  },
})
```

### MobX store（Component 绑定）
```javascript
import { storeBindingsBehavior } from 'mobx-miniprogram-bindings'
import { store } from './store'

Component({
  behaviors: [storeBindingsBehavior],
  storeBindings: {
    store,
    fields: { numA: 'numA', sum: 'sum' },
    actions: { buttonTap: 'update' },
  },
})
```

### MobX（Page 手工绑定，须清理）
```javascript
import { createStoreBindings } from 'mobx-miniprogram-bindings'
Page({
  onLoad() {
    this.storeBindings = createStoreBindings(this, { store, fields: ['numA'] })
  },
  onUnload() { this.storeBindings.destroyStoreBindings() },
})
```

## 关键 API（摘要）
- `wx.request({url, method, data, header, timeout, success, fail})` → 返回 `RequestTask`，支持 `.abort()` / `.onChunkReceived` / `.onHeadersReceived`
- `wx.setStorage / wx.setStorageSync(key, data)`：可加 `encrypt: true`，读时也要 `encrypt: true`
- `wx.getStorage / wx.removeStorage / wx.clearStorage / wx.getStorageInfo`（均有 Sync 版本）
- `wx.batchSetStorage`：原子批量写
- `wx.login()` → `{ code }`（5 分钟有效），配合服务端 `auth.code2Session` 换 `session_key + openid`
- `wx.checkSession()`：session 是否过期
- `storeBindingsBehavior` + `storeBindings` 定义段（Component）
- `createStoreBindings(this, config)` → `{ destroyStoreBindings, updateStoreBindings }`（Page / onLoad 后确定 store）
- `ComponentWithStore` / `BehaviorWithStore` / `initStoreBindings`（TS / Chaining API）

## 注意事项

### 网络
- 生产环境仅允许 HTTPS，域名必须在管理后台配置
- 并发请求最多 10；`referer` 自动填充、无法覆盖
- 不自动携带 Cookie，需手动放到 `header`
- 页面跳转不会中断请求，需要时显式 `RequestTask.abort()`

### 存储
- 单 key 上限 1MB，总量 10MB；跨 session 持久化
- 存储按小程序隔离，不会跨应用泄露

### 登录态
- **绝不能把 `session_key` 落到小程序端**，只保留服务端签发的自定义 token
- session 过期先 `wx.checkSession`，失败再重新 `wx.login`

### MobX 陷阱
- store 字段变更到 `this.data` 是 **延迟到下个 `wx.nextTick`**，需立即刷新调 `updateStoreBindings()`
- 对象子字段赋值（`this.someObject.x = 'y'`）不触发更新，必须整体替换：`Object.assign({}, obj, { x: 'y' })`
- 与 `computedBehavior` 共用时顺序为 `[storeBindingsBehavior, computedBehavior]`
- 手工绑定必须在 `onUnload / detached` 调 `destroyStoreBindings`，否则内存泄漏
- TS 用法需 `miniprogram-api-typings ^4.0.0`，`fields` / `actions` / `storeBindings` 数组末尾加 `as const`

## 组合提示
- `wx.login` + `wx.request` + `wx.setStorage` 三者构成最小可用登录链路
- 跨页共享的 token / userInfo 推荐落到 MobX store + storage 双写，store 驱动 UI，storage 负责冷启动恢复
