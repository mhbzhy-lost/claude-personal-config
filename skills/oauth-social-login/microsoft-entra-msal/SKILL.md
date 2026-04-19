---
name: microsoft-entra-msal
description: Microsoft Entra ID（原 Azure AD）身份平台统一认证库 MSAL——SPA/Web/Mobile/Daemon 场景下获取 ID token / access token / refresh token
tech_stack: [microsoft-entra, azure-ad, oauth2, oidc]
language: [javascript, typescript]
capability: [auth, http-client]
version: "msal-browser 5.4.0; msal-node 5.0.6; msal-react 5.0.6; msal-angular 5.1.1"
collected_at: 2026-04-19
---

# Microsoft Entra MSAL（Microsoft 身份认证库）

> 来源：
> - https://learn.microsoft.com/en-us/entra/identity-platform/msal-overview
> - https://learn.microsoft.com/en-us/entra/identity-platform/msal-authentication-flows
> - https://learn.microsoft.com/en-us/entra/msal/javascript/

## 用途

MSAL（Microsoft Authentication Library）是 Microsoft 官方身份认证库，从 Microsoft Entra ID（原名 Azure Active Directory / Azure AD，2023 年起更名为 **Microsoft Entra ID**）身份平台 v2.0 端点获取 OAuth 2.0 / OpenID Connect 令牌，用于登录用户并调用 Microsoft Graph、自有 Web API 或第三方 API。同一套一致 API 覆盖 .NET / JS / Java / Python / Android / iOS / Go。

> ADAL（旧库）**已停止支持**，必须迁移到 MSAL；ADAL 对接 v1.0 端点，不支持个人微软账户（MSA）。

## 何时使用

- 登录工作/学校账户、个人 Microsoft 账户（MSA）、或通过 Azure AD B2C / Entra External ID 接入社交身份（Google/Facebook/LinkedIn）
- SPA 前端（React / Angular / Vue）需要获取 token 调用 Microsoft Graph
- Web 后端 / 桌面 / 移动 / Electron 应用需要用户登录 + 调用受保护 API
- Daemon / 后端服务使用 client credentials（应用自身身份）跨服务调用
- 输入受限设备（Smart TV、CLI、IoT）使用 device code 流程
- Web API 作为中间层，需要 On-Behalf-Of (OBO) 把用户身份传递给下游 API

## 平台库选型

| 场景 | 包名 |
|---|---|
| SPA（React/Next.js/Gatsby） | `@azure/msal-react` + `@azure/msal-browser` |
| SPA（Angular） | `@azure/msal-angular` + `@azure/msal-browser` |
| SPA（Vue/原生 JS/TS） | `@azure/msal-browser` |
| Node Web（Express） / Electron / CLI | `@azure/msal-node` |
| .NET Framework / .NET / MAUI / WinUI | `Microsoft.Identity.Client`（MSAL.NET） |
| iOS / macOS | `MSAL` (microsoft-authentication-library-for-objc) |
| Android | `microsoft-authentication-library-for-android` |
| Java / Python / Go | 对应官方库 |

LTS：msal-browser 老项目停留在 v2.x；新项目用 v5.x。

## 认证流程速查

| 流程 | 用途 | 适用 | 签发令牌 |
|---|---|---|---|
| **Authorization Code + PKCE** | 用户登录 + 代表用户调 API | SPA（强制 PKCE）、Web、Mobile、Desktop | ID + Access + Refresh |
| **Client Credentials** | 应用自身身份，server-to-server | Daemon（**不支持移动端**） | Access（app-only） |
| **Device Code** | 输入受限设备、CLI | Desktop、Mobile（**仅 public client**） | ID + Access + Refresh |
| **On-Behalf-Of (OBO)** | 中间层 Web API 调下游 API | Web API | ID + Access + Refresh |
| **Refresh Token 兑换** | 静默续期 | 全部 | ID + Access + Refresh |
| ~~Implicit~~ | **已弃用**，SPA 改用 Auth Code + PKCE | — | — |
| ~~ROPC（用户名密码）~~ | **已弃用**，禁用 | — | — |
| IWA（集成 Windows 认证） | 域加入机器静默登录 | .NET Desktop（**仅 Workforce 租户 + AD FS 联邦用户**） | — |

**静默优先模式**：任何场景都应先 `acquireTokenSilent`，失败再 fallback 到交互流程。

## 基础用法（msal-browser v5）

### 1. 安装与初始化

```bash
npm install @azure/msal-browser
```

```ts
import { PublicClientApplication, Configuration } from "@azure/msal-browser";

const msalConfig: Configuration = {
  auth: {
    clientId: "<your-app-client-id>",
    authority: "https://login.microsoftonline.com/<tenant-id>", // 或 /organizations, /common
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: "localStorage", // v5 支持 AES-GCM 加密
  },
};

// v5 推荐工厂函数（支持异步初始化）
const pca = await PublicClientApplication.createPublicClientApplication(msalConfig);
// 或：const pca = new PublicClientApplication(msalConfig); await pca.initialize();
```

### 2. 登录 + 获取 token

