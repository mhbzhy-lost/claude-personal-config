---
name: vivo-account-login
description: vivo 账号授权登录（OAuth2 Authorization Code）——Android SDK 一键登录 / 图标登录 / 增量授权 + 服务端 token/用户信息接口
tech_stack: [android, vivo-account]
language: [java]
capability: [auth, native-device, http-client]
version: "vivoaccountoauth 2.2.0.0; vivo-oauth-doc 2025-11-20"
collected_at: 2026-04-19
---

# vivo 账号授权登录

> 来源：https://dev.vivo.com.cn/documentCenter/doc/635 （vivo 账号授权接入指南）

## 用途

让 Android 应用通过 vivo 账号完成 OAuth2 授权登录，获取用户 openid/unionid、手机号、昵称、头像、邮箱、收货地址、实名/未成年/职业信息等，支持一键登录、静默登录、图标登录、增量授权、纯 H5 授权五种形态。

## 何时使用

- 面向中国大陆 vivo/iQOO 手机用户的 App 需要快捷登录
- 需要在应用卸载重装、换机场景下做静默登录提升转化率
- 需要获取用户手机号（免 SIM 卡、基于系统已登录账号）
- 已登录应用需要后续增量请求邮箱/地址/实名/职业等敏感信息
- 纯 H5/PC 站点需要 vivo 账号登录入口

## 开发准备

1. vivo 开放平台 → 管理中心 → 应用 → 创建应用，获取 `appid`（作为 `client_id`）与 `appkey`（作为 `client_secret`）
2. 应用服务 → 账号服务 → 申请：vivo 账号一键登录、一键静默登录、信息授权、增量授权（手机号、邮箱、收货地址、实名、职业、未成年）
3. 登记回调地址 `redirect_uri`（SCHEME + 域名 + 端口必须与运行时完全一致，path 可同级/子路径）
4. 从开放平台下载：授权 SDK、账号工具类 SDK、服务端参数签名包（3 个 Java 文件，含 `MD5SignUtil`）
5. 阅读合规：`doc/922`（合规）、`doc/921`（个人信息保护政策）

## SDK 集成（Android）

**build.gradle（项目级）**：
```gradle
repositories {
    maven {
        url "https://repos.vivo.com.cn/maven/repository/external-lib/"
        allowInsecureProtocol = true  // SSL 协商异常时用 http
    }
    google()
}
```

**build.gradle（模块级）**：
```gradle
implementation 'vivo:vivoaccountoauth:2.2.0.0'
```

## 场景一：一键登录（QuickOauth）

### 1. 初始化 QuickOauth

```java
mQuickOauth = new QuickOauth.QuickOauthBuilder(context)
    .setClientId("100008888")
    .setScope(Oauth.Scope.QUICK_ONE_KEY_LOGIN_SILENT) // 或 QUICK_ONE_KEY_LOGIN
    .setResponseType("code idtoken")
    .setNonce(UUID.randomUUID().toString())
    .setState("随机state")
    .build();
```

### 2. 预请求：探测是否支持 + 拿到掩码手机号

```java
mQuickOauth.createVivoQuickAuthorizationRequest(new CreateVivoAuthorizationResultCallback() {
    @Override
    public void onCreateVivoAuthorizationResult(int code, String result) {
        if (code == AidlRspCode.CODE_SUCCESS) {
            JSONObject json = new JSONObject(result);
            String openid   = json.optString("openid");
            String unionid  = json.optString("unionid");
            String maskPhone= json.optString("maskPhone");
            String idToken  = json.optString("idToken");
            String oauthCode= json.optString("code");
            // 支持一键登录：渲染 VivoLoginButton + 掩码手机号
        } else {
            // 不支持：回退到应用自有登录方式
        }
    }
});
```

不支持的典型原因：系统未登录 vivo 账号、账号版本不支持、非中国大陆账号。

### 3. 用户点击 VivoLoginButton 获取 oauthCode

`VivoLoginButton` 基于 Android 原生 Button，按【一键登录 UX 规范】嵌入自有登录页：

```java
mVivoLoginButton = findViewById(R.id.quick_login);
mVivoLoginButton.initVivoLoginButton(mQuickOauth, new VivoLoginButton.OnVivoLoginButtonClickListener() {
    @Override
    public void onVivoQuickLoginResult(int code, String result) {
        // code: 5=成功, -3=网络异常, 6=其他异常（解析 result.statusCode 获取详细）
        JSONObject json = new JSONObject(result);
        String oauthCode = json.optString("oauthCode"); // 交给自己的服务端换 accessToken
    }
});
```

`result` 字段：`statusCode`（200/13/21/22/23）、`statusMsg`（可直接 toast）、`oauthCode`。

## 场景二：图标登录（Oauth）

### 1. 初始化

```java
mOauth = new Oauth.Builder(activity)
    .setAppID(appid)
    .setRedirectUrl(redirectUrl)
    .setKeepCookie(true)
    .build();
```

### 2. 调用 requestCode 获取 Authorization Code

