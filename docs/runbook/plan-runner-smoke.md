# Plan-runner 重启烟测

## 目的

验证重启后的 OpenCode 已加载当前仓库的 plan-runner plugin、agent 与 skill 栈，能走通：`start_plan_runner` 创建 dedicated run worktree、`write_plan({ tasks })` 结构化计划、`start_task` / `complete_task` 状态推进、运行验证、本地 commit、由 harness 接管 terminal gate 并进入 review loop，最终在 `validated` 后向 parent session 投递 merge-back 通知。

## Live smoke 记录

- 2026-07-03：基于 `e6e677b fix(plan-runner): 删除 runtime stale 扫描` 执行最小文档型 live smoke，验证新 plan-runner runtime 不再写入 `task_stale`，并能在本地提交后由 `finish_plan` 进入 `validated`。
- 2026-07-09：两阶段 `opencode serve` smoke 验证 DAG executor 并发、child worktree 自动创建、child 合回/清理、parent/main session 合回 dedicated run worktree 并清理。临时证据目录：`/var/folders/27/6bnn8n7d4px6s33fvdpns89c0000gn/T/opencode/plan-runner-dag-executor-smoke2-jKj52y`。
- 2026-07-09：基于 `writing-plans` 产出的明确 DAG 计划执行 contract smoke，验证 parent 创建 plan-runner/run worktree、两个 executor child 各自创建 worktree、child commit 被 merge 回 run worktree 且 child worktree 清理、parent 将 run worktree 合回 main workspace 并清理 root worktree。临时证据目录：`/var/folders/27/6bnn8n7d4px6s33fvdpns89c0000gn/T/opencode/plan-runner-dag-contract-smoke-K62R7J`。
- 本次最小验证命令：`node --test "userconf/plugins/test/plan-runner-harness.test.mjs"` 与 `git diff --check`。
- 本次 T1 检查证据：派发前主工作区为 clean；`write_plan` 后仅出现计划文件与本 runbook 文档改动。
- 观察 task-state events 时，预期不出现 `task_stale`；若出现，应按失败处理回到 runtime/harness 事件写入链路排查。

## 步骤

1. 重启 OpenCode，并优先在临时 clean git repo 或当前项目的 clean origin workspace 启动 smoke。`start_plan_runner` 会创建 dedicated run worktree；origin workspace 的 dirty 内容不会进入 run worktree，但后续 merge-back 前必须由主 agent 再检查 origin 是否 clean。
2. 在主会话通过 `start_plan_runner` 派发一个小型 `plan-runner` 文档任务，禁止用原生 `task(subagent_type="plan-runner")`。任务要求：
    - 先调用 `write_plan({ tasks })`，tasks 写清 id、标题、文件范围、验证命令、停止条件；
    - 不再调用 `todowrite`，不再让 harness 从 todo 派生结构化状态；
    - 每个执行切片先调用 `start_task({ id })`，实现与验证完成后调用 `complete_task({ id })`；
    - 如需并发，才通过 `task(background=true, ...)` 派发 child 工作，确认 harness 注入 child worktree / branch 信息；
    - child 只改自己的 worktree，root 合并回 run worktree 后再运行最终验证；
    - 不要把“审计 / external review / finish_plan / 汇报 smoke 结果”写成 plan task；
    - 所有 plan tasks completed 且验证命令完成后，先创建本地 commit，确认 repo clean，再调用 `finish_plan`，只有返回 `validated` 后再写最终报告；
    - 只改动约定的文档文件；
    - 至少运行文档相关检查和 `git diff --check`；
    - 创建本地 commit，但不推送。
