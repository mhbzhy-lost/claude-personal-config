---
name: taro-request
description: Taro 网络请求：Taro.request 原生 API、axios + @tarojs/plugin-http 跨端方案与拦截器
tech_stack: [taro]
language: [javascript, typescript]
capability: [http-client]
version: "taro 3.6.0+ (for @tarojs/plugin-http); webpack4 needs 3.6.6+"
collected_at: 2026-04-18
---

# Taro Request（Taro 网络请求）

> 来源：https://docs.taro.zone/docs/apis/network/request/, https://docs.taro.zone/docs/request/, https://docs.taro.zone/docs/apis/network/request/addInterceptor/

## 用途
在 Taro 应用中发起 HTTPS 请求。提供三种能力：原生 `Taro.request`、web 生态库（axios）跨端适配、拦截器链。

## 何时使用
- 直接发起请求、贴近小程序原生 API → `Taro.request`
- 想在多端（H5 / 小程序 / RN）统一用 axios 等 web 库 → `@tarojs/plugin-http`
- 需要统一注入 token、日志、超时控制 → `Taro.addInterceptor`

## Taro.request 基础用法

```js
import Taro from '@tarojs/taro'

// 回调风格
Taro.request({
  url: 'https://api.example.com/test.php',
  data: { x: '', y: '' },
  header: { 'content-type': 'application/json' },
  method: 'POST',
  success(res) { console.log(res.data) },
})

// async/await 风格
const res = await Taro.request({ url: '...', data: {} })
```

### 关键参数
| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `url` | string | — | 必填，接口地址 |
| `data` | any | — | 请求参数 |
| `header` | object | `{ 'content-type': 'application/json' }` | 请求头 |
| `method` | string | `GET` | GET/POST/PUT/DELETE 等 |
| `timeout` | number | `60000` | 超时毫秒数 |
| `dataType` | string | — | 响应数据格式（`json` 会自动 parse） |

### data 序列化规则
- **GET**：转 query string（`encodeURIComponent`）
- **POST + application/json**：JSON 序列化
- **POST + application/x-www-form-urlencoded**：转 query string

### 响应结构
`{ data, header, statusCode, errMsg, cookies? }`

### 返回值
`RequestTask<T>` — 支持 `.abort()` 取消请求。

## axios 跨端方案（@tarojs/plugin-http）

### 安装与配置
```bash
npm i @tarojs/plugin-http axios
```
```js
// config/index.js
module.exports = {
  plugins: ['@tarojs/plugin-http'],
}
```

### 插件配置项
| 参数 | 默认 | 说明 |
|------|------|------|
| `enableCookie` | `false` | 启用 Set-Cookie 支持 |
| `disabledFormData` | `true` | 禁用全局 FormData |
| `disabledBlob` | `true` | 禁用全局 Blob |

### 使用 axios
```js
import axios from 'axios'
const request = axios.create({ baseURL: '' })
export default request
```
> 原理：在小程序运行时注入模拟的 `XMLHttpRequest`，使 axios 等 web 库可直接运行。

## 拦截器（Taro.addInterceptor）

### 自定义拦截器（洋葱模型）
```js
const interceptor = function (chain) {
  const { method, data, url } = chain.requestParams
  console.log(`http ${method || 'GET'} --> ${url}`, data)
  return chain.proceed(chain.requestParams).then(res => {
    console.log(`http <-- ${url}`, res)
    return res
  })
}
Taro.addInterceptor(interceptor)
Taro.request({ url: '...' })
```

### 内置拦截器
```js
Taro.addInterceptor(Taro.interceptors.logInterceptor)      // 请求日志
Taro.addInterceptor(Taro.interceptors.timeoutInterceptor)  // 超时抛错
```

平台支持：微信 / 百度 / 支付宝 / 抖音 / QQ 小程序、H5、ASCF、RN、Harmony。

## 注意事项
- `@tarojs/plugin-http` **不支持文件上传**，需改走 `Taro.uploadFile`
- 小程序环境下 `FormData` / `Blob` 默认被置为 `undefined`，如需使用要显式 `disabledFormData: false` / `disabledBlob: false`
- `@tarojs/plugin-http` 要求 **Taro 3.6.0+**；若用 webpack4 需 **3.6.6+**
- `Taro.request` 默认超时 60s，建议按业务缩短
- `content-type` 默认 `application/json`，POST 非 JSON 时必须显式指定
- 拦截器必须调用 `chain.proceed(requestParams)`，否则请求不会发出

## 组合提示
- 与 Redux/MobX（见 taro-state-management）组合：在异步 action 中调用 axios/Taro.request
- 与前端路由（见 taro-routing）组合：拦截器中可基于 `Taro.getCurrentInstance().router` 做鉴权跳转
