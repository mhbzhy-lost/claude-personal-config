---
name: alipay-mp-api
description: "支付宝小程序平台 API：网络、缓存、界面、路由、媒体、位置、设备、开放能力（支付/芝麻/花呗）。"
tech_stack: [alipay-miniprogram]
language: [javascript]
---

# 支付宝小程序 API（my.* 平台能力）

> 来源：
> - 官方文档：https://opendocs.alipay.com/mini/api
> - BookStack 镜像：https://www.bookstack.cn/read/alipay-mini/
> - W3Cschool：https://www.w3cschool.cn/aliminiapp/

## 用途

支付宝小程序运行环境通过全局对象 `my` 暴露宿主能力（网络、存储、UI、路由、媒体、设备、开放能力）。与微信小程序 `wx.*` 语义相近但**并非 100% 兼容**——回调字段、错误码、能力集合有差异，不可直接复用 wx 代码。

## 何时使用

- 在 `.js` 页面/组件里调用支付宝客户端能力
- 需要判断某个 API 是否在当前支付宝版本可用（`my.canIUse`）
- 对接支付宝特有开放能力（支付、芝麻信用、花呗、会员卡、刷脸）

## 通用调用模式

```js
my.apiName({
  // 入参
  key: 'value',
  success(res) { /* 成功 */ },
  fail(err) { /* 错误：{ error, errorMessage } */ },
  complete() { /* 不管成败都会执行 */ },
});
```

- 错误对象结构为 `{ error: <number>, errorMessage: <string> }`，与 wx 的 `errMsg` **不同**。
- 大部分异步 API **不返回 Promise**；需自行包装或使用官方 `my.canIUse('returnValue')` 校验 Promise 能力。
- 同步 API 以 `Sync` 结尾（如 `getStorageSync`、`getSystemInfoSync`）。

## 1. 网络

### my.request —— HTTP 请求

```js
my.request({
  url: 'https://api.example.com/user',
  method: 'POST',          // GET/POST/PUT/DELETE/HEAD/OPTIONS
  data: { id: 1 },         // GET 拼 query；POST 作 body
  headers: { 'content-type': 'application/json' },
  dataType: 'json',        // json/text/base64
  timeout: 30000,
  success(res) {
    // res: { data, status, headers }
  },
  fail(err) {},
});
```

陷阱：
- 默认 `dataType: 'json'`，会自动 `JSON.parse`；非 JSON 响应需显式设为 `text`。
- 服务器域名必须在 IDE「详情-域名信息」中白名单，线上还要在开放平台配置。
- `headers` 字段名为 `headers`（wx 是 `header`）。
- 响应字段为 `status`（wx 是 `statusCode`）。

### my.uploadFile / my.downloadFile

```js
my.uploadFile({
  url: 'https://api.example.com/upload',
  fileType: 'image',        // image/video/audio
  fileName: 'file',
  filePath: tempFilePath,
  formData: { token: 'x' },
  success(res) { /* res.data, res.statusCode */ },
});

my.downloadFile({
  url: 'https://cdn.example.com/a.jpg',
  success(res) { /* res.apFilePath：可用于 image 组件 src */ },
});
```

### WebSocket

```js
my.connectSocket({ url: 'wss://example.com/ws' });
my.onSocketOpen(() => {
  my.sendSocketMessage({ data: 'hello' });
});
my.onSocketMessage((res) => console.log(res.data));
my.onSocketError((err) => {});
my.onSocketClose(() => {});
my.closeSocket();
```

同一时刻**仅支持 1 条 WebSocket 连接**，重连前务必 `closeSocket`。

## 2. 缓存（本地存储）

```js
my.setStorage({ key: 'token', data: { t: 'abc' }, success() {} });
my.getStorage({ key: 'token', success(res) { /* res.data */ } });
my.removeStorage({ key: 'token' });
my.clearStorage();
my.getStorageInfo({ success(res) { /* keys, currentSize, limitSize */ } });

// 同步版本
my.setStorageSync({ key: 'k', data: v });
const { data } = my.getStorageSync({ key: 'k' });
```

限制与语义：
- **单 key 最大 200 KB**；**单小程序上限 10 MB**，超限写入失败。
- 数据以 `支付宝账号 + 小程序 appId` 双重隔离：**换账号登录相当于另一套存储**。
- 数据默认**未加密**；支付宝客户端对存储有加密层但业务侧应自行加密敏感字段。
- `data` 支持可被 `JSON.stringify` 的任意值。

## 3. 界面交互

### 提示类

