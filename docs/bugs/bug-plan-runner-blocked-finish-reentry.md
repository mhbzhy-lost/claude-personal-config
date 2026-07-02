# bug: plan-runner blocked 后再次 finish_plan 会重复 external review

## 现象

第二轮 `opencode serve` live smoke 中，external review 多次返回 issues 后 task 已写入
`external_review_blocked`。但 agent 再次调用 `finish_plan` 时，harness 又把
`completion_gate.status` 改成 `running`，并继续写入新的 `external_review_started`。
events 中可见同一个 task 在 `external_review_blocked` 后重复出现
`deterministic_check_passed` / `external_review_started`。

## 根因 (6 要素)

1. **触发条件**：task 已因 external review repair 轮次耗尽进入 `status = blocked`，
   plan-runner 又调用一次 `finish_plan`。
2. **期望链路**：`blocked` 是 terminal gate 终态；再次调用 `finish_plan` 只能返回既有
   blocked 结果，不能重新启动 deterministic / audit / external review。
3. **实际链路**：`finishPlanTool()` 无条件把 `completion_gate.status` 改为 `running`，随后
   `continuePlanRunnerReview()` 不检查 `state.status === "blocked"`，继续跑 external review。
4. **关键假设失效**：修复“第二次 repair 后允许复核”时移除了 `reviews.round >= 2` 的入口
   阻断，但没有保留 blocked 终态不可重入约束。
5. **旁证**：task-state
   `planrun-ses_0e271e799fferwEfhx3FplYNuC-toolu_vrtx_018iJMnubxKL53awaibVkCB9` 的
   events 在 `external_review_blocked` 后继续出现新的 `external_review_started`，并且
   `completion_gate.status` 被改回 `running`。
6. **影响范围**：任何 blocked 后仍在运行的 plan-runner 都可能重复触发 external review，
   造成无意义成本、状态抖动和终态不稳定。

## 修复方向

在 `finishPlanTool()` 入口识别已有 `status = blocked` 且处于 `finish_plan` gate 的 state，
直接返回既有 terminal result，不覆盖 `completion_gate`，不调用 `continuePlanRunnerReview()`。
保留 `repairing + reviews.round = 2` 的复核能力，只禁止 blocked 终态重入。

## 验证

- RED：构造 `status = blocked`、已有 external issues 和 blocked completion gate 的 task；
  再次调用 `finish_plan`，旧实现会调用 external review 并把 gate 改成 running。
- GREEN：同一状态下再次 `finish_plan` 直接返回 `Result: blocked`，external review 调用次数为 0，
  events 不新增 `external_review_started`。
