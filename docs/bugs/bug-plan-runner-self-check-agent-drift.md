# bug: plan-runner self-check 后切到 build agent

## 现象

真实后台 `plan-runner` smoke task 在 self-check prompt 后，OpenCode DB 中同一子会话出现 `agent-switched` 到 `build`，task-state 停在 `self_checking` / `stale`，没有进入 audit / external review / validated。

## 根因 (6 要素)

1. **触发条件**：harness 通过 `client.session.promptAsync()` 向原 `plan-runner` session 注入 self-check、validation repair、audit repair 或 external review repair prompt。
2. **期望链路**：这些 prompt 必须继续由 `plan-runner` agent 消费，才能保持 phase gate、工具契约和 review loop 的同一执行上下文。
3. **实际链路**：回填原 session 的 `promptAsync` body 只包含 `parts`，没有显式设置 `agent: "plan-runner"`。
4. **关键假设失效**：实现假设向已有 session prompt 会沿用原 agent；真实 OpenCode 会话在后续消息中切回默认 `build` agent。
5. **旁证**：`opencode.db` 的目标 subagent session 在 self-check 后出现 `session_message type=agent-switched agent=build`，且后续 assistant message 不再是 `plan-runner`。
6. **影响范围**：self-check / repair 轮次可能脱离 plan-runner harness 契约，导致审计阶段不触发或真实运行结果无法证明 `validated`。

## 修复方向

所有投递回原 `plan-runner` session 的 `promptAsync` 都显式携带 `body.agent = "plan-runner"`；audit child session 仍使用 `plan-runner-audit`。

## 验证

- RED：断言 self-check 和 repair prompt 的 body 含 `agent: "plan-runner"`，当前实现缺失该字段。
- GREEN：同一断言通过，audit child prompt 仍为 `agent: "plan-runner-audit"`。
