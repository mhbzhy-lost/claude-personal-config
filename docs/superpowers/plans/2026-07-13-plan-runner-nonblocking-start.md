# Plan-Runner 非阻塞启动实现计划

> **For agentic workers:** 按 TDD 逐项执行本计划，优先使用 Plan-Runner；每完成一项立即更新 checkbox。执行前必须确保当前 runtime disposal 修复已作为独立 commit 进入 `HEAD`，否则 dedicated worktree 不会包含该基线。

**目标：** `start_plan_runner` 在后台会话接受派发后立即返回任务启动报告，不阻塞主 agent；Plan-Runner 的 `validated`、`blocked`、`interrupted` 终态通过事件异步回流，并可按 task id 查询。

**架构：** 启动路径改用 legacy SDK `session.promptAsync()`，只等待 HTTP 204 接受结果。Plan-Runner root session 的 message/idle/error 事件负责终态归集，统一 terminal notification 负责唤醒父 session；独立 parent-run registry 支持同一父 session 并发多个 run。Runtime disposal 要求 root terminal barrier 已记录且终态通知已完成，再由后续 parent idle 回收 run directory instance。

**技术栈：** OpenCode PluginInput legacy SDK、Node.js `node:test`、Plan-Runner task-state/event/session index、Git worktree。

---

## 文件结构

- Create: `docs/bugs/bug-plan-runner-async-start-terminal-backflow.md`
  - 记录同步启动阻塞主 agent，以及直接改 `promptAsync` 会丢失终态回流的六要素根因。
- Modify: `userconf/plugins/plan-runner-harness.js`
  - 非阻塞派发、root 终态归集、terminal notification、状态查询、parent-run registry 和 disposal barrier。
- Modify: `userconf/plugins/test/plan-runner-harness.test.mjs`
  - 覆盖 204 接受、异步终态、并发 run、查询权限和回收时序。
- Modify: `userconf/permission.json`
  - 默认拒绝 `get_plan_runner_status`。
- Modify: `userconf/agents.json`
  - 仅 primary agents 允许 `get_plan_runner_status`。
- Modify: `userconf/plugins/test/init-opencode-agents.test.mjs`
  - 校验状态工具权限和 dispatch skill 契约。
- Modify: `userconf/skills/plan-runner-dispatch/SKILL.md`
  - 说明启动工具立即返回、等待终态通知、状态查询只用于人工诊断而非轮询。
- Modify: `scripts/opencode-subagent-event-probe.mjs`
  - 增加 create session 后使用 `promptAsync` 的真实事件探针。
- Modify: `scripts/test/opencode-subagent-event-probe.test.mjs`
  - 覆盖 promptAsync 204、message/idle/error 收集。
- Modify: `docs/knowledge/subagent-dispatch-hook.md`
  - 更新异步启动、终态回流、多 run 和 runtime disposal 契约。
- Modify: `docs/runbook/plan-runner-smoke.md`
  - 增加非阻塞 serve smoke。
- Modify: `docs/knowledge/plan-runner-tui-streaming.md`
  - 说明 custom tool metadata 尚不提供原生 task 的可点击 TUI 导航。

---

### Task 1：记录根因并建立非阻塞启动 RED

**Files:**
- Create: `docs/bugs/bug-plan-runner-async-start-terminal-backflow.md`
- Modify: `userconf/plugins/test/plan-runner-harness.test.mjs`

- [ ] **Step 1：写六要素根因文档**

文档必须明确：同步 `session.prompt()` 同时承担等待完成、读取 final text、保证 parent idle 晚于 child 尾部事件三项职责；`promptAsync()` 的 204 只表示接受，不包含执行结果。

- [ ] **Step 2：写派发接受 RED**

增加测试，使用可控 Promise 模拟 204：

