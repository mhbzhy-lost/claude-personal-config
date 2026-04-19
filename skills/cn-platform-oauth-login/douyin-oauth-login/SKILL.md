---
name: douyin-oauth-login
description: 抖音开放平台 OAuth2.0 登录，覆盖 Web 授权码流、iOS/Android SDK 授权、H5 静默授权与 token 刷新策略
tech_stack: [douyin-open-platform]
language: [objc, java]
capability: [auth, http-client]
version: "douyin-open-sdk unversioned; ios-sdk 4.1.17+; android-sdk 0.1.4.0+"
collected_at: 2026-04-19
---

# 抖音开放平台登录（Douyin OAuth Login）

> 来源：
> - https://open.douyin.com/platform/resource/docs/develop/permission/web/oauth2
> - https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/sdk/mobile-app/permission/{ios,android}/permission-develop-guide
> - https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/sdk/web-app/web/permission

## 用途

让第三方应用通过抖音账号完成 OAuth2.0 授权码流程，拿到用户 `access_token` 后调用开放平台 API 获取用户信息与执行授权操作。覆盖 Web/H5、iOS、Android 三端。

## 何时使用

- Web 站点接入"抖音登录"按钮，走授权码换 token 流程
- iOS / Android 原生 App 跳起抖音 App 完成授权（未装抖音时可自动降级 H5）
- iPad / 未装抖音环境使用扫码授权（`webAuthType = "qrcode"`）
- H5 静默授权拿 `open_id`（域名 `aweme.snssdk.com`）
- 运营商一键登录（iOS SDK 4.1.17+）

## 双域说明

抖音开放平台同时使用两个官方域名，均可信、承载不同文档体系：

- `open.douyin.com`：主站，Web OAuth2.0 协议文档主要在此
- `developer.open-douyin.com`：新版开发者中心，移动端 SDK、H5 SDK 文档主要在此

开发时两个域名都要查，同一话题两处表述略有差异时优先以 `developer.open-douyin.com` 为准。

## Client Token vs User Access Token（重点）

| 维度 | `user_access_token` | `client_token`（client_access_token） |
|------|---------------------|---------------------------------------|
| 粒度 | 用户维度（每个授权用户一份） | 应用维度（整个 App 一份） |
| 获取方式 | 授权码 `code` + `client_secret` 换取 | `client_key` + `client_secret` 直接换取 |
| 有效期 | 15 天 | 2 小时 |
| 刷新 | `refresh_token`（30 天）可刷新，最多续期 5 次 | 重新请求即可，重复请求使上一个失效（有 5 分钟缓冲期）|
| 用途 | 读取/操作用户数据（视频、粉丝等）| App 级操作，如生成 share-id |
| 分发 | 服务端保管，不下发前端 | **绝不下发客户端**；仅服务端使用 |

## Web OAuth2.0 基础流程

### Step 1 跳转授权页

```
https://open.douyin.com/platform/oauth/connect?
  client_key=CLIENT_KEY
  &response_type=code
  &scope=user_info          # 必选，逗号分隔
  &optionalScope=mobile,1   # 可选，1=默认勾选 0=不勾选
  &redirect_uri=HTTPS_URL   # 须与控制台配置完全一致
  &state=STATE              # CSRF 防御 + 业务透传
  &is_call_app=1            # 移动端 H5 时尝试拉起抖音 App
```

授权成功回调：
```
https://your-redirect/?code=CODE&state=STATE&scopes=SCOPES
```

### Step 2 code 换 access_token（服务端）

服务端用 `code + client_key + client_secret` 调 token 接口拿到：
- `access_token`（15 天）
- `refresh_token`（30 天）
- `open_id` / `scope`

### Step 3 刷新

- `access_token` 过期 → 接口返回 `10008` / `2190008`，用 `refresh_token` 换新
- `refresh_token` 过期 → 返回 `10010`，用户必须重新授权
- 续期 refresh_token 需要 `renew_refresh_token` 权限，且**最多 5 次**，超过必须重新授权

## iOS SDK 授权

前置配置：

- `Info.plist` 的 `LSApplicationQueriesSchemes` 添加 `douyinopensdk`、`douyinliteopensdk` 等
- BundleID 与 ClientKey 必须与平台注册一致
- Build Settings > Other Linker Flags 加 `-ObjC`

最小示例：

```objc
#import <DouyinOpenSDK/DouyinOpenSDKAuth.h>

DouyinOpenSDKAuthRequest *request = [[DouyinOpenSDKAuthRequest alloc] init];
request.permissions = [NSOrderedSet orderedSetWithObject:@"user_info"];
request.additionalPermissions = [NSOrderedSet orderedSetWithObjects:@{
    @"permission": @"mobile",
    @"defaultChecked": @"0"
}, nil];

[request sendAuthRequestViewController:self
                         completeBlock:^(DouyinOpenSDKAuthResponse *resp) {
    if (resp.errCode == 0) {
        NSString *code = resp.code;   // 拿到授权码，回服务端换 token
    } else {
        NSLog(@"fail: %@ %@", @(resp.errCode), resp.errString);
    }
}];
```

