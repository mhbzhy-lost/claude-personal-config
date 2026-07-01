# 当前会话 plan-runner 真实链路 smoke

## 背景

这是一次“当前会话重启后 plan-runner 真实链路 smoke”，用于确认 OpenCode 进程重启后，plan-runner 仍能完成写计划、执行最小变更、运行验证、创建本地提交以及通过终端门禁的完整链路。

## 任务目标

- 新增本中文 Markdown 文档。
- 记录本次 smoke 的验证命令与预期结果。
- 仅产生本次 smoke 所需的最小变更，不修改无关文件。

## 验证命令

```bash
test -f docs/runbook/plan-runner-current-session-smoke.md
git diff --check
git status --short
```

## 预期结果

- `test -f docs/runbook/plan-runner-current-session-smoke.md` 返回成功，确认文档存在。
- `git diff --check` 无空白错误输出。
- 提交前 `git status --short` 只显示本次 smoke 相关变更；提交后 `git status --short` 无输出，确认工作区 clean。