```js
it("start_plan_runner returns after promptAsync acceptance without waiting for root idle", async () => {
  let acceptDispatch
  const accepted = new Promise((resolve) => { acceptDispatch = resolve })
  const hooks = await PlanRunnerHarnessPlugin({
    directory: workspace,
    client: {
      session: {
        create: async () => ({ data: { id: "ses_plan_runner" } }),
        promptAsync: async () => accepted,
      },
    },
  }, { stateDir })

  let settled = false
  const running = hooks.tool.start_plan_runner.execute(
    { prompt: "Implement isolated work." },
    makeContext({ sessionID: "ses_parent", workspace }),
  ).then((result) => { settled = true; return result })

  await Promise.resolve()
  assert.equal(settled, false)
  acceptDispatch({ data: undefined })
  const result = await running
  assert.equal(result.metadata.dispatch_status, "accepted")
  assert.equal(result.metadata.background, true)
  assert.equal(result.metadata.sessionId, "ses_plan_runner")
  assert.equal(result.metadata.status, "planning_required")
})
```

- [ ] **Step 3：验证 RED**

Run:

```bash
node --test userconf/plugins/test/plan-runner-harness.test.mjs --test-name-pattern='returns after promptAsync acceptance'
```

Expected: FAIL，当前实现要求 `session.prompt`，或不会返回 `dispatch_status/background/sessionId`。

---

### Task 2：实现 promptAsync 派发和启动报告

**Files:**
- Modify: `userconf/plugins/plan-runner-harness.js`
- Test: `userconf/plugins/test/plan-runner-harness.test.mjs`

- [ ] **Step 1：将启动依赖改为 promptAsync**

`startPlanRunnerTool()` 仅接受 `client.session.promptAsync`；保持 state、worktree、session index 全部持久化后再派发：

```js
if (!client?.session?.create || !client?.session?.promptAsync) {
  throw new Error("start_plan_runner requires client.session.create and client.session.promptAsync")
}

const dispatched = await client.session.promptAsync({
  path: { id: planRunnerSessionID },
  query: { directory: run.worktree },
  body: {
    agent: "plan-runner",
    parts: [{ type: "text", text: ensurePlanRunnerStartPrompt(prompt, nextState) }],
  },
})
throwIfSdkError(dispatched, "plan-runner async prompt dispatch failed")
```

- [ ] **Step 2：持久化接受事件并立即返回**

写入：

```js
await appendEvent(stateDir, taskID, {
  type: "plan_runner_dispatch_accepted",
  session_id: planRunnerSessionID,
  tool: "start_plan_runner",
})
```

返回 metadata：

```js
{
  task_id: taskID,
  status: "planning_required",
  dispatch_status: "accepted",
  session_id: planRunnerSessionID,
  sessionId: planRunnerSessionID,
  parentSessionId: parentSessionID,
  background: true,
  origin_worktree: originWorktree,
  worktree: run.worktree,
  branch: run.branch,
  base_commit: run.base_commit,
}
```

output 必须明确“已后台派发，终态将异步通知，不要主动轮询”。删除启动函数中基于同步 prompt response 的 blocked/empty 解析。

- [ ] **Step 3：覆盖派发错误**

增加 `promptAsync` 返回 `{ error }` 的测试，断言工具抛错、不得写 `plan_runner_dispatch_accepted`，也不得返回 started 报告。

- [ ] **Step 4：验证 GREEN**

Run:

```bash
node --test userconf/plugins/test/plan-runner-harness.test.mjs --test-name-pattern='promptAsync acceptance|async prompt dispatch failed|dedicated run worktree'
```

Expected: PASS。

---

### Task 3：归集 root session 的 blocked、empty 和 interrupted 终态

**Files:**
- Modify: `userconf/plugins/plan-runner-harness.js`
- Test: `userconf/plugins/test/plan-runner-harness.test.mjs`

- [ ] **Step 1：写 root terminal collector RED**

覆盖：

```text
Change Request final + root idle -> blocked / plan_runner_stopped_before_finish_plan
assistant message 存在但无 text parts + root idle -> blocked / plan_runner_empty_response
session.error -> interrupted，并保存错误
validated root idle -> 只记录 terminal barrier，不覆盖 validated
普通 plan-runner idle 且 watchdog 仍可恢复 -> 不提前 blocked
```

mock `client.session.messages()` 必须返回 SDK 形状的 `{ data: [{ info, parts }] }`，不要依赖增量 part 顺序。

- [ ] **Step 2：实现 root terminal message 读取**

新增 helper：

