---
name: facebook-login
description: Facebook Login 跨平台接入指南 —— Web JS SDK、iOS（含 Limited Login）、Android SDK、权限与 App Review、access_token 校验与 Data Deletion 回调
tech_stack: [oauth-social-login, facebook, web, ios, android]
language: [javascript, swift, java, kotlin]
capability: [auth, http-client]
version: "facebook-login unversioned"
collected_at: 2026-04-19
---

# Facebook Login（Facebook 登录）

> 来源：
> - https://developers.facebook.com/docs/facebook-login/overview/
> - https://developers.facebook.com/docs/facebook-login/web/
> - https://developers.facebook.com/docs/facebook-login/ios/
> - https://developers.facebook.com/docs/facebook-login/android/

## 用途
让用户使用 Facebook 账号在你的 Web / iOS / Android 应用中完成登录与授权，并按需获取 profile、email 等数据。覆盖认证 + 数据访问两类场景，跨平台共用同一 User ID。

## 何时使用
- 需要降低注册门槛、提升转化率的 C 端应用
- 需要跨 Web / iOS / Android 保持同一 User ID 的产品
- 需要访问用户 Facebook 公开资料、邮箱或其他授权数据
- 需要 Express Login 在跨设备跨平台避免重复建号
- 面向欧盟用户，需要满足 GDPR Data Deletion 合规要求

## 权限体系与 App Review

- **免审权限**：仅 `public_profile` 和 `email` 两项，任何线上用户可直接授予
- **其它权限**：必须通过 **App Review** 才能对非角色内用户可见
- **开发阶段**：App Dashboard → Roles 中的管理员 / 开发者 / 测试者可授予任意有效权限，无需审核
- **渐进授权（Gradual Authorization）**：按使用场景分阶段申请权限，不要一次性索要全部

## Web JS SDK

### App Dashboard 前置
- App Dashboard → Facebook Login → Set Up
- **Client OAuth Settings** → 填 `Valid OAuth Redirect URIs`
- `Login with JavaScript SDK` = **yes**
- `Allowed Domains for JavaScript SDK` 填你的域名
- **仅支持 HTTPS** 页面

### FB.init + 状态检查
```html
<script async defer crossorigin="anonymous"
        src="https://connect.facebook.net/en_US/sdk.js"></script>
<script>
window.fbAsyncInit = function() {
  FB.init({
    appId   : '{app-id}',
    cookie  : true,
    xfbml   : true,
    version : 'v19.0'
  });
  FB.getLoginStatus(function(response) {
    // response.status: 'connected' | 'not_authorized' | 'unknown'
  });
};
</script>
```

### FB.login / FB.logout
```javascript
FB.login(function(response) {
  // response.authResponse.accessToken
}, { scope: 'public_profile,email' });

FB.logout(function(response) { /* 注意：可能同时登出 Facebook */ });
```

### Login Button（XFBML）
```html
<fb:login-button scope="public_profile,email"
                 onlogin="checkLoginState();"></fb:login-button>
```

## iOS SDK

### 集成（SPM）
- 仓库：`https://github.com/facebook/facebook-ios-sdk`，选 "Up to Next Major"
- 按需引入 `FBSDKCoreKit`、`FBSDKLoginKit`、`FBSDKShareKit`、`FBSDKGamingServicesKit`

### Info.plist 必备键
- `FacebookAppID`、`FacebookClientToken`（Settings → Advanced）、`FacebookDisplayName`
- `CFBundleURLSchemes`：`fb{app-id}`
- `LSApplicationQueriesSchemes`：含 `fbapi`、`fb-messenger-share-api` 等
- Mac Catalyst：启用 **Keychain Sharing** capability

### 初始化
```swift
import FBSDKCoreKit

func application(_ app: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
  ApplicationDelegate.shared.application(app, didFinishLaunchingWithOptions: launchOptions)
  return true
}
```
iOS 13+ 需在 `SceneDelegate` 的 `scene(_:openURLContexts:)` 中转发 URL 给 `ApplicationDelegate.shared`。

### FBLoginButton
```swift
import FBSDKLoginKit

let loginButton = FBLoginButton()
loginButton.permissions = ["public_profile", "email"]
view.addSubview(loginButton)

if let token = AccessToken.current, !token.isExpired {
  // 已登录
}
```

### Limited Login（ATT / iOS 受限 token）

iOS 14.5+ 上若用户拒绝 App Tracking Transparency（ATT）授权，Facebook SDK 应使用 **Limited Login** 获取受限 token：

- 调用 `LoginManager.logIn(permissions:, tracking: .limited, nonce:, ...)` 而非常规登录
- 成功后读取 `AuthenticationToken.current`（而非 `AccessToken.current`），这是一个 OIDC 风格的 JWT
- 受限 token **不能用于 Graph API 数据查询**，仅用于识别用户身份
- 必须在发起登录时生成并校验 `nonce`，防重放
- 常规流程：先检查 `ATTrackingManager.trackingAuthorizationStatus`，`.authorized` 用 `.enabled`，其它情况用 `.limited`
- 详见 https://developers.facebook.com/docs/facebook-login/limited-login/

## Android SDK

### 依赖
```gradle
implementation 'com.facebook.android:facebook-login:latest.release'
```

