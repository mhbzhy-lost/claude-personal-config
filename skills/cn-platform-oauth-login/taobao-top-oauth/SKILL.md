---
name: taobao-top-oauth
description: 淘宝开放平台 TOP OAuth 2.0 授权接入（Server-side / Client-side Flow、session key 换取与刷新）
tech_stack: [taobao-top, oauth2]
capability: [auth, http-client]
version: "taobao-top-oauth unversioned"
collected_at: 2026-04-19
---

# 淘宝开放平台 OAuth（TOP OAuth 2.0）

> 来源：developer.alibaba.com 镜像（open.taobao.com 境内/境外部分访问受限）
> - https://developer.alibaba.com/docs/doc.htm?treeId=49&articleId=102635&docType=1
> - treeId=19&articleId=102687（导航 hub，无实质内容）

## 用途

TOP OAuth 是 ISV（独立软件开发商）访问淘宝/天猫商家与用户数据（商品、订单、店铺等）前的授权入口。用户/商家登录淘宝账号并授权后，应用拿到 `access_token`（俗称 **session key**），后续 TOP API 调用通过它代表该用户访问受保护资源。

## 何时使用

- 需要调用任何 TOP API（`taobao.*`）读写商家数据时，先走 OAuth 拿到 session key
- **Server-side Flow**：有独立 Web 服务、能保管 AppSecret、HTTPS 回调——多商家授权、长期托管场景首选
- **Client-side Flow**：无独立服务端的桌面 / 脚本工具，用户手工复制 session key 或 JS 从 URL fragment 提取
- **Token 刷新**：仅"订阅型 ISV"应用支持刷新 token，其他类型只能到期让用户重新授权
- 移动端 / 无线应用授权：本 skill 未覆盖，详见 open.taobao.com 无线开发文档（_meta: quality=partial）

## 基础用法

### Server-side Flow（授权码模式）

**Step 1：拼接授权 URL，引导用户跳转**

```
https://oauth.taobao.com/authorize
  ?response_type=code
  &client_id=12345678            # AppKey
  &redirect_uri=https://example.com/cb
  &state=xyz                     # 防 CSRF，原样回传
  &view=web                      # web / wap
```

**Step 2：用户授权后回调到 `redirect_uri?code=xxx&state=xyz`**
- `code` 有效期 **30 分钟，仅可用一次**

**Step 3：后端用 code 换 access_token**

```
POST https://oauth.taobao.com/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&client_id=12345678
&client_secret=<AppSecret>
&code=<上一步的 code>
&redirect_uri=https://example.com/cb
```

响应 JSON 含 `access_token`（session key）、`refresh_token`、`expires_in`、`taobao_user_id`、`taobao_user_nick` 等。等价接口：`taobao.top.auth.token.create`。

### Client-side Flow（Implicit）

把 `response_type=code` 换成 `response_type=token`，淘宝直接把 token 放回跳 URL 的 **fragment**（`#access_token=...&top_sign=...`）。

- **必须校验 `top_sign`** 防篡改：`top_sign = md5(AppSecret + key1 + value1 + ... + keyN + valueN + AppSecret)`（所有返回参数按 key 字典序拼接，MD5 结果取大写 hex）
- 无 code 换取步骤，因此不暴露 client_secret——但签名算法需要 AppSecret 参与客户端校验，安全模型较弱，优先选 Server-side

### Token 刷新（仅订阅型 ISV）

```
调用：taobao.top.auth.token.refresh
参数：refresh_token=<当前 refresh_token>
```

**关键**：每次刷新会使旧 `refresh_token` 失效，必须把响应里新的 `refresh_token` 覆盖写入持久化存储，否则下次刷新会失败。

## 关键参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `client_id` | 是 | 控制台 AppKey |
| `client_secret` | 是 | 控制台 AppSecret（仅服务端使用，禁止前端泄露） |
| `redirect_uri` | 是 | 必须与控制台注册完全一致（协议/域名/路径） |
| `response_type` | 是 | `code`（Server-side） / `token`（Client-side） |
| `grant_type` | 是 | `authorization_code` 或 `refresh_token` |
| `state` | 推荐 | CSRF 防护，服务端校验后再信任回调 |
| `view` | 可选 | `web` / `wap`，控制授权页样式 |

## API 安全级别与 session key 有效期

TOP API 按敏感度分 **R1 / R2 / W1 / W2** 四档（Read/Write × 普通/敏感）。

- session key 有效期由 **应用类型 + 状态（测试/正式）+ 所调 API 的最高安全级别** 共同决定
- 写接口（W1/W2）与高敏接口（R2/W2）通常有效期更短，敏感操作可能要求用户二次授权
- 具体时长以控制台"应用详情 → 授权期限"为准，文档不列死值

## 注意事项

- **应用状态**：只有"正式环境测试"或"上线运行中"状态的应用允许真实用户授权，"开发中"状态不行
- **子账号授权**：子账号必须先获得主账号对该应用的授权，否则无法使用子账号登录授权
- **authorization code**：30 分钟有效且一次性，勿重复用同一 code 调 `/token`
- **redirect_uri 严格匹配**：大小写、末尾斜杠都要一致，否则报 `redirect_uri is invalidate`
- **session key 数量上限**：同一用户同一应用的有效 session key 数量有限，超额报 `session key num is larger than xx`——老 token 会被挤掉
- **refresh_token 单次有效**：刷新后旧 refresh_token 立即失效，务必事务性替换
- **非订阅型应用**无法刷新，到期必须重新走完整授权流程
- **移动端授权不在本 skill 覆盖范围**：WAP/App 内嵌 WebView 授权、无线应用独立流程请查 open.taobao.com 无线开发文档

## 常见错误码

| 错误 | 含义 |
|------|------|
| `redirect_uri is invalidate` | 回调 URL 与控制台注册的不匹配 |
| `authorize code expire` | code 已过 30 分钟或已被使用 |
| `client_secret is invalidate` | AppSecret 错误或与 AppKey 不匹配 |
| `session key num is larger than xx` | 同用户 session key 数量超限 |

## 组合提示

- 与 `oauth-social-login` skill 搭配：统一多平台登录抽象层
- 拿到 session key 后，TOP API 调用参数里带 `session=<access_token>` + 业务参数 + TOP 签名（另见 TOP 签名规范，本 skill 不覆盖）
- 用户身份信息可用 `taobao.user.seller.get` / `taobao.user.buyer.get` 等接口拉取（原文提及 `user.get`，新版已按买卖家拆分）
