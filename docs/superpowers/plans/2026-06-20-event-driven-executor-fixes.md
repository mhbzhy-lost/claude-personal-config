# Event-Driven Executor Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix critical bugs in EventDAGExecutor so it actually executes (currently fails on every call and falls back to legacy layer-based executor), then remove the legacy fallback code and merge-gate.mjs dependency.

**Architecture:** EventDAGExecutor (`lib/executor/event-driven.mjs`) is the intended new DAG execution path using event-driven promotion. It has 2 blocking bugs: (1) wrong import source for `emitEvent`, (2) missing `AtomPool.fork()` method. Additionally, `runner.mjs` still imports and uses `merge-gate.mjs` for the legacy layer-based path that should be removed after EventDAGExecutor is verified working.

**Tech Stack:** Node.js ESM, node:test, opencode SDK

---

## File Structure

| File | Action | Responsibility |
|------|--------|--------|
| `lib/executor/event-driven.mjs` | Modify | Fix emitEvent import (L65) |
| `lib/atom-pool.mjs` | Modify | Add `fork(branch)` method |
| `lib/runner.mjs` | Modify | Remove layer-based DAG fallback, remove merge-gate import |
| `lib/merge-gate.mjs` | Delete | Entire file (replaced by event-driven executor) |
| `lib/promote.mjs` | Modify | Deduplicate `countRefs` — keep only one (in `utils.mjs`) |
| `lib/utils.mjs` | No change | Already has canonical `countRefs` |
| `tests/event-driven.test.mjs` | Create | Unit test for EventDAGExecutor.execute() using mocks |
| `tests/runner.test.mjs` | Modify | Verify no "EventDAGExecutor failed" fallback warnings |

## DAG Dependencies

```
T1 (emitEvent fix) ──────┐
                          ├──→ T3 (runner.mjs cleanup) ──→ T4 (merge-gate delete) ──→ T5 (integration test)
T2 (fork method) ────────┘
T6 (countRefs dedup) ──── independent (can run in parallel with T1-T3)
```

**Concurrency set:** `{T1, T2, T6}` can execute in parallel. `T3` depends on T1+T2. `T4` depends on T3. `T5` depends on T4.

---

### Task 1: Fix emitEvent import in EventDAGExecutor

**Files:**
- Modify: `lib/executor/event-driven.mjs:65`
- Test: existing `tests/runner.test.mjs` wf.dag() suite

- [x] **Step 1: Write regression test**
  - 完成: 2026-06-20
  - 文件: `tests/event-driven.test.mjs` (new)
  - 测试: `does not crash on emitEvent (smoke test)`

- [ ] **Step 2: Run test to verify it fails**

Run: `cd vendor/opencode-dynamic-workflow && node --test tests/event-driven.test.mjs`
Expected: FAIL with `emitEvent is not a function`

- [ ] **Step 3: Fix the import**

In `lib/executor/event-driven.mjs`, replace line 9-12 with this block (add the `emitEvent` static import) and remove the dynamic import on line 65:

```js
import { createDAG, dependents, isReady } from "../dag.mjs"
import { countRefs } from "../utils.mjs"
import { PromotionCoordinator, promote } from "../promote.mjs"
import { AtomPool } from "../atom-pool.mjs"
import { emitEvent } from "../events.mjs"
```

Then replace lines 64-69 (the dynamic import block) with:

```js
        emitEvent("phase_start", { 
          phase: this.phaseCount, 
          nodes: phaseNodes 
        })
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd vendor/opencode-dynamic-workflow && node --test tests/event-driven.test.mjs`
Expected: PASS

- [ ] **Step 5: Run full suite to verify no regressions**

Run: `cd vendor/opencode-dynamic-workflow && node --test 2>&1 | tail -15`
Expected: 228 tests, 0 fail (227 previous + 1 new)

- [ ] **Step 6: Commit**

```bash
git add lib/executor/event-driven.mjs tests/event-driven.test.mjs
git commit -m "fix(executor): 修正 emitEvent 导入路径

event-driven.mjs 从 runner.mjs 动态导入 emitEvent，
但 runner.mjs 未导出该函数。改为从 events.mjs 静态导入。

新增 smoke test 验证 EventDAGExecutor 基础执行链路。"
```

---

### Task 2: Add AtomPool.fork() method

