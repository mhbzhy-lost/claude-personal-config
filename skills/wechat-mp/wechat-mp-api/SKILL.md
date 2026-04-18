---
name: wechat-mp-api
description: "微信小程序平台 API：网络、存储、界面、路由、媒体、位置、设备、开放接口。"
tech_stack: [wechat-miniprogram]
language: [javascript]
capability: [http-client, local-storage, native-device, native-navigation, payment-gateway]
---

# 微信小程序平台 API

> 来源：https://developers.weixin.qq.com/miniprogram/dev/api/
> 版本基准：基础库 2.30+（2024），涉及最低版本的 API 单独标注。

## 用途

微信小程序与宿主环境交互的唯一通道。覆盖八大类：网络通信、本地存储、界面交互、路由导航、多媒体、地理位置、设备能力、开放接口（登录/支付/授权）。

## 何时使用

- 与后端通信（HTTP、文件上传下载、WebSocket）
- 客户端持久化（本地缓存 / 文件系统）
- 原生 UI：Toast / Modal / Loading / ActionSheet
- 页面跳转、参数传递、跨页面通信
- 微信登录、支付、授权、用户信息等开放能力
- 读取设备/窗口/安全区信息，适配自定义导航栏

## 通用约定

所有异步 API 统一签名：

```js
wx.apiName({
  // 入参
  success(res) {},   // 成功
  fail(err) {},      // 失败（err.errMsg / err.errCode）
  complete() {},     // 无论成败
})
```

**Promise 化**：基础库 2.10.2+ 起，不传 `success/fail/complete` 时返回 Promise。

```js
try {
  const res = await wx.apiName({ /* 入参 */ })
} catch (err) {
  console.error(err.errMsg)
}
```

---

## 一、网络

### wx.request — HTTP 请求

```js
const task = wx.request({
  url: 'https://api.example.com/data',   // 必须 HTTPS（开发者工具可关闭校验）
  method: 'POST',                        // GET | POST | PUT | DELETE | ...
  header: { 'content-type': 'application/json' },
  data: { key: 'value' },                // GET 时会拼到 query
  dataType: 'json',                      // 自动 JSON.parse；传其他值不解析
  responseType: 'text',                  // 'text' | 'arraybuffer'
  timeout: 10000,                         // 毫秒，默认 60000
  enableHttp2: false,
  enableCache: false,
  success(res) {
    res.statusCode  // HTTP 状态码
    res.data        // 响应数据（dataType:'json' 时已解析）
    res.header      // 响应头
    res.cookies
  },
})

// RequestTask
task.abort()
task.onHeadersReceived((res) => console.log(res.header))
task.offHeadersReceived()
```

**关键限制**：
- **并发上限 10 个**，超过排队
- 域名必须配置在「小程序管理后台 → 服务器域名」白名单（request 合法域名）
- 默认 `content-type: application/json`；发 form 需改 `application/x-www-form-urlencoded`

### wx.uploadFile — 上传文件

```js
const task = wx.uploadFile({
  url: 'https://api.example.com/upload',
  filePath: tempFilePath,  // 本地临时路径（拍照/选图返回）
  name: 'file',            // 后端字段名（必填）
  formData: { user: 'test' },
  header: { Authorization: 'Bearer xxx' },
  success(res) {
    const data = JSON.parse(res.data)   // 陷阱：res.data 是字符串，需手动 parse
    res.statusCode
  },
})

task.onProgressUpdate((res) => {
  res.progress                       // 百分比
  res.totalBytesSent
  res.totalBytesExpectedToSend
})
task.abort()
```

### wx.downloadFile — 下载文件

```js
const task = wx.downloadFile({
  url: 'https://example.com/file.pdf',
  filePath: `${wx.env.USER_DATA_PATH}/a.pdf`, // 可选：直接落盘到用户目录
  success(res) {
    if (res.statusCode === 200) {
      res.tempFilePath   // 未指定 filePath 时返回的临时路径（应用生命周期内有效）
    }
  },
})
task.onProgressUpdate((res) => console.log(res.progress))
```

