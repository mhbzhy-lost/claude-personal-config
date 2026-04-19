---
name: google-identity-services
description: Google Identity Services 一站式接入指南，覆盖 Web One Tap / Sign In With Google 按钮、OAuth 2.0 授权码流程、OIDC id_token 校验、iOS GIDSignIn
tech_stack: [web, ios, oauth2, oidc]
language: [javascript, swift]
capability: [auth, http-client]
version: "Google Identity Services unversioned; GoogleSignIn-iOS 9.0.0 (>=7.1.0 required since 2024-05-01)"
collected_at: 2026-04-19
---

# Google Identity Services（Google 身份服务）

> 来源：
> - https://developers.google.com/identity/gsi/web/guides/overview
> - https://developers.google.com/identity/protocols/oauth2
> - https://developers.google.com/identity/openid-connect/reference
> - https://developers.google.com/identity/sign-in/ios/start-integrating

## 用途

Google 官方统一身份接入方案，基于 OAuth 2.0 / OpenID Connect，同时提供登录（authentication）与授权（authorization）。Web 端通过 Google Identity Services (GIS) JS 库渲染「Sign In With Google」按钮、One Tap 弹窗、自动登录；iOS 通过 GoogleSignIn SDK 集成；服务端校验 `id_token` 获取稳定用户身份。

## 何时使用

- 网站/App 需要第三方社交登录，快速拿到已验证邮箱和基础 profile
- 需要调用 Google API（Gmail/Drive/Calendar 等），走 OAuth 2.0 授权码 + refresh_token
- 企业场景限制仅特定 Google Workspace 域用户登录（通过 `hd` claim）
- iOS App 需要调用后端 API，用 server auth code 换取后端可用的 access/refresh token
- 用于表单反滥用（拿 Google 已验证身份但保持用户匿名）

## OAuth 2.0 五步模型

1. 在 Google API Console 申请 Client ID / Secret（按平台选择类型：Web / iOS / Android / Chrome Extension / TV & Limited Input / Service Account）
2. 向 Authorization Server 请求 access token（`scope` 决定权限范围）
3. 对比返回 scope 与必需 scope，确认授权完整
4. 用 `Authorization: Bearer <token>` 请求头调用 API（**禁止**放 URL query，安全原因）
5. access_token 过期后用 refresh_token 续期

## Web：Sign In With Google 按钮 + One Tap（最小示例）

```html
<script src="https://accounts.google.com/gsi/client" async defer></script>

<div id="g_id_onload"
     data-client_id="YOUR_CLIENT_ID.apps.googleusercontent.com"
     data-callback="handleCredential"
     data-use_fedcm_for_prompt="true"
     data-nonce="RANDOM_NONCE_BOUND_TO_SESSION"></div>
<div class="g_id_signin" data-type="standard"></div>

<script>
  function handleCredential(response) {
    // response.credential 就是 id_token (JWT)，发给后端校验
    fetch('/auth/google', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({credential: response.credential})
    });
  }
</script>
```

**FedCM 迁移**：新接入必须开启 `data-use_fedcm_for_prompt="true"`，Chrome 正逐步下线第三方 Cookie，不开启 One Tap 会失效。

## Web：OAuth 2.0 授权码流程（SPA + 后端）

### 1. 构造 Authorization URL

**端点**：`GET/POST https://accounts.google.com/o/oauth2/v2/auth`

```
https://accounts.google.com/o/oauth2/v2/auth?
  client_id=YOUR_CLIENT_ID
  &redirect_uri=https%3A%2F%2Fyour.app%2Fcallback
  &response_type=code
  &scope=openid%20email%20profile%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.readonly
  &access_type=offline          # 需要 refresh_token 时必填
  &prompt=consent                # 首次务必带，否则拿不到 refresh_token
  &state=CSRF_RANDOM             # 必填，回调时校验
  &nonce=REPLAY_RANDOM           # OIDC 场景必填，写入 id_token 供校验
  &code_challenge=BASE64URL_SHA256
  &code_challenge_method=S256    # SPA 必须走 PKCE
```

**必填参数**：`client_id`、`response_type`、`redirect_uri`、`scope`
**强烈建议**：`state`、`nonce`、PKCE（`code_challenge` + `code_challenge_method=S256`）

### 2. code → token 交换

**端点**：`POST https://oauth2.googleapis.com/token`

```http
POST /token HTTP/1.1
Host: oauth2.googleapis.com
Content-Type: application/x-www-form-urlencoded

code=AUTH_CODE
&client_id=YOUR_CLIENT_ID
&client_secret=YOUR_CLIENT_SECRET       # SPA 使用 PKCE 可省略
&redirect_uri=https://your.app/callback  # 必须与步骤 1 完全一致
&grant_type=authorization_code
&code_verifier=ORIGINAL_PKCE_VERIFIER
```

响应：`{access_token, expires_in, refresh_token, id_token, scope, token_type}`

### 3. 刷新 access_token

```
POST https://oauth2.googleapis.com/token
grant_type=refresh_token&refresh_token=...&client_id=...&client_secret=...
```

### 4. 撤销

```
POST https://oauth2.googleapis.com/revoke?token=ACCESS_OR_REFRESH_TOKEN
```

## 服务端：id_token 校验（OIDC）

**Discovery**：`https://accounts.google.com/.well-known/openid-configuration`
**JWKS**：discovery 文档的 `jwks_uri` 字段（证书会轮换，**必须缓存并尊重 Cache-Control**）

