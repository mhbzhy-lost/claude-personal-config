---
name: uni-app-request
description: uni.request 网络请求、addInterceptor 拦截器与 luch-request 第三方封装用法
tech_stack: [uni-app]
language: [javascript]
capability: [http-client]
version: "uni-app unversioned; luch-request latest"
collected_at: 2026-04-18
---

# uni-app 网络请求

> 来源：https://uniapp.dcloud.net.cn/api/request/request、api/interceptor、https://github.com/lei-mu/luch-request

## 用途
跨端发起 HTTP 请求（`uni.request`）、通过 `uni.addInterceptor` 统一注入 baseURL / token / 响应处理，或使用 luch-request 获得 axios 风格 API 与多实例/多拦截器能力。

## 何时使用
- 基础 HTTP 调用 → `uni.request`
- 全局统一 URL 前缀、鉴权头、错误处理 → `uni.addInterceptor('request', ...)`
- 需要 Promise、多实例、文件上传下载、自定义验证器 → luch-request

## 基础用法

**uni.request**：

```javascript
uni.request({
  url: 'https://www.example.com/api/user',
  method: 'POST',
  data: { name: 'uniapp' },
  header: { 'custom-header': 'hello' },
  timeout: 10000,
  success: (res) => { console.log(res.data, res.statusCode); },
  fail: (err) => { console.error(err); }
});
```

**拦截器（全局 baseURL + token）**：

```javascript
uni.addInterceptor('request', {
  invoke(args) {
    args.url = 'https://api.example.com' + args.url;
    args.header = { ...args.header, Authorization: `Bearer ${uni.getStorageSync('token')}` };
  },
  success(args) {
    if (args.data.code !== 0) uni.showToast({ title: args.data.msg, icon: 'none' });
  },
  fail(err) { console.log('interceptor-fail', err); }
});
// 移除
uni.removeInterceptor('request');
```

**luch-request**：

```javascript
import Request from 'luch-request';
const http = new Request();

http.setConfig((config) => {
  config.baseURL = 'https://api.example.com';
  return config;
});

http.interceptors.request.use((config) => {
  if (config.custom?.auth) config.header.token = uni.getStorageSync('token');
  return config;
});

http.get('/user/login', { params: { userName: 'a', password: '123' } })
    .then(res => {}).catch(err => {});

http.post('/user/login', { userName: 'a', password: '123' });
http.upload('api/upload/img', { filePath: '...', name: 'file', formData: {} });
```

## 关键 API（摘要）
- `uni.request({ url, data, method, header, timeout, dataType, responseType, success, fail, complete })` → 返回 `RequestTask`
- `RequestTask`：`abort()`、`onHeadersReceived` / `offHeadersReceived`、`onChunkReceived` / `offChunkReceived`
- `uni.addInterceptor(name, { invoke, returnValue, success, fail, complete })`
- `uni.removeInterceptor(name)`
- luch-request：`new Request()`、`setConfig`、`interceptors.request.use` / `interceptors.response.use`、`get/post/put/delete/request/upload/download`
- luch-request 局部 config：`params` `header` `custom`（传给拦截器使用）`timeout` `validateStatus` `getTask` `forcedJSONParsing`

## 注意事项
- `uni.request` 默认 `content-type: application/json`；`timeout` 默认 60s，全局可在 `manifest.json` 里配
- H5 受 CORS 限制；移动端 `localhost` 不可用，真机需 IPv4 可达地址
- 单次请求建议数据 < 50KB
- `uni.addInterceptor` 仅拦截异步 API，同步 API（`*Sync`）不生效；uniCloud 调用也会被 request 拦截器拦截
- `uni.removeInterceptor` 的 HarmonyOS 支持需 HBuilderX 4.23+
- luch-request 在 nvue 下不支持全局挂载
- token 等动态值放 **拦截器**，不要放 `setConfig`；`setConfig` 用于静态/默认值
- luch-request 的 `data` 同 `uni.request`，仅支持 `Object/String/ArrayBuffer`（不支持裸数组，需包对象）
- 条件编译：`timeout`、`sslVerify`、`withCredentials` 等字段仅部分平台支持，务必用 `#ifdef` 包裹

## 组合提示
- 与 `uni-app-state-management` 搭配：token 存 Storage，在拦截器里读取并注入 header
- 与 `uni-app-routing` 搭配：401 响应时 `uni.reLaunch` 回登录页