```js
async function readPlanRunnerFinalMessage(client, state) {
  const result = await client.session.messages({
    path: { id: state.plan_runner_session_id },
    query: { directory: state.worktree, limit: 20 },
  })
  throwIfSdkError(result, "plan-runner final message read failed")
  const messages = Array.isArray(result?.data) ? result.data : []
  return [...messages].reverse().find((item) => item?.info?.role === "assistant") || null
}
```

- [ ] **Step 3：实现 root idle/error 归集**

root `session.idle` handler 通过 session index 的 `role === "plan-runner"` 定位 state：

```js
state.plan_runner_terminal_idle_at = Date.now()
```

若已有 terminal status，只记录 barrier；否则读取最后 assistant message并沿用现有 `extractTextFromMessageInfo/Part`：Change Request 或提前停止文本写 blocked；真实空 parts 写 empty-response blocker。`session.error` 写 `plan_runner_error`、`status = interrupted` 和 `plan_runner_terminal_error_at`，不得误报 validated。

- [ ] **Step 4：保持 bounded watchdog**

当 tasks 已完成且 watchdog 尚可 nudge 时，root idle collector 不写 blocked，由现有 watchdog 恢复；watchdog 用尽后的下一次 idle 才归集提前停止结果。

- [ ] **Step 5：验证 GREEN**

Run:

```bash
node --test userconf/plugins/test/plan-runner-harness.test.mjs --test-name-pattern='root terminal|empty response|session error|watchdog'
```

Expected: PASS。

---

### Task 4：统一三种终态通知并增加状态查询

**Files:**
- Modify: `userconf/plugins/plan-runner-harness.js`
- Modify: `userconf/permission.json`
- Modify: `userconf/agents.json`
- Modify: `userconf/plugins/test/plan-runner-harness.test.mjs`
- Modify: `userconf/plugins/test/init-opencode-agents.test.mjs`

- [ ] **Step 1：写 terminal notification RED**

覆盖 validated 继续发送 `merge_back`，blocked/interrupted 发送 `terminal_result`；通知失败只写 `parent_notification.status=failed`，不改变终态。

- [ ] **Step 2：泛化通知状态**

保留 validated 的 merge-back 正文。blocked/interrupted 写：

```js
{
  type: "terminal_result",
  status: "sending",
  result_status: state.status,
  session_id: state.parent_session_id,
  task_id: state.task_id,
  code: state.blocker?.code || state.plan_runner_error?.code || null,
  final_text: state.blocker?.final_text || null,
  worktree: state.worktree,
  branch: state.branch,
  started_at: Date.now(),
}
```

通知仍使用 origin directory 的 `client.session.promptAsync()`；只有 root terminal barrier 已记录后才能发送。

- [ ] **Step 3：写状态查询 RED**

新增测试：绑定 parent 可查询自己的 task；其他 parent、非法 task id、缺失 task 必须拒绝。

- [ ] **Step 4：实现 `get_plan_runner_status`**

参数：

```js
args: { task_id: tool.schema.string().min(1) }
```

只允许 `safeId(args.task_id) === args.task_id` 且 `state.parent_session_id === context.sessionID`。返回 task/status/session/worktree/branch/base、active task、任务计数、completion gate、blocker、parent notification、runtime disposal 和 updated time；不得返回任意文件内容。

- [ ] **Step 5：配置权限**

在 `userconf/permission.json` 默认 deny `get_plan_runner_status`；在 `userconf/agents.json` 的 primary agents 中 allow。更新 `init-opencode-agents.test.mjs` 精确断言。

- [ ] **Step 6：验证 GREEN**

Run:

```bash
node --test userconf/plugins/test/plan-runner-harness.test.mjs --test-name-pattern='terminal notification|get_plan_runner_status'
node --test userconf/plugins/test/init-opencode-agents.test.mjs
```

Expected: PASS。

---

### Task 5：支持同一父 session 多 run，并收紧 disposal barrier

**Files:**
- Modify: `userconf/plugins/plan-runner-harness.js`
- Test: `userconf/plugins/test/plan-runner-harness.test.mjs`

- [ ] **Step 1：写并发 run RED**

同一 `ses_parent` 连续启动两个异步 run，断言两者可分别终态通知、状态查询和 dispose，不因 `sessions/<parent>.json` 的单 task id 覆盖而丢失旧 run。

- [ ] **Step 2：新增 parent-run registry**

