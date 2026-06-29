# bug: plan-runner 后台任务 self-check 后卡住

## 现象

真实后台 `plan-runner` smoke task 返回 `completed`，但 task-state 停在 `self_checking`，events 只到 `self_check_prompt_sent`，没有 `self_check_completed`、`deterministic_check_passed`、`audit_review_dispatched` 或 `validated`。

## 根因 (6 要素)

1. **触发条件**：后台 task 完成所有 todo 后，`session.idle(plan-runner)` 触发 harness 发送 self-check prompt。
2. **期望链路**：self-check prompt 后，plan-runner 继续运行并在完成边界推进 deterministic check 与 audit dispatch。
3. **实际链路**：harness 只在下一次 `session.idle` 中把 `self_check.status=prompted` 推进为 completed；真实后台 task 在 prompt 后出现了 `todo.updated`，但没有后续 `session.idle` 事件，状态停在 `self_checking`。
4. **关键假设失效**：实现假设 promptAsync 后一定会产生第二次 idle；后台 task 通知路径下可能只产生 todo/message 边界事件。
5. **旁证**：真实 events 显示 `self_check_prompt_sent` 后只有 `todo_updated`，最终 task tool 对主会话报告 completed，但 harness 未进入 audit。
6. **影响范围**：后台 `plan-runner` 任务可能自报完成但 harness review loop 未闭合，`validated` 不会写入。

## 修复方向

把 `todo.updated` 也作为 self-check 后的完成边界：当 state 为 `self_checking` 且 self-check 已 prompted，收到 plan-runner session 的完成态 todo.updated 时，标记 self-check completed 并继续 deterministic check / audit dispatch。

## 验证

- RED：self-check prompt 后发送全部 completed 的 `todo.updated`，当前 state 仍停 `self_checking`。
- GREEN：同一事件推进到 `audit_review` 并派发 audit child session。
