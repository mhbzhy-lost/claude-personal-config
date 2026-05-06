---
name: harmonyos-cpp-cmake
description: HarmonyOS C++ 工程 CMake 配置：build-profile.json5 native 构建参数、CMakeLists.txt 与 hvigor 协作、多 ABI（arm64-v8a/x86_64）构建、第三方 .so 预置与链接、SANITIZER 编译选项
tech_stack: [harmonyos]
language: [cpp, cmake]
capability: [ci-cd]
version: "HarmonyOS unversioned"
collected_at: 2025-01-15
---

# HarmonyOS C++ 工程 CMake 配置

> Source: https://developer.huawei.com/consumer/cn/doc/best-practices/bpta-cmake-adapts-to-harmonyos, https://developer.huawei.com/consumer/en/doc/harmonyos-guides-V14/ide-hvigor-build-profile-V14, https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-hvigor-api

## Purpose

HarmonyOS 的 C++ Native 模块通过 CMake 组织构建，由 hvigor 驱动调用。本技能覆盖从 `build-profile.json5` 声明 native 构建参数、编写 `CMakeLists.txt`、配置多 ABI 构建、链接第三方预编译 `.so`，到启用 SANITIZER 排查内存问题的完整链路，以及从 Android NDK 迁移时的注意事项。

## When to Use

- 新建包含 C++ Native 代码的 HarmonyOS 工程模块
- 从 Android NDK / 其他平台迁移 CMake 构建到 HarmonyOS
- 需要引入第三方预编译 `.so`（如音视频编解码库、加密库）
- 配置多 ABI 构建（真机 arm64-v8a + 模拟器 x86_64）
- 排查 native 构建失败：CMake 配置错误、ABI 不匹配、链接找不到符号
- 启用 AddressSanitizer / UBSan 排查 C++ 内存越界或未定义行为

## Basic Usage

### 1. build-profile.json5 声明 native 构建

在模块的 `build-profile.json5` 中通过 `buildOption.nativeLib` 字段声明：

```json5
// entry/build-profile.json5
{
  "apiType": "stageMode",
  "buildOption": {
    "nativeLib": {
      "path": "./src/main/cpp/CMakeLists.txt",       // CMakeLists.txt 路径（必填）
      "abiFilters": ["arm64-v8a", "x86_64"],          // 目标 ABI（真机 + 模拟器）
      "buildOption": {
        "sanitizer": "address"                         // 可选：asan / undefined
      },
      "arguments": "-DCMAKE_BUILD_TYPE=Release"        // 可选：传递给 CMake 的 -D 变量
    }
  }
}
```

关键字段说明：

| 字段 | 必填 | 说明 |
|------|------|------|
| `path` | ✅ | CMakeLists.txt 的相对路径（相对于模块根目录） |
| `abiFilters` | ✅ | `arm64-v8a`（真机）和/或 `x86_64`（模拟器） |
| `buildOption.sanitizer` | ❌ | `"address"`（ASan）或 `"undefined"`（UBSan），仅 Debug |
| `arguments` | ❌ | 传递给 CMake 的额外 `-D` 变量，空格分隔 |
| `externalNativeOptions` | ❌ | 更细粒度的 CMake/ninja 参数覆盖 |

### 2. CMakeLists.txt 标准模板

```cmake
# 最低 CMake 版本
cmake_minimum_required(VERSION 3.16.0)

# 项目名（通常与模块名一致）
project(my_native_lib)

# 声明 native 库 target
add_library(my_native_lib SHARED
    src/main.cpp
    src/utils.cpp
)

# 引用 HarmonyOS SDK 提供的系统库
find_library(
    hilog-lib        # 变量名
    hilog_ndk.z      # 实际的库名（不需要 lib 前缀和 .so 后缀）
)

find_library(
    ace-napi-lib
    ace_napi.z
)

# 链接系统库
target_link_libraries(my_native_lib PUBLIC
    ${hilog-lib}
    ${ace-napi-lib}
)

# 头文件搜索路径
target_include_directories(my_native_lib PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)
```

关键 HarmonyOS NDK 系统库名称（用于 `find_library`）：

| 库文件名 | 用途 |
|----------|------|
| `ace_napi.z` | NAPI 接口（JS ↔ C++ 桥接） |
| `hilog_ndk.z` | 日志输出 |
| `libc++.so` | C++ 标准库（自动链接） |
| `libace.z` | ArkUI 引擎相关 |
| `librawfile.z` | 资源文件读取 |
| `native_window.z` | 原生窗口/EGL |

### 3. 第三方 .so 预置与链接

```
entry/src/main/cpp/
├── CMakeLists.txt
├── src/
└── libs/                     # 预编译 .so 存放目录
    ├── arm64-v8a/
    │   └── libffmpeg.so      # 真机版本
    └── x86_64/
        └── libffmpeg.so      # 模拟器版本
```

在 CMakeLists.txt 中声明导入库：

```cmake
# 声明导入的预编译库
add_library(ffmpeg SHARED IMPORTED)

# 指定各 ABI 对应的 .so 路径
set_target_properties(ffmpeg PROPERTIES
    IMPORTED_LOCATION ${CMAKE_CURRENT_SOURCE_DIR}/libs/${CMAKE_OHOS_ARCH_ABI}/libffmpeg.so
)

# 链接到主 target
target_link_libraries(my_native_lib PUBLIC ffmpeg)
```

