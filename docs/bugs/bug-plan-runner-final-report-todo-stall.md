# bug: plan-runner 把最终报告写成 plan todo 导致 self-check 卡住

## 现象

第三轮 post-restart smoke 中，subagent 返回 `Result: completed`，但 task-state 停在 `self_checking`；T5 仍为 `in_progress`，T6 `Report smoke results` 仍为 `pending`，没有 `self_check_completed`、audit 或 external review。第四轮去掉 final-report plan task 后，todos 已全部 completed，但 state 仍停在 `self_checking`，events 只到 `self_check_prompt_sent`。

## 根因 (6 要素)

1. **触发条件**：plan-runner 在 `write_plan.tasks[]` 中加入“最终报告/报告 smoke 结果”这种任务。
2. **期望链路**：plan tasks 表示最终报告之前必须完成的可验证工作；所有 todo completed 后，harness 应直接接管 terminal gate 并进入 deterministic / audit / external review。
3. **实际链路**：最终报告本身被建模为 T6 todo时会阻断 completion attempt；去掉该 todo 后，旧 self-check re-entry 仍把控制权交回 agent，后台 task 没有稳定回到 harness 下一步。
4. **关键假设失效**：agent 指令只要求 final report 格式，没有明确“最终报告不是 plan task”；harness 又把 terminal gate 的第一步设计成 agent self-check prompt，依赖 agent 再次 idle 才能推进。
5. **旁证**：v3 task-state 中 `self_check.status=prompted`，events 最后只有 `self_check_prompt_sent` 后的 `todo_updated`；DB todo 表显示 T5 in_progress、T6 pending。v4 DB todos 全 completed，但 events 仍只有 `self_check_prompt_sent`，无 `self_check_completed` / `audit_review_dispatched`。
6. **影响范围**：包含最终报告/汇报结果 todo 的 plan 会卡住；即使不再创建 final-report todo，只要 terminal gate 依赖 self-check re-entry，后台 task 仍可能停在 `self_checking`。

## 修复方向

更新 plan-runner agent 指令：不要为最终报告创建 plan task；最终报告发生在 plan todos 全部 completed 之后。harness 进入终态门禁后不再让 agent 通过 self-check / todo 工具重开执行流，而是直接运行 deterministic / audit / external review；若门禁失败，再回到 repair 阶段。repair 阶段禁止 `todowrite`，小修 evidence 由 harness 根据缺失证据或审计结果推导任务归属。

## 验证

- RED：agent 指令缺少最终报告不入 plan task 的约束；completion idle 仍回投 self-check prompt，导致 agent 在终态里继续操作 todo；repair 阶段仍可调用 `todowrite`。
- GREEN：静态测试固定 final-report 约束；harness 在 completion idle 直接进入 audit，终态状态阻断 plan-runner 工具；repair 阶段禁止 `todowrite` 且允许小修 diff evidence 绑定到缺失证据任务。
