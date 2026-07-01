# bug: plan-runner 审计文本 part 未被消费

## 现象

重启后的真实 `plan-runner` smoke 已完成 plan/todo、记录 diff evidence，并进入
`self_check_completed`、`deterministic_check_passed`、`audit_review_dispatched`。Audit
child session `ses_0e82ec9b8ffe2rOEfUG6ie3iKX` 也产生了 message/part，但 task-state
最终停在 `repairing`，`reviews.audit[0].required_fixes` 记录
`audit review did not return valid JSON`。

OpenCode DB 显示 audit child 实际输出过 JSON text part：

```json
{"result":"fail","rejected_tasks":[],"unknown_tasks":[],"unmapped_files":[],"required_fixes":["external-llm-review 或 reviewer.py 尚无已针对当前 diff 运行并通过的证据，需完成该 gate 后才能最终通过"]}
```

## 根因 (6 要素)

1. **触发条件**：audit child 的最终回答以 OpenCode `message.part.updated` text part 形式写入，随后 session idle。
2. **期望链路**：harness 应在 audit child idle 前收集最终文本，并把 JSON 审计结果写入 `reviews.audit`。
3. **实际链路**：harness 只在 `message.updated` 上读取 `event.properties.info.parts/text`，真实 `message.updated` 不带最终 text，导致 `reviews.pending_audit_text` 为空。
4. **关键假设失效**：此前假设 audit 文本会出现在 `message.updated.info`；OpenCode schema/实测表明 text 内容主要通过 `message.part.updated` 独立事件发布。
5. **旁证**：同一 audit session 的 DB 中 `part.data.type == "text"` 保存了完整 JSON；OpenCode schema `packages/schema/src/v1/session.ts` 把 `MessageUpdated.info` 与 `PartUpdated.part` 分成两个事件。
6. **影响范围**：audit child 实际完成且有审计意见时，harness 仍可能按空文本误判 invalid JSON，无法进入正确的 audit fail/pass 分支和 external review/final completeness。

## 修复方向

harness 的 audit 消费逻辑需要同时监听 audit session 的 `message.part.updated` text part，累积到
`reviews.pending_audit_text`。`message.updated` 的旧路径保留，用于兼容包含 `info.parts/text`
的测试/未来事件形态。

## 验证

- RED：模拟 audit JSON 只通过 `message.part.updated` text part 到达，再触发 `session.idle`；旧 harness 误判 invalid JSON 并发送 repair prompt。
- GREEN：同一事件序列下，harness 消费 text part 中的 JSON；若 result 为 pass，应进入 external review 并最终 validated。
- Live smoke：重启后 docs-only smoke 不应再因 `audit review did not return valid JSON` 停在 `repairing`。

已执行：

- `node --test "userconf/plugins/test/plan-runner-harness.test.mjs"`：RED 时新增用例失败为 `actual 'repairing'`，GREEN 后通过。
- `node --test "userconf/plugins/test"/*.mjs "scripts/test/opencode-subagent-event-probe.test.mjs"`：177/177 pass。
