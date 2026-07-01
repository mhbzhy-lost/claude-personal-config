# bug: plan-runner 将 finish_plan gate todo 当作原始计划导致死锁

## 现象

当前会话重启后的真实 plan-runner smoke 中，agent 已创建并提交 smoke 文档，仓库保持 clean。它把 `finish_plan` 建模成 T4：`T4 提交后确认 clean 并通过 finish_plan`。第一次 `finish_plan` 返回 `repair_required`，原因包含 `todo list still has pending or in_progress items` 和 `T3 has no diff evidence`。agent 补齐 T3 diff evidence 后第二次调用 `finish_plan`，仍因 T4 todo `in_progress` 返回 `repair_required`。此时 T4 是终态门禁动作，不是原始工作产物。

## 根因 (6 要素)

1. **触发条件**：plan-runner 的 plan/todo 中包含 `finish_plan` 或 final report 这类终态门禁任务，且该 todo 在调用 `finish_plan` 时仍为 pending / in_progress。
2. **期望链路**：todo 只表达原始计划工作；`finish_plan` 是 harness 终态门禁，不应作为必须先完成的原始 todo 阻断 deterministic check。
3. **实际链路**：`findDeterministicCheckFailures()` 和 final completeness check 直接扫描全部 todo 的 pending / in_progress 状态，未区分原始工作 todo 与 gate todo。
4. **关键假设失效**：harness 假设所有 todo 都是原始计划任务；真实 agent 会把显式暴露的 `finish_plan` 协议写入 plan task，形成“调用门禁前必须先完成门禁”的自引用。
5. **旁证**：task-state `planrun-ses_10324d002ffeIJ6TONTCLckyxq-call_Zv8U4wknLe9WupG3r9ZjQ5Zc` 中 T1/T2/T3 已完成并有 evidence，`completion_gate.reasons` 最终只剩 `todo list still has pending or in_progress items`；未完成 todo 文本正是 `T4 提交后确认 clean 并通过 finish_plan`。
6. **影响范围**：任何把 `finish_plan` / final report 写成 plan task 的任务，都会在 deterministic 或 final completeness 阶段被 gate todo 自身阻断；repair 阶段改 todo 会污染原始计划账本，不应作为根治方案。

## 修复方向

在 harness 审查 todo 完成度时忽略 `finish_plan` / final report 这类 gate todo；原始计划任务仍必须 completed 且有 harness-observed evidence。`repairing` 阶段继续禁止 `todowrite`，避免在门禁失败后重写原始计划账本。

## 验证

- RED：构造一个 completed 原始任务加一个 `finish_plan` gate todo，旧 harness 在 deterministic check 中因 gate todo 未完成而无法进入 audit。
- GREEN：同一场景下 harness 忽略 gate todo，原始任务 evidence 满足后进入 audit；同时 `repairing` 阶段 `todowrite` 仍被拒绝。
