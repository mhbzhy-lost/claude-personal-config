---
name: harmonyos-ohpm-cli
description: HarmonyOS ohpm 包管理器 CLI 命令全集、oh-package.json5 字段语义、依赖解析与常见安装失败排查
tech_stack: [harmonyos]
language: [typescript]
capability: [ci-cd]
version: "HarmonyOS unversioned"
collected_at: 2025-01-01
---

# ohpm — HarmonyOS 包管理器

> Source: https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-ohpm-cli, https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-ohpm-install, https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-ohpmrc, https://ohpm.openharmony.cn/

## Purpose
ohpm（OpenHarmony Package Manager）是 HarmonyOS/OpenHarmony 的官方包管理器，对标 npm/pnpm。管理 HAR/HSP 等三方库依赖，提供 install、search、publish 等完整生命周期命令，配置文件为 oh-package.json5（JSON5 格式）。

## When to Use
- 新建项目后首次安装依赖
- 添加/升级/移除三方库（如 `@ohos/lottie`）
- 排查依赖安装失败：版本冲突、registry 不可达、scope 映射缺失
- CI 流水线中自动化依赖安装
- 搭建企业内网 ohpm registry 代理
- 发布自研 HAR/HSP 到三方库中心仓

## Basic Usage

```bash
# 初始化
ohpm init                          # 生成 oh-package.json5

# 安装依赖
ohpm install                       # 安装全部依赖
ohpm install @ohos/lottie          # 安装指定包
ohpm install @ohos/lottie@1.0.0    # 指定版本
ohpm install --save-dev @ohos/xxx  # 开发依赖

# 搜索与查看
ohpm search lottie                 # 搜索中心仓
ohpm list                          # 列出已安装依赖树

# 更新与移除
ohpm update                        # 更新所有依赖
ohpm uninstall @ohos/lottie        # 移除依赖

# 发布
ohpm publish                       # 发布到 registry

# 配置
ohpm config set registry http://nexus.example.com/repository/ohpm-releases/
ohpm config get registry
```

## Key APIs (Summary)

**oh-package.json5 核心字段**：`dependencies`（运行时依赖，key=包名 value=版本约束）、`devDependencies`、`dynamicDependencies`（条件导入）、`overrides`（强制统一子依赖版本）。

**ohpmrc 关键配置**：`registry`（默认源）、`@scope:registry`（按 scope 指定源）、`strict_ssl`、`cache`。

**依赖解析**：oh-package-lock.json5 锁定版本，oh_modules 目录布局类似 node_modules 但遵循 HarmonyOS 模块解析规则。

## Caveats
- **JSON5 格式**：oh-package.json5 支持注释和尾逗号，不能用标准 JSON 解析器处理
- **lock 文件**：oh-package-lock.json5 不应手动编辑
- **安装失败排查**：① registry 不可达 → `ohpm config get registry` 确认；② 版本不存在 → `ohpm search <pkg>` 验证；③ scope 映射缺失 → 检查 ohpmrc 中 `@scope:registry`；④ 本地缓存损坏 → 清除 cache 目录重试
- **日志诊断**：加 `--loglevel silly` 获取详细输出定位问题
- **企业内网**：必须配置 ohpmrc 的 registry 和认证 token，否则 install 超时

## Composition Hints
- 与 **harmonyos-hvigor-build** 集成：hvigor 构建前自动调用 `ohpm install`，依赖缺失会导致构建失败
- 与 **harmonyos-ohpm-plugin** 协同：自定义插件可 hook install/publish 生命周期
- oh_modules 目录结构是 hvigor 编译路径的一部分，手动修改 oh_modules 会导致构建不一致
