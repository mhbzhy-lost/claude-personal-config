# bug: plan-runner repairing 阶段禁止 todowrite 导致死锁

## 现象

当前会话重启后的真实 plan-runner smoke 中，agent 已创建并提交 smoke 文档，仓库保持 clean。第一次 `finish_plan` 返回 `repair_required`，原因包含 `todo list still has pending or in_progress items` 和 `T3 has no diff evidence`。agent 补齐 T3 diff evidence 后第二次调用 `finish_plan`，仍因 T4 todo `in_progress` 返回 `repair_required`；随后两次调用 `todowrite` 都被 harness 拦截：`plan-runner phase gate: todowrite is not allowed during repairing`。

## 根因 (6 要素)

1. **触发条件**：plan-runner 在 `finish_plan` 前仍有 pending / in_progress todo，deterministic check 将 state 置为 `repairing`。
2. **期望链路**：`repairing` 阶段应允许 agent 修复 deterministic findings，包括补充 evidence、更新 todo 状态，然后再次调用 `finish_plan`。
3. **实际链路**：harness 的 phase gate 在 `state.status === "repairing" && input.tool === "todowrite"` 时直接抛错，阻断 todo 状态修复。
4. **关键假设失效**：旧规则假设 repair 阶段只需要代码/命令类修复，禁止 `todowrite` 可避免 agent 重新规划；但 deterministic check 本身会把 todo 未完成作为 repair finding。
5. **旁证**：task-state `planrun-ses_10324d002ffeIJ6TONTCLckyxq-call_Zv8U4wknLe9WupG3r9ZjQ5Zc` 中 `completion_gate.reasons` 只剩 `todo list still has pending or in_progress items`，DB 中同一 plan-runner session 两次 `todowrite` tool part 均返回该 phase gate 错误。
6. **影响范围**：任何 `finish_plan` 后才发现 todo 状态未收敛的任务，都会进入无法用 `todowrite` 修复的 deadlock；即使源码、验证和 commit 都已正确完成，也无法进入 audit / external review / validated。

## 修复方向

允许 `repairing` 阶段调用 `todowrite`，但不放宽其它 terminal gate 规则：audit/external review 期间仍禁止 plan-runner 工具；repair 后仍必须由下一次 `finish_plan` 重新运行 deterministic check，才能进入 audit / external review。

## 验证

- RED：构造 `repairing` state 且 todo 仍有 `in_progress`，旧 harness 调用 `todowrite` 抛出 `todowrite is not allowed during repairing`。
- GREEN：同一场景下 `todowrite` 允许通过并更新 task-state todo，随后 `finish_plan` 可继续 deterministic check。
