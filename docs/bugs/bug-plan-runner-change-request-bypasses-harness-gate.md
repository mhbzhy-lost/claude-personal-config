# Plan-Runner Change Request 未回流父会话

## 1. 现象

Plan-Runner 在执行中发现计划需要用户或主 agent 决策，按约定输出 `Change Request`
并正常进入 `session.idle`。Change Request 已完整保存在 Plan-Runner session 中，但父会话
没有收到 task result、用户消息或 harness 通知；task-state 仍停留在 `executing`，活动任务
仍为 `in_progress`。

2026-07-13 的真实复现发生在：

- 工作区：`/Users/leshi.zhy/mega-aone-service/plugins/crash_analyzer`
- task：`planrun-ses_0bb7dad71ffes4L3jZOxaD8OAe-start-23ddd942-8a23-432e-9ea8-e1769a3516a9`
- 父 session：`ses_0bb7dad71ffes4L3jZOxaD8OAe`
- Plan-Runner session：`ses_0a5a98c1bffeBKy4wD9BlFoGfO`
- Change Request message：`msg_f5a7c2724001T7KI9wF1lwn60g`

Plan-Runner 在 15:58:46 进入 idle。到 16:02:36 用户主动询问前，父 session 没有新增
任何 message 或 part。

## 2. 影响

- 主 agent 不知道 Plan-Runner 正在等待决策，无法及时询问用户或修订计划。
- task-state 与真实 session 状态分裂：实际已停止，账本仍显示正在执行。
- `finish_plan`、audit、external review 和 terminal gate 均不会运行。
- 用户只能通过主动查询触发事后 DB、日志和 task-state 排查。
- dedicated worktree 中的未提交成果和验证证据可能长期无人处理。

## 3. 复现路径

1. 父 agent 通过 `start_plan_runner` 在 dedicated worktree 中启动 Plan-Runner。
2. Plan-Runner 调用 `write_plan`、`start_task` 并执行结构化任务。
3. 活动任务尚未完成时发现原计划假设不成立，需要外部决策。
4. Plan-Runner 不调用 `complete_task` 或 `finish_plan`，以普通 assistant final 输出
   `Change Request`，随后 `finish=stop` 并触发 `session.idle`。
5. 父 session 没有收到 Change Request；task-state 保持 `executing` 和活动任务
   `in_progress`。

本次 Change Request 要求决定是否注入完整单测所需环境变量、是否豁免范围外既有 lint
错误，以及是否允许以主工作区 dirty 接口为基线处理重叠冲突。

## 4. 根因（6 要素）

1. **触发条件**：Plan-Runner 在活动任务尚未完成时，以普通 assistant final 返回
   `Change Request` 并进入 idle。
2. **期望链路**：同步 `start_plan_runner` 应消费 Plan-Runner 的最终 assistant message，
   把未经过 `finish_plan` 的提前结束记录为现有 `blocked` 终态，并将原始结果作为 tool
   output 返回父 agent。
3. **实际链路**：`startPlanRunnerTool()` 同步等待 `client.session.prompt()`，但丢弃其返回的
   assistant message，只向父工具调用返回固定的 `plan-runner started: <task_id>`。
4. **事件处理缺口**：`session.idle` handler 只处理 audit、普通 child 完成和“全部任务已
   完成但未调用 finish_plan”的 watchdog；活动任务仍为 `in_progress` 时没有 Change
   Request 检测或父会话通知分支。
5. **关键假设失效**：dedicated start 的设计把同步 `session.prompt()` 当成“确认 prompt 已
   投递”，但该调用实际返回完整 assistant message。原生 background `task` 曾提供的 final
   result 回流没有被自定义工具等价替代。
6. **直接证据**：OpenCode DB 保存了 child Change Request 和 `finish=stop`；server 日志记录
   `session.idle`；父 session 在 idle 后至用户主动查询前零新增；harness events 不含
   `change_request`、`waiting_for_input` 或 `parent_notified`。

## 5. 修复方向

- 不新增 `change_requested` 状态，也不新增 `request_plan_change` 工具。Change Request 是
  Plan-Runner 的一种最终结果，不需要再建一套可恢复状态机。
- 保持 `start_plan_runner` 当前同步等待语义，消费 `client.session.prompt()` 返回的 assistant
  text parts，不再用固定的 `plan-runner started` 覆盖真实结果。
- prompt 返回后重新读取 task-state：若 run 尚未通过 `finish_plan` 进入已有终态，则统一标记为
  `blocked`，记录 `blocker.code = plan_runner_stopped_before_finish_plan` 和原始 final text。
- 此处 `blocked` 只表示当前 run 生命周期结束，不进入 `finish_plan` 交付门禁；不执行
  self-check、deterministic check、audit、external review 或 completeness check，
  `completion_gate` 保持未启动。
