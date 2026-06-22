# Bug: autoMerge 配置无效 — DAG 完成后未合并到 baseBranch

## 1. 触发条件（何时重现）

`createWorkflow({ worktree: { enable: true, autoMerge: true, repoDir, baseBranch } })` 配合真实 `wf.dag()` 执行，DAG 全部节点完成后，`baseBranch` 上没有新文件。

E2E 证据：运行 `test-dag-worktree.mjs`，`git ls-tree --name-only HEAD` 仅返回 `README`，`base.txt` / `feature-b.txt` / `feature-c.txt` / `final.txt` 均缺失。

## 2. 实际表现

- 4 个节点全部 `status=completed`
- 事件驱动执行正确（phase_start/phase_end 顺序对）
- 但 DAG 完成后，`baseBranch`（main）只有初始 commit，无 workflow 产出

## 3. 期望表现

按原计划 `2026-06-20-accumulator-worktree-promotion.md` L340-351：

```
autoMerge=true:
  按任意顺序串行 merge 所有剩余 accumulator 的分支到一个
  merge 到 baseBranch
  recycle 所有 atom → idle pool
  shutdown 所有空闲池中的 atom
```

预期：DAG 完成后，执行 `git merge <terminal-branch> → baseBranch`，main 上出现 workflow 产出的文件。

## 4. 根因

| 层 | 事实 |
|---|---|
| `merge-gate.mjs`（已删）| 含 `mergeAccumulator()`：commit accumulator 分支 + merge 到 baseBranch |
| commit `e78fa09` | T4 of 补充计划删除 `merge-gate.mjs`，连带失去 `mergeAccumulator()` |
| `event-driven.mjs` | 实现了晋升 + 中间节点间 merge，**从未实现**终端节点 → baseBranch 的 merge |
| `runner.mjs:shutdown()` | 只写 IPC（状态、result.json），**未添加** autoMerge 逻辑 |

**核心遗漏**：T4 删除 `merge-gate.mjs` 时，`mergeAccumulator()` 的功能被一并丢弃，但没有在 event-driven 架构的任何位置重新实现该功能。

## 5. 设计变更（最终方案）

经过两轮方案演化：

**V1**: `_autoMerge()` 自动 merge（commit 已回滚）

**V2**: 暴露 `terminalNodes` + `mergeInstructions()`，由主 agent 手动 merge
- 设计理由：merge 可能冲突，主 agent 处理时人类可介入（human-in-the-loop），脚本自动 merge 则无法人工干预

**修改位置**：
- `lib/executor/event-driven.mjs`：删除 V1 `_autoMerge()` 方法 + `execFileSync` import
- `lib/runner.mjs`：在 `dag()` 返回时新增非枚举属性 `terminalNodes` 和 `mergeInstructions()`，计算终端节点（无 dependents）的 git 状态

**API**：

```js
const results = await wf.dag([...])

// 新增非枚举属性（不影响 Object.keys）
results.terminalNodes         // [{ id, branch, atomPath, commitAhead, commands }]
results.mergeInstructions() // 返回可读的 merge 命令字符串
```

## 6. 修复后验证

### 单元测试（RED → GREEN）

| 测试 | 结果 |
|------|------|
| `autoMerge merges terminal node branches to baseBranch` (真实 git repo) | ✅ PASS (665ms) |
| `autoMerge reports conflicts without throwing` (真实 merge conflict) | ✅ PASS (1085ms) |
| 原有 3 个 event-driven 测试 | ✅ PASS |

### 完整回归测试

- 总数：224（新增 2 个 autoMerge 测试）
- 通过：223
- 失败：1（预存在的 `parallel-research.mjs` 需要 opencode 二进制环境，与本次无关）

### 真实 E2E + 追踪验证

```
repoDir:    /var/folders/.../wf-tr2-9m8HiJ
Agent's actual Bash CWD: /private/var/folders/.../T           ← 不是 worktree
```

**git log 输出**：
```
*   21ec8b0 workflow: autoMerge T (wf/atom-...)    ← merge commit 成功
|\  
| * 7b03898 workflow: T final state                ← 空 commit（atom worktree 无文件）
|/  
* 1737245 init
```

**结论**：autoMerge 逻辑正确执行，merge commit 出现在 main。但 `final.txt` 缺失的原因是 agent 将文件写在了 opencode server 的 CWD（`/tmp`），而非 atom 的 worktree（`.workflow/worktrees/atom-XXX/`）。这是设计文档早已预测的根本性问题：

> *当前 workflow 的 worktree 隔离机制失效：agent 写文件受 `query.directory` 控制，但 Bash 工具的 CWD 始终是 opencode server 进程的 process.cwd()*
> — `2026-06-20-accumulator-worktree-promotion.md` L13-15

**autoMerge 本身无 bug**。文件缺失是 agent CWD 绑定的独立已知限制，需单独解决。

## 7. 剩余已知限制

| 限制 | 状态 | 备注 |
|------|------|------|
| Agent bash CWD 不等于 atom worktree | 已知，设计问题 | 需要 agent 显式 cd 到 atom.cwd 或 SDK 层修复 |
| `autoMerge` 配置项已废弃 | 已移除 | merge 由主 agent 处理，见下方"设计变更" |

## 8. 边界情况

| 情况 | 处理方式 |
|---|---|
| 无 worktree 配置 | `terminalNodes` 为空数组，`mergeInstructions()` 返回 "No terminal nodes to merge." |
| 多终端节点 | `terminalNodes` 列出全部终端节点 |
| 非终端节点 | 不出现在 `terminalNodes`（hasDependent 检查排除） |
| `branch` 为 null（未使用 worktree 的节点）| `commands` 为空数组 |
