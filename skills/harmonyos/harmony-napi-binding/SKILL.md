---
name: harmony-napi-binding
description: "HarmonyOS NAPI C++ 绑定：类型映射、ArkTS<->C++ 转换、异步工作、线程安全函数。"
tech_stack: [harmonyos, mobile-native]
language: [cpp]
---

# HarmonyOS NAPI C++ 绑定

> 来源：https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/use-napi-process-overview
> 版本基准：HarmonyOS 5 / API 12+

## 用途

Node-API (NAPI) 是 HarmonyOS 中 ArkTS 与 C/C++ 跨语言交互的标准接口层。通过 NAPI，C++ 侧可以接收 ArkTS 传入的参数、执行原生计算、回调 ArkTS 函数，实现高性能原生能力集成。

## 何时使用

- 需要复用已有 C/C++ 库（音视频编解码、加密、图像处理等）
- 计算密集任务需下沉到 Native 层以获得性能优势
- 需要调用 HarmonyOS NDK 原生系统能力
- 需要在 C++ 子线程完成异步任务后回调 ArkTS 侧

## NAPI 概览与架构

```
ArkTS 侧                    Native 侧
+-----------+               +-------------------+
| import    |   libxxx.so   | napi_module       |
| nativeLib |  <--------->  | Init() 注册方法   |
| .foo()    |   napi_value  | Foo(napi_env,     |
+-----------+               |   napi_callback_info)
                            +-------------------+
```

核心约束：
- `napi_env` 绑定 JS 线程，**禁止跨线程使用**，禁止缓存
- `napi_value` 是所有 ArkTS 值在 Native 侧的不透明句柄
- Native 方法在 JS 线程同步执行，耗时操作必须走异步

## 模块注册（napi_module / RegisterEntryModule）

```cpp
#include "napi/native_api.h"

// 模块初始化：将 C++ 函数绑定到 exports 对象
static napi_value Init(napi_env env, napi_value exports) {
    // 注册属性/方法（见下方 napi_define_properties）
    return exports;
}

// 模块描述
static napi_module demoModule = {
    .nm_version = 1,
    .nm_flags = 0,
    .nm_filename = nullptr,
    .nm_register_func = Init,
    .nm_modname = "entry",  // 对应 ArkTS: import xxx from 'libentry.so'
    .nm_priv = nullptr,
    .reserved = {0},
};

// so 加载时自动调用
extern "C" __attribute__((constructor)) void RegisterEntryModule(void) {
    napi_module_register(&demoModule);
}
```

**命名规则**：`nm_modname = "entry"` 对应 so 文件 `libentry.so`，ArkTS 侧 `import nativeLib from 'libentry.so'`。大小写必须一致。

## 类型映射速查表

| ArkTS 类型 | napi 类型枚举 | C++ 取值 API | C++ 创建 API |
|-----------|--------------|-------------|-------------|
| `number` (int32) | `napi_number` | `napi_get_value_int32` | `napi_create_int32` |
| `number` (uint32) | `napi_number` | `napi_get_value_uint32` | `napi_create_uint32` |
| `number` (int64) | `napi_number` | `napi_get_value_int64` | `napi_create_int64` |
| `number` (double) | `napi_number` | `napi_get_value_double` | `napi_create_double` |
| `boolean` | `napi_boolean` | `napi_get_value_bool` | `napi_get_boolean` |
| `string` | `napi_string` | `napi_get_value_string_utf8` | `napi_create_string_utf8` |
| `undefined` | `napi_undefined` | -- | `napi_get_undefined` |
| `null` | `napi_null` | -- | `napi_get_null` |
| `Object` | `napi_object` | `napi_get_property` | `napi_create_object` + `napi_set_named_property` |
| `ArrayBuffer` | `napi_arraybuffer` | `napi_get_arraybuffer_info` | `napi_create_arraybuffer` |
| `TypedArray` | `napi_typedarray` | `napi_get_typedarray_info` | `napi_create_typedarray` |
| `Function` | `napi_function` | `napi_call_function` | `napi_create_function` |

类型检查：`napi_typeof(env, value, &type)` 返回 `napi_valuetype` 枚举。

## ArkTS -> C++ 取值

### 字符串（两次调用模式）

```cpp
// 第一次调用：buf=nullptr，获取长度
size_t len = 0;
napi_get_value_string_utf8(env, value, nullptr, 0, &len);
// 第二次调用：分配 buffer 并读取（+1 为 \0 终止符）
std::string str(len + 1, '\0');
napi_get_value_string_utf8(env, value, &str[0], len + 1, &len);
str.resize(len);  // 去除尾部多余 \0
```

### 数值 / 布尔

```cpp
int32_t intVal;    napi_get_value_int32(env, value, &intVal);
double  dblVal;    napi_get_value_double(env, value, &dblVal);
bool    boolVal;   napi_get_value_bool(env, value, &boolVal);
```

