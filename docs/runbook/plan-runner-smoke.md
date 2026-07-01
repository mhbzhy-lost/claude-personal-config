# Plan-runner 重启烟测

## 目的

验证重启后的 OpenCode 已加载当前仓库的 plan-runner plugin、agent 与 skill 栈，能走通：写计划、同步 todo、执行最小改动、运行验证、由 harness 接管 terminal gate 并进入 review loop。

## 步骤

1. 重启 OpenCode，并在 clean 的主工作区启动会话；不要从 `git worktree add` 创建的 linked worktree 启动。若当前主工作区不干净，先由主 agent/用户提交或清理既有改动，再派发 `plan-runner`。
2. 在主会话派发一个小型 `plan-runner` 文档任务，要求：
    - 先调用 `write_plan`；
   - `write_plan.tasks[]` 只写任务标题和完成标准，不声明 evidence 契约；
   - 用 `todowrite` 镜像计划项；
    - 不要把“最终报告/汇报 smoke 结果”写成 plan task，最终报告发生在所有 plan todo completed 之后；
     - 所有 plan todo completed 且验证命令完成后，先创建本地 commit，确认 repo clean，再调用 `finish_plan`，只有返回 `validated` 后再写最终报告；
    - 只改动约定的文档文件；
   - 至少运行文档相关检查和 `git diff --check`；
   - 创建本地 commit，但不推送。
3. 等待 plan-runner 返回最终报告。

## 通过标准

- `docs/plans/<task_id>.md` 已生成，且任务状态与 todo 项对应。
- plan-runner 创建了本地 commit；external review 范围是 dispatch 时记录的 base commit 到当前 `HEAD`。
- 最终报告列出修改文件、验证命令与结果。
- `git diff --check` 通过。
- review loop 可观察到 `finish_plan` 后进入审计阶段；若检查 task state，应看到 `self_check_completed`、`deterministic_check_passed`、`audit_review_dispatched`、`external_review_passed`、`task_validated` 事件，且不应出现 `self_check_prompt_sent`。
- 主会话收到的 plan-runner 最终报告必须晚于 `task_validated`；如果主会话先收到 `Result: completed` 而 task state 仍在 `audit_review` / `external_review`，说明 lifecycle gate 泄漏。
- OpenCode DB 中 audit child session 应有 message / part；legacy `session.prompt` 路径不写 `session_input`。若只有 session 行，说明 audit child prompt 未成功落库。
- 轻量 probe 应能验证 audit child 事件回流：`scripts/opencode-subagent-event-probe.mjs --mode audit-child --audit-agent plan-runner-audit` 的 summary 中 `backflow.message_updated` 和 `backflow.idle` 都应为 `true`。
- OpenCode DB 中同一 subagent session 不应在 repair prompt 后出现 `agent-switched` 到 `build`；后续 prompt 应保持 `plan-runner`。

## 失败处理

- 若没有 `write_plan` 或 `todowrite` 记录，说明新 agent/skill 指令未生效，先确认 OpenCode 已重启。
- 若 task 派发被 `plan_runner_requires_clean_repo` 阻断，说明主工作区已有未提交改动；不要让 plan-runner 自动处理，先由主 agent/用户决定提交或清理。
- 若 task 派发被 `plan_runner_disallowed_linked_worktree` 阻断，说明从 linked worktree 启动了 plan-runner；回到主工作区重新派发。
- 若 `finish_plan` 返回 `plan_runner_requires_clean_repo_before_review` 或 `plan_runner_requires_commit_range`，说明 plan-runner 未把本次改动完整落入本地 commit，需提交后重跑验证并再次调用 `finish_plan`。
- 若停在 self-check 或 deterministic check 后，检查 plan-runner 是否调用了 `finish_plan`，以及 harness 插件是否加载或仍运行旧 OpenCode 进程。
- 若停在 `audit_review` 且 audit child 无 message / part，先用 `scripts/opencode-subagent-event-probe.mjs --mode audit-child --audit-agent plan-runner-audit` 检查 agent 是否已加载；再检查 audit 派发是否使用 `client.session.prompt` 而不是 `promptAsync`。
- 若 audit child 有 message / part 但 terminal gate 未继续推进，用同一个 probe 的 `backflow.message_updated` / `backflow.idle` 区分是 OpenCode 事件未回流，还是 harness 没消费回流事件。
- 若 state 记录 `audit review did not return valid JSON`，但 DB 的 `part.data` 中有 audit JSON text，检查 harness 是否消费 audit session 的 `message.part.updated` text part；不要只看 `message.updated.info`。
- 若 audit 失败原因是 `external-llm-review or reviewer.py must still run`，检查 audit prompt；audit 上下文不应出现 external review / reviewer 信息，这些是 harness 内部后续 gate。
- 若进入 external review 后返回 `unavailable`，先在 `userconf/skills/external-llm-review` 跑 `uv run --script _healthcheck.py`；默认 provider 配额耗尽时应确认 plan-runner harness 是否按 provider chain fallback 到可用 provider。
- 若 repair 后 DB 出现 `agent-switched: build`，检查 harness 回投原 session 的 `promptAsync` 是否带 `body.agent = "plan-runner"`。
- 若 `apply_patch` 或 `verification-before-completion` skill 被 phase gate 拦截，检查工具 allowlist 是否包含 `apply_patch` 和 `skill`；普通执行阶段还要确认当前只有一个 `in_progress` todo，repair 阶段则不应要求 agent 调用 `todowrite`。
