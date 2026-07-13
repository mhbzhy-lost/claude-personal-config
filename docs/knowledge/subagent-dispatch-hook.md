---
title: 四端 subagent 派发提示
kind: convention
status: active
applies_to:
  - shared/policies/subagent-dispatch-hint.json
  - shared/hooks/subagent-dispatch-hint.sh
  - opencode/plugins/subagent-hint.js
  - init_claude.sh
  - init_codex.sh
  - init_qwen.sh
  - init_opencode.sh
  - userconf/agents/plan-runner.md
  - userconf/plugins/plan-runner-harness.js
  - scripts/opencode-subagent-event-probe.mjs
last_verified: 2026-07-09
source: opencode plan-runner agent
---

# 四端 subagent 派发提示以 shared policy 为单一来源

Claude、Qwen、Codex 的 `SubagentStart` hook 与 OpenCode 的 `subagent-hint.js`
插件必须输出基于同一份 shared policy 的提示内容。提示正文只维护在
`shared/policies/subagent-dispatch-hint.json`。

## 适用场景

修改 subagent 派发规则、SubagentStart hook、OpenCode workflow 插件、四端 init
脚本或全局 `claude/CLAUDE.md` 的 `## 并发` / `## Subagent` 规则时，必须检查本文。

## 项目事实 / 约定

`shared/policies/subagent-dispatch-hint.json` 是四端共享提示正文的单一来源。

OpenCode 的全局文件型 agent 由 `userconf/agents/*.md` 维护，并通过
`init_opencode.sh` 逐文件软链到 `~/.config/opencode/agents/`。opencode 当前
schema 没有 `agents.paths` 配置，不能在 `opencode.json` 中增加自定义 agents
目录字段。

`userconf/agents.json` 是全局 inline agent 配置来源，由 `init_opencode.sh` 合并到
`opencode.json.agent`。同步器保留 primary agent 的 live model 选择，但会刷新 SSOT 显式声明的
`prompt`、`permission` 和 `variant`，避免工具权限或推理档位漂移。默认 `GPT` 使用 GPT 5.6
Sol 的标准模式与服务端默认 effort；`GPT-Pro` 使用 GPT 5.6 Sol Pro，并通过顶层
`variant: xhigh` 选择 OpenCode 模型档位，承担质量优先的复杂任务；显式选择
`gpt-5.6-sol-pro`，避免无后缀 `gpt-5.6-pro` 在 ChatGPT Codex 账户下映射到不受支持的
`gpt-5.6`。`executor` agent
使用 GPT 5.6 Terra，定位为确定性执行器：`temperature = 0` 控制低随机性，
`effort/reasoningEffort = none` 避免执行器过度推理；需要深度方案推理时应交给主 agent、
`GPT-Pro` 或 plan-runner，而不是提高 executor 的 thinking budget。

**Claude/Qwen/Codex 端**：`shared/hooks/subagent-dispatch-hint.sh` 把 policy
正文包装成 `hookSpecificOutput.additionalContext`，供 SubagentStart hook 使用。

**OpenCode 端**：`opencode/plugins/subagent-hint.js`
在 `task` 工具执行前只检查 `background: true`，确保 subagent 使用后台模式。

`plan-runner` 是 OpenCode 的执行容器 agent：仅在用户明确表达“写计划并
执行 / 进入执行阶段”后使用。主 agent 负责方案讨论和 Execution Brief；该 subagent
负责调用 `write_plan({ tasks })` 定义结构化机器执行契约，通过 `start_task` / `complete_task`
推进任务状态，执行、收集 harness 观测到的 evidence，并在方案需要变化时返回
Change Request。

多步计划入口不直接加载 `writing-plans` skill。`plan-runner` 的 description 负责启发式
触发；计划文档只吸收 writing-plans 的核心写法（低上下文可执行、exact files、small slices、
RED/GREEN、exact commands、risks），不使用固定六段模板、checkbox tracking 或执行模式
选择。`write_plan.tasks` 契约、并发 worktree 约束和验证方式都维护在
`userconf/agents/plan-runner.md`。

