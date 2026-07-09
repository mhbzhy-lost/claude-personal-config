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
- plan-runner 的变更被子会话自行 `git restore .` 清掉；主 agent 只能从 raw final 文本判断要接续，harness task-state 只能作为历史诊断材料。

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

当前 harness 的结构化状态推进依赖 plan-runner 显式调用 harness 工具（`write_plan` / `start_task` / `complete_task` / `finish_plan`）和特定 gate 流程。plan-runner 以普通 assistant final 文本结束时，原生 `task` 只把子会话结果回流给父会话；harness task-state 不会自动恢复、补偿或迁移该未完成执行。

另外，已有 watchdog 设计主要处理“任务已完成但 terminal gate 未推进”的场景。该真实样本仍有 `active_task="T2"` 且任务 `in_progress`，因此不能复用完成后 gate nudge 语义；正确动作是主 agent 检查旧 task-state 和 worktree，把需要延续的上下文写入新的 `start_plan_runner` prompt，或先询问用户。

## 5. 修复方向

- 用 `start_plan_runner` 专用工具替代原生 `task` 派发 plan-runner，确保每次运行都有 harness-owned run worktree 和独立 task-state。
- 成功完成只能由 `finish_plan` 返回 `validated` 后声明；plan-runner raw final text 不能作为完成报告。
- plan-runner 提前结束但未 `validated` 时，不新增业务终态，不自动改写旧 `status` / `active_task` 现场。
- 不支持从同一 `task_id` / `existing_worktree` 恢复旧 harness state；旧 state 只作历史诊断材料。继续执行必须新建 `start_plan_runner` run，并在 prompt 中引用旧 task id、旧 worktree 和需要用户决策的上下文。

## 6. 验证计划

- 单测：原生 `task` 派发 `plan-runner` 被拒绝，提示使用 `start_plan_runner`。
- 单测：`start_plan_runner` 每次重新派发都创建新的 `task_id` 和 task-state，不改写旧非 `validated` state。
- 单测：普通任务完成但未调用 `finish_plan` 时，原 watchdog nudge 仍只触发一次。
- 慢测：audit / external review / fail-open terminal-gate 链路在 `OPENCODE_PLAN_RUNNER_SLOW_TESTS=1` 下通过。
- 回归：`node --test "userconf/plugins/test/plan-runner-harness.test.mjs"`
- 全量：`node --test "userconf/plugins/test"/*.mjs "scripts/test/opencode-subagent-event-probe.test.mjs"`
- 空白：`git diff --check`
