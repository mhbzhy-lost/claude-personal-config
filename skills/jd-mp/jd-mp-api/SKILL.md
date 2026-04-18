---
name: jd-mp-api
description: "京东小程序平台 API：网络、缓存、界面、路由、媒体、位置、设备、开放能力（京东登录/支付/电商）。"
tech_stack: [jd-miniprogram]
language: [javascript]
capability: [http-client, local-storage, routing, native-device, payment-gateway]
---

# 京东小程序 API（jd.* 运行时能力）

> 来源：
> - https://www.bookstack.cn/read/mp-jd-20200423/
> - https://mp-docs.jd.com/
>
> 所有 API 均挂载在全局 `jd` 对象下。异步 API 遵循统一回调模式：`{ success, fail, complete }`，部分提供 `*Sync` 同步版本。

## 用途

覆盖京东小程序运行时对外提供的宿主能力：从基础的网络请求/本地缓存/界面交互，到京东电商特有的登录、支付、分享、收藏、跳转子程序等开放能力。

## 何时使用

- 在页面/组件内发起 HTTP / 上传 / 下载 / WebSocket
- 本地持久化用户数据、缓存接口响应
- 与用户交互：弹窗、toast、loading、actionSheet、导航栏控制
- 页面跳转、Tab 切换、重启小程序
- 获取地理位置、设备信息、网络状态、剪贴板
- 接入京东登录、京东支付、京东分享/收藏/跳转子程序

## 调用约定

```js
// 标准异步调用（Promise 化需自行封装）
jd.request({
  url: 'https://api.example.com/foo',
  data: { id: 1 },
  method: 'POST',
  header: { 'content-type': 'application/json' },
  success(res) { console.log(res.data, res.statusCode, res.header); },
  fail(err)    { console.error(err); },
  complete()   { /* 必 triggered */ },
});

// 同步调用（以 Sync 结尾）
const value = jd.getStorageSync('token');
jd.setStorageSync('token', 'abc');
```

---

## 1. 网络

### jd.request(object)

发起 HTTPS 请求。**同时最多 5 个并发**，超出会被排队。

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `url` | String | — | 必填，必须 HTTPS，域名需在后台白名单 |
| `data` | Object/String/ArrayBuffer | — | GET 拼 query，POST 放 body |
| `header` | Object | — | `content-type` 默认 `application/json`；不得设 `Referer` |
| `method` | String | `GET` | `OPTIONS/GET/HEAD/POST/PUT/DELETE/TRACE/CONNECT` |
| `dataType` | String | `json` | 设为 `json` 时自动 `JSON.parse` |
| `responseType` | String | `text` | `text` 或 `arraybuffer` |
| `success` | Function | — | `res: { data, statusCode, header }` |

```js
jd.request({
  url: 'https://api.m.jd.com/client.action',
  method: 'POST',
  data: { functionId: 'xxx' },
  success: (res) => { /* res.data */ },
});
```

### jd.uploadFile(object)

上传本地文件（multipart/form-data）。

```js
jd.uploadFile({
  url: 'https://upload.example.com',
  filePath: tempFilePath,
  name: 'file',
  formData: { user: 'jd' },
  success: (res) => console.log(res.data, res.statusCode),
});
```

### jd.downloadFile(object)

下载文件到本地临时路径。返回 `{ tempFilePath, statusCode }`。

### WebSocket

- `jd.connectSocket(object)` — 建立连接（**最多 1 个**）
- `jd.sendSocketMessage({ data })`
- `jd.closeSocket()`
- `jd.onSocketOpen(cb)` / `jd.onSocketMessage(cb)` / `jd.onSocketError(cb)` / `jd.onSocketClose(cb)`

---

## 2. 本地缓存

**单 key 上限 1MB，总上限 10MB**；清理小程序或卸载会丢失。

| API | 说明 |
|---|---|
| `jd.setStorage({ key, data, success, fail })` / `jd.setStorageSync(key, data)` | 写入，会自动 JSON 序列化 |
| `jd.getStorage({ key, success })` / `jd.getStorageSync(key)` | 读取，未命中返回 `''` |
| `jd.removeStorage({ key, success })` / `jd.removeStorageSync(key)` | 删除单 key |
| `jd.clearStorage()` / `jd.clearStorageSync()` | 清空全部 |
| `jd.getStorageInfo({ success })` / `jd.getStorageInfoSync()` | 返回 `{ keys, currentSize, limitSize }`，单位 KB |