`plan-runner` 作为 root 执行容器可以使用 `task` 工具编排 DAG child subagents。child
agent 类型、工作区隔离和路径门禁由 harness-managed child dispatch 接管；root agent
只决定何时调用 `task(background=true, ...)`。child 只能返回执行结果摘要，不能继续递归
派发 subagent，也不能更新 root task 的完成状态。

无并发时，root plan-runner 可以直接在主工作区执行。只要存在并发 child，禁止多个执行者
共享主工作区：harness 必须为每个并发 child 准备独立 `git worktree`，child 只改自己的
worktree；child 返回后由 root 合并回主工作区，处理冲突/失败、清理 worktree，并在主工作区
运行必要验证和最终提交。

OpenCode `task` 工具当前参数只有 `description/prompt/subagent_type/task_id/command/background`，
没有 `directory` / `workdir` 字段；`TaskTool` 创建 child session 时也没有从参数传入独立
location。因此 harness 在 `tool.execute.before(task)` 中为 plan-runner child dispatch 创建
worktree，改写 child prompt，记录 `{ session_id, worktree, branch, base_commit }`，并对 child
session 的 bash / file 工具做路径门禁。

`start_plan_runner` 是 plan-runner root session 的唯一启动入口。它每次都创建新的
harness-owned run worktree 和新的 task-state；非 `validated` 的旧 task-state 只作为历史诊断/
审计材料。重新派发时不要传 `task_id` / `existing_worktree`，也不要改写旧 state；如果需要延续
上下文，把旧 task id、旧 worktree、旧发现和用户决策写入新的 `prompt`。

主 agent 调用该入口前必须通过 `plan-runner-dispatch` 自检：当前执行请求已有
`writing-plans` 生成的完整计划文档，并且用户已选择 Plan-Runner 执行方式。零散讨论或
已达成方向不满足该门禁；缺少计划时不得调用 `start_plan_runner`。

`userconf/plugins/plan-runner-harness.js` 是 plan-runner 的 harness 入口。当前落地
切片包含：
- 原生 `task` 派发 `subagent_type/agent = plan-runner` 会被拒绝，并提示改用
  `start_plan_runner`；该路径不再创建 plan-runner task-state。
- `start_plan_runner` 生成 `planrun-<parent>-start-<uuid>` task state，创建
  `origin_worktree/.plan-runner-worktrees/<task_id>` run worktree，写入 dispatch brief，
  记录 parent / plan-runner session index，并把 Harness Task ID、assigned worktree、branch、
  base commit 注入 plan-runner prompt。
- `start_plan_runner` 同步等待 plan-runner 的 `session.prompt()` 完成，并将 assistant final text 直接作为
  tool output 返回父 agent。若 final text 返回时 run 尚未进入 `validated` / `blocked` / `interrupted`，
  harness 将该 run 标记为现有 `blocked` 终态，保留 task/worktree/evidence，并记录
  `plan_runner_stopped_before_finish_plan` blocker/event；该路径不启动 completion gate 或任何 review，
  也不向 parent 额外 `promptAsync` 通知。phase gate 拒绝 `blocked` 等终态的后续工具调用；继续执行必须
  新建 run，而非恢复或改写旧 state。
- `tool.execute.before(task)` / `tool.execute.after(task)` 仍用于 plan-runner root session
  派发普通 child subagent：harness 创建 child worktree、改写 prompt，并通过
  `output.metadata.sessionId` 绑定 child session。
- `write_plan` custom tool 的公开协议是 `tasks: Task[]`。它负责写 reviewer-facing execution
  brief、保存 sha、把 `state.tasks` 初始化为 `pending`，并推进到 `ready_to_execute`。
  `tasks` 是唯一机器执行契约；不再从 OpenCode `todowrite` 派生任务账本。
- execution brief 是紧凑自然语言执行计划，不是固定章节表单；它必须覆盖目标、方案、exact
  files、任务切片、测试/验证命令和风险/停止条件，但不使用 checkbox 或执行模式选择。
