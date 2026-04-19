---
name: sign-in-with-apple
description: Sign in with Apple 全平台接入 —— iOS 原生 AuthenticationServices、Web/Android 走 Sign in with Apple JS、服务端通过 REST API 校验 identity_token (JWT) 并换取 refresh_token
tech_stack: [ios, web, android, apple-auth]
language: [swift, javascript]
capability: [auth, http-client]
version: "Sign in with Apple unversioned"
collected_at: 2026-04-19
---

# Sign in with Apple（苹果登录）

> 来源：
> - https://developer.apple.com/documentation/signinwithapple
> - https://developer.apple.com/documentation/signinwithapplejs
> - https://developer.apple.com/documentation/signinwithapplerestapi

## 用途

让用户使用 Apple Account（含两步验证）一键登录 App / 网站 / 其他平台，免去注册流程。Apple 返回 `identity_token`（JWT）+ `authorization_code`，你的服务端用它验证用户身份并建立本地会话。

## 何时使用

- **iOS / macOS / tvOS / watchOS 原生应用** → 使用 `AuthenticationServices` 框架（强制要求：App Store 审核规定，若提供第三方登录则必须同时提供 Sign in with Apple）
- **网站 / Web 应用** → 使用 Sign in with Apple JS SDK
- **Android / 非 Apple 平台** → 同样用 Sign in with Apple JS，走基于 `redirect_uri` 的 OAuth 重定向流程
- **服务端** → 使用 REST API `/auth/token` 换取 / 校验 token，`/auth/keys` 拉取 JWKS 验签

## 平台路由速查

| 场景 | SDK / API | 核心入口 |
|------|-----------|----------|
| iOS native | AuthenticationServices | `ASAuthorizationAppleIDProvider` + `ASAuthorizationController` |
| Web | Sign in with Apple JS | `AppleID.auth.init()` + `AppleID.auth.signIn()` |
| Android / 其他 | Sign in with Apple JS (redirect) | 重定向到 `appleid.apple.com/auth/authorize` |
| Server | REST API | `POST /auth/token`、`GET /auth/keys` |

## 基础用法

### 1. iOS 原生（Swift）

```swift
import AuthenticationServices

final class AppleSignInCoordinator: NSObject,
    ASAuthorizationControllerDelegate,
    ASAuthorizationControllerPresentationContextProviding {

    private var currentNonce: String?

    func start() {
        let nonce = randomNonceString()           // 32+ 字节随机串
        currentNonce = nonce

        let provider = ASAuthorizationAppleIDProvider()
        let request = provider.createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = sha256(nonce)             // 传 hash，原值留给后端比对
        request.state = UUID().uuidString         // 防 CSRF

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }

    func authorizationController(controller: ASAuthorizationController,
                                 didCompleteWithAuthorization auth: ASAuthorization) {
        guard let cred = auth.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = cred.identityToken,
              let idToken = String(data: tokenData, encoding: .utf8),
              let codeData = cred.authorizationCode,
              let code = String(data: codeData, encoding: .utf8)
        else { return }

        // 仅首次登录返回 fullName / email —— 立即本地持久化！
        let userId = cred.user
        let email  = cred.email
        let name   = cred.fullName

        // 把 idToken + code + rawNonce 发给自己的后端
        backend.verify(idToken: idToken, code: code, rawNonce: currentNonce!)
    }
}
```

### 2. Web / Android （Sign in with Apple JS）

```html
<script src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js"></script>
<script>
AppleID.auth.init({
  clientId:   'com.example.web',     // Services ID（不是 Bundle ID）
  scope:      'name email',
  redirectURI:'https://example.com/auth/apple/callback',
  state:      generateRandomState(),
  nonce:      generateRandomNonce(),
  usePopup:   true                   // false 走重定向（Android / 非 Safari）
});

document.getElementById('apple-btn').addEventListener('click', async () => {
  try {
    const data = await AppleID.auth.signIn();
    // data.authorization.{id_token, code, state}
    // data.user（仅首次）.{ name:{firstName,lastName}, email }
    await fetch('/auth/apple', { method:'POST', body: JSON.stringify(data) });
  } catch (err) {
    // err 符合 SignInErrorI，error 常见 'popup_closed_by_user'
  }
});
</script>
```

Android / 非 Apple 平台通常 `usePopup:false`，走重定向到 `https://appleid.apple.com/auth/authorize?...`，Apple 回跳到 `redirect_uri` 并以 `form_post` 带回 `code` / `id_token` / `state` / `user`。

### 3. 服务端校验 identity_token（Node.js 示例）