### wx.connectSocket — WebSocket

```js
const socket = wx.connectSocket({
  url: 'wss://example.com/ws',
  header: { token: 'xxx' },
  protocols: ['protocol1'],
})

socket.onOpen(() => socket.send({ data: JSON.stringify({ type: 'ping' }) }))
socket.onMessage((res) => console.log(res.data))
socket.onError((err) => console.error(err.errMsg))
socket.onClose((res) => console.log(res.code, res.reason))

socket.close({ code: 1000, reason: 'normal' })
```

**关键限制**：**并发 WebSocket 上限 5 个**。

---

## 二、数据缓存

单个小程序缓存上限 **10 MB**，key-value 存储，小程序内全局共享。支持原生类型 / Date / RegExp；**不支持 Function**；`undefined` 字段会丢失。

### 异步接口

```js
wx.setStorage({
  key: 'userInfo',
  data: { name: 'test', age: 18 },
  encrypt: false,   // 2.21.3+ 开启加密
  success() {},
})

wx.getStorage({
  key: 'userInfo',
  encrypt: false,
  success(res) { console.log(res.data) },
  fail(err) { /* key 不存在时走 fail */ },
})

wx.removeStorage({ key: 'userInfo', success() {} })
wx.clearStorage()

wx.getStorageInfo({
  success(res) {
    res.keys          // 所有 key
    res.currentSize   // 已用 KB
    res.limitSize     // 上限 KB
  },
})
```

### 同步接口

```js
wx.setStorageSync('token', 'abc123')
const token = wx.getStorageSync('token')   // key 不存在返回 ''（空字符串，不抛异常）
wx.removeStorageSync('token')
wx.clearStorageSync()
const info = wx.getStorageInfoSync()
```

**陷阱**：
- **Sync 不存在返回 `""`**，布尔判断 `if (!value)` 无法区分「未存」和「空串」
- **空字符串 key 会被拒绝**（`setStorageSync('', x)` 抛错）；key 建议使用固定命名空间
- 同步 API 阻塞渲染，非启动关键路径改用异步
- 超过 10 MB 写入会 fail；大文件应走 `wx.getFileSystemManager()`

---

## 三、界面交互

### wx.showToast — 轻提示

```js
wx.showToast({
  title: '提交成功',
  icon: 'success',   // 'success' | 'error' | 'loading' | 'none'
  image: '/img/custom.png',   // 自定义图标，优先级高于 icon
  duration: 2000,    // 默认 1500
  mask: true,        // 透明蒙层防穿透
})
wx.hideToast()
```

**陷阱**：`icon: 'success' | 'error'` 时 title 最多 **7 个汉字**；`icon: 'none'` 可显示两行长文本。

### wx.showModal — 模态弹窗

```js
const res = await wx.showModal({
  title: '提示',
  content: '确定删除此记录吗？',
  showCancel: true,          // 默认 true
  cancelText: '取消',        // 最多 4 字
  cancelColor: '#000000',
  confirmText: '删除',       // 最多 4 字
  confirmColor: '#576B95',
  editable: false,           // 2.17.1+ 开启输入框
  placeholderText: '请输入',
})

if (res.confirm) { /* 点了确定 */ }
else if (res.cancel) { /* 点了取消 */ }
// editable:true 时：res.content 为用户输入的文本
```

### wx.showLoading — 加载提示

```js
wx.showLoading({ title: '加载中...', mask: true })
// 必须手动关闭（不会自动消失）
wx.hideLoading()
```

**陷阱**：`showLoading` 与 `showToast` **互斥**，调用一个会关闭另一个；不要同时用。

### wx.showActionSheet — 操作菜单

```js
try {
  const res = await wx.showActionSheet({
    itemList: ['拍照', '从相册选择'],   // 最多 6 项；不要包含「取消」
    itemColor: '#000000',
  })
  console.log(res.tapIndex)    // 点击序号，从 0 起
} catch (err) {
  // 用户点取消或点系统 back → 走 fail / Promise reject
  // err.errMsg === 'showActionSheet:fail cancel'
}
```

