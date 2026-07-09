# bug: plan-runner 并发 child dispatch 覆盖 child state

## 现象

自然单阶段 `opencode serve` smoke 中，root plan-runner 并发派发两个 executor child。events 里出现两个 `child_worktree_created` 和两个 `child_session_bound`，但最终 task state 只有第二个 child 是 `session_id` 已绑定且 `status=completed`；第一个 child 退回 `session_id:null/status:dispatching`。`finish_plan` 首次 preflight 因两个 child worktree 残留返回 `preflight_blocked`，plan-runner 后续清理后仍能 `validated`，但账本不完整。

## 根因 (6 要素)

1. **触发条件**：plan-runner 在同一个 active task 内几乎同时调用两个 `task(background=true, subagent_type=executor)`。
2. **期望链路**：每个 child 的 `tool.execute.before(task)` 创建独立 child worktree 并写入 `child_sessions[]`；对应 `tool.execute.after(task)` 用 `output.metadata.sessionId` 绑定同一个 call 的 child session；两个 child 最终都应 `completed`。
3. **实际链路**：两个 `before/after` hook 并发读写同一个 task-state JSON；第二个 hook 可能基于旧 state 写回，覆盖第一个 hook 刚写入的 `session_id/status`。
4. **关键假设失效**：实现只串行化 `event` hook，假设 tool hooks 自然串行；但 OpenCode 可并发处理多个 background `task` tool call 的 before/after，hook 内 read-modify-write 不是原子操作。
5. **旁证**：证据目录 `/var/folders/27/6bnn8n7d4px6s33fvdpns89c0000gn/T/opencode/plan-runner-natural-permission-smoke-kLaA1Z` 的 events 记录 `call_00...` 和 `call_01...` 都已 `child_session_bound`；最终 state 中 `call_00...` 仍 `session_id:null/status:dispatching`，`call_01...` 为 `completed`。
6. **影响范围**：真实并发 DAG 任务可能完成文件层合并，但 harness child 账本丢失，导致 preflight 误阻塞、审计上下文不完整、smoke 判定不稳定。

## 修复方向

把 plan-runner harness 中会读写 task-state 的 `tool.execute.before` / `tool.execute.after` 与 event handler 放入同一串行队列，避免并发 read-modify-write 覆盖。测试应并发触发两个 child dispatch，并断言两个 child 都保留 session id 和 running/completed 状态。

## 修复记录

- `userconf/plugins/plan-runner-harness.js`：把 `tool.execute.before`、`tool.execute.after` 和 `event` handler 放入同一个 `stateQueue` 串行执行，避免并发 hook 对 task-state JSON 做非原子 read-modify-write。
- `userconf/plugins/test/plan-runner-harness.test.mjs`：新增并发 child dispatch 回归测试，使用两个并发 `task` call 复现第一个 child binding 被覆盖的问题。

## 验证

- RED：`node --test --test-name-pattern "preserves child session bindings" "userconf/plugins/test/plan-runner-harness.test.mjs"` 失败，`child_sessions.length` 为 1 而不是 2。
- GREEN：同一命令通过。
- GREEN：`node --test --test-name-pattern "creates a harness-managed worktree|preserves child session bindings|marks harness-managed executor child sessions completed|write_plan rejects primary|write_plan rejects non plan-runner" "userconf/plugins/test/plan-runner-harness.test.mjs"`
- LIVE：`/var/folders/27/6bnn8n7d4px6s33fvdpns89c0000gn/T/opencode/plan-runner-dag-contract-smoke-K62R7J` 中 `child_worktree_created=2`、`child_session_bound=2`、`child_session_completed=2`，两个 executor child 均保留 session id 且最终 completed。