```java
mOauth.unRegisterOauthCallback();                         // 每次调用前必须先解注册
mOauth.requestCode(mOauthCallback, scope);
```

常用 scope：
- `Constant.Scope.user_baseinfo` / `Oauth.Scope.BASE_USERINFO`：昵称 + 头像 + openid
- `Oauth.Scope.PHONE_USERINFO`：手机号
- `Oauth.Scope.BASE_PHONE_USERINFO`：基础 + 手机号

回调：
```java
OauthCallback mOauthCallback = new OauthCallback() {
    public void onStartLoading() {}
    public void onResult(OauthResult result) { /* result.getCode() => authCode */ }
    public void onEndLoading() {}
};
```

行为：未登录先拉起登录页 → 授权页；已登录直授权页；已授权则静默返回 code。

## 场景三：增量授权（requestIncrementOauth）

用于 base 登录完成后，追加申请邮箱/地址/实名/职业/未成年等权限。

```java
mIncrementalOauth = new Oauth.Builder(activity)
    .setAppID("1xxxxxx")
    .setRedirectUrl(REDIRECT_URI2)
    .setSign(sign)                                   // MD5(timeStamp + client_id + client_secret)
    .build();

mIncrementalOauth.requestIncrementOauth(callback, Oauth.Scope.PHONE_USERINFO);
// 或 EMAIL_USERINFO / ADDRESS_USERINFO / REALNAME_USERINFO / PROFESSION_INFO / NON_AGE_STATE
```

两类差异（重要）：
- **手机号 / 邮箱**：客户端拿到 code → 服务端 code 换 token → token 拿完整信息（走标准 OAuth2 链路）
- **收货地址 / 实名 / 未成年 / 职业**：直接在 `onIncrementResult(OauthResult result, Bundle bundle)` 回调的 `bundle` 中返回客户端快照，**不走服务端**

```java
public void onIncrementResult(OauthResult result, Bundle bundle) {
    String code = result.getCode();
    JSONObject extra = OauthUtils.bundleToJson(bundle);
}
```

## 关键 Scope 一览

| 场景 | scope 常量 |
|---|---|
| 一键登录 | `Oauth.Scope.QUICK_ONE_KEY_LOGIN` |
| 一键登录 + 静默登录 | `Oauth.Scope.QUICK_ONE_KEY_LOGIN_SILENT` |
| 图标基础信息 | `Oauth.Scope.BASE_USERINFO` |
| 图标手机号 | `Oauth.Scope.PHONE_USERINFO` |
| 图标基础+手机号 | `Oauth.Scope.BASE_PHONE_USERINFO` |
| 增量手机号+邮箱 | `Oauth.Scope.BASE_PHONE_EMAIL_USERINFO` |
| 增量邮箱 | `Oauth.Scope.EMAIL_USERINFO` |
| 增量收货地址 | `Oauth.Scope.ADDRESS_USERINFO` |
| 增量实名 | `Oauth.Scope.REALNAME_USERINFO` |
| 增量职业 | `Oauth.Scope.PROFESSION_INFO` |
| 增量未成年 | `Oauth.Scope.NON_AGE_STATE` |

## 服务端接口（应用服务器 ↔ vivo 账号服务器）

所有服务端接口均为 `POST` + `application/x-www-form-urlencoded`，公共参数：`timestamp`（毫秒）、`nonce`、`sign`（见下方签名算法）。

### 1. code 换 token

`POST https://passport.vivo.com.cn/oauth/v2/access_token`

业务参数：`client_id`、`code`、`grant_type=authorization_code`

响应：
```json
{"code":0,"msg":"成功","data":{
  "access_token":"...", "refresh_token":"...",
  "session_key":"...",  "expire_in":86400
}}
```

### 2. token 换用户信息

`POST https://passport.vivo.com.cn/oauth/v2/resource`

业务参数：`client_id`、`access_token`

响应：
```json
{"code":0,"msg":"成功","data":{
  "openid":"...", "nickname":"...", "avatar":"...",
  "watermark":"<AES 密文>", "iv":"<AES IV>"
}}
```

敏感字段（手机号 / 邮箱）通过 `watermark` 密文下发，用 `session_key` 作 key、`iv` 作 IV，`AES/CBC/PKCS5Padding` 解密。

### 3. refreshToken 换新 token

`POST https://passport.vivo.com.cn/oauth/v2/refresh_token`

业务参数：`client_id`、`refresh_token`、`grant_type=refresh_token`

accessToken 有效期 24h。刷新后旧 access_token / refresh_token 立即失效。

### 4. 取消授权

`POST https://passport.vivo.com.cn/oauth/v2/cancel`

业务参数：`client_id`、`vivo_openid`

### 5. 获取 idToken 验签公钥（JWKS）

`POST https://passport.vivo.com.cn/oauth/v2/getOauthPublicKey`（无入参）

返回 RSA256 公钥数组，字段含 `kid / n / e / alg=RS256`。公钥**按月轮换**，至少同时维护当前 + 上一版两套以防解析失败。

### 6. H5 授权跳转（非 SDK）

