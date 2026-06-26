# Plan Runner Harness 执行闭环计划

## 目标

实现一个由 harness 驱动的 `plan-runner` 执行闭环：计划写入、todo 对齐、执行审计、退出后 validation、审计 subagent、异源评审、失败回流修复、最终标记 validated。

## 非目标

- 不保证代码一定业务可用。
- 不依赖 plan-runner 自述“已完成”。
- 不依赖 prompt 约束作为 gate。
- 不用 workspace 内运行态文件作为 truth source。
- 不做 plan-runner 启动时全局清理。
- 不要求 agent 在实现前声明完整影响文件；实际影响范围由 harness 从工具事件中事后记录。

## 核心原则

- 运行态状态放全局 `~/.config/opencode/task-state/`。
- 计划文档放 workspace `docs/plans/<task_id>.md`。
- `task_id = planrun-<parent_session_id>-<dispatch_call_id>`。
- agent 通过 `write_plan` 提交结构化 plan draft；harness 只抽取 gate 会消费的 `plan_contract`。
- `todowrite` 是执行 UI，不是 validation contract。
- 所有完成判断基于 harness 观察到的 tool/event evidence。
- 最终完成判断由 completeness checker 扫描 `task_state` 推导，不维护额外 gate 列表。
- `session.idle(plan-runner)` 是 validation 触发点，不是可信完成点。

## OpenCode 事件实测结论

2026-06-25 在 OpenCode `1.17.10` 上用 `opencode serve` + `opencode run --attach` 验证：

- 直接 `opencode run` 只触发 config 类插件初始化，不足以验证 tool/event hook；真实探针必须走 server/TUI 路径。
- `tool.execute.before` 输入包含 `tool`、`sessionID`、`callID`，可读取和修改 `output.args`。
- `tool.execute.after` 输入包含原始 `args`，输出包含 `title`、`output`、`metadata`；bash exit code 位于 `output.metadata.exit`。
- `task` 工具完成后 `output.metadata.sessionId` 是 child session id，`output.metadata.parentSessionId` 是父 session id。
- `session.created` 事件包含 `properties.info.parentID`、`agent`、`directory`，可作为 child session 绑定 fallback。
- `message.part.updated` 会流出 tool part 的 `pending/running/completed/error` 状态，可补充记录被 before hook 阻断的错误。
- `session.status` 会出现 `busy/idle`，随后有 `session.idle`；`session.idle` 的 properties 至少包含 `sessionID`。
- 在 `session.idle` 后调用 `client.session.promptAsync(...)` 能把 validation 结果投递回同一 session，并触发 agent 继续执行。
- `promptAsync` 必须只投递给目标 plan-runner session；不能对所有 idle session 广播。
- 2026-06-26 在 OpenCode `1.17.11` 上用真实 `opencode serve` wrapper 探针验证：harness
  可在 `session.idle(plan-runner)` 后通过 server 注入的 client 创建 audit child session，
  并投递 `agent: plan-runner-audit` 的 `audit_review_required` prompt。

## 目录结构

全局运行态：

```text
~/.config/opencode/task-state/
  tasks/<task_id>.json
  events/<task_id>.jsonl
  sessions/<session_id>.json
  reviews/<task_id>/audit-round-1.json
  reviews/<task_id>/external-round-1.json
  reviews/<task_id>/audit-round-2.json
  reviews/<task_id>/external-round-2.json
  corrupt/
  archive/
```

workspace 文档：

```text
docs/plans/<task_id>.md
```

说明：

- `tasks/<task_id>.json` 是当前 task 的结构化状态。
- `events/<task_id>.jsonl` 是 append-only 审计日志。
- `sessions/<session_id>.json` 是 session 到 task 的反查索引。
- `docs/plans/<task_id>.md` 是人类可读计划文档。

## Task State 模型

