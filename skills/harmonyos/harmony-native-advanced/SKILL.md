---
name: harmony-native-advanced
description: "HarmonyOS 高级原生开发：XComponent 渲染、rawfile 访问、第三方库交叉编译、Sanitizers。"
tech_stack: [harmonyos, mobile-native]
language: [cpp]
---

# HarmonyOS 高级原生开发

> 来源：https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/napi-xcomponent-guidelines
> 版本基准：HarmonyOS 5 / API 12+

## 用途

在 HarmonyOS 应用中实现高性能 Native 渲染（EGL/Vulkan）、C++ 侧资源访问、Native 与 ArkTS 双向调用、第三方 C++ 库移植，以及使用 LLVM Sanitizers 进行内存/线程调试。

## 何时使用

- 需要自定义 GPU 渲染（游戏引擎、视频播放器、3D 可视化）
- 在 C++ 层直接读取 rawfile 资源（模型、着色器、配置文件）
- Native 异步任务完成后需要回调通知 ArkTS 层
- 移植已有的跨平台 C++ 库到鸿蒙
- 排查 Native 层内存越界、数据竞争等问题

## XComponent + EGL 渲染

### ArkTS 侧声明

```typescript
@Component
struct MyRenderView {
  build() {
    XComponent({
      id: 'myGLView',
      type: XComponentType.SURFACE,  // SURFACE 类型提供 NativeWindow
      libraryname: 'nativerender'    // 对应 C++ 编译产物 libnativerender.so
    })
  }
}
```

### C++ 侧注册回调与 EGL 初始化骨架

```cpp
// napi_init.cpp — 模块注册入口
#include <ace/xcomponent/native_interface_xcomponent.h>
#include <EGL/egl.h>
#include <GLES3/gl3.h>

// 回调函数签名
void OnSurfaceCreatedCB(OH_NativeXComponent *component, void *window) {
    // 1. 获取尺寸
    uint64_t width, height;
    OH_NativeXComponent_GetXComponentSize(component, window, &width, &height);

    // 2. EGL 初始化（window 即 EGLNativeWindowType）
    EGLDisplay display = eglGetDisplay(EGL_DEFAULT_DISPLAY);
    eglInitialize(display, nullptr, nullptr);
    EGLConfig config;
    EGLint numConfigs;
    EGLint attribs[] = {
        EGL_SURFACE_TYPE, EGL_WINDOW_BIT,
        EGL_RED_SIZE, 8, EGL_GREEN_SIZE, 8, EGL_BLUE_SIZE, 8,
        EGL_RENDERABLE_TYPE, EGL_OPENGL_ES3_BIT, EGL_NONE
    };
    eglChooseConfig(display, attribs, &config, 1, &numConfigs);
    EGLSurface surface = eglCreateWindowSurface(display, config,
        static_cast<EGLNativeWindowType>(window), nullptr);
    EGLint ctxAttribs[] = { EGL_CONTEXT_CLIENT_VERSION, 3, EGL_NONE };
    EGLContext context = eglCreateContext(display, config, EGL_NO_CONTEXT, ctxAttribs);
    eglMakeCurrent(display, surface, surface, context);

    // 3. 开始 GL 渲染循环...
}

void OnSurfaceDestroyedCB(OH_NativeXComponent *component, void *window) {
    // 释放 EGL 资源：eglDestroySurface, eglDestroyContext, eglTerminate
}

// NAPI 模块 Init 中注册回调
static napi_value Init(napi_env env, napi_value exports) {
    napi_value xcomponentObj;
    OH_NativeXComponent *xcomponent = nullptr;
    napi_get_named_property(env, exports, OH_NATIVE_XCOMPONENT_OBJ, &xcomponentObj);
    napi_unwrap(env, xcomponentObj, reinterpret_cast<void **>(&xcomponent));

    static OH_NativeXComponent_Callback callback;
    callback.OnSurfaceCreated = OnSurfaceCreatedCB;
    callback.OnSurfaceDestroyed = OnSurfaceDestroyedCB;
    callback.OnSurfaceChanged = nullptr;       // 可选
    callback.DispatchTouchEvent = nullptr;      // 可选
    OH_NativeXComponent_RegisterCallback(xcomponent, &callback);
    return exports;
}
```

**CMakeLists 关键依赖**：

```cmake
target_link_libraries(nativerender PUBLIC
    libace_napi.z.so libace_ndk.z.so libnative_window.so libEGL.so libGLESv3.so)
```

## XComponent + Vulkan 渲染

Vulkan 通过 `VK_OHOS_surface` 扩展将 OHNativeWindow 转为 VkSurfaceKHR：

