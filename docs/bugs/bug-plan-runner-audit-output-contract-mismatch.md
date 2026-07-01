# bug: plan-runner audit 输出契约与 harness 解析不一致

## 现象

`plan-runner` harness 已在 audit child session idle 后严格解析 audit message 中的 JSON，但 `plan-runner-audit` agent 仍要求返回旧版 text 格式（`Audit result: pass | fail`）。真实运行时 audit 可能按旧格式输出，harness 会把它当作 invalid JSON 并回流 repair。

## 根因 (6 要素)

1. **触发条件**：deterministic check 通过，harness 派发 `plan-runner-audit`，audit agent 按自身 prompt 返回旧 text 格式。
2. **期望链路**：audit agent 的输出契约必须与 `normalizeAuditReview()` 一致，返回 harness 消费的 JSON 字段：`result`、`rejected_tasks`、`unknown_tasks`、`unmapped_files`、`required_fixes`。
3. **实际链路**：`userconf/agents/plan-runner-audit.md` 仍写着 `Return concise findings in this format:` 并给出 text block，而 harness 只接受 JSON。
4. **关键假设失效**：实现 audit JSON 消费时只更新了 harness 测试和知识文档，没有同步更新 audit agent 的直接行为契约。
5. **旁证**：agent 文档第 24 行开始仍包含 `Audit result: pass | fail` text 模板；harness 对非 JSON 文本会写入 `required_fixes: audit review must return valid JSON`。
6. **影响范围**：所有真实 audit session 都可能无条件进入 repair，导致 review 闭环卡在格式错误而不是实际任务问题。

## 修复方向

最小修复同步 `plan-runner-audit` agent 输出格式：要求只返回 JSON object，禁止 markdown fence 和额外解释，并给出字段 schema。

## 验证

- RED：新增 agent 契约测试，要求 `plan-runner-audit.md` 包含 JSON schema 字段并不再包含旧 text 模板；当前失败。
- GREEN：更新 agent prompt 后同一测试通过。
