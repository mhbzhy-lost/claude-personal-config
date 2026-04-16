---
name: android-ndk-cmake
description: "Android NDK + CMake 工程配置：build.gradle.kts 集成、CMakeLists.txt、ABI 管理、prefab。"
tech_stack: [android, mobile-native]
language: [cpp]
---

# Android NDK + CMake 工程配置

> 来源：https://developer.android.com/ndk/guides/cmake
> 版本基准：AGP 8.x / NDK r27+ / CMake 3.22+

## 用途

在 Android 项目中编译 C/C++ 原生代码（.so 共享库），通过 CMake 构建系统与 Gradle 集成，实现 JNI 调用、性能敏感模块、跨平台 C++ 库复用。

## 何时使用

- 项目包含 C/C++ 源码需要编译为 `.so` 供 Java/Kotlin 通过 JNI 调用
- 集成第三方 C/C++ 库（OpenCV、FFmpeg、libcurl 等）
- 复用跨平台 C++ 代码（共享 iOS/Desktop 的核心逻辑层）
- 性能敏感场景：音视频编解码、图像处理、物理引擎
- 需要使用 Android NDK 平台 API（OpenGL ES、Vulkan、AAudio、Camera2 NDK）

## build.gradle.kts 配置

```kotlin
android {
    namespace = "com.example.nativeapp"
    compileSdk = 35

    // 1. 锁定 NDK 版本（强烈建议显式指定）
    ndkVersion = "27.1.12297006"

    defaultConfig {
        minSdk = 24
        targetSdk = 35

        // 2. 每个变体的 CMake 参数 / 编译器标志
        externalNativeBuild {
            cmake {
                // CMake 参数——不要手动设 ANDROID_ABI/ANDROID_PLATFORM，Gradle 会注入
                arguments += listOf("-DANDROID_STL=c++_shared")
                cppFlags += listOf("-std=c++17", "-fexceptions", "-frtti")
            }
        }

        // 3. ABI 过滤——仅构建指定架构
        ndk {
            abiFilters += listOf("arm64-v8a", "armeabi-v7a")
        }
    }

    // 4. 指向 CMakeLists.txt（相对于本 build.gradle.kts）
    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "3.22.1"   // 可选：锁定 CMake 版本
        }
    }

    // 5. Prefab：消费 AAR 中的 native 依赖
    buildFeatures {
        prefab = true
    }

    // 6. .so 打包选项
    packaging {
        jniLibs {
            useLegacyPackaging = false  // false = 不压缩（minSdk >= 23 推荐）
            keepDebugSymbols += listOf("*/armeabi-v7a/*.so", "*/arm64-v8a/*.so")
        }
    }
}

dependencies {
    // Prefab 示例：通过 Maven 引入带 native 的 AAR
    implementation("com.android.ndk.thirdparty:curl:8.4.0")
}
```

**关键点**：`externalNativeBuild` 出现在**两个层级**——外层指定 CMake 脚本路径/版本，`defaultConfig` 内层配置参数和标志。

## CMakeLists.txt 标准模板

```cmake
cmake_minimum_required(VERSION 3.22.1)
project("nativeapp" LANGUAGES CXX)

# ---- 构建自己的共享库 ----
add_library(nativeapp SHARED
    nativeapp.cpp
    utils.cpp
)

# C++17 标准
target_compile_features(nativeapp PRIVATE cxx_std_17)

# ---- 链接 NDK 内置库 ----
find_library(log-lib log)            # liblog（__android_log_print）
find_library(android-lib android)    # libandroid（AAssetManager 等）

target_link_libraries(nativeapp
    PRIVATE
        ${log-lib}
        ${android-lib}
)

# ---- 链接预构建 .so / .a（手动方式）----
# add_library(thirdparty SHARED IMPORTED)
# set_target_properties(thirdparty PROPERTIES
#     IMPORTED_LOCATION ${CMAKE_SOURCE_DIR}/../jniLibs/${ANDROID_ABI}/libthirdparty.so
# )
# target_link_libraries(nativeapp PRIVATE thirdparty)

# ---- 通过 Prefab 消费第三方库 ----
# find_package(curl REQUIRED CONFIG)
# target_link_libraries(nativeapp PRIVATE curl::curl)
```

## NDK 变量速查

以下变量由 NDK toolchain 文件 (`android.toolchain.cmake`) 定义，Gradle 自动注入前三个：

| 变量 | 说明 | 可选值 / 默认值 |
|---|---|---|
| `ANDROID_ABI` | 目标 CPU 架构 | `arm64-v8a` / `armeabi-v7a` / `x86_64` / `x86`（Gradle 自动按 abiFilters 逐个调用） |
| `ANDROID_PLATFORM` | 最低 API level | 自动同步 `minSdk`；格式 `android-24` 或 `24` |
| `ANDROID_STL` | C++ 标准库 | `c++_static`(默认) / `c++_shared` / `none` / `system` |
| `ANDROID_NDK` | NDK 安装路径 | 由 SDK Manager 管理，自动设置 |
| `ANDROID_ARM_NEON` | armeabi-v7a NEON 指令 | `TRUE`(默认) / `FALSE` |
| `ANDROID_ARM_MODE` | ARM 指令集 | `thumb`(默认) / `arm` |
| `CMAKE_ANDROID_ARCH_ABI` | CMake 内置 ABI 变量 | 与 `ANDROID_ABI` 相同（CMake 3.21+） |

**注意**：不要在 CMakeLists.txt 中 `set(ANDROID_ABI ...)`，这些变量由 toolchain 注入，手动设置无效或冲突。

## 多 ABI 构建与过滤

