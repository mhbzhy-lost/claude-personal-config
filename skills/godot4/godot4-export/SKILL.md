---
name: godot4-export
description: Godot 4 项目多平台导出指南，覆盖 Export Preset / Export Template、桌面三端、iOS 与 Android 签名发布要点
tech_stack: [godot4]
language: [gdscript]
capability: [native-lifecycle]
version: "Godot Engine 4.6"
collected_at: 2026-04-19
---

# Godot 4 项目导出（多平台）

> 来源：
> - https://docs.godotengine.org/en/stable/tutorials/export/index.html
> - https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_ios.html
> - https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_android.html

## 用途
把 Godot 4 项目打包成 Windows / macOS / Linux / Android / iOS / Web 可分发产物，并完成平台签名、权限与商店上架前置条件配置。

## 何时使用
- 首次为项目配置 Export Preset（每个平台一个 preset）
- 准备 App Store / Google Play 发布包
- 切换 iOS provisioning profile、Android keystore、Team ID 等签名参数
- 通过 CI/CD 注入签名凭据或脚本加密密钥（用环境变量）
- 调试"修改代码后不想重导"的 iOS 快速迭代流程

## 基础用法：Export Preset 流程

1. **安装 Export Templates**：`Editor > Manage Export Templates > Download and Install`（版本必须与编辑器版本完全一致）。
2. **新建 Preset**：`Project > Export > Add...` 选平台，填 bundle id / package name、版本号、图标、权限等。
3. **导出**：
   - `Export Project...` 生成最终产物（需填 Release 签名信息）
   - `Export PCK/ZIP...` 仅导出资源包，用于热更新或 mod
4. Feature tags（如 `mobile`、`web`、`windows`）可在 GDScript 里用 `OS.has_feature("mobile")` 做平台分支。

## 桌面三端要点（Windows / macOS / Linux）

| 平台 | 关键点 |
|------|--------|
| Windows | 可选 rcedit 注入图标/版本号；codesign 用 signtool |
| macOS | 需 `.app` 签名 + notarize（Apple ID / Team ID / App-specific password）；导出产物为 `.app`、`.dmg` 或 `.zip` |
| Linux | 产物为可执行 ELF，建议附带 `.pck`；通常无需签名 |

## iOS 导出（仅限 macOS）

**硬性前提**：macOS + Xcode + iOS Export Templates + Apple Developer 账号。不支持直接导出到 iOS Simulator（需从生成的 Xcode 工程里跑 simulator build）。

**关键 Preset 字段**：
- **App Store Team ID**：Apple Developer 10 位 Team ID，发布必填
- **Bundle Identifier**：反向域名，必须与 provisioning profile 匹配
- **Provisioning Profile UUID**：Debug/Release 各一份，可用环境变量注入（见下表）
- **Privacy Descriptions**：`NSCameraUsageDescription`、`NSMicrophoneUsageDescription`、`NSPhotoLibraryUsageDescription` 等；iOS 17+ 若使用 IDFA 还需处理 App Tracking Transparency（`NSUserTrackingUsageDescription` + `ATTrackingManager` 调用，由 iOS plugin 提供）
- **Entitlements / Background Modes / Required Device Capabilities**：按需勾选
- **Icon sets & Launch screens**：需齐全的 iOS 图标尺寸
- **iOS Plugins（.gdip）**：原生扩展（IAP、Game Center、ATT 等），必须在导出前加入 preset

**导出流程**：Godot 导出的是一个 **Xcode 工程目录**（例如 `~/godot-ios-export/`），打开 `.xcodeproj` 后在 Xcode 里 Archive → 上传 App Store Connect。

**快速迭代（避免每次重导）**：
1. 导出一次 Xcode 工程
2. Xcode → target → **Build Phases → Copy Bundle Resources** 删除现有 `.pck`
3. 新增 **Run Script** phase，脚本从 Godot 项目目录 copy 最新 `.pck` 到构建产物
4. 之后只需在 Godot 里 `Export PCK`（或让脚本触发），Xcode build 自动拾取