HarmonyOS 工具链中的 ABI 变量（替代 Android 的 `CMAKE_ANDROID_ARCH_ABI`）：

```cmake
# CMAKE_OHOS_ARCH_ABI 在 HarmonyOS 工具链中自动设置为 arm64-v8a 或 x86_64
message(STATUS "Building for ABI: ${CMAKE_OHOS_ARCH_ABI}")
```

### 4. SANITIZER 配置

ASan 用于检测内存错误（越界、use-after-free、double-free），UBSan 检测未定义行为（整数溢出、空指针解引用）。

```json5
// Debug 构建中启用 ASan
"buildOption": {
    "nativeLib": {
        "path": "./src/main/cpp/CMakeLists.txt",
        "abiFilters": ["arm64-v8a"],
        "buildOption": {
            "sanitizer": "address"    // 或 "undefined"
        }
    }
}
```

运行时 ASan 会在检测到错误时立即 crash 并输出详细报告：

```
==12345==ERROR: AddressSanitizer: heap-buffer-overflow
READ of size 4 at 0x... thread T0
    #0 ... in my_function() src/main.cpp:42
```

⚠️ **SANITIZER 有 2-5x 性能开销，且会增加 .so 体积，仅限 Debug 构建，切勿在 Release 中启用。**

### 5. 从 Android NDK 迁移注意事项

| Android NDK | HarmonyOS NDK | 迁移要点 |
|-------------|---------------|----------|
| `CMAKE_ANDROID_ARCH_ABI` | `CMAKE_OHOS_ARCH_ABI` | 全局替换 |
| `CMAKE_SYSTEM_NAME "Android"` | `CMAKE_SYSTEM_NAME "OHOS"` | 检查 CMake 脚本中的系统判断 |
| `find_library(log ...)` | `find_library(hilog-lib hilog_ndk.z)` | 日志库名称不同 |
| `target_link_options ... "-Wl,--gc-sections"` | 相同 | 链接选项基本兼容 |
| `ANDROID_STL` 变量 | 不需要 | C++ 标准库自动链接 |
| JNI 函数（`Java_xxx`） | NAPI 函数（`napi_xxx`） | 接口层需重写 |

## Key APIs (Summary)

| 配置/指令 | 位置 | 作用 |
|-----------|------|------|
| `buildOption.nativeLib.path` | build-profile.json5 | 指向 CMakeLists.txt |
| `buildOption.nativeLib.abiFilters` | build-profile.json5 | 目标 ABI 列表 |
| `buildOption.nativeLib.buildOption.sanitizer` | build-profile.json5 | 启用 ASan/UBSan |
| `add_library(xxx SHARED IMPORTED)` | CMakeLists.txt | 声明预编译 .so |
| `set_target_properties(... IMPORTED_LOCATION)` | CMakeLists.txt | 指定 .so 文件路径 |
| `find_library(var libname)` | CMakeLists.txt | 查找系统 NDK 库 |
| `target_link_libraries` | CMakeLists.txt | 链接依赖 |

## Caveats

- **ABI 不匹配是第一大坑**：真机只认 `arm64-v8a`，模拟器只认 `x86_64`，`abiFilters` 写错导致构建通过但运行崩溃
- **预编译 .so 必须按 ABI 分目录**，且每个 ABI 的 .so 必须对应编译（arm64 的 .so 不能改名放到 x86_64 目录）
- **SANITIZER 有显著性能开销（2-5x）**，切勿在 Release 中启用；ASan 还会大幅增加 .so 体积
- **`CMAKE_SYSTEM_NAME` 在 HarmonyOS 工具链中是 `"OHOS"` 而非 `"Android"`**，迁移时所有平台判断代码需检查
- **hvigor 调用 CMake 的 working directory 不是 CMakeLists.txt 所在目录**，推荐使用 `${CMAKE_CURRENT_SOURCE_DIR}` 而非相对路径
- **第三方 .so 的 soname 必须匹配**：如果预编译库的 soname 是 `libffmpeg.so.7`，链接时必须保持一致，否则 `dlopen` 失败
- **`build-profile.json5` 中 `nativeLib` 的层级是 `buildOption.nativeLib`**，拼写错误不会告警，直接跳过 native 构建

## Composition Hints

- 本技能聚焦 **CMake 层面的构建配置**，hvigor 构建生命周期和 task 依赖请参考 `harmonyos-hvigor-build`
- NAPI 模块的 CMake 中需要 `find_library(ace-napi-lib ace_napi.z)`，NAPI 接口使用参考 `harmonyos-napi-binding`
- 构建成功后，native crash 的堆栈符号化参考 `harmonyos-napi-debug`（addr2line 符号化流程）
- 多模块工程的依赖管理和 ohpm 集成参考 `harmonyos-ohpm-cli`
- `build-profile.json5` 中还有 ArkTS 侧构建配置（如 `buildOption.arkOptions`），属于 hvigor 通用配置范畴
