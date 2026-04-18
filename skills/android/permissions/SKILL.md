---
name: android-permissions
description: Android 运行时权限申请 + Activity Result API 用法与最佳实践
tech_stack: [android]
language: [kotlin, java]
capability: [native-device]
version: "Android permissions guide unversioned (covers API 23 / 29 / 30 / 33)"
collected_at: 2026-04-18
---

# Android 权限（Runtime Permissions + Activity Result）

> 来源：https://developer.android.com/guide/topics/permissions/overview , https://developer.android.com/training/permissions/requesting , https://developer.android.com/training/basics/intents/result

## 用途
Android 6.0 (API 23)+ 对 dangerous 权限（定位、麦克风、相机、联系人等）必须运行时申请。推荐用 AndroidX `registerForActivityResult` + `RequestPermission` 契约发起请求，避免手写 request code。

## 何时使用
- 访问 restricted data（联系人、位置、相机图像、麦克风）
- 触发 restricted actions（录音、连接已配对蓝牙）
- 从其他 Activity 取结果（拍照、选图、选铃声）→ 用 Activity Result API
- 安装时权限（normal / signature）只需在 manifest 声明，**不需要**运行时申请

## 基础用法

**完整三分支申请流程**
```kotlin
val requestPermissionLauncher =
    registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) performAction() else showDegraded()
    }

when {
    ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
        == PackageManager.PERMISSION_GRANTED -> performAction()

    ActivityCompat.shouldShowRequestPermissionRationale(this, Manifest.permission.CAMERA) ->
        showInContextUI { requestPermissionLauncher.launch(Manifest.permission.CAMERA) }

    else -> requestPermissionLauncher.launch(Manifest.permission.CAMERA)
}
```

**多权限**
```kotlin
val launcher = registerForActivityResult(
    ActivityResultContracts.RequestMultiplePermissions()
) { results: Map<String, Boolean> -> /* ... */ }

launcher.launch(arrayOf(
    Manifest.permission.CAMERA,
    Manifest.permission.RECORD_AUDIO
))
```

**其他 Activity Result 契约**
```kotlin
val getContent = registerForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
    // handle selected content
}
selectButton.setOnClickListener { getContent.launch("image/*") }
```

## 关键 API

**权限检查**
- `ContextCompat.checkSelfPermission(ctx, perm)` → `PERMISSION_GRANTED` / `PERMISSION_DENIED`
- `ActivityCompat.shouldShowRequestPermissionRationale(act, perm)`：是否应展示教育性 UI

**Activity Result API**
- `registerForActivityResult(contract, callback): ActivityResultLauncher<I>`
- 内置契约：`RequestPermission`、`RequestMultiplePermissions`、`GetContent`、`TakePicture`、`TakePicturePreview`、`PickContact`、`StartActivityForResult`、`StartIntentSenderForResult`
- 自定义契约：继承 `ActivityResultContract<I, O>`，实现 `createIntent()` / `parseResult()`，可选 `getSynchronousResult()`

**权限声明（Manifest）**
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" /> <!-- API 29+ -->

<service android:name="..." android:foregroundServiceType="location" />  <!-- API 29+ -->
```

**撤销权限（API 33+）**
```kotlin
revokeSelfPermissionsOnKill(listOf(
    Manifest.permission.CAMERA,
    Manifest.permission.RECORD_AUDIO
))
```

**ADB 测试**
```
adb shell pm list permissions -d -g
adb shell pm grant|revoke <pkg> <perm>
adb shell install -g <apk>    # 安装时授予全部运行时权限
adb shell pm clear-permission-flags <pkg> <perm> user-set user-fixed
```

## 注意事项
- **`registerForActivityResult()` 必须在 Activity/Fragment 创建前注册**（类字段或 `onCreate` 之前作为属性），但 launcher 只能在 Lifecycle 到达 `CREATED` 后 `launch()`
- 使用 `ActivityResultRegistry` 直接注册时，优先选带 `LifecycleOwner` 的重载，自动在生命周期销毁时注销
- Android 11 (API 30)+：定位/麦克风/相机多了"仅此一次"选项，Activity 不可见后一小段时间内可继续访问，前台服务在可见期间启动可延长至服务停止
- Android 11+：应用长期未使用会自动重置运行时权限（auto-reset）
- 电话 / 短信权限类应用发布到 Play Store 前，需先让用户把 app 设为该功能的"默认处理器"
- 最佳实践：**在用户触发相关功能时**就近申请；不要 app 启动就索要所有权限；被拒后降级而非阻断
- 回调可能在 recreate 后重放：确保回调幂等
- 旧 API `requestPermissions()` + `onRequestPermissionsResult()` 仍可用，但新项目应优先 Activity Result API

## 组合提示
- 与 Jetpack Compose：`rememberLauncherForActivityResult(RequestPermission()) { ... }`
- 与 Accompanist Permissions（Compose）：声明式 `rememberPermissionState`
- 与前台服务：Android 10+ 的 `foregroundServiceType` 必须与请求的权限匹配
