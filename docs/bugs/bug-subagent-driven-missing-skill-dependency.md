# Subagent-Driven 被误判为依赖未开放 skill

## 现象

用户选择 `writing-plans` 提供的 Subagent-Driven 执行方式后，agent 报告无法执行，
理由是 `subagent-driven-development` 不在可用 skill 列表中。

## 根因分析六要素

1. **触发条件**：`writing-plans` 原始内容要求 Subagent-Driven 加载 `subagent-driven-development`，但本仓白名单未开放该 skill。
2. **直接现象**：agent 将缺失的原始 sub-skill 视为执行前置条件，拒绝按计划派发 subagent。
3. **期望链路**：本仓 override 定义 Subagent-Driven，由主 agent 直接逐任务派发后台 subagent，不加载额外执行 skill。
4. **实际链路**：override 只描述执行方式，没有明确撤销原始 `REQUIRED SUB-SKILL` 契约；仅 Inline 分支写明忽略未开放 sub-skill。
5. **根本原因**：本地 override 的优先级规则完整，但 Subagent-Driven 分支的否定性约束缺失，给 agent 留下依赖解释空间。
6. **修复与验证**：在 `AGENTS.md` 明确 Subagent-Driven 不加载、不依赖 `subagent-driven-development`，同步 reason 伴文，并用契约测试锁定该声明。

## 风险边界

不开放额外 Superpowers skill，不改变 Plan-Runner 或 Inline Execution，只澄清现有
Subagent-Driven 的本地执行契约。
