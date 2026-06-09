---
title: 四端 subagent 派发提示
kind: convention
status: active
applies_to:
  - shared/policies/subagent-dispatch-hint.json
  - shared/hooks/subagent-dispatch-hint.sh
  - opencode/plugins/dag-dispatch-hint.js
  - init_claude.sh
  - init_codex.sh
  - init_qwen.sh
last_verified: 2026-06-09
source: SubagentStart hook drift fix
---

# 四端 subagent 派发提示以 shared policy 为单一来源

Claude、Qwen、Codex 的 `SubagentStart` hook 与 OpenCode 的 `task` 派发前插件必须
输出同一份 DAG / 后台 / worktree 提示内容。提示正文只维护在
`shared/policies/subagent-dispatch-hint.json`。

## 适用场景

修改 subagent 派发规则、SubagentStart hook、OpenCode task 插件、四端 init 脚本或
全局 `claude/CLAUDE.md` 的 `## 并发` / `## Subagent` 规则时，必须检查本文。

## 项目事实 / 约定

`shared/policies/subagent-dispatch-hint.json` 是四端共享提示正文的单一来源。
`shared/hooks/subagent-dispatch-hint.sh` 只负责把该正文包装成
`hookSpecificOutput.additionalContext`，供 Claude / Qwen / Codex 的
`SubagentStart` 使用。

OpenCode 没有同构的 `SubagentStart` 注入点，因此
`opencode/plugins/dag-dispatch-hint.js` 在 `task` 工具执行前读取同一份 shared
policy，并用相同正文阻断不合规派发。

该提示只表达全局规则中的 DAG 并发、后台模式、coding task 的 git worktree 隔离、
合并后验证，以及自动合并失败或语义冲突时停止请求用户决策。全局规则已经移除的
知识检索、skill-catalog 强制流程、coding-expert 专属规则不得重新写入该 hook。

旧 `claude/hooks/coding-expert-rules-inject.sh` 已退役。不要重新按
`coding-expert` / `coding-expert-light` / `coding-expert-heavy` 三个 matcher 注入
知识检索规则；SubagentStart 应注册为无 matcher 的通用 hook。

## 原因

四端 hook 能力不同，但 subagent 派发约束来自同一份全局规则。如果每端各自维护提示
正文，OpenCode 插件、Claude/Qwen settings、Codex hooks 很容易与
`claude/CLAUDE.md` 分叉，尤其会把已退役的知识检索流程继续注入子 agent。

## 修改时注意

- 改提示正文时只改 `shared/policies/subagent-dispatch-hint.json`，不要在各端脚本或
  plugin 中复制新正文。
- 改全局 `claude/CLAUDE.md` 的 `## 并发` / `## Subagent` 时，同步检查 shared
  policy 是否仍匹配；修改全局规则本身还必须同步维护 `claude/CLAUDE.reason.md`。
- 改 Claude/Qwen/Codex init 脚本时，确认 SubagentStart 仍指向
  `shared/hooks/subagent-dispatch-hint.sh`。
- 改 OpenCode plugin 时，确认它仍读取
  `shared/policies/subagent-dispatch-hint.json`，而不是内联提示正文。
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
bash -n shared/hooks/subagent-dispatch-hint.sh init_claude.sh init_codex.sh init_qwen.sh
git diff --check
```
