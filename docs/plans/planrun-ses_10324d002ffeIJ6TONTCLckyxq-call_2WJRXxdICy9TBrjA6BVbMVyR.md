# plan-runner runtime live smoke

## Goal

验证当前 HEAD `e6e677b fix(plan-runner): 删除 runtime stale 扫描` 之后，新的 plan-runner runtime 在一次最小真实链路中不再写入 `task_stale`，并且可以完成 `finish_plan` 的 `validated` 终态。

本次只做低风险、可审计的中文 runbook 文档型 smoke 记录，不修改 `userconf/AGENTS.md`，不 push。

## Architecture

- 使用 plan-runner 标准链路：`write_plan` 生成计划、`todowrite` 记录 `Tn:` 任务、实际修改 runbook 文档、运行指定验证、本地提交、clean repo 后调用 `finish_plan`。
- 变更为文档 smoke 记录，不改变 runtime、插件、hook 或测试代码逻辑。
- 可见 task-state / harness 事件中如能观察到 stale 事件，记录是否出现 `task_stale`；预期为不出现。

## File Structure

- `docs/runbook/plan-runner-smoke.md`：新增一条简短中文 live smoke 记录，包含基线提交 `e6e677b` 与验证命令。
- `docs/plans/<task_id>.md`：由 harness 根据本计划写入，不手工编辑。

## TDD task steps

- T1: 检查目标 runbook 文件与当前 git 状态，确认只做文档型 smoke 且工作区干净。
- T2: 在 `docs/runbook/plan-runner-smoke.md` 增加本次 live smoke 记录，说明 runtime stale 扫描删除后的验证目的、基线提交 `e6e677b`、验证命令和预期不出现 `task_stale`。
- T3: 运行 `node --test "userconf/plugins/test/plan-runner-harness.test.mjs"`，期望退出码 0，输出 TAP/pass 测试结果。
- T4: 运行 `git diff --check`，期望退出码 0 且无空白错误输出。
- T5: 检查 diff 仅包含计划文件与 smoke runbook 文档，创建符合仓库规范的本地提交，提交后确认 `git status --short` 为空。

说明：本任务不产生逻辑代码变更，TDD 红绿实现流程不适用；用指定 harness 测试和 diff 检查作为 smoke 验证。

## Commands with expected output

- `git status --short`
  - 变更前期望为空；提交前只出现计划文件和 `docs/runbook/plan-runner-smoke.md`；提交后期望为空。
- `node --test "userconf/plugins/test/plan-runner-harness.test.mjs"`
  - 期望退出码 0，测试报告显示全部子测试通过。
- `git diff --check`
  - 期望退出码 0，无 trailing whitespace 或 conflict marker 报错。
- `git diff -- docs/runbook/plan-runner-smoke.md docs/plans/`
  - 期望仅包含本次 plan 与 smoke 文档记录。
- `git commit -m "docs(plan-runner): 记录 runtime smoke 验证"`
  - 期望提交成功，commit message 满足中文祈使句规范。

## Risks / Stop Conditions

- 若 `docs/runbook/plan-runner-smoke.md` 不存在且没有相近已有 plan-runner smoke 文档，停止并返回 Change Request，不新增大范围文档体系。
- 若指定 harness 测试失败，先记录失败证据；除非失败明显由本次文档改动引起，否则停止并返回 Change Request。
- 若需要修改 `userconf/AGENTS.md`、runtime 代码、插件代码或新增非 smoke 范围文档，停止并返回 Change Request。
- 若 `finish_plan` 返回 `repair_required`，仅修复本次 smoke 范围内技术成立的问题，重新验证、提交并再次调用 `finish_plan`。