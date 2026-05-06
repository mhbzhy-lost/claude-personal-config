---
name: harmonyos-ohpm-plugin
description: ohpm 自定义插件机制：hooks 类型（preInstall/postInstall/prePublish）、oh-package.json5 插件声明、hvigor task 注入、oh_modules 目录布局、插件调试手段（--loglevel silly）
tech_stack: [harmonyos]
language: [javascript, arkts]
capability: [ci-cd, observability]
version: "HarmonyOS unversioned"
collected_at: 2025-01-15
---

# ohpm 自定义插件机制

> Source: https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-ohpm-repo-plugin-configuration, https://developer.huawei.com/consumer/cn/doc/harmonyos-guides-V5/ide-hvigor-plugin-V5, https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-ohpm-install, https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-ohpmrc

## Purpose

ohpm 插件允许开发者在包管理生命周期（安装、发布）中注入自定义逻辑，并与 hvigor 构建系统集成。本技能覆盖插件声明、三种 hooks 的使用场景、插件注入 hvigor task 的机制、oh_modules 目录布局解析，以及插件不生效时的排查手段。

## When to Use

- 在 `ohpm install` 后自动执行代码生成（如从 proto 生成 TS 类型）
- 安装依赖前校验许可证、版本兼容性
- 发布前自动跑测试、lint 检查、changelog 生成
- 开发团队内部复用的 ohpm 插件包
- 插件安装后不生效，需要调试 hook 执行流程

## Basic Usage

### 1. 插件声明（oh-package.json5）

在插件包的 `oh-package.json5` 中声明 hook 入口：

```json5
{
  "name": "@your-scope/ohpm-plugin-codegen",
  "version": "1.0.0",
  "description": "代码生成插件",
  "plugins": {
    "install": "./lib/hooks/install.js",    // 安装阶段 hooks
    "publish": "./lib/hooks/publish.js"     // 发布阶段 hooks
  }
}
```

插件模块需导出对应的 hook 函数：

```javascript
// lib/hooks/install.js
module.exports = {
  preInstall: async function(context) {
    // 在依赖解析之后、下载之前执行
    // 可校验依赖合法性、拒绝安装
    console.log('preInstall hook triggered');
  },

  postInstall: async function(context) {
    // 在依赖全部安装完成后执行
    // 可生成代码、复制资源、修改配置
    console.log('postInstall hook triggered');
  }
};
```

### 2. 三种 Hooks 详解

| Hook | 触发时机 | 典型用途 | 异常行为 |
|------|----------|----------|----------|
| `preInstall` | 依赖解析后、下载前 | 许可证校验、版本白名单检查、安全审计 | 抛出异常会**阻止整个安装** |
| `postInstall` | 所有依赖安装完成后 | 代码生成、资源拷贝、配置文件注入、符号链接 | 异常会打印警告但不会回滚安装 |
| `prePublish` | 打包发布前 | 测试运行、lint 检查、changelog 校验、包大小检查 | 抛出异常会**阻止发布** |

`context` 对象包含以下关键字段：

- `context.packageInfo` — 当前包的 name、version、dependencies 等元信息
- `context.rootPath` — 项目根目录绝对路径
- `context.ohModulesPath` — oh_modules 目录路径
- `context.loglevel` — 当前日志级别

### 3. 注入 hvigor Task

ohpm 插件可以通过 hvigor 的插件机制将自定义构建 task 注入构建生命周期：

```typescript
// hvigorfile.ts（在消费方的项目中）
import { hvigor } from '@ohos/hvigor';
import { MyOhpmPlugin } from '@scope/ohpm-plugin-codegen';

export default {
  system: hvigor,
  plugins: [
    MyOhpmPlugin({
      // 插件配置
      codegenDir: './src/main/ets/generated'
    })
  ]
};
```

hvigor 插件开发侧（插件包的 hvigorfile.ts）：

```typescript
// 插件内部注册 hvigor task
import { HvigorPlugin, HvigorNode } from '@ohos/hvigor';

export function MyOhpmPlugin(config: any): HvigorPlugin {
  return {
    pluginId: 'my-codegen-plugin',

    async apply(node: HvigorNode) {
      // 注册一个在编译前执行的 task
      node.registerTask({
        name: 'codegen:generate',
        run: async (taskContext) => {
          // 执行代码生成逻辑
        },
        dependencies: ['default@PreBuild'],  // 在 PreBuild 之前运行
        postDependencies: []
      });
    }
  };
}
```

