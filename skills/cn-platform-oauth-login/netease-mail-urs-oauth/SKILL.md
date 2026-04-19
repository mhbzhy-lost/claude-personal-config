---
name: netease-mail-urs-oauth
description: 网易邮箱 URS 通行证 OAuth2.0 三步授权接入（authorize → token → getUserInfo），企业/合作伙伴定向开放
tech_stack: [cn-platform-oauth-login, netease-urs]
capability: [auth, http-client]
version: "netease-urs-oauth2 unversioned"
collected_at: 2026-04-19
---

# 网易邮箱 URS 通行证 OAuth2.0（URS OAuth）

> 来源：https://reg.163.com/help/help_oauth2.html

> ⚠️ **接入前提（重要）**：接入需向 **passport@service.netease.com** 发邮件申请 Consumer Key（`client_id`）与 Consumer Secret（`client_secret`），**非自助开放**，属企业/合作伙伴定向接入。未完成申请流程时，下列任何端点都无法使用。

> ⚠️ **传输安全**：`authorize.do` 与 `token.do` 官方端点使用 **HTTP（非 HTTPS）**，`client_secret` 与 `code` 在传输中存在被窃取风险。生产环境请在服务端调用、限制出网、避免在浏览器前端直连 token 接口；如支持，可尝试以 HTTPS 访问同域名并验证证书。

## 用途

让第三方应用接入网易邮箱账号体系，获取 URS 通行证用户的唯一标识（`userId`）与可选用户名，用于第三方站点的"网易邮箱登录"。

## 何时使用

- 需要网易邮箱（@163 / @126 / @yeah.net 等 URS 账号）一键登录的站点
- 已与网易完成商务合作、拿到 Consumer Key/Secret 的企业接入
- 需要打通网易账号体系完成用户关联、找回等操作

不适用：个人开发者/未申请合作的自助接入场景。

## 三步授权流程

### Step 1：获取授权码 code

```
GET http://reg.163.com/open/oauth2/authorize.do
    ?client_id=YOUR_CLIENT_ID
    &redirect_uri=http://your.site/callback
    &response_type=code
    &state=CSRF_TOKEN
```

- `redirect_uri` 的域名必须与申请时登记的回调域一致
- `response_type` 固定 `code`
- `state` 可选，用于 CSRF 校验

成功：`http://YOUR_CALLBACK_URL?code=A_CODE_GENERATED_BY_SERVER`
失败：`http://YOUR_CALLBACK_URL?error=invalid_client&error_description=client+identifier+is+invalid`

### Step 2：用 code 换 access_token

```
POST http://reg.163.com/open/oauth2/token.do
Content-Type: application/x-www-form-urlencoded

client_id=YOUR_CLIENT_ID
&client_secret=YOUR_CLIENT_SECRET
&grant_type=authorization_code
&code=CODE_FROM_STEP1
&redirect_uri=http://your.site/callback   # 必须与 Step 1 完全一致
```

响应：

```json
{"expires_in":5184000,"access_token":"dab93a1e30960af28e6a975faeaf7c25"}
```

`expires_in` 单位为秒，`5184000 = 60 天`。

### Step 3：获取用户信息

```
GET https://reg.163.com/open/oauth2/getUserInfo.do?access_token=ACCESS_TOKEN
```

响应：

```json
{"username":"urstest_mreg","userId":"820014421"}
```

注意：此端点在原文中使用 HTTPS。

## 端点清单

| 步骤 | 方法 | 端点 |
|------|------|------|
| 授权 | GET  | `http://reg.163.com/open/oauth2/authorize.do` |
| 换 token | POST | `http://reg.163.com/open/oauth2/token.do` |
| 取用户 | GET  | `https://reg.163.com/open/oauth2/getUserInfo.do` |

## 注意事项

- **`userId` 才是稳定唯一标识**；`username` 仅当用户授权时才返回，不要用作主键
- `access_token` 有效期 60 天，到期需让用户重新授权（文档未提供 refresh_token 流程）
- `redirect_uri` 在 Step 1 与 Step 2 必须**完全一致**，否则换取 token 失败
- 授权与 token 端点为 HTTP 明文，务必在受控服务端调用并做好密钥保护
- 未拿到 Consumer Key/Secret 前任何调用都会直接返回 `invalid_client`

## 组合提示

- 通常作为站点多入口登录之一（与微信/QQ/微博 OAuth 并列），最终落地到本系统统一用户表，按 `netease_userId` 建立外部账号绑定
- 服务端可复用标准 OAuth2 Authorization Code 客户端库，端点 URL 替换为上表即可
