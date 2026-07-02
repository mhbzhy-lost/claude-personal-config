# 重构 plan-runner 计划文档职责与并发 worktree 隔离

Harness Task ID: planrun-ses_10324d002ffeIJ6TONTCLckyxq-call_Gej6WaXp5jiFnuBymjA2KkSd

## Goal

让 plan 文档回归人审/external review/设计承诺用途，结构化执行账本由 todowrite 的 Tn: 列表派生；并固化并发 child/executor 必须使用独立 git worktree、root 负责合并验证的约束。

## Approach

按 TDD 执行：先为 write_plan content-only、todo mirror 派生 plan_contract、Tn 诊断、agent prompt Plan Content Contract、并发 worktree 约束补充 RED 测试；再最小修改 harness/plugin 与 plan-runner agent 指令；最后补齐 bug/knowledge 文档，运行指定 Node 测试、语法检查和 diff 检查，创建本地提交并通过 finish_plan。

## Non Goals

- 不修改 userconf/AGENTS.md
- 不完整复制 writing-plans skill
- 不 push
- 不把旧 write_plan(tasks) 继续作为新的公开协议
- 不在本轮实现超出最小可用范围的大规模 OpenCode task API 重构

## Tasks

- Plan item T1: 补充 RED 测试覆盖 content-only write_plan 与 plan_contract 派生
  - Completion: 测试断言 write_plan 接口/实现只接受并使用 content 写正文 plan
  - Completion: 测试断言 write_plan 不再从 tasks/dag/parallel_sets 生成 plan_contract
  - Completion: 测试断言首次/有效 todowrite mirror 从精确 Tn: token 派生 plan_contract.tasks
  - Completion: 测试断言缺 Tn: todo 给出可执行诊断且不会误把 T10 匹配为 T1
  - Completion: 相关测试在实现前以预期原因失败
- Plan item T2: 实现 write_plan content 主导与 todo 派生账本
  - Completion: write_plan 显式写 docs/plans/planrun-*.md、保存 sha、推进状态，但不把 plan 文档当 harness task contract 来源
  - Completion: plan_contract.tasks 由 todowrite Tn: 列表派生，id 为 Tn，title 为去前缀文本，completion criteria 使用最小默认或可用信息
  - Completion: deterministic/evidence/completeness 依赖 plan_contract.tasks 的逻辑在 todo 派生后仍可用
  - Completion: 旧 state 仅保留最低必要读取兼容
- Plan item T3: 补充 RED 测试覆盖 plan-runner agent Plan Content Contract 与并发 worktree 约束
  - Completion: 测试断言 userconf/agents/plan-runner.md 包含精简 Plan Content Contract 必要项
  - Completion: 测试断言 prompt 明确 plan 文档服务人审/external review/设计承诺，harness 结构化状态来自 todowrite
  - Completion: 测试断言有并发 child/executor 时每个 child 必须独立 git worktree，root 负责合并、冲突处理和验证
  - Completion: 相关测试在实现前以预期原因失败
- Plan item T4: 更新 plan-runner agent 指令与知识/bug 文档
  - Completion: userconf/agents/plan-runner.md 增加精简 Plan Content Contract，不完整复制 writing-plans skill
  - Completion: agent 指令明确无并发可用主工作区；有并发时每个 child/executor 使用独立 git worktree 且 child 只改自己的 worktree
  - Completion: root plan-runner 合并 child worktree 回主工作区并跑验证的责任被明确记录
  - Completion: 新增 docs/bugs/bug-plan-runner-structured-plan-duplicates-harness-state.md，包含根因分析 6 要素
  - Completion: 更新合适知识文档记录职责分离与并发 worktree 约束
- Plan item T5: 运行验证并本地提交
  - Completion: 运行 node --test "userconf/plugins/test"/*.mjs "scripts/test/opencode-subagent-event-probe.test.mjs" 并通过，或给出明确不可运行原因
  - Completion: 运行 node --check userconf/plugins/plan-runner-harness.js 并通过
  - Completion: 运行 node --check scripts/opencode-subagent-event-probe.mjs 并通过
  - Completion: 运行 git diff --check 并通过
  - Completion: 检查 git status/diff/log 后创建符合仓库规范的本地 commit
  - Completion: 提交后确认工作区 clean

## DAG

- T1 -> T2
- T3 -> T4
- T2 -> T5
- T4 -> T5

## Parallel Sets

- T1, T3
- T2, T4

## Stop Conditions

- 发现需要修改 userconf/AGENTS.md
- 发现必须改变已确认 API/用户可见行为或引入新依赖
- 发现当前环境无法完成必需验证
- 发现自动 per-child worktree 的最小实现超出本轮范围且仅指令/测试不足以满足约束
- 发现需要修改 brief 范围外文件或系统
