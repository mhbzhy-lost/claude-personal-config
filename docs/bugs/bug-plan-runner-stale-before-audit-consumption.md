# bug: plan-runner stale 扫描先于 audit 消费

## 现象

`plan-runner` terminal gate 已收到 audit 子会话的通过 JSON，state 中存在 `reviews.pending_audit_text`，但随后 task 被标记为 `stale`，没有继续进入 external review / validated。

## 根因 (6 要素)

1. **触发条件**：audit 子会话输出结果后，`lease_expires_at` 已过期，任意 `session.idle` 或 `todo.updated` 事件触发 harness event hook。
2. **期望链路**：当前事件应先完成可消费状态推进；audit 结果应由 audit idle 消费并转成 `audit_review_passed`，再继续后续 terminal gate。
3. **实际链路**：event hook 先执行全局 `markExpiredTasks(stateDir)`，再执行 `handleAuditReviewMessage()` / `handleAuditReviewIdle()`。
4. **关键假设失效**：实现假设 stale 扫描只是在空闲边界做清理，不会抢占当前 gate 的已完成结果；实际扫描会遍历所有 active task，并在消费 audit 结果前把任务改成 `stale`。
5. **旁证**：blocked state 中 `status = stale` 且 `reviews.pending_audit_text` 为 pass JSON；events 最后为 `audit_review_dispatched` 后 `task_stale`，缺少 `audit_review_passed`。
6. **影响范围**：terminal gate 的 audit 阶段可能停在“结果已到但未消费”的半完成态，`finish_plan` 无法完成 validated。

## 修复方向

不引入重入/恢复机制。保持严格串行模型，只修事件消费顺序：先处理当前事件可推进的 state，再在末尾执行 stale 扫描，避免过期清理抢占已到达的 audit 结果。

## 验证

- RED：构造 `audit_review` task，`lease_expires_at` 已过期且存在 audit 子会话 pass JSON；audit idle 事件应先消费结果并进入 external review，而不是先变 `stale`。
- GREEN：同一场景下生成 `audit_review_passed`，state 继续到 `validated`，不产生 `task_stale`。
