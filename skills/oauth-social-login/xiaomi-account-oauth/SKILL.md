---
name: xiaomi-account-oauth
description: 小米帐号开放平台 OAuth 2.0 登录授权与开放 API 调用指南
tech_stack: [xiaomi-account, oauth2, android, ios]
version: "xiaomi-account-oauth unversioned"
collected_at: 2026-04-19
capability: [auth, native-device, http-client]
---

# 小米帐号 OAuth 2.0 授权

> 来源：
> - https://dev.mi.com/docs/passport/oauth2/
> - https://dev.mi.com/docs/passport/authorization-code/
> - https://dev.mi.com/docs/passport/open-api/
> - https://dev.mi.com/docs/passport/sdk/

## 用途

基于 OAuth 2.0 协议，允许第三方应用接入小米帐号登录，并调用开放 API 获取用户昵称、openId、手机号/邮箱、米聊好友、卡券等信息，无需让用户向第三方泄露帐号密码。

## 何时使用

- Web/Wap 站点、有 Server 端的 App 接入"小米帐号登录"
- 无 Server 端的手机/桌面客户端、浏览器插件接入小米登录（走 Implicit Grant）
- Access Token 过期后用 Refresh Token 静默续期
- 读取小米用户 profile / openId / 手机号邮箱 / 卡券等开放数据
- 黄页类应用接入（需开启 `skip_confirm=true`）

## 前置准备

1. 在 https://dev.mi.com 注册应用，拿到 `client_id`（APP ID）与 `client_secret`（App Secret）
2. 申请所需 scope（权限值为整数 ID，例：`1`=用户名片，`2`=米聊好友关系，`3`=openId，`4`/`6`=手机/邮箱，`16000`=卡包）
3. 在控制台填写 `redirect_uri` 白名单；实际请求的 redirect_uri 必须与登记的**域名/路径**一致（query 参数部分可不同）
4. 移动端集成 Android / iOS SDK（均托管于 https://github.com/xiaomi-passport），Server 端另有 Java / PHP / Python / C# / Ruby SDK

## 基础用法：Authorization Code Flow（推荐，有 Server 端）

**步骤 1 — 引导用户授权，拿 code**

```
GET https://account.xiaomi.com/oauth2/authorize
    ?client_id=YOUR_APP_ID
    &redirect_uri=https://example.com/callback
    &response_type=code
    &scope=1%203           # 空格分隔多 scope
    &state=RANDOM_STATE    # 强烈建议，防 CSRF
    &skip_confirm=true     # 仅黄页应用
```

成功回跳：`https://example.com/callback?code=CODE&state=RANDOM_STATE`
失败回跳：`...?error=ERROR&error_description=...&state=...`

> code 有效期 **5 分钟**，**只能使用一次**。

**步骤 2 — 用 code 换 access_token**

```
GET https://account.xiaomi.com/oauth2/token
    ?client_id=YOUR_APP_ID
    &redirect_uri=https://example.com/callback
    &client_secret=YOUR_APP_SECRET
    &grant_type=authorization_code
    &code=CODE
```

响应体前带有 `&&&START&&&` 前缀，**解析前必须剥离**：

```js
const json = JSON.parse(raw.replace("&&&START&&&", ""));
// {
//   access_token, expires_in, refresh_token,
//   scope, token_type: "mac",
//   mac_key, mac_algorithm: "HmacSha1",
//   openId: "2.0XXXXX"
// }
```

## Implicit Grant Flow（无 Server 端）

把 `response_type` 改为 `token`，access_token 通过 URL **Fragment**（`#` 后）返回，而非 query：

```
https://example.com/callback#access_token=...&expires_in=...&scope=...&state=...
```

适用于无法妥善保管 App Secret 的场景（桌面/手机客户端、浏览器插件）。无 refresh_token。

## Refresh Token 刷新

Access Token 过期后无需用户参与：

