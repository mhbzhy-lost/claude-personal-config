# bug: plan-runner 普通 child 完成后仍记录为 running

## 现象

fresh `opencode serve` live smoke 已能完成 T1/T2/T3 并进入 `validated`，但 `finish_plan` 的 final completeness check 先两次失败，原因是 `child sessions are still running`。第二次失败后 harness fail-open 才写入 `task_validated`，state 中普通 executor child 仍是 `status: running`。

## 根因 (6 要素)

1. **触发条件**：root plan-runner 在结构化任务中派发普通 harness-managed executor child，child 完成后 OpenCode 发送 `session.idle`。
2. **期望链路**：child session idle 后，harness 应把对应 `child_sessions[]` 项从 `running` 标记为 `completed`，让 final completeness check 使用真实完成状态。
3. **实际链路**：当前只有 audit child 在 `handleAuditReviewIdle()` 中被标记为 completed；role 为 `child` 的普通 executor session 没有 idle handler。
4. **关键假设失效**：实现假设普通 child 完成状态不参与后续 gate，实际 final completeness check 会统一检查 `child_sessions[].status === "running"`。
5. **旁证**：2026-07-06 rerun smoke 的 state 最终 `status: validated`，但 `gate_failures` 包含两次 `completeness_check` 的 `child sessions are still running`，且 executor child session 仍保持 `running`。
6. **影响范围**：任何使用普通 child worktree 的 plan-runner task 都会在 terminal gate 处误判为 child 未结束；多次失败后可能通过 fail-open validated，降低 gate 证据质量。

## 修复方向

为 role 为 `child` 的 session 增加 `session.idle` handler：读取 session index，找到同 task 的 `child_sessions` 记录，若仍为 `running` 则标记 `completed` 并追加 `child_session_completed` event。audit child 继续走现有 audit 专用 handler。

## 验证

- RED：新增回归测试，绑定普通 child 后触发 `session.idle`，期望 child status 变为 `completed`；当前实现保持 `running`。
- GREEN：实现普通 child idle handler 后，目标测试、plan-runner harness 全量测试、全量 node 测试和 fresh live smoke 均通过，且 smoke 不再依赖 completeness fail-open。