```json
{
  "version": 1,
  "task_id": "planrun-parent-call",
  "status": "dispatching",
  "parent_session_id": "ses-parent",
  "dispatch_call_id": "call-task",
  "plan_runner_session_id": null,
  "worktree": "/repo",
  "git_base": "abc123",
  "updated_at": 1760000000,
  "lease_expires_at": 1760000600,
  "plan_path": "/repo/docs/plans/planrun-parent-call.md",
  "plan_sha256": "...",
  "plan_contract": {
    "tasks": [
      {
        "id": "T1",
        "title": "...",
        "completion_criteria": ["..."],
        "evidence_required": ["diff"]
      }
    ],
    "dag": [],
    "parallel_sets": []
  },
  "todo": {
    "mirrored": false,
    "last_seen": []
  },
  "evidence": [],
  "modified_files": [],
  "child_sessions": [],
  "reviews": {
    "round": 0,
    "audit": [],
    "external": []
  },
  "self_check": {
    "status": "not_started",
    "round": 0
  }
}
```

状态枚举：

```text
dispatching
planning_required
waiting_for_todo
ready_to_execute
executing
self_checking
deterministic_check
audit_review
external_review
repairing
validated
blocked
interrupted
stale
```

### Task State 字段消费表

Task state 只保留后续流程会消费的字段。完整语义计划只写入 markdown，不重复存入 state。

| 字段 | 来源 | 消费方式 |
|---|---|---|
| `version` | harness | state schema 迁移和兼容判断 |
| `task_id` | harness，根据 `parent_session_id + dispatch_call_id` 生成 | state 文件主键、event/review/session 索引、日志关联 |
| `status` | harness 状态机 | phase gate、idle validation、repair loop、pre-push 兜底 |
| `parent_session_id` | `tool.execute.before(task).input.sessionID` | 绑定 `plan-runner` child session；识别主 session 归属 |
| `dispatch_call_id` | `tool.execute.before(task).input.callID` | 生成 `task_id`；区分同一父 session 内并发 task 派发 |
| `plan_runner_session_id` | `tool.execute.after(task).output.metadata.sessionId`；fallback 为 `session.created.info.parentID` | 路由 plan-runner 工具调用、监听 idle、投递 repair prompt |
| `worktree` | plugin/runtime context | 派生 `plan_path`；pre-push 按当前 worktree 查相关 task；git 命令工作目录 |
| `git_base` | harness git command | diff 计算基线；pre-push 判断当前 diff 与 task 的关联 |
| `updated_at` | harness event refresh | stale/lease 计算；debug 最近活动 |
| `lease_expires_at` | harness lease policy | 非正常中断后标记 stale，避免残留 state 污染后续任务 |
| `plan_path` | harness 根据 worktree 和 task_id 派生 | 检查计划文档存在；审计/external review 输入 |
| `plan_sha256` | harness 写入 markdown plan 后计算 | 检查计划文档是否仍匹配 `plan_contract` 对应版本 |
| `plan_contract.tasks[].id` | harness 生成 `T1/T2/...` | 校验 todowrite 覆盖所有 task；evidence 与 task 绑定 |
| `plan_contract.tasks[].title` | `write_plan` 参数，经 harness 校验 | 生成 markdown；审计/external review 上下文 |
| `plan_contract.tasks[].completion_criteria` | `write_plan` 参数，经 harness 校验 | 审计/external review 上下文；不作为完成事实 |
| `plan_contract.tasks[].evidence_required` | harness 统一生成 | completeness checker 判断 claimed task 是否有对应 evidence |
| `plan_contract.dag` | `write_plan` 参数，经 harness 校验 | 审计/external review 上下文；phase 1 不做确定性顺序 gate |
| `plan_contract.parallel_sets` | `write_plan` 参数，经 harness 校验 | 审计/external review 上下文；phase 1 不做确定性并发完成 gate |
| `todo.mirrored` | harness 对齐检查 | phase gate 从 `waiting_for_todo` 进入 `ready_to_execute` 的条件 |
| `todo.last_seen` | `todo.updated` event | 判断当前唯一 `in_progress` task；判断是否仍有 pending/in_progress |
| `evidence` | harness event recorder | completeness checker 的主要输入；关联 diff/command/tool failure 与 task |
| `modified_files` | harness 从 evidence/message diff/session.diff/git diff 维护的索引 | pre-push 快速定位相关 task；检查是否有未映射文件变更 |
| `child_sessions` | `session.created.parentID == plan_runner_session_id` | 等待 child idle；判断并发节点是否结束；审计输入 |
| `reviews.round` | harness 计数 | repair loop 上限，两轮失败后 blocked |
| `reviews.audit` | harness 记录审计 subagent JSON 结果 | final completeness check；repair prompt 输入 |
| `reviews.external` | harness 记录 external review JSON 结果 | final completeness check；pre-push 兜底依据 |
| `self_check.status` | harness 在首次完成尝试时写入 | `session.idle` re-entry 判断：`not_started` 时先投递 self-check，`prompted` 的下一次 idle 才允许 deterministic check |
| `self_check.round` | harness 在投递 self-check prompt 后递增 | 限制当前切片只做一次 completion self-check，避免同一完成尝试反复自检而不进入确定性检查 |

