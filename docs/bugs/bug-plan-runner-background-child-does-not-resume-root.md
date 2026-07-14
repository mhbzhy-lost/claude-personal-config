# Plan-Runner 后台子会话完成后未恢复 Root

## 1. 现象

真实失败任务 `planrun-ses_0a6b9aaa2ffego3TZkaXaKElXA-start-440ecd9b-3e83-44e8-a9b8-2750dceb4a06` 中，root 派发 T1 后返回“已启动”，随后被当作提前结束；后台 child 继续运行，但完成后 root 没有继续计划。

## 2. 影响

child 的变更和验证结果不能被 root 合并或处理，任务可能停留在错误的 blocked 结果，父会话无法获得完整执行结果。

## 3. 复现条件

root session 存在至少一个 `child_sessions.status === "running"`，root 产生 final text 并 idle；随后 child idle 或 error 进入 settled 状态。

## 4. 根因

root idle collector 在判断 child 是否仍运行之前，就把 final text 写为 blocked。现有 `handleChildSessionIdle` 只将 child 标记 completed，不检查 root 是否等待 child，也不会向 root `promptAsync` 发送继续指令。

## 5. 修复方向

root 有运行中 child 时进入 `waiting_for_children`，保存恢复状态和 child 快照。最后一个 child settled 后以幂等状态机先持久化 waking，再用 `promptAsync` 唤醒原 root；成功恢复原执行状态，失败最多再尝试一次。

## 6. 验证与防回归

覆盖单 child 等待、并行 child 仅最后一个唤醒、重复 idle 不重复派发、child error 参与 settled、失败唤醒最多两次，以及 waiting 状态下 parent idle 不释放运行时。