- `start_task({ id })` 是进入任务执行和切换到下一个 pending structured task 的唯一
  cursor API；它必须在首个任务前调用，也必须在每个 `complete_task({ id })` 清空
  active cursor 后再次调用。执行类工具在 `ready_to_execute` / 普通执行 / repair 阶段必须有
  active task；唯一例外是全部 structured tasks 完成后的 completion boundary，plan-runner
  可执行只包含 `git ...` shell segment 的 `bash` 命令来创建/修正本地 commit 边界。
  `complete_task({ id })` 是任务完成状态入口，完成前仍由 harness 通过工具事件、Git diff
  和命令 exit 判断 evidence。
- `finish_plan` custom tool 是 plan-runner 的 terminal gate 入口。plan-runner 完成 tasks
  和验证命令后必须先调用该工具；工具等待 deterministic / audit / external review。返回
  `repair_required` 时 findings 只回到 plan-runner session，返回 `validated` 后 agent 才能写最终报告。
- `session.idle` 只允许做 bounded watchdog nudge：当原始计划任务已完成、没有 running
  child session、没有 active / terminal `finish_plan` gate 时，harness 向同一个 plan-runner
  session 追加一次提示，要求立即调用 `finish_plan` 且不要写最终报告。watchdog 不能自动跑
  `finish_plan`、audit 或 external review，state 用 `watchdog_nudge.count/last_sent_at` 防 spam。
- agent 不能通过 `write_plan.tasks[]` 主动提交 evidence 契约；harness 只用实际工具事件
  裁定 diff evidence。completed task 仍需要 harness-observed diff evidence。
- OpenCode `todowrite` 不再是 plan-runner 执行账本来源；agent permission 直接 deny，harness
  仍在 phase gate 中兜底拒绝 plan-runner session 的 `todowrite` 调用。
- phase gate 在 `planning_required` / `ready_to_execute` / execution / terminal gate 阶段限制工具；`skill`
  作为只读上下文工具可用于普通执行阶段，`apply_patch` 作为执行类变更工具在普通执行阶段需要 active task；review 返回 `repair_required` 后的 `repairing` 阶段允许直接使用 `edit` / `write` / `apply_patch` / `bash`，由 harness 推导 evidence 绑定目标。
  所有任务完成后的 `git status/add/commit/diff/worktree/...` 等 git-only `bash` 可用于
  `finish_plan` preflight 修复；child dispatch 仍不得绕过 active task。
- `tool.execute.after(start_task)`、`tool.execute.after(complete_task)`、`tool.execute.after(bash)`、
  `tool.execute.after(write|edit).input.filePath`、`tool.execute.after(apply_patch).input.patchText`、`message.updated.info.summary.diffs`、
  `message.part.updated` patch、`session.diff` 写入
  evidence 索引；harness 自己生成的 stateDir `plans/<task_id>.md` 不计入实现 diff evidence。
- 普通 harness-managed executor child 的 `session.idle` 会把对应 `child_sessions[]` 从
  `running` 标记为 `completed` 并写入 `child_session_completed` event；audit child 继续由
  audit 专用 idle handler 消费 JSON 结果并推进后续 gate。
- harness 会在 `task` 工具 description 中补充说明：plan-runner 派发 child subagent 时会
  自动为该 child 创建独立 git worktree，并把 assigned worktree / branch 注入 child prompt。
- `finish_plan` 的 deterministic commit boundary 会先做同步 preflight：检查 root repo clean、
  base..HEAD 有 diff，也检查所有 harness-managed child worktree 已合并并清理。root dirty、无
  commit range 或残留 child worktree 会返回 `preflight_blocked`，但不把 state 切到
  `repairing`，plan-runner 应在同一 session 用 git-only `bash` 修正后再次调用 `finish_plan`。