**陷阱**：用户取消走 `fail`，不是 success；`itemList` 里不要手动放「取消」项。

---

## 四、路由导航

页面栈最大深度 **10 层**，超出 `navigateTo` 失败。

### wx.navigateTo — push 新页面

```js
wx.navigateTo({
  url: '/pages/detail/detail?id=123&type=news',
  events: {
    // 监听被打开页面发回的事件
    dataFromDetail(data) { console.log(data) },
  },
  success(res) {
    // 向被打开页面发送数据
    res.eventChannel.emit('dataFromList', { extra: 'info' })
  },
})

// 被打开页面
Page({
  onLoad(options) {
    console.log(options.id)   // '123'
    const ch = this.getOpenerEventChannel()
    ch.on('dataFromList', (data) => console.log(data.extra))
    ch.emit('dataFromDetail', { result: 'ok' })
  },
})
```

**限制**：不能跳 tabBar 页；页面栈满 10 层后失败。

### wx.redirectTo — 替换当前页

```js
wx.redirectTo({ url: '/pages/login/login' })
```

页面栈深度不变；不能跳 tabBar。

### wx.switchTab — 切换到 tab 页

```js
wx.switchTab({ url: '/pages/index/index' })
```

**会关闭所有非 tabBar 页**；**url 不支持参数**（`?key=value` 会被忽略）。跨 tab 传数据用 `globalData` / EventBus / Storage。

### wx.navigateBack — 返回

```js
wx.navigateBack({ delta: 1 })  // 默认 1；超出实际层数回到首页
```

### wx.reLaunch — 重置页面栈

```js
wx.reLaunch({ url: '/pages/index/index?reset=1' })
```

可跳任何页面（含 tabBar），**清空整个页面栈**。

### 路由 API 速查

| API | 效果 | 能跳 tabBar | 页面栈变化 | 可传参 |
|-----|------|:---:|------|:---:|
| `navigateTo` | push | 否 | +1（上限 10） | 是 |
| `redirectTo` | replace | 否 | 不变 | 是 |
| `switchTab` | 切 tab | 是 | 清空非 tab 页 | **否** |
| `navigateBack` | 返回 | — | -delta | 否（用 EventChannel） |
| `reLaunch` | 重置 | 是 | 清空后 =1 | 是 |

---

## 五、媒体

### wx.chooseImage — 选择图片（仍可用，新项目建议 `chooseMedia`）

```js
const res = await wx.chooseImage({
  count: 9,
  sizeType: ['original', 'compressed'],
  sourceType: ['album', 'camera'],
})
res.tempFilePaths    // ['/tmp/xxx.jpg', ...]
res.tempFiles        // [{ path, size }]
```

### wx.chooseMedia — 选择图片或视频（推荐，2.10.0+）

```js
const res = await wx.chooseMedia({
  count: 9,
  mediaType: ['image', 'video'],    // 或 ['image'] / ['video']
  sourceType: ['album', 'camera'],
  maxDuration: 30,                   // 视频最长拍摄秒数
  sizeType: ['original', 'compressed'],
  camera: 'back',                    // 'back' | 'front'
})
res.tempFiles   // [{ tempFilePath, size, duration, height, width, thumbTempFilePath, fileType }]
res.type        // 'image' | 'video' | 'mix'
```

### wx.chooseVideo — 选择视频

```js
const res = await wx.chooseVideo({
  sourceType: ['album', 'camera'],
  maxDuration: 60,
  camera: 'back',
  compressed: true,
})
res.tempFilePath    // 视频临时路径
res.duration        // 秒
res.size            // 字节
res.width
res.height
```

### wx.getRecorderManager — 录音管理器

```js
const rec = wx.getRecorderManager()

rec.onStart(() => console.log('开始'))
rec.onStop((res) => {
  res.tempFilePath   // 文件路径
  res.duration       // 毫秒
  res.fileSize       // 字节
})
rec.onError((err) => console.error(err))

rec.start({
  duration: 60000,        // 毫秒，最大 600000（10 分钟）
  sampleRate: 16000,       // 8000/16000/44100/...
  numberOfChannels: 1,
  encodeBitRate: 96000,
  format: 'mp3',           // 'mp3' | 'aac' | 'wav' | 'PCM'
})

rec.pause()
rec.resume()
rec.stop()
```

