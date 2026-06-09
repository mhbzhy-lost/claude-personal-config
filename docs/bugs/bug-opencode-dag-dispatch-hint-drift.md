# Bug: OpenCode DAG 派发提示与全局规则脱节

## 现象

OpenCode 的 `dag-dispatch-hint.js` 会在派发 subagent 前提示必须做 DAG 拓扑分析，
但提示文案只覆盖了并发派发和后台执行的旧摘要，缺少当前
`claude/CLAUDE.md` 中的 coding worktree 隔离、合并后验证、冲突时停止并请求用户决策等约束。

## 根因 (6 要素)

1. **触发条件**：OpenCode 通过 `task` 工具派发 subagent 时触发
   `opencode/plugins/dag-dispatch-hint.js`。
2. **期望链路**：插件提示应对齐 `claude/CLAUDE.md` 的 `## 并发` 与
   `## Subagent` 两节，作为 OpenCode 没有 `SubagentStart` hook 时的等价约束。
3. **实际链路**：插件只提示 DAG 分析、同一并发集合一次性派发、后台执行和
   `skip-dag-hint` 逃生路径。
4. **关键假设失效**：插件文案写死了早期的 `CLAUDE.md §2/§3` 口径，后续全局规则
   增加 worktree 隔离、合并验证、冲突停下等要求时没有同步。
5. **旁证**：`rg` 显示 `dag-dispatch-hint.js` 不包含 `git worktree`、`worktree 合并后必须跑验证`、
   `自动合并失败或语义冲突` 等当前全局规则关键片段。
6. **潜在二次失效点**：若继续靠手写文案同步，没有测试约束时，后续修改
   `claude/CLAUDE.md` 的并发/Subagent 条款仍可能让 OpenCode 提示再次 drift。

## 影响范围

- OpenCode 派发 coding subagent 时可能只满足并发要求，忽略 worktree 隔离。
- 主 agent 可能在 worktree 合并后跳过验证。
- 自动合并失败或语义冲突时，提示没有明确要求停下并请求用户决策。

## 修复原则

- 保留 OpenCode 现有 `task` 派发前拦截机制，不新增不存在的 `SubagentStart` 伪事件。
- 更新 `dag-dispatch-hint.js` 文案，使其覆盖 `claude/CLAUDE.md` 当前并发/Subagent关键条款。
- 增加回归测试，锁住 OpenCode 提示必须包含全局规则关键片段，防止再次 drift。

## 修复记录

- `opencode/plugins/dag-dispatch-hint.js` 已改为引用 `CLAUDE.md ## 并发` 与
  `CLAUDE.md ## Subagent`，不再使用过期的 `§2/§3` 表述。
- 提示文案已补齐 `git worktree 隔离`、`worktree 合并后必须跑验证`、
  `自动合并失败或语义冲突时停止并请求用户决策`、`后台模式` 等关键条款。
- 已新增回归测试：
  `CodexHooksTest.test_opencode_dag_dispatch_hint_matches_global_concurrency_rules`。
- 后续已将该提示抽取为 `shared/policies/subagent-dispatch-hint.json`，OpenCode 改为
  读取共享 policy，避免再次内联 drift。
