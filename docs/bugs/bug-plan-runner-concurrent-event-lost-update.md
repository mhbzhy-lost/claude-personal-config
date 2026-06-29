# bug: plan-runner 并发 event 导致 state lost update

## 现象

多个 OpenCode event 若并发进入同一个 plugin instance，`plan-runner` harness 的 state 更新可能互相覆盖。例如两个 `message.updated` diff event 同时记录不同文件，最终 state 可能只保留后写入的一个 evidence。

## 根因 (6 要素)

1. **触发条件**：同一 task 的两个事件在前一个 async handler 尚未完成时并发进入，例如流式 message 更新或多个 session diff 事件接近同时到达。
2. **期望链路**：同一 plugin instance 内的 state 读改写应串行化，后续 event 基于前一个 event 写入后的最新 state 继续合并。
3. **实际链路**：各 handler 独立执行 `readTaskState` -> 修改对象 -> `writeTaskState`；`await` 期间另一个 event 可读取到同一份旧 state。
4. **关键假设失效**：实现假设 OpenCode 会严格串行调用 event hook，或者 JS 单线程能避免并发；但 `await` 会交出控制权，多个 Promise 可交错执行。
5. **旁证**：外源 review 指出 lost update；新增并发两个 `message.updated` diff event 的测试可复现只保留一个文件的风险。
6. **影响范围**：evidence、modified_files、audit pending text、stale 等 state 字段都可能被后写覆盖，导致 completeness check 或 audit 输入不完整。

## 修复方向

在 plugin instance 内为 event hook 建立 Promise 链队列，使事件处理串行执行；单个事件内部仍保持现有 handler 顺序。

## 验证

- RED：并发两个 message diff event 后，期望 state 同时包含 `a.txt` 和 `b.txt`；当前可能丢失其一。
- GREEN：event queue 串行化后，同一测试稳定保留两个 evidence 和两个 modified file。