```js
jd.setStorageSync('user', { id: 1, name: 'jd' });
const u = jd.getStorageSync('user');   // 自动反序列化
```

---

## 3. 界面交互

### Toast / Loading

```js
jd.showToast({ title: '成功', icon: 'success', duration: 1500, mask: false });
jd.hideToast();

jd.showLoading({ title: '加载中', mask: true });
jd.hideLoading();
```

- `icon`: `success` / `loading` / `none`
- `showLoading` 与 `showToast` 互斥，需对应 `hide*` 关闭

### Modal / ActionSheet

```js
jd.showModal({
  title: '提示', content: '确定删除？',
  showCancel: true, cancelText: '取消', confirmText: '确定',
  success: ({ confirm, cancel }) => { if (confirm) doDelete(); },
});

jd.showActionSheet({
  itemList: ['A', 'B', 'C'],
  itemColor: '#000',
  success: ({ tapIndex }) => { /* 0..n */ },
});
```

### 导航栏

```js
jd.setNavigationBarTitle({ title: '首页' });
jd.showNavigationBarLoading();
jd.hideNavigationBarLoading();
```

---

## 4. 路由（页面栈）

页面栈最多 **10 层**，超出 `navigateTo` 无效。

| API | 行为 | 典型场景 |
|---|---|---|
| `jd.navigateTo({ url })` | 入栈，保留当前页 | 详情页、子流程 |
| `jd.redirectTo({ url })` | 替换当前页 | 登录跳转 |
| `jd.switchTab({ url })` | 跳到 tabBar 页，关闭非 tab 页 | Tab 切换 |
| `jd.navigateBack({ delta: 1 })` | 出栈 N 层 | 返回 |
| `jd.reLaunch({ url })` | 关闭所有页面并打开新页 | 重置 |

```js
jd.navigateTo({ url: '/pages/detail/detail?id=123' });
jd.switchTab({ url: '/pages/cart/cart' });   // 必须是 app.json 中 tabBar 项
```

注意：`switchTab` 目标 URL 不能带 query；传参请用全局状态或缓存。

---

## 5. 媒体

```js
// 选图（相册 / 相机）
jd.chooseImage({
  count: 9,                                 // 最多 9
  sizeType: ['original', 'compressed'],
  sourceType: ['album', 'camera'],
  success: ({ tempFilePaths, tempFiles }) => {},
});

// 预览大图
jd.previewImage({
  current: urls[0],
  urls: ['https://.../a.jpg', 'https://.../b.jpg'],
});

// 选视频
jd.chooseVideo({
  sourceType: ['album', 'camera'],
  maxDuration: 60,
  camera: 'back',
  success: ({ tempFilePath, duration, size, width, height }) => {},
});
```

---

## 6. 文件管理

```js
jd.saveFile({ tempFilePath, success: ({ savedFilePath }) => {} });
jd.getSavedFileList({ success: ({ fileList }) => {} });
jd.getSavedFileInfo({ filePath, success: ({ size, createTime }) => {} });
jd.removeSavedFile({ filePath });
jd.openDocument({ filePath, fileType: 'pdf' });   // pdf/doc/xls/ppt/docx/xlsx/pptx
```

本地保存空间有限，不再使用的文件及时 `removeSavedFile`。

---

## 7. 位置

```js
jd.getLocation({
  type: 'gcj02',    // gcj02 可用于 openLocation；wgs84 为原始 GPS
  success: ({ latitude, longitude, speed, accuracy }) => {},
});

jd.openLocation({
  latitude, longitude, scale: 18,
  name: '京东大厦', address: '北京亦庄',
});
```

---

## 8. 设备

### 系统信息 / 网络

```js
const sys = jd.getSystemInfoSync();
// { brand, model, pixelRatio, screenWidth, screenHeight, windowWidth, windowHeight,
//   statusBarHeight, language, version, system, platform, SDKVersion }

jd.getNetworkType({ success: ({ networkType }) => {} });   // wifi/2g/3g/4g/none/unknown
jd.onNetworkStatusChange(({ isConnected, networkType }) => {});
```

### 剪贴板 / 电话 / 扫码

```js
jd.setClipboardData({ data: 'text' });
jd.getClipboardData({ success: ({ data }) => {} });

jd.makePhoneCall({ phoneNumber: '10010' });

jd.scanCode({
  onlyFromCamera: false,
  scanType: ['barCode', 'qrCode'],
  success: ({ result, scanType, charSet, path }) => {},
});
```

