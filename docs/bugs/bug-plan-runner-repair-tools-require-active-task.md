# bug: review 修复阶段执行工具错误要求 active task

## 现象

plan-runner 调用 `finish_plan` 后触发 audit / external review，review 返回需要修复的问题。harness 将状态置为 `repairing` 并把 `finish_plan` 结果返回给 plan-runner。此时原始 `write_plan.tasks[]` 已全部 `completed`，`active_task = null`。plan-runner 根据 review 意见直接修改代码时，phase gate 报错：`plan-runner phase gate: start_task is required before execution tools`。

## 根因 (6 要素)

1. **触发条件**：terminal review 返回 `repair_required` 后，plan-runner 直接调用 `apply_patch` / `edit` / `write` / `bash` 修复问题。
2. **期望链路**：`repairing` 阶段应允许修复类执行工具，不要求重新 `start_task`；harness 通过 `repairEvidenceTaskIDs()` 把修复 evidence 绑定到缺 evidence 的 completed task，或 fallback 到已完成任务。
3. **实际链路**：`enforcePhaseGate()` 把 `repairing` 和普通 `executing` 合并处理，对所有执行上下文工具统一要求 `activeTask(state)`。
4. **关键假设失效**：原始任务完成后才进入 terminal gate；review 修复不是新任务执行 cursor，不能要求从 completed task list 中重新启动任务。
5. **旁证**：代码中 `evidenceTaskIDs(state)` 已对 `state.status === "repairing"` 调用 `repairEvidenceTaskIDs(state)`，说明 evidence 层已支持无 active task repair；只有 phase gate 未放行。
6. **影响范围**：任何 audit / external / completeness / deterministic gate 返回修复意见后，plan-runner 都可能卡在无法修改代码的状态；二次调用 `finish_plan` 的偶然 workaround 不应作为正式流程。

## 修复方向

在 `repairing` 阶段允许执行上下文工具直接运行，不要求 active task；继续禁止 `todowrite`，并保留 terminal gate 的 audit/external review 期间阻断。修复 evidence 仍通过 `repairEvidenceTaskIDs()` 归属到原任务。

## 验证

- RED：模拟 external review 返回 issues 后，断言 `apply_patch` 在 `state.status = repairing` 且 `active_task = null` 时可通过 phase gate；当前实现失败为 `start_task is required before execution tools`。
- GREEN：修复后运行 focused test、plan-runner harness 全量测试、全量 node 测试和 `git diff --check`。

## 实际验证

- RED：`node --test --test-name-pattern "allows repair execution tools after review findings" "userconf/plugins/test/plan-runner-harness.test.mjs"` 失败为 `plan-runner phase gate: start_task is required before execution tools`。
- focused GREEN：同命令通过，1 pass。
- `node --test "userconf/plugins/test/plan-runner-harness.test.mjs"`：83 pass。
- `node --test "userconf/plugins/test"/*.mjs "scripts/test/opencode-subagent-event-probe.test.mjs"`：226 pass。
- `git diff --check`：通过。
