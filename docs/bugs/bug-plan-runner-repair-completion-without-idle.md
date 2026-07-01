# bug: plan-runner repair 补证据后无 idle 导致卡住

## 现象

第二轮 post-restart smoke 中，harness 直接完成 terminal gate self-check 后发现 T3 缺少成功 command evidence，正确向原 plan-runner session 回投 repair prompt。agent 在 repair 阶段成功运行 `git diff --check && python3 -c ...`，harness 记录了 `ev-command-*`，但 task-state 停在 `status: repairing`，没有 `deterministic_check_passed` 或 audit dispatch。

## 根因 (6 要素)

1. **触发条件**：terminal gate 的 deterministic check 失败后进入 `repairing`，agent 用工具补齐缺失证据并返回 final text。
2. **期望链路**：repair 补齐证据后，harness 应重新运行 deterministic check，成功后进入 audit dispatch。
3. **实际链路**：repair 后 OpenCode DB 有 `message.updated` completed 和成功 bash tool part，但 task-state events 只到 `evidence_recorded`，没有新的 `session.idle` 事件触发 `handlePlanRunnerIdle()`。
4. **关键假设失效**：harness 假设 repair 完成后一定会有 `session.idle(plan-runner)`；真实后台 task repair 路径可能只发 message/session updated，不再触发 idle hook。
5. **旁证**：DB 中最后的 assistant message `finish=stop`，agent 仍是 `plan-runner`，`agent-switched` 计数为 0；todo 全 completed，T3 成功 command evidence 已写入 state。
6. **影响范围**：任何 deterministic/audit/external/completeness repair 成功但不产生 idle 事件的后台 task，都会停在 `repairing`，无法进入 audit/external/validated。

## 修复方向

把 plan-runner assistant `message.updated` 完成事件作为 repair 后的 completion boundary：当 state 为 `repairing`，消息已 completed/stop，且当前 completion attempt 满足条件时，harness 重新运行 deterministic check 并继续 audit dispatch。仍保留 `session.idle` 作为主边界。

## 验证

- RED：repair 阶段补齐成功 command evidence 后，只发送 completed `message.updated`，旧 harness 仍停 `repairing`。
- GREEN：同一事件推进到 `deterministic_check_passed` 和 `audit_review_dispatched`；若 deterministic 仍失败，则继续 repair/block 逻辑。单测覆盖 `repairing` + completed assistant `message.updated` 无 idle 的路径。