**iOS 环境变量**：
| 变量 | 说明 |
|------|------|
| `GODOT_SCRIPT_ENCRYPTION_KEY` | 256-bit AES，脚本加密 |
| `GODOT_IOS_PROVISIONING_PROFILE_UUID_DEBUG` | Debug provisioning profile UUID |
| `GODOT_IOS_PROVISIONING_PROFILE_UUID_RELEASE` | Release provisioning profile UUID |

**常见坑**：`xcode-select` 报错 → `sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer`。

## Android 导出

**工具链（版本必须对齐，其他版本经常踩坑）**：
- **JDK 17**（OpenJDK，非 8/11/21），例：`/usr/lib/jvm/java-17-openjdk-amd64`
- **Android SDK** 组件：
  | 组件 | 版本 |
  |------|------|
  | Platform-Tools | 35.0.0 |
  | Build-Tools | 35.0.1 |
  | Platform | 35 |
  | NDK | r28b |
  | CMake | 3.10.2.4988404 |

在 `Editor > Editor Settings > Export > Android` 设置 **Java SDK Path** 与 **Android SDK Path**，Godot 会实时校验。

**Keystore 与签名**：
```bash
keytool -v -genkey -keystore mykeystore.keystore -alias myalias -keyalg RSA -validity 10000
```
Preset 的 **Keystore** 区块填 Debug/Release 各自的 path / user(alias) / password。CI 用环境变量：`GODOT_ANDROID_KEYSTORE_{DEBUG,RELEASE}_{PATH,USER,PASSWORD}`。

**APK vs AAB**：
- 新应用上架 **Google Play 必须用 AAB**（`Export AAB` 勾选）
- 内测 / sideload 可用 APK
- Google Play 要求 64-bit 支持：默认 preset 已包含 ARMv8；如需分架构上传可分别导出 ARMv7 / ARMv8 APK 并用不同 versionCode

**Preset 关键字段**：
- Package name（反向域名，等同 iOS bundle id）
- Version Code / Version Name
- Min SDK / Target SDK（Play 当前要求 targetSdk ≥ 35）
- Permissions（Internet、Vibrate…按需勾选，不要全勾）
- Screen Orientation
- **Gradle Build**：启用后用完整 Gradle 构建（支持自定义 Android plugin / AndroidManifest 改写）；否则用内置预编译模板（更快但不可扩展）
- XR mode（VR/AR）
- 图标：Main / Adaptive Foreground+Background（Android 8+）/ Themed Monochrome（Android 13+）均需提供

## 关键 API / 入口（摘要）

- `Project > Export...` — Preset 管理主界面
- `Editor > Manage Export Templates` — 安装与编辑器匹配的模板
- `Editor > Editor Settings > Export > Android|iOS` — 工具链路径配置
- `OS.has_feature("<tag>")` — 运行期平台判断
- Export PCK/ZIP — 仅导资源包，用于 iOS 快速迭代或 mod

## 注意事项

- Export Template 版本必须与编辑器版本字节一致，否则导出报错
- iOS 导出只能在 macOS，且不支持直出 Simulator
- Android JDK 必须 17，其他版本构建失败多出自此
- Play 新应用强制 AAB，历史 APK 应用也需 AAB 更新
- Release 密码 / provisioning UUID / 脚本加密 key **只走环境变量**，不要提交到 preset 的明文字段进仓库
- iOS plugin（`.gdip`）必须在 export 前加入 preset，导出后再加不会生效
- iOS 17+ 获取 IDFA / 跨应用跟踪需 ATT 弹窗 + Info.plist 中 `NSUserTrackingUsageDescription`

## 组合提示

- 与 `godot4-project-settings` 搭配：图标、orientation、rendering driver 等需先在 Project Settings 里配
- 与平台原生 SDK 接入（Game Center / Google Play Games / IAP）搭配时用 iOS `.gdip` / Android Gradle Build + plugin
- CI/CD 场景：`godot --headless --export-release "<preset>" <output>` 配合上述环境变量做无人值守打包