不进入 task state 的字段：`project_id`、`workspace_id`、`directory`、`branch`、`created_at`、`goal`、`approach`、`non_goals`、`stop_conditions`、`affected_files`、`kind`、`harness_gates`。

原因：这些字段要么可由现有字段推导，要么只服务人类阅读，要么会误导 harness 预判实现范围。需要人审的信息写入 `docs/plans/<task_id>.md`，需要事实判断的信息写入 `evidence` 或 `reviews`。

## 启动绑定

`tool.execute.before(task)` 发现父 session 要启动 `plan-runner` 时：

- 生成 `task_id`。
- 记录 `parent_session_id`。
- 记录 `dispatch_call_id`。
- 记录 `git_base` 和 worktree。
- 创建 `tasks/<task_id>.json`。
- 创建 `events/<task_id>.jsonl`。
- 写 `sessions/<parent_session_id>.json`。
- 在 pending bind map 中记录 `dispatch_call_id -> task_id`。

marker 示例：

```text
Harness Task ID: planrun-<parent_session_id>-<dispatch_call_id>
```

`tool.execute.after(task)` 绑定 plan-runner child session：

```text
input.callID == dispatch_call_id
output.metadata.parentSessionId == parent_session_id
output.metadata.sessionId 存在
```

```text
plan_runner_session_id = output.metadata.sessionId
status = planning_required
写 sessions/<plan_runner_session_id>.json
```

fallback：如果 `tool.execute.after(task)` 缺失 metadata，则用 `event(session.created)` 中的：

```text
info.parentID == parent_session_id
info.agent == "plan-runner"
```

fallback 只能在同一 `parent_session_id` 下没有其他待绑定 plan-runner 时使用；否则要求 task prompt 中的 Harness Task ID marker 辅助区分。不要依赖不存在的 `session.next.prompted` 事件。

并发安全点：

- `parent_session_id + dispatch_call_id` 足够区分同一父 session 内多个并发 plan-runner。
- `tool.execute.after(task).output.metadata.sessionId` 是并发绑定首选事实源。
- session marker 只作为缺 metadata 时的 fallback，防止 `parentID + agent` 在并发场景下误绑。

## write_plan 工具

新增自定义工具：`write_plan`。

该工具只能在 `context.agent == "plan-runner"` 且 session 处于 `planning_required` 时使用。

agent 输入是 plan draft，不是可信事实；工具 schema 负责强制 plan 结构：

