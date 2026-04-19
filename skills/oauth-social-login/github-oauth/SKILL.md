---
name: github-oauth
description: GitHub OAuth Apps 与 GitHub Apps 的用户授权接入指南，覆盖 Web flow、Device flow、PKCE、scope 与 token 生命周期
tech_stack: [oauth-social-login, github]
capability: [auth, http-client]
version: "github-oauth-docs unversioned"
collected_at: 2026-04-19
---

# GitHub OAuth（GitHub 第三方登录与授权）

> 来源：
> - https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
> - https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps
> - https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app
> - https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/best-practices-for-creating-an-oauth-app

## 用途
通过 GitHub 获取用户身份与访问令牌，用于第三方登录、代表用户操作 GitHub 资源（仓库/Gist/Actions 等），或实现 CLI/无头设备的授权。

## 何时使用
- 在 Web 应用中实现"用 GitHub 登录"或读写用户的 repo/gist
- 为 CLI、Git Credential Manager、Raspberry Pi 等无浏览器环境申请访问令牌（Device flow）
- 需要代表用户访问组织/仓库细粒度权限时，考虑 GitHub App（而非 OAuth App）
- 构建桌面/移动等公共客户端——必须使用 PKCE（无法安全存储 secret）

## OAuth App vs GitHub App（选型）
| 维度 | OAuth App | GitHub App |
| --- | --- | --- |
| 授权粒度 | scope（粗粒度） | fine-grained permissions（细粒度，按仓库选择） |
| Token 寿命 | 长期有效，不过期 | user access token 默认 8 小时过期 + refresh token 6 个月 |
| PKCE | 支持 | 强烈推荐 |
| Token 前缀 | `gho_` | 用户令牌 `ghu_`，刷新令牌 `ghr_` |
| 推荐度 | 历史兼容 | 新项目首选 |

官方立场：**新应用优先选 GitHub App**，除非必须使用 OAuth App 的长寿命 token。

## Web 应用流程（Authorization Code）

### Step 1 — 跳转授权页
```text
GET https://github.com/login/oauth/authorize
  ?client_id=YOUR_CLIENT_ID
  &redirect_uri=https://yourapp.com/callback
  &scope=user%20repo
  &state=RANDOM_STRING
  &code_challenge=CODE_CHALLENGE
  &code_challenge_method=S256
```

关键参数：
- `client_id`（必填）
- `redirect_uri`（强烈建议显式传入，且需匹配注册的 callback，见下方匹配规则）
- `scope`：空格分隔，URL 中编码为 `%20`
- `state`（强烈建议）：防 CSRF 的随机串，回调后必须校验
- `code_challenge` + `code_challenge_method=S256`（强烈建议）：PKCE，`code_challenge` 为 43 字符 SHA-256 哈希
- `login`（可选）：暗示登录某个账号

### Step 2 — 用 code 换 token
```shell
curl -X POST https://github.com/login/oauth/access_token \
  -H "Accept: application/json" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "code=CODE_FROM_CALLBACK" \
  -d "redirect_uri=https://yourapp.com/callback" \
  -d "code_verifier=CODE_VERIFIER"
```

响应：
```json
{
  "access_token": "gho_16C7e42F292c6912E7710c838347Ae178B4a",
  "scope": "repo,gist",
  "token_type": "bearer"
}
```

### Step 3 — 调用 API
```shell
curl -H "Authorization: Bearer OAUTH-TOKEN" https://api.github.com/user
```

每次拿到新 token 都应**重新校验用户身份**（`GET /user`），避免用户切换账号导致数据串号。

## Device Flow（无头/CLI）

### Step 1 — 申请 device_code
```shell
curl -X POST https://github.com/login/device/code \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "scope=repo"
```
返回：
```json
{
  "device_code": "3584d83530557fdd1f46af8289938c8ef79f9dc5",
  "user_code": "WDJB-MJHT",
  "verification_uri": "https://github.com/login/device",
  "expires_in": 900,
  "interval": 5
}
```

### Step 2 — 提示用户输入
引导用户到 `verification_uri` 并输入 `user_code`。

### Step 3 — 轮询换 token
```shell
curl -X POST https://github.com/login/oauth/access_token \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "device_code=DEVICE_CODE" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:device_code"
```

轮询间隔严格遵守 `interval`。错误码处理：
- `authorization_pending`：继续等待
- `slow_down`：间隔 +5 秒
- `expired_token`：device_code 已失效，重新申请
- `access_denied`：用户取消，终止
- `device_flow_disabled`：App 设置里未启用 device flow
- `incorrect_client_credentials` / `incorrect_device_code` / `unsupported_grant_type`：参数错误