**前置**：需用户授权 `scope.record`。

### wx.createInnerAudioContext — 音频播放

```js
const audio = wx.createInnerAudioContext()
audio.src = 'https://example.com/music.mp3'
audio.autoplay = false
audio.loop = false
audio.volume = 1                // 0~1
audio.obeyMuteSwitch = true     // iOS 遵循系统静音

audio.onCanplay(() => audio.play())
audio.onPlay(() => {})
audio.onTimeUpdate(() => {
  console.log(audio.currentTime, audio.duration)   // 秒
})
audio.onEnded(() => {})
audio.onError((err) => console.error(err.errCode))

audio.play()
audio.pause()
audio.stop()
audio.seek(30)      // 跳 30 秒
audio.destroy()     // 页面 onUnload 必须调用，否则内存泄漏
```

**陷阱**：
- **未调用 `destroy()` 会持续占用系统音频通道**，同时存在过多实例会创建失败
- `obeyMuteSwitch: true` 时 iOS 静音下无声，背景音乐场景常需要 `false`

---

## 六、位置

### wx.getLocation — 当前位置

```js
const res = await wx.getLocation({
  type: 'gcj02',                    // 'wgs84'(GPS) | 'gcj02'(国测局，推荐，可传入 map 组件)
  isHighAccuracy: false,
  highAccuracyExpireTime: 3000,     // 高精度超时毫秒
})
res.latitude
res.longitude
res.speed          // m/s，需要 GPS
res.accuracy       // 精度 m
res.altitude       // 高度 m
```

**前置条件（2022 年隐私合规后强制）**：
1. `app.json` 声明 `"requiredPrivateInfos": ["getLocation"]`
2. `app.json` 配置 `"permission": { "scope.userLocation": { "desc": "用于附近门店推荐" } }`
3. 用户授权 `scope.userLocation`（首次调用自动弹窗）
4. 小程序管理后台完成「用户隐私保护指引」配置

### wx.chooseLocation — 地图选点

```js
const res = await wx.chooseLocation({
  latitude: 39.908,
  longitude: 116.397,
})
res.name         // 位置名称
res.address      // 详细地址
res.latitude
res.longitude
```

同样需要声明 `"requiredPrivateInfos": ["chooseLocation"]`。

---

## 七、设备

### wx.getSystemInfoSync — 系统信息（同步；2.20.1+ 起推荐拆分 API）

```js
const sys = wx.getSystemInfoSync()
sys.brand              // 设备品牌
sys.model              // 设备型号
sys.system             // 'iOS 16.0' / 'Android 13'
sys.platform           // 'ios' | 'android' | 'windows' | 'mac' | 'devtools'
sys.SDKVersion         // 基础库版本
sys.screenWidth
sys.screenHeight
sys.windowWidth
sys.windowHeight
sys.statusBarHeight    // 状态栏高度 px —— 自定义导航栏必读
sys.safeArea           // { top, bottom, left, right, width, height } —— iPhone X 底部安全区
sys.pixelRatio
```

### 拆分 API（基础库 2.20.1+，推荐）

```js
wx.getWindowInfo()     // windowWidth/Height、screenWidth/Height、statusBarHeight、safeArea、pixelRatio
wx.getDeviceInfo()     // brand、model、system、platform、abi
wx.getAppBaseInfo()    // SDKVersion、version、language、theme、host
wx.getSystemSetting()  // bluetoothEnabled、locationEnabled、wifiEnabled
```

**推荐**：启动时调用一次，缓存到 `app.globalData`，避免重复取值。

### wx.setClipboardData / wx.getClipboardData — 剪贴板

```js
await wx.setClipboardData({ data: '需要复制的文本' })
// 系统会自动弹出「内容已复制」提示

const res = await wx.getClipboardData()
console.log(res.data)
// iOS 15+ / Android 读取剪贴板可能弹出系统级提示
```