校验步骤（生产必须全跑）：
1. 用 JWKS 公钥验签（RS256）
2. `iss` ∈ {`https://accounts.google.com`, `accounts.google.com`}
3. `aud` == 你的 Client ID
4. `exp` 未过期，`iat` 合理
5. `nonce` 与请求时一致
6. 若限域：校验 `hd` == 你的 Workspace 域
7. 以 `sub` 作为稳定用户主键，**不要用 `email`**（邮箱可变）
8. 仅 `email_verified == true` 才能把邮箱视作可信身份

调试端点：`GET https://oauth2.googleapis.com/tokeninfo?id_token=...`（**仅调试，生产必须本地 JWKS 验签**）

### 关键 id_token claims

| claim | 含义 |
|-------|------|
| `sub` | 唯一用户 ID，永不变——账户主键必须用它 |
| `iss` | 签发者 |
| `aud` | 必须等于你的 Client ID |
| `iat` / `exp` | 签发/过期时间（Unix epoch） |
| `email` / `email_verified` | 邮箱及是否已验证 |
| `name` / `given_name` / `family_name` / `picture` | 基础 profile |
| `hd` | Google Workspace 组织域，用于限域登录 |
| `nonce` | 防重放，必须回对 |

## iOS：GoogleSignIn

### 安装

**SPM**（推荐）：仓库 `https://github.com/google/GoogleSignIn-iOS` 版本 `9.0.0`，产品 `GoogleSignIn`（SwiftUI 额外加 `GoogleSignInSwift`）。

**CocoaPods**：
```ruby
pod 'GoogleSignIn'
pod 'GoogleSignInSwiftSupport'  # SwiftUI
```

### Info.plist 配置

```xml
<key>GIDClientID</key>
<string>YOUR_IOS_CLIENT_ID</string>
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>YOUR_DOT_REVERSED_IOS_CLIENT_ID</string>
    </array>
  </dict>
</array>
<!-- 可选：需要后端校验 id_token / 换 refresh token 时填 Web 类型 Client ID -->
<key>GIDServerClientID</key>
<string>YOUR_SERVER_CLIENT_ID</string>
<key>GIDHostedDomain</key>
<string>YOUR_HOSTED_DOMAIN</string>
```

### 客户端 ID 两种

- **iOS Client ID**：填 `GIDClientID`，用于 App 本地登录
- **Web Client ID**：填 `GIDServerClientID`，用于拿到 server auth code 给后端换 refresh_token / 校验 id_token 时作为 `aud`

## 关键 API 速查

| 场景 | 端点/方法 |
|------|-----------|
| JS 库 | `https://accounts.google.com/gsi/client` |
| Authorization | `GET/POST https://accounts.google.com/o/oauth2/v2/auth` |
| Token 交换/刷新 | `POST https://oauth2.googleapis.com/token` |
| Device Flow | `POST https://oauth2.googleapis.com/device/code` |
| 撤销 | `POST https://oauth2.googleapis.com/revoke` |
| UserInfo | `GET https://openidconnect.googleapis.com/v1/userinfo` |
| Token 调试 | `GET https://oauth2.googleapis.com/tokeninfo` |
| Discovery | `GET https://accounts.google.com/.well-known/openid-configuration` |

## 注意事项（常见坑）

- **redirect_uri 严格匹配**：Console 里注册的与请求/交换 code 时传入的必须字节级相同（含末尾斜杠、端口）
- **SPA 必须用 PKCE**：`code_challenge_method=S256`，不要在前端暴露 `client_secret`
- **想要 refresh_token 必须** `access_type=offline` + `prompt=consent`（首次）；第二次授权若用户已同意，不带 `prompt=consent` 不会再返回 refresh_token
- **refresh_token 失效场景**：用户撤销、**6 个月未使用**、修改 Gmail scope 相关密码、超过每 Client ID 每账户 **100 个**的上限、管理员限制、GCP session policy
- **Token 大小**：authorization code ≤ 256B；access token ≤ 2048B；refresh token ≤ 512B——后端数据库字段留够
- **调用 API 传 token 必须用 Header**：`Authorization: Bearer <token>`，禁止 query string
- **账户主键用 `sub` 不用 `email`**：email 可能被用户更改
- **`email_verified` 必须校验**：false 时不得视作可信身份
- **限域登录**：校验 `hd` claim，不要只信 email 后缀
- **nonce/state 必须**：防 CSRF 与 id_token 重放
- **JWKS 公钥会轮换**：本地校验必须用 HTTP 库拉取并遵守 `Cache-Control`，不要硬编码证书
- **tokeninfo 仅调试**：生产走 JWKS 本地验签，避免每次登录都网络往返
- **FedCM**：新接入必开，Chrome 第三方 Cookie 下线后 One Tap 依赖 FedCM
- **iOS SDK 版本下限**：自 2024-05-01 起 Apple 要求 Privacy Manifest 与签名，**GoogleSignIn-iOS 必须 ≥ 7.1.0**
- **iOS Keychain**：App 必须用 Apple 证书签名才能写入 Keychain 存凭据

## 组合提示

- **后端框架**：Django / FastAPI / Express 常配合 `google-auth`（Python）、`google-auth-library`（Node）库做 id_token 验签
- **SPA**：与 React/Vue/Next.js 集成时，把 `credential`（id_token）POST 给自家后端换 session
- **移动端**：iOS GIDSignIn + 后端用同一个 Web Client ID 作为 `GIDServerClientID`，前端拿 `serverAuthCode` 给后端换 token
- **Workspace SSO**：结合 `hd` claim + Admin SDK 做组织内成员管理
