# Plan-runner 重启烟测

## 目的

验证重启后的 OpenCode 已加载当前仓库的 plan-runner plugin、agent 与 skill 栈，能走通：`start_plan_runner` 以 `accepted` 立即返回、创建 dedicated run worktree、异步推进 `write_plan({ tasks })`、`start_task` / `complete_task`、验证、本地 commit 和 terminal gate，并通过 parent 通知回流 `validated`、`blocked` 或 `interrupted`。

## Live smoke 记录

- 2026-07-03：基于 `e6e677b fix(plan-runner): 删除 runtime stale 扫描` 执行最小文档型 live smoke，验证新 plan-runner runtime 不再写入 `task_stale`，并能在本地提交后由 `finish_plan` 进入 `validated`。
- 2026-07-09：两阶段 `opencode serve` smoke 验证 DAG executor 并发、child worktree 自动创建、child 合回/清理、parent/main session 合回 dedicated run worktree 并清理。临时证据目录：`/var/folders/27/6bnn8n7d4px6s33fvdpns89c0000gn/T/opencode/plan-runner-dag-executor-smoke2-jKj52y`。
- 2026-07-09：基于 `writing-plans` 产出的明确 DAG 计划执行 contract smoke，验证 parent 创建 plan-runner/run worktree、两个 executor child 各自创建 worktree、child commit 被 merge 回 run worktree 且 child worktree 清理、parent 将 run worktree 合回 main workspace 并清理 root worktree。临时证据目录：`/var/folders/27/6bnn8n7d4px6s33fvdpns89c0000gn/T/opencode/plan-runner-dag-contract-smoke-K62R7J`。
- 2026-07-15：本次新 run 的 session-bound child fresh smoke。child 分配路径、`pwd` 与 git root 均为 `/Users/leshi.zhy/.config/opencode/task-state/child-worktrees/planrun-ses_0a6b9aaa2ffego3TZkaXaKElXA-start-9fec0271-c7d0-45b1-9c18-6b2b4619eb7b/call_Xluu3wj46apxeLscBgu2XV0I`；child session 为 `ses_09c606213ffeCI6KwJK0R7YpK9`，branch 为 `planrunner-child/planrun-ses_0a6b9aaa2ffego3TZkaXaKElXA-start-9fec0271-c7d0-45b1-9c18-6b2b4619eb7b/call_Xluu3wj46apxeLscBgu2XV0I`，base HEAD 为 `1a4394b31c02f9e453f3b395d02d8a5204afbbbc`。child 仅修改本 runbook，`git diff --check` 成功并创建本地 commit `7cd8ef90fb0e50bf4ae3c749dfc0f29e45d770ff`；task-state 随后记录 `child_session_completed` terminal event，并在 root wake 后的工具边界将 `runtime_disposal.status` 写为 `disposed`（attempts `1`）。root fast-forward 合并该 commit 后已移除 child worktree 并删除 child branch；精确 focused test 共 `16` 项通过、`0` 项失败，`git diff --check` 通过。terminal gate 结果由本次 run 的最终 task-state 与报告记录。
- 本轮只执行自动化回归；重启后的 live smoke 待执行，不得把本轮描述为已运行 live smoke。

## 步骤

1. 重启 OpenCode，并优先在临时 clean git repo 或当前项目的 clean origin workspace 启动 smoke。`start_plan_runner` 会创建 dedicated run worktree；origin workspace 的 dirty 内容不会进入 run worktree，但后续 merge-back 前必须由主 agent 再检查 origin 是否 clean。
2. 重启后运行真实 `prompt-async` probe：

   ```bash
    node scripts/opencode-subagent-event-probe.mjs --mode prompt-async --port 41339
   ```

   保留实际命令参数与输出，确认 probe 使用真实 SDK 请求而非模拟结果。
3. 在主会话通过 `start_plan_runner` 派发一个小型 `plan-runner` 文档任务，禁止用原生 `task(subagent_type="plan-runner")`。任务要求：
    - 先调用 `write_plan({ tasks })`，tasks 写清 id、标题、文件范围、验证命令、停止条件；
    - 不再调用 `todowrite`，不再让 harness 从 todo 派生结构化状态；
    - 每个执行切片先调用 `start_task({ id })`，实现与验证完成后调用 `complete_task({ id })`；
    - 如需并发，才通过 `dispatch_child({ description, prompt })` 派发 child；该工具不接受 `background`，确认 create/prompt 的 session directory 都等于 child worktree；
    - child 只改自己的 worktree，root 合并回 run worktree 后再运行最终验证；
    - 不要把“审计 / external review / finish_plan / 汇报 smoke 结果”写成 plan task；
    - 所有 plan tasks completed 且验证命令完成后，先创建本地 commit，确认 repo clean，再调用 `finish_plan`，只有返回 `validated` 后再写最终报告；
    - 只改动约定的文档文件；
    - 至少运行文档相关检查和 `git diff --check`；
    - 创建本地 commit，但不推送。
