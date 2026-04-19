---
name: huawei-account-kit-harmonyos
description: 华为 HarmonyOS NEXT Account Kit（ArkTS）一键登录、匿名手机号授权、UnionID/OpenID 获取
tech_stack: [harmonyos]
language: [arkts]
capability: [auth, native-device, http-client]
version: "HarmonyOS 6.0.0 Release SDK"
collected_at: 2026-04-19
---

# Huawei Account Kit（HarmonyOS NEXT · ArkTS）

> 来源：
> - https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/account-client-id
> - https://developer.huawei.com/consumer/en/codelabsPortal/carddetails/tutorials_NEXT-AccountKit-QuickLogin_en
> - https://developer.huawei.com/consumer/cn/hms/huawei-accountkit/
> - https://developer.huawei.com/consumer/cn/doc/harmonyos-guides-V5/account-kit-guide-V5

## 用途
基于 OAuth 2.0 + OpenID Connect 的华为帐号授权 SDK，为 HarmonyOS NEXT 应用提供一键登录按钮、匿名手机号授权、UnionID/OpenID 获取能力。**这是独立于 HMS Android Account Kit 的鸿蒙原生体系**，通过 `@kit.AccountKit` 引用，使用 ArkTS + Stage 模型。

## 何时使用
- 鸿蒙 NEXT（HarmonyOS 6.0.0 / API 20+）应用需要接入华为帐号登录
- 需要一键获取用户手机号（免输入验证码），展示匿名手机号后点击完成授权
- 需要 UnionID / OpenID 建立 app 内用户体系
- 多端（手机、平板、2-in-1、TV）共用同一套登录逻辑

不适用：Android（请用 `huawei-account-kit` skill，基于 HMS `com.huawei.hms.support.hwid`）。

## 前置条件

### 1. AGC 工程配置
- 在 AppGallery Connect 创建项目与应用，Bundle name = module.json5 中的包名
- **配置 `quickLoginMobilePhone` scope**（否则一键登录失败）
- 生成签名证书并在 AGC 配置 SHA-256 指纹
- 获取应用的 **Client ID** 与 **APP ID**（AGC → 开发与服务 → 常规 → 应用）

### 2. Client ID 配置（关键）
若 Client ID 与 APP ID **不同**，必须在 `entry` 模块的 `module.json5` 中新增 `metadata`：

```json5
"module": {
  "name": "entry",
  "type": "entry",
  "metadata": [
    {
      "name": "client_id",
      "value": "<应用 Client ID>"
    }
  ]
}
```

两值相同则无需配置。**多模块工程务必配置到 `type=entry` 的那个模块**，错配成项目级 Client ID 会导致接口调用报错。

### 3. 权限声明
在 `module.json5` 的 `requestPermissions` 中声明：
- `ohos.permission.INTERNET`：调用一键登录组件所必需
- `ohos.permission.GET_NETWORK_INFO`：访问《华为帐号用户认证协议》页面所必需

## 工程结构（Stage 模型）

```
entry/src/main/ets/
├── common/
│   ├── Constants.ets         # 常量（含 ErrorCode）
│   └── ShowToast.ets         # toast 工具
├── entryability/
│   └── EntryAbility.ets      # 入口 Ability（替代 Android 的 Application/Activity）
├── pages/
│   ├── HomePage.ets
│   ├── PrepareLoginPage.ets  # 匿名手机号预取页
│   ├── QuickLoginPage.ets    # 一键登录按钮页
│   ├── PersonalInfoPage.ets
│   └── ProtocolWebView.ets   # 用户协议 WebView
```

## 基础用法

### Step 1：预取匿名手机号（PrepareLoginPage.ets）
调用 `authentication` 模块的 `AuthorizationWithHuaweiIDRequest` 获取匿名手机号（中国大陆号码无国际区号前缀；境外号码含区号）。拿到后作为参数传给 `QuickLoginPage` 展示。

```arkts
import { authentication } from '@kit.AccountKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { showToast } from '../common/ShowToast';
```

