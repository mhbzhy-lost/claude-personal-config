# Plan-Runner Session-Bound Child Implementation Plan

> **执行约束：** 所有逻辑变更严格执行 `test-driven-development`；按用户选择使用 Plan-Runner、Subagent-Driven 或 Inline Execution，且只在当前 clean 隔离 worktree 中实施。

**目标：** 将 Plan-Runner DAG executor 从原生 `task` + 工具路径重写迁移为 `client.session.create(query.directory=childWorktree)`，让每个 child session、工具、LSP、MCP 与 plugin runtime 原生绑定其独立 worktree。

**架构：** 新增 Plan-Runner 专用 `dispatch_child` custom tool。Harness 在返回 accepted 前完成 child worktree 创建、session 创建、session index 绑定和 `promptAsync(agent=executor)` 投递；child terminal event 继续驱动 root wake。原生 `task` 不再承担 Plan-Runner DAG 派发，child directory runtime 在后续安全 root 活动边界回收，避免自释放重建。

**技术栈：** OpenCode plugin hooks/custom tools、OpenCode SDK session API、Node.js、Git worktree、`node:test`。

---

### Task 1：记录目录绑定缺口并建立权限契约

**Files:**
- Create: `docs/bugs/bug-plan-runner-child-session-directory-not-bound.md`
- Modify: `userconf/agents/plan-runner.md`
- Modify: `userconf/permission.json`
- Modify: `userconf/plugins/test/init-opencode-agents.test.mjs`

- [ ] **Step 1：写六要素 RCA**

记录现象、影响、复现条件、根因、修复方向、验证：原生 `task` child session 继承 root directory；工具 hook 虽能重写常见路径，但 pathless read、目录级 LSP/MCP/plugin runtime 和 Bash 绝对路径不原生绑定 child worktree。

- [ ] **Step 2：写权限 RED**

在 `init-opencode-agents.test.mjs` 断言：

```js
assert.equal(permissionTemplate.dispatch_child, "deny")
assert.equal(planRunnerPermission.task, "deny")
assert.equal(planRunnerPermission.dispatch_child, "allow")
```

Run:

```bash
node --test --test-name-pattern='plan-runner.*dispatch_child|permission template' userconf/plugins/test/init-opencode-agents.test.mjs
```

Expected: FAIL，当前未声明 `dispatch_child` 且 Plan-Runner 仍允许 `task`。

- [ ] **Step 3：最小更新权限**

在全局模板中默认 deny `dispatch_child`；Plan-Runner agent 改为 `task: deny`、`dispatch_child: allow`。不得开放给 primary agent、executor 或 audit agent。

- [ ] **Step 4：验证 GREEN**

重复 Step 2 命令，Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add docs/bugs/bug-plan-runner-child-session-directory-not-bound.md userconf/agents/plan-runner.md userconf/permission.json userconf/plugins/test/init-opencode-agents.test.mjs
git commit -m "test(plan-runner): 定义目录绑定子会话权限契约"
```

---

### Task 2：用 SDK 创建并绑定 executor child session

**Deps:** Task 1

**Files:**
- Modify: `userconf/plugins/plan-runner-harness.js`
- Modify: `userconf/plugins/test/plan-runner-harness.test.mjs`

- [ ] **Step 1：写 session directory RED**

新增测试调用期望中的 `dispatch_child`：

```js
const result = await hooks.tool.dispatch_child.execute(
  { description: "Implement T1", prompt: "Edit only the assigned child worktree." },
  makeContext({ sessionID: "ses_plan_runner", workspace: runWorktree, agent: "plan-runner" }),
)