### TypedArray（如 Uint8Array）

```cpp
napi_typedarray_type type;
size_t length, offset;
napi_value arraybuffer;
void* data;
napi_get_typedarray_info(env, value, &type, &length, &data, &arraybuffer, &offset);
// data 指向底层内存，length 为元素个数
uint8_t* bytes = static_cast<uint8_t*>(data);
```

### 函数参数获取

```cpp
static napi_value MyFunc(napi_env env, napi_callback_info info) {
    size_t argc = 2;
    napi_value argv[2];
    napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
    // argv[0], argv[1] 即为 ArkTS 传入的参数
}
```

## C++ -> ArkTS 创值

```cpp
// 字符串
napi_value jsStr;
napi_create_string_utf8(env, "hello", NAPI_AUTO_LENGTH, &jsStr);

// 数值
napi_value jsNum;
napi_create_int32(env, 42, &jsNum);

// ArrayBuffer + TypedArray
void* buf = nullptr;
napi_value arrayBuffer;
napi_create_arraybuffer(env, byteLength, &buf, &arrayBuffer);
memcpy(buf, srcData, byteLength);

napi_value typedArray;
napi_create_typedarray(env, napi_uint8_array, byteLength, arrayBuffer, 0, &typedArray);

// Object
napi_value obj;
napi_create_object(env, &obj);
napi_set_named_property(env, obj, "code", jsNum);
napi_set_named_property(env, obj, "msg", jsStr);
```

## 回调注册（napi_define_properties）

```cpp
static napi_value Add(napi_env env, napi_callback_info info) {
    size_t argc = 2;
    napi_value argv[2];
    napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
    double a, b;
    napi_get_value_double(env, argv[0], &a);
    napi_get_value_double(env, argv[1], &b);
    napi_value result;
    napi_create_double(env, a + b, &result);
    return result;
}

static napi_value Init(napi_env env, napi_value exports) {
    napi_property_descriptor desc[] = {
        // {utf8name, name, method, getter, setter, value, attributes, data}
        {"add", nullptr, Add, nullptr, nullptr, nullptr, napi_default, nullptr},
    };
    napi_define_properties(env, exports, sizeof(desc) / sizeof(desc[0]), desc);
    return exports;
}
```

ArkTS 侧调用：`nativeLib.add(1, 2)  // 返回 3`

## 异步工作（napi_create_async_work）

适用于耗时操作（文件 I/O、计算密集），返回 Promise。模式：execute 在工作线程执行（禁止调用 napi），complete 回到 JS 线程处理结果。

```cpp
struct AsyncData {
    napi_async_work work;
    napi_deferred deferred;
    // 输入/输出数据
    int input;
    int result;
};

// 工作线程执行（禁止调用任何 napi_ 接口）
static void Execute(napi_env env, void* data) {
    AsyncData* d = static_cast<AsyncData*>(data);
    d->result = d->input * d->input;  // 模拟耗时计算
}

// JS 线程回调（可以调用 napi_ 接口）
static void Complete(napi_env env, napi_status status, void* data) {
    AsyncData* d = static_cast<AsyncData*>(data);
    napi_value jsResult;
    napi_create_int32(env, d->result, &jsResult);
    // resolve Promise
    napi_resolve_deferred(env, d->deferred, jsResult);
    // 清理
    napi_delete_async_work(env, d->work);
    delete d;
}

// 入口函数：ArkTS 调用后立即返回 Promise
static napi_value ComputeAsync(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value argv[1];
    napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

    auto* d = new AsyncData();
    napi_get_value_int32(env, argv[0], &d->input);

    // 创建 Promise
    napi_value promise;
    napi_create_promise(env, &d->deferred, &promise);

    // 创建异步工作
    napi_value resourceName;
    napi_create_string_utf8(env, "computeAsync", NAPI_AUTO_LENGTH, &resourceName);
    napi_create_async_work(env, nullptr, resourceName, Execute, Complete, d, &d->work);

    // 入队执行
    napi_queue_async_work(env, d->work);
    return promise;  // 返回 Promise 给 ArkTS
}
```

ArkTS 侧：`let result = await nativeLib.computeAsync(5)  // 25`

**错误处理**：在 Complete 中检查 status，失败时用 `napi_reject_deferred` reject Promise。

## 线程安全函数（napi_threadsafe_function）

适用于 C++ 子线程（pthread / std::thread）需要回调 ArkTS 函数的场景。因为 `napi_env` 不能跨线程，必须通过线程安全函数将调用调度回 JS 线程。