```kotlin
// 方式 1：abiFilters —— 构建+打包到单个 APK（fat APK）
android {
    defaultConfig {
        ndk {
            abiFilters += listOf("arm64-v8a", "armeabi-v7a")
        }
    }
}

// 方式 2：splits —— 每个 ABI 单独 APK
android {
    splits {
        abi {
            isEnable = true
            reset()
            include("arm64-v8a", "armeabi-v7a", "x86_64")
            isUniversalApk = false  // 是否额外生成一个全架构 APK
        }
    }
}
```

**推荐**：使用 **App Bundle (AAB)** 发布，Google Play 自动按设备 ABI 分发，无需手动 splits。

## .so 产物路径与打包

| 场景 | 路径 |
|---|---|
| CMake 构建产物 | `build/intermediates/cmake/{variant}/obj/{abi}/lib*.so` |
| 手动放置预构建 .so | `src/main/jniLibs/{abi}/lib*.so` |
| AAR 内的 native 库 | `jni/{abi}/lib*.so` |
| APK/AAB 内最终位置 | `lib/{abi}/lib*.so` |

```
app/src/main/
├── cpp/
│   ├── CMakeLists.txt
│   └── nativeapp.cpp
└── jniLibs/              # 仅放预构建的第三方 .so
    ├── arm64-v8a/
    │   └── libfoo.so
    └── armeabi-v7a/
        └── libfoo.so
```

**jniLibs 自定义路径**（如果不在默认位置）：
```kotlin
android {
    sourceSets {
        getByName("main") {
            jniLibs.srcDirs("libs")  // 指向 libs/ 而非 src/main/jniLibs/
        }
    }
}
```

## Prefab（消费第三方 native 库）

Prefab 让 AAR 可以分发 native 头文件 + .so，消费端通过 `find_package` 引入：

```kotlin
// build.gradle.kts
android {
    buildFeatures { prefab = true }
}
dependencies {
    implementation("com.android.ndk.thirdparty:curl:8.4.0")
}
```

```cmake
# CMakeLists.txt
find_package(curl REQUIRED CONFIG)
target_link_libraries(mylib PRIVATE curl::curl)
# 头文件自动可用：#include "curl/curl.h"
# libcurl.so 自动打包进 APK
```

**发布 Prefab 库**：
```kotlin
android {
    buildFeatures { prefabPublishing = true }
    prefab {
        create("mylib") {
            headers = "src/main/cpp/include"
        }
    }
}
```

**注意**：如果你的 CMake 脚本修改了 `CMAKE_FIND_ROOT_PATH`，必须**追加**而非覆盖，否则 Gradle 注入的 prefab 路径会丢失。

## CMake vs ndk-build 对比

| 维度 | CMake | ndk-build |
|---|---|---|
| 配置文件 | `CMakeLists.txt` | `Android.mk` + `Application.mk` |
| 跨平台 | 天然跨平台，可复用 Desktop/iOS 构建 | Android 专属 |
| IDE 支持 | Android Studio 深度集成 + CLion | 仅基础支持 |
| 官方推荐 | 新项目首选 | 仅维护旧项目 |
| Prefab | 支持 | 支持 |
| 学习曲线 | CMake 语法较复杂但通用 | Makefile 风格，Android 特化 |

**结论**：新项目一律用 CMake；ndk-build 仅在迁移遗留 `Android.mk` 项目时使用。

## 调试方法

### 1. Logcat 日志（最常用）

```cpp
#include <android/log.h>
#define TAG "NativeApp"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

void myFunction() {
    LOGI("value = %d", 42);
}
```

CMakeLists.txt 中需链接 `log` 库：`find_library(log-lib log)` + `target_link_libraries(... ${log-lib})`。

### 2. LLDB 断点调试

Android Studio 原生支持 LLDB：Run > Debug，在 C++ 源码中设断点即可。确保：
- 使用 **debug** 构建变体（`isDebuggable = true`）
- `build.gradle.kts` 中不要 strip debug 符号

### 3. ndk-stack 符号化崩溃堆栈

```bash
# 从 logcat 实时符号化
adb logcat | ndk-stack -sym app/build/intermediates/cmake/debug/obj/arm64-v8a/

# 从 tombstone 文件
adb pull /data/tombstones/tombstone_00
ndk-stack -sym path/to/obj/arm64-v8a/ -dump tombstone_00
```

## 常见陷阱

1. **`c++_static` 多库冲突**：同一 APK 中多个 `.so` 各自静态链接 libc++，ODR 违反导致崩溃。多 .so 场景必须用 `c++_shared`。
2. **忘记 `abiFilters`**：默认构建全部 4 个 ABI，调试时设为仅 `arm64-v8a` 可加速 3 倍。
3. **`ANDROID_PLATFORM` 过低**：引用高版本 NDK API（如 API 26 的 AAudio）但 `minSdk = 21` 会链接失败。需要运行时 `dlopen` 或条件编译。
4. **CMakeLists.txt 路径错误**：`path = file(...)` 是相对于 `build.gradle.kts` 的路径，不是项目根目录。
5. **Prefab 路径被覆盖**：在 CMake 中 `set(CMAKE_FIND_ROOT_PATH ...)` 会清除 Gradle 注入的 prefab 搜索路径，必须用 `list(APPEND ...)`。
6. **strip 与调试冲突**：Release 构建默认 strip `.so`，`ndk-stack` 无法符号化。保留 debug 符号：`packaging.jniLibs.keepDebugSymbols`。
7. **CMake 版本陷阱**：CMake < 3.21 的内置 Android 支持与 NDK toolchain 行为不一致，始终使用 NDK 自带的 toolchain 文件（AGP 默认行为）。
