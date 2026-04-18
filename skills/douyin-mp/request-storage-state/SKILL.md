---
name: douyin-mp-request-storage-state
description: 抖音小程序 tt.request / tt.setStorage / tt.getStorage 的网络与本地缓存骨架
tech_stack: [douyin-mp]
language: [javascript]
capability: [http-client, local-storage]
version: "douyin-miniapp 基础库 1.0.0 (tt.setStorage / tt.getStorage)"
collected_at: 2026-04-18
---

# 抖音小程序 · 请求 / 本地缓存

> 来源：developer.open-douyin.com/docs/resource/zh-CN/mini-app

## 用途
覆盖抖音/头条系小程序 `tt.request` HTTPS 网络请求与 `tt.setStorage / tt.getStorage` 本地缓存基础能力。

## 何时使用
- 调用业务服务端 HTTPS API（域名需在后台白名单）
- 持久化 token、用户偏好等 KV 数据

## 基础用法

```javascript
// 请求
const task = tt.request({
  url: 'https://api.example.com/login',
  method: 'POST',
  data: { code: 'xxx' },
  header: { 'content-type': 'application/json' },
  timeout: 10000,
  dataType: 'json',
  success: (res) => {
    tt.setStorage({ key: 'token', data: res.data.token })
  },
})
// task.abort() 可取消

// 读
tt.getStorage({
  key: 'token',
  success: (res) => console.log(res.data),
  fail: (res) => console.log(res.errMsg),
})
```

## 关键 API（摘要）
- `tt.request({url, method, header, data, timeout, dataType, responseType, success, fail, complete})` → `RequestTask`
- Success 返回 `{ errMsg: 'request:ok', statusCode, data, profile }`
- `tt.setStorage({key, data, success, fail, complete})` → `{ errMsg: 'setStorage:ok' }`
- `tt.getStorage({key, success, fail, complete})` → `{ data, errMsg }`

## 注意事项

### 网络
- **生产版仅 HTTPS**；测试版 HTTP/HTTPS 均可
- 最大超时 60s（`timeout` 上限 60000ms）
- `header` 不能设置 `referer` / `user-agent`
- IDE 不支持 `profile` 字段调试

### 存储
- 单 key 上限 1MB，总容量 10MB，超限 `fail` 回调
- 同 key 新写直接覆盖旧值
- `tt.getStorage` **不支持沙箱环境**
- key 缺失或类型不支持时 `data` 返回空字符串
- **缓存清除仅发生于**三种情况：(1) 用户在宿主 App 登出；(2) 系统设置里清理 App 缓存；(3) 小程序长期未使用被清理——正常场景缓存长期持久

### 错误码（setStorage）
- 117799 params.key 校验失败（key 必须非空字符串）
- 117701 单条超限
- 117702 总量超 10MB
- 117703 / 117784 框架错误或未注册 API，联系官方支持

## 组合提示
- 抖音宿主登录态：配合 `tt.login` 拿 code → 服务端换 session → token 存 `tt.setStorage`
- 域名未在后台配置时 `tt.request` 直接失败，需先过开发者平台配置
