# bug: plan-runner audit JSON 错误消耗修复预算

## 现象

`opencode serve` smoke 中，`plan-runner-audit` 子会话偶发输出非严格 JSON。旧 harness 将该解析错误当作
audit fail，并通过 `promptRepair()` 返回给 plan-runner，导致 plan-runner repair 预算被 audit 输出格式问题
消耗。后续 external review 再发现问题时更容易达到 `blocked`。

## 根因 (6 要素)

1. **触发条件**：audit child 的最终文本不是合法 JSON，或 JSON schema 不符合 harness 只消费的
   `result` / `required_fixes` 结构。
2. **期望链路**：audit 输出结构足够简单，偶发格式错误应先要求 audit child 自己重新生成；多次仍失败时
   fail-open 继续后续 gate，同时在 state 记录失败原因供排查。
3. **实际链路**：`normalizeAuditReview()` catch 后返回 `result = fail`，`handleAuditReviewIdle()` 把
   `audit review must return valid JSON` 作为 repair reason 传给 plan-runner。
4. **关键假设失效**：harness 把 audit child 的输出格式错误等同于 plan-runner 产物错误；但该错误无法通过
   修改工作区文件修复，应由 audit child 重写回答或由 harness fail-open。
5. **旁证**：live smoke events 中出现 `audit_review_failed` / `audit_review_repair_required`，reason 为
   `audit review must return valid JSON`，随后 external review 才开始。
6. **影响范围**：任何 audit child 偶发输出非 JSON 的任务都会浪费 plan-runner repair 预算，降低
   `finish_plan` 到达 external review / validated 的稳定性。

## 修复方向

将 audit 输出错误与 plan-runner 产物错误分离：第一次 audit JSON/schema 错误时向同一个 audit child 追加
regeneration prompt；累计 2 次仍失败则视为 audit pass，继续 external review，并在
`reviews.audit[0].invalid_json_reason` / `invalid_json_attempts` 记录失败原因。

## 验证

- RED：第一次 audit 输出非 JSON 时，旧 harness 直接返回 `repair_required` 给 plan-runner。
- GREEN：第一次非 JSON 会重投 audit child；第二次仍非 JSON 时 task 继续 external review，state 记录
  invalid JSON 原因且不向 plan-runner repair。
