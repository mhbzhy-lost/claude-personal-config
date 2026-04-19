---
name: baidu-oauth-login
description: 百度账号 OAuth 2.0 网页授权登录（Authorization Code 模式），获取 access_token 并拉取用户信息
tech_stack: [baidu-oauth]
capability: [auth, http-client]
version: "baidu-oauth unversioned"
collected_at: 2026-04-19
---

# 百度账号 OAuth 2.0 登录

> 来源：https://openauth.baidu.com/doc/doc.html

## 用途
基于百度开放平台的 OAuth 2.0 授权协议，第三方网站/应用引导用户授权后获取 `access_token`，进而调用百度开放 API（典型为拉取用户基础资料 `openid / unionid / username / portrait`）。

## 何时使用
- 需要让用户用百度账号登录第三方站点（Web 场景）
- 需要拉取百度账号的公开资料或 unionid 做多应用打通
- 需要长期访问（`refresh_token` 有效期 10 年）

## 基础用法（Authorization Code 四步流程）

### Step 1. 引导用户到授权页换取 code
```
GET https://openapi.baidu.com/oauth/2.0/authorize
  ?response_type=code
  &client_id={API_KEY}
  &redirect_uri={REDIRECT_URI}
  &scope=basic
  &state={CSRF_TOKEN}
```
用户同意后回跳：`{REDIRECT_URI}?code=CODE&state=STATE`。**code 一次性、10 分钟内有效**。

### Step 2. 用 code 换 access_token
```
GET https://openapi.baidu.com/oauth/2.0/token
  ?grant_type=authorization_code
  &code={CODE}
  &client_id={API_KEY}
  &client_secret={SECRET_KEY}
  &redirect_uri={REDIRECT_URI}
```
响应（JSON）：
```json
{
  "access_token": "...",          // ≤256 字符
  "expires_in": 2592000,          // 秒
  "refresh_token": "...",         // 10 年有效
  "scope": "basic",
  "session_key": "...",
  "session_secret": "..."
}
```

### Step 3. 刷新 token
```
GET https://openapi.baidu.com/oauth/2.0/token
  ?grant_type=refresh_token
  &refresh_token={REFRESH_TOKEN}
  &client_id={API_KEY}
  &client_secret={SECRET_KEY}
```
返回结构同 Step 2，会下发新的 `access_token` 与 `refresh_token`。

### Step 4. 拉取用户信息
```
GET https://openapi.baidu.com/rest/2.0/passport/users/getInfo
  ?access_token={ACCESS_TOKEN}
  &get_unionid=1
```
关键字段：
- `openid`：同一开发者 + 同一应用内唯一
- `unionid`：同一开发者账号下跨应用唯一（需传 `get_unionid=1`）
- `username`、`portrait`：昵称 / 头像 token（头像 URL 形如 `http://tb.himg.baidu.com/sys/portrait/item/{portrait}`）
- `sex`、`birthday`、`marriage`、`blood`：资料（依据用户授权范围返回）
- `is_bind_mobile`、`is_realname`：状态标志

## 关键参数/字段速查
| 字段 | 说明 |
|------|------|
| `response_type` | 固定 `code` |
| `client_id` / `client_secret` | 应用的 API Key / Secret Key |
| `redirect_uri` | 必须与后台配置的授权回调地址或应用域名一致 |
| `scope` | 空格分隔；常用 `basic`（基础资料）、`mobile`（手机号，需额外申请） |
| `state` | 强烈建议填写，用于防 CSRF |
| `force_login` | `1` 强制拉起登录页（忽略已有会话） |
| `confirm_login` | `1` 已登录时仍二次确认授权 |
| `login_type` | 限定登录方式 |
| `qrcode` | `1` 展示二维码登录 |
| `display` | 页面展示形态（`page` / `popup` / `dialog` / `mobile` / `pad` / `tv` 等） |

## 注意事项
- **code 仅一次使用且 10 分钟过期**：换取失败不要重试同一个 code，需重新走授权页
- **redirect_uri 严格匹配**：须与开发者后台配置的回调地址/应用主域名一致，否则报错
- **state 校验**：回跳后必须比对 state，防 CSRF；不校验等于放开跨站授权伪造
- **access_token 长度上限 256**：数据库字段至少 `VARCHAR(256)`
- **refresh_token 有效期 10 年**：刷新后旧 refresh_token 会轮换，务必持久化响应里新的 refresh_token
- **token 走 HTTPS**：所有端点均使用 `https://openapi.baidu.com`
- **openid vs unionid**：跨应用打通用户请落 unionid；仅本应用标识用 openid

## 未覆盖内容
以下能力在本 skill 素材中**缺失**，需要时请以 openauth.baidu.com 原站为准：
- 移动端（Android / iOS SDK）接入流程，developer.baidu.com 对应 wiki 已 302 死链
- Implicit Grant（`response_type=token`，浏览器端直接拿 token）
- Client Credentials（服务端凭 client_id/secret 直拿平台级 token）
- Developer Credentials（开发者账号自用 token）
- 错误码列表与细粒度 scope 清单