```js
my.alert({ title: '提示', content: '内容', buttonText: '我知道了' });

my.confirm({
  title: '确认', content: '确定要删除？',
  confirmButtonText: '删除', cancelButtonText: '取消',
  success(res) { /* res.confirm: boolean */ },
});

my.showToast({
  content: '保存成功',
  type: 'success',     // success/fail/exception/none
  duration: 2000,      // 最长 10000
});

my.showLoading({ content: '加载中' });
my.hideLoading();

my.prompt({
  title: '请输入',
  message: '昵称',
  placeholder: '1-12 字',
  okButtonText: '确定',
  cancelButtonText: '取消',
  success(res) { /* res.ok, res.inputValue */ },
});

my.showActionSheet({
  title: '选择',
  items: ['拍照', '相册', '取消'],   // 最多 6 项（含取消）
  cancelButtonText: '取消',
  success(res) { /* res.index：-1 表示取消 */ },
});

// my.showModal 是 confirm 的别名，不同版本行为略有差异；推荐用 my.confirm
```

陷阱：
- `showToast` 与 `showLoading` **互斥**，后者会覆盖前者。
- `actionSheet` 超过 6 项在部分 Android 客户端会被截断。

### 导航条 / TabBar

```js
my.setNavigationBar({ title: '首页', backgroundColor: '#1677FF' });
my.hideTabBar();
my.showTabBar();
my.setTabBarItem({ index: 0, iconPath: '', selectedIconPath: '' });
```

## 4. 路由

```js
my.navigateTo({ url: '/pages/detail/index?id=1' });   // push，最多 10 层
my.redirectTo({ url: '/pages/login/index' });         // replace，当前页
my.switchTab({ url: '/pages/home/index' });           // 切换到 tab 页
my.navigateBack({ delta: 1 });
my.reLaunch({ url: '/pages/home/index' });            // 关闭所有页面并跳转
```

跳转其他小程序：

```js
my.navigateToMiniProgram({
  appId: '2021xxxxxx',
  path: 'pages/index/index',
  extraData: { from: 'A' },
  success() {},
});

my.navigateBackMiniProgram({ extraData: { ok: true } });
```

陷阱：
- `switchTab` 的 `url` **不能带 query**；参数只能通过全局 storage 或 `getApp()` 共享。
- 页面栈最多 10 层，超过时 `navigateTo` 失败，应改用 `redirectTo`。

## 5. 媒体

```js
my.chooseImage({
  count: 9,
  sourceType: ['camera', 'album'],
  success(res) {
    // res.apFilePaths: string[] （支付宝专属路径前缀）
    // res.tempFiles（新版）
  },
});

my.previewImage({ current: 0, urls: ['https://...'] });

my.saveImage({ url: 'https://cdn/a.jpg', showActionSheet: true });

my.compressImage({
  apFilePaths: ['apfile://...'],
  compressLevel: 3,    // 0-4
  success(res) { /* res.apFilePaths */ },
});

my.chooseVideo({
  sourceType: ['camera', 'album'],
  maxDuration: 60,
  camera: 'back',
  success(res) { /* res.filePath, duration, size */ },
});

// 视频上下文（配合 <video id="v" /> 组件）
const ctx = my.createVideoContext('v');
ctx.play(); ctx.pause(); ctx.seek(10); ctx.requestFullScreen();
```

陷阱：
- 本地文件路径在支付宝以 `apfile://` 或 `https://resource/` 前缀出现，不同版本字段名不同（`apFilePath` / `path` / `tempFilePath`），用前做一次兼容。
- `compressImage` 的输入必须是本地路径，网络 URL 需先 `downloadFile`。

## 6. 位置

```js
my.getLocation({
  type: 1,                // 0: wgs84  1: gcj02(默认)  2: 逆地理(粗)  3: 逆地理(详)
  cacheTimeout: 30,       // 秒，复用上次定位
  success(res) {
    // res.longitude, latitude, accuracy, city, province, district...
  },
});

my.openLocation({
  longitude: 116.39, latitude: 39.9,
  name: '天安门', address: '北京市东城区',
});

my.chooseLocation({
  success(res) { /* longitude, latitude, name, address */ },
});
```

坐标系：支付宝默认返回 **gcj02**（国测局加密坐标），与高德地图一致；若要推给百度需转 bd09。

## 7. 设备

```js
my.getSystemInfo({ success(res) { /* model/pixelRatio/screenWidth/version/platform/app */ } });
const info = my.getSystemInfoSync();

my.getNetworkType({ success(res) { /* res.networkType: wifi/2g/3g/4g/5g/unknown/none */ } });
my.onNetworkStatusChange((res) => { /* isConnected, networkType */ });

my.setClipboard({ text: '复制的内容' });
my.getClipboard({ success(res) { /* res.text */ } });

my.scan({
  type: 'qr',         // qr/bar
  hideAlbum: false,
  success(res) { /* res.code */ },
});

my.vibrate();          // 默认短震
my.vibrateLong();
my.vibrateShort();

my.makePhoneCall({ number: '10086' });

// 能力检测 —— 避免低版本客户端崩溃
if (my.canIUse('getAuthCode.object.scopes.auth_user')) {
  my.getAuthCode({ scopes: 'auth_user' });
}
if (my.canIUse('returnValue')) {
  // 表示 API 支持 Promise
}
```

`my.canIUse` 支持三种粒度：`apiName`、`apiName.object.propName`、`apiName.return.propName`。

## 8. 联系人