---

## 八、开放接口

### wx.login — 获取登录凭证

```js
const { code } = await wx.login()   // code 有效期 5 分钟，仅能用一次

// 发送到开发者服务器
await wx.request({
  url: 'https://api.example.com/auth/wx-login',
  method: 'POST',
  data: { code },
})
// 后端流程：
//   GET https://api.weixin.qq.com/sns/jscode2session
//       ?appid=APPID&secret=SECRET&js_code=CODE&grant_type=authorization_code
//   返回 { openid, session_key, unionid? }
//   后端生成自己的 token 返回前端，session_key 留在服务端
```

**重要安全约束**：
- **`session_key` 绝对不能下发到客户端**，仅用于服务端解密 `encryptedData` 或签名校验
- 客户端只持有业务 token，不持有微信密钥

### wx.getUserProfile — 获取用户信息（已严格限制）

```js
// 必须由用户点击按钮主动触发，不能在 onLoad 中直接调用
wx.getUserProfile({
  desc: '用于完善会员资料',
  success(res) {
    res.userInfo   // { nickName, avatarUrl, gender, country, province, city }
  },
})
```

**现状（2022.10 之后）**：`nickName` 统一返回「微信用户」，`avatarUrl` 返回灰色默认头像。**新项目应使用头像昵称填写组件**：

```xml
<!-- WXML -->
<button open-type="chooseAvatar" bind:chooseavatar="onChooseAvatar">
  <image src="{{avatarUrl}}" />
</button>
<input type="nickname" placeholder="请输入昵称" bind:change="onNicknameChange" />
```

```js
// JS
Page({
  data: { avatarUrl: '' },
  onChooseAvatar(e) {
    this.setData({ avatarUrl: e.detail.avatarUrl })
  },
  onNicknameChange(e) {
    this.setData({ nickname: e.detail.value })
  },
})
```

### wx.requestPayment — 微信支付

```js
// 前置：后端调用微信支付统一下单接口获取签名参数
try {
  await wx.requestPayment({
    provider: 'wxpay',
    timeStamp: order.timeStamp,      // 字符串，秒级时间戳
    nonceStr: order.nonceStr,
    package: order.package,          // 'prepay_id=xxx'
    signType: order.signType,        // 'MD5' | 'HMAC-SHA256' | 'RSA'
    paySign: order.paySign,
  })
  // 支付成功（仍需等后端支付回调确认订单状态）
} catch (err) {
  if (err.errMsg.includes('cancel')) {
    // 用户取消
  } else {
    // 支付失败
  }
}
```

**注意**：
- 所有支付参数必须由**后端生成并签名**，前端不保存任何密钥
- 前端 success 只代表拉起支付成功，**最终订单状态以后端支付回调为准**

### wx.authorize — 提前发起授权

```js
try {
  await wx.authorize({ scope: 'scope.userLocation' })
  // 已授权，后续调用对应 API 不再弹窗
} catch {
  // 用户拒绝 → 后续 authorize 不会再弹窗，必须引导进设置页
  wx.openSetting()
}
```

**常用 scope 速查**：

| scope | 对应能力 |
|-------|---------|
| `scope.userLocation` | `wx.getLocation`（精确位置） |
| `scope.userFuzzyLocation` | `wx.getFuzzyLocation`（模糊位置） |
| `scope.record` | `wx.getRecorderManager`（麦克风） |
| `scope.camera` | `<camera>` 组件 |
| `scope.writePhotosAlbum` | `wx.saveImageToPhotosAlbum` |
| `scope.bluetooth` | 蓝牙 |
| `scope.werun` | 微信运动步数 |
| `scope.address` | 通讯地址 |
| `scope.invoiceTitle` | 发票抬头 |

### wx.openSetting — 打开设置页

```js
const res = await wx.openSetting()
console.log(res.authSetting)
// { 'scope.userLocation': true, 'scope.record': false, ... }
```

用户**一旦拒绝授权**，`wx.authorize` 不会再弹窗，只能通过 `openSetting` 引导用户手动开启。