```json
{
  "title": "...",
  "goal": "...",
  "approach": "...",
  "non_goals": ["..."],
  "tasks": [
    {
      "title": "...",
      "completion_criteria": ["..."]
    }
  ],
  "dag": [
    ["T1", "T2"]
  ],
  "parallel_sets": [
    ["T2", "T3"]
  ],
  "stop_conditions": ["..."]
}
```

harness 负责：

- 生成规范 task ids：`T1`, `T2`, `T3`。
- 校验 task title 非空。
- 校验 `completion_criteria` 非空。
- 校验 DAG 引用存在。
- 按 implementation task 统一生成 `evidence_required`。
- 生成 markdown plan。
- 写 `docs/plans/<task_id>.md`。
- 从参数中抽取 `plan_contract` 并更新 `tasks/<task_id>.json`。
- 追加 `plan_written` event。
- 状态改为 `waiting_for_todo`。

agent 不能控制：

- `task_id`
- `status`
- `git_base`
- `session_id`
- `evidence`
- `modified_files`
- `validation_results`
- `review_result`
- `validated`

`write_plan` 不把完整语义计划重复存入 task state。长篇语义内容只写入 markdown；task state 只保留 `plan_contract` 和 harness/runtime 字段。agent 运行的命令只会作为普通 tool evidence 被记录，不能通过 plan contract 声明为验证要求，也不能单独证明完成。

`plan_path` 是 harness-owned 文件。写入后普通 edit/write/bash 不允许修改该文件；如果后续需要变更计划，只能通过 harness-owned plan update 工具刷新 markdown、更新 `plan_sha256` 并记录 event。这样 final check 中的 `plan_sha256` 才有防篡改意义。

## todowrite Gate

`tool.execute.before(todowrite)`：

- 如果 session 是 plan-runner 且 status 不是 `waiting_for_todo`、`ready_to_execute`、`executing`，则 block。
- 如果 status 是 `waiting_for_todo`，要求 todo content 包含 `T1` / `T2` / `T3` 前缀。
- 如果 todo id 集合不等于 `plan_contract.tasks`，则 block。

todo 格式：

```text
T1: 增加 write_plan 工具
T2: 增加 phase gate
T3: 跑插件测试
```

`event(todo.updated)`：

- 记录 todos。
- `pending` / `in_progress` / `completed` 映射到 harness state。
- `completed` 只等于 `claimed_done`。
- 如果 todos 与 `plan_contract.tasks` 对齐，status 从 `waiting_for_todo` 进入 `ready_to_execute`。

## Phase Gate

`tool.execute.before` 根据 session 所属 task state 决定放行。

`planning_required` 允许：

```text
read
glob
grep
webfetch
question
write_plan
```

`waiting_for_todo` 允许：

```text
read
glob
grep
webfetch
question
todowrite
```

`ready_to_execute` 和 `executing` 允许：

```text
read
glob
grep
webfetch
question
edit
write
bash
task
todowrite
```

执行类工具在 `ready_to_execute` / `executing` / `repairing` 阶段还必须满足：当前 `todowrite` 中恰好有一个 `in_progress` task。harness 将该 task 作为当前执行上下文，把后续 edit/write/bash/task 事件绑定到这个 task；如果没有 `in_progress` 或存在多个 `in_progress`，则 block 执行类工具。

`self_checking` 允许执行类工具，用于 agent 在自检后补证据或重开 todo。`deterministic_check`、`audit_review`、`external_review` 默认禁止 plan-runner/child agent 的执行类工具。

harness-owned 操作不走 agent phase gate，包括：

```text
派发 audit subagent
调用 reviewDiff
读取 git diff / task state
向 plan_runner_session_id 调用 promptAsync
```

这些操作必须写 `harness_action` event，避免和 agent tool evidence 混淆。

`repairing` 允许执行类工具，但必须记录 review round。

## Child Subagent Gate

当 `plan-runner` 调用 `task`：

- 必须 `background: true`。
- 只能使用默认 child subagent。
- 禁止 custom agent。
- 禁止 plan-runner 递归调用 plan-runner。

