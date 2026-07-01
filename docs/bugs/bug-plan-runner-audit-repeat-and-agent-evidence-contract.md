# bug: plan-runner audit 重复触发且依赖 agent evidence 契约

## 现象

终态门禁里，`plan-runner-audit` 失败后会触发 repair；repair 后 deterministic check 再次通过时，harness 会再次派发 audit。与此同时，plan-runner 需要在 `write_plan.tasks[].evidence_required` 和 final report 中主动描述 evidence，导致终态门禁部分依赖 agent 自己提交的证据契约。

## 根因 (6 要素)

1. **触发条件**：audit review 返回 fail 后，harness prompt repair；repair 结束后再次进入 `continuePlanRunnerReview()`。
2. **期望链路**：audit 是一次性评审信号，无论通过与否只触发一次；后续由 deterministic / external / final completeness 继续裁定，避免 LLM review 循环不收敛。
3. **实际链路**：`continuePlanRunnerReview()` 在 deterministic pass 后总是设置 `audit_review` 并 `dispatchAuditReview()`，没有检查已有 audit 结果。
4. **关键假设失效**：实现假设 audit 可以多轮修复后重审；但 audit 是 LLM 裁定，重复触发可能出现非收敛反馈，且 review round 与 repair round 混在一起增加状态复杂度。
5. **旁路风险**：`write_plan.tasks[].evidence_required` 由 plan-runner 主动提交，harness 再据此要求 per-task command/diff evidence，相当于让被审对象定义验收证据。
6. **影响范围**：终态门禁会卡在 audit/repair 循环，或者被 agent 自己定义的 evidence 契约牵引；不利于 harness 独立裁定完成度。

## 修复方向

- audit 只派发一次：已有 audit 结果后不再创建新的 audit child。
- audit fail 只触发一次 repair；repair 后 deterministic pass 直接进入 external review。
- final completeness 不要求 latest audit 必须 pass，只要求 audit 已经完成一次。
- 删除 plan-runner 主动提交的 `evidence_required` 契约；harness 只从实际 tool/event 观察 diff，command log 不作为完成条件。
- audit prompt 强调必须消费 todo 列表，检查是否完整实现，而不是只做接口壳子满足单测。

## 验证

- RED：audit fail 后 repair 完成，再次 idle 不应创建第二个 audit session。
- RED：`write_plan` schema 和 plan contract 不再接受/保存 `evidence_required`。
- RED：audit prompt 包含 todo state，并强调防止接口壳子/只满足单测。