```cpp
struct TsfnData {
    napi_threadsafe_function tsfn;
    napi_async_work work;
};

// JS 线程中执行的回调（由 tsfn 调度触发）
static void CallJs(napi_env env, napi_value jsCb, void* context, void* data) {
    if (env == nullptr) return;  // tsfn 被释放时 env 为 null
    int* val = static_cast<int*>(data);
    napi_value jsVal;
    napi_create_int32(env, *val, &jsVal);
    napi_value undefined;
    napi_get_undefined(env, &undefined);
    napi_call_function(env, undefined, jsCb, 1, &jsVal, nullptr);
    delete val;
}

// 工作线程：通过 tsfn 向 JS 线程投递数据
static void WorkerExecute(napi_env env, void* data) {
    auto* d = static_cast<TsfnData*>(data);
    for (int i = 0; i < 5; i++) {
        int* val = new int(i);
        napi_call_threadsafe_function(d->tsfn, val, napi_tsfn_blocking);
    }
}

// 工作完成后释放资源
static void WorkerComplete(napi_env env, napi_status status, void* data) {
    auto* d = static_cast<TsfnData*>(data);
    napi_release_threadsafe_function(d->tsfn, napi_tsfn_release);
    napi_delete_async_work(env, d->work);
    delete d;
}

// ArkTS 调用入口：传入一个 JS 回调函数
static napi_value StartWorker(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value argv[1];
    napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
    napi_value jsCb = argv[0];  // ArkTS 传入的回调函数

    auto* d = new TsfnData();

    // 创建线程安全函数
    napi_value resourceName;
    napi_create_string_utf8(env, "tsfnDemo", NAPI_AUTO_LENGTH, &resourceName);
    napi_create_threadsafe_function(
        env,
        jsCb,           // JS 回调函数
        nullptr,        // async_resource
        resourceName,   // async_resource_name
        0,              // max_queue_size (0 = 无限制)
        1,              // initial_thread_count
        nullptr,        // thread_finalize_data
        nullptr,        // thread_finalize_cb
        nullptr,        // context
        CallJs,         // call_js_cb
        &d->tsfn
    );

    // 创建异步工作驱动子线程
    napi_create_async_work(env, nullptr, resourceName,
        WorkerExecute, WorkerComplete, d, &d->work);
    napi_queue_async_work(env, d->work);

    napi_value undefined;
    napi_get_undefined(env, &undefined);
    return undefined;
}
```

ArkTS 侧：`nativeLib.startWorker((val: number) => { console.log('收到:', val) })`

**关键参数**：
- `max_queue_size`：0 表示无限队列；有限值可防止生产者过快
- `initial_thread_count`：调用 `napi_acquire_threadsafe_function` 的线程数
- `napi_tsfn_blocking` vs `napi_tsfn_nonblocking`：队列满时阻塞等待或立即返回错误

## 引用与生命周期管理

`napi_value` 是局部句柄，函数返回后即可能被 GC 回收。跨调用保持 JS 对象需使用引用。

```cpp
napi_ref ref;
// 创建强引用（ref_count=1，阻止 GC）
napi_create_reference(env, jsObject, 1, &ref);

// 从引用获取 napi_value
napi_value obj;
napi_get_reference_value(env, ref, &obj);

// 释放引用
napi_delete_reference(env, ref);
```

**HandleScope**：在循环中大量创建 `napi_value` 时，用 scope 限制句柄生命周期防止泄漏。

```cpp
for (int i = 0; i < 10000; i++) {
    napi_handle_scope scope;
    napi_open_handle_scope(env, &scope);
    // ... 创建临时 napi_value ...
    napi_close_handle_scope(env, scope);
}
```

## 常见陷阱

| 陷阱 | 症状 | 解决方案 |
|------|------|----------|
| Execute 中调用 napi 接口 | 崩溃 / 未定义行为 | Execute 只做纯 C++ 计算，napi 调用放 Complete |
| 缓存或跨线程使用 napi_env | 崩溃 | napi_env 严格绑定创建线程，不可缓存不可传递 |
| 子线程直接 napi_call_function | Ark 运行时拒绝访问 | 改用 napi_threadsafe_function 调度回 JS 线程 |
| 字符串转换忘记 +1 | 截断 / 乱码 | buf 大小为 `stringSize + 1`（C 字符串 \0 终止符） |
| 忘记 napi_delete_async_work | 内存泄漏 | Complete 回调中必须 delete work |
| napi_value 逃逸出函数作用域 | 悬垂引用 | 用 napi_create_reference 创建持久引用 |
| 循环创建大量 napi_value | 句柄表溢出 | 用 napi_open/close_handle_scope 分批管理 |
| tsfn 忘记 release | 进程无法正常退出 | 所有线程完成后调用 napi_release_threadsafe_function |
| nm_modname 与 so 文件名不匹配 | 模块加载失败 | `"entry"` 对应 `libentry.so`，大小写一致 |