### Step 2：一键登录按钮（QuickLoginPage.ets）
使用 `LoginWithHuaweiIDButton` 组件与 `loginComponentManager` 管理登录逻辑。用户同意协议后点击按钮 → SDK 返回 authorization code → app 服务端用 code 换取完整手机号、UnionID、OpenID。

```arkts
import { loginComponentManager, LoginWithHuaweiIDButton } from '@kit.AccountKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { showToast } from '../common/ShowToast';
import { ErrorCode } from '../common/Constants';
```

> **完整示例代码**：官方 Codelab 页面仅展示 import 段，完整 `PrepareLoginPage.ets` / `QuickLoginPage.ets` 实现（含 controller 配置、回调处理、UI 布局）需从 [Codelab 页面](https://developer.huawei.com/consumer/en/codelabsPortal/carddetails/tutorials_NEXT-AccountKit-QuickLogin_en) 底部下载官方 zip 源码包（页面内展示区显示 "No Preview"，实际代码在 Download 附件中）。

## 关键 API 摘要

| 符号 | 所在模块 | 用途 |
|------|----------|------|
| `authentication` | `@kit.AccountKit` | 统一身份认证服务入口 |
| `AuthorizationWithHuaweiIDRequest` | `authentication` | 申请匿名手机号等用户信息授权 |
| `LoginWithHuaweiIDButton` | `@kit.AccountKit` | 华为帐号一键登录按钮（ArkUI 声明式组件） |
| `loginComponentManager` | `@kit.AccountKit` | 登录组件逻辑管理器（controller、样式、回调） |
| `quickLoginMobilePhone` scope | AGC 侧 | 一键登录手机号的必备 OAuth scope |
| authorization code | 回调返回 | 需送 app 服务端换取完整手机号 / UnionID / OpenID |

## 与 HMS Android Account Kit 的差异

| 维度 | HarmonyOS NEXT（本 skill） | Android（HMS） |
|------|---------------------------|---------------|
| 语言 | ArkTS | Java / Kotlin |
| 应用模型 | Stage 模型（EntryAbility + AbilityStage） | Application / Activity |
| 包引用 | `@kit.AccountKit` | `com.huawei.hms.support.hwid` |
| 清单文件 | `module.json5`（entry 模块） | `AndroidManifest.xml` |
| 登录按钮 | `LoginWithHuaweiIDButton`（声明式组件） | `HuaweiIdAuthButton` |
| 授权入口 | `authentication` 模块 | `HuaweiIdAuthManager` |
| 底座 | 鸿蒙 NEXT 原生，非 HMS | HMS Core |

**关键心智**：鸿蒙 NEXT 完全不兼容 HMS Android SDK，代码需按 ArkTS 重写，不存在 `com.huawei.hms.*` 包。

## 注意事项

1. **Client ID 必须是应用级，不是项目级**——错配会导致接口调用报错
2. 多模块工程必须把 `client_id` metadata 配置到 `type=entry` 的模块
3. **必须在 AGC 申请 `quickLoginMobilePhone` scope**，否则一键登录无手机号返回
4. 匿名手机号格式：中国大陆无区号前缀；其他国家/地区默认含国际区号
5. 完整手机号、UnionID、OpenID 只能在 **app 服务端** 用 authorization code 换取，客户端仅拿到 code 与匿名手机号
6. 环境要求：DevEco Studio 6.0.0 Release+、HarmonyOS 6.0.0 Release SDK+，最低 Compatible SDK 6.0.0(20)
7. HarmonyOS 5.0.0(API 12) 版 Account Kit 文档（account-kit-guide-V5）已归档不再维护，新项目按 6.0.0 接入
8. 官方 Codelab 网页示例代码区显示 "No Preview"，完整 ArkTS 实现须下载官方 zip 源码

## 组合提示

- 与 `harmonyos-arkui` 声明式 UI 配合构建登录页 UI
- 服务端用拿到的 authorization code 调华为 OAuth `/oauth2/v3/token` + 用户信息接口换取完整手机号 / UnionID / OpenID
- 多端登录状态同步：UnionID 在同一开发者账号下跨应用稳定
- 与 `huawei-account-kit`（Android 侧）作为姊妹 skill，双端打通时两套代码并存