4. 确认调用立即返回 `dispatch_status=accepted`，但不把它视为完成。parent 在此期间可执行不冲突工具调用；不得继续实施该计划，也不得主动或循环轮询。
5. 等待 parent 异步收到 `validated`、`blocked` 或 `interrupted` 通知。仅当预期通知缺失时调用一次 `get_plan_runner_status` 诊断，并记录观察到的状态。
6. 在 `validated` 通知后、origin workspace 手工执行 merge-back 前，先运行 `git status --short`；clean 时执行通知中的 `git merge --ff-only <branch>`，再执行 `git worktree remove <run_worktree>`。dirty 时停止并询问用户。
7. 覆盖同一 parent 的两个 run：分别收到独立 accepted 和 terminal 通知，状态查询只能由该 parent owner 执行。
8. 覆盖 child 场景：root 有 running child 时为 `waiting_for_children`；全部 settled 后确认 harness 有限次唤醒同一个 root。
9. 确认三种终态均可通知 parent，且每条 terminal 通知均在对应 root terminal barrier 写入后才发送。通知失败时，owner 仅可调用一次 `get_plan_runner_status` 诊断；不得由 root 尾部即时 dispose，当前回合结束后的 parent idle 提供安全 disposal 触发，不承诺 timer。

## 通过标准

- task-state 的 plan path 指向 stateDir `plans/<task_id>.md`，正文是紧凑的自然语言执行 brief，覆盖目标、方案、精确文件、小步可验证切片、验证命令、风险或停止条件，不要求固定模板章节或 checkbox 任务跟踪。
- `prompt-async` probe 使用真实 SDK 请求时，`status_code` 必须为 `204`、terminal 必须存在、`accepted_before_terminal == true`，且 CLI exit 为 `0`。
- `prompt-async` probe 的参数拼写错误、缺少 `204` 或缺少 terminal 时必须以非 `0` 退出。
- `start_plan_runner` 返回 `dispatch_status=accepted` 时不等待 root final，不将其报告为完成；terminal 结果仅以 parent 异步通知为准。
- parent 在 accepted 后可完成不冲突工具调用或结束当前回合，且没有主动/循环状态轮询。
- 同一 parent 的两个 run 保持独立 registry 记录、通知与 owner-only 状态查询。
- child running 时 task-state 为 `waiting_for_children`；全部 settled 后仅有限次唤醒原 root。
- `validated`、`blocked`、`interrupted` 都能异步通知；每条通知前都已写入对应 root terminal barrier。通知失败时 owner 仅做一次状态诊断，root 不在尾部即时 dispose，当前回合结束后的 parent idle 才提供安全 disposal 触发，不承诺 timer。
- task-state 中 `version == 2`，`tasks[]` 来自 `write_plan({ tasks })`，状态通过 `start_task` / `complete_task` 推进；不应出现 `todo` 或 `plan_contract` 作为新账本。
- 若任务使用 child session，至少一个 child session 记录独立 worktree、branch、base commit；OpenCode session create 与 prompt 的 `query.directory` 都等于该 worktree，相对 Bash/文件路径只落入该目录。
- 若任务使用并发 executor DAG，应看到至少两个 `child_worktree_created`、两个 `child_dispatch_accepted`、两个 `child_session_completed`，且第二个 `child_worktree_created` 早于第一个 `child_session_completed`，证明不是串行执行。
- child settled 后，root 下一次工具活动应写入 `runtime_disposal.status=disposed`；在此之前 `git worktree remove` 必须被拒绝。释放成功后 root 才合并并清理 child worktree，origin/root/其他 child worktree 不应出现误写。
- 并发 executor DAG 结束后，origin workspace 应包含所有 child 输出和 root 汇总提交；所有 child worktree、child branch、root run worktree 和 `planrunner*` branch 都已清理。
- plan-runner 创建了本地 commit；external review 范围是 dispatch 时记录的 base commit 到当前 `HEAD`。
- parent/main session 收到 merge-back 通知，正文包含 origin worktree、run worktree、branch、base commit、head commit、`git merge --ff-only <branch>` 和 `git worktree remove <run_worktree>`。
- harness 不自动合回 origin workspace；parent 执行 merge-back 前 origin `HEAD` 仍应停在 dispatch base commit。
- parent 执行 merge-back 后，origin `HEAD` 应等于 task state 中 `parent_notification.head_commit`，`git status --short` 为空，`git worktree list --porcelain` 不含 `planrunner`。
- 最终报告列出修改文件、验证命令与结果。
- `git diff --check` 通过。
- review loop 可观察到 `finish_plan` 后进入审计阶段；若检查 task state，应看到 `self_check_completed`、`deterministic_check_passed`、`audit_review_dispatched`、`external_review_passed`、`task_validated`、`parent_merge_back_notified` 事件，且不应出现 `self_check_prompt_sent`。
- parent 的 terminal 通知必须晚于对应 root terminal barrier 和 terminal state；如果收到完成表述但 task state 仍在 `audit_review` / `external_review`，或不存在 barrier，说明 lifecycle gate 泄漏。
- OpenCode DB 中 audit child session 应有 message / part；legacy `session.prompt` 路径不写 `session_input`。若只有 session 行，说明 audit child prompt 未成功落库。
- 轻量 probe 应能验证 audit child 事件回流：`scripts/opencode-subagent-event-probe.mjs --mode audit-child --audit-agent plan-runner-audit` 的 summary 中 `backflow.message_updated` 和 `backflow.idle` 都应为 `true`。
- OpenCode DB 中同一 subagent session 不应在 repair prompt 后出现 `agent-switched` 到 `build`；后续 prompt 应保持 `plan-runner`。