### wx.getSetting — 查询当前授权状态

```js
const res = await wx.getSetting()
if (!res.authSetting['scope.userLocation']) {
  // 未授权，引导授权流程
}
```

---

## 关键 API 速查

| API | 作用 | 返回/要点 |
|-----|------|----------|
| `wx.request` | HTTP 请求 | `RequestTask`；并发 10 上限 |
| `wx.uploadFile` | 上传文件 | `UploadTask`；`res.data` 是字符串 |
| `wx.downloadFile` | 下载文件 | `DownloadTask`；`res.tempFilePath` |
| `wx.connectSocket` | WebSocket | `SocketTask`；并发 5 上限 |
| `wx.setStorage/Sync` | 写缓存 | 10MB 上限；不支持 Function |
| `wx.getStorageSync` | 读缓存（同步） | 不存在返回 `""` |
| `wx.showToast` | 轻提示 | success/error 限 7 字；与 Loading 互斥 |
| `wx.showModal` | 模态弹窗 | `res.confirm` / `res.cancel`；editable |
| `wx.showLoading` | 加载态 | 必须 `hideLoading`；与 Toast 互斥 |
| `wx.showActionSheet` | 操作菜单 | 取消走 fail |
| `wx.navigateTo` | push 页面 | `EventChannel` 双向通信 |
| `wx.switchTab` | 切 tab | 关闭非 tab 页；**不能带参** |
| `wx.reLaunch` | 重置页面栈 | 可跳任何页 |
| `wx.chooseMedia` | 选图/视频 | 推荐替代 chooseImage |
| `wx.createInnerAudioContext` | 音频播放 | 必须 `destroy()` 防泄漏 |
| `wx.getLocation` | 位置 | 需 `requiredPrivateInfos` 声明 |
| `wx.getSystemInfoSync` | 系统信息 | statusBarHeight / safeArea |
| `wx.login` | 登录 code | 5 分钟有效；session_key 不下发 |
| `wx.requestPayment` | 微信支付 | 参数全部后端签名 |
| `wx.authorize` / `wx.openSetting` | 授权 | 拒绝后只能去设置页 |

## 注意事项

- **域名白名单**：request / uploadFile / downloadFile / connectSocket 域名必须在后台配置；开发者工具可勾选「不校验合法域名」
- **并发上限**：request 10 个，WebSocket 5 个，uploadFile/downloadFile 各 10 个；超过排队
- **缓存 10MB**：大数据走 `wx.getFileSystemManager()` 写入 `wx.env.USER_DATA_PATH`
- **同步 Storage 返回空串**：`getStorageSync` 不存在返回 `""`，布尔判断要小心
- **showToast / showLoading 互斥**：不要同时显示
- **页面栈 10 层**：列表→详情→列表… 场景必须用 `redirectTo` 防爆栈
- **switchTab 不能传参**：`?key=value` 会被忽略；跨 tab 传数据用 globalData / Storage
- **getUserProfile 已失效**：新项目改用 `<button open-type="chooseAvatar">` + `<input type="nickname">`
- **session_key 安全红线**：仅后端持有，绝不能返回前端
- **授权一次拒绝后**：`wx.authorize` 不再弹窗，必须引导 `wx.openSetting`
- **InnerAudioContext 泄漏**：`onUnload` 必须 `destroy()`
- **getLocation 隐私合规**：2022 起必须配置 `requiredPrivateInfos` + 隐私协议，否则真机直接 fail
- **Promise 化前提**：基础库 2.10.2+；旧版需用 callback
- **HTTPS 必须**：所有网络请求都要 HTTPS（devtools 可临时关闭校验）

## 组合提示

本 skill 专注平台 API。配合以下 skill 形成小程序完整知识：
- `wechat-mp-core` — 项目结构、app.json / page.json 配置、生命周期、数据绑定
- `wechat-mp-components` — 内置组件 + 自定义组件开发
- `wechat-mp-cloud` — 云开发（云函数 / 云数据库 / 云存储）
- `wechat-mp-advanced` — 分包、插件、性能优化等进阶主题
