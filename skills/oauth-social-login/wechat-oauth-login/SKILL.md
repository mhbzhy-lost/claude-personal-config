---
name: wechat-oauth-login
description: 微信第三方登录（网站扫码 / 移动 SDK / 公众号 H5 授权 / 小程序登录）接入要点与 UnionID 机制
tech_stack: [wechat-open-platform, wechat-mp, wechat-official-account]
capability: [auth, http-client]
version: "wechat-open-platform unversioned"
collected_at: 2026-04-19
---

# wechat-oauth-login（微信第三方登录）

> 来源：
> - https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html
> - https://developers.weixin.qq.com/doc/oplatform/Mobile_App/WeChat_Login/Development_Guide.html
> - https://developers.weixin.qq.com/doc/offiaccount/OA_Web_Apps/Wechat_webpage_authorization.html
> - https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/login.html
> - https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/union-id.html

## 用途
基于 OAuth 2.0 `authorization_code` 模式接入微信账号体系，获取用户身份（openid / unionid）并建立业务自有登录态。覆盖网站、移动 App、公众号 H5、小程序四种入口。

## 何时使用
- 网站 PC 端需要「微信扫码登录」
- 原生 App（iOS/Android）想一键唤起微信授权登录
- 公众号内 H5 页面需要识别用户身份或静默获取 openid
- 小程序内建立登录态、关联业务账号
- 多端（App + 公众号 + 小程序）需要通过 UnionID 关联同一用户

## 四端接入对照速查

| 维度 | 网站扫码 | 移动 App SDK | 公众号 H5 | 小程序 |
|------|---------|--------------|----------|--------|
| 入口域名 | `open.weixin.qq.com/connect/qrconnect` | WXApi SDK `SendAuthReq` | `open.weixin.qq.com/connect/oauth2/authorize` | `wx.login()` |
| 平台入驻 | 开放平台「网站应用」 | 开放平台「移动应用」 | 微信公众号（**仅服务号**） | 小程序后台 |
| scope | `snsapi_login` | `snsapi_userinfo` | `snsapi_base` / `snsapi_userinfo` | 无 scope 概念 |
| 换 token 接口 | `/sns/oauth2/access_token` | `/sns/oauth2/access_token` | `/sns/oauth2/access_token` | `/sns/jscode2session` |
| 产物 | access_token + openid（+unionid） | access_token + openid + unionid | access_token + openid（+unionid） | openid + session_key + unionid |
| 用户交互 | 扫码 / Quick Login（Win 3.9.11+、Mac 4.0.0+） | 跳起微信 App 授权 | `snsapi_base` 静默；`snsapi_userinfo` 弹窗 | 无弹窗，code 直换 |

## 基础用法

### 1. 网站扫码登录

```text
# Step 1: 引导用户到授权页（或用 wxLogin.js 内嵌二维码）
https://open.weixin.qq.com/connect/qrconnect?appid=APPID
  &redirect_uri=URL_ENCODED_CALLBACK
  &response_type=code&scope=snsapi_login&state=STATE#wechat_redirect

# Step 2: 回调拿到 code，后端换 token
GET https://api.weixin.qq.com/sns/oauth2/access_token
  ?appid=APPID&secret=SECRET&code=CODE&grant_type=authorization_code
```

内嵌二维码：引入 `http://res.wx.qq.com/connect/zh_CN/htmledition/js/wxLogin.js`，实例化 `new WxLogin({ id, appid, scope:'snsapi_login', redirect_uri, state, style, href })`。

### 2. 移动应用 SDK 登录

iOS：
```objc
SendAuthReq* req = [[[SendAuthReq alloc] init] autorelease];
req.scope = @"snsapi_userinfo";
req.state = @"123";
[WXApi sendReq:req];
```
调用前需 `[WXApi isWXAppInstalled]` 判断，未安装则隐藏按钮或引导安装。

Android：
```java
final SendAuth.Req req = new SendAuth.Req();
req.scope = "snsapi_userinfo";
req.state = "wechat_sdk_demo_test";
api.sendReq(req);
```
Android 规范要求**按钮始终展示**，用户点击后若未装微信再引导。

拿到 code 后走与网站相同的 `/sns/oauth2/access_token` 接口。

### 3. 公众号网页授权（仅服务号）

```text
https://open.weixin.qq.com/connect/oauth2/authorize?appid=APPID
  &redirect_uri=URL_ENCODED&response_type=code
  &scope=snsapi_base|snsapi_userinfo&state=STATE#wechat_redirect
```
- `snsapi_base`：静默跳转，只拿 openid，无弹窗，适合页面内识别用户
- `snsapi_userinfo`：弹出授权页，可拿昵称/头像/城市等

### 4. 小程序登录