3. 等待 plan-runner `finish_plan` 返回 `validated`，并确认 parent/main session 收到 merge-back 通知。
4. 在 origin workspace 手工执行 merge-back 前，先运行 `git status --short`；clean 时执行通知中的 `git merge --ff-only <branch>`，再执行 `git worktree remove <run_worktree>`。dirty 时停止并询问用户。
5. 若本次 smoke 覆盖 DAG child，使用两阶段 parent session：第一阶段让 parent 调用 `start_plan_runner` 并等待 `parent_notification.status == sent`；第二阶段 attach 同一 parent session，要求它按通知中的命令执行 `git status --short`、`git merge --ff-only <branch>`、`git worktree remove <run_worktree>`，再验证 origin repo clean。

## 通过标准

- `docs/plans/<task_id>.md` 已生成，正文是紧凑的自然语言执行 brief，覆盖目标、方案、精确文件、小步可验证切片、验证命令、风险或停止条件，不要求固定模板章节或 checkbox 任务跟踪。
- task-state 中 `version == 2`，`tasks[]` 来自 `write_plan({ tasks })`，状态通过 `start_task` / `complete_task` 推进；不应出现 `todo` 或 `plan_contract` 作为新账本。
- 若任务使用 child session，至少一个 child session 记录独立 worktree、branch、base commit；child prompt 或 task output 可见 `Child worktree` / `Child branch` 元数据。
- 若任务使用并发 executor DAG，应看到至少两个 `child_worktree_created`、两个 `child_session_bound`、两个 `child_session_completed`，且第二个 `child_worktree_created` 早于第一个 `child_session_completed`，证明不是串行执行。
- 并发 executor DAG 结束后，origin workspace 应包含所有 child 输出和 root 汇总提交；所有 child worktree、child branch、root run worktree 和 `planrunner*` branch 都已清理。
- plan-runner 创建了本地 commit；external review 范围是 dispatch 时记录的 base commit 到当前 `HEAD`。
- parent/main session 收到 merge-back 通知，正文包含 origin worktree、run worktree、branch、base commit、head commit、`git merge --ff-only <branch>` 和 `git worktree remove <run_worktree>`。
- harness 不自动合回 origin workspace；parent 执行 merge-back 前 origin `HEAD` 仍应停在 dispatch base commit。
- parent 执行 merge-back 后，origin `HEAD` 应等于 task state 中 `parent_notification.head_commit`，`git status --short` 为空，`git worktree list --porcelain` 不含 `planrunner`。
- 最终报告列出修改文件、验证命令与结果。
- `git diff --check` 通过。
- review loop 可观察到 `finish_plan` 后进入审计阶段；若检查 task state，应看到 `self_check_completed`、`deterministic_check_passed`、`audit_review_dispatched`、`external_review_passed`、`task_validated`、`parent_merge_back_notified` 事件，且不应出现 `self_check_prompt_sent`。
- 主会话收到的 plan-runner 最终报告必须晚于 `task_validated`；如果主会话先收到 `Result: completed` 而 task state 仍在 `audit_review` / `external_review`，说明 lifecycle gate 泄漏。
- OpenCode DB 中 audit child session 应有 message / part；legacy `session.prompt` 路径不写 `session_input`。若只有 session 行，说明 audit child prompt 未成功落库。
- 轻量 probe 应能验证 audit child 事件回流：`scripts/opencode-subagent-event-probe.mjs --mode audit-child --audit-agent plan-runner-audit` 的 summary 中 `backflow.message_updated` 和 `backflow.idle` 都应为 `true`。
- OpenCode DB 中同一 subagent session 不应在 repair prompt 后出现 `agent-switched` 到 `build`；后续 prompt 应保持 `plan-runner`。

## 失败处理

- 若没有 `write_plan({ tasks })`、`start_task` 或 `complete_task` 记录，说明新 agent/skill 指令未生效，先确认 OpenCode 已重启。
- 若原生 `task(subagent_type="plan-runner")` 被拒绝，改用 `start_plan_runner`；原生 task 不再创建 plan-runner root state。
- 若 parent/main session 没有收到 merge-back 通知，但 task-state 已是 `validated`，检查 `parent_notification` 字段以及 `parent_merge_back_notified` / `parent_merge_back_notify_failed` event；通知失败不应回退 `validated`。
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