增强用法：

- **H5 授权预加载**（SDK 4.1.16+）：`[request preloadWebAuth];`
- **iPad 扫码**：`request.webAuthType = @"qrcode";`
- **运营商一键登录**（SDK 4.1.17+）：`[[DouyinOpenSDKWebAuthManager shareManager] startWifiStatusMonitor];`

## Android SDK 授权

### 初始化（Application#onCreate）

```java
String clientkey = "xxxxxx";
DouYinOpenApiFactory.init(new DouYinOpenConfig(clientkey));
```

### AndroidManifest 注册回调 Activity

```xml
<uses-permission android:name="android.permission.INTERNET" />

<activity
    android:name=".douyinapi.DouYinEntryActivity"
    android:launchMode="singleTask"
    android:taskAffinity="your.package.name"
    android:exported="true" />
```

回调 Activity **路径必须为** `<包名>.douyinapi.DouYinEntryActivity`，否则抖音 App 找不到。

### 发起授权

```java
DouYinOpenApi api = DouYinOpenApiFactory.create(this);
Authorization.Request request = new Authorization.Request();
request.scope = "user_info";
request.callerLocalEntry = "com.xxx.xxx.douyinapi.DouYinEntryActivity";
api.authorize(request);
```

### 处理回调

```java
public class DouYinEntryActivity extends Activity implements IApiEventHandler {
    @Override
    public void onResp(BaseResp resp) {
        if (resp.getType() == CommonConstants.ModeType.SEND_AUTH_RESPONSE) {
            Authorization.Response r = (Authorization.Response) resp;
            // r.authCode 回服务端换 token
        }
    }
}
```

### Android 错误码

| 值 | 含义 |
|----|------|
| `0` | 成功 |
| `-2` | 用户取消 |
| `10004` | scope 配置错误 |
| `10017` | 签名不匹配（debug 包对不上控制台 release 签名）|

### Android 11 兼容

- SDK 升级到 `0.1.4.0+`
- `AndroidManifest` 配置 package visibility（`<queries>` 声明抖音包名），否则 Android 11 上无法查询到抖音 App
- 混淆规则里排除 `DouYinEntryActivity` 等回调类
- **必须用 release 签名**联调，debug 签名会触发 `10017`

## H5 / Web 前置条件

1. 开放平台创建 Web 应用并过审
2. 控制台拿 `ClientKey` / `ClientSecret`（我的应用 > Web 应用 > 应用信息）
3. 控制台配置"授权回调"域名，必须与 `redirect_uri` 完全一致（HTTPS）
4. 静默授权走 `aweme.snssdk.com` H5 页面，只拿 `open_id`，不需要用户显式同意

## 常用 scope

- `user_info`：基础用户信息（必选常见项）
- `mobile`：手机号（可选，常作为 `optionalScope` 默认不勾选）
- `renew_refresh_token`：允许 refresh_token 续期
- 视频类、粉丝类等业务 scope 根据应用类型在控制台勾选

## 注意事项

- **服务端保管密钥**：`client_secret`、`access_token`、`client_token` 严禁下发到前端/客户端
- **refresh_token 5 次续期上限**：超过必须走完整授权流程，运营要考虑用户体验
- **redirect_uri 强一致**：协议、域名、端口、路径都要与控制台一致，否则授权页直接报错
- **iOS 授权失败排查**：URL scheme 未配置、BundleID/ClientKey 不一致、初次安装抖音网络环境异常三大类
- **Android 签名坑**：控制台登记 release 签名 MD5/SHA1，debug 包联调必失败（`10017`）
- **`is_call_app=1` 仅移动端 H5 生效**：PC Web 忽略该参数
- **iPad 扫码**：必须显式设置 `webAuthType = "qrcode"`，否则 iPad 上授权体验退化

## 组合提示

- 通常与 `oauth-social-login` 下各第三方登录 skill 并列使用，服务端统一 token 托管
- 与抖音小程序侧 `douyin-mp` skill 区分：小程序走 `tt.login` 拿 code，不是本 skill 的 OAuth2.0 流程
- 涉及手机号一键登录可搭配 `carrier-number-auth-cn`（运营商 SDK）

## 未覆盖

- 具体 token 接口 URL、错误码完整列表、各业务 scope 详细权限表（需以控制台为准）
- 桌面客户端（PC 客户端 SDK）授权流程
- deauth webhook 事件字段明细
