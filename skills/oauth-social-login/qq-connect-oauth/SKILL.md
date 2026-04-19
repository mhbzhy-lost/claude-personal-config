---
name: qq-connect-oauth
description: QQ 互联 OAuth2.0 登录接入（网页授权 + Android/iOS/HarmonyOS SDK + OpenAPI 调用）
tech_stack: [qq-connect, oauth2]
capability: [auth, http-client]
version: "qq-connect unversioned"
collected_at: 2026-04-19
---

# QQ 互联 OAuth2.0 登录（qq-connect-oauth）

> 来源：
> - https://wiki.connect.qq.com/OAuth2.0开发文档
> - https://wiki.connect.qq.com/准备工作_oauth2-0
> - https://wiki.connect.qq.com/get_oauth2_token
> - https://wiki.connect.qq.com/openapi调用说明_oauth2-0

## 用途

让网站或 App 使用 QQ 账号登录，并在用户授权后通过 `graph.qq.com` OpenAPI 读取/修改用户信息。标识身份的核心字段是 `openid`（应用内唯一），跨应用时使用 `unionid`（需企业认证开通）。

## 何时使用

- 面向中国大陆用户的 Web / 移动端"QQ 登录"按钮
- 需要拉取用户昵称、头像、性别等基础资料（`get_user_info`）
- 多个产品属于同一开发者主体，需要跨应用识别同一 QQ 用户（`unionid`）
- 历史 OAuth 1.0 应用迁移到 2.0（使用 `get_oauth2_token` 换发 token）

## 应用注册前置

1. 在 https://connect.qq.com/manage.html#/ 完成开发者资质审核
2. 点击"创建应用"，填写名称、网站域名、回调地址后获得：
   - `AppID`（= OAuth 的 `oauth_consumer_key`）
   - `AppKey`（= OAuth 的 `oauth_consumer_secret`，须保密）
3. 用于登录后台的 QQ 号会与该 `appid` 绑定
4. PC 网站：从服务器 `ping graph.qq.com` 确认连通性；移动端可跳过

## 网页授权标准流程（Authorization Code）

1. **放置登录按钮**：引导用户跳转到 QQ 授权页
2. **获取 Authorization Code**：回调地址收到 `code`
3. **换取 Access Token**：服务端携 `appid + appkey + code + redirect_uri` 调 `https://graph.qq.com/oauth2.0/token` 拿到 `access_token`（有效期 60 天）
4. **获取 OpenID**：调 `https://graph.qq.com/oauth2.0/me?access_token=...` 拿到 `openid`（如接入 unionid 则加 `unionid=1`）
5. **调用 OpenAPI**：带 `access_token + oauth_consumer_key + openid` 请求 `graph.qq.com/user/*`

## 移动端 SDK 入口

| 平台 | 说明 |
|------|------|
| Android SDK | 官方文档含环境配置、功能列表、版本历史、FAQ |
| iOS SDK | 含环境配置、接口文档、变更记录 |
| HarmonyOS SDK | 含环境配置、接口文档、更新日志、常见问题 |

SDK 封装了授权入口与 token 回调，业务仅需在服务端做 token 校验与 OpenAPI 调用。

## 关键 API

### 1. 标准 token 接口（Authorization Code → Access Token）
- `GET https://graph.qq.com/oauth2.0/token`
- 参数：`grant_type=authorization_code & client_id={appid} & client_secret={appkey} & code & redirect_uri`
- 返回：`access_token`、`expires_in`、`refresh_token`

### 2. OpenID 获取
- `GET https://graph.qq.com/oauth2.0/me?access_token=...`
- 响应为 JSONP 包裹：`callback({"client_id":"...","openid":"..."})`；加 `unionid=1` 可获取 `unionid`

### 3. get_oauth2_token —— OAuth 1.0 → 2.0 迁移专用
> 仅用于已持有 OAuth 1.0 token 的存量应用升级，**常规登录不要走这个接口**。

- `GET http://openapi.qzone.qq.com/user/get_oauth2_token`
- 必填参数（全部 UTF-8 + RFC1738 URL 编码）：
  - `oauth_consumer_key`：appid
  - `oauth_token`：已有的 OAuth 1.0 token
  - `oauth_nonce`：随机整数字符串
  - `oauth_timestamp`：Unix 时间戳（秒）
  - `oauth_version`：固定 `1.0`
  - `oauth_signature_method`：固定 `HMAC-SHA1`
  - `oauth_signature`：HMAC-SHA1 计算得出
  - `openid`：用户 OpenID
- 可选：`oauth_client_ip`、`format`（`json`/`xml`，默认 json）
- 响应字段：`ret`、`msg`、`openid`、`token`（新 access_token）、`expire`（秒，通常 7776000 ≈ 90 天）

成功示例：
```json
{"ret":0,"openid":"1704****878C","token":"88VD****KHHH","expire":"7776000"}
```
错误示例：
```json
{"ret":41002,"msg":"请求包错误"}
```

### 4. OpenAPI 调用（以 get_user_info 为例）
```
GET https://graph.qq.com/user/get_user_info
    ?access_token=YOUR_ACCESS_TOKEN
    &oauth_consumer_key=YOUR_APP_ID
    &openid=YOUR_OPENID
```
所有 OpenAPI 的三件套参数固定为 `access_token + oauth_consumer_key + openid`。

## 注意事项

- **Access Token 有效期 60 天**（标准 OAuth2 流程），过期需用 `refresh_token` 续期或重新授权；`get_oauth2_token` 迁移接口返回的是 90 天
- **openid vs unionid**：`openid` 仅在单个 `appid` 内唯一；跨应用匹配用户必须使用 `unionid`（需在管理端申请开通）
- **AppKey 必须保密**：仅在服务端使用，不要下发到前端或移动端包体
- **OpenAPI 权限分两档**：部分接口默认开放，部分需在管理端单独申请；调用前确认权限已开通
- **授权范围受限于用户同意项**：用户可在"手机QQ → 设置 → 隐私 → 授权管理"撤销授权，代码需处理撤销后的 token 失效
- **`/oauth2.0/me` 返回 JSONP**：需要剥掉 `callback(...)` 外壳再解析
- **迁移接口参数编码**：`get_oauth2_token` 所有参数必须 UTF-8 + RFC 1738 URL 编码，签名方法固定 `HMAC-SHA1`，`oauth_version=1.0`
- **PC 网站连通性**：必须确保服务器能访问 `graph.qq.com`，否则 token 交换会失败

## 组合提示

- 与 `wechat-mp-*` / `sign-in-with-apple` / 手机号一键登录（`carrier-number-auth-cn`）并列提供，常见"第三方登录"矩阵
- 账号体系侧通常与 `oauth-social-login` 公共的 "用 openid/unionid 建本地用户" 模式结合
- 需要做 CSRF 防护：授权跳转时带 `state` 参数，回调校验一致
