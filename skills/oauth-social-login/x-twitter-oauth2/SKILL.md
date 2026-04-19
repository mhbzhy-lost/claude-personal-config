---
name: x-twitter-oauth2
description: X（Twitter）OAuth 2.0 Authorization Code + PKCE 登录接入指南，覆盖授权 URL 构造、token 兑换、刷新与 v2 用户资料获取
tech_stack: [x-twitter, oauth2]
capability: [auth, http-client]
version: "x-api v2 unversioned"
collected_at: 2026-04-19
---

# X (Twitter) OAuth 2.0 with PKCE

> 来源：https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code, https://docs.x.com/fundamentals/authentication/overview

## 用途
以 OAuth 2.0 Authorization Code Flow + PKCE 接入 X（原 Twitter）账号登录，代表终端用户访问 X API v2（读取资料、发推、私信等），兼容 Web、SPA 与移动端 public client。

## 何时使用
- 在第三方应用中提供"Sign in with X"登录入口
- 代表用户调用 X API v2（`users/me`、`tweets`、`dm` 等）
- 需要按 scope 精细控制权限（tweet.write / dm.write / bookmark 等 23 种）
- SPA / 移动 App 等无法保密 client_secret 的 public client（PKCE 是必需项）
- 需要长期代表用户操作：使用 `offline.access` 获取 refresh_token

## 认证方法总览

| 方法 | 场景 | 说明 |
|------|------|------|
| **OAuth 2.0 Authorization Code + PKCE** | 用户上下文（本 skill 重点） | X API v2 独占支持；支持 public & confidential client |
| OAuth 1.0a User Context | 旧版用户上下文 | 完整教程需 X Enterprise / paid tier 访问 developer.x.com，本 skill 不覆盖 |
| App Only (Bearer Token) | 读取公开数据 | 无用户上下文，仅可访问公开资源 |
| Basic Authentication | X 企业版 API | 仅 enterprise endpoints |

客户端分类：
- **Public client**（Native App / SPA）：无法安全保存 secret，**必须** PKCE
- **Confidential client**（服务端 Web App / bot）：可保存 secret，仍建议启用 PKCE

## 基础用法

### 1. 生成 PKCE 参数（前端/client 侧）

```js
// code_verifier：43–128 位 URL-safe 随机串
const code_verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));

// code_challenge = BASE64URL(SHA256(code_verifier))
const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code_verifier));
const code_challenge = base64url(new Uint8Array(hash));
// code_challenge_method = 'S256'（优先使用，比 plain 更安全）
```

把 `code_verifier` 暂存在 session / 安全存储中，后续 token 兑换时回传。

### 2. 构造授权 URL 并跳转

```
https://twitter.com/i/oauth2/authorize
  ?response_type=code
  &client_id=<CLIENT_ID>
  &redirect_uri=<EXACT_MATCH_CALLBACK>
  &scope=tweet.read%20users.read%20offline.access
  &state=<CSRF_TOKEN>
  &code_challenge=<CHALLENGE>
  &code_challenge_method=S256
```

- Web：直接 `window.location.href = authorizeUrl`
- 移动端：**Custom Tabs (Android) / ASWebAuthenticationSession (iOS)**，避免 WebView
- SPA：同 Web；`state` 存 `sessionStorage` 做 CSRF 校验

### 3. 回调中兑换 token

`POST https://api.twitter.com/2/oauth2/token`（`Content-Type: application/x-www-form-urlencoded`）

```
grant_type=authorization_code
&code=<从回调 query 拿到>
&redirect_uri=<与授权 URL 完全一致>
&client_id=<CLIENT_ID>
&code_verifier=<步骤1 存下的 verifier>
```

Confidential client 额外在 `Authorization: Basic base64(client_id:client_secret)` 中带 secret。

响应：
```json
{
  "token_type": "bearer",
  "expires_in": 7200,
  "access_token": "...",
  "scope": "tweet.read users.read offline.access",
  "refresh_token": "..."   // 仅当 scope 含 offline.access
}
```

### 4. 调用 v2 API

```
GET https://api.twitter.com/2/users/me
Authorization: Bearer <access_token>
```

### 5. 刷新 access_token

`POST https://api.twitter.com/2/oauth2/token`

```
grant_type=refresh_token
&refresh_token=<REFRESH>
&client_id=<CLIENT_ID>
```

## 关键参数

| 参数 | 说明 |
|------|------|
| `response_type` | 固定 `code` |
| `client_id` | 开发者后台 App 的 Client ID |
| `redirect_uri` | 必须与后台配置**完全一致**（scheme / host / path / 大小写） |
| `state` | CSRF token，最长 500 字符，回调必须校验 |
| `code_challenge` | `BASE64URL(SHA256(code_verifier))` |
| `code_challenge_method` | `S256`（推荐）或 `plain` |
| `scope` | 空格分隔；加 `offline.access` 才会下发 refresh_token |

常用 scope：`tweet.read` `tweet.write` `users.read` `follows.read` `follows.write` `dm.read` `dm.write` `bookmark.read` `bookmark.write` `offline.access`（共 23 种）。

## 注意事项

- **Access token 默认只有 2 小时**；需要长期访问必须申请 `offline.access` 并用 refresh_token 续期
- `redirect_uri` 在授权 / 兑换两步中必须**完全一致**，否则 `invalid_request`
- PKCE 的 `code_verifier` 严禁泄漏或复用；一次授权一套
- `code_challenge_method` 选 `S256`，不要用 `plain`
- X API v2 **只支持 OAuth 2.0**；要走 OAuth 1.0a 必须确认接口是否还在 v1.1 提供
- OAuth 1.0a 完整教程需 **X Enterprise / paid tier** 才能访问 developer.x.com 对应文档
- 速率限制：tweet/user lookup 在 OAuth 2.0 下为 **900 req / 15min**（OAuth 1.0a 为 300）
- 移动端严禁用 WebView 承载授权页：使用 **Android Custom Tabs** / **iOS ASWebAuthenticationSession**，否则易被商店判定 UX 违规且无法共享登录态
- API keys / tokens / secrets 在 Developer Console 的 Apps 区域生成

## 组合提示
- 与通用 `oauth2-pkce` 实现库搭配（如 `openid-client`、`AppAuth-JS/Android/iOS`）
- 服务端保存 refresh_token 时加密存储，前端只持有 access_token
- 与其他社交登录（Google / Apple）共用统一回调抽象层
