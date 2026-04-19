---
name: amazon-login-with-amazon
description: 基于 OAuth 2.0 的 Amazon 登录（LWA）接入指南，覆盖 Web Authorization Code Grant（含 PKCE）、iOS/Android SDK 与用户 Profile 获取
tech_stack: [oauth-social-login, amazon-lwa, ios, android]
language: [javascript, objc, java]
capability: [auth, http-client]
version: "login-with-amazon unversioned"
collected_at: 2026-04-19
---

# Login with Amazon（Amazon 账号登录，LWA）

> 来源：
> - https://developer.amazon.com/docs/login-with-amazon/documentation-overview.html
> - https://developer.amazon.com/docs/login-with-amazon/authorization-code-grant.html
> - https://developer.amazon.com/docs/login-with-amazon/use-sdk-ios.html
> - https://developer.amazon.com/docs/login-with-amazon/use-sdk-android.html

## 用途
利用 Amazon 账号体系为你的 Web / iOS / Android / TV 等设备应用提供 OAuth 2.0 登录，获取用户 `userID / name / email / postalCode` 等 profile 字段。

## 何时使用
- 需要让 Amazon 购物用户一键登录第三方站点 / App
- 移动端希望使用 Amazon 原生 SDK 打通 SSO（已登录 Amazon shopping App 的用户可免密授权）
- TV / IoT 等无键盘设备使用 Code-Based Linking（CBL）完成授权
- 需要在支持 PKCE 的纯浏览器端（SPA）完成 Authorization Code 流程，而不泄漏 `client_secret`

## 基础用法

### Web — Authorization Code Grant（推荐，服务端换 token）

1) 重定向用户到 authorize 端点：

```
https://www.amazon.com/ap/oa?client_id=foodev
  &scope=profile
  &response_type=code
  &state=<anti-csrf-random>
  &redirect_uri=https://client.example.com/cb
  &code_challenge=Fw7s3XHRVb2m1nT7s646UrYiYLMJ54as0ZIU_injyqw
  &code_challenge_method=S256
```

2) 服务端用 code 换 token（POST `api.amazon.com/auth/o2/token`）：

```
grant_type=authorization_code
&code=SplxlOBezQQYbYS6WxSbIA
&client_id=foodev
&client_secret=Y76SDl2F
&redirect_uri=https://client.example.com/cb
&code_verifier=5CFCAiZC0g0OA-jmBmmjTBZiyPCQsnq_2q5k9fD-aAY   # 若使用了 PKCE
```

响应：

```json
{
  "access_token": "Atza|IQEB...",
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "Atzr|IQEB..."
}
```

### Web — SPA（PKCE via JS SDK，无 client_secret）

```javascript
amazon.Login.authorize({ scope: 'profile', pkce: true }, function (resp) {
  if (resp.error) return;
  amazon.Login.retrieveToken(resp.code, function (r) {
    if (r.error) return;
    console.log('Access Token:', r.access_token);
  });
});
```

### iOS — 最小登录 + 回调路由

`AppDelegate` 中处理 redirect：

```objc
- (BOOL)application:(UIApplication *)application openURL:(NSURL *)url
            options:(NSDictionary<UIApplicationOpenURLOptionsKey,id> *)options {
  return [AMZNAuthorizationManager
            handleOpenURL:url
        sourceApplication:options[UIApplicationOpenURLOptionsSourceApplicationKey]];
}
```

点击登录按钮：

```objc
AMZNAuthorizeRequest *req = [[AMZNAuthorizeRequest alloc] init];
req.scopes = @[[AMZNProfileScope profile], [AMZNProfileScope postalCode]];

[[AMZNAuthorizationManager sharedManager] authorize:req
  withHandler:^(AMZNAuthorizeResult *result, BOOL userDidCancel, NSError *error) {
    if (error)            { /* SDK / 授权服务器错误 */ }
    else if (userDidCancel){ /* 用户取消 */ }
    else {
      NSString *token = result.token;
      AMZNUser *user  = result.user;   // user.userID / name / email / postalCode
    }
}];
```

### Android — 初始化 + 登录

```java
// onCreate
requestContext = RequestContext.create(this);
requestContext.registerListener(new AuthorizeListener() {
    @Override public void onSuccess(AuthorizeResult r)           { /* 已授权 */ }
    @Override public void onError(AuthError e)                   { /* 错误 */ }
    @Override public void onCancel(AuthCancellation c)           { /* 取消 */ }
});

// onResume 必须转发
@Override protected void onResume() { super.onResume(); requestContext.onResume(); }

// 点击登录
AuthorizationManager.authorize(
    new AuthorizeRequest.Builder(requestContext)
        .addScopes(ProfileScope.profile(), ProfileScope.postalCode())
        .build());
```

