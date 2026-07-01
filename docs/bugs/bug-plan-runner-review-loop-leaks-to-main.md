# plan-runner review loop leaks to main session

## 现象

plan-runner 子任务向主会话返回 `Result: completed` 后，harness task-state 仍停在
`external_review` 或后续 `blocked`。主 agent 需要手动读取 task-state / events 才能发现
audit / external review 的真实结果。

## 影响

- 主会话能感知内部两轮 review loop，违反“review 由 plan-runner/harness 内部处理”的交互模型。
- subagent 文本结果可能早于 harness final state，导致主会话误以为任务已完成。
- external review 的 repair prompt 虽然会回投 plan-runner session，但 `task` 工具结果已经交回主会话，主 agent 会被迫介入内部 findings。

## 复现

1. 后台派发 plan-runner smoke。
2. plan-runner 完成 todos 并返回 final report。
3. 主会话收到 `Result: completed`。
4. 读取 `~/.config/opencode/task-state/tasks/<task_id>.json`，可见状态仍为 `external_review` 或最终 `blocked`，events 中有 `external_review_started` / `external_review_failed` / `external_review_repair_prompt_sent`。

## 根因

`userconf/agents/plan-runner.md` 要求 plan-runner “完成所有 plan todos 后返回 final report”。
`userconf/plugins/plan-runner-harness.js` 的 terminal gate 又以 plan-runner session 的 completion
idle 作为触发边界：先 `self_check_completed`，再 deterministic / audit / external review。

OpenCode `task` 工具会在子 session 返回 final report 后把结果交回主会话；当前
`tool.execute.after(task)` 只绑定 child session 和 task state，不等待 harness 的
`validated` / `blocked` / `interrupted` 等最终状态。因此 review loop 在 task 工具结果之后继续运行，泄漏到主会话。

## 修复方案

- 新增 `finish_plan` harness completion tool，要求 plan-runner 在所有 plan todos completed 且验证完成后调用，而不是直接返回 final report。
- completion tool 在 plan-runner session 内触发并等待 deterministic / audit / external review，直到返回 `validated`、`repair_required`、`blocked` 或 `interrupted`。
- review 失败时，completion tool 把 findings 作为 `repair_required` 返回给 plan-runner 本身；不再让主 agent 消费 external review findings。
- plan-runner 根据 completion tool 结果修复并再次调用 tool；只有收到 `validated` 后才返回 final report，主会话最终只看到 validated 后的 completed 或 blocked。

## 验证

- 先写单测证明 completion tool 在 audit/external review 完成前不返回，`validated` 后才允许 plan-runner final report。
- 补充 repair 场景测试，确保 external review findings 返回给 plan-runner 的 completion tool 调用，而不是由主 agent 处理。
- 运行 `node --test "userconf/plugins/test/plan-runner-harness.test.mjs"`。
- 运行完整插件测试、`node --check` 和 `git diff --check`。
- 重启 OpenCode 后重新 smoke，主会话应只在 harness final state 后收到 task 结果。

## 预防

- 后续验证 plan-runner smoke 时，主 agent 可以核验 task-state，但不应根据 external review findings 自行修代码。
- 所有内部 review findings 必须通过 harness repair prompt 交给 plan-runner session；主会话只消费最终 `completed` / `blocked`。
