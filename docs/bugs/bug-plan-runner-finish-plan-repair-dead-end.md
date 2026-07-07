# bug: finish_plan deterministic repair 后 plan-runner 停在 repairing

## 现象

fresh live smoke 中，plan-runner 完成 T1/T2/T3 后在未提交 root 变更时调用 `finish_plan`。harness 正确返回 `repair_required`，原因包含 root 工作区不干净和 HEAD 未离开 base commit，但 plan-runner 没有继续执行 commit / retry，state 长时间停在 `repairing`。

## 根因 (6 要素)

1. **触发条件**：`finish_plan` 的 deterministic check 发现 root repo 未 clean 或没有 commit range。
2. **期望链路**：plan-runner 应收到可执行的 preflight 反馈，继续在同一 session 中修复 root commit 边界，然后再次调用 `finish_plan`。
3. **实际链路**：`promptRepair()` 只写入 state/event，把状态置为 `repairing`，没有给 plan-runner 回投 prompt；`finish_plan` 返回 `Result: repair_required` 后，模型可能把它当终态并停止。
4. **关键假设失效**：实现假设模型会从 custom tool 的 `repair_required` 输出中自行继续；live smoke 显示该假设不稳定。
5. **旁证**：2026-07-07 smoke 中 child worktree 已清理、child 已 completed，但 state 停在 `repairing`；events 只有 `deterministic_check_repair_required` / `repair_required`，没有后续 bash commit 或第二次 `finish_plan`。
6. **影响范围**：任何 deterministic preflight 失败（未提交、未清理 child worktree、无 commit range）都可能变成 dead-end，无法走到 audit/external review。

## 修复方向

把 root commit boundary / child worktree cleanup 这类 deterministic 前置失败作为 `finish_plan` 的同步 preflight block：返回明确的 next steps，但不把 task state 切到 `repairing` terminal repair flow。这样 plan-runner 能在普通执行状态下继续执行 commit/cleanup，并再次调用 `finish_plan`。

## 验证

- RED：root repo dirty 时调用 `finish_plan`，期望输出包含 preflight block，并且 state 不进入 `repairing`。
- GREEN：实现 preflight block 后，focused test、harness 全量测试和全量 node 测试通过；fresh smoke 不再卡死在 deterministic repair dead-end。