- harness 不自动把 run worktree 合回 origin workspace，也不自动删除 run worktree。`finish_plan`
  进入 `validated` 后，harness 会用 `client.session.promptAsync` 向 parent session 投递
  merge-back 通知，包含 task id、origin worktree、run worktree、branch、base commit、head commit 和
  `git merge --ff-only <branch>` / `git worktree remove <run_worktree>` 步骤；通知失败只记录
  `parent_merge_back_notify_failed`，不回退 `validated`。主 agent 若要合回，必须先在 origin
  workspace 检查 `git status --short`；clean 时再执行通知里的 fast-forward merge 和 cleanup。
  dirty 时停止并询问用户。
- 2026-07-09 真实两阶段 `opencode serve` smoke 验证：root plan-runner 可并发派发两个
  executor child；harness 为两个 child 分别创建 worktree / branch；两个
  `child_worktree_created` 都早于第一个 `child_session_completed`；root 合并 child 输出并清理
  child worktree / branch；parent/main session 收到 merge-back 通知后能 fast-forward 合回
  dedicated run worktree、删除 root run worktree，并保持 origin repo clean。smoke 判定读取
  `gate_failures` 时必须把缺失字段视为空数组。
- 2026-07-09 进一步用 `writing-plans` 产出的明确 DAG contract smoke 验证同一契约：
  parent 调用 `start_plan_runner` 后 harness 绑定 dedicated run worktree；DAG 并发时两个
  executor child 均有独立 worktree/session；child 提交 `test(smoke): 增加 alpha 文档` 与
  `test(smoke): 增加 beta 文档` 后，root 将 child branch merge 回 run worktree 并删除 child
  worktree；`validated` 后 parent 将 run branch 合回 main workspace、删除 run worktree 和
  branch，origin `git status --short` 为空。证据目录：
  `/var/folders/27/6bnn8n7d4px6s33fvdpns89c0000gn/T/opencode/plan-runner-dag-contract-smoke-K62R7J`。
- `finish_plan` 首次完成尝试时由 harness 直接写 `self_check_completed`，随后做 deterministic check，不再回投 self-check prompt 给原 agent。
  deterministic check 通过后不能只停在 `audit_review`，必须由 harness 直接创建 audit
  child session，并用 `agent: plan-runner-audit` 后台投递 `audit_review_required` prompt。
- 单测模拟 audit child 回流时，不能只等待 `state.status == "audit_review"` 就发送
  `ses_audit` 事件。实现会先写 `audit_review` 状态，再创建 audit session/index 并写
  `audit_review_dispatched` event；测试 helper 必须等到该 event 后再回灌
  `message.updated` / `message.part.updated` / `session.idle`，否则事件会因 session index
  尚未存在而被丢弃，`finish_plan` 会一直等到超时。
- task/session state 写入使用 `.tmp.<pid>.<uuid>` 后 rename；读到损坏 JSON 时移到
  `task-state/corrupt/<state-kind>/`，并把该 state 当作 inactive fail-open。
- harness runtime I/O 使用 `node:fs/promises`；OpenCode server hook 不应在高频
  event/tool path 上使用同步 fs helper 阻塞事件循环。
- corrupt state 隔离失败也必须 fail-open 为 inactive state；隔离目录冲突、权限变化
  或磁盘异常不能让 hook 崩溃。

### OpenCode server hook 实测（2026-06-25）

探针：`scripts/opencode-subagent-event-probe.mjs`。必须走 `opencode serve` +
`opencode run --attach`；直接 `opencode run` 只触发 config 初始化，不足以验证
tool/event hook 行为。

实测结论：
- `tool.execute.before` 输入包含 `tool`、`sessionID`、`callID`，`output.args` 是工具参数。
- `tool.execute.after(task)` 的 `output.metadata.sessionId` 是 child session id，
  `output.metadata.parentSessionId` 是父 session id。
- `session.created` 的 `properties.info.parentID` 和 `agent` 可作为 child 绑定 fallback。
- `tool.execute.after(bash).output.metadata.exit` 是 bash exit code。
- before hook 抛错能阻断工具执行；对应 JSON stream 中 tool part 状态为 `error`。
- `session.idle` 后调用 `client.session.promptAsync` 能把 validation 结果投递回同一
  session，并触发 agent 继续执行。
