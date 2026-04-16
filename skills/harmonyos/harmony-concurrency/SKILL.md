---
name: harmony-concurrency
description: "HarmonyOS 并发模型：TaskPool/Worker 多线程、async/await、Sendable 线程安全、EventHub/Emitter。"
tech_stack: [harmonyos]
language: [arkts]
---

# HarmonyOS 并发模型

> 来源：https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/taskpool-introduction
> 版本基准：HarmonyOS 5 / API 12+

## 用途

ArkTS 基于 Actor 模型提供并发能力：线程间内存隔离、通过消息传递通信。async/await 处理单线程异步 I/O，TaskPool / Worker 处理真正的多线程 CPU 密集型任务。

## 何时使用

- I/O 等待（网络、文件）-- async/await 即可，无需多线程
- CPU 密集短任务（图片处理、数据解析、加解密）-- TaskPool
- 需长驻后台线程（持续监听、流式处理）-- Worker
- 跨线程共享可变状态 -- @Sendable + AsyncLock
- 组件 / Ability 间事件解耦 -- EventHub / Emitter

## 并发方案选型

```
是否 CPU 密集？
 ├─ 否 → async/await（Promise）
 └─ 是 → 任务是否需要长驻线程？
          ├─ 否 → TaskPool（推荐）
          └─ 是 → Worker
```

## async/await（单线程异步）

不创建新线程，在主线程事件循环中调度。适用于所有 I/O 等待场景。

```typescript
import { http } from '@kit.NetworkKit';

async function fetchData(): Promise<string> {
  const req = http.createHttp();
  const resp = await req.request('https://api.example.com/data');
  return resp.result as string;
}
```

注意：async 函数中的 CPU 密集计算仍阻塞 UI，需卸载到 TaskPool。

## TaskPool（推荐多线程方案）

系统管理的线程池，自动扩缩容，支持优先级调度和负载均衡。

### 基础用法

```typescript
import { taskpool } from '@kit.ArkTS';

@Concurrent
function imageProcess(buf: ArrayBuffer): ArrayBuffer {
  // CPU 密集操作，运行在工作线程
  // 不能访问闭包变量、不能调用同文件其他函数
  return buf;
}

// 创建并执行
const task = new taskpool.Task(imageProcess, buffer);
const result = await taskpool.execute(task) as ArrayBuffer;
```

### @Concurrent 装饰器约束

| 约束 | 说明 |
|---|---|
| 仅 `.ets` 文件 | `.ts` 文件需用 `"use concurrent"` 指令 |
| 仅普通函数 / async 函数 | 禁止箭头函数、生成器函数、类成员方法 |
| 不能访问闭包变量 | 只能使用参数和 import 的模块 |
| 参数/返回值可序列化 | 或为 Sendable 类型（引用传递） |
| 执行时限 3 分钟 | 不含 Promise 异步等待时间（如网络 I/O） |

### 优先级

```typescript
await taskpool.execute(task, taskpool.Priority.HIGH);
```

| 优先级 | 场景 |
|---|---|
| `HIGH` | 用户交互直接依赖的结果 |
| `MEDIUM` | 默认 |
| `LOW` | 预加载、非紧急计算 |
| `IDLE` | 后台同步/备份，仅在所有线程空闲时执行，只占 1 个线程 |

### TaskGroup（批量并行）

```typescript
const group = new taskpool.TaskGroup();
group.addTask(new taskpool.Task(compress, file1));
group.addTask(new taskpool.Task(compress, file2));
group.addTask(new taskpool.Task(compress, file3));

const results = await taskpool.execute(group) as ArrayBuffer[];
// 全部完成后返回结果数组
```

取消任务组：`taskpool.cancel(group)`，未完成的任务返回 undefined。

### 延迟执行

```typescript
taskpool.executeDelayed(2000, task); // 延迟 2 秒后执行
```

## Worker（长驻线程）

手动创建的独立线程，生命周期由开发者管理。适用于需要持续运行的后台任务。

### 配置

在 `build-profile.json5` 中声明 Worker 文件路径：

```jsonc
{
  "buildOption": {
    "sourceOption": {
      "workers": ["./src/main/ets/workers/MyWorker.ets"]
    }
  }
}
```

### Worker 端（MyWorker.ets）

```typescript
import { worker, MessageEvents } from '@kit.ArkTS';

const workerPort = worker.workerPort;

workerPort.onmessage = (e: MessageEvents) => {
  const data = e.data;
  // 处理任务...
  workerPort.postMessage({ result: 'done' });
};
```

### 主线程端

```typescript
import { worker } from '@kit.ArkTS';

const myWorker = new worker.ThreadWorker('entry/ets/workers/MyWorker.ets');

myWorker.onmessage = (e) => {
  console.info('收到结果：' + JSON.stringify(e.data));
};

myWorker.postMessage({ cmd: 'start', payload: rawData });

// 不再需要时销毁
myWorker.terminate();
```

### Worker 限制

- 同一进程最多同时运行 **8** 个 Worker
- 单次消息序列化数据上限 **16 MB**
- 每个 Worker 有独立内存开销，不建议大量创建
- 需手动管理生命周期（创建 / 销毁）

## Sendable 与线程安全

