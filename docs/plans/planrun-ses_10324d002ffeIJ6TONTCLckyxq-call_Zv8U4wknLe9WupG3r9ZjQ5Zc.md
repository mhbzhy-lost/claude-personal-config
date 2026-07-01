# 当前会话 plan-runner 真实链路 smoke

Harness Task ID: planrun-ses_10324d002ffeIJ6TONTCLckyxq-call_Zv8U4wknLe9WupG3r9ZjQ5Zc

## Goal

在当前重启后的 OpenCode 会话中执行一次最小真实 plan-runner 链路：新增一份中文 runbook smoke 文档，验证文件存在、diff 格式与仓库状态，提交本地 commit，并通过 finish_plan 终端门禁。

## Approach

按用户指定范围只新增 docs/runbook/plan-runner-current-session-smoke.md；文档记录 smoke 背景、任务目标、验证命令和预期结果；完成后运行指定验证命令，使用指定中文 commit message 创建本地提交，不 push，最后调用 finish_plan。

## Non Goals

- 不修改无关文件
- 不更新 runbook 索引或其他知识文档
- 不 push 到远端
- 不改变 opencode 配置或运行初始化脚本

## Tasks

- Plan item T1: T1 写入 smoke 文档
  - Completion: docs/runbook/plan-runner-current-session-smoke.md 已创建
  - Completion: 内容为中文 Markdown
  - Completion: 明确说明这是“当前会话重启后 plan-runner 真实链路 smoke”
  - Completion: 记录任务目标、验证命令、预期结果
- Plan item T2: T2 运行提交前验证
  - Completion: 已运行 test -f docs/runbook/plan-runner-current-session-smoke.md 且通过
  - Completion: 已运行 git diff --check 且通过
  - Completion: 已运行 git status --short 并检查只包含预期变更
- Plan item T3: T3 创建本地提交
  - Completion: 已检查 git status、git diff、git log --oneline -10
  - Completion: 仅暂存并提交本任务相关文件
  - Completion: 本地 commit message 精确为 docs(smoke): 增加当前会话 plan-runner 烟测
  - Completion: 未执行 push
- Plan item T4: T4 提交后确认 clean 并通过 finish_plan
  - Completion: commit 后已运行 git status --short 并确认 clean
  - Completion: 已调用 finish_plan
  - Completion: finish_plan 返回 validated；若返回 repair_required，则在同一会话修复、验证、补充提交并重试

## DAG

- T1 -> T2
- T2 -> T3
- T3 -> T4

## Stop Conditions

- 发现需要修改 userconf/AGENTS.md 或其他全局规则文件
- 验证命令在当前环境无法运行
- 需要修改除 smoke 文档和 harness plan 文件以外的无关文件
- finish_plan 返回 blocked 或 interrupted 且无法在本会话内修复