```
GET https://account.xiaomi.com/oauth2/token
    ?client_id=YOUR_APP_ID
    &redirect_uri=...
    &client_secret=YOUR_APP_SECRET
    &grant_type=refresh_token
    &refresh_token=OLD_REFRESH_TOKEN
```

- `refresh_token` 有效期 **10 年**，所有应用都会下发
- 每次刷新会返回**新**的 access_token 和 refresh_token；**旧 refresh_token 作废**（"只能刷新一次"）
- 响应同样带 `&&&START&&&` 前缀

## 关键开放 API

所有接口均 `GET`，公共参数 `clientId` + `token`（access_token）。响应结构 `{ result, description, data, code }`，失败时 `result="error"` 并给出错误码。

| 接口 | URL | scope |
|------|-----|-------|
| 用户名片（昵称/userId/头像） | `https://open.account.xiaomi.com/user/profile` | 1 |
| 米聊好友关系 | `https://open.account.xiaomi.com/user/relation` | 2 |
| openId（唯一标识） | `https://open.account.xiaomi.com/user/openidV2` | 3 |
| 手机号 / 邮箱 | `https://open.account.xiaomi.com/user/phoneAndEmail` | 4、6 |
| 卡包卡券 | `https://api.passbook.xiaomi.com/app/get_pass` | 16000 |
| 验证用户密码 | `https://open.account.xiaomi.com/checkPassword` | — |

调用需用 `mac_key` + `HmacSha1` 计算 MAC 签名（参考 dev.mi.com `/docs/passport/mac/`）。

### openId vs userId

- `userId`：profile 接口返回的小米账号 ID（明文）
- `openid`：openidV2 接口返回的**应用维度**唯一标识，推荐存储此字段作为用户主键（跨应用不一致，隐私更友好）

## 安全：checkPassword 的 `_xmSign` 校验（强制）

`/checkPassword` 回调 URL 会带 `xmResult / _xmNonce / _xmSign / code / xmUserId` 等参数：

- `xmUserId` **可能被恶意篡改**，不能直接信任
- 第三方**必须**用 `_xmSign` 验签，**否则造成的损失由第三方自负**
- 高安全场景应再用返回的 `code` 换 token，再用 token 反查 userId 做二次校验

## 注意事项

1. **Authorization Code 一次性 + 5 分钟过期**，网络重试需重新发起授权
2. **`&&&START&&&` 前缀**：token 接口响应必须先 `replace("&&&START&&&", "")` 才能 JSON 解析
3. **Implicit Grant 的 token 在 Fragment 里**，Server 拿不到，必须靠前端 JS 读取 `location.hash`
4. **refresh_token 用一次换新**，必须持久化存储最新的那个，否则下次刷新会失败
5. `mac_algorithm` 目前**只支持 HmacSha1**，别尝试 HmacSha256
6. `token_type` 为 `mac`（非 Bearer），调用开放 API 需按 MAC 规范签名
7. **黄页应用**接入 `/oauth2/authorize` 必须设置 `skip_confirm=true`，否则用户会看到切换账号页
8. 获取卡包时，`imei` 必须先做 **MD5 哈希**再传
9. `state` 参数强烈建议带上，防 CSRF（返回时原样回传）
10. `redirect_uri` 必须与控制台登记一致（仅 query 部分可变）
11. 未在 frontmatter 中填写具体版本号：源文档（dev.mi.com/docs/passport）未暴露 SDK / API 版本号

## 组合提示

- 与通用 `oauth2` skill 搭配（理解 grant_type / PKCE 等基础概念）
- 移动端接入时搭配 `android` / `swiftui` skill 处理 WebView 或 SDK 授权回跳
- Server 端与 `java` / `python` / `php` SDK（xiaomi-passport GitHub 组织）结合，避免手写签名
- 与同类社交登录 skill（`amazon-login-with-amazon`、`google-identity-services` 等）形成聚合登录能力
