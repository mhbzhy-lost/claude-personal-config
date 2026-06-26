# bug: plan-runner deterministic check 通过后未触发 review 阶段

## 现象

真实 `plan-runner` 子会话完成 self-check 后，task state 停在 `audit_review`，但没有继续触发审计 subagent 或 external review。

## 根因 (6 要素)

1. **触发条件**：`plan-runner` 已写入 plan、todo 全部完成、self-check 已完成，且 deterministic check 没有失败原因。
2. **期望链路**：deterministic check 通过后，harness 应继续驱动 review 阶段，直接创建 audit child session 并投递 audit prompt，避免 agent 停止在 claimed completion。
3. **实际链路**：`handlePlanRunnerIdle` 在 `findDeterministicCheckFailures(state)` 返回空数组时，只执行 `state.status = "audit_review"`、写 state、追加 `deterministic_check_passed` event，然后直接 `return`。
4. **关键假设失效**：代码把 `audit_review` 状态当成后续流程会消费的队列状态，但当前 harness 没有任何 handler 消费 `audit_review` / `external_review`，也没有 promptAsync 或外部 review 调用。
5. **旁证**：真实 task state 中 `reviews.audit` 和 `reviews.external` 均为空；events 最后只到 `self_check_completed` / `deterministic_check_passed`。
6. **影响范围**：所有通过 deterministic check 的 `plan-runner` 执行都会在 review 阶段静默停止，外源评审只剩 `git push` gate 兜底，不能在 plan-runner 完成时即时发现问题。

## 修复方向

最小修复让 deterministic check 通过后由 harness 直接调用 OpenCode SDK：

- `client.session.create({ body: { parentID: plan_runner_session_id } })` 创建 audit child session。
- `client.session.promptAsync({ body: { agent: "plan-runner-audit" } })` 后台启动只读 audit agent。
- 记录 `child_sessions`、session index 和 `audit_review_dispatched` event。
- audit prompt 要求检查是否仍需运行 `external-llm-review` / `reviewer.py`。

完整的 harness-owned external review runner 和 audit 结果消费仍是后续 T12-T14 范围；当前修复先消除“状态置为 audit_review 后无人消费”的停机 bug。

## 验证

- RED：deterministic check 通过后的第二次 idle 应创建 audit child session；当前实现不会调用 `session.create`，测试失败。
- GREEN：同一场景下 `session.create` 和 `promptAsync(agent=plan-runner-audit)` 被调用，state 为 `audit_review`，event log 包含 `audit_review_dispatched`。
- 真实 server：临时 `opencode serve` wrapper 探针加载当前 harness 和 `plan-runner-audit` agent，合成 `session.idle` 后观察到 `self_check_completed`、`deterministic_check_passed`、`audit_review_dispatched`，且 audit child session 的 `parentID` 为 plan-runner session。
