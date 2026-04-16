---
name: harmony-native-project
description: "HarmonyOS 原生 C++ 工程：目录结构、CMake 配置、ohpm 协同、多 ABI 构建、系统库链接。"
tech_stack: [harmonyos]
---

# HarmonyOS 原生 C++ 工程配置

> 来源：https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/build-with-ndk-overview
> 版本基准：HarmonyOS 5 / DevEco Studio 5.x / CMake 3.16+

## 用途

在 HarmonyOS 应用中通过 NAPI 桥接 ArkTS 与 C/C++ 代码，构建高性能 native 动态库（.so），适用于音视频编解码、图形渲染、算法加速、三方 C 库移植等场景。

## 何时使用

- 需要调用 C/C++ 算法库或复用已有 C/C++ 代码
- 对性能敏感的模块（图像处理、加解密、AI 推理）
- 移植 Android NDK / Linux C 库到 HarmonyOS
- 需要通过 NAPI 向 ArkTS 暴露 native 接口

## 项目目录结构

使用 DevEco Studio "Native C++" 模板创建后的典型结构：

```
entry/
  build-profile.json5          # 模块构建配置（含 externalNativeOptions）
  oh-package.json5              # 模块依赖声明（注册 .so 到 ArkTS 侧）
  src/main/
    ets/
      pages/
        Index.ets               # ArkTS 页面，import native 模块
    cpp/
      CMakeLists.txt            # CMake 构建脚本
      napi_init.cpp             # NAPI 入口：注册模块 + 导出函数
      hello.cpp                 # 业务 C++ 实现
      include/                  # 头文件目录（可选）
      types/
        libentry/
          index.d.ts            # TypeScript 类型声明（供 ArkTS import）
          oh-package.json5      # 将 index.d.ts 绑定到 .so 名
    resources/
    module.json5
  build/
    default/intermediates/libs/ # 编译产物 .so 输出目录
```

**types 子目录**是关键：`types/libentry/oh-package.json5` 将 `index.d.ts` 的类型声明与编译产出的 `libentry.so` 关联起来，使 ArkTS 侧可以 `import nativeModule from 'libentry.so'`。

## oh-package.json5 配置

### 模块级 entry/oh-package.json5

在 `dependencies` 中注册 native 模块的类型声明路径：

```json5
{
  "name": "entry",
  "version": "1.0.0",
  "description": "应用入口模块",
  "main": "",
  "dependencies": {
    "libentry.so": "file:./src/main/cpp/types/libentry"
  }
}
```

### types 目录下 oh-package.json5

```json5
// entry/src/main/cpp/types/libentry/oh-package.json5
{
  "name": "libentry.so",
  "types": "./index.d.ts",
  "version": "1.0.0",
  "description": "Native 模块类型声明"
}
```

### types 目录下 index.d.ts

```typescript
// entry/src/main/cpp/types/libentry/index.d.ts
export const add: (a: number, b: number) => number;
export const hello: () => string;
```

## build-profile.json5 中 externalNativeOptions

在模块级 `build-profile.json5` 的 `buildOption` 中配置：

```json5
{
  "apiType": "stageMode",
  "buildOption": {
    "externalNativeOptions": {
      "path": "./src/main/cpp/CMakeLists.txt",
      "arguments": "",
      "abiFilters": ["arm64-v8a"],
      "cppFlags": ""
    }
  }
}
```

| 字段 | 说明 |
|---|---|
| `path` | CMakeLists.txt 相对路径 |
| `arguments` | 传给 CMake 的额外参数（如 `-DCMAKE_BUILD_TYPE=Release`） |
| `abiFilters` | 目标架构列表，详见多 ABI 构建章节 |
| `cppFlags` | 传给 C++ 编译器的额外标志 |

## CMakeLists.txt 标准模板

```cmake
cmake_minimum_required(VERSION 3.4.1)
project(entry)

# 头文件路径
set(NATIVERENDER_ROOT_PATH ${CMAKE_CURRENT_SOURCE_DIR})
include_directories(
    ${NATIVERENDER_ROOT_PATH}
    ${NATIVERENDER_ROOT_PATH}/include
)

# 定义动态库，名称必须与 oh-package.json5 中的 libXXX.so 一致
add_library(entry SHARED
    napi_init.cpp
    hello.cpp
)

# 链接系统库
target_link_libraries(entry PUBLIC
    libace_napi.z.so
    libhilog_ndk.z.so
)
```

**注意**：`add_library` 的目标名 `entry` 编译后产出 `libentry.so`，必须与 types 目录下声明的 `libentry.so` 名称对应。

## 系统库链接速查

在 `target_link_libraries` 中直接引用，无需 `find_library`，CMake toolchain 已配置搜索路径。

