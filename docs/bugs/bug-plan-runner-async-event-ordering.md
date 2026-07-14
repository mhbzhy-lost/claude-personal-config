# Plan-Runner 异步事件顺序依赖导致终态丢失与误阻塞

## 1. 现象

异步 child 的 terminal 事件可先于 `tool.after` 绑定到达，导致终态未被归集；一次 wake 失败后再次 wake 仍失败，父会话永久停留在 `waiting`。root 已进入 `validated` 等终态时，系统可能仅记录 root error，未先通过 root terminal barrier 就通知 parent；wake 后旧 idle 又读取旧 message，误判为 `blocked`。此外，messages API 失败会使 idle collector 悬挂，无法完成本轮归集。

## 2. 影响

计划实际完成、失败或被阻塞时，父会话可能得不到可消费的终态，继续等待或被旧消息误阻塞。根会话的错误缺少完成屏障和唤醒通知，后续调度无法可靠判断是否可继续。messages API 的单点失败还会让 idle 归集器长期悬挂，扩大等待范围。

## 3. 复现条件

在 child 创建与 `tool.after` 监听绑定之间发送 terminal 事件；或让第一次、第二次 wake 都失败。让 root 在尾部事件中进入 `validated`，同时触发 error；在一次 wake 后让旧 idle 读取到上一代 message；或模拟 messages API 拒绝、超时。任一时序都可能暴露相应症状。

## 4. 根因

共同根因是异步事件处理依赖理想的到达顺序，且缺少足够的 generation/terminal fallback。实现假设 binding 先于 terminal、wake 一次即可成功、终态总能由正常消息路径传递、idle 总能读到当前消息、messages API 总能返回。事件到达、重试与读取实际均可交错；若不记录 root 等待状态、上一条 assistant message ID 和消息完成标记，就无法区分旧新消息，也无法在 root 终态和读消息失败时提供独立的完成屏障与可恢复归集路径。

状态边界也被混淆：root 的 `root_wait` 是持久化 task-state，记录 root 是否仍等待 child 归集或 wake；每个 plugin instance 的 child pending map 只是在本实例内补偿 `tool.after` 绑定前已到达的 child terminal 事件。后者不能持久化后复用，也不能作为 root 是否可通知 parent 的依据。

## 5. 修复方向

用持久化 `root_wait` 绑定 root 等待状态、wake 和上一条 assistant message ID，只接受已完成的新 assistant message；为 child terminal 建立不依赖 `tool.after` 先到的同实例 fallback 归集。将 wake 设计为可重试且幂等；instance-local child pending map 仅用于本实例内的早到 terminal 补偿。root 到达 `validated` 等终态时，必须先写入 root terminal barrier，再允许 parent 通知；即使只观察到 error 也能形成可诊断终态。messages API 失败必须收敛为可记录终态；已有 running child 时则优先进入等待，不用 collector 错误替代 child lifecycle。

通知失败后不能在 root 尾部事件中立即 dispose：真实 smoke 已证明尾部 event 会重建相关状态。后续只应通过安全的 parent 活动或人工诊断触发恢复，不采用 timer 或 fire-and-forget 处理。

## 6. 验证与防回归

覆盖 terminal 早于 binding、连续两次 wake 失败、root 已终态仅有 error、wake 后旧 idle 遇到旧消息或新 partial message、messages API 失败五类交错场景。断言 child pending map 只在当前 plugin instance 补偿早到 terminal，`root_wait` 则在 task-state 持久化；每个 root terminal 通知均晚于对应 root terminal barrier。其余断言为：新消息完成后才写入终态或可诊断失败记录，不永久 `waiting`、不误报 `blocked`、不悬挂 collector，并在后续安全 parent 活动或人工诊断时可恢复归集。慢测中的旧断言与本文档若存在错位，应在验证项中校正，不另扩展为独立问题。
