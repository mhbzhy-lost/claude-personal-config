---
name: harmony-stage-model
description: "HarmonyOS Stage 模型：UIAbility/ExtensionAbility 生命周期、Context、Want、module.json5 配置。"
tech_stack: [harmonyos]
language: [arkts]
---

# Stage 模型

> 来源：https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/application-model-description
> 版本基准：HarmonyOS 5 / API 12+

## 用途

Stage 模型是 HarmonyOS 当前推荐的应用模型，定义了应用组件（UIAbility、ExtensionAbility）的生命周期管理、进程模型和组件间通信机制。

## 何时使用

- 开发任何 HarmonyOS 应用（Stage 模型是唯一推荐模型，FA 模型已废弃）
- 需要管理多窗口、多 Ability 实例
- 需要后台任务、卡片服务、输入法等扩展能力
- 需要跨 Ability / 跨应用通信

## 应用模型概览

```
Application
 └── AbilityStage（Module 级容器，每个 HAP 一个）
      ├── UIAbility（有 UI 的组件，1:1 持有 WindowStage）
      │    └── WindowStage → Page（ArkUI 页面）
      └── ExtensionAbility（无 UI 的后台服务组件）
```

- 一个应用可包含多个 Module（HAP），每个 Module 对应一个 AbilityStage 实例
- UIAbility 是用户交互入口；ExtensionAbility 提供特定场景的后台能力
- 同类型 ExtensionAbility 运行在独立进程中

## UIAbility 生命周期

生命周期回调按以下顺序触发：

```
onCreate → onWindowStageCreate → onForeground ⇄ onBackground → onWindowStageDestroy → onDestroy
```

| 回调 | 触发时机 | 典型操作 |
|---|---|---|
| `onCreate(want, launchParam)` | 实例创建（冷启动） | 初始化变量、资源预加载 |
| `onWindowStageCreate(windowStage)` | WindowStage 创建完成 | 设置 UI 页面加载、订阅窗口事件 |
| `onForeground()` | UI 可见，切到前台 | 申请系统资源、恢复状态 |
| `onBackground()` | UI 完全不可见，切到后台 | 释放无用资源、保存状态 |
| `onWindowStageDestroy()` | WindowStage 销毁 | 释放窗口相关资源 |
| `onDestroy()` | 实例销毁 | 释放系统资源、保存数据 |

**补充回调**：
- `onNewWant(want, launchParam)` -- singleton/specified 模式下实例已存在时再次启动触发，不走 onCreate
- `onWindowStageWillDestroy(windowStage)` -- WindowStage 销毁前回调

**启动模式**（module.json5 `launchType` 字段）：

| 模式 | 说明 |
|---|---|
| `singleton` | 系统中只存在一个实例（默认） |
| `multiton` | 每次 startAbility 创建新实例 |
| `specified` | 由 AbilityStage.onAcceptWant 返回 key 决定复用或新建 |

## AbilityStage

Module 级别的组件容器，在加载该 Module 的首个 UIAbility/ExtensionAbility 之前创建。

```typescript
import { AbilityStage, Want } from '@kit.AbilityKit';

export default class MyAbilityStage extends AbilityStage {
  onCreate(): void {
    // Module 初始化：资源预加载、线程创建
  }

  onAcceptWant(want: Want): string {
    // 仅 specified 启动模式下触发
    // 返回唯一 key，系统据此判断复用已有实例还是新建
    if (want.abilityName === 'DocumentAbility') {
      return `document_${want.parameters?.docId}`;
    }
    return '';
  }
}
```

需在 module.json5 的 `srcEntry` 字段指定入口：`"srcEntry": "./ets/myabilitystage/MyAbilityStage.ets"`

## ExtensionAbility

无 UI 的后台服务组件，按场景派生为不同子类：

| 类型 | 用途 |
|---|---|
| `FormExtensionAbility` | 服务卡片（桌面小组件） |
| `ServiceExtensionAbility` | 后台常驻服务（仅系统应用可用） |
| `BackupExtensionAbility` | 数据备份与恢复 |
| `InputMethodExtensionAbility` | 输入法 |
| `WorkSchedulerExtensionAbility` | 延迟任务调度 |

三方应用最常用的是 FormExtensionAbility。ServiceExtensionAbility 仅限系统应用。

## Want 与 Ability 间通信

Want 是组件间信息传递的载体，分为显式 Want 和隐式 Want。

### 显式 Want（指定目标）

```typescript
import { Want } from '@kit.AbilityKit';
import { common } from '@kit.AbilityKit';

// 在页面中获取 context
const context = getContext(this) as common.UIAbilityContext;

const want: Want = {
  bundleName: 'com.example.myapp',
  abilityName: 'TargetAbility',
  parameters: {
    docId: '12345',
    title: '我的文档'
  }
};
context.startAbility(want);
```