```javascript
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const client = jwksClient({ jwksUri: 'https://appleid.apple.com/auth/keys' });

function getKey(header, cb) {
  client.getSigningKey(header.kid, (err, key) => cb(err, key?.getPublicKey()));
}

export function verifyAppleIdToken(idToken, expectedNonce, expectedAud) {
  return new Promise((resolve, reject) => {
    jwt.verify(idToken, getKey, {
      algorithms: ['RS256'],
      issuer:   'https://appleid.apple.com',
      audience: expectedAud,                 // Bundle ID（iOS）或 Services ID（Web）
    }, (err, payload) => {
      if (err) return reject(err);
      // payload: { sub, email, email_verified, is_private_email, nonce, ... }
      if (payload.nonce !== sha256(expectedNonce)) return reject('nonce mismatch');
      resolve(payload);
    });
  });
}
```

换取 refresh_token（`POST https://appleid.apple.com/auth/token`）：

```
grant_type=authorization_code
code=<authorization_code>
client_id=<bundle_or_services_id>
client_secret=<JWT signed with your p8 key>  # ES256, aud=https://appleid.apple.com
redirect_uri=<must match>                     # 仅 web 流程需要
```

返回 `{ access_token, refresh_token, id_token, expires_in, token_type }`。

> client_secret 本身是一个由你用 `AuthKey_xxx.p8` (ES256) 签的 JWT，最长有效期 6 个月。完整字段与 `/auth/token` 请求/响应结构详见 https://developer.apple.com/documentation/signinwithapplerestapi/generate_and_validate_tokens

## 关键 API 摘要

**iOS (AuthenticationServices)**
- `ASAuthorizationAppleIDProvider.createRequest()` — 构造登录请求
- `request.requestedScopes` — `[.fullName, .email]`
- `request.nonce` / `request.state` — 必设，防重放 / CSRF
- `ASAuthorizationAppleIDCredential` — 含 `user`、`identityToken`、`authorizationCode`、`fullName`、`email`、`realUserStatus`
- `ASAuthorizationPasswordProvider` — 同时请求 Keychain 密码，避免重复建账

**Sign in with Apple JS**
- `AppleID.auth.init(ClientConfigI)` — 初始化
- `AppleID.auth.signIn()` — 触发登录，返回 `SignInResponseI`
- `AuthorizationI` — `{ id_token, code, state }`
- `UserI` — `{ name: NameI, email }`，仅首次返回

**REST API**
- `POST /auth/token` — 换 token / 刷新 token
- `GET /auth/keys` — JWKS 公钥集，验签用
- `POST /auth/revoke` — 撤销 token
- Objects: `JWKSet`、`TokenResponse`、`ErrorResponse`

完整参数清单见 https://developer.apple.com/documentation/signinwithapplerestapi

## 注意事项

- **用户信息仅首次返回**：`fullName` / `email` 只在用户第一次授权该 App 时下发，必须立即本地持久化 + 同步到自己的后端。后续登录只能从 `id_token` 拿到 `email`（可能是私邮中继地址），拿不到姓名。
- **realUserStatus 仅首次返回**：真人判定结果（unsupported / unknown / likelyReal）也只在首登返回，用于风控需及时存档。
- **nonce 必须做 SHA-256**：iOS 端 `request.nonce` 填 hash 值，原始 raw nonce 保留到后端，用来对比 `id_token.nonce` 字段。
- **audience 区分**：iOS 端 `aud` = Bundle ID；Web / Android 端 `aud` = Services ID。两套客户端登录需要分别校验。
- **私邮中继 (Private Email Relay)**：`email` 可能形如 `xxx@privaterelay.appleid.com`，要向 Apple 服务端列表配置发件域名才能转发；`is_private_email:true` 时别把这邮箱当用户身份主键。
- **sub 是唯一稳定标识**：用 `id_token.sub`（即 credential.user）做用户主键，而不是 email（email 可撤销转发，甚至用户改真实邮箱）。
- **App 卸载 ≠ 解除授权**：用户需在 "设置 → Apple ID → 密码与安全性 → 使用 Apple ID 的 App" 中手动撤销；重装 App 仍是老账号。
- **client_secret 是 JWT**：每次调用 `/auth/token` 的 `client_secret` 需用 p8 私钥签发 ES256 JWT，`iss`=TeamID、`sub`=client_id、`aud`=`https://appleid.apple.com`、`exp` ≤ 6 个月。
- **跨平台单次授权**：在开发者后台将多个 App（iOS Bundle ID + Services ID）归为同一 App Group，用户一次授权全平台共用同一 `sub`。
- **Android / 非 Safari**：不能用 popup，用 `response_mode=form_post` 的重定向流程，Apple 会 POST 到 `redirect_uri`。
- **App Store 审核强制**：若提供 Facebook / Google 等第三方登录，必须同时提供 Sign in with Apple 且视觉同等显著。

## 组合提示

- 与后端 session / JWT 体系组合：验证通过后签发自己的 access/refresh token
- 与 `ASAuthorizationPasswordProvider`（iOS Keychain）联合展示，提升既有账号命中率
- 与 Google Identity Services / 微信登录并列集成时，注意 Apple 的视觉同等规则
- 服务端收到 Apple 的 "Server-to-Server notification"（account delete / email change）需订阅处理；详见 "Processing changes for Sign in with Apple accounts"
