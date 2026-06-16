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
last_verified: 2026-06-16
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
在 `task` 工具执行前只检查 `background: true`，确保 subagent 使用后台模式。

提示内容：
- shared policy 精简为后台模式约束（编排决策由 `claude/CLAUDE.md` 管辖）
- `claude/CLAUDE.md` 的 `## 并发与 Subagent` 包含完整的并发阈值决策树

编排决策（在 AGENTS.md 中，不在 hook/plugin 中）：
- 并发 < 3 → 用 subagent（task 工具直接派发）
- 并发 ≥ 3 → 用 Dynamic Workflow（脚本编排 + git worktree 隔离）
- 串行多步也用 subagent，节省主对话上下文

### subagent 默认工具集（2026-06-16 确认）

opencode 的 subagent 默认拥有完整工具集（bash、webfetch、playwright 等），
与主对话一致。`task` 工具内部（`TaskTool.execute`）创建 subagent session 时：
- 继承父 session 的 `permission`（默认 `allow *`）
- 默认 deny `todowrite`（避免污染父 session 的 todo 状态）
- 默认 deny `task`（禁止递归派发，防止无限嵌套）
- 默认 deny 任何列入 `experimental.primary_tools` 的工具（未配置则不受影响）

早期误判"subagent 工具集被硬编码限制为只读子集"源于未读清 `TaskTool` 源码——
`Agent.tools: undefined` 只意味着"未在 agent 定义中显式声明"，运行时实际走
`Agent.permission` 的 `allow *` 路径。实测确认后台 general subagent 可执行
bash 命令。

旧 `claude/hooks/coding-expert-rules-inject.sh` 已退役。不要重新按
`coding-expert` / `coding-expert-light` / `coding-expert-heavy` 三个 matcher 注入
知识检索规则；SubagentStart 应注册为无 matcher 的通用 hook。

## 原因

四端 hook 能力不同，但 subagent 派发约束来自同一份全局规则。如果每端各自维护提示
正文，OpenCode 插件、Claude/Qwen settings、Codex hooks 很容易与
`claude/CLAUDE.md` 分叉。

早期尝试在 hook/plugin 中嵌入编排推荐（workflow vs subagent 决策树），但实测
agent 几乎总会在 hook 触发后走逃生舱继续直接派发 subagent。根因是 skill
description 和 hook 提示都是软建议，AGENTS.md 的"禁止"才是硬约束。2026-06-16
将编排决策树移入 `claude/CLAUDE.md`，hook/plugin 只保留后台模式强制检查。

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
- `opencode/plugins/dag-dispatch-hint.js` 已删除。需要回退时从 git 历史恢复。
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
