---
title: 四端 subagent 派发提示
kind: convention
status: active
applies_to:
  - shared/policies/subagent-dispatch-hint.json
  - shared/hooks/subagent-dispatch-hint.sh
  - opencode/plugins/subagent-hint.js
  - init_claude.sh
  - init_codex.sh
  - init_qwen.sh
  - init_opencode.sh
  - userconf/agents/plan-runner.md
  - userconf/plugins/plan-runner-harness.js
  - scripts/opencode-subagent-event-probe.mjs
last_verified: 2026-06-26
source: opencode plan-runner agent
---

# 四端 subagent 派发提示以 shared policy 为单一来源

Claude、Qwen、Codex 的 `SubagentStart` hook 与 OpenCode 的 `subagent-hint.js`
插件必须输出基于同一份 shared policy 的提示内容。提示正文只维护在
`shared/policies/subagent-dispatch-hint.json`。

## 适用场景

修改 subagent 派发规则、SubagentStart hook、OpenCode workflow 插件、四端 init
脚本或全局 `claude/CLAUDE.md` 的 `## 并发` / `## Subagent` 规则时，必须检查本文。

## 项目事实 / 约定

`shared/policies/subagent-dispatch-hint.json` 是四端共享提示正文的单一来源。

OpenCode 的全局文件型 agent 由 `userconf/agents/*.md` 维护，并通过
`init_opencode.sh` 逐文件软链到 `~/.config/opencode/agents/`。opencode 当前
schema 没有 `agents.paths` 配置，不能在 `opencode.json` 中增加自定义 agents
目录字段。

**Claude/Qwen/Codex 端**：`shared/hooks/subagent-dispatch-hint.sh` 把 policy
正文包装成 `hookSpecificOutput.additionalContext`，供 SubagentStart hook 使用。

**OpenCode 端**：`opencode/plugins/subagent-hint.js`
在 `task` 工具执行前只检查 `background: true`，确保 subagent 使用后台模式。

`plan-runner` 是 OpenCode 的执行容器 agent：仅在用户明确表达“写计划并
执行 / 进入执行阶段”后使用。主 agent 负责方案讨论和 Execution Brief；该 subagent
负责将 brief 细化为可验证 todo、执行、收集 evidence，并在方案需要变化时返回
Change Request。

多步计划入口不再依赖 `writing-plans` skill。`plan-runner` 的 description 负责启发式
触发；完整计划文档格式、TODO/DONE marker、DAG、可并发集合、验证方式和 evidence
要求都维护在 `userconf/agents/plan-runner.md`。

`plan-runner` 作为 root executor 可以使用 `task` 工具编排 DAG child subagents，但
child subagents 必须使用默认 child subagent，不选择自定义 agent；依赖 OpenCode 默认
subagent safety policy 保证 child 没有 `task` 权限。child 只能返回 evidence，不能
继续递归派发 subagent，也不能更新 root plan/todo 的完成状态。

`userconf/plugins/plan-runner-harness.js` 是 plan-runner 的 harness 入口。首个落地
切片包含：
- `tool.execute.before(task)` 生成 `planrun-<parent>-<call>` task state，并注入
  Harness Task ID marker。
- `tool.execute.after(task)` 通过 `output.metadata.sessionId` 绑定 plan-runner child session。
- `write_plan` custom tool 写 `docs/plans/<task_id>.md`，并只把 harness 消费的
  `plan_contract` 写入 task state。
- `write_plan` 会拒绝引用未知 task id 或包含环的 DAG；后续执行/审计可以假设
  `plan_contract.dag` 是可拓扑排序的依赖图。
- phase gate 在 `planning_required` / `waiting_for_todo` / execution 阶段限制工具。
- `todo.updated`、`tool.execute.after(bash)`、`tool.execute.after(write|edit).input.filePath`、
  `message.updated.info.summary.diffs`、`message.part.updated` patch、`session.diff` 写入
  evidence 索引；harness 自己生成的 `docs/plans/<task_id>.md` 不计入实现 diff evidence。
- `session.idle(plan-runner)` 首次完成尝试时先通过 `client.session.promptAsync`
  投递 verification-before-completion self-check；下一次 idle 再做 deterministic check。
  deterministic check 通过后不能只停在 `audit_review`，必须由 harness 直接创建 audit
  child session，并用 `agent: plan-runner-audit` 后台投递 `audit_review_required` prompt。
