# plan-runner 终态门禁与 push gate 路由生产级验证

Harness Task ID: planrun-ses_10324d002ffeIJ6TONTCLckyxq-call_Z63oTDO4WP2uaDLLB6PAyvqw

## Goal

在 /Users/leshi.zhy/claude-config 中以 TDD 修复三项已确认方案：plan-runner 终态 watchdog nudge、plan-runner-dispatch clean worktree 前置约束、external-review-gate workdir/cwd 路由与诊断增强，并完成本地验证与提交。

## Approach

先为每个行为补 RED 测试/bug 文档，再做最小实现并跑 GREEN；三个功能分支相互独立，可并行探索/实现但由根 plan-runner 统一验证、提交与 finish_plan。external-review-gate 修复遵循 systematic-debugging：记录 6 要素 bug 文档，确认插件 payload 未透传 workdir/cwd 导致 hook 误用主仓 cwd；实现只透传已有 tool args 并在 hook/日志中增强 repo/range/file count 可诊断性。

## Non Goals

- 不修改 userconf/AGENTS.md 或全局规则文本
- 不 push 远端
- 不绕过 finish_plan，不让 harness 在 idle 时自动执行 audit/external review
- 不改变 plan-runner-dispatch 的触发范围或代理选择策略
- 不引入新的依赖或变更用户可见 API 形态

## Tasks

- Plan item T1: T1: 为 plan-runner watchdog nudge 补 RED 测试
  - Completion: 测试覆盖 session.idle 且计划任务满足收尾条件时应向同一 plan-runner session 追加 finish_plan 提示
  - Completion: 测试覆盖 terminal gate active、validated/blocked、running child session 时不 nudge
  - Completion: 测试覆盖已提醒后不会重复 spam
  - Completion: 在实现前运行相关测试并记录预期失败输出
- Plan item T2: T2: 实现 bounded watchdog nudge
  - Completion: idle 处理逻辑只在无 active/terminal gate、无 running child、原始计划任务可收尾且未超过提醒限制时追加提示
  - Completion: state 记录提醒次数/时间或等价字段，避免无限提醒
  - Completion: nudge 提示要求立即调用 finish_plan 且不要 final report，不自动执行 gate/audit/external review
  - Completion: T1 相关测试 GREEN
- Plan item T3: T3: 为 plan-runner-dispatch skill clean worktree 约束补 RED 测试
  - Completion: userconf/plugins/test/init-opencode-agents.test.mjs 断言 skill 包含 git status --short
  - Completion: 测试断言 skill 明确 clean worktree 前置要求
  - Completion: 测试断言 dirty worktree 时不要 dispatch 并报告 dirty files/要求用户 commit/stash/clean
  - Completion: 在修改 skill 前运行测试并记录预期失败输出
- Plan item T4: T4: 更新 plan-runner-dispatch skill 文本
  - Completion: skill 派发前步骤明确要求主 agent 先跑 git status --short
  - Completion: skill 明确有输出时不得 dispatch，需报告 dirty files 并请用户 commit/stash/clean
  - Completion: 保持 skill description/触发范围不扩大
  - Completion: T3 相关测试 GREEN
- Plan item T5: T5: 为 external-review-gate workdir 误路由补 bug 文档与 RED 测试
  - Completion: 新增 docs/bugs/bug-external-review-gate-workdir-misroute.md，包含 6 要素根因分析
  - Completion: 测试覆盖 external-review-gate.js Bash payload 携带 workdir/cwd 到 hook
  - Completion: 若现有框架支持，新增 hook 脚本测试模拟 tool workdir 指向子仓并断言使用该 repo 的 range
  - Completion: 在实现前运行相关测试并记录预期失败输出
- Plan item T6: T6: 修复 external-review-gate workdir/cwd 路由并增强诊断
  - Completion: 插件向 shared/hooks/external-review-gate.sh 透传 output.args.workdir/cwd
  - Completion: hook 中对已定位 repo 后的 diff/hash/head/reviewer 等裸 git 调用完成评估，必要处统一使用 _git_prefix
  - Completion: deny 文案或日志明确输出 Review range、repo、file count
  - Completion: T5 相关测试 GREEN
- Plan item T7: T7: 运行全量验证并完成知识更新判断
  - Completion: 运行 node --test "userconf/plugins/test"/*.mjs "scripts/test/opencode-subagent-event-probe.test.mjs"
  - Completion: 运行 node --check userconf/plugins/plan-runner-harness.js
  - Completion: 运行 node --check scripts/opencode-subagent-event-probe.mjs
  - Completion: 运行新增/修改的 hook 测试以及 git diff --check
  - Completion: 若变更影响长期知识则更新 docs/knowledge/，否则最终报告说明无需更新原因

## DAG

- T1 -> T2
- T3 -> T4
- T5 -> T6
- T2 -> T7
- T4 -> T7
- T6 -> T7

## Parallel Sets

- T1, T3, T5
- T2, T4, T6

## Stop Conditions

- 发现核心方案需要改变 API 形态、数据模型、依赖或用户可见行为
- 必要验证在当前环境无法运行
- 修复需要修改 userconf/AGENTS.md 或范围外系统/文件
- TDD RED 无法构造且没有明确豁免
- 三次修复尝试后仍无法让同一测试 GREEN
