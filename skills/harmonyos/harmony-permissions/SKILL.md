---
name: harmony-permissions
description: "HarmonyOS 权限管理：声明、分级、动态申请、常用权限速查、沙箱机制。"
tech_stack: [harmonyos, mobile-native]
language: [arkts]
---

# HarmonyOS 权限与安全

> 来源：https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/request-user-authorization
> 版本基准：HarmonyOS 5 / API 12+

## 用途

HarmonyOS 通过 APL（Ability Privilege Level）分级 + 授权类型（system_grant / user_grant）双维度控制应用对敏感资源的访问，配合应用沙箱实现数据隔离。

## 何时使用

- 应用需要访问网络、相机、麦克风、位置、日历、联系人、媒体文件等受保护资源
- 需要在 module.json5 中声明权限以通过应用市场审核
- 运行时弹窗请求用户授权（user_grant 类权限）
- 处理用户拒绝授权后的引导逻辑
- 理解应用文件目录的沙箱隔离与加密分区

## 权限分级

### APL 等级（由低到高）

| APL 等级 | 说明 | 适用应用 |
|-----------|------|----------|
| **normal** | 风险较低，访问常规系统资源 | 普通三方应用（默认） |
| **system_basic** | 涉及基础系统服务（系统设置、身份认证等） | 预置应用 / 特权应用 |
| **system_core** | 访问操作系统核心资源 | 系统核心服务 |

应用只能申请 **<= 自身 APL 等级** 的权限。三方应用默认 normal，只能使用 normal 级别权限。

### 授权类型

| 类型 | 说明 | 开发者操作 |
|------|------|-----------|
| **system_grant** | 安装时系统自动授予 | 仅需在 module.json5 声明 |
| **user_grant** | 运行时需用户手动确认 | 声明 + 调用动态申请 API |

## 静态声明（module.json5）

在 `module.json5` 的 `module.requestPermissions` 数组中声明所需权限：

```json
{
  "module": {
    "requestPermissions": [
      {
        "name": "ohos.permission.CAMERA",
        "reason": "$string:camera_reason",
        "usedScene": {
          "abilities": ["EntryAbility"],
          "when": "inuse"
        }
      },
      {
        "name": "ohos.permission.MICROPHONE",
        "reason": "$string:microphone_reason",
        "usedScene": {
          "abilities": ["EntryAbility"],
          "when": "inuse"
        }
      },
      {
        "name": "ohos.permission.INTERNET"
      }
    ]
  }
}
```

**字段说明**：

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | 权限名，`ohos.permission.*` |
| `reason` | user_grant 时必填 | 申请原因，必须用 `$string:xxx` 资源引用 |
| `usedScene.abilities` | 否 | 使用该权限的 Ability 列表 |
| `usedScene.when` | 否 | `"inuse"`（前台）/ `"always"`（前后台） |

> system_grant 权限只需声明 name 即可，无需 reason 和 usedScene。

## 动态权限申请

核心模块：`@kit.AbilityKit` 中的 `abilityAccessCtrl`。

### 完整流程代码

```typescript
import { abilityAccessCtrl, bundleManager, common, Permissions } from '@kit.AbilityKit';

// ---- 1. 检查权限是否已授予 ----
function checkPermission(permission: Permissions): boolean {
  const atManager = abilityAccessCtrl.createAtManager();
  const bundleInfo = bundleManager.getBundleInfoForSelfSync(
    bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_APPLICATION
  );
  const tokenId = bundleInfo.appInfo.accessTokenId;
  const status = atManager.checkAccessTokenSync(tokenId, permission);
  return status === abilityAccessCtrl.GrantStatus.PERMISSION_GRANTED;
}

// ---- 2. 动态申请权限 ----
async function requestPermissions(
  context: common.UIAbilityContext,
  permissions: Permissions[]
): Promise<boolean> {
  // 先过滤已授予的
  const needRequest = permissions.filter(p => !checkPermission(p));
  if (needRequest.length === 0) return true;

  const atManager = abilityAccessCtrl.createAtManager();
  const result = await atManager.requestPermissionsFromUser(context, needRequest);

  // authResults: 0=granted, -1=denied
  return result.authResults.every(r => r === 0);
}

// ---- 3. 在页面中使用 ----
@Entry
@Component
struct CameraPage {
  async onPageShow() {
    const context = getContext(this) as common.UIAbilityContext;
    const granted = await requestPermissions(context, [
      'ohos.permission.CAMERA' as Permissions,
      'ohos.permission.MICROPHONE' as Permissions,
    ]);
    if (!granted) {
      // 权限被拒，展示引导提示或跳转设置
      this.handleDenied(context);
    }
  }

  private handleDenied(context: common.UIAbilityContext) {
    // 二次引导：调用 requestPermissionOnSetting 拉起权限设置半模态弹窗
    const atManager = abilityAccessCtrl.createAtManager();
    atManager.requestPermissionOnSetting(context, [
      'ohos.permission.CAMERA' as Permissions,
    ]);
  }

  build() {
    Column() {
      Text('相机页面')
    }
  }
}
```

### 关键 API 速查