assert.equal(createCalls[0].query.directory, child.worktree)
assert.equal(createCalls[0].body.parentID, "ses_plan_runner")
assert.equal(promptCalls[0].query.directory, child.worktree)
assert.equal(promptCalls[0].body.agent, "executor")
assert.equal(result.metadata.dispatch_status, "accepted")
assert.equal(readJson(childIndexPath).role, "child")
```

同时断言 session index 在 `promptAsync` 被调用前已存在，消除 terminal-before-bind 窗口。

- [ ] **Step 2：运行 RED**

```bash
node --test --test-name-pattern='dispatch_child creates an executor session in its assigned worktree|binds child before promptAsync' userconf/plugins/test/plan-runner-harness.test.mjs
```

Expected: FAIL，`dispatch_child` 尚不存在。

- [ ] **Step 3：实现最小 custom tool**

实现参数协议：

```js
dispatch_child: tool({
  description: "Start one harness-managed executor child in a dedicated worktree.",
  args: {
    description: tool.schema.string().min(1),
    prompt: tool.schema.string().min(1),
  },
  execute: (args, context) => dispatchChildTool(args, context, stateDir, { client }),
})
```

`dispatchChildTool` 必须：验证 `context.agent === "plan-runner"`、bound root session、active task；创建 worktree 和 `child_sessions.status=dispatching`；调用 `session.create({ query: { directory: child.worktree }, body: { parentID, title } })`；立即持久化 session ID/index；再调用 `promptAsync({ query: { directory: child.worktree }, body: { agent: "executor", parts } })`；仅 SDK 接受后返回 `accepted/background/sessionId/worktree/branch/base_commit`。

- [ ] **Step 4：处理明确拒绝与投递未知 RED/GREEN**

分别覆盖：`session.create` SDK error、create throw、`promptAsync` SDK error、prompt throw。明确拒绝写 child `failed`；transport throw 写 child `dispatch_delivery.status=unknown`，不得伪造 settled。Root 当前 tool 调用仍收到异常，现场保留。

Run:

```bash
node --test --test-name-pattern='dispatch_child.*(SDK error|delivery unknown)' userconf/plugins/test/plan-runner-harness.test.mjs
```

Expected: PASS。

- [ ] **Step 5：提交**

```bash
git add userconf/plugins/plan-runner-harness.js userconf/plugins/test/plan-runner-harness.test.mjs
git commit -m "feat(plan-runner): 将 executor session 绑定独立 worktree"
```

---

### Task 3：迁移 child terminal、root wake 与 runtime 回收

**Deps:** Task 2

**Files:**
- Modify: `userconf/plugins/plan-runner-harness.js`
- Modify: `userconf/plugins/test/plan-runner-harness.test.mjs`

- [ ] **Step 1：写 native task 禁用 RED**

断言 Plan-Runner root 调用原生 `task` 被拒绝并提示 `dispatch_child`；删除旧 `tool.execute.before/after(task)` 创建、改写和绑定 child 的预期测试。

- [ ] **Step 2：写 child terminal 回流 RED**

覆盖 child directory plugin 收到 `session.idle/error` 后：按 index 更新 child `completed/failed`；最后一个 child settled 后 bounded wake 原 root；重复 terminal 幂等；并行 child 只唤醒一次。

- [ ] **Step 3：写 runtime disposal RED**

Child 不得在自己的 terminal hook 中自释放。Root 被唤醒后的首次安全活动边界必须对 settled child 调用：

```js
client.instance.dispose({ query: { directory: child.worktree } })
```

断言每个 child 最多释放一次，失败保留诊断并有限重试；不得删除 worktree、branch 或 session。Root 在 disposal 完成前尝试 `git worktree remove` 时应得到明确 preflight blocker。

- [ ] **Step 4：实现 terminal 与安全回收**

复用现有 child index/event 归集和 root wake 状态机；删除 `pendingChildTerminals`、`pendingChildDispatchCalls` 及 `bindChildDispatch` 竞态补偿。为每个 child 增加 `runtime_disposal` 诊断；在 root session 的后续 `tool.execute.before` 或等价安全活动边界回收 settled child directory runtime，再允许 root 执行合并和 worktree cleanup。

- [ ] **Step 5：运行 focused GREEN**

```bash
node --test --test-name-pattern='dispatch_child|child session|child runtime|root reawaken|child worktree cleanup' userconf/plugins/test/plan-runner-harness.test.mjs
```

Expected: PASS，无 skipped focused 用例。

- [ ] **Step 6：提交**

```bash
git add userconf/plugins/plan-runner-harness.js userconf/plugins/test/plan-runner-harness.test.mjs
git commit -m "fix(plan-runner): 收敛目录绑定 child 生命周期"
```

---

### Task 4：更新 Plan-Runner 指令与项目知识

**Deps:** Task 3

**Files:**
- Modify: `userconf/agents/plan-runner.md`
- Modify: `docs/knowledge/subagent-dispatch-hook.md`
- Modify: `docs/runbook/plan-runner-smoke.md`

- [ ] **Step 1：更新 agent 工作流**

将 `task(background=true, ...)` 改为：

```text
dispatch_child({ description, prompt })
```

明确 custom tool 返回 accepted 只表示启动成功；root 通过 harness 回流等待 child settled，不主动轮询；child 仍只返回 diff、验证、风险摘要。

- [ ] **Step 2：更新知识文档**

记录 session directory 原生绑定、原生 task TUI 不再适用于 DAG child、child directory runtime 安全释放边界，以及不再需要 before/after task session binding/pending terminal map。

- [ ] **Step 3：更新 smoke runbook**

Smoke 通过标准必须读取 child session 的 directory/query 证据，确认相对 Bash 和文件路径落在 child worktree；确认 origin/root/其他 child worktree无修改；确认 child runtime dispose 后 worktree 可由 root 清理。

- [ ] **Step 4：文档检查**

```bash
git diff --check
```

Expected: 无输出。

- [ ] **Step 5：提交**

```bash
git add userconf/agents/plan-runner.md docs/knowledge/subagent-dispatch-hook.md docs/runbook/plan-runner-smoke.md
git commit -m "docs(plan-runner): 记录目录绑定 child 派发契约"
```

---

### Task 5：完整回归与真实 serve smoke

**Deps:** Task 1, Task 2, Task 3, Task 4

**Files:**
- Modify only if RED identifies a defect: files owned by Tasks 1-4

- [ ] **Step 1：运行默认 harness**

```bash
node --test userconf/plugins/test/plan-runner-harness.test.mjs
```

Expected: 0 failed。

- [ ] **Step 2：运行 slow harness**

```bash
OPENCODE_PLAN_RUNNER_SLOW_TESTS=1 node --test userconf/plugins/test/plan-runner-harness.test.mjs
```

Expected: 0 failed、0 skipped。

- [ ] **Step 3：运行配置与 probe 回归**

```bash
node --test userconf/plugins/test/init-opencode-agents.test.mjs
node --test scripts/test/opencode-subagent-event-probe.test.mjs
git diff --check
```

Expected: 本次契约测试和 probe 全部 PASS；若 init suite 仍仅命中主线已知 GPT-Pro `options.keep` 或缺 skill source，单独记录，不修改本任务范围外配置。

- [ ] **Step 4：运行真实 serve smoke**

在临时 clean repo 启动新 `opencode serve`，从 Plan-Runner root 调用一次 `dispatch_child`。验证 child session 在 OpenCode DB/API 中关联 child worktree directory；相对路径写入只出现在 child worktree；child terminal 后 root 被唤醒；root 安全活动触发 child runtime dispose；root 可合并并删除 child worktree。模型或环境不可用时保留日志并明确 `not_run`，不得用单测冒充 live smoke。

- [ ] **Step 5：最终提交边界**

```bash
git status --short
git log --oneline --decorate -8
```

Expected: worktree clean；所有实现 commit 仅存在于 `work/plan-runner-nonblocking`，未 push，未覆盖 main worktree 残留。

---

## 自审结果

- 需求覆盖：SDK directory 绑定、权限、失败语义、terminal 回流、runtime disposal、文档和真实 smoke 均有对应任务。
- 占位符扫描：没有 `TBD`、模糊“补测试”或不可执行命令。
- 类型一致性：统一使用 `dispatch_child`、`dispatch_status=accepted`、`sessionId`、`runtime_disposal`。
- 范围控制：不修改 OpenCode core，不承诺原生 TaskTool TUI；不清理或覆盖 main worktree 现有残留。