```cpp
#include <vulkan/vulkan.h>
// 鸿蒙扩展头
#include <vulkan/vulkan_ohos.h>

// window 来自 OnSurfaceCreatedCB 的第二个参数
VkSurfaceCreateInfoOHOS createInfo = {};
createInfo.sType = VK_STRUCTURE_TYPE_SURFACE_CREATE_INFO_OHOS;
createInfo.window = static_cast<OHNativeWindow *>(window);
vkCreateSurfaceOHOS(instance, &createInfo, nullptr, &surface);
// 后续正常创建 Swapchain、RenderPass 等
```

**注意**：通过 `dlopen("libvulkan.so", ...)` 动态加载时，CMake 中**不要**链接 `libvulkan.so`，否则符号冲突。静态链接则正常添加。

## rawfile C++ 侧访问

通过 `NativeResourceManager` 在 C++ 侧读取 `resources/rawfile/` 下的文件。

```cpp
#include <rawfile/raw_file_manager.h>
#include <rawfile/raw_file.h>
#include <rawfile/raw_dir.h>

// NAPI 导出函数，ArkTS 侧传入 resourceManager 对象
napi_value ReadRawFile(napi_env env, napi_callback_info info) {
    size_t argc = 2;
    napi_value argv[2];
    napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

    // 1. 初始化（argv[0] = resourceManager JS 对象）
    NativeResourceManager *mgr =
        OH_ResourceManager_InitNativeResourceManager(env, argv[0]);

    // 2. 打开文件（argv[1] = 文件名字符串）
    char fileName[256];
    size_t len;
    napi_get_value_string_utf8(env, argv[1], fileName, sizeof(fileName), &len);
    RawFile *file = OH_ResourceManager_OpenRawFile(mgr, fileName);

    // 3. 读取
    long size = OH_ResourceManager_GetRawFileSize(file);
    auto buf = std::make_unique<uint8_t[]>(size);
    OH_ResourceManager_ReadRawFile(file, buf.get(), size);

    // 4. 释放
    OH_ResourceManager_CloseRawFile(file);
    OH_ResourceManager_ReleaseNativeResourceManager(mgr);

    // 返回 ArrayBuffer 给 ArkTS...
    napi_value result;
    void *data;
    napi_create_arraybuffer(env, size, &data, &result);
    memcpy(data, buf.get(), size);
    return result;
}
```

**CMake 依赖**：`target_link_libraries(... librawfile.z.so)`

**ArkTS 调用**：`nativeModule.readRawFile(getContext().resourceManager, 'model.bin')`

## Native 调用 ArkTS（napi_call_function）

### 同步调用（主线程）

```cpp
// ArkTS 侧将回调函数传入 native
// native 侧接收并调用
napi_value NativeDoWork(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value argv[1];
    napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
    // argv[0] 是 ArkTS 传入的 callback function

    napi_value global;
    napi_get_global(env, &global);

    // 构造参数
    napi_value arg;
    napi_create_string_utf8(env, "done", NAPI_AUTO_LENGTH, &arg);

    // 调用 ArkTS 函数
    napi_value result;
    napi_call_function(env, global, argv[0], 1, &arg, &result);
    return nullptr;
}
```

### 异步跨线程调用（napi_threadsafe_function）

当 Native 工作线程需要回调 ArkTS 时，必须使用线程安全函数：

```cpp
napi_threadsafe_function tsfn;

// 主线程创建
napi_create_threadsafe_function(env, jsCallback, nullptr, workName,
    0, 1, nullptr, nullptr, nullptr, CallJsCallback, &tsfn);

// 工作线程调用（线程安全）
napi_call_threadsafe_function(tsfn, data, napi_tsfn_blocking);

// CallJsCallback 在 JS 线程执行
void CallJsCallback(napi_env env, napi_value jsCb, void *ctx, void *data) {
    napi_value argv;
    napi_create_int32(env, *static_cast<int *>(data), &argv);
    napi_call_function(env, nullptr, jsCb, 1, &argv, nullptr);
}

// 完成后释放
napi_release_threadsafe_function(tsfn, napi_tsfn_release);
```

## 第三方 C++ 库交叉编译

### ohos.toolchain.cmake 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `OHOS_ARCH` | 目标架构：`arm64-v8a` / `armeabi-v7a` / `x86_64` | `arm64-v8a` |
| `OHOS_STL` | C++ 运行时：`c++_shared` / `c++_static` | `c++_shared` |
| `CMAKE_TOOLCHAIN_FILE` | 指向 `ohos.toolchain.cmake` | - |

### 编译命令模板

