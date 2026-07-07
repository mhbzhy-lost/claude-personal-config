# bug: plan-runner 多任务执行后无法启动下一任务

## 现象

fresh `opencode serve` live smoke 中，plan-runner 通过 `write_plan({ tasks })` 建立 T1/T2/T3 后，只完成 T1 child validation；随后尝试启动 T2 被 phase gate 拒绝，最终调用 `finish_plan` 进入 `repairing`，提示 T2/T3 未完成且没有提交。

## 根因 (6 要素)

1. **触发条件**：结构化任务契约包含多个任务，plan-runner 先 `start_task(T1)`，完成 T1 后再调用 `start_task(T2)`。
2. **期望链路**：`complete_task(T1)` 清空 active cursor 后，harness 应允许 `start_task(T2)` 选择下一个 pending task，并继续执行。
3. **实际链路**：`start_task` 只在 `ready_to_execute` phase 被 allowlist 放行；T1 一旦启动，state 进入 `executing`，后续 `start_task(T2)` 在 `executing` 中被拒绝。
4. **关键假设失效**：实现把 `start_task` 当作“从计划进入执行”的一次性工具，而 structured task contract 需要它作为每个任务的 cursor 切换工具。
5. **旁证**：smoke 日志中 `complete_task(T1)` 成功后，`start_task(T2)` 两次返回 `plan-runner phase gate: start_task is not allowed during executing`；state 文件显示 `active_task: null`、T1 completed、T2/T3 pending。
6. **影响范围**：所有包含两个以上 structured tasks 的 plan-runner 任务都会在首个任务后卡死；repairing 阶段也无法重启 pending task，导致后续 edit/bash/task 工具继续被 `start_task is required before execution tools` 拒绝。

## 修复方向

在 structured task phase gate 中允许 `start_task` 在 `executing` 状态下运行，但仍由 `start_task` tool 自身校验目标 task 必须是 pending、当前不能有 active task，从而保留单 active cursor 约束。

## 验证

- RED：新增回归测试，覆盖 `complete_task(T1)` 后可 `start_task(T2)`，并证明当前实现会在 `executing` 中拒绝。
- GREEN：修复 phase gate 后，目标测试与 plan-runner harness 全量测试通过；重新执行 fresh live smoke 确认最终不再卡在 T2/T3 pending。
