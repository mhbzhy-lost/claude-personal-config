---
name: cmcc-number-auth
description: 中国移动"移动认证"一键登录与本机号码校验接入指南（Android/iOS SDK + 服务端换号/校验接口）
tech_stack: [android, ios, backend]
language: [java, kotlin, objective-c, swift]
capability: [auth, native-device, http-client]
version: "cmcc-android-sdk 5.8.1; cmcc-ios-sdk 5.8.3; loginTokenValidate 2.0; tokenValidate 1.0"
collected_at: 2026-04-18
---

# 中国移动一键登录 / 号码认证（移动认证 / cmpassport）

> 来源：
> - https://github.com/CMCC-MobileAuth/quick-login-android-STD
> - https://github.com/CMCC-MobileAuth/quick-login-ios-STD
> - https://github.com/CMCC-MobileAuth/platformDoc
> - https://github.com/CMCC-MobileAuth/user-guide

## 用途

中国移动官方的"移动认证"能力，提供两种核心服务：

- **一键登录**：SDK 拉起授权页，用户一次点击即可把本机号码授权给业务，SDK 返回一次性 `token`，业务后端调 `loginTokenValidate` 换得真实手机号。用于替代短信验证码的注册/登录流程。
- **本机号码校验**：前端页面用户自行输入手机号，SDK + 后端 `tokenValidate` 只返回"是本机 / 非本机"的判断结果（不返回号码），用于风控场景。

面向中国大陆运营商：一键登录走中移的 SDK 但**兼容中国电信 4G、中国联通 4G**（电信联通走异网取号，经中国移动网关）；本机号码校验**仅支持移动号段**（返回码 200080）。

## 何时使用

- App 注册 / 登录想用手机号免验证码方案（国内移动、联通、电信 4G 用户）
- 已有账号体系，想在支付、改密、提现等敏感动作前做"本机号风控校验"
- 需要覆盖中国大陆三大运营商中的**中国移动号段**（联通/电信有一键登录能力，但本机号码校验仅限移动）
- **不适用**：H5、小程序、国际漫游场景、纯 WiFi 无蜂窝流量场景

## 接入前置（必做，顺序执行）

