---
name: douyin-mp-api
description: "抖音小程序平台 API：网络、缓存、界面、路由、媒体、位置、设备、开放能力（支付/直播/电商/短视频）。"
tech_stack: [douyin-miniprogram]
language: [javascript]
capability: [http-client, local-storage, routing, native-device, payment-gateway]
---

# 抖音小程序平台 API（tt.* 系列）

> 来源：https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/
> 所有 API 以 `tt.` 命名空间调用（宿主兼容字节系所有 App：抖音、抖音极速版、今日头条、西瓜视频等）。

## 用途

系统化掌握抖音小程序核心运行时 API，覆盖网络、存储、UI、路由、媒体、设备、以及抖音特有开放能力（视频跳转、抖音支付、直播小玩法、电商）。

## 何时使用

- 开发抖音/字节系小程序业务逻辑
- 从微信小程序迁移到抖音小程序需要核对 API 差异
- 接入抖音开放能力（跳视频页、打开 aweme 用户主页、直播互动）
- 调用抖音支付、订阅消息、电商购物车

## 通用调用约定

所有异步 API 的入参对象共享回调字段：

```js
tt.xxx({
  // ...业务参数
  success(res) {},   // 成功回调
  fail(err) {},      // 失败回调，err.errMsg / err.errNo
  complete(res) {},  // 无论成败都会执行
});
```

部分 API 提供同步版本（以 `Sync` 结尾）；同步 API 直接返回结果，失败抛出异常。

---

## 网络

### tt.request（HTTPS 请求）

```js
const task = tt.request({
  url: 'https://api.example.com/list',
  method: 'POST',            // GET / POST / PUT / DELETE / OPTIONS / HEAD
  data: { page: 1 },
  header: { 'content-type': 'application/json' },
  dataType: 'json',
  responseType: 'text',      // text / arraybuffer
  timeout: 10000,
  success(res) {
    // res.statusCode / res.data / res.header
  },
});
task.abort();                // 可取消
```

陷阱：
- **必须在「开发者平台 > 服务器域名」配置 request 合法域名**，且为 HTTPS（开发工具可临时关闭校验，真机必须配置）
- 默认超时 60s，但受平台上限约束，建议显式传 `timeout`
- `data` 为 Object 且 `method === 'GET'` 时自动序列化为 query string

### tt.uploadFile / tt.downloadFile

```js
tt.uploadFile({
  url: 'https://api.example.com/upload',
  filePath: tempFilePath,     // 本地临时路径
  name: 'file',               // form 字段名
  formData: { userId: '1' },
  success(res) { /* res.data 为服务端返回字符串 */ },
});

tt.downloadFile({
  url: 'https://cdn.example.com/a.png',
  success(res) { /* res.tempFilePath */ },
});
```

域名需分别配置在 `uploadFile` / `downloadFile` 合法域名列表中。

### tt.connectSocket（WebSocket）

```js
const socket = tt.connectSocket({ url: 'wss://example.com/ws' });
socket.onOpen(() => socket.send({ data: 'hi' }));
socket.onMessage(res => console.log(res.data));
socket.onClose(() => {});
socket.onError(err => {});
// socket.close({ code: 1000 });
```

陷阱：抖音 iOS 端同一时间最多 1 个 WebSocket 连接（Android 最多 5 个），超过会拒绝新连接。

---

## 缓存（本地存储）

单 key 最大 1 MB，总量最大 10 MB。

```js
// 异步
tt.setStorage({ key: 'user', data: { id: 1 }, success() {} });
tt.getStorage({ key: 'user', success(res) { /* res.data */ } });
tt.removeStorage({ key: 'user' });
tt.clearStorage();

// 同步
tt.setStorageSync('user', { id: 1 });
const user = tt.getStorageSync('user');   // 不存在返回 ''
tt.removeStorageSync('user');
tt.clearStorageSync();

// 信息
const info = tt.getStorageInfoSync();     // { keys, currentSize, limitSize } KB
```

陷阱：同步 API 会阻塞主线程，高频循环写大对象会卡顿；跨用户共享同一 appId 的 storage，登出时须主动清理。

---

## 界面（交互反馈）

### tt.showToast