## 关键 API（摘要）

### Authorize 端点参数（`https://www.amazon.com/ap/oa`）
- `client_id`（必填，≤100 字节）
- `scope`（必填，空格分隔）：`profile`、`profile:user_id`、`postal_code`
- `response_type=code`（必填）
- `redirect_uri`（必填，必须 HTTPS）
- `state`（强烈建议，防 CSRF；响应会原样带回，客户端必须校验）
- `code_challenge` + `code_challenge_method`（PKCE，推荐 `S256`；默认 `plain`）

### Token 端点（区域化）
- NA：`https://api.amazon.com/auth/o2/token`
- EU：`https://api.amazon.co.uk/auth/o2/token`
- FE：`https://api.amazon.co.jp/auth/o2/token`
- `grant_type`：`authorization_code` 或 `refresh_token`
- 浏览器端 **省略** `client_secret`，用 `code_verifier` 校验

### iOS SDK
- `AMZNAuthorizationManager sharedManager` — `authorize:withHandler:` / `signOut:` / `handleOpenURL:sourceApplication:`
- `AMZNAuthorizeRequest.scopes` — `[AMZNProfileScope profile]` / `[AMZNProfileScope postalCode]`
- `AMZNAuthorizeRequest.interactiveStrategy = AMZNInteractiveStrategyNever` — 启动时静默检测已有授权
- `AMZNUser fetch:` — 单独拉 profile（`userID / name / email / postalCode`）
- `AMZNAuthorizeResult` — `token` + `user`

### Android SDK
- `RequestContext.create(this)` + `requestContext.onResume()`（生命周期转发必做）
- `requestContext.registerListener(AuthorizeListener)` — `onSuccess / onError / onCancel`
- `AuthorizationManager.authorize(AuthorizeRequest)` — 触发登录
- `AuthorizationManager.getToken(ctx, scopes, Listener)` — 启动时检查已有登录，`result.getAccessToken() == null` 表示未登录
- `AuthorizationManager.signOut(ctx, Listener)` — 登出
- `User.fetch(ctx, Listener<User, AuthError>)` — 取 profile

### 常见错误码
Authorization 响应：`invalid_request` / `unauthorized_client` / `access_denied` / `unsupported_response_type` / `invalid_scope` / `server_error` / `temporarily_unavailable`
Token 响应：`invalid_request` / `invalid_client` / `invalid_grant`（code 过期或被吊销，或对不上 client） / `unauthorized_client`（`code_verifier` 无效） / `unsupported_grant_type` / `ServerError`

## 注意事项
- **Authorization code 有效期 5 分钟**，长度 18–128 字符；必须在服务器端尽快换 token。
- **`state` 必须校验**：Amazon 原样返回，客户端要比对本地会话中保存的值，否则无法防 CSRF。
- **SPA / 浏览器端必须使用 PKCE**：`code_challenge_method=S256`（默认 `plain` 不安全），请求 token 时携带 `code_verifier`，**不要发送 `client_secret`**。
- `client_id` 上限 100 字节；`access_token` / `refresh_token` 各上限 2048 字节，DB 字段要预留足够长度。
- **按区域选 token 端点**：NA / EU（`.co.uk`）/ Far East（`.co.jp`）；授权端点 `www.amazon.com/ap/oa` 通用。
- `redirect_uri` 必须与 authorize 请求和 token 请求**完全一致**，且为 HTTPS。
- iOS 10 模拟器出现 "APIKey for the Application is invalid" 时，在 Capabilities 打开 **Keychain Sharing** 作为 workaround。
- Android：**务必** 在 `onResume` 里调 `requestContext.onResume()`，否则登录回调不会触发。
- Android 启动时判断登录状态用 `getToken`，结果为 null 即未登录；iOS 等价做法是用 `AMZNInteractiveStrategyNever` 的 authorize 请求。
- 安全要点：防开放重定向（严格校验白名单 `redirect_uri`）、防资源所有者冒用、避免在 WebView 中承载授权页（官方文档明确列为风险点）。

## 组合提示
- 服务端换 token 后，一般与自家会话/JWT 结合落地；`refresh_token` 存服务端，`access_token` 走短期缓存。
- 与其他 OAuth provider（Google Sign-In / Sign in with Apple）可共用 state + PKCE 基础设施，仅 provider 端点和 scope 名称不同。
- 设备端（TV / IoT）改走 CBL（Code-Based Linking）流程，不使用本 skill 描述的浏览器/移动 SDK。