`GET https://passport.vivo.com.cn/oauth/v2/authorize?client_id=...&scope=user_baseinfo&redirect_uri=...&response_type=code`

用户确认后重定向至 `redirect_uri?code=xxxx`。

## 签名算法（MD5）

1. 取所有请求参数（除 `sign` 自身），按字段名字典序排序
2. 用 `&` 拼成 `k1=v1&k2=v2...` 的原始串
3. 在末尾拼接 `client_secret`（即 appkey）
4. 对结果做 MD5 → 作为 `sign` 参数

`Oauth.Builder.setSign(...)` 中，客户端增量授权的 sign 特殊公式：`MD5(timeStamp + client_id + client_secret)`。

## idToken 验签要点（RS256）

1. 从 idToken header 解析出 `kid`
2. 调 `getOauthPublicKey` 拿公钥列表，按 `kid` 匹配得到 `{n, e}`
3. Base64URL 解码 `n / e` → `RSAPublicKeySpec` → `RSAPublicKey`
4. `Algorithm.RSA256(pubKey)` + `JWT.require(alg).build().verify(idToken)` 得到 `DecodedJWT`
5. 关注 claim：`sub`（= 用户标识）、`aud=oauth`、`iss=passport.vivo.com.cn`、`nickName`、`smallAvatar`、`phonenum`、`nonce`、`jti`

Maven：`com.auth0:java-jwt`。

## 错误码速查

**APP 端（onVivoQuickLoginResult / OauthResult.statusCode）**：

| code | 含义 |
|---|---|
| 200 | 授权码获取成功 |
| 12 | 用户取消授权 |
| 13 | 网络异常 |
| 14 | 其他错误 |
| 15 | AIDL service 断开 |
| 16 | 用户退出登录 |
| 19 | 账号被冻结 |
| 20 | 黑名单 |
| 21 | 外销（非中国大陆）账号 |
| 22 | 超出授权权限 |
| 23 | 高风险账号 |
| 24 | 禁止一次申请多个权限 |

VivoLoginButton 外层 `code`：5=成功，-3=网络异常，6=其他（需解析 result.statusCode）。

**服务端（业务响应 code 字段）**：

| code | 含义 |
|---|---|
| 2002002 | 超出权限范围 |
| 2002003 | 请求有风险 |
| 2002004 | 不能同时请求多条敏感权限 |
| 2002005 | 非法的 clientId |
| 2002007 | 敏感权限等级低，不允许单独请求 |
| 2002009 | 非法请求 |
| 2002010/11/12 | timestamp/sign/client_id 为空 |
| 2002013 | sign error |
| 2002014 | 请求超时 |
| 2002015 | 无效的 code |
| 2002016 | 无效的 access_token |
| 2002017 | 无效的 refresh_token |

## 注意事项

1. **每次调用前先解注册**：`mOauth.unRegisterOauthCallback()` 必须在 `requestCode` 前调用，否则回调会串；一键登录同理。
2. **openid vs unionid**：openid 在同一应用内唯一，历史上同开发者不同应用的 openid 可能相同（不可靠）；跨应用标识用户唯一性用 unionid。
3. **静默权限需单独申请**：`QUICK_ONE_KEY_LOGIN_SILENT` 必须先在开放平台申请到静默登录权限才能使用。
4. **地域限制**：一键登录仅限中国大陆（不含港澳台）账号；获取手机号的应用服务器也必须部署在中国大陆。
5. **手机号二次放号**：拿到明文手机号后，业务侧要自行做二次放号判断等安全校验。
6. **回调地址严格匹配**：SCHEME + 端口必须完全一致；域名可同级或子域名；path 可同级或子路径。HTTP 与 HTTPS 视作不同域。
7. **idToken 公钥月度轮换**：至少缓存当前 + 上一版两套公钥，避免用户在轮换窗口内验签失败。
8. **access_token 24h 过期**：使用 refresh_token 换发；换发成功后旧 token 立即失效，业务侧需原子切换。
9. **AIDL service 断开（15）**：属于系统侧异常，建议回退到其他登录方式并上报。
10. **SSL/代理报错**：maven 仓库出现 SSL 协商异常时，允许降级 http（`allowInsecureProtocol = true`），或排查本地 gradle 代理。
11. **MD5SignUtil 获取**：不在 Maven 仓库，需从「vivo 开放平台 → 应用详情 → 账号服务」下载服务端签名包。
12. **一键登录 UX 合规**：按钮样式、协议跳转链接必须遵守【一键登录交互规范】，不合规会影响应用上架。

## 组合提示

- 与 `honor-account-login`、`huawei-account-kit`、`xiaomi-account-login` 等厂商账号 SDK 并列，在多品牌 Android 应用中通常同层封装为「厂商一键登录」聚合层
- 结合 `carrier-number-auth-cn`（运营商一键登录）作为非 vivo 设备的回退
- 服务端 token/用户信息接口与 `cn-platform-oauth-login` 的通用签名/AES 解密/JWT 验签套路一致，可复用基础设施