```js
tt.showToast({
  title: '保存成功',
  icon: 'success',   // success / loading / fail / none
  duration: 2000,
  mask: true,        // 蒙层阻止点击穿透
});
tt.hideToast();
```

`title` 最多显示约 7 个中文字符，超出需用 `tt.showModal`。

### tt.showModal

```js
tt.showModal({
  title: '提示',
  content: '确认删除？',
  showCancel: true,
  confirmText: '确定',
  cancelText: '取消',
  success(res) { if (res.confirm) {/*...*/ } },
});
```

### tt.showLoading / tt.hideLoading

```js
tt.showLoading({ title: '加载中', mask: true });
// ...async work
tt.hideLoading();
```

`showLoading` 与 `showToast` **互斥**：`showToast` 会直接覆盖 loading。

### tt.showActionSheet

```js
tt.showActionSheet({
  itemList: ['拍照', '从相册选择'],
  success(res) { /* res.tapIndex */ },
});
```

---

## 路由（页面栈）

页面栈上限 **10 层**（含 TabBar 页面），超过时 `navigateTo` 直接失败。

```js
tt.navigateTo({ url: '/pages/detail/detail?id=1' });   // 保留当前页，压栈
tt.redirectTo({ url: '/pages/login/login' });          // 关闭当前页替换
tt.switchTab({ url: '/pages/home/home' });             // 跳转 TabBar 页（必须在 app.json tabBar 中声明）
tt.navigateBack({ delta: 1 });                         // 返回 delta 层
tt.reLaunch({ url: '/pages/index/index' });            // 关闭所有并跳转
```

陷阱：
- `switchTab` 的 URL **不能带 query**，参数需通过全局变量或 storage 传递
- `navigateTo` 目标 URL **不能是 TabBar 页面**
- 被 `navigateTo` 打开的页面，可以通过 `eventChannel` 与打开方通信（与微信 API 兼容）

---

## 媒体

### 图片

```js
tt.chooseImage({
  count: 9,
  sizeType: ['original', 'compressed'],
  sourceType: ['album', 'camera'],
  success(res) { /* res.tempFilePaths / res.tempFiles[*].size */ },
});

tt.previewImage({
  urls: ['https://.../a.png', 'https://.../b.png'],
  current: 'https://.../b.png',
});

tt.saveImageToPhotosAlbum({
  filePath: tempFilePath,   // 必须是本地临时/下载路径
  success() {},
  fail(err) { /* 用户拒绝授权：err.errMsg 含 "auth deny" */ },
});
```

保存相册需要 `scope.album` 授权；失败可引导 `tt.openSetting`。

### 视频

```js
tt.chooseVideo({
  sourceType: ['album', 'camera'],
  compressed: true,
  maxDuration: 60,
  camera: 'back',
  success(res) { /* res.tempFilePath, res.duration, res.size */ },
});

// 视频组件上下文（需 <video id="v"/>）
const ctx = tt.createVideoContext('v', this);  // 在自定义组件内必须传 this
ctx.play(); ctx.pause(); ctx.seek(10);
ctx.playbackRate(1.5); ctx.requestFullScreen({ direction: 0 });
```

### 音频

```js
const audio = tt.createInnerAudioContext();
audio.src = 'https://.../a.mp3';
audio.autoplay = false;
audio.loop = false;
audio.onCanplay(() => audio.play());
audio.onEnded(() => audio.destroy());
audio.onError(err => {});
```

平台差异：
- **iOS 静音键会静音 InnerAudioContext**，Android 不会；需要铃声级播放用 `tt.setInnerAudioOption({ obeyMuteSwitch: false })`
- iOS 多个 audio 同时播放时底层会抢占，建议 `destroy()` 旧实例

---

## 位置

```js
tt.getLocation({
  type: 'gcj02',        // wgs84 原始 / gcj02 国测局
  altitude: false,
  success(res) { /* res.latitude, res.longitude, res.speed, res.accuracy */ },
});

tt.chooseLocation({ success(res) { /* res.name, res.address, res.latitude, res.longitude */ } });

tt.openLocation({
  latitude: 39.908, longitude: 116.397,
  name: '天安门', address: '北京市东城区',
  scale: 18,
});
```

