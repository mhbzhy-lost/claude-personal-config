---
name: instagram-login-api
description: Instagram 登录与 Graph API 接入规范（Instagram Login / FB Login for Business 两路径，含 2025 新 scope 与 Basic Display 弃用提示）
tech_stack: [instagram-platform, meta-graph-api, oauth2]
capability: [auth, http-client]
version: "instagram-graph-api v25.0; scope-rename 2025-01-27"
collected_at: 2026-04-19
---

# Instagram Login API（Instagram 平台登录与 Graph API）

> 来源：https://developers.facebook.com/docs/instagram-platform/

## 重要弃用提示

**Instagram Basic Display API 已于 2024 年 12 月正式弃用，严禁在新项目中使用，旧项目必须迁移。**

现行官方路径仅两条：

| 路径 | 适用账户 | 用户登录凭证 |
|------|----------|--------------|
| **Instagram API with Instagram Login** | Instagram 专业账户（business/creator），**无需**绑定 FB Page | Instagram 账号 |
| **Instagram API with Facebook Login for Business** | 已绑定 Facebook Page 的 Instagram 专业账户 | Facebook 账号 |

只有"Instagram API with Facebook Login"路径能访问 Insights；两条路径都**不能**访问 ads 或 tagging 能力。

## 用途

为 Instagram 专业账户提供 OAuth 登录与 Graph API 接入，实现评论管理、内容发布、私信、@提及、Webhook 推送等能力。

## 何时使用

- 第三方应用代表 Instagram 专业账户发帖、回复评论或私信
- 构建客服/社媒管理 SaaS，批量接管多个 Creator/Business 账户
- 需要监听媒体/消息变更时，**必须**接入 Webhook
- 仅需个人账户普通数据（照片/视频）的场景——**没有方案**，Basic Display 已废弃

## 授权流程（Instagram Login，路径 1）

```
用户点击授权 URL
  → Instagram 授权窗口勾选 scope
  → redirect_uri 收到 ?code=...        (authorization code，1 小时有效)
  → POST /oauth/access_token            (短期 token，1 小时)
  → GET  /access_token?grant_type=ig_exchange_token  (长期 token，60 天，可刷新)
  → GET  /refresh_access_token          (token ≥24h 且未过期时续期 60 天)
```

必须端点：

| 端点 | 用途 |
|------|------|
| `https://www.instagram.com/oauth/authorize` | 获取 authorization code |
| `https://api.instagram.com/oauth/access_token` | code → 短期 token |
| `https://graph.instagram.com/access_token` | 短期 → 长期 token（60 天） |
| `https://graph.instagram.com/refresh_access_token` | 刷新长期 token |

## Scope 规范（2025-01-27 破坏性变更）

旧 scope 自 **2025-01-27** 起停止生效，使用旧 scope 的 app 将**无法调用任何 Instagram 端点**。必须迁移：

| 旧（已弃用） | 新（必须使用） |
|-------------|---------------|
| `business_basic` | `instagram_business_basic` |
| `business_content_publish` | `instagram_business_content_publish` |
| `business_manage_messages` | `instagram_business_manage_messages` |
| `business_manage_comments` | `instagram_business_manage_comments` |

长期 token 刷新要求用户授予 `instagram_business_basic`。

## 基础用法

获取当前用户信息：

```bash
curl -i -X GET \
  "https://graph.instagram.com/v25.0/me?fields=user_id,username&access_token=<TOKEN>"
```

获取用户的媒体列表：

```bash
curl -i -X GET \
  "https://graph.instagram.com/v25.0/<IG_ID>/media?access_token=<TOKEN>"
```

## Business Login（生产推荐）

面向服务他人账户的场景：

1. 创建 **Business 类型**的 Meta App，配置 redirect URI
2. 前端嵌入 Business Login 按钮（由 Meta 生成的 embed URL）
3. 用户授权 → 回调拿 code → 后端换短期 token → 立即换 **60 天长期 token**
4. 配置 **Webhooks 服务器**接收 media/messages 事件（官方推荐，不要轮询）
5. 定时任务：在 token 年龄 ≥ 24h 且未过期时刷新一次

Token 时效差异：Business Login 流出来的 token 初始 1 小时；App Dashboard "Generate token" 产生的是直接 60 天长期 token（仅用于测试/自己账户）。

## Access Level 与 App Review

| Level | 可服务账户 | 要求 |
|-------|-----------|------|
| **Standard Access**（默认） | 仅 developer 自己拥有/管理的账户，或开发/测试期 | 无 |
| **Advanced Access** | 他人专业账户 | **App Review + Business Verification** |

生产上线前必须提前走 App Review，审核会要求录屏演示每个申请的 scope。

## Get Started 前置清单

- 阅读 Instagram Platform Overview
- 已实现 Meta 登录流程（facebook-login SDK 或自建 OAuth）
- 已准备 Webhooks 回调服务器（HTTPS + 签名校验）
- 创建 **Business 类型**的 Meta App（非 Consumer）

## 速率限制

- 通用端点：`4800 × 账户 Impressions` 次 / 24 小时（随活跃度滚动）
- Messaging：
  - Conversations：2 calls/second/account
  - Live comments：100 calls/second
  - Post/Reel comments：750/hour

## 消息回复窗口

- 普通消息：用户消息后 **24 小时**内可回复
- Human agent tag：延长至 **7 天**

## 注意事项

- **不要**再把新项目接到 Basic Display API，会被直接拒审
- Instagram Login 路径**无法获取 Insights**，需要数据分析必须走 FB Login for Business
- 登录用的 Instagram 账户必须是 **Professional**（Business 或 Creator），Personal 账户无法授权
- redirect URI 必须 HTTPS 且与 App Dashboard 配置**完全一致**
- 长期 token 连续 60 天未刷新 → 失效，必须重新走授权
- Graph API 版本当前示例使用 `v25.0`，明确在 URL path 里指定版本避免默认版本漂移

## 组合提示

- 登录体验：通常与 `facebook-login-for-business` 并列提供两种入口
- 事件推送：必须搭配 `meta-webhooks`（签名校验 + 订阅字段管理）
- 多账户管理：后端持久化 `{ ig_user_id, long_lived_token, expires_at }`，用 Celery/定时任务批量刷新
