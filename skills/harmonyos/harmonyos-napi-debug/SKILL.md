---
name: harmonyos-napi-debug
description: ArkTS 与 C++ NAPI 混编崩溃排障：调用链追踪、跨边界崩溃归属判断、threadsafe_function 死锁定位、GC 与 napi_ref 引用计数陷阱排查
tech_stack: [harmonyos]
language: [cpp, arkts]
capability: [observability]
version: "HarmonyOS unversioned"
collected_at: 2025-01-15
---

# ArkTS 与 C++ NAPI 混编调试

> Source: https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/napi-faq-about-stability, https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-hvigor-build-profile-app, https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-hvigor-faqs

## Purpose

当 ArkTS 层调用 NAPI 暴露的 C++ 接口时，调用链跨越两个运行时（ArkTS VM 与 Native），崩溃和异常往往出现在边界处。本技能提供跨边界排障的方法论：从 crash 堆栈判断崩溃归属（ArkTS 侧还是 C++ 侧）、追踪 NAPI 调用链、定位 threadsafe_function 死锁、排查 GC 与 napi_ref 泄漏。

## When to Use

- ArkTS 调用 NAPI 接口后应用 crash，需要快速判断是 ArkTS 传参问题还是 C++ 内存错误
- 使用 `napi_threadsafe_function` 后出现死锁、ANR 或回调不触发
- C++ Native 模块出现随机崩溃，怀疑与 GC 回收时机或跨线程对象生命周期相关
- 内存持续上涨，排查 `napi_ref` 泄漏
- 分析 crash 堆栈中的 native 帧归属（是 NAPI 框架帧还是业务 .so 帧）

## Basic Usage

### 1. 崩溃归属快速判断

拿到 crash 堆栈后，按以下决策树判断：

```
崩溃信号是什么？
├── SIGSEGV (signal 11) → C++ 侧空指针/野指针/越界
├── SIGABRT (signal 6)  → 主动 abort，检查 hilog 前几条
├── SIGBUS (signal 7)   → 对齐错误或 mmap 失败
└── JS 异常（无 native 信号）→ ArkTS 侧逻辑错误

堆栈帧归属哪个 .so？
├── libace_napi.z.so    → NAPI 框架内部，通常是参数类型不匹配或 napi_value 生命周期问题
├── libark_jsruntime.so → ArkTS 运行时内部，检查对象生命周期
├── libxxx.so（你的 .so）→ 业务 C++ 代码，用 addr2line 定位源码行
└── libc++.so / libc.so  → 标准库调用异常，检查传入参数
```

关键命令：

```bash
# 抓取完整 crash 日志
hdc shell hilog -T Crash

# 对业务 .so 做符号化（需要 unstripped 版本）
addr2line -f -e libxxx.so.unstripped <pc-address>
```

### 2. threadsafe_function 死锁排查

`napi_threadsafe_function` 最常见的死锁模式及对策：

| 模式 | 描述 | 对策 |
|------|------|------|
| **JS 回调中同步等待** | `call_js_cb` 内部同步等待另一个 `threadsafe_function` 完成 | 改用异步信号量 + 释放 JS 线程 |
| **回调中阻塞调用 native** | `call_js_cb` 中调用 `napi_call_function` 触发了另一个阻塞 native 方法 | 将耗时 native 调用移到独立线程 |
| **循环依赖** | A 的 callback 等待 B，B 的 callback 等待 A | 打破循环，使用单向事件通知 |

排查命令：

```bash
# 检查 hilog 中 threadsafe_function 相关日志
hdc shell hilog -T NapiThreadSafe

# 确认是否有线程长时间 blocked
hdc shell hilog | grep "blocked"
```

### 3. GC 与 napi_ref 陷阱

两个最高频的坑：

```cpp
// ❌ 危险：跨线程直接传递 napi_value
// napi_value 是 env 绑定的，跨线程或 GC 后失效
void worker_thread(napi_env env, napi_value js_obj) {
    // js_obj 可能已无效！GC 可能已回收
}

// ✅ 正确：用 napi_ref 保护引用
napi_ref ref = nullptr;
napi_create_reference(env, js_obj, 1, &ref);

void worker_thread_safe(napi_env env, napi_ref ref) {
    napi_value obj;
    napi_get_reference_value(env, ref, &obj);
    // obj 有效
    napi_delete_reference(env, ref);  // 用完后释放
}
```

排查泄漏：

```bash
# 观察 native 内存持续增长
hdc shell hidumper --mem <pid>

# 在代码中加引用计数日志
napi_reference_ref(env, ref, &count);
OH_LOG_INFO(LOG_APP, "ref count: %{public}u", count);
```

## Key APIs (Summary)

| API | 作用 | 排障要点 |
|-----|------|----------|
| `napi_create_reference` / `napi_delete_reference` | 创建/销毁对 JS 对象的持久引用 | 必须配对，否则泄漏 GC 根 |
| `napi_threadsafe_function` 系列 | 从任意线程安全地调用 JS 回调 | 检查 `call_js_cb` 中是否有阻塞操作 |
| `napi_wrap` / `napi_unwrap` | C++ 对象与 JS 对象绑定/解绑 | unwrap 时如果 native 对象已析构会 crash |
| `napi_get_and_clear_last_exception` | 获取并清除 JS 异常 | 检查 NAPI 调用返回值，异常未处理会传播 |
| `napi_throw_error` | 向 JS 侧抛出异常 | 抛出后 native 函数应立即 return |

## Caveats

- **空指针/野指针是 C++ 侧第一杀手**：SIGSEGV 时先用 addr2line 定位，再检查对象的生命周期是否被 GC 打断
- **threadsafe_function 回调中严禁同步阻塞**：回调运行在 JS 主线程，阻塞 = UI 冻结 = ANR
- **跨线程传递 napi_value 前必须先创建 napi_ref**，否则 GC 可能在任何时刻回收该对象
- **`napi_delete_reference` 必须与 `napi_create_reference` ——配对**，泄漏积累会导致 OOM
- **build-profile.json5 必须配置 debug 符号**：`"debugSymbol": { "strip": false }` 才能获得可读的 native 堆栈

## Composition Hints

- 本技能聚焦**崩溃发生后的排障**，配合 `harmonyos-hdc-debug`（hilog/hstack 工具链）和 `harmonyos-native-project`（NAPI 工程结构）使用
- 构建侧的 native 配置问题（CMake、多 ABI）请参考 `harmonyos-cpp-cmake`
- 线程安全的 NAPI 设计模式请参考 `harmonyos-napi-binding`（NAPI 接口封装范式）
- 排障时需要理解 ArkTS 侧的并发模型，参考 `harmonyos-concurrency`