- 把 Plan-Runner final text 直接作为 `start_plan_runner` tool output 返回。父 agent 本来就在等待
  该工具结束，因此无需再通过 `promptAsync` 注入一条重复通知。
- 追加一个提前停止事件供审计，并确保 phase gate 对现有 `blocked` 终态拒绝后续执行工具。
- 父 agent 收到通知后负责收集旧 run 的已有成果、分析 Change Request 并取得用户决定；
  不修改旧计划，也不重新启动旧 Plan-Runner。
- 继续执行必须新建 `start_plan_runner` run，在新 prompt 中引用旧 task、worktree、已有成果、
  Change Request 和用户决定；旧 state 与 worktree 只作历史现场，不覆盖、不恢复。

## 6. 验证计划

- RED：`session.prompt()` 返回 Change Request 时，`start_plan_runner` 原样返回 final text，
  不再返回固定启动文案。
- RED：未调用 `finish_plan` 的 run 在 prompt 结束后进入现有 `blocked` 终态，保留活动任务、
  worktree、已有成果和 final text。
- RED：Change Request 终止当前 run 时不启动 `completion_gate`，不产生 self-check、audit、
  external review 或 `task_validated` 事件。
- RED：`blocked` Plan-Runner 不能继续调用执行工具。
- RED：event stream 记录提前停止原因，但不新增 `change_requested` 或 `waiting_for_input` 状态。
- RED：父 agent 只能通过新的 `start_plan_runner` task id 接续，旧 run 不支持恢复或改计划。
- 回归：全部任务完成后的 watchdog、validated merge-back 通知和 audit idle 回流保持不变。
- 回归：`node --test "userconf/plugins/test/plan-runner-harness.test.mjs"`
- 全量：`node --test "userconf/plugins/test"/*.mjs "scripts/test/opencode-subagent-event-probe.test.mjs"`
- 空白：`git diff --check`

## 7. 修复记录

- 2026-07-13：`start_plan_runner` 同步消费 `client.session.prompt()` 返回的 assistant text parts；OpenCode
  SDK 的实际结果形状为 `{ data: { info, parts } }`，其中 text parts 位于 `data.parts`，同时兼容既有
  `info` text/parts 形状，并把真实 final text 直接作为工具输出回流父 agent。
- 2026-07-13：prompt 正常结束且携带 final text、但 run 未进入 `validated` / `blocked` / `interrupted`
  时，harness 重新读取 task-state 并写入现有 `blocked` 终态；保留 active task、worktree 和已有
  evidence，写入 `plan_runner_stopped_before_finish_plan` blocker 及同名审计事件。
- 2026-07-13：该提前停止路径不启动 completion gate，也不执行 self-check、deterministic、audit、external
  或 completeness 检查；phase gate 对 `blocked` 等已有生命周期终态拒绝后续工具调用。
- 2026-07-13：终态仅对 `finish_plan` 保留幂等读取通道，用于回放既有 `validated`、`blocked` 或
  `interrupted` 结果；这不代表恢复旧 run。`blocked` / `interrupted` 回放不创建 completion gate，
  不运行 review，且不改写活动任务、evidence 或 worktree；其他工具仍由 phase gate 拒绝。
- 未新增 `change_requested`、`waiting_for_input`、`request_plan_change`，也未额外使用 parent `promptAsync`
  通知；继续执行必须创建新的 run。
- 2026-07-13：targeted harness 测试与包含该文件的 full glob 不得并行执行，避免重复运行昂贵的
  git/worktree suite 并造成测试卡顿；本修复验证仅串行运行 targeted harness、harness 文件、agents 文件。
- 2026-07-13：重启 OpenCode 后完成真实 Change Request smoke。task
  `planrun-ses_0a6b9aaa2ffego3TZkaXaKElXA-start-90dbbf78-cc9a-4ee5-b570-ad1961931636`
  的 final text 直接回流父会话；state 为 `blocked`，`T1` 保持 `in_progress`，diff/command
  evidence 与临时成果保留，未创建 `completion_gate`，event stream 不含 self-check、audit、
  external review 或 `task_validated`。取证后已删除本次 smoke worktree 和分支。

## 证据路径

- `~/.config/opencode/task-state/tasks/planrun-ses_0bb7dad71ffes4L3jZOxaD8OAe-start-23ddd942-8a23-432e-9ea8-e1769a3516a9.json`
- `~/.config/opencode/task-state/events/planrun-ses_0bb7dad71ffes4L3jZOxaD8OAe-start-23ddd942-8a23-432e-9ea8-e1769a3516a9.jsonl`
- `~/.config/opencode/task-state/sessions/ses_0bb7dad71ffes4L3jZOxaD8OAe.json`
- `~/.config/opencode/task-state/sessions/ses_0a5a98c1bffeBKy4wD9BlFoGfO.json`
- `~/.local/share/opencode/opencode.db`
- `~/.local/share/opencode/log/opencode.log:5303742`