```ts
const loginRequest = { scopes: ["User.Read"] };

// 交互登录（popup 或 redirect）
const loginResult = await pca.loginPopup(loginRequest);
pca.setActiveAccount(loginResult.account);

// 静默获取 token，失败回退交互
async function getToken(scopes: string[]) {
  const account = pca.getActiveAccount();
  try {
    const res = await pca.acquireTokenSilent({ scopes, account });
    return res.accessToken;
  } catch (e) {
    const res = await pca.acquireTokenPopup({ scopes, account });
    return res.accessToken;
  }
}

const token = await getToken(["User.Read"]);
fetch("https://graph.microsoft.com/v1.0/me", {
  headers: { Authorization: `Bearer ${token}` },
});
```

### 3. Redirect 流（无弹窗环境）

```ts
// 登录入口
await pca.loginRedirect(loginRequest);

// 页面加载时处理 redirect 回调（必须调用）
const response = await pca.handleRedirectPromise();
if (response) pca.setActiveAccount(response.account);
```

## msal-react 最小示例

```tsx
import { MsalProvider, useMsal, AuthenticatedTemplate, UnauthenticatedTemplate } from "@azure/msal-react";

<MsalProvider instance={pca}>
  <UnauthenticatedTemplate>
    <SignInButton />
  </UnauthenticatedTemplate>
  <AuthenticatedTemplate>
    <Dashboard />
  </AuthenticatedTemplate>
</MsalProvider>;

function SignInButton() {
  const { instance } = useMsal();
  return <button onClick={() => instance.loginPopup({ scopes: ["User.Read"] })}>Sign in</button>;
}
```

## msal-node（Web/Electron/CLI）

- `PublicClientApplication`：桌面/CLI/原生 app（无 client secret）
- `ConfidentialClientApplication`：Web 后端、Daemon（可保管 secret/certificate）
- 支持全部流程：Auth Code + PKCE、Device Code、Refresh、Client Credentials、Silent、OBO、Interactive、Managed Identity

```ts
import { PublicClientApplication } from "@azure/msal-node";

const pca = new PublicClientApplication({
  auth: { clientId, authority: "https://login.microsoftonline.com/organizations" },
});

// Device Code
const tokens = await pca.acquireTokenByDeviceCode({
  scopes: ["User.Read"],
  deviceCodeCallback: (info) => console.log(info.message), // 提示用户访问 microsoft.com/devicelogin
});
```

## MSAL.js v5 新特性

- **COOP 支持**：在严格 `Cross-Origin-Opener-Policy` 响应头环境下 popup 仍可用
- **NAA（Nested App Authentication）**：Microsoft 365 宿主内嵌 app（Teams、Outlook 等），用 `createNestablePublicClientApplication`
- **localStorage AES-GCM 加密**：token cache 自动加密
- **WAM Platform Broker**：Windows 下通过 `allowPlatformBroker: true` 走系统 Authenticator 代理
- **MCP 认证**：AI agent / tool 集成的认证流
- 工厂函数 `createStandardPublicClientApplication` / `createNestablePublicClientApplication` 支持异步配置

## Authority / Audience 配置

| authority 后缀 | 可登录账户 |
|---|---|
| `/{tenant-id}` | 单租户 |
| `/organizations` | 任意工作/学校账户 |
| `/consumers` | 仅个人 Microsoft 账户 |
| `/common` | 工作 + 学校 + 个人 |
| `https://<tenant>.b2clogin.com/...` | B2C（客户身份 + 社交登录，自定义 policy） |
| External ID for customers | `createNestable...` / native auth API |

Device code 和 IWA 的 authority **不能**用 `/common` 或 `/consumers`。

## 注意事项与陷阱

- **ADAL 已 EOL**，必须迁移 MSAL
- **SPA 强制 PKCE**，implicit flow 已废弃；implicit 返回的 token 通过 URL 回传，浏览器 URL 长度限制会导致 `groups` / `wids` 声明被裁掉
- **Authorization code 一次性**：同一 code 二次兑换会返回 `AADSTS54005 / AADSTS70002`，需用 refresh token 续期
- **ROPC 禁用**：不支持 SSO / MFA / Conditional Access，不支持 MSA，仅限工作学校账户，泄露风险高
- **Client credentials 不支持移动端**（Android/iOS/UWP 被视作 public client，无法保密 secret）
- **IWA 限制**：仅 AD FS 联邦用户可用，Entra ID 直接创建的 managed 用户不行；若租户启用 MFA，静默会失败
- **Silent-first**：始终先 `acquireTokenSilent`，捕获 `InteractionRequiredAuthError` 再降级交互
- **Redirect 流必须调 `handleRedirectPromise`**，否则登录回跳后 account 不生效
- **v4 → v5 迁移**：msal-browser / msal-node / msal-react / msal-angular 均有官方 migration guide，API 有 breaking changes

## 组合提示

- **msal-browser + msal-react / msal-angular**：SPA 首选
- **msal-node（Confidential）+ Express**：传统 Web 后端登录
- **msal-node（Public）+ Electron**：桌面 app
- **MSAL.NET + MAUI / WinUI**：跨平台 .NET 客户端
- **MSAL iOS/Android + WAM/Authenticator**：移动端走系统代理以享受 SSO 与条件访问
- **Azure AD B2C / Entra External ID**：面向消费者/社交登录，需要自定义 user flow / custom policy，msal-browser 通过 `authority = https://<tenant>.b2clogin.com/<tenant>.onmicrosoft.com/<policy>` 接入
- **Microsoft Graph SDK**：获取 token 后调用 `graph.microsoft.com/v1.0/me` 等端点