```js
my.chooseContact({
  chooseType: 'single',    // single/multi
  includeMe: false,
  success(res) { /* res.contactsDicArray: [{name, mobile, realName}] */ },
});

my.chooseAlipayContact({ multiple: false, maxCount: 10 });   // 支付宝好友
my.choosePhoneContact({ success(res) { /* name, mobile */ } });

my.addPhoneContact({
  firstName: '张三',
  mobilePhoneNumber: '13800138000',
  email: 'a@b.com',
});
```

## 9. 卡包 / 券

```js
my.openCardList();                               // 打开卡包首页
my.openCardDetail({ passId: 'xxx' });            // 卡详情
my.openVoucherList();                            // 券列表
my.openVoucherDetail({ passId: 'xxx' });         // 券详情
my.openMembershipCardList();
my.openMembershipCardDetail({ passId: 'xxx' });
my.addCardAuth({ cardTemplateId: 'xxx' });       // 领卡授权
my.verifyCardAuth();
my.shareCard({ passId: 'xxx' });
```

这些 API 需在开放平台申请对应卡包/会员卡产品能力后方可调用。

## 10. 开放能力（支付宝特有）

### 授权登录

```js
// 静默授权：只拿 userId
my.getAuthCode({
  scopes: 'auth_base',        // 或 'auth_user' 弹窗授权含头像昵称
  success(res) {
    // res.authCode 一次性授权码；需传给后端
    // 后端用 alipay.system.oauth.token 换 access_token + user_id
  },
});

// 已登录后拿用户信息（需 auth_user）
my.getOpenUserInfo({
  success(res) {
    const info = JSON.parse(res.response).response;
    // info.avatar, nickName, gender, province, city, userId(openId)
  },
});
```

关键流程：**前端 getAuthCode → 服务端用 authCode + appId 私钥换 access_token → 后续调 alipay.user.info.share 等接口**。前端绝对不要保存私钥。

### 支付 my.tradePay

```js
// 1) 后端先调 alipay.trade.create 生成 tradeNO（或用 orderStr 直付）
// 2) 前端唤起收银台
my.tradePay({
  tradeNO: '20250417xxxx',          // 推荐：后端 create 返回的交易号
  // orderStr: '...',                // 或：orderStr 方式（后端签名好的参数串）
  // paymentUrl: '...',               // 或：paymentUrl 方式
  success(res) {
    // res.resultCode: '9000' 成功 / '6001' 用户取消 / '8000' 处理中 / '4000' 失败
  },
});
```

陷阱：
- `resultCode === '9000'` 不代表资金到账，**必须以服务端异步通知 + 主动查单（alipay.trade.query）为准**。
- `tradeNO`、`orderStr`、`paymentUrl` 三者**传一个即可**，同时传会报错。

### 芝麻信用

```js
my.getZMAuthData({
  bizNo: 'xxx',
  category: 'w1010100000000002858',
  success(res) { /* res.zmAuth: 授权串 */ },
});
my.startZMVerify({ bizNo: 'xxx' });        // 芝麻认证跳转
my.getZMCreditBorrowStatus({ bizNo: 'xxx' });
my.ZMCreditBorrowAgreement({ apiName, bizData });
```

### 花呗分期

支付阶段通过 `alipay.trade.create` 传 `hb_fq_num`/`hb_fq_seller_percent` 参数开启；前端无独立 API。

### 会员卡 / 模板消息 / 刷脸

```js
my.tradePay(...);                           // 会员开卡通常走支付流程
my.sendMessage({ type: 'template', ... });   // 服务号模板消息
my.ap.faceVerify({ bizType: 'ra', ... });    // 刷脸（需申请权限）
```

模板消息/刷脸需在开放平台完成产品签约与 IDE 权限申请，IDE 调试时会提示未签约。

## 常见陷阱汇总

1. **错误字段**：`fail` 回调是 `{ error, errorMessage }`，别当成 `errMsg`。
2. **HTTP header 键**：`headers`（复数），响应字段 `status`（非 `statusCode`）。
3. **tempFilePath 前缀**：支付宝是 `apfile://` / `https://resource/`，不要直接拼接 URL。
4. **账号隔离**：换支付宝账号重新登录后，`getStorage` 会拿不到旧数据。
5. **domain 白名单**：`request/uploadFile/downloadFile/connectSocket` 四类全需配置。
6. **switchTab 不带参数**：tab 切换丢失 query，需经 storage 或全局变量传递。
7. **tradePay 结果只能参考不能信**：必须以后端异步通知为准。
8. **canIUse 先行**：接入新 API 前用 `my.canIUse` 做降级，老版本客户端很多。

## 组合提示

- 与 `alipay-mp-core`（AXML/ACSS/app.js/页面生命周期）搭配，`my.*` 多在 `onLoad`、事件处理、`methods` 中调用
- 与 `alipay-mp-components`（view/image/input/button open-type）配合实现 UI
- 支付类场景需同时具备后端知识：`alipay.trade.create` / `alipay.trade.query` / 公私钥签名校验
