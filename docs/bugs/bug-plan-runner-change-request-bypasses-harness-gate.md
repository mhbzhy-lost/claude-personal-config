# Plan-Runner Change Request 绕过 Harness Gate

## 1. 现象

真实执行中，plan-runner 子会话发现原计划范围错误后，直接向父会话返回 `Change Request` 文本并停止。父会话看到原生 `task` 结果为 `state="completed"`，但 harness task-state 仍停留在 `status="executing"`、`active_task="T2"`、`T2.status="in_progress"`。

证据：

- task-state: `~/.config/opencode/task-state/tasks/planrun-ses_0eec0d328ffewd4Kf5WXFT29s7-call_zUm9zY3Cp2hyF8PNX67BodMO.json`
- event stream: `~/.config/opencode/task-state/events/planrun-ses_0eec0d328ffewd4Kf5WXFT29s7-call_zUm9zY3Cp2hyF8PNX67BodMO.jsonl`
- plan-runner session: `ses_0bfa8588fffeSOUGCnOtMPwh5o`
- parent session: `ses_0eec0d328ffewd4Kf5WXFT29s7`

## 2. 影响

- `finish_plan` terminal gate 没有执行。
- `watchdog_nudge_sent` 没有出现，主 agent 只能看到普通 background task 完成回流。
- task-state 保持非终态，后续排障容易误判为仍在执行。
- plan-runner 的变更被子会话自行 `git restore .` 清掉；主 agent 只能从 raw final 文本判断要接续，harness 没有明确发送 resume notification。

## 3. 复现路径

1. 通过原生 `task` 派发 `subagent_type="plan-runner"`。
2. plan-runner 写入计划并开始执行任务。
3. 执行中发现计划范围缺失，需要修改计划或请求主 agent 决策。
4. plan-runner 不调用 `complete_task` 或 `finish_plan`，直接返回最终文本：

```text
Change Request:
- Original assumption: 删除 `crash_analyzer/mcp_server.py` 不影响计划外生产代码。
- Contradicting evidence: 删除后残留扫描发现 `crash_analyzer/webhook.py` 仍 `from .mcp_server import handle_fix_with_aimi`，full unit 会因该依赖断裂。
- Proposed change: 扩大计划范围，明确迁移 `webhook.py` 的后台 AIMI dispatch 逻辑到 CLI/runner 可复用入口，或决定同步移除 webhook-serve。
- Needed decision: 是否允许把 `crash_analyzer/webhook.py` 与对应 webhook 单测纳入本次 CLI-only 改造范围。
```

5. 父会话收到原生 task result：`<task id="ses_0bfa8588fffeSOUGCnOtMPwh5o" state="completed">...`。

## 4. 根因

当前 harness 的结构化状态推进依赖 plan-runner 显式调用 harness 工具（`write_plan` / `start_task` / `complete_task` / `finish_plan`）和特定 gate 流程。plan-runner 以普通 assistant final 文本结束时，原生 `task` 只把子会话结果回流给父会话；harness 没有向 parent session 发送“未 validated，需要接续”的明确通知。

另外，已有 watchdog 设计主要处理“任务已完成但 terminal gate 未推进”的场景。该真实样本仍有 `active_task="T2"` 且任务 `in_progress`，因此不能复用完成后 gate nudge 语义；正确动作是唤醒 parent，由主 agent 检查 task-state 并决定续派发或询问用户。

## 5. 修复方向

- 用 `start_plan_runner` 专用工具替代原生 `task` 派发 plan-runner，让 harness 掌握 parent notification 和 resume 入口。
- 成功完成报告只能来自 `finish_plan` validated 后的 `[PLAN-RUNNER VALIDATED]` parent notification。
- plan-runner 提前结束但未 validated 时，harness 发送 `[PLAN-RUNNER RESUME REQUIRED]`，不新增业务终态，不覆盖原 `status` / `active_task` 现场。
- 支持后续从同一 run worktree 续派发，让主 agent 批准改计划后能保留/恢复上下文，而不是重新从空白状态开始。

## 6. 验证计划

- 单测：`finish_plan` validated 后，harness 向 parent session 发送 `[PLAN-RUNNER VALIDATED]` completion report。
- 单测：plan-runner session final 但 state 未 `validated` 时，harness 向 parent session 发送 `[PLAN-RUNNER RESUME REQUIRED]`，且不修改原 `status` / `active_task`。
- 单测：普通任务完成但未调用 `finish_plan` 时，原 watchdog nudge 仍只触发一次。
- 单测：`start_plan_runner` 指定 existing worktree/task 续派发时，不清理 partial changes，并把新 session 重新绑定到同一 task-state。
- 回归：`node --test "userconf/plugins/test/plan-runner-harness.test.mjs"`
- 全量：`node --test "userconf/plugins/test"/*.mjs "scripts/test/opencode-subagent-event-probe.test.mjs"`
- 空白：`git diff --check`
