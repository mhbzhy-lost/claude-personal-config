---
name: unreal5-packaging-export
description: Unreal Engine 5 项目的 Cook/Package/Stage 流水线与 iOS、Android 打包导出实操要点
tech_stack: [unreal5]
language: [cpp]
capability: [native-lifecycle]
version: "unreal-engine unversioned"
collected_at: 2026-04-19
---

# Unreal Engine 5 打包与发布（Packaging & Export）

> 来源：
> - https://dev.epicgames.com/documentation/en-us/unreal-engine/sharing-and-releasing-projects-for-unreal-engine
> - https://dev.epicgames.com/documentation/en-us/unreal-engine/packaging-ios-projects-in-unreal-engine
> - https://dev.epicgames.com/documentation/en-us/unreal-engine/packaging-android-projects-in-unreal-engine

## 用途
把 UE5 项目产出为可分发的平台包（iOS `.ipa`、Android `.apk` / `.aab`），覆盖 Cook → Package → Stage → Deploy 全流程与平台特定的证书、SDK、构建配置。

## 何时使用
- 需要产出真机可安装的测试包（Development）或商店上架包（Shipping）
- 配置 iOS 证书 / provisioning / Bundle ID，或搭建 Windows 下的 Remote Build 到 Mac
- 配置 Android SDK / NDK / JDK、选择 ABI（ARM64 / ARMv7）、在 APK 与 AAB 之间抉择
- 配置 SigningConfig、Gradle、纹理压缩格式（ETC2 / ASTC / DXT）

## 核心流水线：Cook → Package → Stage → Deploy

| 阶段 | 作用 |
|------|------|
| **Cook** | 把 `.uasset` 转成目标平台专用二进制格式（着色器、纹理、音频） |
| **Package** | 把 cooked 内容打入 pak / IoStore 容器，链接平台可执行文件 |
| **Stage** | 组装最终目录结构（可执行文件 + 内容 + 启动脚本） |
| **Deploy** | 推送到真机或商店（adb install / Xcode / Google Play / App Store） |

触发入口：
- `File → Package Project → <Platform>`（Editor 一键）
- `Project Launcher`（精细控制 cook/stage/deploy 每一步）
- `RunUAT BuildCookRun ...`（CI 命令行）

## Build Configuration

| 配置 | 用途 | 特征 |
|------|------|------|
| **Development** | 日常测试 | 含调试符号、日志、控制台命令，体积大、性能一般 |
| **Shipping** | 商店发布 | 剥离调试、关闭日志/控制台、最佳性能，最终产物 |
| Debug / DebugGame | 引擎/游戏代码调试 | 最慢，用于定位 C++ 崩溃 |
| Test | 性能剖析 | 接近 Shipping 但保留部分统计 |

切换位置：`Project Settings → Platforms → <Platform> → Packaging → Build Configuration`，或 Project Launcher 里选择 Build Configuration。

## iOS 打包

### 前置条件
- **Mac**：安装 Xcode + Command Line Tools，登录 Apple Developer 账号获取证书与 Provisioning Profile。
- **Windows**：通过 **Remote Build** 连接一台 Mac（SSH + rsync），`Project Settings → iOS → Build → Remote Server Name / RSync User Name / SSH Private Key Path`。
- 真机必须在 Provisioning Profile 设备列表内。

### 关键配置（Project Settings → Platforms → iOS）
| 项 | 说明 |
|----|------|
| **Bundle Identifier** | 必须与 App ID / Provisioning Profile 匹配，形如 `com.company.product`，`[PROJECT_NAME]` 会被替换 |
| **Bundle Display Name / Bundle Name** | 主屏幕显示名 |
| **Import Certificate** | 导入 `.p12` 开发/发布证书 |
| **Import Provisioning** | 导入 `.mobileprovision`，区分 Development 与 Distribution |
| **Minimum iOS Version** | 设备最低系统版本，影响 Metal / Shader 路径 |
| **Supports arm64** | 现代 iOS 必须启用 |

### 打包步骤
1. 连接 iOS 设备到电脑（可选，仅一键部署需要）。
2. Editor → `File → Package Project → iOS`，选择输出目录。
3. Windows 会把工作提交到 Remote Mac，完成后回传 `.ipa`。
4. 安装 `.ipa`：
   - macOS：Xcode → `Window → Devices and Simulators → +` 选择 `.ipa`。
   - Windows：使用 iTunes / 第三方工具或 `ios-deploy`（Mac 侧）。

### 常见陷阱
- **Bundle ID 不匹配 Provisioning Profile** → 签名失败，必须严格一致。
- **Remote build 失败**：检查 Mac 上 Xcode 已启动过一次并同意了许可；SSH key 需 RSA 且无 passphrase。
- **证书/Profile 过期**：Apple 证书 1 年有效期，需定期重新导入。
- Shipping 必须使用 Distribution 证书 + App Store / Ad-Hoc Provisioning；Development 证书仅供开发测试。

## Android 打包