放行条件：

```text
sessionID 属于 plan-runner root task
status in ready_to_execute/executing/repairing
args.background == true
args.agent 未设置或为默认 agent
args.subagent_type 未设置或为 general
```

child session 绑定：

```text
event(session.created)
info.parentID == plan_runner_session_id
写 sessions/<child_session_id>.json
```

child 默认没有 `task` 权限。harness 不依赖 prompt 防递归，只禁止 plan-runner 指定任何授予 `task: allow` 的 custom agent。

## Evidence 采集

通过 hook 和 event 采集事实。

`tool.execute.before` 记录：

```text
tool_called
sessionID
callID
args
active_task_id
```

`tool.execute.after` 记录：

```text
tool_finished
title
output excerpt
metadata
```

`event(message.part.updated)` 记录 tool part 状态：

```text
sessionID
callID
tool
state.status: pending/running/completed/error
state.input
state.output / state.error / state.metadata
```

用途：

```text
记录 before hook 抛错导致没有 tool.execute.after 的失败
记录 streaming tool output
作为 tool.execute.after 缺失时的 fallback
```

`event(file.edited)` 记录：

```text
file path
sessionID
active_task_id
```

`event(session.diff)` 记录：

```text
diff files
additions/deletions/status
active_task_id if known
```

真实 OpenCode 1.17.10 闭环中，`session.diff.diff` 可能为空；可用 diff 主要来自：

```text
event(message.updated).properties.info.summary.diffs
event(message.part.updated).properties.part.type == "patch"
event(message.part.updated).properties.part.files
```

因此 recorder 不能只依赖 `session.diff`。

`event(session.status)` / `event(session.idle)` 记录：

```text
sessionID
status: busy/idle
```

`event(session.created)` 记录 session 生命周期：

```text
sessionID
info.parentID
info.agent
info.directory
```

`shell.env` 可作为 bash cwd/session/callID 辅助证据，不作为主要完成信号。

注意事项：

- bash exit code 实测位于 `tool.execute.after.output.metadata.exit`。
- 被 `tool.execute.before` 阻断的工具不会进入正常 after；需要从 thrown error 和 `message.part.updated.state.status == "error"` 记录失败。
- `message.part.updated` 的 tool state 是 fallback，不替代 `tool.execute.before/after` 的主路径。

`evidence` 是 event log 的可读索引，不是新的判定规则。示例：

```json
[
  {
    "id": "ev-edit-1",
    "type": "diff",
    "task_ids": ["T1"],
    "event_ids": ["event-file-edited-1", "event-session-diff-1"],
    "files": ["userconf/plugins/plan-runner-gate.js"]
  },
  {
    "id": "ev-command-1",
    "type": "command",
    "task_ids": ["T1", "T2"],
    "event_ids": ["tool-after-1", "message-part-updated-1"],
    "command": "node --test userconf/plugins/test/*.mjs",
    "success": true
  }
]
```

最终完成判断只扫描现有 `evidence` 和 `reviews`：不新增独立的 `checks`、`task_evidence` 或 `harness_gates` 状态。

## Plan Runner Idle Validation

`event(session.idle)` 且 session 是 `plan_runner_session_id` 时触发。

第一步 self-check re-entry：

- 当 `self_check.status == not_started` 且当前状态像完成尝试时，harness 先向 `plan_runner_session_id` 投递 verification-before-completion self-check prompt。
- prompt 发送成功后：`status = self_checking`，`self_check.status = prompted`，`self_check.round += 1`。
- prompt 发送失败后：`status = interrupted`。
- agent 收到 self-check 后必须复核计划、todo、diff evidence 和验证命令；证据不足则重开 todo，补证据后再完成。

第二步 deterministic check：

当 `self_check.status == prompted` 且同一 plan-runner session 再次 idle 时，harness 将 `self_check.status` 标记为 `completed`，随后执行原 deterministic check：

