# bug: plan-runner 旧审计状态缺数组字段导致派发中断

## 现象

外部 review 指出 `auditPromptText` 和 `dispatchAuditReview` 直接访问 `state.modified_files.length`、`state.child_sessions.filter()`，旧 task state 缺字段时会抛 `TypeError`，使 audit 派发进入 `interrupted`。

## 根因 (6 要素)

1. **触发条件**：已持久化的旧 task state 进入 deterministic check 通过路径，但 JSON 中缺少 `modified_files` 或 `child_sessions` 数组字段。
2. **期望链路**：缺少这些审计展示/子会话索引字段时，harness 应按空数组处理，继续创建 audit child session。
3. **实际链路**：audit 派发直接对字段调用 `.length` / `.filter()`，字段为 `undefined` 时抛 `TypeError`。
4. **关键假设失效**：新建 state 会初始化这两个数组，但 task state 是持久化文件，真实环境可能存在旧版本或手工恢复的 state。
5. **旁证**：RED 用例删除 state JSON 中的 `modified_files` 和 `child_sessions` 后，第二次 idle 期望进入 `audit_review`，实际变为 `interrupted`。
6. **影响范围**：只影响旧/不完整 state 的 audit 派发路径；正常新 state 已在 `createInitialState` 初始化字段。

## 修复方向

在 audit 派发路径把缺失或非数组的 `modified_files`、`child_sessions` 视为空数组，不改变 state schema，也不扩大到无关 IO fallback 行为。

## 验证

- RED：删除持久化 state 中的 `modified_files` 和 `child_sessions` 后，audit 派发测试失败，状态为 `interrupted`。
- GREEN：相同旧 state 能进入 `audit_review`，记录 audit child session，并在 prompt 中输出 `none recorded`。
