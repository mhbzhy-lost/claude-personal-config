---
name: android-native-advanced
description: "Android 高级原生开发：第三方库交叉编译、NDK 预置库、ASan/HWASan、Prefab AAR 发布。"
tech_stack: [compose]
---

# Android 高级原生开发

> 来源：https://developer.android.com/ndk/guides
> 版本基准：AGP 8.x / NDK r27+

## 用途

为 Android 项目提供高级 native 开发能力：交叉编译第三方 C/C++ 库、链接 NDK 预置系统库、使用内存检测工具调试、发布包含 native 代码的 AAR。

## 何时使用

- 需要将 OpenSSL / FFmpeg / libyuv 等第三方 C++ 库编译为 Android 可用的 .so/.a
- 项目需要调用 Vulkan / Camera2 NDK / MediaCodec NDK 等系统原生 API
- 排查 native 层内存越界、use-after-free 等问题
- 需要将 native 库封装为 AAR 供其他项目 Prefab 依赖
- 多个 native 库之间存在依赖关系，需要组织 CMake 多库构建

## 第三方 C++ 库交叉编译

### 使用 NDK toolchain file（推荐）

```bash
# NDK 自带 toolchain file，禁用 CMake 内置 Android 支持
cmake \
  -DCMAKE_TOOLCHAIN_FILE=$NDK/build/cmake/android.toolchain.cmake \
  -DANDROID_ABI=arm64-v8a \
  -DANDROID_PLATFORM=android-24 \
  -DANDROID_STL=c++_shared \
  -DCMAKE_INSTALL_PREFIX=/path/to/install \
  -B build -S .

cmake --build build -j$(nproc)
cmake --install build
```

关键变量：`ANDROID_ABI`（arm64-v8a / armeabi-v7a / x86_64 / x86）、`ANDROID_PLATFORM`（最低 API 级别）、`ANDROID_STL`（c++_shared / c++_static / none）。

### Autoconf 项目

```bash
export TOOLCHAIN=$NDK/toolchains/llvm/prebuilt/linux-x86_64
export TARGET=aarch64-linux-android
export API=24

./configure --host=$TARGET --prefix=/path/to/install \
  CC="$TOOLCHAIN/bin/clang --target=${TARGET}${API}" \
  CXX="$TOOLCHAIN/bin/clang++ --target=${TARGET}${API}" \
  AR=$TOOLCHAIN/bin/llvm-ar \
  RANLIB=$TOOLCHAIN/bin/llvm-ranlib
```

Target triple 速查：arm64-v8a = `aarch64-linux-android`，armeabi-v7a = `armv7a-linux-androideabi`，x86_64 = `x86_64-linux-android`。

## NDK 预置库速查

| 库 | CMake target | 最低 API | 用途 |
|---|---|---|---|
| liblog | `log` | 3 | logcat 日志 |
| libandroid | `android` | 3 | ANativeWindow / AAssetManager 等 |
| libz | `z` | 3 | zlib 压缩 |
| libGLESv3 | `GLESv3` | 18 | OpenGL ES 3.0+ |
| libEGL | `EGL` | 9 | EGL 上下文管理 |
| libvulkan | `vulkan` | 24 | Vulkan 图形 |
| libcamera2ndk | `camera2ndk` | 24 | 原生相机 API |
| libmediandk | `mediandk` | 21 | MediaCodec / MediaExtractor |
| libaaudio | `aaudio` | 26 | 高性能音频 |
| libnativewindow | `nativewindow` | 26 | ANativeWindow 扩展 |

```cmake
target_link_libraries(mylib PRIVATE log android vulkan camera2ndk mediandk)
```

ndk-build 写法：`LOCAL_LDLIBS := -llog -landroid -lvulkan -lcamera2ndk -lmediandk`

> libc / libm / libdl 自动链接；libc++ 通过 `ANDROID_STL` 控制。

## ASan / HWASan

### ASan（API 27+，已标记 deprecated，建议优先 HWASan）

**CMakeLists.txt：**
```cmake
target_compile_options(mylib PUBLIC -fsanitize=address -fno-omit-frame-pointer)
target_link_options(mylib PUBLIC -fsanitize=address)
```

**build.gradle.kts：** 必须设置 `ANDROID_STL=c++_shared`，并设置 `packaging { jniLibs { useLegacyPackaging = true } }`。

**wrap.sh**（放入 `src/main/resources/lib/<abi>/wrap.sh`）：
```bash
#!/system/bin/sh
HERE="$(cd "$(dirname "$0")" && pwd)"
export ASAN_OPTIONS=log_to_syslog=false,allow_user_segv_handler=1
ASAN_LIB=$(ls $HERE/libclang_rt.asan-*-android.so)
if [ -f "$HERE/libc++_shared.so" ]; then
    export LD_PRELOAD="$ASAN_LIB $HERE/libc++_shared.so"
else
    export LD_PRELOAD="$ASAN_LIB"
fi
"$@"
```