- `plan_written == true`
- `plan_written` 是派生条件：`plan_path` 存在、`plan_sha256` 匹配、`plan_contract.tasks.length > 0`
- `todo.mirrored == true`
- 所有 `plan_contract.tasks` 都有对应 todo
- 没有 pending / in_progress todo
- completed todo 只作为 claimed_done
- `claimed_done` 从 `todo.last_seen` 中 status 为 completed 的条目派生
- 每个 claimed_done 有 evidence
- evidence 引用真实 tool event
- implementation task 有非测试代码 diff；只新增或修改测试不能单独证明完成
- modified files 能通过工具事件时间和 `in_progress` todo 映射到 plan task
- child sessions 都 idle 或已失败并记录
- 没有未解释的 tool failed
- 没有未映射到 plan task 的文件变更

失败处理：

```text
检查 plan_runner_session_id 是否仍存在且可接收 prompt
调用 client.session.promptAsync(plan_runner_session_id, repair prompt)
promptAsync 成功后：status = repairing，reviews.round += 1
promptAsync 失败后：status = interrupted 或 blocked
round > 2 则 status = blocked
```

实测 `session.idle` 后 `promptAsync` 能恢复同一 session 继续执行；因此“agent 已经 stop 进入 idle”不是问题。真正不可恢复的是 session 被删除、server 不可达、promptAsync 返回错误或 lease 过期。

成功处理：

```text
status = audit_review
进入审计 subagent 阶段
```

## Harness 派发审计 Subagent

审计 subagent 由 harness 派发，不由 plan-runner 派发。

输入：

- Execution Brief
- `plan_contract`
- plan markdown path
- todowrite snapshots
- event log summary
- git diff
- command evidence
- child session evidence
- deterministic check result

`command evidence` 只供审计参考，不是确定性完成条件。没有命令 evidence 不能单独导致 fail；有命令 evidence 也不能单独证明完成。

输出要求 JSON：

```json
{
  "round": 1,
  "kind": "audit",
  "result": "pass",
  "verified_tasks": ["T1", "T2"],
  "rejected_tasks": [],
  "unknown_tasks": [],
  "unmapped_files": [],
  "required_fixes": []
}
```

harness 规则：

- JSON 不可解析则 fail。
- `result != pass` 则 fail。
- `rejected_tasks` 非空则 fail。
- `unmapped_files` 非空则 fail。
- `unknown_tasks` 非空则 fail。

审计失败：

```text
调用 promptAsync(plan_runner_session_id, audit findings)
promptAsync 成功后 status = repairing，round += 1
promptAsync 失败则 status = interrupted 或 blocked
超过 2 轮则 blocked
```

审计通过：

```text
status = external_review
进入异源评审
```

## 异源评审

复用现有 push hook 背后的 external review 能力。

建议改造：

```text
external-review-gate.js
抽出 reviewDiff({worktree, base, head, files, context}) 函数
push hook 继续调用 reviewDiff
plan-runner validation harness 也调用 reviewDiff
```

异源评审输入：

- git diff
- plan path
- `plan_contract`
- audit result
- command evidence

`reviewDiff` 返回三态：

```text
pass
issues
unavailable
```

push hook 可以对 `unavailable` fail-open；plan-runner harness 不能把 `unavailable` 记为 pass，必须 retry 或 block。

异源评审失败：

```text
调用 promptAsync(plan_runner_session_id, external review findings)
promptAsync 成功后 status = repairing，round += 1
promptAsync 失败则 status = interrupted 或 blocked
超过 2 轮则 blocked
```

异源评审通过：

```text
写 reviews/<task_id>/external-round-N.json
运行 final completeness check
```

## Final Completeness Check

异源评审通过后，harness 从现有 task state 推导最终状态，不再读取 agent 自述，也不维护额外 gate 列表。

完成条件：

