---
name: huawei-account-kit
description: 华为 HMS Core Account Kit（Android）接入，覆盖 AppGallery Connect 配置、ID Token / AuthCode / Silent Sign-In 认证场景，以及服务端 Java 用 code 换 access_token 并解析 UserInfo 的流程
tech_stack: [android, hms-core]
language: [java, kotlin]
capability: [auth, native-device, http-client]
version: "hms-core-account-kit unknown; hms-core-apk >=4.0"
collected_at: 2026-04-19
---

# 华为 HMS Core Account Kit（Android）

> ⚠️ 本 skill 基于 [HMS-Core/huawei-account-demo](https://github.com/HMS-Core/huawei-account-demo) 与 [huaweicodelabs/AccountKit](https://github.com/huaweicodelabs/AccountKit) 官方 demo README 蒸馏，**仅为集成骨架**。完整 API 参数表 / 返回值 / 错误码请参阅 [developer.huawei.com/consumer/cn/doc/development/HMSCore-Guides](https://developer.huawei.com/consumer/cn/doc/development/HMSCore-Guides)（Angular SPA，静态抓取不可达，需浏览器访问）。
>
> ⚠️ **范围限定**：本 skill 仅涵盖 **Android + HMS Core** 体系。**HarmonyOS NEXT** 的 Account Kit 与 HMS Core 是完全独立的 SDK 体系（ArkTS API、认证流程、配置项均不同），不在此范围内。

## 用途

在 Android App 中接入华为账号登录，获取 ID Token 或授权码（AuthCode），可选用于替代用户名密码登录、打通华为生态用户体系。服务端凭 AuthCode 向华为 OAuth 端点换取 access_token 并拉取 UserInfo。

## 何时使用

- App 面向中国大陆且需要适配华为设备（无 Google Play 服务，但有 HMS Core）
- 需要"一键登录华为账号"或与 AGC / Push Kit / IAP 等华为生态服务打通
- 已在 AppGallery Connect 注册应用，准备发布到华为应用市场
- 需要静默登录（Silent Sign-In）维持会话，避免每次冷启重新拉起授权 UI
- 需要服务端侧验证 ID Token（JWT）或通过 AuthCode 获取长期凭证

不适用：
- 仅需覆盖国际市场且设备上有 GMS → 用 Google Sign-In / Firebase Auth
- HarmonyOS NEXT 原生应用 → 使用 HarmonyOS Account Kit（ArkTS）

## 基础用法

### 1. AppGallery Connect 前置配置

1. 注册华为开发者账号 → 在 [AppGallery Connect](https://developer.huawei.com/consumer/cn/service/josp/agc/index.html) 创建 App
2. 开通 **Account Kit** 服务
3. 下载 `agconnect-services.json`
4. 将 `agconnect-services.json` 放到 **app 模块根目录**（`<project>/app/`），与 `build.gradle` 同级
5. 在 app 级 `build.gradle` 中将 `applicationId` 改为在 AGC 注册时填写的应用包名（必须完全一致，否则 SDK 报 907135701 类错误）

### 2. Android 端依赖（典型片段）

```gradle
// 项目根 build.gradle
buildscript {
    repositories { maven { url 'https://developer.huawei.com/repo/' } }
    dependencies { classpath 'com.huawei.agconnect:agcp:<ver>' }
}
allprojects { repositories { maven { url 'https://developer.huawei.com/repo/' } } }

// app/build.gradle
apply plugin: 'com.huawei.agconnect'
dependencies {
    implementation 'com.huawei.hms:hwid:<ver>'   // Account Kit SDK
}
```

> 具体 `<ver>` 请查阅 HMS Core 官方文档，demo README 未固定版本号。

### 3. 运行环境约束

- **Android SDK**：≥ 23（Android 6.0）
- **JDK**：≥ 1.8
- **设备**：必须安装 **HMS Core (APK) 4.0+**（非华为设备用户需通过引导安装 HMS Core，或视为不支持）

### 4. 客户端认证场景（demo `hmssample` 实现参考）

demo 在 `AccountActivity.java` 中演示五类场景：

| 场景 | 说明 | 典型用途 |
|------|------|----------|
| **ID Token Sign-In** | 登录后拿到 JWT 形式的 ID Token | 前端直接展示用户身份，服务端用公钥校验 JWT |
| **Authorization Code Sign-In** | 登录后拿到一次性 AuthCode | 服务端拿 code 换 access_token（安全，token 不暴露给客户端） |
| **Silent Sign-In** | 静默登录，不拉起 UI | App 冷启动恢复会话 |
| **Sign-Out** | 退出登录 | 清本地缓存 + 撤销当前设备授权状态 |
| **Cancel Authorization** | 取消授权 | 用户主动解绑，下次需重新授权 |

## 服务端 Java（demo `Account-Server-Java-Demo` 参考）

服务端演示三个能力：

1. **TokenAPIDemo.java** — 用 AuthCode 换 access_token
2. **IDTokenAPIDemo.java** — 用公钥校验客户端送来的 ID Token（JWT）
3. **GetTokenInfoAPIDemo.java** — 解析 access_token，拉取用户信息

### 关键配置（`Contant.java`，注意原文拼写即 `Contant` 非 `Constant`）

| 参数 | 含义 | 获取方式 |
|------|------|----------|
| `CLIENT_ID` | 应用 App ID | AppGallery Connect → 应用详情 |
| `CERT_URL` | ID Token 签名公钥 URI | 访问 OpenID discovery 文档，取 `jwks_uri` 字段的值 |
| `ID_TOKEN_ISSUE` | Issuer，用于校验 JWT 的 `iss` 声明 | 必须与 ID Token 中 `iss` 字段严格一致 |

### 典型服务端流程

```
[客户端] 登录成功 → 拿到 authCode
   ↓ HTTPS 上行
[业务服务端] POST https://oauth-login.cloud.huawei.com/oauth2/v3/token
   grant_type=authorization_code&code=<authCode>&client_id=<CLIENT_ID>&client_secret=...
   ↓ 响应
   { access_token, id_token, refresh_token, expires_in }
   ↓
[业务服务端] 用 CERT_URL 公钥验证 id_token JWT 签名 + iss + aud + exp
[业务服务端] 可选：GET /oauth2/v3/userinfo  Authorization: Bearer <access_token>
```

> 具体端点 URL / 请求参数 / 响应字段 demo README 未全文给出，以 HMS Core Guides 官方文档为准。

## 关键 API（摘要）

> 以下为 demo 实现中涉及到的类/方法名，**具体签名请查官方文档**：

- `HuaweiIdAuthManager` — 入口管理类
- `HuaweiIdAuthParams` / `HuaweiIdAuthParamsHelper` — 授权参数构造器（声明要 ID Token / AuthCode / 邮箱 / 头像 / OpenID 等 scope）
- `HuaweiIdAuthService` — 由 `HuaweiIdAuthManager.getService(context, params)` 产出，提供：
  - `getSignInIntent()` — 返回 Intent，`startActivityForResult` 拉起登录 UI
  - `silentSignIn()` — 返回 Task，静默登录
  - `signOut()` — 登出
  - `cancelAuthorization()` — 撤销授权
- `AuthHuaweiId` — 登录结果，包含 `getIdToken()` / `getAuthorizationCode()` / `getOpenId()` / `getUnionId()` 等

## 注意事项

- **HMS Core APK 必装**：设备上必须存在 HMS Core 4.0+，否则所有 API 返回错误。常见做法：首次调用前用 `HuaweiApiAvailability.isHuaweiMobileServicesAvailable()` 探测并引导安装
- **`agconnect-services.json` 位置固定**：必须在 **app 模块根目录**（不是项目根目录，也不是 `res/`）
- **`applicationId` 必须匹配 AGC 配置**：否则 SDK 拒绝工作。多渠道打包、变体构建尤其容易踩坑
- **ID Token 的 `iss` 校验**：`ID_TOKEN_ISSUE` 必须与实际 token 中的 `iss` 完全一致；华为的 issuer 值随地域可能不同，不要硬编码猜测值，以 discovery 文档为准
- **AuthCode 一次性**：服务端换取 token 后即失效，不要缓存原始 code
- **静默登录前提**：用户之前必须完成过交互式登录且未取消授权，否则 `silentSignIn()` 失败，需 fallback 到 `getSignInIntent()`
- **增量授权**：申请新 scope 时需重新走交互式授权流，silent 流不能扩权
- **中文 README 编码问题**：官方仓库的 `README_ZH.md` 在 GitHub raw 上疑似 GB2312 被误当 UTF-8，内容与 EN 版对应但渲染乱码；集成时以 EN 版为准
- **版本号**：demo 仓库未标注 SDK 版本，`com.huawei.hms:hwid` 与 `agcp` 建议取 HMS Core 官方 release notes 的最新稳定版
- **完整 API / 错误码不在本 skill 内**：demo README 只列场景与入口类，参数含义、回调结构、错误码（如 2002 取消、907135701 包名不符等）须查 HMS Core Guides

## 组合提示

- 与 **oauth-social-login** 组合：服务端多登录渠道（微信 / QQ / Apple / 华为）聚合
- 与 **cn-platform-oauth-login** 思路一致：code → token → userinfo 三段式 OAuth2 授权码流
- 与 **android** skill 组合：处理 `startActivityForResult` / `ActivityResultContracts` 新旧写法、Gradle 配置
- HarmonyOS NEXT 场景下改用 **harmonyos** 下的 Account Kit skill（独立 SDK 体系）
