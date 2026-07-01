# bug: plan-runner 审计派发有 session 但无 prompt

## 现象

重启后真实 smoke 中，plan-runner 已完成全部 todo，harness 记录 `self_check_completed`、`deterministic_check_passed`、`audit_review_dispatched`，task-state 停在 `audit_review`。但 OpenCode DB 中 audit session `ses_0ec4e7f39ffeAOwBnLLwJ1c7jm` 没有 message 或 part，child session 在 task-state 中一直是 `running`，无法进入 audit idle / external review / validated。

第三轮重启后 smoke 再次复现：audit session `ses_0e96f080effewn2YszYdtS2HCf` 被创建，state 记录 `audit_review_dispatched`，但 DB 中该 session 的 message/part 仍为 0，且没有 `audit_dispatch_failed`。

## 根因 (6 要素)

1. **触发条件**：harness 通过 `client.session.create` 新建 audit child session 后，立即对该新 session 调用 `client.session.promptAsync`，并在返回后记录 `audit_review_dispatched`。
2. **期望链路**：audit child session 应收到 `agent: plan-runner-audit` 的 prompt，产生 message/part，idle 后由 harness 消费 JSON 审计结果。
3. **实际链路**：DB 只出现了 audit session 行，`message`、`part` 均为 0；harness 已把 state 推到 `audit_review` 并保留 running child。
4. **关键假设失效**：harness 把 `promptAsync` 返回当成“新建 audit session 的 prompt 已入队/可执行”。第一次修复只覆盖了 SDK 返回 `{ error: ... }` 的路径；第三轮证据表明 `promptAsync` 也可能无 error 返回却不落库任何 prompt。
5. **旁证**：同一 smoke 的 repair prompt 回投原 plan-runner session 有 DB message，且 `agent-switched` 计数为 0；动态 workflow 对“新建 session 后立即执行 prompt”的已工作实现使用 `client.session.prompt`，不是 `promptAsync`。
6. **影响范围**：terminal gate 可进入 audit dispatch，但无法闭合到 audit result、external review 和 `validated`；真实 smoke 会停在 `audit_review`。

## 修复方向

审计 child 是 harness 新建的一次性 session，应使用同步 `client.session.prompt` 启动并等待返回，语义与 dynamic workflow 一致；`promptAsync` 继续只用于回投原 plan-runner repair session。记录 `audit_review_dispatched` 前仍要检查 SDK error object，避免留下“dispatched 但无 prompt”的 running child。

## 验证

- RED 1：模拟 `promptAsync` 返回 `{ error: { data: { message } } }` 时，旧 harness 仍写 `audit_review` 和 `audit_review_dispatched`。
- GREEN 1：同一场景下 state 进入 `interrupted`，child session 标为 `orphaned`，event 写 `audit_dispatch_failed` 且包含 SDK error message。
- RED 2：模拟 audit dispatch 时只允许 `session.prompt` 成功、`session.promptAsync` 抛错，旧 harness 会走 `promptAsync` 并失败。
- GREEN 2：audit dispatch 调用 `session.prompt`，state 进入 `audit_review` 并写 `audit_review_dispatched`；真实 smoke 需在重启后重新验证。