- `status == external_review`
- `plan_path` 存在，且 `plan_sha256` 与当前文件内容匹配
- `todo.mirrored == true`
- `todo.last_seen` 中没有 pending / in_progress
- 每个 `plan_contract.tasks[].id` 都有 claimed_done todo
- 每个 claimed task 都能在 `evidence` 中找到对应 diff evidence
- `modified_files` 中没有未映射到 task 的文件
- `child_sessions` 全部 idle 或已有失败记录且已进入 repair 轮次处理
- `reviews.audit` 最新一轮 result 为 pass
- `reviews.external` 最新一轮 result 为 pass
- `reviews.round <= 2`

通过后：

```text
status = validated
updated_at = now
```

失败后：

```text
调用 promptAsync(plan_runner_session_id, completeness check reasons)
promptAsync 成功后 status = repairing，round += 1
promptAsync 失败则 status = interrupted 或 blocked
超过 2 轮则 blocked
```

## Pre-push 兜底

pre-push 不能检查“是否存在任何未完成 task”。

pre-push 应检查：

```text
当前 worktree
当前 diff files
全局 task-state 中同 worktree 的 active/stale/interrupted tasks
对每个候选 task 用 task.git_base..HEAD + worktree diff 重新计算 files 交集
如果相关 task 未 validated，则 block
如果无相关 task，则走现有规则或提示人工确认
```

阻断条件：

```text
diff file 属于未 validated plan-runner task
```

不阻断条件：

```text
旧 stale task 与当前 diff files 无交集
其他 opencode 进程正在跑无关 task
```

## 非正常中断

不做启动清理。

每个 task state 有 lease：

```text
lease_expires_at
updated_at
```

每次相关 event 刷新 lease。

恢复策略：

```text
下次任意 hook/event 触发时，如果 task lease 过期，标 stale。
stale 不全局阻塞。
stale 只在当前 diff files 与该 task 实时重算 diff files 有交集时影响 gate。
modified_files 只是索引优化，不能作为 pre-push 唯一事实源。
```

现有 `plan-tracker` 会扫描 `docs/plans/**/*.md` 中的旧 TODO marker 并全局阻断。落地本方案时必须替换或兼容它：`planrun-*` 文档由 task-state 判断，且生成的计划文档不要包含旧扫描器识别的 TODO marker。

进程被杀：

```text
没有 cleanup 事件
依赖 lease 过期
不删除 state
不删除 workspace 文件
```

用户取消 subagent：

```text
如果观察到 session.status error、message.updated finish 异常、tool error 或 session idle with incomplete state，标 interrupted。
interrupted task 不全局阻塞，只在 diff 相关时阻塞。
```

JSON 写入：

```text
写 .tmp.<pid>.<uuid>
rename
读到坏 JSON 移到 corrupt/<state-kind>/
坏 JSON 不作为 active task
```

## 实施任务

当前已落地：T1、T2、T3、T4、T5、T6、T7、T8、T9、T10、T11（audit child session 最小切片）、T15、T16。
其中 T8 已记录 bash command evidence、`session.diff`、`message.updated.info.summary.diffs` 和 patch part diff evidence；T9 已要求完成项必须有 diff evidence，command-only evidence 不再满足 implementation 完成判断；T10 已在 deterministic check 前插入 verification-before-completion self-check re-entry。
T11 目前落地 deterministic check 通过后由 harness 创建 audit child session，并用只读 `plan-runner-audit` agent 投递 `audit_review_required` prompt；audit 结果消费和完整 external review runner 仍未落地。
state storage 已补充唯一 temp 文件名和坏 JSON 隔离，损坏 state 不再作为 active task 参与后续 gate。

仍未落地：T12、T13、T14、T11 audit 结果消费，以及 stale/pre-push 相关 task 兜底等完整恢复路径。