- `promptAsync` 只能投递给目标 session；不能按所有 idle session 广播。
- 新建的一次性 audit child session 不使用 `promptAsync` 启动；应在 `session.create`
  后调用同步 `client.session.prompt`，否则可能创建出无 message / part 的空 audit session。
  legacy `/session/{id}/message` 路径本身不写 `session_input`；`session_input` 只属于 durable V2 prompt 路径。
- 若同步 `client.session.prompt` 返回 `Unexpected server error`，先用
  `scripts/opencode-subagent-event-probe.mjs --mode audit-child` 验证 agent resolution。
  实测 `probe-audit` 可成功，而缺失的 `plan-runner-audit` 会表现为 child session 已创建、
  DB 无 message/part，server log 的 `session.error` 为 `Agent not found`。
- `scripts/opencode-subagent-event-probe.mjs --mode audit-child --audit-agent plan-runner-audit`
  在 OpenCode `1.17.11` 上验证：同步 `session.prompt` 成功后，同一个 server/plugin
  instance 能继续收到 audit child 的 `message.updated` 与 `session.idle` 回流；summary
  中 `backflow.message_updated == true` 且 `backflow.idle == true` 可作为该机制的轻量证明。
  legacy prompt 成功时 DB 仍预期 `session_input == 0`。
- audit-child probe 读取 OpenCode DB 时应优先使用 `XDG_DATA_HOME/opencode/opencode.db`，未设置
  `XDG_DATA_HOME` 时才回退到 `HOME/.local/share/opencode/opencode.db`，否则会在自定义数据目录下误报
  message / part 计数为 0。
- audit child 的完成事件回流不等于最终文本在 `message.updated.info` 中可读。2026-06-30
  live smoke 证明 audit JSON 最终答案写在 `message.part.updated` 的 text part；harness
  必须消费 audit session 的 text part，并且空的 `message.updated` 不能覆盖已收到的
  `pending_audit_text`。

真实闭环补充（2026-06-25）：
- `write_plan` custom tool 的执行 context 中 `worktree/directory` 可能是 `/`，不能用它
  覆盖 dispatch 阶段保存的 `state.worktree`。
- 真实 git workspace 中 `session.diff.diff` 可能一直为空；可用 diff 可能出现在
  `message.updated.info.summary.diffs`、`message.part.updated` 的 `part.type == "patch"`
  和 `part.files`。OpenCode `write` / `edit` tool part 的 `input.filePath` 是更直接的
  实现文件来源，必须记录为当前 active task 的 diff evidence。
- `message.updated.info.summary.diffs` 可能反复输出同一个用户消息中的计划文档 diff。
  stateDir `plans/<task_id>.md` 是 harness 计划产物，必须过滤，不能作为实现 evidence；
  `write_plan.content` 不再写入目标 workspace 的 `docs/plans/`。
- 历史临时 git workspace 旧 self-check re-entry 链路：`task(plan-runner)` -> `write_plan` ->
  `todowrite(T1 in_progress)` -> `write` -> `message.updated.summary.diffs` ->
  `bash` validation -> `todowrite(T1 completed)` -> `session.idle` -> self-check
  re-entry -> 补充验证命令 evidence。第二次 idle 后进入 `audit_review`，创建 audit
  child session 并投递 `audit_review_required` prompt；该链路已被 `finish_plan` terminal gate 取代，不再保留旧 state 兼容。
- 真实 `opencode serve` wrapper 探针（2026-06-26，OpenCode `1.17.11`）验证：server
  能识别 `plan-runner-audit`。当前链路由 `finish_plan` 写入 `self_check_completed`、
  `deterministic_check_passed`、`audit_review_dispatched`，并创建 `parentID == plan_runner_session_id`
  的 audit child session。
- 新 task state 必须按当前 schema 写入；磁盘残留的旧不兼容 state 直接清理，不由
  harness 自动迁移推进。
