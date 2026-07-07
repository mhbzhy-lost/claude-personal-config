# bug: finish_plan preflight 后修复命令被 start_task 门禁拦截

## 现象

fresh live smoke 中，plan-runner 完成所有结构化任务后调用 `finish_plan`，harness 返回 `Result: preflight_blocked`，要求先 `git add/commit` 并确认 root repo clean。随后 plan-runner 尝试执行 `git status --short` / `git add` / `git commit` 等修复命令时，被 phase gate 拒绝，错误为 `start_task is required before execution tools`。

## 根因 (6 要素)

1. **触发条件**：所有 `tasks[]` 已完成，`active_task` 为 `null`，`finish_plan` 因 root repo dirty 或 HEAD 等于 base commit 返回 `preflight_blocked`。
2. **期望链路**：preflight block 是 terminal gate 前的生命周期修复步骤；plan-runner 应能在同一 session 中执行 git boundary 修复命令，然后再次调用 `finish_plan`。
3. **实际链路**：`enforcePlanRunnerPhaseGate()` 把 `bash` 归为 `EXECUTION_CONTEXT_TOOLS`，只要没有 `activeTask(state)` 就拒绝执行。
4. **关键假设失效**：实现假设所有 `bash` 都属于某个结构化任务；但 preflight 修复发生在任务全部完成之后，不能也不应该重新打开业务任务。
5. **旁证**：最新 smoke state 停在 `executing`，没有 `gate_failures`，events 有 `finish_plan_preflight_blocked`；root workspace 仍 dirty，说明修复命令没有成功执行到 commit/retry 阶段。
6. **影响范围**：任何需要在 `finish_plan` preflight 后修复 root commit boundary 或清理 child worktree 的 plan-runner run，都会在结构化任务完成后被 phase gate 卡住，无法进入 audit/external review 和 `validated`。

## 修复方向

允许已完成全部结构化任务的 plan-runner session 执行限定的 git-only `bash` boundary 修复命令；这样无论是在首次 `finish_plan` 前主动提交，还是在 `preflight_blocked` 后补救，都不需要重新打开业务任务。同时继续禁止无 active task 的普通代码编辑、child dispatch 和任意非修复执行工具。

## 验证

- RED：构造完成所有任务后 `finish_plan` 返回 `preflight_blocked` 的 state，验证 `bash git status --short` 不应再被 `start_task` 门禁拒绝。
- GREEN：实现后 focused test、harness 全量测试和全量 node 测试通过；fresh smoke 最终到 `validated`。
