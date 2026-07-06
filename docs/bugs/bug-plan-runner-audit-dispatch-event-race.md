# bug: plan-runner audit dispatch 测试提前读取 events

## 现象

全量 `node --test "userconf/plugins/test"/*.mjs "scripts/test/opencode-subagent-event-probe.test.mjs"` 中，`does not continue review when repair completes via message update; finish_plan is required` 偶发失败。失败时 state 已进入 `audit_review`，`prompts` 已收到 `plan-runner-audit` prompt，但 events 只到 `deterministic_check_passed`，断言读不到 `audit_review_dispatched`。

## 根因 (6 要素)

1. **触发条件**：测试用 fake `client.session.prompt` 同步把 payload push 到 `prompts` 数组，随后才等待 events 中的 audit dispatch 记录。
2. **期望链路**：测试应等待 harness 完整完成 audit dispatch 副作用，再读取 events。
3. **实际链路**：`waitUntil(() => prompts.some(...))` 在 fake prompt push 后立即返回，此时 `dispatchAuditReview()` 仍可能尚未执行后续 `appendEvent(audit_review_dispatched)`。
4. **关键假设失效**：测试假设“prompt 数组出现 audit payload”与“audit dispatch event 已持久化”是同一时刻；真实异步链路中二者有先后顺序。
5. **旁证**：失败日志包含 `deterministic_check_passed` 且 state 为 `audit_review`，说明 deterministic 已通过并开始 audit；缺失的只是稍后的 event 写入观测点。
6. **影响范围**：该问题不影响 runtime 行为，但会让全量测试因竞态误报失败，掩盖真实回归。

## 修复方向

把测试等待条件从只观察 `prompts` 改为等待 events 中出现 `audit_review_dispatched`，同时继续断言 audit prompt 的 agent 是 `plan-runner-audit`。

## 验证

- RED：全量测试复现该用例提前读取 events，断言缺少 `audit_review_dispatched`。
- GREEN：测试等待 event 持久化后再断言，`node --test userconf/plugins/test/plan-runner-harness.test.mjs` 和全量 node 测试通过。