### 资源 & Manifest
`res/values/strings.xml`：
```xml
<string name="facebook_app_id">1234</string>
<string name="fb_login_protocol_scheme">fb1234</string>
<string name="facebook_client_token">56789</string>
```
`AndroidManifest.xml`：
```xml
<uses-permission android:name="android.permission.INTERNET"/>
<meta-data android:name="com.facebook.sdk.ApplicationId"
           android:value="@string/facebook_app_id"/>
<meta-data android:name="com.facebook.sdk.ClientToken"
           android:value="@string/facebook_client_token"/>
<activity android:name="com.facebook.FacebookActivity" .../>
<activity android:name="com.facebook.CustomTabActivity" android:exported="true">
  <intent-filter>
    <action android:name="android.intent.action.VIEW"/>
    <category android:name="android.intent.category.BROWSABLE"/>
    <data android:scheme="@string/fb_login_protocol_scheme"/>
  </intent-filter>
</activity>
```
App Dashboard 需登记 **包名 + 默认 Activity 类名 + Key Hash**（debug + release 两套，通过 keytool + openssl 生成）。

### LoginButton + CallbackManager
```xml
<com.facebook.login.widget.LoginButton
    android:id="@+id/login_button"
    android:layout_width="wrap_content"
    android:layout_height="wrap_content"/>
```
```java
CallbackManager callbackManager = CallbackManager.Factory.create();
loginButton.setPermissions("public_profile", "email");
loginButton.registerCallback(callbackManager, new FacebookCallback<LoginResult>() {
  @Override public void onSuccess(LoginResult r) { /* r.getAccessToken() */ }
  @Override public void onCancel() {}
  @Override public void onError(FacebookException e) {}
});

@Override
protected void onActivityResult(int req, int res, Intent data) {
  super.onActivityResult(req, res, data);
  callbackManager.onActivityResult(req, res, data);
}
```

### 登录状态 / Express Login
```java
AccessToken token = AccessToken.getCurrentAccessToken();
boolean loggedIn = token != null && !token.isExpired();

LoginManager.getInstance().retrieveLoginStatus(this, new LoginStatusCallback() {
  @Override public void onCompleted(AccessToken token) {}
  @Override public void onFailure() {}
  @Override public void onError(Exception e) {}
});
```
Facebook app 未安装时，Android SDK 会自动回退到 **Facebook Lite** 或 Custom Tabs。

## Business Login

面向以 Business Portfolio 管理资产的 App（如 Meta Business Suite 扩展、WhatsApp/IG 管理类工具），使用 **Business Login for Business**：

- 流程基于 OAuth，但令牌发给 **System User** 或 Business Portfolio，而非个人
- 需要在 App Dashboard 的 "Facebook Login for Business" 产品卡下配置 Configuration 并生成专属的 login URL
- 配套权限通常是 Business Management、WhatsApp Business Management 等
- 详见 https://developers.facebook.com/docs/facebook-login/facebook-login-for-business

## access_token 校验（后端）

后端拿到客户端传来的 token 必须自行校验，**不要仅信任客户端**：

```
GET https://graph.facebook.com/debug_token
    ?input_token={user-token}
    &access_token={app-token-or-admin-token}
```

关键校验项：
- `data.app_id` === 你自己的 App ID（防止其它 App token 混用）
- `data.is_valid` === `true`
- `data.expires_at` 未过期（0 表示长期 token）
- `data.user_id` 与业务账号绑定一致
- 如需权限鉴权，检查 `data.scopes` 是否包含所需项

详见 https://developers.facebook.com/docs/facebook-login/guides/access-tokens/debugging

## Data Deletion Callback（GDPR 必做）

- App Dashboard → Settings → Basic → **Data Deletion Request URL** 或 **Instructions URL**
- 选 URL 方式时需实现一个回调：
  - 接收 Facebook 带签名的 `signed_request`（`application/x-www-form-urlencoded`）
  - 使用 App Secret 校验签名
  - 异步删除对应 user_id 的数据
  - 返回 JSON：`{"url": "<status-page-url>", "confirmation_code": "<code>"}`
- 应用内还必须提供用户主动发起删除的入口 + 联系邮箱
- 详见 https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback

## 注意事项

- **HTTPS 强制**：Web JS SDK 仅支持 HTTPS 页面
- **FB.logout 副作用**：可能同时登出 Facebook 主站；撤销权限需单独调 `DELETE /{user-id}/permissions`
- **权限审核**：`public_profile` + `email` 之外的任何权限上线前都要过 App Review
- **iOS ATT**：iOS 14.5+ 必须区分 `.enabled` / `.limited` 两种 tracking 模式，`.limited` 下拿到的是 `AuthenticationToken`（JWT），**不能调 Graph API**
- **Android Key Hash**：debug / release 两套 hash 必须都登记到 App Dashboard，否则登录会静默失败
- **token 仅在客户端有效不够**：后端必须走 `debug_token` 校验 `app_id + expires_at + user_id`
- **Mac Catalyst**：需启用 Keychain Sharing，否则 token 无法持久化
- **GDPR**：未配置 Data Deletion 回调或说明页无法通过 App Review

## 组合提示

- 与 **google-identity-services** 并列作为社交登录入口，后端统一以内部 user_id 归一
- 服务端 token 验证 + 业务 session 管理：通常结合 JWT / 自有 session 机制
- Business Login 场景常与 WhatsApp Business Platform、Instagram Graph API 搭配
- 配合 App Events / Meta Pixel 做归因和转化分析