```bash
# 环境变量
export OHOS_NDK=$HOME/Library/OpenHarmony/Sdk/12/native  # macOS 示例

# CMake 配置 + 构建
mkdir build && cd build
$OHOS_NDK/build-tools/cmake/bin/cmake \
  -DCMAKE_TOOLCHAIN_FILE=$OHOS_NDK/build/cmake/ohos.toolchain.cmake \
  -DOHOS_ARCH=arm64-v8a \
  -DOHOS_STL=c++_shared \
  -DCMAKE_INSTALL_PREFIX=./install \
  -DCMAKE_BUILD_TYPE=Release \
  ..

cmake --build . --parallel
cmake --install .
```

### 非 CMake 项目（Autotools / Makefile）

```bash
export CC="$OHOS_NDK/llvm/bin/clang --target=aarch64-linux-ohos --sysroot=$OHOS_NDK/sysroot"
export CXX="$OHOS_NDK/llvm/bin/clang++ --target=aarch64-linux-ohos --sysroot=$OHOS_NDK/sysroot"
export AR="$OHOS_NDK/llvm/bin/llvm-ar"
./configure --host=aarch64-linux-ohos --prefix=$PWD/install
make -j$(nproc) && make install
```

### 在应用工程中引用编译产物

```cmake
# entry/src/main/cpp/CMakeLists.txt
set(THIRD_PARTY ${CMAKE_CURRENT_SOURCE_DIR}/../../../libs)
add_library(thirdlib SHARED IMPORTED)
set_target_properties(thirdlib PROPERTIES
    IMPORTED_LOCATION ${THIRD_PARTY}/${OHOS_ARCH}/libthirdlib.so)
target_include_directories(myapp PRIVATE ${THIRD_PARTY}/include)
target_link_libraries(myapp thirdlib)
```

## LLVM Sanitizers

DevEco Studio 内置 ASan 和 TSan 支持，无需手动改编译参数。

### ASan（Address Sanitizer）

检测：堆/栈越界、use-after-free、double-free。

**启用方式**：DevEco Studio -> Run/Debug 配置 -> Diagnostics -> 勾选 Address Sanitizer。

**模块级配置**（`build-profile.json5`）：

```json5
{
  "buildOption": {
    "externalNativeOptions": {
      "arguments": "-DOHOS_ENABLE_ASAN=ON"
    }
  }
}
```

**关键约束**：若任何模块启用 ASan，entry 模块也必须启用，否则应用启动即崩溃。

### TSan（Thread Sanitizer）

检测：数据竞争、死锁。

**启用方式**：DevEco Studio -> Run/Debug 配置 -> Diagnostics -> 勾选 Thread Sanitizer。

配置参数：`-DOHOS_ENABLE_TSAN=ON`

**ASan 与 TSan 不可同时启用**，需分别构建调试。

### 手动 CMake 方式（脱离 DevEco）

```cmake
# 仅用于调试构建
set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -fsanitize=address -fno-omit-frame-pointer")
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fsanitize=address -fno-omit-frame-pointer")
set(CMAKE_SHARED_LINKER_FLAGS "${CMAKE_SHARED_LINKER_FLAGS} -fsanitize=address")
```

运行时约 2-3x 性能开销，仅限调试阶段使用。

## 常见陷阱

1. **XComponent id 必须全局唯一**：多个 XComponent 实例使用相同 id 会导致回调混乱。

2. **EGL 上下文线程绑定**：`eglMakeCurrent` 绑定到当前线程，渲染线程切换须先 `eglMakeCurrent(display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT)` 解绑。

3. **Vulkan dlopen 与 CMake 冲突**：如果用 `dlopen` 加载 `libvulkan.so`，CMake 中不要 `target_link_libraries(... libvulkan.so)`，二者只选其一。

4. **rawfile 路径不含前缀**：`OH_ResourceManager_OpenRawFile(mgr, "data.json")` 直接传文件名，不要加 `rawfile/` 前缀。

5. **napi_call_function 只能在 JS 线程调用**：工作线程回调 ArkTS 必须走 `napi_threadsafe_function`，直接调用导致崩溃。

6. **ASan entry 模块强制开启**：只在子模块开 ASan 而不开 entry 模块，应用会 CPP Crash。

7. **交叉编译 STL 一致性**：第三方库与主工程必须使用相同的 `OHOS_STL` 设置（`c++_shared` 或 `c++_static`），混用导致 ABI 不兼容。

## 组合提示

- NAPI 基础绑定机制 --> `harmony-napi-binding` skill
- Native 工程结构与 CMake 配置 --> `harmony-native-project` skill
- 并发模型（TaskPool / Worker） --> `harmony-concurrency` skill
- 多媒体能力（相机、音视频） --> `harmony-media` skill