```javascript
// 小程序端
wx.login({
  success: ({ code }) => {
    wx.request({ url: 'https://your.server/login', data: { code } })
  }
})
```

```text
# 服务端
GET https://api.weixin.qq.com/sns/jscode2session
  ?appid=APPID&secret=SECRET&js_code=CODE&grant_type=authorization_code
# 返回 { openid, session_key, unionid?, errcode, errmsg }
```
服务端换得 openid/session_key 后，**自行下发业务 token**（如自家 session id），不要把 session_key 回传小程序。

## UnionID 机制（跨端关联核心）

同一微信开放平台账号下的多个应用（App / 网站 / 公众号 / 服务号 / 小程序 / 小游戏 / 微信小店）中，**同一用户的 UnionID 一致**，openid 则每个应用各不相同。

### UnionID 获取途径
1. **网站 / 移动 / 公众号**：`/sns/oauth2/access_token` 成功响应里的 `unionid`（需 scope 为 `snsapi_userinfo` 或已授权过）。
2. **小程序 `wx.login` + `code2Session`**：已绑定开放平台时直接返回 `unionid`，**无需用户授权**。
3. **小程序云函数**：云函数上下文 `Cloud.getWXContext()` 中获取。
4. **小程序支付后**：`getPaidUnionID` 可免授权获取，但**仅支付完成后 5 分钟内有效**。

### 启用前提
在微信开放平台「管理中心 > 公众账号 / 移动应用 / 网站应用 / 小程序」下，**将所有需要共享 UnionID 的主体绑定到同一开放平台账号**。未绑定时 `code2Session` 等接口只返回 `openid` 而无 `unionid`。

> 路径提示：「我的业务 > 开放平台 > 绑定关系 > 小程序」**不是**「我的业务 > 小程序 > 绑定关系 > 开放平台」，两条路径作用不同，别混。

### 业务账号模型建议
- 业务表主键用 **UnionID**（存在时）；小程序/单应用场景下降级用 openid
- 存 `(unionid, openid, app_source)` 三元组，支持后续多端归并

## Token / Code 有效期

| 凭证 | 有效期 | 备注 |
|------|--------|------|
| 授权 code（各端） | 通常 5 分钟内、**一次性** | 小程序 `wx.login` 的 code 明确一次性，换过即失效 |
| access_token | 7200 秒（2 小时） | 到期用 refresh_token 续 |
| refresh_token | **原文不一致**：网站应用文档写 30 天，移动应用文档写 180 天 | 两处并存矛盾，请以官方最新文档为准；稳妥起见按 30 天设计回退到重新授权的兜底 |
| session_key（小程序） | 不固定，wx.login 后可能刷新 | 服务端保存，**严禁下发小程序** |

刷新接口：
```text
GET https://api.weixin.qq.com/sns/oauth2/refresh_token
  ?appid=APPID&grant_type=refresh_token&refresh_token=REFRESH_TOKEN
```

## 频率与配额（移动应用）
- 同一用户（openid）调用登录相关接口：**≤ 180 次/分钟**
- 超限返回错误码 `45011`
- 未通过审核的应用：**每日登录调用上限 100 次**

## 注意事项

### 安全
- **AppSecret 严禁落在客户端**：所有换 token、拉用户信息的调用必须走自家后端中转
- **小程序 session_key 禁止下发给小程序前端**，它是加密/签名用户数据的密钥，泄露等同身份伪造
- 每个 `js_code` / 授权 code **只能使用一次**，换完即丢
- `state` 参数用于 CSRF 防护，强烈建议带上并在回调校验

### 平台资格
- **公众号网页授权仅服务号可用**，订阅号无此能力；具体 scope 可用性还受认证状态影响，需在 MP 后台确认
- 网站应用、移动应用、小程序都需在开放平台或小程序后台提交审核并获批后才能启用登录

### UnionID 陷阱
- 未在开放平台绑定就指望 `code2Session` 返回 unionid → 只会有 openid
- `getPaidUnionID` 的 5 分钟窗口要注意，超出即 403

### 平台差异
- iOS 调起前必须 `isWXAppInstalled`，否则按钮可能调起失败
- Android 按钮常驻展示，未安装微信时引导下载是平台规则要求
- Windows 3.9.11+ / Mac 4.0.0+ 客户端支持 Quick Login（无需扫码，本机微信直接确认）

## 组合提示
- 与 `oauth-social-login`（通用 OAuth2 规范）配合理解 authorization_code 流程
- 与 `wechat-mp`（小程序框架）组合完成小程序端 `wx.login` / 用户信息授权
- 与 `carrier-number-auth-cn` 等国内登录方式并列，作为账号体系的可选登录渠道
- 业务侧建议配合 JWT / 自建 session 体系，把 openid/unionid 映射为内部 userId