### 隐式 Want（按能力匹配）

```typescript
const want: Want = {
  action: 'ohos.want.action.viewData',
  entities: ['entity.system.default'],
  uri: 'https://example.com',
  type: 'text/html'
};
context.startAbility(want);
```

### 获取返回结果

```typescript
const result = await context.startAbilityForResult(want);
// result.resultCode / result.want?.parameters
```

### Want 核心字段

| 字段 | 说明 |
|---|---|
| `bundleName` | 目标应用包名 |
| `abilityName` | 目标 Ability 名（显式必填） |
| `moduleName` | 目标模块名（跨模块时需要） |
| `action` | 操作类型（隐式匹配用） |
| `entities` | Ability 类别（隐式匹配用） |
| `uri` | 资源标识 |
| `parameters` | 自定义键值对数据（Record<string, Object>） |

## Context 上下文

Stage 模型的 Context 按层级划分：

```
BaseContext
 └── Context（通用能力：resourceManager、applicationInfo）
      ├── ApplicationContext（应用级：注册生命周期监听、获取全局配置）
      ├── AbilityStageContext（Module 级：获取 ModuleInfo、HapInfo）
      ├── UIAbilityContext（Ability 级：startAbility、terminateSelf）
      └── ExtensionContext → ServiceExtensionContext 等
```

**获取方式**：
- UIAbility 内：`this.context`（UIAbilityContext）
- ArkUI 页面中：`getContext(this) as common.UIAbilityContext`
- 全局事件监听：`context.getApplicationContext()`

**UIAbilityContext 常用方法**：`startAbility()`、`startAbilityForResult()`、`terminateSelf()`、`terminateSelfWithResult()`、`setMissionLabel()`

## module.json5 配置

```jsonc
{
  "module": {
    "name": "entry",
    "type": "entry",               // entry | feature | shared
    "srcEntry": "./ets/myabilitystage/MyAbilityStage.ets",
    "description": "$string:module_desc",
    "mainElement": "EntryAbility",  // 入口 Ability 名

    "abilities": [{
      "name": "EntryAbility",
      "srcEntry": "./ets/entryability/EntryAbility.ets",
      "description": "$string:entry_desc",
      "icon": "$media:icon",
      "label": "$string:entry_label",
      "launchType": "singleton",    // singleton | multiton | specified
      "exported": true,             // 是否允许跨应用调用
      "startWindowIcon": "$media:startIcon",
      "startWindowBackground": "$color:start_window_background",
      "skills": [{
        "actions": ["action.system.home"],
        "entities": ["entity.system.home"]
      }]
    }],

    "extensionAbilities": [{
      "name": "MyFormAbility",
      "srcEntry": "./ets/formability/MyFormAbility.ets",
      "type": "form",               // form | service | backup | inputMethod 等
      "metadata": [{
        "name": "ohos.extension.form",
        "resource": "$profile:form_config"
      }]
    }],

    "requestPermissions": [{
      "name": "ohos.permission.INTERNET",
      "reason": "$string:internet_reason",
      "usedScene": {
        "abilities": ["EntryAbility"],
        "when": "always"
      }
    }]
  }
}
```

**关键字段速查**：
- `abilities[].skills` -- 定义隐式 Want 匹配规则（actions/entities/uris）
- `abilities[].exported` -- false 则仅应用内可调用
- `abilities[].launchType` -- 启动模式，默认 singleton
- `extensionAbilities[].type` -- 扩展类型标识
- `requestPermissions` -- 权限声明

## 常见陷阱

1. **singleton 下重复启动不走 onCreate** -- 再次 startAbility 只触发 onNewWant，必须在 onNewWant 中处理新参数并刷新页面状态
2. **onBackground 不等于被销毁** -- 系统可能长时间保留后台实例；不要在 onDestroy 中放必须执行的逻辑，它不保证被调用
3. **ServiceExtensionAbility 三方不可用** -- 仅系统应用可使用，三方应用需改用 WorkSchedulerExtensionAbility 或后台任务 API
4. **Context 类型混淆** -- 页面中 `getContext(this)` 返回的是 UIAbilityContext，不要当作 ApplicationContext 使用；获取应用级 Context 需调用 `context.getApplicationContext()`
5. **Want parameters 类型限制** -- parameters 的 value 必须是可序列化类型（string/number/boolean/Array/Record），不能传递类实例
6. **specified 模式必须配合 AbilityStage** -- 必须实现 onAcceptWant 返回 key，否则行为等同 multiton
