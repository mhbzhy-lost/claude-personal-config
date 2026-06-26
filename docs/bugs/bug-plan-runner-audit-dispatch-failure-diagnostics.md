# bug: plan-runner audit 派发失败诊断不足

## 现象

外部 review 指出 audit child session 已创建后，若 `writeSessionIndex` 或 `promptAsync` 失败，当前失败事件缺少已创建 session id；同时错误信息只记录 `message`，复杂 SDK 错误会丢失诊断上下文。

## 根因 (6 要素)

1. **触发条件**：`client.session.create` 已返回 audit session，但后续写索引或投递 prompt 失败。
2. **期望链路**：失败状态应保留可诊断信息，包括已创建但未完成派发的 audit session id 和 SDK 错误上下文。
3. **实际链路**：`catch` 只写 `audit_dispatch_failed.error = String(error?.message || error)`，没有记录 orphan session id，也不兼容 `{ id: ... }` 形式的 session.create 返回。
4. **关键假设失效**：代码假设 SDK 错误只靠 `message` 足够排查，并假设 `session.create` 永远返回 `{ data: ... }` 包装结构。
5. **旁证**：mock `promptAsync` 抛带 `stack` / `response.data` 的错误时，旧事件无法定位已创建 session；mock `session.create` 返回 `{ id: "ses_audit" }` 时会误报缺 session id。
6. **影响范围**：只影响 audit 派发失败路径和 SDK 返回兼容性；正常成功路径不受影响。

## 修复方向

- `sessionIDFromCreateResult` 增加 `result.id` fallback。
- audit 派发失败事件记录 `orphan_session_id`。
- 失败错误序列化保留 `stack`、`response.data`、`stderr` 等诊断字段。

## 验证

- RED：`session.create` 返回 `{ id: "ses_audit" }` 时 audit 派发失败。
- RED：`promptAsync` 抛复杂错误时失败事件缺少 `orphan_session_id` 和响应上下文。
- GREEN：两种场景都按预期记录或继续派发。
