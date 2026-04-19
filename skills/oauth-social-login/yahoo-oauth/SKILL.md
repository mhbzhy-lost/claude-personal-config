---
name: yahoo-oauth
description: Yahoo OAuth 2.0 与 OpenID Connect 授权码流（含 ID Token / refresh / xoauth_yahoo_guid）实施指南
tech_stack: [oauth-social-login, yahoo]
capability: [auth, http-client]
version: "yahoo-oauth unversioned"
collected_at: 2026-04-19
---

# Yahoo OAuth 2.0 / OpenID Connect

> 来源：
> - https://developer.yahoo.com/oauth2/guide/
> - https://developer.yahoo.com/oauth2/guide/flows_authcode/
> - https://developer.yahoo.com/oauth2/guide/openid_connect/
> - https://developer.yahoo.com/oauth2/guide/openid_connect/getting_started.html

## 用途
让第三方应用通过 Yahoo 账户完成用户授权（OAuth 2.0）或身份认证（OIDC），拿到 access token / refresh token / ID Token，再调用 Yahoo 相关 API（当前仅覆盖 Oath Ad Platforms 与 UserInfo）。

## 何时使用
- 服务端 Web 应用需要调用 Yahoo UserInfo / Ad Platforms API
- 产品想提供 "Sign in with Yahoo" 登录按钮（走 OIDC 拿 ID Token）
- 已用 OAuth 1.0a 接入 Yahoo、需平滑迁移到 OAuth 2.0
- 移动端（iOS/Android）接入：无原生 SDK，需走 Web 授权流（WKWebView / Chrome Custom Tabs）

## 基础用法

### 一、应用注册（前置）
1. 注册 Yahoo 账户并进入 Yahoo Developer Network 创建应用
2. 填应用名、Homepage、回调域名（`redirect_uri` 的 host 必须匹配）
3. 勾选需要的 API scope（如 Mail Read = `mail-r`）
4. 创建后在 "My Apps" 取 **Consumer Key**（`client_id`）与 **Consumer Secret**（`client_secret`）

### 二、OAuth 2.0 Authorization Code Flow（服务端应用）

Step 1 — 构造授权 URL，浏览器跳转：
```
GET https://api.login.yahoo.com/oauth2/request_auth
    ?client_id=<CONSUMER_KEY>
    &redirect_uri=<CALLBACK_URL>            # 或使用 oob 进行带外
    &response_type=code
    &state=<CSRF_TOKEN>                     # 可选，建议带上
    &language=en-us                         # 可选
```

Step 2 — 用户同意后 302 回跳到 `redirect_uri?code=...&state=...`，服务端取出 `code`。

Step 3 — 用 code 换 token：
```
POST https://api.login.yahoo.com/oauth2/get_token
Content-Type: application/x-www-form-urlencoded

client_id=<KEY>&client_secret=<SECRET>
&redirect_uri=<CALLBACK_URL>
&code=<AUTH_CODE>
&grant_type=authorization_code
```
响应：
```json
{
  "access_token": "...",        // 1 小时有效
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "...",       // 长效
  "xoauth_yahoo_guid": "..."    // Yahoo 用户唯一标识
}
```

Step 4 — access_token 过期后用 refresh_token 续期：
```
POST https://api.login.yahoo.com/oauth2/get_token
client_id=<KEY>&client_secret=<SECRET>
&redirect_uri=<CALLBACK_URL>
&refresh_token=<REFRESH_TOKEN>
&grant_type=refresh_token
```

### 三、OIDC Authorization Code Flow（登录 / 拿 ID Token）

与 OAuth 2.0 的差异只有两点：授权请求 **必须带 `scope=openid`** 与 **`nonce`**，token 响应中多一个 `id_token`（JWT）。

```
GET https://api.login.yahoo.com/oauth2/request_auth
    ?client_id=<KEY>
    &redirect_uri=<CALLBACK>
    &response_type=code
    &scope=openid%20mail-r                  # openid 必填；其它 scope 可叠加
    &nonce=<URL_SAFE_RANDOM>                # 必填，防重放
    &state=<CSRF_TOKEN>                     # 建议
    &prompt=consent|login                   # 可选
    &max_age=<seconds>                      # 可选
```

token 响应额外包含 `id_token`。使用前必须：
1. 通过 Yahoo JWKS 验证 JWT 签名
2. 校验 `iss` / `aud`（=`client_id`）/ `exp` / `iat`
3. 校验 `nonce` 与本次请求一致
4. （Hybrid Flow 时）校验 `at_hash` 与 access_token 的哈希匹配
5. 从 `sub` 或 `xoauth_yahoo_guid` 取稳定用户 ID

## 关键 API（摘要）

| 名称 | 值 / 含义 |
|---|---|
| Authorization Endpoint | `https://api.login.yahoo.com/oauth2/request_auth` |
| Token Endpoint | `https://api.login.yahoo.com/oauth2/get_token` |
| `response_type` | 固定 `code`（Authorization Code Flow） |
| `grant_type` | `authorization_code` / `refresh_token` |
| `scope` | OIDC 必含 `openid`；可叠加 `mail-r` 等 API scope |
| `nonce` | OIDC 必填，URL-safe 随机串，防重放 |
| `state` | 推荐填写，防 CSRF |
| `prompt` | `consent` 每次强制同意；`login` 强制重新登录 |
| `access_token` | Bearer，默认 1 小时 TTL |
| `refresh_token` | 长效，用于续期 |
| `id_token` | JWT，仅 OIDC 返回 |
| `xoauth_yahoo_guid` | Yahoo 用户 ID，OAuth 与 OIDC 响应都带 |

## 注意事项
- **OAuth 2.0 覆盖面有限**：目前只支持 Oath Ad Platforms 与 UserInfo API，其它 Yahoo API 可能仍需 OAuth 1.0a
- **从 1.0a 迁移无需重新授权**：用原来的 refresh_token 走 Explicit Grant 换新的 OAuth 2.0 access token
- **redirect_uri 必须与注册时的 callback domain 精确匹配**；无回调页时可用 `oob`（out-of-band）拿到页面上显示的 code
- **access_token 只有 1 小时**，后端必须实现 refresh 机制；refresh_token 不会随每次刷新更换（除非 Yahoo 返回了新的）
- **OIDC nonce 必填**，且必须在服务端存会话再比对；Authorization Code Flow 比 Hybrid Flow 更安全，优先选择前者
- **ID Token 必须本地校验签名与 claims**，不能仅解码就信任其内容
- **无官方移动端 SDK**：iOS 用 `ASWebAuthenticationSession`（或 WKWebView），Android 用 Chrome Custom Tabs，`redirect_uri` 走自定义 scheme / App Links；客户端拿到 code 后 **必须回传服务端** 换 token，避免泄露 client_secret
- **Hybrid Flow 风险**：部分 token 经过前端传递，安全性弱于 Authorization Code Flow，仅在真必须时使用
- **state 与 nonce 用途不同**：state 防 CSRF（跨站伪造回跳），nonce 防 ID Token 重放，两者需分别生成并校验

## 组合提示
- 与后端 session / JWT 会话机制配合，ID Token 验证成功后签发自己的会话凭证
- 与其它 OIDC 提供商（Google / Apple）共用同一 `sub`+issuer 的账号映射表
- 移动端优先使用系统浏览器组件（ASWebAuthenticationSession / Custom Tabs）而非内嵌 WebView，兼顾安全与合规