## 失败处理

- 若没有 `write_plan({ tasks })`、`start_task` 或 `complete_task` 记录，说明新 agent/skill 指令未生效，先确认 OpenCode 已重启。
- 若原生 `task(subagent_type="plan-runner")` 被拒绝，改用 `start_plan_runner`；原生 task 不再创建 plan-runner root state。
- 若 parent/main session 没有收到 merge-back 通知，但 task-state 已是 `validated`，检查 `parent_notification` 字段以及 `parent_merge_back_notified` / `parent_merge_back_notify_failed` event；通知失败不应回退 `validated`。
- 若 accepted 后未收到预期 terminal 通知，不要循环轮询；对 owner parent 调用一次 `get_plan_runner_status`，记录返回状态及通知字段后再人工诊断。
- 若 `prompt-async` probe 的真实 SDK `status_code` 不是 `204`、缺少 terminal 或 `accepted_before_terminal != true`，按失败处理；参数拼写错误也必须为非 `0` 退出，不能用模拟输出替代。
- 若同 parent 双 run 的状态或通知串线，检查 parent registry 是否按 run id 独立保存，以及 owner-only 查询是否拒绝非 parent session。
- 若 child 全部 settled 后 root 未继续，检查 `waiting_for_children`、child settled event 和有限唤醒计数；不要新建 root 或由 parent 代替实施。
- 若 Plan-Runner root 的原生 `task` 被拒绝，改用 `dispatch_child({ description, prompt })`；不要恢复 prompt 路径重写或 `tool.execute.after(task)` session 绑定。
- 若 child worktree cleanup 被 `plan_runner_requires_child_runtime_disposal` 拒绝，先检查对应 child 的 `runtime_disposal`、`child_runtime_disposed` / `child_runtime_disposal_failed` event；不要强制删除仍绑定 directory runtime 的 worktree。
- 若通知失败后 runtime 未回收，owner 仅调用一次 `get_plan_runner_status` 诊断；不要让 root 尾部即时 dispose。等待当前回合结束后的 parent idle 安全触发，不承诺 timer。
- 若 smoke 汇总脚本报告失败但 state 中没有 `gate_failures` 字段，按空数组处理后重算；缺失字段不等于 gate failure。
- 用 Node wrapper 跑 `opencode run --attach` 时，`spawn` 必须设置 `stdio: ["ignore", "pipe", "pipe"]` 或主动关闭 stdin；否则 CLI 会等待 stdin EOF，server 侧看不到 session/task-state，误判为 plan-runner 未启动。
- 若 `finish_plan` 返回 `plan_runner_requires_clean_repo_before_review` 或 `plan_runner_requires_commit_range`，说明 plan-runner 未把本次改动完整落入本地 commit，需提交后重跑验证并再次调用 `finish_plan`。
- 若停在 self-check 或 deterministic check 后，检查 plan-runner 是否调用了 `finish_plan`，以及 harness 插件是否加载或仍运行旧 OpenCode 进程。
- 若停在 `audit_review` 且 audit child 无 message / part，先用 `scripts/opencode-subagent-event-probe.mjs --mode audit-child --audit-agent plan-runner-audit` 检查 agent 是否已加载；再检查 audit 派发是否使用 `client.session.prompt` 而不是 `promptAsync`。
- 若 audit child 有 message / part 但 terminal gate 未继续推进，用同一个 probe 的 `backflow.message_updated` / `backflow.idle` 区分是 OpenCode 事件未回流，还是 harness 没消费回流事件。
- 若 state 记录 `audit review did not return valid JSON`，但 DB 的 `part.data` 中有 audit JSON text，检查 harness 是否消费 audit session 的 `message.part.updated` text part；不要只看 `message.updated.info`。
- 若 audit 失败原因是 `external-llm-review or reviewer.py must still run`，检查 audit prompt；audit 上下文不应出现 external review / reviewer 信息，这些是 harness 内部后续 gate。
- 若进入 external review 后返回 `unavailable`，先在 `userconf/skills/external-llm-review` 跑 `uv run --script _healthcheck.py`；默认 provider 配额耗尽时应确认 plan-runner harness 是否按 provider chain fallback 到可用 provider。
- 若 repair 后 DB 出现 `agent-switched: build`，检查 harness 回投原 session 的 `promptAsync` 是否带 `body.agent = "plan-runner"`。
- 若 `apply_patch` 或 `verification-before-completion` skill 被 phase gate 拦截，检查工具 allowlist 是否包含 `apply_patch` 和 `skill`；普通执行阶段还要确认当前只有一个 active task，repair 阶段则不应要求 agent 调用 `todowrite`。