| 库名 | 头文件 | 用途 |
|---|---|---|
| `libace_napi.z.so` | `napi/native_api.h` | NAPI 框架，JS-C++ 互操作（必选） |
| `libhilog_ndk.z.so` | `hilog/log.h` | Native 侧日志打印（强烈推荐） |
| `librawfile.z.so` | `rawfile/raw_file_manager.h` | 访问 resources/rawfile 目录资源 |
| `libnative_window.z.so` | `native_window/external_window.h` | Native 窗口 / Surface |
| `libnative_drawing.z.so` | `native_drawing/*.h` | 2D 图形绘制 |
| `libEGL.so` | `EGL/egl.h` | OpenGL ES EGL 接口 |
| `libGLESv3.so` | `GLES3/gl3.h` | OpenGL ES 3.0 |
| `libz.so` | `zlib.h` | zlib 压缩 |
| `libuv.so` | `uv.h` | 异步 I/O（libuv） |

## ohpm 与 CMake 协同

### 引用 ohpm 安装的 native 三方库

1. `oh-package.json5` 中添加三方依赖：
   ```json5
   "dependencies": {
     "@aspect/native-crypto": "^1.0.0"
   }
   ```
2. 执行 `ohpm install`，依赖下载到 `oh_modules/`
3. 在 CMakeLists.txt 中通过 `find_package` 或直接指定路径引用：
   ```cmake
   # 方式一：三方库提供了 CMake Config
   find_package(native-crypto REQUIRED CONFIG)
   target_link_libraries(entry PUBLIC native-crypto::native-crypto)

   # 方式二：直接指定预编译 .so 路径
   target_link_libraries(entry PUBLIC
       ${CMAKE_CURRENT_SOURCE_DIR}/../../../libs/${OHOS_ARCH}/libcrypto.so
   )
   target_include_directories(entry PRIVATE
       ${CMAKE_CURRENT_SOURCE_DIR}/thirdparty/include
   )
   ```

### 引用本地预编译 .so

将 `.so` 文件放入 `entry/libs/${OHOS_ARCH}/` 目录（如 `entry/libs/arm64-v8a/libfoo.so`），然后在 CMakeLists.txt 中链接。`${OHOS_ARCH}` 是 toolchain 自动注入的变量，值为当前编译目标架构。

## 多 ABI 构建

在 `build-profile.json5` 的 `abiFilters` 中指定：

```json5
"abiFilters": ["arm64-v8a", "x86_64"]
```

| ABI | 用途 |
|---|---|
| `arm64-v8a` | 真机运行（HarmonyOS NEXT 设备全部为 arm64，**必选**） |
| `x86_64` | 本地模拟器调试 |

- **DevEco Studio 默认仅包含 `arm64-v8a`**，如需模拟器调试须手动加 `x86_64`
- CMake 中可用 `${OHOS_ARCH}` 获取当前正在编译的架构名
- 引用预编译三方 .so 时，须为每个目标 ABI 提供对应架构的 .so 文件
- 编译产物路径：`entry/build/default/intermediates/libs/${ABI}/libentry.so`

## 调试方法

### Native 侧 HiLog 日志

```cpp
#include "hilog/log.h"

// 定义日志 domain 和 tag（建议文件顶部统一定义）
#undef LOG_DOMAIN
#undef LOG_TAG
#define LOG_DOMAIN 0x3200  // 业务 domain，范围 0x0000-0xFFFF
#define LOG_TAG "NativeEntry"

// 使用宏打印各级别日志
OH_LOG_INFO(LOG_APP, "Init success, version=%{public}d", 1);
OH_LOG_ERROR(LOG_APP, "Failed to open file %{public}s, errno=%{public}d", path, errno);
OH_LOG_DEBUG(LOG_APP, "Buffer size: %{public}zu", bufSize);
```

- `%{public}` -- 日志内容公开可见（发布版也可见）
- `%{private}` -- 日志内容仅调试版可见，发布版显示 `<private>`
- 默认不带修饰符等同 `%{private}`
- CMakeLists.txt 中必须链接 `libhilog_ndk.z.so`

### DevEco Studio 调试

- **Log 面板**：过滤 tag 即可查看 native 日志
- **LLDB 调试**：Run > Debug 启动后，可在 C++ 代码中设断点、查看变量
- **Address Sanitizer**：`cppFlags` 加 `-fsanitize=address` 检测内存错误

## 常见陷阱

1. **库名必须带 `lib` 前缀** -- `add_library(entry ...)` 产出 `libentry.so`；types 目录和 oh-package.json5 中引用时必须写 `libentry.so`，不能写 `entry.so`
2. **忘记链接 libace_napi.z.so** -- 编译通过但运行时 crash，报 `undefined symbol: napi_*`
3. **模拟器闪退但真机正常** -- 检查 `abiFilters` 是否包含 `x86_64`；引用的三方 .so 是否提供了 x86_64 版本
4. **index.d.ts 与 C++ 导出不一致** -- 类型声明文件中的函数签名必须与 NAPI 注册的函数名和参数完全匹配，否则运行时 undefined
5. **CMake 版本过低** -- DevEco Studio 5.x 内置 CMake 3.16+，`cmake_minimum_required` 不要设高于此版本
6. **HiLog 日志不显示** -- 确认 LOG_DOMAIN 范围合法、链接了 `libhilog_ndk.z.so`、且日志级别 >= 当前过滤级别
7. **多模块共享 native 库** -- 需要将 native 代码封装为 HAR 包，不能简单跨模块引用 .so 文件路径