### 4. oh_modules 目录布局

```
项目根目录/
├── oh_modules/                    # 依赖安装根目录
│   ├── @scope/                    # scoped 包
│   │   └── pkg-a/                 # @scope/pkg-a
│   ├── pkg-b/                     # 非 scoped 包
│   ├── .ohpm-plugin/              # 已安装的插件缓存
│   │   └── @scope/ohpm-plugin-xxx/
│   └── .package-lock.json         # 依赖锁定文件
├── .ohpm/                         # ohpm 内部数据
│   ├── cache/                     # 下载缓存
│   ├── logs/                      # 安装日志（排查插件问题的关键）
│   │   └── <timestamp>-install.log
│   └── registry/                  # registry 元数据缓存
└── oh-package.json5               # 项目依赖声明
```

关键排查入口：`.ohpm/logs/` 中记录了每次安装的完整日志，包含插件的执行状态。

### 5. 插件调试三板斧

```bash
# 第一板斧：最详细日志级别
ohpm install --loglevel silly
# 输出包含：依赖解析、下载、hook 触发、hook 返回值的完整链路

# 第二板斧：查看安装日志文件
cat .ohpm/logs/*-install.log | grep -A5 "plugin"

# 第三板斧：全局设置日志级别（持久化）
ohpm config set loglevel silly
ohpm install   # 之后所有命令都输出 verbose 日志
ohpm config set loglevel info   # 恢复默认
```

常见插件不生效的排查清单：

1. `oh_modules/.ohpm-plugin/` 下是否存在你的插件 → 没有则检查 oh-package.json5 中 plugins 字段的路径是否正确
2. `.ohpm/logs/` 中是否有 hook 执行记录 → 没有则 hook 未被注册
3. hook 函数是否返回 Promise（异步操作）→ 非 Promise 的话 ohpm 不会等待
4. preInstall 异常是否被静默吞掉 → 检查 hook 中的 try-catch 是否过度

## Key APIs (Summary)

| 接口 | 位置 | 说明 |
|------|------|------|
| `plugins.install` | oh-package.json5 | 声明安装阶段 hook 入口文件路径 |
| `plugins.publish` | oh-package.json5 | 声明发布阶段 hook 入口文件路径 |
| `preInstall(context)` | 插件模块导出 | 安装前 hook，异常阻止安装 |
| `postInstall(context)` | 插件模块导出 | 安装后 hook，异常仅打印警告 |
| `prePublish(context)` | 插件模块导出 | 发布前 hook，异常阻止发布 |
| `ohpm install --loglevel silly` | CLI | 开启全量调试日志 |
| `ohpm config set loglevel` | CLI | 全局设置日志级别 |

## Caveats

- **preInstall 异常会阻止整个安装流程**，开发时注意 hook 的健壮性
- **异步 hook 必须返回 Promise**，否则 ohpm 不等待其完成，可能出现竞态
- **`--loglevel silly` 输出量巨大**（可能数千行），仅用于调试，勿在生产 CI 中使用
- **oh_modules 目录禁止手动修改**，始终通过 `ohpm install` 操作
- **hvigor 插件与 ohpm 插件的生命周期是不同的**：hvigor 插件在构建时生效，ohpm 插件在包管理时生效。两者可以共存但钩子独立
- **插件路径是相对于 oh-package.json5 所在目录的**，路径写错不会报安装错误，只是静默不触发

## Composition Hints

- 本技能聚焦**ohpm 包管理层面的插件机制**，hvigor 构建层面的插件开发请参考 `harmonyos-hvigor-build`
- 插件的 `postInstall` 常用于代码生成，需配合 `harmonyos-ohpm-cli` 理解依赖解析和安装流程
- 若插件需要修改 hvigor 构建参数（如 build-profile.json5），参考 `harmonyos-cpp-cmake` 中的 native 构建配置
- ohpmrc 配置（registry、auth）影响插件的安装来源，参考 `harmonyos-ohpm-cli` 中的 ohpmrc 章节