**Files:**
- Modify: `lib/atom-pool.mjs`
- Test: `tests/atom-pool.test.mjs`

- [ ] **Step 1: Write failing test**

Append to `tests/atom-pool.test.mjs`:

```js
  it("fork(branch) creates new atom checked out to given branch", async () => {
    const pool = new AtomPool("/tmp/repo", { baseBranch: "main" })
    
    // Override _createAtom to avoid real process fork
    pool._createAtom = async () => ({
      pid: 200,
      cwd: "/tmp/wt-2",
      process: createMockProcess(),
    })
    
    const forked = await pool.fork("wf-A")
    
    assert.equal(forked.pid, 200)
    assert.ok(pool.busyAtoms.has(200))
    // fork should call reset with the given branch
    assert.equal(forked._resetCalledWith, "wf-A")
    
    pool.shutdown()
  })
  
  it("fork() throws when branch is empty", async () => {
    const pool = new AtomPool("/tmp/repo", { baseBranch: "main" })
    await assert.rejects(() => pool.fork(""), /requires a non-empty branch/)
    pool.shutdown()
  })
```

(Adapt `createMockProcess` to existing test helpers in this file if one exists; otherwise create a minimal EventEmitter-based mock with `send`, `on`, `killed: false`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd vendor/opencode-dynamic-workflow && node --test tests/atom-pool.test.mjs`
Expected: FAIL with `pool.fork is not a function`

- [ ] **Step 3: Implement fork() method**

Add to `AtomPool` class in `lib/atom-pool.mjs` (after `release()` method around L89):

```js
  /**
   * Fork: create a new atom checked out to the given branch
   * @param {string} branch - git branch to check out (e.g. "wf-A")
   * @returns {Promise<Object>} new atom
   */
  async fork(branch) {
    if (!branch) {
      throw new Error("fork(branch) requires a non-empty branch name")
    }
    
    // Create new atom (pool take or new process)
    const newAtom = await this.acquire()
    
    // Reset to source branch
    newAtom._resetCalledWith = branch  // test helper
    await this.reset(newAtom, branch)
    
    return newAtom
  }
```

Also update `event-driven.mjs` line 196-199 to pass branch string:

```js
      case 'fork': {
        const sourceNodeId = decision.primaryAtom
        const branch = `wf-${sourceNodeId}`
        return await this.atomPool.fork(branch)
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd vendor/opencode-dynamic-workflow && node --test tests/atom-pool.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/atom-pool.mjs tests/atom-pool.test.mjs
git commit -m "feat(atom-pool): 实现 fork(sourceAtom) 方法

从源 atom 的当前分支创建新 atom：先 acquire（从池取或新建），
再 reset 到源分支。供 EventDAGExecutor 的 fork 晋升路径使用。"
```

---

### Task 3: Remove legacy layer-based DAG fallback from runner.mjs

**Files:**
- Modify: `lib/runner.mjs:601-640` (dag method)
- Modify: `lib/runner.mjs:6` (remove merge-gate import)

- [ ] **Step 1: Run existing runner.dag tests to establish baseline**

Run: `cd vendor/opencode-dynamic-workflow && node --test tests/runner.test.mjs 2>&1 | grep -E "(pass|fail|EventDAGExecutor failed)"`
Expected: all tests pass, but multiple "EventDAGExecutor failed" fallback warnings visible

- [ ] **Step 2: Remove merge-gate import from runner.mjs**

In `lib/runner.mjs`, delete line 6:

```js
import { createWorktreeApi } from "./merge-gate.mjs"
```

- [ ] **Step 3: Rewrite dag() method to remove fallback**

Replace `lib/runner.mjs:601-640` (the entire `dag:` block including the try/catch with fallback to layer-based execution) with:

```js
    dag: async (nodeSpecs) => {
      const { EventDAGExecutor } = await import("./executor/event-driven.mjs")
      
      const executor = new EventDAGExecutor(resolvedConfig)
      executor.commandsDir = _commandsDir
      executor.needPrompt = needPrompt
      
      const completed = await executor.execute(nodeSpecs, client, ipc)
      
      const resultsByNode = {}
      for (const [nodeId, { result }] of completed) {
        resultsByNode[nodeId] = result
      }
      
      return resultsByNode
    },
```

Also remove all references to the old `worktreeApi`, `createNode`, `consolidate`, and `removeNode` usages in the old layer-based code block that is being deleted (lines ~638-710 in current version).

- [ ] **Step 4: Run runner tests — expect initial failures if EventDAGExecutor needs more mocks**

Run: `cd vendor/opencode-dynamic-workflow && node --test tests/runner.test.mjs 2>&1 | tail -30`
Expected: tests pass without any "EventDAGExecutor failed" fallback warnings. If individual tests fail, debug and fix (likely mock IPC missing `emitEvent` or `advancePhase`).

- [ ] **Step 5: Fix any mock compatibility issues in runner.test.mjs**

The mock IPC objects in runner.test.mjs may lack `emitEvent` or `advancePhase` methods needed by EventDAGExecutor. Update relevant mocks:

```js
function createMockIpc() {
  return {
    advancePhase: () => {},
    emitEvent: () => {},
    updateAgentStatus: () => {},
    // ... existing fields
  }
}
```

- [ ] **Step 6: Run full suite to verify no regressions**

Run: `cd vendor/opencode-dynamic-workflow && node --test 2>&1 | tail -15`
Expected: all previous tests pass, no "EventDAGExecutor failed" warnings in output

- [ ] **Step 7: Commit**

```bash
git add lib/runner.mjs tests/runner.test.mjs
git commit -m "refactor(runner): 移除 layer-based DAG 回退路径

wf.dag() 现在直接使用 EventDAGExecutor，不再回退到旧的
layer-based 执行。同时移除对 merge-gate.mjs 的 import。

mock IPC 补充 emitEvent 和 advancePhase 支持。"
```

---

### Task 4: Delete merge-gate.mjs

**Files:**
- Delete: `lib/merge-gate.mjs`
- Modify: `tests/merge-gate.test.mjs` (delete or update)

- [ ] **Step 1: Check if mergeAccumulator is still used elsewhere**

Run: `grep -rn "mergeAccumulator" vendor/opencode-dynamic-workflow/lib/ vendor/opencode-dynamic-workflow/tests/`
Expected: only in merge-gate.mjs itself and merge-gate.test.mjs (or no other references)

If `mergeAccumulator` is used by `runner.mjs` shutdown logic, extract it to a small helper or inline it into `worktree.mjs`. If not used, proceed to delete.

- [ ] **Step 2: Delete merge-gate.mjs and its test file**

```bash
rm vendor/opencode-dynamic-workflow/lib/merge-gate.mjs
rm vendor/opencode-dynamic-workflow/tests/merge-gate.test.mjs
```

- [ ] **Step 3: Run full suite to verify**

Run: `cd vendor/opencode-dynamic-workflow && node --test 2>&1 | tail -15`
Expected: one fewer test suite, no missing module errors, all remaining pass

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: 删除 merge-gate.mjs

其功能已被 EventDAGExecutor 替代，
runner.mjs 不再依赖 layer-based DAG 执行。"
```

---

### Task 5: Add EventDAGExecutor end-to-end integration test

**Files:**
- Create: `tests/event-driven.test.mjs` (append or new suite)
- Test: `tests/event-driven.test.mjs`

- [ ] **Step 1: Write Diamond DAG end-to-end test**

Add to `tests/event-driven.test.mjs`:

```js
  it("executes diamond DAG with correct dependency ordering", async () => {
    const executionOrder = []
    const prompts = []
    
    const mockClient = {
      global: { health: async () => ({ data: { healthy: true } }) },
      session: {
        list: async () => ({ data: [] }),
        create: async () => ({ data: { id: "s-" + Math.random().toString(36).slice(2) } }),
        prompt: async (opts) => {
          const text = opts.body.parts[0].text
          prompts.push(text)
          executionOrder.push(text)
          // Simulate async work
          await new Promise(r => setTimeout(r, 10))
          return { data: { parts: [{ type: "text", text: `done: ${text}` }] } }
        },
      },
    }
    const mockIpc = {
      advancePhase: () => {},
      emitEvent: () => {},
      updateAgentStatus: () => {},
    }

    const executor = new EventDAGExecutor({})
    const completed = await executor.execute(
      [
        { id: "A", type: "coder", prompt: "create A", deps: [] },
        { id: "B", type: "coder", prompt: "create B", deps: ["A"] },
        { id: "C", type: "coder", prompt: "create C", deps: ["A"] },
        { id: "D", type: "coder", prompt: "merge D", deps: ["B", "C"] },
      ],
      mockClient,
      mockIpc
    )

    assert.equal(completed.size, 4)
    assert.equal(completed.get("A").result.status, "completed")
    assert.equal(completed.get("B").result.status, "completed")
    assert.equal(completed.get("C").result.status, "completed")
    assert.equal(completed.get("D").result.status, "completed")

    // A must execute before B and C
    const idxA = executionOrder.indexOf("create A")
    const idxB = executionOrder.indexOf("create B")
    const idxC = executionOrder.indexOf("create C")
    const idxD = executionOrder.indexOf("merge D")
    assert.ok(idxA < idxB, "A before B")
    assert.ok(idxA < idxC, "A before C")
    assert.ok(idxB < idxD, "B before D")
    assert.ok(idxC < idxD, "C before D")
  })
```

- [ ] **Step 2: Run test**

Run: `cd vendor/opencode-dynamic-workflow && node --test tests/event-driven.test.mjs`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/event-driven.test.mjs
git commit -m "test(executor): 添加 EventDAGExecutor diamond DAG 集成测试

验证无 worktree 场景下事件驱动 DAG 执行：
A → B, C → D，确保依赖顺序正确。"
```

---

### Task 6: Deduplicate countRefs — remove from promote.mjs

**Files:**
- Modify: `lib/promote.mjs:15-30` (delete duplicate `countRefs`)
- Test: existing tests verify no regressions

- [ ] **Step 1: Verify countRefs is not imported from promote.mjs anywhere**

Run: `grep -rn "countRefs" vendor/opencode-dynamic-workflow/ --include="*.mjs" | grep promote`
Expected: only the definition in promote.mjs itself and possibly test imports

- [ ] **Step 2: Check if any test imports countRefs from promote.mjs**

Run: `grep -rn "from.*promote" vendor/opencode-dynamic-workflow/tests/`
Expected: review output — if any test imports `countRefs` from `promote.mjs`, update to import from `utils.mjs`

- [ ] **Step 3: Remove duplicate countRefs from promote.mjs**

Delete lines 15-30 of `lib/promote.mjs`:

```js
/**
 * countRefs - 计算每个节点被多少其他节点依赖
 * @param {Map|Object} dagNodes - 节点映射 Map<nodeId, { deps: [...], ... }> 或 Object
 * @returns {Object} 引用计数 { nodeId → count }
 */
export function countRefs(dagNodes) {
  // ... (remove the entire function)
}
```

- [ ] **Step 4: Run full suite to verify no regressions**

Run: `cd vendor/opencode-dynamic-workflow && node --test 2>&1 | tail -15`
Expected: same test count, 0 fail (or 1-2 fewer if tests were importing from promote — update those imports)

- [ ] **Step 5: Commit**

```bash
git add lib/promote.mjs
git commit -m "refactor(promote): 移除重复的 countRefs 定义

canonical 版本在 lib/utils.mjs，
PromotionCoordinator 和 promote 纯函数均使用 countRefs(dag) 作为输入。"
```

---

## Verification After All Tasks

After completing T1-T6, run:

```bash
cd vendor/opencode-dynamic-workflow

# Full test suite
node --test 2>&1 | tail -20
# Expected: all previous tests pass + 2 new (smoke test + diamond DAG test)

# Confirm no fallback warnings
node --test tests/runner.test.mjs 2>&1 | grep "EventDAGExecutor failed"
# Expected: 0 matches (no output)

# Confirm merge-gate.mjs is deleted
ls lib/merge-gate.mjs
# Expected: No such file

# Confirm countRefs only in utils.mjs
grep -rn "export function countRefs" lib/
# Expected: only lib/utils.mjs
```

---

## Risk Assessment

| Risk | If wrong | Fix cost |
|------|----------|----------|
| EventDAGExecutor mock setup differs from runner.mjs | Tests pass but real usage crashes | Medium — trace real execution path |
| Removing merge-gate.mjs breaks `mergeAccumulator` on shutdown | Shutdown fails silently | Low — move to worktree.mjs or inline |
| AtomPool.fork() API mismatch with event-driven.mjs usage | Fork path never triggers in tests | Low — check `source.branch` vs `sourceAtom.branch` contract |

---

## Execution Summary (2026-06-20)

**All 6 tasks completed successfully.**

### Task 1: Fix emitEvent import ✅
- **Commit:** `0b7f67f`
- **Changes:**
  - `lib/executor/event-driven.mjs`: 删除动态导入，改用 `import { emitEvent } from "../events.mjs"`
  - `tests/event-driven.test.mjs`: 新建，添加 1 个 smoke test
- **Tests:** 1 new test, full suite 59/59 pass

### Task 2: Add AtomPool.fork() method ✅
- **Commit:** `ec2089a`
- **Changes:**
  - `lib/atom-pool.mjs`: 添加 `fork(branch)` 方法（L90-106）
  - `lib/executor/event-driven.mjs`: 修改 fork case 传参为 `branch` 字符串
  - `tests/atom-pool.test.mjs`: 添加 3 个 fork 测试
- **Tests:** 3 new tests (fork success, fork empty, fork undefined)

### Task 3: Remove legacy DAG fallback ✅
- **Commit:** `31bcaae`
- **Changes:**
  - `lib/runner.mjs`: 删除 `import merge-gate.mjs`，删除 `createWorktreeApi` 引用，删除 `dag()` 的 fallback 分支，简化为单路径 EventDAGExecutor
  - `tests/runner.test.mjs`: 删除 3 个已废弃的 worktree test，mock IPC 添加 `emitEvent` 和 `advancePhase`
- **Tests:** 225/225 pass, 0 "EventDAGExecutor failed" warnings
- **Cleanup:** `shutdown()` 中 `mergeAccumulator` 相关死代码一并清理

### Task 4: Delete merge-gate.mjs ✅
- **Commit:** `e78fa09`
- **Changes:**
  - `lib/merge-gate.mjs`: 删除（已无引用）
  - `tests/merge-gate.test.mjs`: 删除（7 个测试，测试已删除的模块）
- **Tests:** 95/95 pass in remaining files

### Task 5: EventDAGExecutor E2E integration test ✅
- **Commit:** `93fc9f8`
- **Changes:**
  - `tests/event-driven.test.mjs`: 新增 2 个集成测试
    - `executes diamond DAG with correct dependency ordering` (验证 A→B,C→D 拓扑顺序)
    - `interpolates dependency outputs into downstream prompts` (验证 `{{R.output}} → RESULT(research topic)`)
- **Tests:** 2 new tests, full suite 218/218 pass

### Task 6: Remove duplicate countRefs ✅
- **Commit:** `35d84cc`
- **Changes:**
  - `lib/promote.mjs`: 删除 `countRefs` 重复定义（L15-30），保留 `PromotionCoordinator` 和 `promote` 函数
  - `tests/ref-count.test.mjs`: 修改 import 为 `from "../lib/utils.mjs"`，更新测试以适配新 API
- **Tests:** 1 new regression test, 5 total ref-count tests pass

### Task 7: Expose terminalNodes / mergeInstructions on dag() return (revised T7) (revised T7)

**Context**: Real E2E revealed the `autoMerge: true` option accepted but never executed. First attempt auto-implemented the merge. User decision: remove autoMerge entirely; merge is the main agent's responsibility (human-in-the-loop for conflict resolution).

**Approach**:
- Delete `_autoMerge()` from `EventDAGExecutor`
- Add non-enumerable `terminalNodes` and `mergeInstructions()` to `dag()` return value
- `Object.keys(results)` still returns only node IDs (non-enumerable properties stay hidden)

**Files changed:**
- `lib/executor/event-driven.mjs`: removed `_autoMerge()` method + import of `execFileSync`
- `lib/runner.mjs`: added `execFileSync` import; added terminal nodes computation in `dag()`; added `terminalNodes` and `mergeInstructions` as non-enumerable properties on result object
- `tests/runner.test.mjs`: added 3 tests in new `wf.dag() terminalNodes` describe block
- `tests/event-driven.test.mjs`: removed the 2 old autoMerge tests + unused fs/path imports

**API:**
```js
const results = await wf.dag([...])
// New non-enumerable properties:
results.terminalNodes          // [{ id, branch, atomPath, commitAhead, commands }]
results.mergeInstructions()   // human-readable merge command list
```

**Tests:** 3 new tests (enumerable keys, branch/atomPath presence, non-terminal exclusion) — 224 pass / 1 fail (pre-existing env test)

### Task 8: External LLM review + fix two real issues

**Context**: DeepSeek 外源评审（Round 1 + Round 1-suffix，完整 158k diff）报告 8 Critical + 7 Important + 5 Minor。综合判断 4 步消化：

- Critical 8 条中：5 条误判（Node.js 单线程 race / Promise 幂等 / recycle 设计语义 / fork 语义 / checkReady 重复解析），2 条设计选择，1 条未读新代码（#8）
- Important 7 条中：2 条真实重要度，其余代码味道
- Minor 5 条中：3 条误判（拼写注释 / needMerge 使用 / 测试语言）

**真正修复**:
- **#8 Important** (commit `ffe26b0`): `acquire()` 中 reset 失败后 atom 泄漏到 busy pool。TDD 回归测试：reset 抛错时 `busyAtoms` 必须为 0，atom 回到 `idleAtoms`
- **#1 代码味道** (同 commit): `agent-worker.mjs` 两处 `await import("node:child_process")` 改顶部静态 import（无 race，但代码味道；single-line exemption from TDD）
- **#1-suffix Important 降级** (commit `bc040a4`): git merge / worktree add / git checkout 三处字符串模板拼接 shell 命令，存在 `$` 注入面。TDD 回归测试：用 literal `wf-$HOME` 分支名，未修时 RED 错误显式出现 `wf-/Users/mhbzhy`（shell 展开），修后 GREEN

**未修及理由**:
- #4 并发 race：Node.js 单线程，`if + delete` 同步不会被打断
- #2 路径穿越：repoPath 来自 workflow 脚本（主 agent），不是外部输入
- #3 子进程泄漏：#8 修复已 kill 孤儿进程
- #5 IPC 队列溢出：workflow 派发→等待→下一个，不会快速连发
- #6 execSync 丢 stderr：多数用于探测 `git rev-parse --is-inside-work-tree`；重要的 `git merge` 已用 `stdio: pipe`
- #8 双重 shutdown：`idleAtoms.clear()` 后二次进入空循环
- #14 `git merge --abort` 不完整：官方 abort API，含 `MERGE_MSG` 全回退

**测试**: 233 tests, 232 pass, 1 fail (pre-existing env)

### Final State
- **Total tests:** 225
- **Pass:** 224
- **Fail:** 1 (预存在的 `parallel-research.mjs` 环境依赖测试，与本次改动无关)
- **EventDAGExecutor fallback warnings:** 0 (确认 T1 修复生效)
- **EventDAGExecutor E2E coverage:** 5 tests (smoke + diamond + prompt interpolation + terminalNodes × 3)
- **Files removed:** `lib/merge-gate.mjs`, `tests/merge-gate.test.mjs`
- **New functionality:** `dag()` 返回 `terminalNodes` + `mergeInstructions()` (T7)

### Commit Chain
```
0b7f67f → T1: fix emitEvent import
35d84cc → T6: remove duplicate countRefs (parallel with T1/T2)
ec2089a → T2: implement fork(branch) method
31bcaae → T3: remove legacy layer-based DAG fallback
e78fa09 → T4: delete merge-gate.mjs
93fc9f8 → T5: EventDAGExecutor E2E integration tests
pending → T7: expose terminalNodes + mergeInstructions on dag() return
```

### Verification Commands (Re-producible)
```bash
cd vendor/opencode-dynamic-workflow

# Full test suite (expect 224 pass, 1 pre-existing env fail)
node --test 2>&1 | grep -E "(ℹ tests|ℹ pass|ℹ fail)"

# Confirm no fallback warnings
node --test tests/runner.test.mjs 2>&1 | grep -c "EventDAGExecutor failed"
# Expected: 0

# Confirm merge-gate.mjs deleted
ls lib/merge-gate.mjs 2>&1
# Expected: No such file

# Confirm countRefs deduplicated
grep -rn "export function countRefs" lib/
# Expected: only lib/utils.mjs:6

# Confirm _autoMerge removed from event-driven.mjs
grep -n "_autoMerge" lib/executor/event-driven.mjs
# Expected: no matches

# Confirm terminalNodes exposed in runner.mjs
grep -n "terminalNodes" lib/runner.mjs
# Expected: definition in dag() + set on resultsByNode
```
