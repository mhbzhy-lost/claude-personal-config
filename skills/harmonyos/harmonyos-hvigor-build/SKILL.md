---
name: harmonyos-hvigor-build
description: HarmonyOS hvigor 构建系统：hvigorw CLI、hvigorfile.ts 结构、构建生命周期与 task 依赖图、常见构建错误排查
tech_stack: [harmonyos]
language: [typescript]
capability: [ci-cd]
version: "HarmonyOS unversioned"
collected_at: 2025-01-01
---

# hvigor — HarmonyOS 构建系统

> Source: https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-hvigor-commandline, https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-hvigor-api, https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-hvigor-faqs, https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-hvigor-config-ohos-guide

## Purpose
hvigor 是 HarmonyOS/OpenHarmony 的官方构建系统，基于 TypeScript 的任务编排引擎。通过 hvigorfile.ts 定义模块构建任务，hvigorw wrapper 驱动构建，自动完成 ArkTS 编译、资源打包、native 编译（CMake）、签名对齐等全流程。

## When to Use
- 命令行构建 HAP/HAR/HSP（不依赖 DevEco Studio IDE）
- CI/CD 流水线中执行自动化构建与签名
- 排查构建错误：编译失败、签名错误、ABI 不匹配、har/hsp 找不到
- 自定义构建生命周期（注入 preBuild/postBuild hook）
- 配置 debug/release 差异化构建参数
- 调试构建性能瓶颈（task 耗时分析、OOM）
- 多模块项目的增量构建与模块级 task 执行

## Basic Usage

```bash
# 核心构建命令
hvigorw assembleHap                    # 构建 debug HAP
hvigorw -p buildMode=release assembleHap  # 构建 release HAP
hvigorw assembleHar                    # 构建 HAR 静态库
hvigorw assembleHsp                    # 构建 HSP 动态共享库

# 模块级构建
hvigorw :entry:assembleHap             # 仅构建 entry 模块

# 清理
hvigorw clean

# CI 必需参数
hvigorw --no-daemon --stacktrace assembleHap

# 调试与探查
hvigorw tasks --all                    # 列出所有 task
hvigorw --info assembleHap             # info 级别日志
hvigorw --debug assembleHap            # debug 级别日志
```

hvigorfile.ts 最小结构：

```typescript
import { hvigor } from '@ohos/hvigor-ohos-plugin';

export default {
  system: hvigor,
  plugins: [],
  module: {
    onCreate() { },
    onPreBuild(taskContext) { },
    onPostBuild(taskContext) { },
  }
};
```

## Key APIs (Summary)

**核心 CLI 参数**：`--no-daemon`（禁用守护进程，CI 必须）、`--stacktrace`（完整堆栈）、`-p key=value`（传入构建参数）、`--info/--debug`（日志级别）。

**构建生命周期**：初始化 → 配置 → 执行（task 依赖图并行调度）。无依赖 task 并行执行，有依赖按拓扑顺序串行。

**build-profile.json5 关键字段**：`app.signingConfigs`（签名）、`app.products[].targetSdkVersion`、`app.products[].buildOption.abiFilters`（`arm64-v8a` / `x86_64`）、`app.products[].buildOption.nativeBuildArgs`（透传 CMake 参数）。

## Caveats
- **hvigorw vs hvigor**：hvigorw 是 wrapper，锁定版本；直接调用全局 hvigor 可能因版本不一致导致构建失败
- **守护进程**：hvigor daemon 缓存 JVM 状态，偶发 OOM 或 stale；CI 环境必须 `--no-daemon`
- **ohpm 集成**：构建前自动调用 `ohpm install`；若网络不可达，构建会卡住 —— 先确认 registry 可达性
- **常见错误速查**：
  - 签名错误 → 检查 SigningConfig 中 storeFile 路径、密码、别名
  - ABI 不匹配 → `abiFilters` 必须与实际 `.so` 的 ABI 一致
  - har/hsp 找不到 → 确认 oh-package.json5 依赖声明正确且 registry 可达
  - OOM → 设置 `NODE_OPTIONS="--max-old-space-size=4096"` 扩大堆内存
- **错误输出截断**：务必使用 `--stacktrace`，单行报错通常不足以定位根因
- **构建性能**：合理拆分子模块可提升 task 并行度；单模块内 task 串行执行

## Composition Hints
- 与 **harmonyos-ohpm-cli** 紧密耦合：hvigor 构建前自动调用 ohpm，oh_modules 为空会导致构建失败
- 与 **harmonyos-cpp-cmake** 协同：build-profile.json5 中 nativeBuildArgs 透传到 CMake，多 ABI 构建在此配置
- 与 **harmonyos-ohpm-plugin** 集成：自定义 ohpm 插件可以注入 hvigor task，扩展构建生命周期
