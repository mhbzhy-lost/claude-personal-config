---
name: cmake-cross-compile
description: "CMake 交叉编译：toolchain file 编写、find_package 行为、符号可见性、LTO、多平台对比。"
tech_stack: [mobile-native, android, harmonyos]
language: [cpp]
---

# CMake 交叉编译通用模式

> 来源：[cmake-toolchains(7)](https://cmake.org/cmake/help/latest/manual/cmake-toolchains.7.html) |
> [Mastering CMake - Cross Compiling](https://cmake.org/cmake/help/book/mastering-cmake/chapter/Cross%20Compiling%20With%20CMake.html)
> 版本基准：CMake 3.22+

## 用途

为非本机平台（Android / iOS / HarmonyOS OHOS 等）构建 C/C++ 库或可执行文件时，通过 **toolchain file** 告知 CMake 目标平台信息、编译器路径和搜索策略。

## 何时使用

- 构建跨平台 C/C++ SDK，需同时产出 Android / iOS / OHOS 产物
- 在 CI 中为嵌入式或移动端批量交叉编译
- 项目依赖第三方 C 库（如 OpenSSL、FFmpeg），需在交叉环境中正确 `find_package`
- 需要精确控制导出符号、LTO 优化和 STL 链接方式

## Toolchain File 核心变量

| 变量 | 说明 | 示例值 |
|---|---|---|
| `CMAKE_SYSTEM_NAME` | 目标 OS，**设置后自动启用交叉编译** | `Android` / `iOS` / `OHOS` / `Linux` |
| `CMAKE_SYSTEM_PROCESSOR` | 目标 CPU 架构 | `aarch64` / `armv7-a` / `x86_64` |
| `CMAKE_SYSROOT` | 目标平台根文件系统路径 | NDK sysroot / iOS SDK |
| `CMAKE_C_COMPILER` / `CMAKE_CXX_COMPILER` | 交叉编译器完整路径 | `/.../aarch64-linux-gnu-gcc` |
| `CMAKE_FIND_ROOT_PATH` | 额外搜索根路径（库/头文件） | 预编译依赖安装目录 |
| `CMAKE_STAGING_PREFIX` | `make install` 安装目标路径（宿主机） | `/tmp/staging` |

> **关键**：只要设置了 `CMAKE_SYSTEM_NAME` 且其值不等于 `CMAKE_HOST_SYSTEM_NAME`，CMake 就会将 `CMAKE_CROSSCOMPILING` 设为 `TRUE`。

## Toolchain File 编写模板

```cmake
# toolchain-aarch64-linux.cmake — 通用交叉编译模板
cmake_minimum_required(VERSION 3.22)

# ---- 1. 目标平台描述 ----
set(CMAKE_SYSTEM_NAME Linux)          # 目标 OS
set(CMAKE_SYSTEM_PROCESSOR aarch64)   # 目标架构

# ---- 2. 编译器 ----
set(CMAKE_C_COMPILER   aarch64-linux-gnu-gcc)
set(CMAKE_CXX_COMPILER aarch64-linux-gnu-g++)

# ---- 3. Sysroot（可选，视工具链而定）----
# set(CMAKE_SYSROOT /opt/sysroot/aarch64)

# ---- 4. 搜索策略（交叉编译核心）----
# PROGRAM = NEVER：不在目标 sysroot 里找 host 可执行程序
# LIBRARY / INCLUDE / PACKAGE = ONLY：只在 sysroot 和 FIND_ROOT_PATH 里找
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_PACKAGE ONLY)
```

使用方式：

```bash
cmake -B build -DCMAKE_TOOLCHAIN_FILE=toolchain-aarch64-linux.cmake
```

## find_package 在交叉编译下的行为

交叉编译时最常见的坑是 `find_package` / `find_library` 找到了宿主机的库而非目标平台的库。CMake 通过 `CMAKE_FIND_ROOT_PATH_MODE_*` 系列变量控制搜索范围：

| 变量 | 推荐值 | 效果 |
|---|---|---|
| `CMAKE_FIND_ROOT_PATH_MODE_PROGRAM` | `NEVER` | `find_program` 只搜索宿主机路径（编译工具在宿主机运行） |
| `CMAKE_FIND_ROOT_PATH_MODE_LIBRARY` | `ONLY` | `find_library` 只搜索 `CMAKE_SYSROOT` + `CMAKE_FIND_ROOT_PATH` |
| `CMAKE_FIND_ROOT_PATH_MODE_INCLUDE` | `ONLY` | `find_path` / `find_file` 同上 |
| `CMAKE_FIND_ROOT_PATH_MODE_PACKAGE` | `ONLY` | `find_package` Config 模式同上 |

- `ONLY`：仅搜索交叉编译根路径
- `NEVER`：仅搜索宿主机路径
- `BOTH`：两者都搜索（**慎用**，容易混入宿主机库导致链接错误）

> **实践**：将第三方预编译依赖安装到一个统一目录（如 `deps/install`），然后通过 `-DCMAKE_FIND_ROOT_PATH=/path/to/deps/install` 传入。

## 静态库 vs 动态库选择

| 考量 | 静态库 (.a) | 动态库 (.so / .dylib) |
|---|---|---|
| 部署复杂度 | 低，单文件分发 | 需要随 APK/HAP 打包 |
| 符号冲突 | 高风险：多个静态库含同名符号 | 低风险：各 .so 隔离 |
| C++ STL | **必须全局统一**：Android NDK 要求同一进程中只能有一份 STL 实例 | `c++_shared` 更安全 |
| 包体积 | 仅链入实际使用的符号（配合 LTO） | 整个 .so 都会打入包 |
| 热更新 | 不支持 | 可单独替换 .so |

**推荐模式**：SDK 产物用 **静态库 + `-fvisibility=hidden`**，避免符号泄漏；应用层 JNI/NAPI 入口用动态库包装。

Android NDK STL 选择：

- `c++_shared`：多个 .so 共享同一份 libc++（推荐多库场景）
- `c++_static`：libc++ 静态链入每个 .so（单库场景可用，多库场景**严禁**使用，会导致 ODR 违规）

## 符号可见性控制

交叉编译的共享库必须严格控制导出符号，减少符号冲突和包体积：

```cmake
# 全局设置（推荐在 toolchain file 或顶层 CMakeLists.txt 中）
set(CMAKE_C_VISIBILITY_PRESET hidden)
set(CMAKE_CXX_VISIBILITY_PRESET hidden)
set(CMAKE_VISIBILITY_INLINES_HIDDEN ON)
```

等价编译器参数：`-fvisibility=hidden -fvisibility-inlines-hidden`

需要导出的符号用宏显式标记：

```c
// export.h
#if defined(_WIN32)
  #define MY_API __declspec(dllexport)
#else
  #define MY_API __attribute__((visibility("default")))
#endif
```

> **注意**：CMake 提供 `GenerateExportHeader` 模块可自动生成跨平台导出宏，用 `generate_export_header(mylib)` 即可。

## LTO 配置

CMake 通过 `INTERPROCEDURAL_OPTIMIZATION` 属性启用 LTO，编译器无关：

```cmake
include(CheckIPOSupported)
check_ipo_supported(RESULT ipo_supported OUTPUT ipo_output)

if(ipo_supported)
  set_target_properties(mylib PROPERTIES INTERPROCEDURAL_OPTIMIZATION TRUE)
else()
  message(WARNING "LTO not supported: ${ipo_output}")
endif()
```

交叉编译 LTO 注意事项：

- 编译器和链接器必须匹配（均为 Clang 或均为 GCC），不能混用
- Android NDK 默认使用 Clang + LLD，原生支持 ThinLTO
- LTO 对所有参与链接的目标生效，**依赖库也须以 LTO 模式编译**，否则优化效果受限
- Debug 构建建议关闭 LTO（编译速度显著下降）

## 多平台 Toolchain 对比（Android / OHOS / iOS）

| 维度 | Android NDK | HarmonyOS OHOS NDK | iOS (Xcode) |
|---|---|---|---|
| **CMAKE_SYSTEM_NAME** | `Android` | `OHOS` | `iOS` |
| **官方 toolchain 文件** | `<NDK>/build/cmake/android.toolchain.cmake` | `<SDK>/native/build/cmake/ohos.toolchain.cmake` | 无需（CMake 3.14+ 内置支持） |
| **架构变量** | `ANDROID_ABI`：`arm64-v8a` / `armeabi-v7a` / `x86_64` | `OHOS_ARCH`：`arm64-v8a` / `armeabi-v7a` / `x86_64` | `CMAKE_OSX_ARCHITECTURES`：`arm64` |
| **STL 变量** | `ANDROID_STL`：`c++_shared` / `c++_static` | `OHOS_STL`：`c++_shared` / `c++_static` | 系统 libc++（无需选择） |
| **最低 API 版本** | `ANDROID_PLATFORM`：`android-21` | `OHOS_PLATFORM_LEVEL` | `CMAKE_OSX_DEPLOYMENT_TARGET`：`15.0` |
| **编译器** | NDK 自带 Clang | OHOS NDK 自带 Clang | Xcode Clang（`xcrun` 定位） |
| **调用方式** | `-DCMAKE_TOOLCHAIN_FILE=<ndk>/...` | `-DCMAKE_TOOLCHAIN_FILE=<sdk>/...` | `-GXcode -DCMAKE_SYSTEM_NAME=iOS` |
| **默认 STL** | `c++_static` | `c++_shared` | `c++_shared`（系统） |
| **动态库后缀** | `.so` | `.so` | `.dylib` / `.framework` |

> Android 和 OHOS 的 toolchain 设计高度相似（均源自 LLVM/Clang + bionic/musl libc 体系），变量命名有对称关系（`ANDROID_*` vs `OHOS_*`）。

## 常见陷阱

1. **漏设 `CMAKE_FIND_ROOT_PATH_MODE_*`**：`find_package` 找到宿主机的 x86 库链接到 ARM 目标，链接报 `incompatible target` 错误
2. **Android 多库共存用 `c++_static`**：多个 .so 各含一份静态 libc++，C++ 异常跨 .so 边界时崩溃（ODR 违规）
3. **toolchain file 中调用 `project()`**：toolchain file 会被 CMake 多次读取，含 `project()` 会导致无限递归
4. **iOS 忘记设 `CMAKE_OSX_DEPLOYMENT_TARGET`**：链接时出现 `ld: warning: object file was built for newer iOS version`
5. **LTO + 第三方静态库**：若第三方 .a 未以 LTO 模式编译（无 bitcode/IR），链接器无法对其做跨模块优化，甚至可能报错
6. **`CMAKE_SYSROOT` vs `CMAKE_FIND_ROOT_PATH`**：前者影响编译器的 `--sysroot` 参数，后者仅影响 CMake 的 `find_*` 搜索路径，两者不可互相替代
7. **符号可见性未设 hidden**：共享库默认导出所有符号，包体积增大 10-30%，且容易与其他库符号冲突