- audit 派发失败时，`audit_dispatch_failed` event 应保留已创建但未完成派发的
  `orphan_session_id`，并记录 stack / response data / stderr 等 SDK 诊断上下文；第一次失败
  返回 `repair_required`，第二次仍失败则 audit fail-open 进入 external review。
- hey-api/OpenCode SDK 失败不一定 throw；`session.create`、`session.prompt`、`session.promptAsync`
  可能返回 `{ error: ... }`。harness 在记录 `audit_review_dispatched` 前必须检查返回对象，
  否则会留下 audit session 已创建但无 message / part 的 running child。
- audit child session idle 后，harness 消费最新 audit message 文本并要求 JSON 结构；当前只消费
  `result` 与 `required_fixes`。合法 JSON 中 `result != pass` 或 `required_fixes` 非空时，
  `finish_plan` 返回 `repair_required` 给 plan-runner 当前 tool 调用。review findings 不再通过
  `promptAsync` 回投，也不暴露给主会话处理。
- audit JSON 语法或 schema 错误不应消耗 plan-runner repair 预算。harness 会先向同一个
  audit child 追加一次 regeneration prompt；若累计 2 次仍无合法 JSON，则 audit fail-open
  视为通过，并在 `reviews.audit[0].invalid_json_reason` / `invalid_json_attempts` 记录失败原因，
  继续进入 external review。
- audit pass 或 audit fail-open 后进入 external review：默认命令 runner 调用
  `reviewer.py <base_commit> HEAD --worktree <worktree> --spec <plan_path>`（缺省 fallback 到
  `brief_path`），将输出归一为
  `pass` / `issues` / `unavailable` 写入 `reviews.external`。external 第一次失败返回
  `repair_required`；第二次仍失败则 external fail-open，错误保留在 `gate_failures`，继续 final
  completeness check。
- external review 范围只允许由 Git commit range 定义。`modified_files` / `evidence`
  继续用于 deterministic check 和 audit 上下文，但不能定义 external review 范围。
- `finish_plan` deterministic check 会在 Git repo 中要求当前 repo clean、`HEAD` 不等于
  dispatch 时记录的 base commit，且 `base_commit..HEAD` 有 diff。plan-runner 必须在
  `finish_plan` 前创建本地 commit；允许 repair 后追加 commit 或 amend，但禁止 push。
- `lease_expires_at` 仅保留为单次 plan-runner 账本的诊断时间戳；harness event hook
  不再做 runtime stale 扫描，也不会在 `session.idle` / `todo.updated` 中把旧 task-state
  自动改写为 `stale`。旧 task-state 可作为磁盘日志残留，是否 reset / 清理由下一次主
  agent 在用户授权后通过 git 工作区处理；harness 不提供 stale 重入恢复或补偿流程。
- `session.idle` 只消费当前 session 可推进的 audit / watchdog 状态，不遍历
  `task-state/tasks/`。audit child 已有 `pending_audit_text` 时，idle 事件应写
  `audit_review_passed` 并继续 terminal gate；无关的过期旧 state 不参与本次 gate。
- harness 的 `event` hook 在 plugin instance 内用 Promise 链串行化。原因是各 handler
  都会 read-modify-write 同一 task state；并发 `message.updated` / `session.diff` 否则会
  丢 evidence 或 modified_files。
- phase gate、task 状态更新和 evidence 记录只消费 role 为 `plan-runner` 的 session。parent
  session 只用于路由，不应被 active plan-runner task 阻断，也不应污染 task evidence。
- 普通执行阶段允许 `apply_patch`，但它和 `edit` / `write` / `bash` / `task` 一样要求恰好一个
  active task；`skill` 不绑定执行上下文，不要求 active task。
- terminal gate 状态（`audit_review` / `external_review`）禁止 plan-runner 工具调用。`repairing`
  允许小修工具，但继续禁止 `todowrite`，避免在门禁失败后重写原始计划账本；证据归属仍由
  harness 从缺失 diff evidence 或最新 audit 结果推导。
