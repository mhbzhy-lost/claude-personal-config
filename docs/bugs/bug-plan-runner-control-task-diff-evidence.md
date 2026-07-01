# bug: plan-runner 控制任务被强制要求 diff evidence

> 2026-06-30 更新：本记录描述的是中间方案。后续决策删除 `write_plan.tasks[].evidence_required`，不再允许 plan-runner 主动定义 command/diff evidence 契约；command log 只作为验证日志，不作为完成条件。当前契约见 `bug-plan-runner-audit-repeat-and-agent-evidence-contract.md`。

## 现象

post-restart smoke 中，子任务已写计划、创建 disposable 文档、运行验证并完成 self-check，但 harness deterministic check 回流 repair：`T1 has no diff evidence`。T1 是 `write_plan` / `todowrite` 控制任务，不会产生实现文件 diff。

## 根因 (6 要素)

1. **触发条件**：plan-runner 的计划包含控制或验证任务，例如写计划、同步 todo、运行验证、自检报告。
2. **期望链路**：实现任务需要 diff evidence；控制/验证任务可用成功 command evidence 证明，不应伪造文件 diff。
3. **实际链路**：`buildPlanContract()` 对所有 task 固定写入 `evidence_required: ["diff"]`，`findDeterministicCheckFailures()` 和 final completeness 都对每个 completed task 硬性检查 diff。
4. **关键假设失效**：实现假设每个 plan task 都会修改文件；真实 plan-runner 任务包含 harness 控制步骤和验证步骤。
5. **旁证**：smoke state 中 T1 的 evidence 有成功命令检查计划文件，但没有 diff evidence；events 出现 `repair_prompt_sent`，reason 为 `T1 has no diff evidence`。
6. **影响范围**：任何包含非文件修改步骤的 plan 都可能被 repair loop 卡住，导致 audit/external review 无法开始。

## 修复方向

让 `write_plan.tasks[]` 支持可选 `evidence_required`，默认仍为 `["diff"]` 以保持实现任务安全；当 task 声明 `["command"]` 时，deterministic/final completeness 检查成功 command evidence，而不是 diff。

## 验证

- RED：声明 `evidence_required: ["command"]` 且已有成功 command evidence 的 task 仍被 `T1 has no diff evidence` 拦截。
- GREEN：同一场景进入 audit；未声明 `evidence_required` 的实现任务仍不能只靠 command evidence 完成。