陷阱：
- 需在 `app.json` 的 `permission.scope.userLocation` 中声明使用理由，否则审核拒绝
- iOS 返回 `gcj02` 更稳定；`wgs84` 在部分机型精度不足

---

## 设备

### 系统信息

```js
const info = tt.getSystemInfoSync();
// info.platform  'ios' / 'android' / 'devtools'
// info.system / info.SDKVersion / info.appName 'Douyin' / 'Toutiao' / ...
// info.screenWidth / info.windowHeight / info.statusBarHeight / info.safeArea
```

**`info.appName`** 用于区分宿主：抖音为 `'Douyin'`，今日头条为 `'Toutiao'`，只在抖音才调用的开放能力需预先判断。

### 网络

```js
tt.getNetworkType({ success(res) { /* res.networkType: wifi/2g/3g/4g/5g/none/unknown */ } });
tt.onNetworkStatusChange(res => { /* res.isConnected, res.networkType */ });
```

### 扫码

```js
tt.scanCode({
  onlyFromCamera: false,
  scanType: ['barCode', 'qrCode'],
  success(res) { /* res.result, res.scanType */ },
});
```

### 振动

```js
tt.vibrateShort({ type: 'medium' });   // heavy / medium / light，15ms
tt.vibrateLong();                      // 400ms
```

平台差异：iOS 仅支持 `vibrateShort` 且强度固定（`type` 被忽略）；Android 可区分强度。

### 剪贴板

```js
tt.setClipboardData({ data: 'hello' });
tt.getClipboardData({ success(res) { /* res.data */ } });
```

iOS 15+ 读取剪贴板会弹系统横幅提示，避免在页面打开时默认读取。

---

## 开放能力（抖音特有）

### 登录 & 用户信息

```js
// 1. 登录拿 code
tt.login({
  force: true,          // false 时若已登录不弹窗直接返回 code
  success(res) {
    // res.code -> 业务端换 openid / session_key
    tt.request({ url: '/api/jscode2session', data: { code: res.code } });
  },
});

// 2. 获取用户资料（v2.30.0+ 推荐）
tt.getUserProfile({
  desc: '用于完善会员资料',   // 必填，描述用途
  success(res) { /* res.userInfo { nickName, avatarUrl, gender, country, ... } */ },
});

// 3. checkSession 校验登录态
tt.checkSession({ success() {/* 有效 */}, fail() {/* 过期，重新 login */} });
```

陷阱：
- **`tt.getUserInfo` 已废弃**（2022 年起），新项目必须用 `tt.getUserProfile`，且必须由用户点击事件触发（按钮 `bindtap` 回调内），不能在 `onLoad` 自动调用
- `getUserProfile` 每次调用都弹授权框，不缓存；需自己存 storage
- `userInfo.avatarUrl` / `nickName` 自 2022 年起逐步返回**匿名默认值**（灰色头像、"微信用户"类昵称），要真实资料需引导用户在 `<button open-type="chooseAvatar">` + `<input type="nickname">` 手填

### 抖音支付

```js
tt.pay({
  orderInfo: { order_id: 'xxx', order_token: 'yyy' },  // 后端 /api/apps/trade/v2/pay/create_order 返回
  service: 5,               // 5 = 担保支付（普通）
  _debug: 0,
  success(res) {
    // res.code: 0=成功 / 1=失败 / 2=取消 / 3=超时 / 4=系统原因订单失败 / 9=订单状态开发者自查
  },
});
```

陷阱：
- `orderInfo` 必须由业务端通过**服务端 API** 下单获取，不能小程序直拼
- `success` 回调 `res.code === 0` 仅代表**用户完成支付动作**，**最终订单状态务必以服务端回调/查询为准**

### 订阅消息

```js
tt.requestSubscribeMessage({
  tmplIds: ['tpl-1', 'tpl-2'],    // 最多 3 条
  success(res) {
    // res['tpl-1']: 'accept' | 'reject' | 'ban' | 'filter'
  },
});
```

必须在按钮 `bindtap` 内触发；`ban`/`filter` 代表被封禁或审核拦截，不可重试。

### 跳转抖音视频页（抖音特有）

```js
tt.navigateToVideoView({
  videoId: 'v0200fg10000...',    // aweme_id
  success() {},
  fail(err) { /* 当前宿主不支持 / videoId 无效 */ },
});
```

