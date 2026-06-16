---
title: OpenCode Dynamic Workflow 编排系统
kind: architecture
status: active
applies_to:
  - vendor/opencode-dynamic-workflow/
  - init_opencode.sh
  - shared/policies/subagent-dispatch-hint.json
last_verified: 2026-06-15
source: opencode-dynamic-workflow phase 1+2
---

# Dynamic Workflow 编排系统

## 适用场景

并发 ≥ 3 个 agent、有 DAG 依赖关系、或需要实时干预（暂停/恢复/断点续跑）
的多 agent 编排场景。并发 < 3 优先用 subagent 直接派发（CLAUDE.md §并发与
Subagent）。

## 项目事实 / 约定

`vendor/opencode-dynamic-workflow/` 是独立 git 子模块，提供：

- `lib/runner.mjs`：SDK backend workflow 运行时，无 baseUrl 时自动
  createOpencodeServer，支持并发调度、model 透传、暂停/恢复、快照断点续跑
- `lib/ipc.mjs`：文件系统 IPC（`.workflow/` 目录）
- `lib/dashboard.mjs`：静态 HTML 实时面板
- `plugins/workflow-hint.js` 已移至主仓并更名为 `opencode/plugins/subagent-hint.js`，
  职责仅为强制 subagent 使用后台模式。
  （编排决策由 `claude/CLAUDE.md` 管辖，不在插件中推荐 workflow）
- `workflows/*.mjs`：预定义 workflow 模板（parallel-research）

`init_opencode.sh` 通过 `install-opencode.sh` 将 `workflow-usage` skill 软链到
`~/.config/opencode/skills/workflow-usage/`。subagent-hint 插件由主仓
`opencode/plugins/` 直接同步。

旧的 `opencode/plugins/dag-dispatch-hint.js` 已删除，需要时可从 git 历史恢复。

## 原因

裸 subagent 派发依赖 LLM 记住 DAG 拓扑和 worktree 策略，容易遗漏或重复
派发。workflow 脚本是确定性代码，可测试、可复用、可断点续跑。

## 修改时注意

- subagent-hint（原 workflow-hint）已精简为只检查 `background: true`，编排决策从插件层移到
  `claude/CLAUDE.md` 的 `## 并发与 Subagent`。修改 CLAUDE.md 的决策树时，
  必须同步维护 `claude/CLAUDE.reason.md`
- subagent-hint.js 只能导出真正的 OpenCode plugin 入口函数。OpenCode 1.17.7
  legacy loader 会把模块里每个导出的函数都当作 server plugin 执行；helper 函数
  必须保持模块内私有，否则返回 `null` 会污染 hooks 列表并导致 `Provider.list`
  访问 `null.provider` 崩溃
- 修改 `install-opencode.sh` 时，确认 `init_opencode.sh` 的调用参数仍匹配
- 子模块有独立 git 仓库，修改后需要在子模块内 commit + push，然后在主仓
  更新子模块引用
- `dag-dispatch-hint.js` 已删除。需要回退时从 git 历史恢复

## 验证方式

```bash
# 先确保子模块已初始化且指向最新 commit
git submodule update --init vendor/opencode-dynamic-workflow

# 子模块测试（在子模块目录下；该仓目前没有 npm test 脚本）
cd vendor/opencode-dynamic-workflow && node --test tests/*.test.mjs

# 主仓回归测试
python3 -m unittest \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_opencode_dag_dispatch_hint_matches_global_concurrency_rules \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_subagent_dispatch_hint_policy_is_four_host_single_source

# init 脚本语法
bash -n init_opencode.sh
```

## R1 + R3 架构变更

### Worktree 生命周期（R1）

`worktree.accumulator: true` — coding 类 workflow 的中间 phase 结果在 worktree 间累加：
每个 phase 的 subagent 在同一 worktree 分支上工作，phase 间通过 git commit 累加变更。
最终 phase 完成后由主 agent 执行 `git merge` 回到主分支，再 `git worktree remove` 清理。
只有最终合并回到主 worktree；中间结果不回主分支。

### 双向通信协议（R3）

workflow 脚本通过 `events/` 目录发出 `[workflow:need_agent]` 事件；
主 agent 在 `commands/` 目录写入 `agent_prompt_<id>.json` 提供 prompt；
workflow 收到 prompt 后创建 subagent。**prompt 由主 agent 控制**，workflow 不自动构造 prompt，
确保每个 subagent 的任务意图与主 agent 的当前上下文一致。

### DAG 编排

多 phase workflow 使用拓扑排序确定 layer 顺序，同 layer 内 agent 可并发执行，
跨 layer 依赖通过 accumulator worktree + IPC result 文件传递中间结果。

## 相关资料

- 实施计划：`docs/superpowers/plans/2026-06-15-opencode-dynamic-workflow.md`
- 回退预案：`docs/knowledge/opencode-dynamic-workflow-rollback.md`
- subagent 派发约定：`docs/knowledge/subagent-dispatch-hook.md`