| API | 说明 |
|-----|------|
| `abilityAccessCtrl.createAtManager()` | 创建权限管理器实例 |
| `atManager.checkAccessTokenSync(tokenId, permission)` | 同步校验权限，返回 `GrantStatus` |
| `atManager.requestPermissionsFromUser(context, permissions)` | 拉起授权弹窗，返回 `PermissionRequestResult` |
| `atManager.requestPermissionOnSetting(context, permissions)` | 用户拒绝后拉起设置页半模态弹窗 |
| `bundleManager.getBundleInfoForSelfSync(flag)` | 获取当前应用 bundleInfo（含 accessTokenId） |

## 常用权限速查表

### 网络

| 权限字符串 | 说明 | APL | 授权方式 |
|-----------|------|-----|---------|
| `ohos.permission.INTERNET` | 访问网络 | normal | system_grant |
| `ohos.permission.GET_NETWORK_INFO` | 获取网络信息 | normal | system_grant |

### 相机 / 麦克风

| 权限字符串 | 说明 | APL | 授权方式 |
|-----------|------|-----|---------|
| `ohos.permission.CAMERA` | 使用相机 | normal | user_grant |
| `ohos.permission.MICROPHONE` | 使用麦克风 | normal | user_grant |

### 位置

| 权限字符串 | 说明 | APL | 授权方式 |
|-----------|------|-----|---------|
| `ohos.permission.LOCATION` | 精确位置 | normal | user_grant |
| `ohos.permission.APPROXIMATELY_LOCATION` | 模糊位置 | normal | user_grant |

> 申请精确位置时必须同时声明模糊位置权限。

### 日历

| 权限字符串 | 说明 | APL | 授权方式 |
|-----------|------|-----|---------|
| `ohos.permission.READ_CALENDAR` | 读取日历 | normal | user_grant |
| `ohos.permission.WRITE_CALENDAR` | 写入日历 | normal | user_grant |

### 联系人

| 权限字符串 | 说明 | APL | 授权方式 |
|-----------|------|-----|---------|
| `ohos.permission.READ_CONTACTS` | 读取联系人 | system_basic | system_grant |
| `ohos.permission.WRITE_CONTACTS` | 写入联系人 | system_basic | system_grant |

> 联系人权限为 system_basic 级别，普通三方应用无法直接使用。需通过 Picker 等系统代理方式间接访问。

### 媒体文件

| 权限字符串 | 说明 | APL | 授权方式 |
|-----------|------|-----|---------|
| `ohos.permission.READ_IMAGEVIDEO` | 读取图片/视频 | system_basic | user_grant |
| `ohos.permission.WRITE_IMAGEVIDEO` | 写入图片/视频 | system_basic | user_grant |

> 三方应用推荐使用 PhotoAccessHelper 的 Picker 模式访问用户图片/视频，无需申请媒体权限。

## 应用沙箱与文件访问

### 沙箱隔离原则

- 每个应用拥有独立沙箱目录，仅能看到自身文件 + 少量必要系统文件
- 应用间无法直接访问对方文件，物理路径被隔离屏蔽
- 访问用户文件必须通过系统 Picker / 授权 API

### 加密分区

| 分区 | 解锁条件 | 典型用途 | 路径前缀 |
|------|---------|---------|---------|
| **EL1** | 开机即可访问 | 闹钟铃声、壁纸 | `/data/storage/el1/` |
| **EL2** | 首次解锁屏幕后 | 聊天记录、私密照片（**默认**） | `/data/storage/el2/` |

### 通过 Context 获取沙箱路径

```typescript
import { common } from '@kit.AbilityKit';

const context = getContext(this) as common.UIAbilityContext;

context.filesDir       // 持久化文件  /data/storage/el2/base/haps/entry/files
context.cacheDir       // 缓存文件    /data/storage/el2/base/haps/entry/cache
context.tempDir        // 临时文件    /data/storage/el2/base/haps/entry/temp
context.databaseDir    // 数据库文件  /data/storage/el2/database
context.preferencesDir // 首选项文件  /data/storage/el2/base/preferences
```

> Context 默认指向 EL2 分区。如需 EL1 路径（开机即用场景），需修改 Context 的 area 属性。

## 常见陷阱

1. **reason 必须是资源引用**：user_grant 权限的 reason 字段必须使用 `$string:xxx` 格式，写死中文字符串会导致审核不通过。
2. **位置权限成对声明**：申请 `LOCATION`（精确）必须同时声明 `APPROXIMATELY_LOCATION`（模糊），否则申请失败。
3. **二次弹窗不再出现**：用户在 `requestPermissionsFromUser` 弹窗中选择"不允许"后，再次调用该接口不会弹窗。必须改用 `requestPermissionOnSetting()` 引导用户在设置中手动开启。
4. **system_basic 权限三方不可用**：联系人、媒体文件等 system_basic 权限，普通三方应用无法直接申请。应使用系统提供的 Picker（PhotoAccessHelper、Contact Picker）间接访问。
5. **每次操作前都要校验**：即使之前已授权，用户可能随时在设置中撤销。每次访问受保护资源前应调用 `checkAccessTokenSync` 校验。
6. **沙箱路径 vs 真实路径**：应用拿到的路径是沙箱虚拟路径，不可直接拼接其他应用的路径或假设物理路径结构。
7. **默认 EL2 分区**：Context 默认使用 EL2 加密分区。如果在设备未解锁时需要读写数据（如闹钟场景），必须显式切换到 EL1。