- task/session state 写入使用 `.tmp.<pid>.<uuid>` 后 rename；读到损坏 JSON 时移到
  `task-state/corrupt/<state-kind>/`，并把该 state 当作 inactive fail-open。
- harness runtime I/O 使用 `node:fs/promises`；OpenCode server hook 不应在高频
  event/tool path 上使用同步 fs helper 阻塞事件循环。
- corrupt state 隔离失败也必须 fail-open 为 inactive state；隔离目录冲突、权限变化
  或磁盘异常不能让 hook 崩溃。

### OpenCode server hook 实测（2026-06-25）

探针：`scripts/opencode-subagent-event-probe.mjs`。必须走 `opencode serve` +
`opencode run --attach`；直接 `opencode run` 只触发 config 初始化，不足以验证
tool/event hook 行为。

实测结论：
- `tool.execute.before` 输入包含 `tool`、`sessionID`、`callID`，`output.args` 是工具参数。
- `tool.execute.after(task)` 的 `output.metadata.sessionId` 是 child session id，
  `output.metadata.parentSessionId` 是父 session id。
- `session.created` 的 `properties.info.parentID` 和 `agent` 可作为 child 绑定 fallback。
- `tool.execute.after(bash).output.metadata.exit` 是 bash exit code。
- before hook 抛错能阻断工具执行；对应 JSON stream 中 tool part 状态为 `error`。
- `session.idle` 后调用 `client.session.promptAsync` 能把 validation 结果投递回同一
  session，并触发 agent 继续执行。
- `promptAsync` 只能投递给目标 session；不能按所有 idle session 广播。

真实闭环补充（2026-06-25）：
- `write_plan` custom tool 的执行 context 中 `worktree/directory` 可能是 `/`，不能用它
  覆盖 dispatch 阶段保存的 `state.worktree`。
- 真实 git workspace 中 `session.diff.diff` 可能一直为空；可用 diff 可能出现在
  `message.updated.info.summary.diffs`、`message.part.updated` 的 `part.type == "patch"`
  和 `part.files`。OpenCode `write` / `edit` tool part 的 `input.filePath` 是更直接的
  实现文件来源，必须记录为当前 active task 的 diff evidence。
- `message.updated.info.summary.diffs` 可能反复输出同一个用户消息中的计划文档 diff。
  `docs/plans/<task_id>.md` 是 harness 计划产物，必须过滤，不能作为实现 evidence。
- 临时 git workspace 实测 self-check re-entry 链路：`task(plan-runner)` -> `write_plan` ->
  `todowrite(T1 in_progress)` -> `write` -> `message.updated.summary.diffs` ->
  `bash` validation -> `todowrite(T1 completed)` -> `session.idle` -> self-check
  re-entry -> 补充验证命令 evidence。第二次 idle 后进入 `audit_review`，创建 audit
  child session 并投递 `audit_review_required` prompt 的状态流已由 harness 单测覆盖。
- 真实 `opencode serve` wrapper 探针（2026-06-26，OpenCode `1.17.11`）验证：server
  能识别 `plan-runner-audit`，harness 在 `session.idle` 后写入
  `self_check_completed`、`deterministic_check_passed`、`audit_review_dispatched`，并创建
  `parentID == plan_runner_session_id` 的 audit child session。
- audit 派发读取持久化 task state 时，`modified_files` 和 `child_sessions` 缺失或不是数组
  按空数组处理；这是旧 state 兼容兜底，不代表新 state 可以省略这些字段。
- 损坏 task state JSON 的恢复路径由单测覆盖：`session.idle` 不抛异常，坏文件会进入
  `corrupt/tasks/<task_id>.json`。

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
  `opencode/plugins/subagent-hint.js`，且
  `init_opencode.sh` 通过子模块 `install-opencode.sh` 安装。
- 改 OpenCode 全局 agent 时，优先新增或修改 `userconf/agents/*.md`，并确认
  `init_opencode.sh` 的 `sync_opencode_agents` 仍会逐文件软链到用户级 agents 目录。
- 不要在 `opencode.json` 里增加不存在的 agents 目录配置；schema 未支持的字段会导致
  OpenCode 配置校验失败。
- 不要把 `writing-plans` 重新加入默认计划入口；先用 `plan-runner` 的 description 做
  启发式触发，实际效果不好时再考虑 AGENTS.md 路由规则。
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
node --test userconf/plugins/test/init-opencode-agents.test.mjs userconf/plugins/test/plan-runner-harness.test.mjs scripts/test/opencode-subagent-event-probe.test.mjs
git diff --check
```
