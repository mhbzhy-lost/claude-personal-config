---
title: 四端 subagent 派发提示
kind: convention
status: active
applies_to:
  - shared/policies/subagent-dispatch-hint.json
  - shared/hooks/subagent-dispatch-hint.sh
  - vendor/opencode-dynamic-workflow/plugins/workflow-hint.js
  - init_claude.sh
  - init_codex.sh
  - init_qwen.sh
  - init_opencode.sh
last_verified: 2026-06-15
source: opencode-dynamic-workflow phase 2
---

# 四端 subagent 派发提示以 shared policy 为单一来源

Claude、Qwen、Codex 的 `SubagentStart` hook 与 OpenCode 的 `workflow-hint.js`
插件必须输出基于同一份 shared policy 的提示内容。提示正文只维护在
`shared/policies/subagent-dispatch-hint.json`。

## 适用场景

修改 subagent 派发规则、SubagentStart hook、OpenCode workflow 插件、四端 init
脚本或全局 `claude/CLAUDE.md` 的 `## 并发` / `## Subagent` 规则时，必须检查本文。

## 项目事实 / 约定

`shared/policies/subagent-dispatch-hint.json` 是四端共享提示正文的单一来源。

**Claude/Qwen/Codex 端**：`shared/hooks/subagent-dispatch-hint.sh` 把 policy
正文包装成 `hookSpecificOutput.additionalContext`，供 SubagentStart hook 使用。

**OpenCode 端**：`vendor/opencode-dynamic-workflow/plugins/workflow-hint.js`
在 `task` 工具执行前检测多 agent 编排意图，命中时抛出提示建议使用 workflow
脚本编排。旧的 `opencode/plugins/dag-dispatch-hint.js` 已废弃（保留用于回退）。

提示内容涵盖：
- 多 agent 编排推荐 workflow 脚本（确定性、可复用、实时干预）
- 直接派发 subagent 允许的场景（单个、只读探索、2 个以内独立）
- 通用约束（并行派发、后台模式、worktree 隔离、合并验证）
- 逃生路径（`skip-dag-hint` 字面值放行）

旧 `claude/hooks/coding-expert-rules-inject.sh` 已退役。不要重新按
`coding-expert` / `coding-expert-light` / `coding-expert-heavy` 三个 matcher 注入
知识检索规则；SubagentStart 应注册为无 matcher 的通用 hook。

## 原因

四端 hook 能力不同，但 subagent 派发约束来自同一份全局规则。如果每端各自维护提示
正文，OpenCode 插件、Claude/Qwen settings、Codex hooks 很容易与
`claude/CLAUDE.md` 分叉。

多 agent 编排从"DAG 拦截"升级为"workflow 建议"，是因为 DAG 拦截只能阻止错误
派发，不能引导 agent 使用更优的编排方式。workflow 脚本提供确定性执行路径。

## 修改时注意

- 改提示正文时只改 `shared/policies/subagent-dispatch-hint.json`，不要在各端脚本或
  plugin 中复制新正文。
- 改全局 `claude/CLAUDE.md` 的 `## 并发` / `## Subagent` 时，同步检查 shared
  policy 是否仍匹配；修改全局规则本身还必须同步维护 `claude/CLAUDE.reason.md`。
- 改 Claude/Qwen/Codex init 脚本时，确认 SubagentStart 仍指向
  `shared/hooks/subagent-dispatch-hint.sh`。
- 改 OpenCode workflow 插件时，确认它在
  `vendor/opencode-dynamic-workflow/plugins/workflow-hint.js`，且
  `init_opencode.sh` 通过子模块 `install-opencode.sh` 安装。
- `opencode/plugins/dag-dispatch-hint.js` 已废弃，保留用于 git revert 回退。
  不要修改、不要删除、不要恢复软链。
- 不要把 `knowledge-retrieval`、`skill-catalog`、`mcp__skill-catalog` 或 tag 闭集
  获取流程放回 SubagentStart hook。

## 验证方式

```bash
python3 -m unittest \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_opencode_dag_dispatch_hint_matches_global_concurrency_rules \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_subagent_dispatch_hint_policy_is_four_host_single_source \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_shared_subagent_dispatch_hook_outputs_policy_as_additional_context \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_skill_resolve_preflight_policy_is_single_source
```

```bash
bash -n shared/hooks/subagent-dispatch-hint.sh init_claude.sh init_codex.sh init_qwen.sh init_opencode.sh
git diff --check
```