- repair 后不能依赖 `session.idle` 或 completed assistant `message.updated` 自动推进。plan-runner
  必须再次调用 `finish_plan`；这是唯一 terminal gate boundary。idle watchdog 只能提醒同一
  session 调用 `finish_plan`，不能替 agent 进入 terminal gate。
- deterministic / final completeness 不消费 agent 提交的 evidence 契约；completed task
  需要 harness-observed diff evidence。command log 只作为实际命令日志，不作为完成条件。
- terminal gate 每个节点失败上限为 2：`deterministic_check`、`audit_review`、
  `external_review`、`completeness_check` 第一次失败进入 `repairing`，第二次仍失败则
  fail-open 到下一节点；final completeness 第二次失败时写 `validated` 结束。所有失败都追加到
  top-level `gate_failures[]`，`finish_plan` 输出会列出 `Gate Failures` 供主 agent 消费。
- `plan-runner-audit` 只触发一次。audit fail 会回流一次 repair；repair 后 deterministic
  通过时直接进入 external review，不再次派发 audit，避免 LLM 审计循环不收敛。
- plan-runner 的最终报告、`finish_plan` 调用、等待 `validated` 等终态门禁动作不应建模为
  plan task。`write_plan.tasks` 现在是唯一机器执行契约，harness 不再维护 terminal-gate
  task 过滤或 todowrite 兼容分支；agent 若把门禁动作写进 `tasks`，会被当作普通任务审查，
  必须 completed 且有 evidence。
- external reviewer 的 `--review-round` 只由 `reviews.external.length + 1` 推导，最多为 2；
  `reviews.round` 仅是 harness repair loop 计数，不复用为 external review 轮次。
- `reviews.round` 只保留 repair 次数观测，不再作为全局 blocked 预算；预算按 gate source
  分别由 `gate_failures[].source` 计数。
- `validated` / `blocked` / `interrupted` 是 `finish_plan` terminal gate 的缓存终态。
  `stale` 不再是 completion gate result，也不再是 `finish_plan` terminal status；
  `finish_plan` 等待超时时只写 `interrupted`。再次调用 `finish_plan` 只能回放既有结果，
  不能把 gate 改回 running 或重跑 audit/external review；terminal phase 下只有 `finish_plan`
  可用于此幂等读取，其他工具仍拒绝。该读取不恢复、续跑或改写旧 run；`blocked` /
  `interrupted` 且没有 completion gate 时也不得启动 gate 或 review。`repairing` 不是终态，仍允许再次调用
  `finish_plan` 复核。
- `userconf/plugins/test/plan-runner-harness.test.mjs` 默认只保留快速核心覆盖。
  audit/external review/fail-open/完整 terminal-gate 等待链属于慢集成路径，必须用
  `slowIt` 归入 `OPENCODE_PLAN_RUNNER_SLOW_TESTS=1` opt-in 分组；新增类似用例时不要让默认
  suite 串行等待 audit child、external reviewer command 或多轮 fail-open。
- 损坏 task state JSON 的恢复路径由单测覆盖：`session.idle` 不抛异常，坏文件会进入
  `corrupt/tasks/<task_id>.json`。

提示内容：
- shared policy 精简为后台模式约束（编排决策由 `claude/CLAUDE.md` 管辖）
- `claude/CLAUDE.md` 的 `## 并发与 Subagent` 包含完整的并发阈值决策树

编排决策（在 AGENTS.md 中，不在 hook/plugin 中）：
- 并发 < 3 → 用 subagent（task 工具直接派发）
- 并发 ≥ 3 → 用 Dynamic Workflow（脚本编排 + git worktree 隔离）
- 串行多步也用 subagent，节省主对话上下文

### subagent 默认工具集（2026-06-16 确认）

