# bug: plan-runner repair 证据错误绑定到 active todo

> 2026-06-30 更新：后续决策删除 plan-runner 主动提交的 `command` evidence 契约。该问题仍保留为 repair 阶段 evidence 归属规则的历史根因；当前回归测试覆盖的是 diff evidence 不能被 stale active todo 抢绑定。

## 现象

第四轮真实 smoke 中，plan-runner 已经执行了 T2 marker 校验命令，后续 repair prompt 也明确要求补 T2 command evidence。但 task-state 仍停在 `repairing`，`reviews.round = 2`，原因持续为 `T2 has no successful command evidence`。实际 state 中补证据命令被记录为 command evidence，却被绑定到了 T3。

## 根因 (6 要素)

1. **触发条件**：deterministic check 失败进入 `repairing`，todo 中仍有 T3 `in_progress` / T4 `pending`，同时 T2 已 `completed` 但缺 command evidence。
2. **期望链路**：repair prompt 要求补 T2 evidence 时，后续成功命令应绑定到 T2，让 deterministic check 能消除 `T2 has no successful command evidence`。
3. **实际链路**：`evidenceTaskIDs()` 先读取 `activeTodoTaskID()`，看到 T3 `in_progress` 后直接返回 `["T3"]`，没有进入 `repairEvidenceTaskIDs()` 的缺失证据推导。
4. **关键假设失效**：实现假设 active todo 永远代表当前 evidence 归属；repair 阶段已禁止 `todowrite` 重新规划，旧 active todo 可能是失败前残留，不能优先于 repair 缺失证据。
5. **旁证**：events 中第二次 `repair_prompt_sent` 后，命令 `T2 PASS command evidence...` 仍写入 `task_ids: ["T3"]`；T2 持续缺 command evidence。
6. **影响范围**：repair 阶段补证据会被错误绑定，导致最多两轮 repair 后仍无法进入 audit/external/validated。

## 修复方向

`evidenceTaskIDs()` 在 `state.status === "repairing"` 时先使用 `repairEvidenceTaskIDs(state)`；只有非 repair 执行阶段才使用 active todo。repair 阶段的 active todo 是历史 UI 状态，不作为 evidence 归属来源。

## 验证

- RED：构造 `repairing` state，T2 completed 且缺 command evidence，T3 in_progress；记录 bash command 后旧代码会把 evidence 绑定到 T3。
- GREEN：同一场景 command evidence 绑定到 T2。