同时将 `$NDK/toolchains/llvm/prebuilt/*/lib/clang/*/lib/linux/libclang_rt.asan-*-android.so` 复制到 `src/main/jniLibs/<abi>/`。App manifest 需 `android:debuggable="true"`。

### HWASan（API 29+，仅 arm64，推荐）

**CMakeLists.txt：**
```cmake
target_compile_options(mylib PUBLIC -fsanitize=hwaddress -fno-omit-frame-pointer)
target_link_options(mylib PUBLIC -fsanitize=hwaddress)
```

NDK r27+ 简化写法：`arguments "-DANDROID_SANITIZE=hwaddress"` 在 build.gradle.kts 的 cmake block 中。

**wrap.sh**（Android 14+ 任意设备可用）：
```bash
#!/system/bin/sh
LD_HWASAN=1 exec "$@"
```

HWASan 内存开销仅 10-35%（ASan 约 2x），且能检测 stack-use-after-return。

## ndk-stack 符号化

```bash
# 实时管道
adb logcat | $NDK/ndk-stack -sym app/build/intermediates/cxx/Debug/<hash>/obj/arm64-v8a

# 从文件
adb logcat > /tmp/crash.txt
$NDK/ndk-stack -sym <unstripped-libs-dir> -dump /tmp/crash.txt
```

AGP 构建的未剥离库路径：`<module>/build/intermediates/cxx/<buildType>/<hash>/obj/<abi>`。

> 复制粘贴 tombstone 时必须保留开头的 `*** *** *** ...` 行，否则解析失败。

## Prefab 发布 native AAR

### 发布端（library module）

```kotlin
// build.gradle.kts
android {
    buildFeatures {
        prefabPublishing = true
    }
    prefab {
        create("mylib") {
            headers = "src/main/cpp/include"  // 公开头文件目录
        }
    }
    // 已有 externalNativeBuild { cmake { ... } } 配置
}
```

构建产物（.so 和头文件）自动打包到 AAR 的 `prefab/` 目录。通过 maven-publish 发布后消费方即可使用。

### 消费端

```kotlin
// build.gradle.kts
android {
    buildFeatures { prefab = true }
}
dependencies {
    implementation("com.example:mylib:1.0.0")
}
```

```cmake
find_package(mylib REQUIRED CONFIG)
target_link_libraries(app PRIVATE mylib::mylib)
```

## CMake 多库项目组织

### 推荐结构

```
app/src/main/cpp/
  CMakeLists.txt          # 顶层，add_subdirectory 聚合
  core/
    CMakeLists.txt        # add_library(core STATIC ...)
  renderer/
    CMakeLists.txt        # add_library(renderer SHARED ...) + target_link_libraries(renderer PRIVATE core)
  codec/
    CMakeLists.txt        # add_library(codec SHARED ...)
```

顶层 CMakeLists.txt：

```cmake
cmake_minimum_required(VERSION 3.22)
project(myproject)

add_subdirectory(core)
add_subdirectory(renderer)
add_subdirectory(codec)
```

### 引入预编译第三方库

```cmake
# 方式 1：IMPORTED target
add_library(openssl SHARED IMPORTED)
set_target_properties(openssl PROPERTIES
    IMPORTED_LOCATION ${CMAKE_CURRENT_SOURCE_DIR}/libs/${ANDROID_ABI}/libssl.so
    INTERFACE_INCLUDE_DIRECTORIES ${CMAKE_CURRENT_SOURCE_DIR}/include)

# 方式 2：通过 Prefab（如已有 AAR）
find_package(curl REQUIRED CONFIG)
target_link_libraries(mylib PRIVATE curl::curl)
```

build.gradle.kts 中可按 flavor 选择构建的 target：

```kotlin
externalNativeBuild {
    cmake {
        targets("renderer", "codec")  // 只构建指定库
    }
}
```

## 常见陷阱

1. **勿用 CMake 内置 Android 支持** -- 必须指定 `-DCMAKE_TOOLCHAIN_FILE=$NDK/build/cmake/android.toolchain.cmake`，CMake 内置行为与 NDK 不一致
2. **STL 一致性** -- 所有 .so 必须使用相同的 STL（c++_shared 或 c++_static）；混用会导致 ODR 违规和崩溃；多个 .so 场景必须用 c++_shared
3. **ASan + libc++_static 不兼容** -- ASan 不兼容 C++ 异常 + static STL 的组合，务必用 c++_shared
4. **armeabi-v7a 的 triple 不统一** -- 编译器用 `armv7a-linux-androideabi`，binutils 用 `arm-linux-androideabi`
5. **Prefab headers 路径** -- 指向的是源码中的头文件目录，不是构建产物；路径错误会导致消费方找不到头文件
6. **minSdkVersion 与预置库** -- 链接的系统库要求的最低 API 不得高于 app 的 minSdk，否则在低版本设备运行时 dlopen 失败
