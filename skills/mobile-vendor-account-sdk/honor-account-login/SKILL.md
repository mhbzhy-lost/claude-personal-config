---
name: honor-account-login
description: 荣耀（HONOR）账号登录 SDK 集成指南——Android 端静默/授权/增量授权 + 服务端 OAuth2 token 流程
tech_stack: [android, honor-id]
language: [java]
capability: [auth, native-device, http-client]
version: "honor-id-demo unversioned"
collected_at: 2026-04-19
---

# 荣耀账号登录（HONOR ID Sign-In）

> 来源：https://github.com/HONORDevelopers/honor-id-demo （README + README-ZH）

> ⚠️ 本 skill 基于 `HONORDevelopers/honor-id-demo` 官方 demo README 蒸馏，覆盖包结构与服务端 Demo 清单，**不含完整方法签名、参数定义、返回值与错误码表**。完整 API 参考需登录 `developer.honor.com/cn/docs/11016`（React SPA，静态抓取返回空 body，**必须浏览器访问**）：
> - Android SDK 集成指南：https://developer.honor.com/cn/docs/11016/sdk/android
> - 错误码参考：https://developer.honor.com/cn/docs/11016/reference/error-code
> - 英文集成指南：https://developer.honor.com/en/doc/guides/100270
>
> 涉及方法具体签名、SignInOptions 枚举值、errorCode 语义时，**务必查阅上述官方文档**，不要凭记忆编写。

## 用途

在荣耀（Magic OS）设备及预装 HONOR Mobile Services 的环境上，使用荣耀账号作为第三方登录入口；类似华为 HMS Account Kit，遵循 OAuth 2.0 授权码模式。

## 何时使用

- 应用需要上架荣耀应用市场并在国内荣耀设备上提供一键登录
- 已接入 HMS / 小米 / OPPO / vivo 等账号矩阵，需补齐 HONOR 厂商侧
- 需要服务端拿 `code` 换 `access_token` 并调用 HONOR OpenAPI 获取用户信息 / `unionId`
- 场景不适用：非荣耀设备、或目标海外市场无 HONOR Mobile Services 环境

## Android 端集成要点

SDK 入口分布在四个包中（具体类定义见官方文档）：

| 包名 | 职责 |
|------|------|
| `com.hihonor.cloudservice.support.account` | 顶层入口 `HonorIdSignInManager`，获取 Service 实例 |
| `com.hihonor.cloudservice.support.account.service` | `HonorIDSignInService`：静默登录、取消授权、获取 SignInIntent |
| `com.hihonor.cloudservice.support.account.request` | `SignInOptions`：声明请求的授权范围（scope） |
| `com.hihonor.cloudservice.support.account.result` | `SignInAccountInfo`：登录结果承载（uid / openId / accessToken / authCode 等） |

### 四种登录场景

1. **静默登录（silentSignIn）**：应用启动时尝试恢复上次授权，无 UI；失败即回退到授权登录
2. **授权登录（getSignInIntent + startActivityForResult）**：首次或静默失败时拉起授权页，用户确认后回调返回 `authCode`
3. **取消登录（cancelAuthorization / signOut）**：注销当前账号或撤销应用对荣耀账号的授权
4. **增量授权**：在已授权基础上追加 scope，使用新的 `SignInOptions` 再次调用授权流程，用户仅需确认新增权限

### 典型调用骨架

```java
// 1. 构造 scope
SignInOptions options = new SignInOptions.Builder(SignInOptions.DEFAULT_SIGN_IN)
        .setIdToken()
        .setAuthorizationCode()
        .createParams();

HonorIDSignInService service =
        HonorIdSignInManager.getService(activity, options);

// 2. 静默登录
service.silentSignIn()
       .addOnSuccessListener(info -> handle(info))
       .addOnFailureListener(e -> launchSignInIntent(service));

// 3. 静默失败 → 拉起授权页
void launchSignInIntent(HonorIDSignInService service) {
    Intent intent = service.getSignInIntent();
    activity.startActivityForResult(intent, REQ_CODE);
}

// 4. onActivityResult 里解析
SignInAccountInfo info = HonorIdSignInManager.parseSignInResult(data);
String authCode = info.getAuthorizationCode();
```

> 上述骨架基于 demo 语义推断，**实际方法名/签名以官方 Android SDK 集成指南为准**。

## 服务端 OAuth2 流程

demo 仓库 `com.hihonor.honorid.demo` 包中包含 6 个示例类，覆盖完整后端链路：

| Demo 类 | 底层接口 | 用途 |
|---------|----------|------|
| `Code2AtDemo` | `POST /oauth2/v3/token` (grant_type=authorization_code) | 前端回传的 `authCode` → `access_token` + `refresh_token` + `id_token` |
| `Rt2AtDemo` | `POST /oauth2/v3/token` (grant_type=refresh_token) | 用 `refresh_token` 续期 `access_token` |
| `GetServerAtDemo` | `POST /oauth2/v3/token` (grant_type=client_credentials) | 获取应用级 token（调用 Server-to-Server API） |
| `GetInfoDemo` | `GOpen.User.getInfo` | 凭用户 `access_token` 拉取用户 profile |
| `AtParserDemo` | `hihonor.oauth2.user.getTokenInfo` | 远端校验 `access_token` 合法性与 scope |
| `IDTokenParserDemo` | — | **本地**校验 `id_token` JWT 签名，免去一次网络调用 |

### 后端推荐链路

```
Android 端授权 → authCode
      ↓
Code2AtDemo (code→access_token + id_token)
      ↓
IDTokenParserDemo（本地解析 id_token 拿 openId/unionId，避免每次都调 getInfo）
      ↓（需要完整用户信息时）
GetInfoDemo → 用户昵称/头像
      ↓（access_token 过期）
Rt2AtDemo 刷新
```

## 注意事项

- **设备前提**：终端必须预装 HONOR Mobile Services（HMS Core for HONOR）。非荣耀设备或海外无 HMS 环境应用应做可用性检测并回退到其他登录方式
- **unionId vs openId**：同一荣耀账号在同一开发者下跨应用用 `unionId` 关联；openId 为单应用维度。具体字段归属需查 `GetInfoDemo` 返回定义
- **id_token 本地解析**优先于远程 `getTokenInfo`，减少 QPS 消耗
- **错误码**：demo 不含错误码清单，排查授权失败（如 scope 未配置、包名/签名指纹不匹配、账号未登录系统）必须查 `error-code` 官方页
- **应用级 token**（`GetServerAtDemo`）仅用于 Server-to-Server 管理类接口，**禁止**下发到客户端
- **包名冲突**：HONOR 使用 `com.hihonor.*`，而华为 HMS 使用 `com.huawei.*`，两家 SDK 可共存，但需分别在各自开发者后台注册包名与 SHA-256 签名

## 组合提示

- 与 `huawei-account-hms`、`xiaomi-account-oauth`、`cn-platform-oauth-login/*` 并列，属于"国产厂商账号矩阵"；登录门户通常聚合多家 SDK，按设备品牌动态选择入口
- 服务端 token 存储、刷新调度可复用通用 OAuth2 基础设施，不需要 HONOR 专属中间件