1. 去 [中国移动开发者社区 dev.10086.cn](http://dev.10086.cn/) 注册开发者账号 → 邮箱激活。企业账号建议使用公用邮箱 / 公用手机号。
2. 管理中心 → 移动认证 → **创建应用**，填应用名 + **包名/包签名（Android）** 或 **Bundle ID（iOS）**。
   - **一旦提交不可修改**。Android 与 iOS 必须分别创建不同的 appid。
   - 获得 `appId` + `appKey`（或 `APPSecret`，见下）。
3. 在能力配置中开启一键登录 / 本机号码校验能力。
4. 配置**服务端出口 IP 白名单**（支持 IPv4/IPv6，可用逗号分隔多 IP 与 `起-止` 段，最多 4000 字符）。白名单配置后可修改，但不配或配错会导致 `103511` / `124`。
5. 选择**验签方式**：
   - 默认 MD5 + `APPSecret`
   - **存量应用（2018-12-26 之前创建）** 默认仍是 `appKey`，可改为 `APPSecret`；切换**立即生效且不可回退**，切换前必须同步更新服务端签名代码，否则立刻 `103101`。
   - 可选 RSA（需要 PKCS#8 公私钥，Base64 编码报备，位数 1024；验签公钥与加解密公钥都必填）。
6. **商业化**：未签约走体验版，每 appid 每天 1000 次调用，三个月到期；本机号码校验从首次调用起 60 天体验期。正式上量需签商务合同。

## 基础用法

### Android（SDK 5.8.1）

**AndroidManifest.xml**

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.CHANGE_NETWORK_STATE" />
<!-- 强烈建议：双卡精准识别，缺失会显著降低成功率 -->
<uses-permission android:name="android.permission.READ_PHONE_STATE" />

<application android:networkSecurityConfig="@xml/network_security_config" ...>
    <activity
        android:name="com.cmic.sso.sdk.activity.LoginAuthActivity"
        android:configChanges="orientation|keyboardHidden|screenSize"
        android:screenOrientation="unspecified"
        android:launchMode="singleTop" />
</application>
```

`res/xml/network_security_config.xml`（Android P+ 必需，取号接口走 HTTP）：

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true" />
</network-security-config>
```

Proguard：

```
-dontwarn class com.cmic.sso.sdk.**
-keep class com.cmic.sso.sdk.**{*;}
```

**取号 + 一键登录两步流程**

```java
AuthnHelper helper = AuthnHelper.getInstance(context);

TokenListener listener = (int sdkRequestCode, JSONObject obj) -> {
    String code = obj.optString("resultCode");
    if ("103000".equals(code)) {
        String token = obj.optString("token"); // 传后端调 loginTokenValidate
    }
};

// 第一步：预取号（建议提前做，比如应用启动时），会缓存 scrip
helper.getPhoneInfo(APP_ID, APP_KEY, listener, 1);

// 第二步：用户点"一键登录"时调用，弹授权页
helper.loginAuth(APP_ID, APP_KEY, listener, 2);

// 监听授权页是否成功拉起（resultCode == 200087）
helper.setPageInListener((code, json) -> { /* ... */ });

// 回调完成后必须主动关闭授权页
helper.quitAuthActivity();

// 本机号码校验（不弹授权页）
helper.mobileAuth(APP_ID, APP_KEY, listener, 3);
```

### iOS（SDK 5.8.3，framework 名 `TYRZUISDK.framework`）

**集成步骤**：拖入 `TYRZUISDK.framework` → `Build Settings > Other Linker Flags` 加 `-ObjC`（若仍找不到方法改 `-all_load`） → `Build Phases > Copy Bundle Resources` 加 `TYRZResource.bundle` → `#import <TYRZUISDK/TYRZUISDK.h>`。

**Info.plist 必须**：

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
</dict>
```

否则联通/电信异网取号会失败。

**初始化 + 授权**

```objectivec
// AppDelegate
[UASDKLogin.shareLogin registerAppId:@"xxxx" AppKey:@"xxxx"];

// 预取号
[UASDKLogin.shareLogin getPhoneNumberCompletion:^(NSDictionary *r) {
    if ([r[@"resultCode"] isEqualToString:@"103000"]) { /* 已缓存 scrip */ }
}];

// 一键登录
UACustomModel *model = [UACustomModel new];
model.currentVC = self;       // 必传，否则拉不起授权页
[UASDKLogin.shareLogin getAuthorizationWithModel:model
                                        complete:^(NSDictionary *r) {
    NSString *token = r[@"token"]; // 传后端
}];

// 关闭授权页（SDK 不会自动关）
[UASDKLogin.shareLogin ua_dismissViewControllerAnimated:YES completion:nil];

// 本机号码校验
[UASDKLogin.shareLogin mobileAuthCompletion:^(NSDictionary *r) { /* token */ }];
```

### 服务端换号（`loginTokenValidate`）

- **URL**：`POST https://www.cmpassport.com/unisdk/rsapi/loginTokenValidate`
- **Content-Type**：`application/json`；参数全部为 String

```json
{
  "version": "2.0",
  "msgid": "bed1dc7f6cd645b9be9006ae08040c93",
  "systemtime": "20190226111842617",
  "strictcheck": "0",
  "appid": "10000001",
  "token": "STsid...",
  "sign": "0C17F305AB3E8B4694829319167310D1"
}
```

签名（MD5 模式）：`sign = MD5(appid + version + msgid + systemtime + strictcheck + token + APPSecret).toUpperCase()`（32 位大写十六进制）。

RSA 模式：`encryptionalgorithm = "RSA"`，用验签公钥对应的私钥对 `appid + token` 做 `SHA256withRSA` 签名，结果 hex 编码；响应 `msisdn` 要用加密公钥对应的私钥解密。

响应：

```json
{ "inresponseto": "...", "resultCode": "103000", "msisdn": "159xxxxxxxx", "taskId": "..." }
```

### 服务端号码校验（`tokenValidate`）

- **URL**：`POST https://www.cmpassport.com/openapi/rs/tokenValidate`
- 报文分 `header` / `body` 两层
- 默认 `keyType=0`：`phoneNum = SHA256(手机号 + appKey + timestamp).toUpperCase()`，`sign = HMACSHA256(appId + msgId + phoneNum + timestamp + token + version)`（key 为 appKey，参数名**自然排序**，64 位大写）
- `keyType=1`（RSA）：`phoneNum` 用"平台公钥"加密，`sign` 用客户私钥对 `appId + msgId + phoneNum + timestamp + token + version` 做 `MD5withRSA`
- 响应 `resultCode`：`000` 是本机 / `001` 非本机（此时若开通短验辅助会返回 `accessToken`） / `002` 取号失败

## 关键返回码速查

**客户端 SDK（Android / iOS 通用与差异）**

| 码 | 含义 |
|---|---|
| 103000 | 成功 |
| 103101 | 签名错误（appkey/appsecret 混用、空格、MD5/RSA 方式不对） |
| 103102 | 包签名 / Bundle ID 与报备不一致 |
| 103111 | 网关 IP 错误（开了 VPN / 境外 IP / 双卡上网卡运营商与取号卡不一致） |
| 103119 | appid 不存在（检查空格） |
| 103511 | 服务器 IP 白名单校验失败 |
| 103902 | scrip 失效（客户端高频调用请求 token） |
| 103911 | token 请求过于频繁（10 分钟内 > 30 个未使用 token） |
| 104201 | token 已失效或不存在（重复校验或过期） |
| 105018 | token 权限不足（本机号码校验 token 用去换号） |
| 105019 | 应用未授权（社区未勾选对应能力） |
| 105312 | 套餐余量不足 / 体验版到期 |
| 200020 | **Android：授权页关闭；iOS：用户取消登录**（语义相同，文案不同） |
| 200080 | 本机号码校验仅支持移动号段 |
| 200087 | 授权页成功拉起（用于 `pageInListener` 监听，不是错误） |
| 200005 | Android：用户未授予 READ_PHONE_STATE |
| 200010 | Android：无 SIM 卡或无法识别 |
| 200096 | iOS：当前网络不支持取号（常见 WiFi 仅 IPv6 / 数据流量仅 IPv4） |

**服务端 `loginTokenValidate`**：`103000` 成功，`103101` 签名错，`103113` token 格式错，`103511` IP 白名单，`104201` token 失效，`105018` 用错 token，`105312` 套餐用完。

**服务端 `tokenValidate`**：`000` 本机，`001` 非本机，`002` 取号失败，`102` 参数无效，`124` 白名单失败，`302` 签名失败，`606` token 失败，`103420` 无本机号码校验权限。

## 注意事项（踩坑点）

- **token 一次有效，2 分钟过期；同一手机号 10 分钟内最多 30 个未用 token**。超过触发 `103911`，客户端高频预取号触发 `103902`。
- **授权页不会自动关闭**。回调完成后 Android 必须 `quitAuthActivity()`，iOS 必须 `ua_dismissViewControllerAnimated:`，否则用户会卡在授权页。
- **必须蜂窝数据网络**。纯 WiFi 环境取号失败；iOS 13.3/13.4 系统 bug 可能在关蜂窝后仍拿到结果，建议开关一次飞行模式复位。
- **双卡适配**：iOS 13 以上由系统 API 识别流量卡；若两卡运营商不一致且流量卡未识别，SDK 默认按移动取号，不匹配直接返回 `103111`。Android 强烈建议 `READ_PHONE_STATE`。
- **签名坑**：`appKey` 与 `APPSecret` 不同物（存量应用切换后不能再用 appKey），MD5 最终输出**大写 32 位**；`tokenValidate` 的 HMAC 参数做**自然排序**，不是固定顺序。
- **HTTP 明文**：Android P+ 必须配 `network_security_config.xml`，否则取号接口被拦。
- **包签名 / Bundle ID 一旦提交不可改**，写错只能新建应用。Android 混淆必须 keep `com.cmic.sso.sdk.**`。
- **服务端 IP 白名单**未配或配错直接被拒（SDK 侧 `103511`、`tokenValidate` 侧 `124`）。`strictcheck=1` 强校验，官方后续会强制打开。
- **RSA 要求**：PKCS#8，位数 1024，Base64 报备；验签公钥与加解密公钥**必须都填**，否则取号出错。`msisdn` 响应需用加密公钥对应私钥解密。
- **仅限中国大陆 App**，H5 / 小程序 / 国际漫游不支持。本机号码校验仅支持**移动号段**（联通电信号直接 200080）。
- **短验辅助**校验通过并不代表输入号就是本机号，只是短信能收到，不能作为强一致性判断。

## HarmonyOS 适配

**官方 GitHub 目前未发布 HarmonyOS（ArkTS / Harmony Next）版本的 SDK**。如需在纯血鸿蒙上接入，建议：

1. 先登录 [dev.10086.cn](http://dev.10086.cn/) 工单系统或加官方 QQ 群 `609994083` 咨询最新进展与内测申请。
2. 短期方案：HarmonyOS 上如仍兼容 Android APK（双框架设备），可继续用 Android SDK；纯血鸿蒙设备需改用短信验证码或运营商合作方的聚合 SDK（如号码认证的三合一聚合服务）。

## 组合提示

- 典型登录闭环：App 启动 → `getPhoneInfo/getPhoneNumberCompletion` 预取号 → 用户点"本机号一键登录" → `loginAuth/getAuthorizationWithModel` 拿 token → 传后端 → `loginTokenValidate` 换 `msisdn` → 走业务注册/登录 → `quitAuthActivity/ua_dismiss...` 关页。
- 多运营商覆盖：与"中国联通 WoOpenSDK"、"中国电信天翼账号 CtAuth" 组合成三合一（或直接接聚合方案），前端根据 `networkInfo.carrier` 路由到对应 SDK。
- 风控场景：注册/换绑/提现等高风险动作前插入 `mobileAuth` + `tokenValidate`，`001` 非本机可触发二次校验或阻断。
- 授权页定制：`AuthThemeConfig.Builder`（Android）/ `UACustomModel`（iOS）调风格；登录按钮文案**必须含"登录"或"注册"**，且不得遮盖号码栏/隐私栏/品牌露出，否则会被官方审核下线。