仅在抖音/抖音极速版生效；调用前用 `tt.getSystemInfoSync().appName === 'Douyin'` 判断。

### 打开抖音用户主页

```js
tt.openAwemeUserProfile({
  openId: 'open_id_xxx',   // 目标用户 openId（需业务端预先拿到）
  success() {},
});
```

要求小程序关联了该开发者的抖音号，且用户授权过关注关系。

### 关注/分享/直播

```js
// 分享到抖音（仅抖音宿主）
tt.shareVideoToContacts({ videoPath: tempFilePath, success() {} });

// 关注抖音号（需小程序主体 = 抖音号主体）
tt.followOfficialAccount({ success() {} });

// 直播小玩法：通过 tt.livePlayer / tt.getLiveInfo 等（仅直播间小玩法场景可用）
```

### 电商能力

```js
// 加入购物车（需抖音电商资质）
tt.addToEcCart({
  promotionId: 'xxx',
  success(res) {},
});

// 打开商品详情
tt.openEcGoodsDetail({ promotionId: 'xxx' });
```

需要开通"抖音小程序电商"能力并绑定小店，否则调用报 `not authorized`。

---

## 错误处理模板

```js
function call(api, options = {}) {
  return new Promise((resolve, reject) => {
    api({ ...options, success: resolve, fail: reject });
  });
}

try {
  const res = await call(tt.login, { force: true });
} catch (err) {
  if (err.errNo === 21101) { /* 用户拒绝 */ }
  console.error(err.errMsg);
}
```

抖音 API 错误对象形如 `{ errMsg: 'xxx:fail reason', errNo: 21101 }`；`errNo` 比 `errMsg` 更稳定，优先按 `errNo` 分支。

---

## 与微信小程序的差异速查

| 场景 | 微信 (`wx.*`) | 抖音 (`tt.*`) |
|---|---|---|
| 命名空间 | `wx.` | `tt.`（全局亦挂 `wx` 作别名兼容，但禁止依赖） |
| 用户资料 | `wx.getUserProfile`（2024 已收紧） | `tt.getUserProfile` |
| 支付 | `wx.requestPayment` | `tt.pay`（service 语义不同） |
| 订阅消息 | `wx.requestSubscribeMessage` | `tt.requestSubscribeMessage`（模板额度更少） |
| 登录 code | `wx.login` | `tt.login`（`anonymousCode` 额外字段） |
| 视频跳转 | 无 | `tt.navigateToVideoView`（抖音独占） |
| 关注关系 | 公众号相关 | `tt.openAwemeUserProfile` / `followAwemeUser` |
| 分享 | `onShareAppMessage` | 同名 + `tt.shareVideoToContacts` |

跨端项目建议封装：`const mp = typeof tt !== 'undefined' ? tt : wx;`，并针对差异 API 做能力探测 `typeof mp.navigateToVideoView === 'function'`。

---

## 常见陷阱汇总

- **域名白名单**：request/upload/download/socket 必须分别配置 HTTPS 域名，开发工具可关但真机不行
- **`tt.getUserInfo` 已废弃**：一律改用 `tt.getUserProfile`，且只能在用户点击事件回调内调用
- **页面栈上限 10**：深层跳转链路必须规划 `redirectTo` / `reLaunch` 收尾
- **switchTab 不带参数**：TabBar 跳转参数需走 storage 或全局变量
- **iOS 静音键静音 audio**：需 `setInnerAudioOption({ obeyMuteSwitch: false })`
- **抖音独占 API** 调用前用 `getSystemInfoSync().appName === 'Douyin'` 判断宿主
- **支付/电商 API** 最终状态以服务端为准，不能信任客户端回调
- **同步 API 不阻塞以外的异常**：`getStorageSync` 读不到返回 `''` 而非 `undefined`，JSON.parse 前需防御

## 组合提示

- 基础骨架与组件配合 `douyin-mp-core`、`douyin-mp-components`
- 跨端工程（抖音 + 微信 + H5）配合 `taro` 或 `uni-app`
- 登录鉴权链路与服务端配合 "jscode2session" 接口，参考抖音官方《小程序登录》文档
