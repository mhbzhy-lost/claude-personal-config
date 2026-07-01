# bug: plan-runner 后台任务 self-check 后卡住

## 现象

真实后台 `plan-runner` smoke task 返回 `completed`，但 task-state 停在 `self_checking`，events 只到 `self_check_prompt_sent`，没有 `self_check_completed`、`deterministic_check_passed`、`audit_review_dispatched` 或 `validated`。

## 根因 (6 要素)

1. **触发条件**：后台 task 完成所有 todo 后，`session.idle(plan-runner)` 触发旧 harness 发送 self-check prompt。
2. **期望链路**：completion attempt 后，harness 继续推进 deterministic check 与 audit dispatch。
3. **实际链路**：旧 harness 只在下一次 `session.idle` 中把 `self_check.status=prompted` 推进为 completed；真实后台 task 在 prompt 后出现了 `todo.updated`，但没有后续 `session.idle` 事件，状态停在 `self_checking`。
4. **关键假设失效**：实现假设 promptAsync 后一定会产生第二次 idle；后台 task 通知路径下可能只产生 todo/message 边界事件。后续 smoke 证明即使兼容 `todo.updated`，terminal gate 仍不应依赖 agent re-entry。
5. **旁证**：真实 events 显示 `self_check_prompt_sent` 后只有 `todo_updated`，最终 task tool 对主会话报告 completed，但 harness 未进入 audit。
6. **影响范围**：后台 `plan-runner` 任务可能自报完成但 harness review loop 未闭合，`validated` 不会写入。

## 修复方向

最终方案改为取消 self-check prompt re-entry：completion idle 时由 harness 直接写 `self_check_completed` 并继续 deterministic check / audit dispatch。旧 `self_checking + prompted` state 不再兼容推进，磁盘残留直接清理。

## 验证

- RED：completion idle 后不应发送 `self_check_prompt_sent`，而应直接派发 audit；terminal gate 状态下 plan-runner 工具应被阻断。
- GREEN：completion idle 直接推进到 `audit_review` 并派发 audit child session；旧 prompted state 不再被 harness 自动复活。
