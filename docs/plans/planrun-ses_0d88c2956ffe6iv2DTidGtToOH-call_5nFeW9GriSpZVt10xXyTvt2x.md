# plan-runner-smoke 文案更新计划

目标：执行一次最小文档型 live smoke，只修改 `docs/runbook/plan-runner-smoke.md`，替换步骤列表中关于 `write_plan({ content })` 的过期说法。旧文案把 content 绑定到 “Plan Content Contract”；新文案应说明 content 是紧凑的自然语言实现计划，并覆盖执行所需事实。

小方案：定位 `docs/runbook/plan-runner-smoke.md` 的步骤 2 第一条子弹，只替换该行措辞，不调整其它段落、格式或文件。

可验证任务切片：
- T1：修改 `docs/runbook/plan-runner-smoke.md` 中 `write_plan({ content })` 的描述，确保旧短语 `Plan Content Contract` 不再出现，新措辞包含“紧凑的自然语言实现计划”和“覆盖必要执行事实”。
- T2：运行定向文本检查，证明旧短语消失、新措辞存在；再运行 `git diff --check`，预期两者都通过。
- T3：检查本次 diff 仅包含约定文档变更，创建一个符合中文 conventional commit 规范的本地提交且不推送，提交后确认工作区 clean。

验证命令与预期：
- `python3 - <<'PY' ... PY`：读取 `docs/runbook/plan-runner-smoke.md`，断言不含 `Plan Content Contract`，且含有新措辞关键文本；预期输出确认文本检查通过。
- `git diff --check`：预期无输出且退出码为 0。
- 提交前查看 `git diff -- docs/runbook/plan-runner-smoke.md docs/plans/planrun-ses_0d88c2956ffe6iv2DTidGtToOH-call_5nFeW9GriSpZVt10xXyTvt2x.md` 与 `git status --short`，预期只有本 smoke 文档和 harness 写入的计划文件属于本次范围。

风险与停止条件：如果需要修改 `docs/runbook/plan-runner-smoke.md` 之外的人工文件、引入非文档逻辑变更、或当前环境无法运行指定验证命令，则停止并提交 Change Request。