不要改变既有 session role index；新增：

```text
task-state/parents/<safe-parent-session-id>.json
{
  "session_id": "ses_parent",
  "task_ids": ["planrun-...", "planrun-..."],
  "updated_at": 0
}
```

以 atomic write 追加去重。parent idle 遍历该 registry 中全部 task id；已 disposed 的 run 由现有幂等条件快速跳过。

- [ ] **Step 3：写 disposal barrier RED**

覆盖：child 运行期间 parent 提前 idle 不释放；terminal state 已写但 root barrier/通知未完成不释放；root terminal barrier 后发送通知，通知唤醒的 parent 再 idle 时恰好释放一次；失败最多重试两次。

- [ ] **Step 4：实现 barrier**

`shouldDisposeRunRuntime()` 除现有条件外必须要求：

```js
const rootTerminal = state.plan_runner_terminal_idle_at || state.plan_runner_terminal_error_at
const notificationDone = ["sent", "failed"].includes(state.parent_notification?.status)
```

只有 `rootTerminal && notificationDone` 才允许 parent idle dispose。不得使用 timer、PID 扫描或 fire-and-forget。

- [ ] **Step 5：验证 GREEN**

Run:

```bash
node --test userconf/plugins/test/plan-runner-harness.test.mjs --test-name-pattern='multiple async runs|terminal barrier|runtime disposal'
```

Expected: PASS。

---

### Task 6：更新 dispatch 契约、探针和真实 smoke

**Files:**
- Modify: `userconf/skills/plan-runner-dispatch/SKILL.md`
- Modify: `scripts/opencode-subagent-event-probe.mjs`
- Modify: `scripts/test/opencode-subagent-event-probe.test.mjs`
- Modify: `docs/knowledge/subagent-dispatch-hook.md`
- Modify: `docs/runbook/plan-runner-smoke.md`
- Modify: `docs/knowledge/plan-runner-tui-streaming.md`

- [ ] **Step 1：更新 skill 契约**

明确：`start_plan_runner` 返回 `dispatch_status=accepted` 后主 agent 可继续工作；等待终态异步通知；`get_plan_runner_status` 仅用于通知失败或人工诊断，不主动轮询。

- [ ] **Step 2：扩展真实事件探针**

探针按以下顺序执行并记录时间：create 新 session、promptAsync 204、message/part、root idle 或 error。输出必须能证明 204 早于 root terminal event。

- [ ] **Step 3：更新文档**

记录：custom tool metadata 虽包含 `sessionId`，当前 GenericTool TUI 不提供原生 task 的可点击子会话导航；不因此修改 `/Users/leshi.zhy/opencode`。

- [ ] **Step 4：运行完整回归**

Run:

```bash
node --test userconf/plugins/test/plan-runner-harness.test.mjs
node --test userconf/plugins/test/init-opencode-agents.test.mjs
node --test scripts/test/opencode-subagent-event-probe.test.mjs
git diff --check
```

Expected: 全部 PASS，`git diff --check` 无输出。

- [ ] **Step 5：重启后执行真实 serve smoke**

验证：

```text
promptAsync 204 后 start_plan_runner 立即返回 accepted
主 agent 在 child 运行期间可继续调用工具
新建 root session 确实产生 message/part/idle 或 error
Change Request -> blocked terminal_result
正常完成 -> validated merge_back
session.error/timeout -> interrupted terminal_result
同一 parent 两个 run 均可查询和回流
child 运行期间的早期 parent idle 不 dispose
终态通知后的 parent idle 才 dispose，且 dispose 后不重建 target plugin
```

smoke worktree/branch 清理前先确认现场保留和无 target cwd 残留。

---

## 自审结果

- 需求覆盖：非阻塞返回、启动报告、三终态异步回流、状态查询、多 run、runtime disposal 和真实 promptAsync smoke 均有对应任务。
- 占位符扫描：所有步骤均有具体文件、行为、命令和预期结果。
- 类型一致性：统一使用 `task_id`、`session_id`、标准 metadata `sessionId`、`parent_notification` 和 `plan_runner_terminal_*` 字段。
- 范围控制：不修改 OpenCode 源码，不承诺 GenericTool TUI 导航，不加入 timer/PID kill/全局锁重构。