- Plan item T1: 调研并记录真实 hook payload 样本
- Plan item T2: 实现 task-state 存储层
- Plan item T3: 实现 session/task 索引
- Plan item T4: 实现 `write_plan` custom tool
- Plan item T5: 实现 plan markdown 生成
- Plan item T6: 实现 phase gate
- Plan item T7: 实现 todowrite 对齐 gate
- Plan item T8: 实现 evidence recorder
- Plan item T9: 实现 plan-runner idle deterministic check
- Plan item T10: 实现 repair prompt re-entry
- Plan item T11: 实现 harness 派发审计 subagent
- Plan item T12: 抽取 external review 共享函数
- Plan item T13: 接入 external review 到 validation harness
- Plan item T14: 改造 pre-push 兜底为 diff 相关 task 检查
- Plan item T15: 更新 plan-runner prompt，要求使用 write_plan
- Plan item T16: 更新知识文档和测试

## DAG

```text
T1 -> T2
T1 -> T3
T2 -> T4
T3 -> T4
T4 -> T5
T4 -> T6
T4 -> T7
T6 -> T8
T7 -> T8
T8 -> T9
T9 -> T10
T9 -> T11
T11 -> T13
T12 -> T13
T13 -> T14
T4 -> T15
T14 -> T16
T15 -> T16
```

可并发集合：

```text
[T2, T3]
[T5, T6, T7]
[T10, T11, T12]
[T14, T15]
```

## 测试计划

- Test item: task_id 生成，确保 parent_session_id + callID 唯一
- Test item: state 原子写入和坏 JSON 隔离
- Test item: session index 写入和反查
- Test item: `write_plan` 自动生成 task ids、plan_path、markdown
- Test item: `write_plan` 拒绝空 criteria、非法 DAG
- Test item: planning_required 阶段禁止 edit/write/bash/task
- Test item: waiting_for_todo 阶段 todowrite 必须覆盖所有 task ids
- Test item: plan-runner child task 只允许 default/general 且 background true
- Test item: completed todo 只映射 claimed_done
- Test item: session.idle 首次完成尝试先投递 self-check prompt
- Test item: self-check 后 deterministic check 缺 evidence 时失败
- Test item: self-check 后 deterministic check 成功进入 audit_review
- Test item: audit JSON 不可解析时失败
- Test item: external review fail 后 re-entry repair
- Test item: 两轮失败后 blocked
- Test item: stale task 与当前 diff 无交集时不阻塞
- Test item: pre-push 只阻塞相关 diff task

验证命令：

```bash
node --test "userconf/plugins/test"/*.mjs "scripts/test/opencode-subagent-event-probe.test.mjs"
node --check "userconf/plugins/plan-runner-harness.js"
node --check "scripts/opencode-subagent-event-probe.mjs"
bash -n "init_opencode.sh"
git diff --check
```

如果引入 Python state checker：

```bash
python3 -m pytest shared/hooks/test_plan_runner_state.py
```

## 需要实测确认的问题

- 审计 subagent 最佳派发方式：harness 直接 `task` tool、`session.promptAsync` 注入 subtask part，还是创建独立 session。
- `message.part.updated` 在 tool before 抛错、provider 异常、用户 abort 三种失败路径下的字段是否完全一致。
- TUI 模式与 `opencode serve + run --attach` 的 hook/event 行为是否完全一致。

## 最终交付标准

完成后，一个 plan-runner task 的可信交付状态只能来自：

```text
tasks/<task_id>.json status == validated
audit review pass
external review pass
final completeness check pass
pre-push diff 相关 task check pass
```

不可信来源：

```text
plan-runner final message
child subagent summary
审计 subagent 自述但 JSON 不可解析
外部 review 没有绑定当前 diff
```

这套方案的核心结果是：

```text
plan-runner 负责执行
harness 负责状态机和 gate
审计 subagent 负责语义审查
external review 负责异源兜底
主 agent 只消费 validated/blocked 结果
```
