# bug: plan-runner 第二次修复后被轮次上限提前阻断

## 现象

`opencode serve` 复杂 smoke 中，plan-runner 已完成本地提交，第一次 `finish_plan`
通过 deterministic repair 补齐 evidence，随后 audit 通过，external review 返回文档问题。
agent 修复 external review 问题并再次提交后，下一次 `finish_plan` 未重新运行 external
review，而是直接返回 `blocked`，原因是 `review repair round limit exceeded`。

## 根因 (6 要素)

1. **触发条件**：同一个任务先消耗一次 deterministic/completeness repair，再消耗一次
   external review repair，使 `reviews.round` 达到 2，之后 agent 再次调用 `finish_plan`。
2. **期望链路**：轮次上限应限制“第三次 repair 请求”；第二次 repair 完成后仍应允许
   harness 重新执行 deterministic、audit/external review 和最终 completeness check。
3. **实际链路**：`continuePlanRunnerReview()` 入口看到 `state.reviews.round >= 2` 就立即
   写入 `blocked`，没有机会判断本轮是否已经修好，也没有机会让第二次 external review 返回 pass。
4. **关键假设失效**：代码把“已经发出 2 次 repair”误当作“已经验证失败 2 次且还需要继续修”，
   将 repair 预算检查放在复核入口，而不是放在准备发出下一次 repair 的位置。
5. **旁证**：task-state
   `planrun-ses_0e289fafaffe6tQ9PCdCw7lCK3-toolu_vrtx_01D9onUudJLATjSMoefGX4uR`
   中 `reviews.round` 为 2，`reviews.external` 只有第一轮 issues，最终
   `completion_gate.source` 为 `review_round_limit`；events 中没有第二次
   `external_review_started`，说明阻断发生在重新评审前。
6. **影响范围**：任何先经历 deterministic/completeness repair、再经历 external review repair
   的任务，都会在第二次修复后无法进入最终复核；实际已修好的任务也会被误报为 blocked。

## 修复方向

删除 `continuePlanRunnerReview()` 入口处的提前轮次阻断，让它正常执行复核。若复核仍发现
deterministic/completeness/external 问题，由 `promptRepair()` 在准备发出下一次 repair 时
根据 `reviews.round >= 2` 阻断，避免第三次 repair。

## 验证

- RED：构造 `reviews.round = 2`、audit 已通过、external 第一轮为 issues 的 repair 状态；
  下一次 `finish_plan` 应继续调用 external review，旧实现直接 `blocked`。
- GREEN：同一状态下，第二次 external review 返回 pass 后任务进入 `validated`，且 events 包含
  新的 `external_review_started` / `external_review_passed`。
