---
name: android-jni-binding
description: "Android JNI 绑定：函数签名、类型映射、字符串/数组/ByteBuffer、引用管理、线程、异常处理。"
tech_stack: [compose]
---

# Android JNI 绑定模式

> 来源：https://developer.android.com/training/articles/perf-jni
> 版本基准：NDK r27+ / JNI 1.6

## 用途

JNI（Java Native Interface）是 Java/Kotlin 与 C/C++ 代码之间的双向调用桥梁。在 Android 上用于访问平台原生库、执行性能敏感计算、复用已有 C/C++ 代码库。

## 何时使用

- 需要调用已有的 C/C++ 库（OpenCV、FFmpeg、自研引擎等）
- 性能关键路径（音视频编解码、图像处理、加密）
- 需要直接操作硬件或系统底层 API
- 与 Rust/Go 等编译为共享库的语言互操作
- 需要零拷贝在 Java 与 Native 之间传递大块内存

## JNI 函数命名与签名规则

### 静态注册（名称匹配）

C/C++ 函数名必须严格遵循格式：

```cpp
extern "C" JNIEXPORT jstring JNICALL
Java_com_example_app_MyClass_myMethod(JNIEnv *env, jobject thiz, jint arg)
```

规则：`Java_` + 包名（`.` 换 `_`）+ `_` + 类名 + `_` + 方法名。`extern "C"` 防止 C++ 名称修饰。

### 方法签名字符串

格式为 `(参数类型)返回类型`，无空格无逗号：

```
long f(int n, String s, int[] arr)  →  (ILjava/lang/String;[I)J
void g()                            →  ()V
boolean h(byte[] data)              →  ([B)Z
```

类名用 `/` 分隔包路径，以 `L` 开头 `;` 结尾；数组前缀 `[`。

## 类型映射速查表

### 基本类型

| Java 类型  | JNI 类型    | C++ 类型          | 签名字符 |
|-----------|------------|------------------|---------|
| boolean   | jboolean   | uint8_t          | Z       |
| byte      | jbyte      | int8_t           | B       |
| char      | jchar      | uint16_t         | C       |
| short     | jshort     | int16_t          | S       |
| int       | jint       | int32_t          | I       |
| long      | jlong      | int64_t          | J       |
| float     | jfloat     | float            | F       |
| double    | jdouble    | double           | D       |
| void      | void       | void             | V       |

> 注意：`Z` 是 boolean、`B` 是 byte、`J` 是 long（不是 L）。

### 引用类型

