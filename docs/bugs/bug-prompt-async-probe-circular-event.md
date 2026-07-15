# Prompt-Async Probe 循环事件丢失

## 1. 现象

Prompt-Async probe 记录包含循环引用的 OpenCode event 时，`sanitize` 会让整次 `JSON.stringify` 失败，日志只保留 `unserializable` 错误，不再包含 event 类型和 session 信息。

## 2. 影响

若插件事件未来包含循环引用，probe 会丢失 `message.updated`、`session.idle` 等关键诊断证据，可能把实际成功的 child 执行误判为缺少终态事件。

## 3. 复现条件

创建 prompt-async probe workspace，加载生成的插件，向 `event` hook 传入一个保留正常 `type` 和 `properties`、同时通过 `self` 指回自身的 event 对象。当前日志只记录序列化错误。

## 4. 根因

`sanitize` 只转换函数和 `bigint`，没有跟踪已经访问的对象。`JSON.stringify` 遇到循环引用后抛错，外层 catch 只能降级整个 payload，无法保留其余可序列化字段。

## 5. 修复方向

在每次 `sanitize` 调用中使用 `WeakSet` 跟踪对象；重复访问的对象替换为稳定的 `"[Circular]"` 标记，继续保留 event 的其他诊断字段。

## 6. 验证与防回归

新增行为测试加载实际生成的 probe 插件，发送带循环引用的 event，并断言日志仍保留 event 类型、session ID 和循环占位符。