> 安全提示：**公共客户端慎用 device flow**（钓鱼风险高），能用 Authorization Code + PKCE 就优先用。

## GitHub App 用户访问令牌

- 授权端点、换 token 端点与 OAuth App 相同，参数一致；**强烈推荐开启 PKCE**
- 默认 access_token 8 小时过期（28,800s），响应附带 refresh_token 有效 6 个月（15,897,600s）
- 可用 refresh_token 向 `/login/oauth/access_token` 发 `grant_type=refresh_token` 获取新令牌
- Token 权限 = **app 权限 ∩ 用户权限**（fine-grained），scope 概念不适用

## Scope（OAuth App）

### 常用 scope 一览
| 分类 | Scope |
| --- | --- |
| 仓库 | `repo`、`public_repo`、`repo:status`、`repo_deployment`、`repo:invite`、`delete_repo`、`security_events` |
| Webhook | `admin:repo_hook` / `write:repo_hook` / `read:repo_hook`、`admin:org_hook` |
| 组织 | `admin:org`、`write:org`、`read:org` |
| 用户 | `user`、`read:user`、`user:email`、`user:follow` |
| Key | `admin:public_key` / `write` / `read`；`admin:gpg_key` / `write` / `read` |
| Packages | `read:packages`、`write:packages`、`delete:packages` |
| 项目 | `project`、`read:project` |
| 其他 | `gist`、`notifications`、`codespace`、`workflow`、`read:audit_log` |
| 无 scope | 仅读公开信息（profile/repo/gist） |

多 scope 用空格分隔，URL 中编码为 `%20`。

### Normalized Scopes（隐式去重）
请求 `user,gist,user:email` 最终保存为 `user,gist`——因为 `user:email` 已被 `user` 覆盖。读写代码时以响应 `scope` 字段为准。

### Granted ≠ Requested
用户可在授权页手动减少 scope，最终授予的 scope 可能比请求的少。**不要假设**请求什么就拿到什么。

### 检查当前 token 的 scope
```shell
curl -H "Authorization: Bearer OAUTH-TOKEN" https://api.github.com/users/codertocat -I
# HTTP/2 200
# X-OAuth-Scopes: repo, user
# X-Accepted-OAuth-Scopes: user
```
- `X-OAuth-Scopes`：当前 token 拥有的 scope
- `X-Accepted-OAuth-Scopes`：该接口接受的 scope

## Redirect URL 匹配规则

host（不含子域）和 port 必须完全一致；path 必须是回调 URL path 的**子目录**。

以注册 callback `http://example.com/path` 为例：

| 是否接受 | URL |
| --- | --- |
| ✅ | `http://example.com/path` |
| ✅ | `http://example.com/path/subdir/other` |
| ✅ | `http://oauth.example.com/path` |
| ❌ | `http://example.com/bar`（path 不是子目录） |
| ❌ | `http://example.com/`（path 缩短） |
| ❌ | `http://example.com:8080/path`（端口不同） |
| ❌ | `http://example.org`（host 不同） |

**Loopback 例外**（桌面端）：`127.0.0.1` 或 `::1` 的 port 可与注册值不同；不要用 `localhost`。

## 安全最佳实践

- **始终传 `state`**：回调校验 `state`，防 CSRF
- **PKCE 必备**：公共客户端（SPA/移动端/桌面端/CLI）不能安全保存 client_secret，必须走 PKCE
- **最小 scope**：只申请必要权限，降低泄露影响面
- **用 `id` 存用户**：数据库关联用户时，使用不可变的数字 `id`，不要用 login/email/org slug
- **持续校验组织访问**：`GET /user/installations` 定期复核用户是否仍属于授权组织；存储每条数据的组织上下文，防止用户离职后串数据
- **Token 存储**：后端加密保存 access_token；refresh_token 与 access_token 分离存储；client_secret 放 KMS/密钥库
- **多 token 限制**：同一 user/app/scope 组合最多 10 个 token，超出会吊销最旧的；每小时最多创建 10 个
- **用户查看授权**：`https://github.com/settings/connections/applications/:client_id` 列出 app 的授权详情
- **审计与响应**：记录认证/权限变更日志；提供用户自助删除数据的入口；建立凭证泄露响应流程

## 组合提示
- 作为社交登录一员，常与 `google-identity-services`、`amazon-login-with-amazon` 并列出现
- 后端通常配合 Web 框架的 OAuth 客户端库（如 `authlib`、`passport-github2`、`NextAuth.js`、Spring Security OAuth2）实现
- 访问 GitHub REST/GraphQL API 时搭配 octokit 系列 SDK