| Java 类型           | JNI 类型         | 签名              |
|--------------------|-----------------|-------------------|
| Object             | jobject         | Ljava/lang/Object; |
| String             | jstring         | Ljava/lang/String; |
| Class              | jclass          | Ljava/lang/Class;  |
| Throwable          | jthrowable      | Ljava/lang/Throwable; |
| int[]              | jintArray       | [I                |
| Object[]           | jobjectArray    | [Ljava/lang/Object; |
| Map.Entry (内部类)  | jobject         | Ljava/util/Map$Entry; |

## 字符串处理

### 标准模式（Modified UTF-8）

```cpp
const char *utf = env->GetStringUTFChars(jstr, nullptr);
if (utf == nullptr) return;  // OOM，必须检查 NULL
// 使用 utf...
env->ReleaseStringUTFChars(jstr, utf);  // 必须释放
```

### 推荐：Region 方式（无需释放、无 pin）

```cpp
jsize len = env->GetStringLength(jstr);  // UTF-16 字符数
jchar buf[256];
env->GetStringRegion(jstr, 0, len, buf);
// buf 是栈上缓冲区，无需 Release
```

### 创建 Java 字符串

```cpp
jstring result = env->NewStringUTF("hello");  // Modified UTF-8 输入
```

> Modified UTF-8 将 `\u0000` 编码为 `0xC0 0x80`（非标准 UTF-8）。传入非法序列在 CheckJNI 模式下会直接 abort。

## 数组操作

### 基本数组

```cpp
jint *data = env->GetIntArrayElements(array, nullptr);
if (data == nullptr) return;
// 使用 data[0..len-1]
env->ReleaseIntArrayElements(array, data, 0);
// mode: 0=回写+释放, JNI_COMMIT=回写+保留, JNI_ABORT=丢弃+释放
```

**即使 isCopy 为 false 也必须调用 Release**（否则数组被 pin 住无法 GC）。

### 推荐：Region 方式

```cpp
jint buf[1024];
env->GetIntArrayRegion(array, 0, len, buf);  // 复制到栈，无需 Release
env->SetIntArrayRegion(array, 0, len, buf);  // 回写
```

### 循环中处理对象数组

```cpp
for (int i = 0; i < len; i++) {
    jobject elem = env->GetObjectArrayElement(arr, i);
    // 处理 elem...
    env->DeleteLocalRef(elem);  // 循环内必须手动释放
}
```

## ByteBuffer（零拷贝）

```cpp
// Native → Java：包装已有内存
void *nativeBuf = malloc(size);
jobject byteBuffer = env->NewDirectByteBuffer(nativeBuf, size);

// Java → Native：获取指针
void *addr = env->GetDirectBufferAddress(byteBuffer);
jlong cap  = env->GetDirectBufferCapacity(byteBuffer);
```

选择依据：多数访问在 C++ 侧则用 DirectByteBuffer；多数访问在 Java 侧则用 `byte[]`。DirectByteBuffer 的 Java 侧访问较慢，但省去跨边界拷贝。

## 引用管理（Local / Global / Weak）

### Local Reference

- 在 native 方法返回时**自动释放**
- **仅在创建它的线程有效**，不可跨线程传递
- Android 8.0+ 无数量上限；8.0 之前约 **512 个上限**
- 循环中创建大量引用时必须手动 `DeleteLocalRef` 或用 `PushLocalFrame/PopLocalFrame`

### Global Reference

```cpp
jclass cls = env->FindClass("com/example/MyClass");
g_cls = (jclass)env->NewGlobalRef(cls);   // 提升为全局引用
env->DeleteLocalRef(cls);                  // 释放原 local ref

// 使用完毕后必须手动释放
env->DeleteGlobalRef(g_cls);
```

- 跨线程、跨 native 调用有效
- **永远不会被自动释放**，必须显式 `DeleteGlobalRef`
- 泄漏全局引用是 JNI 最常见的内存泄漏来源

### Weak Global Reference

```cpp
jweak weakRef = env->NewWeakGlobalRef(obj);
// 使用前必须检查是否已被 GC
if (env->IsSameObject(weakRef, nullptr)) { /* 已回收 */ }
```

> 比较引用永远用 `IsSameObject()`，不要用 `==`。

## 线程附着（AttachCurrentThread）

```cpp
// 在非 Java 创建的原生线程中调用 JNI
JavaVM *g_vm;  // 在 JNI_OnLoad 中缓存
JNIEnv *env;
g_vm->AttachCurrentThread(&env, nullptr);
// 现在可以使用 env 做 JNI 调用...
g_vm->DetachCurrentThread();  // 线程退出前必须调用，否则进程 abort
```

### 自动 Detach（推荐）

```cpp
pthread_key_t tls_key;
pthread_key_create(&tls_key, [](void *) {
    g_vm->DetachCurrentThread();
});
// Attach 后存入 TLS
pthread_setspecific(tls_key, env);
```

关键规则：
- `AttachCurrentThread` 对已附着线程是 no-op（可安全重复调用）
- 附着线程中创建的 local reference **不会自动释放**，必须手动 `DeleteLocalRef`
- `JNIEnv` 是线程私有的，**绝对不可跨线程共享**；`JavaVM` 可跨线程

## 异常处理

```cpp
env->CallVoidMethod(obj, methodId);
if (env->ExceptionCheck()) {
    env->ExceptionDescribe();  // 打印到 logcat（调试用）
    env->ExceptionClear();     // 必须先清除才能继续调 JNI
    // 处理错误或 return
    return;
}
```

关键规则：
- Java 异常**不会展开 C++ 栈帧**，native 代码会继续执行
- 有 pending exception 时，只能调用少数 JNI 函数（Release 系列、Delete 系列、ExceptionCheck/Clear）
- C++ 异常**绝不能穿越 JNI 边界**，必须在 native 侧捕获

### 从 Native 抛出 Java 异常

```cpp
jclass excCls = env->FindClass("java/lang/IllegalArgumentException");
env->ThrowNew(excCls, "buffer size must be positive");
return;  // 抛出后应立即 return
```

## RegisterNatives（动态注册）

```cpp
static JNINativeMethod methods[] = {
    {"nativeFoo", "()V",                    (void *)foo_impl},
    {"nativeBar", "(Ljava/lang/String;I)Z", (void *)bar_impl},
};

JNIEXPORT jint JNI_OnLoad(JavaVM *vm, void *) {
    JNIEnv *env;
    if (vm->GetEnv((void **)&env, JNI_VERSION_1_6) != JNI_OK)
        return JNI_ERR;

    jclass cls = env->FindClass("com/example/MyClass");
    if (cls == nullptr) return JNI_ERR;

    env->RegisterNatives(cls, methods,
                         sizeof(methods) / sizeof(methods[0]));
    return JNI_VERSION_1_6;
}
```

优势：
- C++ 函数名自由命名，无需遵循 `Java_pkg_Class_method` 格式
- 注册时即校验签名错误（静态注册要到运行时才发现）
- 配合 `-fvisibility=hidden` 仅导出 `JNI_OnLoad`，减小二进制体积

Java/Kotlin 侧加载：

```kotlin
companion object {
    init { System.loadLibrary("mylib") }
}
external fun nativeFoo()
external fun nativeBar(s: String, i: Int): Boolean
```

## 常见陷阱

1. **忘记 Release**：`GetStringUTFChars`/`Get*ArrayElements` 必须配对 Release，否则内存泄漏或 GC 无法回收
2. **循环中 Local Ref 溢出**：循环内调用返回 jobject 的 JNI 函数，不手动 DeleteLocalRef 会撑爆引用表
3. **跨线程传递 JNIEnv**：JNIEnv 是线程私有的，跨线程使用会导致崩溃
4. **跨线程传递 Local Ref**：Local Reference 只在创建线程有效，跨线程需提升为 Global Ref
5. **附着线程忘记 Detach**：Android 上线程退出时仍附着会直接 abort 进程
6. **忽略 ExceptionCheck**：JNI 调用后不检查异常，后续调用行为未定义
7. **C++ 异常穿越 JNI**：C++ 异常跨过 JNI 边界是未定义行为，必须在 native 侧 catch
8. **Modified UTF-8 与标准 UTF-8 混淆**：`NewStringUTF` 接受的是 Modified UTF-8，传入含 4 字节 UTF-8 序列（如 emoji）的标准 UTF-8 会出错
9. **用 `==` 比较 jobject**：必须用 `IsSameObject()`，引用值不保证稳定