opencode 的 subagent 默认拥有完整工具集（bash、webfetch、playwright 等），
与主对话一致。`task` 工具内部（`TaskTool.execute`）创建 subagent session 时：
- 继承父 session 的 `permission`（默认 `allow *`）
- 默认 deny `todowrite`（避免污染父 session 的 todo 状态）
- 默认 deny `task`（禁止递归派发，防止无限嵌套）
- 默认 deny 任何列入 `experimental.primary_tools` 的工具（未配置则不受影响）

早期误判"subagent 工具集被硬编码限制为只读子集"源于未读清 `TaskTool` 源码——
`Agent.tools: undefined` 只意味着"未在 agent 定义中显式声明"，运行时实际走
`Agent.permission` 的 `allow *` 路径。实测确认后台 general subagent 可执行
bash 命令。

旧 `claude/hooks/coding-expert-rules-inject.sh` 已退役。不要重新按
`coding-expert` / `coding-expert-light` / `coding-expert-heavy` 三个 matcher 注入
知识检索规则；SubagentStart 应注册为无 matcher 的通用 hook。

## 原因

四端 hook 能力不同，但 subagent 派发约束来自同一份全局规则。如果每端各自维护提示
正文，OpenCode 插件、Claude/Qwen settings、Codex hooks 很容易与
`claude/CLAUDE.md` 分叉。

早期尝试在 hook/plugin 中嵌入编排推荐（workflow vs subagent 决策树），但实测
agent 几乎总会在 hook 触发后走逃生舱继续直接派发 subagent。根因是 skill
description 和 hook 提示都是软建议，AGENTS.md 的"禁止"才是硬约束。2026-06-16
将编排决策树移入 `claude/CLAUDE.md`，hook/plugin 只保留后台模式强制检查。

## 修改时注意

- 改提示正文时只改 `shared/policies/subagent-dispatch-hint.json`，不要在各端脚本或
  plugin 中复制新正文。
- 改全局 `claude/CLAUDE.md` 的 `## 并发` / `## Subagent` 时，同步检查 shared
  policy 是否仍匹配；修改全局规则本身还必须同步维护 `claude/CLAUDE.reason.md`。
- 改 Claude/Qwen/Codex init 脚本时，确认 SubagentStart 仍指向
  `shared/hooks/subagent-dispatch-hint.sh`。
- 改 OpenCode workflow 插件时，确认它在
  `opencode/plugins/subagent-hint.js`，且
  `init_opencode.sh` 通过子模块 `install-opencode.sh` 安装。
- 改 OpenCode 全局 agent 时，优先新增或修改 `userconf/agents/*.md`，并确认
  `init_opencode.sh` 的 `sync_opencode_agents` 仍会逐文件软链到用户级 agents 目录。
- 不要在 `opencode.json` 里增加不存在的 agents 目录配置；schema 未支持的字段会导致
  OpenCode 配置校验失败。
- 不要把 `writing-plans` 重新加入默认计划入口；先用 `plan-runner` 的 description 做
  启发式触发，实际效果不好时再考虑 AGENTS.md 路由规则。
- `opencode/plugins/dag-dispatch-hint.js` 已删除。需要回退时从 git 历史恢复。
- 不要把 `knowledge-retrieval`、`skill-catalog`、`mcp__skill-catalog` 或 tag 闭集
  获取流程放回 SubagentStart hook。

## 验证方式

```bash
python3 -m unittest \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_opencode_dag_dispatch_hint_matches_global_concurrency_rules \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_subagent_dispatch_hint_policy_is_four_host_single_source \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_shared_subagent_dispatch_hook_outputs_policy_as_additional_context \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_skill_resolve_preflight_policy_is_single_source
```

```bash
bash -n shared/hooks/subagent-dispatch-hint.sh init_claude.sh init_codex.sh init_qwen.sh init_opencode.sh
node --test userconf/plugins/test/init-opencode-agents.test.mjs userconf/plugins/test/plan-runner-harness.test.mjs scripts/test/opencode-subagent-event-probe.test.mjs
OPENCODE_PLAN_RUNNER_SLOW_TESTS=1 node --test userconf/plugins/test/plan-runner-harness.test.mjs
git diff --check
```