---

## 9. 开放能力（京东特有）

### 9.1 登录 `jd.login`

返回临时 `code`，**必须由开发者后端换取 openid / session_key / 用户 token**。code 有效期短，一次性。

```js
jd.login({
  success: ({ code }) => {
    jd.request({
      url: 'https://your-server.com/jd/login',
      method: 'POST',
      data: { code },
      success: ({ data }) => {
        jd.setStorageSync('token', data.token);
      },
    });
  },
});
```

### 9.2 用户信息 `jd.getUserInfo`

需用户在界面点击按钮触发授权（组件 `<button open-type="getUserInfo">`）。回调返回加密 `encryptedData` + `iv`，**后端解密**后落库。

```js
jd.getUserInfo({
  success: ({ userInfo, rawData, signature, encryptedData, iv }) => {},
});
```

### 9.3 手机号授权 `jd.getAuthCode`

OAuth 2.0 流程，返回授权码交由后端换手机号。

```js
jd.getAuthCode({
  scope: 'snsapi_base',   // 或 snsapi_userinfo
  success: ({ authCode }) => { /* 后端换手机号 */ },
});
```

### 9.4 京东支付 `jd.requestPayment`

前提：商户已开通 **JD Finance 收款账户**；**签名 / MD5 必须在后端完成**，前端仅透传。

```js
// 1) 后端下单返回支付参数
// 2) 前端调用
jd.requestPayment({
  appId: 'xxxxx',
  orderId: '2024xxxx',
  payChannel: 'jdpay',
  merchantNo: 'xxx',
  totalAmount: '0.01',
  signData: 'BACKEND_SIGNED_STRING',  // 后端签名
  sign: 'MD5_HASH',                    // 后端计算
  success: (res) => {  /* 支付成功 */ },
  fail:    (err) => {  /* 用户取消 / 支付失败 */ },
});
```

**禁止**在前端持有商户密钥或自行拼签名。

### 9.5 跳转子程序

```js
jd.navigateToMiniProgram({
  appId: 'otherAppId',
  path: 'pages/index/index?foo=bar',
  extraData: { from: 'A' },
  envVersion: 'release',   // develop / trial / release
  success: () => {},
});

jd.navigateBackMiniProgram({ extraData: { result: 'ok' } });
```

### 9.6 分享

```js
jd.showShareMenu({ withShareTicket: true });
jd.hideShareMenu();

// 页面内自定义分享内容
Page({
  onShareAppMessage(options) {
    // options.from: 'button' | 'menu'
    return {
      title: '京东好物推荐',
      path: '/pages/detail/detail?id=123',
      imageUrl: 'https://.../share.png',
    };
  },
});
```

### 9.7 收藏 / 关注

```js
jd.showFavoriteMenu();
jd.getFavoriteStatus({ success: ({ isFavorite }) => {} });
```

---

## 关键陷阱

- **域名白名单**：`request` / `uploadFile` / `downloadFile` / `connectSocket` 的目标域名必须在京东小程序后台逐项配置，并启用 HTTPS / WSS
- **request 并发**：超过 5 条会排队，长耗时接口建议合批
- **Storage 总量 10MB**：超过 `setStorage` 直接失败，大资源走 `saveFile`
- **`switchTab` 不带 query**：需传参用 storage 或全局 getApp().globalData
- **Next 15 / React 19 无关**：京东小程序运行在自有 JSCore，不支持 DOM / window
- **登录 code 一次性**：不可缓存，每次登录都要重新 `jd.login`
- **支付签名必须在后端**：任何前端签名方案都是安全风险
- **授权按钮**：`getUserInfo` / `getPhoneNumber` / `getAuthCode` 等必须由用户主动点击触发，不能在 `onLoad` 里直接调
- **异步 API 无 Promise**：官方只回调，推荐自封装 `promisify`

```js
// 通用 promisify
const jdp = (name) => (opts = {}) =>
  new Promise((resolve, reject) => {
    jd[name]({ ...opts, success: resolve, fail: reject });
  });
const request = jdp('request');
```

## 组合提示

- 与 `jd-mp-core`（app/page/component 生命周期、路由配置）组合完成一次完整小程序开发
- 与 `jd-mp-components`（视图组件、表单）组合覆盖 UI 层
- 京东电商场景（商品详情、下单、支付）围绕 `jd.login` → 后端换 token → `jd.requestPayment` 主链路；分享/收藏为增长手段