默认跨线程传递对象使用序列化拷贝。@Sendable 允许对象以**引用（地址）**方式共享，避免拷贝开销。

### @Sendable 类定义

```typescript
import { ArkTSUtils } from '@kit.ArkTS';
import { collections } from '@kit.ArkTS';

@Sendable
class SharedCounter {
  private lock: ArkTSUtils.locks.AsyncLock = new ArkTSUtils.locks.AsyncLock();
  count: number = 0;
  names: collections.Array<string> = new collections.Array<string>();

  async increment(): Promise<void> {
    await this.lock.lockAsync(() => {
      this.count++;
    });
  }

  async getCount(): Promise<number> {
    return this.lock.lockAsync(() => this.count);
  }
}
```

### Sendable 约束规则

| 约束 | 说明 |
|---|---|
| 属性类型 | 仅限 Sendable 类型：基本类型、@Sendable 类、`collections.*` 容器 |
| 容器替代 | 普通 `Array` / `Map` / `Set` 不可用，需用 `collections.Array` / `collections.Map` / `collections.Set` |
| 继承限制 | 只能继承另一个 @Sendable 类 |
| 不能动态增删属性 | 可修改已有属性值（类型需一致） |
| 必须显式初始化 | 不能用 `!` 非空断言代替初始化 |
| 不支持 `#` 私有 | 使用 `private` 关键字 |
| 仅 `.ets` 文件 | 同 @Concurrent |

### AsyncLock（异步锁）

对 Sendable 共享对象的并发写操作，必须通过 AsyncLock 保护：

```typescript
await sharedObj.lock.lockAsync(() => {
  sharedObj.data = newValue;
});
```

### 共享模块（"use shared"）

普通模块在每个线程中各加载一份。标记 `"use shared"` 的模块在进程内只加载一次，可用于实现进程级单例。

## EventHub / Emitter（事件通信）

### EventHub -- 主线程内 Ability 与 UI 通信

通过 Context 获取，同步触发，仅主线程可用。

```typescript
// 订阅（页面中）
const context = getContext(this) as common.UIAbilityContext;
context.eventHub.on('dataChanged', (data: string) => {
  this.message = data;
});

// 发布（Ability 或其他页面中）
context.eventHub.emit('dataChanged', newData);

// 取消订阅
context.eventHub.off('dataChanged');
```

### Emitter -- 跨线程事件通信

支持主线程 + Worker 线程，异步调度，支持优先级。

```typescript
import { emitter } from '@kit.BasicServicesKit';

// 订阅（支持 on / once）
emitter.on({ eventId: 1001 }, (data) => {
  console.info('收到事件：' + JSON.stringify(data));
});

// 发布（可在 Worker 中调用）
emitter.emit({ eventId: 1001 }, {
  data: { key: 'value' }
});

// 取消
emitter.off(1001);
```

| 维度 | EventHub | Emitter |
|---|---|---|
| 线程范围 | 仅主线程 | 主线程 + Worker |
| 调度方式 | 同步立即执行 | 异步队列 + 优先级 |
| 获取方式 | `context.eventHub` | `import { emitter }` |
| 单次监听 | 不支持 | `once()` |
| 适用场景 | Ability 与页面解耦 | 跨线程/跨模块广播 |

## TaskPool vs Worker 对比

| 维度 | TaskPool | Worker |
|---|---|---|
| **线程管理** | 系统自动管理（扩缩容） | 手动创建 / 销毁 |
| **线程数量** | 自动调整，与物理核数相关 | 上限 8 个 / 进程 |
| **生命周期** | 任务级，执行完即回收 | 线程级，需主动 terminate |
| **任务时限** | 3 分钟（非异步等待部分） | 无限制 |
| **优先级** | HIGH / MEDIUM / LOW / IDLE | 不支持 |
| **负载均衡** | 内置 | 无 |
| **通信方式** | 函数参数 + 返回值 | postMessage / onmessage |
| **适用场景** | 短时 CPU 密集任务（图片、加解密、压缩） | 长驻后台（持续监听、流式处理） |
| **推荐程度** | **官方推荐，优先使用** | 仅长驻场景使用 |

## 常见陷阱

1. **@Concurrent 函数不能访问闭包** -- 不能调用同文件的其他函数或引用文件级变量，只能使用参数和 import 模块。违反时编译报错不够明确，容易困惑
2. **普通对象跨线程是拷贝** -- 修改工作线程中的对象不会影响主线程。需要共享状态必须用 @Sendable
3. **Sendable 类中不能用普通 Array** -- 必须使用 `collections.Array`，否则编译失败。同理 Map/Set 也需替换
4. **TaskPool 3 分钟时限** -- 纯 CPU 计算超时会被强制终止。大任务需拆分为多个小 Task 或改用 Worker
5. **Worker postMessage 16 MB 限制** -- 大数据传输应使用 ArrayBuffer 转移（transfer）或 SharedArrayBuffer，避免序列化拷贝
6. **EventHub 仅主线程** -- 在 Worker 中使用 EventHub 无效，跨线程事件必须用 Emitter
7. **@Sendable 属性必须显式初始化** -- 不能用 `!` 断言延迟初始化，会编译报错
8. **共享对象并发写必须加锁** -- @Sendable 只保证引用共享，不保证线程安全，并发修改必须配合 AsyncLock