### 前置条件
- 安装 **Android Studio**，并通过 UE 自带 `SetupAndroid.bat`（Win）/ `SetupAndroid.command`（Mac）安装匹配 UE5 版本的 **SDK / NDK / JDK**（UE5 对版本有硬性要求，不要用最新版手动装）。参考 "Setting up Android SDK and NDK" 与 Android Quick Start。
- 设备开启 **开发者模式 + USB 调试**，接受 SDK license agreement。
- 项目模板建议选 Third Person + Target Platform = Mobile + Scalable 质量起步。

### 关键配置（Project Settings → Platforms → Android）
| 项 | 说明 |
|----|------|
| **Android Package Name** | `com.YourCompany.[PROJECT_NAME]`，发布到 Play Store 后不可改 |
| **Minimum / Target SDK Version** | Google Play 对 Target SDK 有下限（逐年提升） |
| **Support arm64 / Support armv7** | 上架 Play Store 必须带 **arm64**；armv7 可选以兼容旧机 |
| **Build Configuration** | Development / Shipping 切换 |
| **Package game data inside .apk** | 小项目可开；>100MB 通常关闭并用 OBB 或 AAB |
| **Generate Bundle (AAB)** | 开启后产出 `.aab`（Play Store 要求） |
| **Distribution Signing → SigningConfig** | 配置 keystore 路径、别名、密码；Shipping 必须用正式 keystore，Development 用自动生成的 debug.keystore |

keystore 生成：`keytool -genkey -v -keystore my.keystore -alias myalias -keyalg RSA -keysize 2048 -validity 10000`，填入 `Project Settings → Android → Distribution Signing`。

### 纹理格式选择
| 格式 | 场景 |
|------|------|
| **ETC2** | 所有 OpenGL ES 3.x 设备，首选通用格式，支持 alpha |
| **ASTC** | 现代设备最佳画质，可调 block size，优先用于高端发布 |
| DXT | 仅 Nvidia Tegra，现代项目可忽略 |
| ETC1 / ETC1a | 旧版兼容，已基本淘汰 |

发布到 Play Store 时通常启用 AAB + ASTC 作为主格式并保留 ETC2 回落。

### 打包步骤（APK）
1. `Project Settings → Platforms → Android → Build Configuration` 选择 Development 或 Shipping。
2. `File → Package Project → Android → Android (ETC2)`（或 ASTC）。
3. 选择输出目录（建议创建 `AndroidBuilds/`）。
4. 产物：
   - `*.apk`
   - `Install_[Project]_[Config].bat` / `.command` / `.sh`（按平台）
   - `Uninstall_[Project]_[Config]` 对应脚本
5. 设备连接后双击 Install 脚本（底层调用 `adb install`）；排查连通性用 `adb devices`。

### 打包步骤（AAB for Play Store）
1. `Project Settings → Android → App Bundles → Generate Bundle (AAB) = true`。
2. 可选：`Generate Universal APK from Bundle`、`Enable ABI Split`、`Enable language split`、`Enable density split`（全开=最小分发包，全关=最大 APK）。
3. 正常 Package Project → Android，同时产出 `.aab`（上传 Play）+ 通用 `.apk`（本机测试）。
4. **限制**：AAB 不支持 OBB；单设备 APK 上限 150 MB（比旧 100 MB 宽松）。

### APK vs AAB 决策
- **上架 Google Play** → 必须 AAB。
- **侧载 / 企业内分发 / 第三方商店** → APK 更直接。
- **超大包（>150MB 单 APK）** → 必须 AAB + ABI/density split，或改走 Play Asset Delivery。

### 常见陷阱
- **SDK/NDK/JDK 版本错配** 是最常见失败原因；务必用 UE5 官方 `SetupAndroid` 脚本，不要手动升 NDK。
- 未勾选 arm64 上传 Play Store 会被拒（Google Play 64-bit 要求）。
- Shipping 打包前忘记切换 keystore，debug 签名包不能上架。
- AAB + OBB 不能共存，资源需整合进 pak 或走 Play Asset Delivery。
- 纹理格式变更会触发全量 re-cook，耗时较长。

## 命令行打包（CI 场景）
```bash
# iOS（macOS）
RunUAT.sh BuildCookRun -project=/path/MyGame.uproject \
  -platform=IOS -clientconfig=Shipping \
  -cook -stage -package -archive \
  -archivedirectory=/path/out

# Android AAB
RunUAT.bat BuildCookRun -project=C:\MyGame.uproject ^
  -platform=Android -cookflavor=ASTC -clientconfig=Shipping ^
  -cook -stage -package -archive -archivedirectory=C:\out
```

## 组合提示
- 搭配 `unreal5-project-settings`、`unreal5-asset-cooking` 深入配置 `DefaultEngine.ini` / `DefaultGame.ini`。
- 搭配 `unreal5-mobile-optimization` 做 Shipping 前的性能与包体裁剪。
- CI/CD 场景配合 `unreal5-automation-tool`（UAT / BuildGraph）实现无人值守流水线。
