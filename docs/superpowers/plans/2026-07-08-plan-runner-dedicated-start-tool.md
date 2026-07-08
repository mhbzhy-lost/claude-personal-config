# Plan Runner 专用启动工具实现计划

> **给 agentic workers:** 本计划按 TDD 执行。优先使用 Plan-Runner 执行本计划；若 `start_plan_runner` 尚未实现导致无法自举，则使用 Inline Execution 在当前会话按任务执行。不要引用未纳入白名单的 Superpowers sub-skill。

**Goal:** 新增 `start_plan_runner` 专用工具，让 harness 负责创建或复用 plan-runner 专属 worktree、派发 plan-runner session，并禁止原生 `task` 工具直接派发 plan-runner。

**Architecture:** `main workspace` 只作为调度入口；`start_plan_runner` 默认从当前 `HEAD` 创建 dedicated harness-owned linked worktree，位置固定为 origin workspace 内的 `.plan-runner-worktrees/<task_id>`；也可通过显式参数复用已有 task/worktree 继续派发，保留 partial changes。创建 worktree 前，harness 懒加载检查 origin workspace 的 `.gitignore`；若缺少 `.plan-runner-worktrees/` 条目则追加后再创建，保证该目录不被 Git 追踪。所有 plan-runner 写操作、测试、review 和 commit boundary 都绑定到该 run worktree。原生 `task` 仍可由普通 agent 使用，但 `subagent_type/agent = plan-runner` 必须被拒绝。

**Tech Stack:** OpenCode plugin custom tool、Node.js `node:test`、Git worktree、现有 `PlanRunnerHarnessPlugin` task-state/event/session 索引。

---

## 文件结构

- Modify: `userconf/plugins/plan-runner-harness.js`
  - 新增 `start_plan_runner` custom tool。
  - `start_plan_runner` 支持新 run 与 existing task/worktree resume 两种路径。
  - 新增 plan-runner run worktree 创建 helper，路径为 `origin_worktree/.plan-runner-worktrees/<task_id>`。
  - 新增 `.gitignore` 懒加载 helper，确保 `.plan-runner-worktrees/` 不进入 origin `git status`。
  - 原生 `task` 派发 plan-runner 时直接拒绝。
  - plan-runner session final 后若 state 仍未 `validated`，向 parent session 发送 resume notification；不新增业务终态。
  - `finish_plan` validated 后向 parent session 发送唯一 completion report。
  - state 中区分 `origin_worktree` 与 `worktree`。
- Modify: `userconf/plugins/test/plan-runner-harness.test.mjs`
  - 新增 dedicated tool RED/GREEN 用例。
  - 迁移测试 helper，避免继续用原生 `task` 启动 plan-runner。
- Modify: `userconf/plugins/test/init-opencode-agents.test.mjs`
  - 保持 `plan-runner-dispatch` skill 必须指向 `start_plan_runner` 的契约断言。
- Modify: `userconf/skills/plan-runner-dispatch/SKILL.md`
  - 已改为引导 `start_plan_runner`；实现完成后补充工具不可用时的诊断文字，如测试要求变更再同步。
- Modify: `docs/knowledge/subagent-dispatch-hook.md`
  - 更新 plan-runner 启动、worktree 隔离、merge-back 边界。
- Modify: `docs/knowledge/opencode-shared-skills.md`
  - 保持 dispatch skill 与 dedicated tool 契约描述。
- Add: `docs/bugs/bug-plan-runner-native-task-dispatch-shared-workspace.md`
  - 记录共享 workspace 并发污染和原生 task 入口无法 harness 化的 RCA。
- Add: `docs/bugs/bug-plan-runner-change-request-bypasses-harness-gate.md`
  - 记录 plan-runner mid-task `Change Request` final 文本绕过 terminal gate 的 RCA。
- Modify: `userconf/plugins/plan-runner-harness.js`
  - `finish_plan` validated 输出中增加 merge-back 指引与 cleanup metadata；harness 不自动合回 origin workspace。

---

### Task 1: RED - 专用工具创建 run worktree 并绑定 plan-runner session

**Files:**
- Modify: `userconf/plugins/test/plan-runner-harness.test.mjs`

- [ ] **Step 1: 写 failing test**

在 `PlanRunnerHarnessPlugin` describe 中加入用例，放在当前 dispatch 用例附近：

```js
  it("start_plan_runner creates a harness-owned run worktree and binds the plan-runner session", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const baseCommit = initGitWorkspace(workspace)
      writeFileSync(join(workspace, "dirty.txt"), "main workspace dirty change\n")
      const stateDir = join(root, "state")
      const prompts = []
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async (payload) => {
                prompts.push({ type: "create", payload })
                return { data: { id: "ses_plan_runner" } }
              },
              prompt: async (payload) => {
                prompts.push({ type: "prompt", payload })
                return { data: {} }
              },
            },
          },
        },
        { stateDir },
      )

      const result = await hooks.tool.start_plan_runner.execute(
        { prompt: "Implement isolated work." },
        makeContext({ sessionID: "ses_parent", workspace }),
      )

      const taskID = result.metadata.task_id
      const state = readJson(join(stateDir, "tasks", `${taskID}.json`))
      assert.equal(state.status, "planning_required")
      assert.equal(state.plan_runner_session_id, "ses_plan_runner")
      assert.equal(state.origin_worktree, workspace)
      assert.notEqual(state.worktree, workspace)
      assert.match(state.worktree, new RegExp(`${workspace.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/.plan-runner-worktrees/`))
      assert.equal(state.base_commit, baseCommit)
      assert.equal(state.git_base, baseCommit)
      assert.equal(state.harness_owned_worktree, true)
      assert.match(state.branch, new RegExp(`^planrunner/${taskID.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`))
      assert.equal(existsSync(join(state.worktree, "README.md")), true)
      assert.equal(existsSync(join(state.worktree, "dirty.txt")), false)
      assert.match(readFileSync(join(workspace, ".gitignore"), "utf8"), /^\.plan-runner-worktrees\/$/m)
      assert.doesNotMatch(git(workspace, ["status", "--porcelain=v1"]), /\.plan-runner-worktrees\//)
      assert.equal(readJson(join(stateDir, "sessions", "ses_parent.json")).role, "parent")
      assert.equal(readJson(join(stateDir, "sessions", "ses_plan_runner.json")).role, "plan-runner")
      assert.equal(prompts.find((item) => item.type === "create").payload.query.directory, state.worktree)
      assert.equal(prompts.find((item) => item.type === "prompt").payload.query.directory, state.worktree)
      assert.match(prompts.find((item) => item.type === "prompt").payload.body.parts[0].text, new RegExp(`Harness Task ID: ${taskID}`))
      assert.match(prompts.find((item) => item.type === "prompt").payload.body.parts[0].text, /Origin workspace dirty changes were excluded/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
```

- [ ] **Step 2: 跑 RED**

Run:

```bash
node --test --test-name-pattern "start_plan_runner creates a harness-owned run worktree" "userconf/plugins/test/plan-runner-harness.test.mjs"
```

Expected: FAIL，错误包含 `Cannot read properties of undefined` 或 `start_plan_runner` 未定义。

---

### Task 2: GREEN - 实现 `start_plan_runner` custom tool 和 run worktree helper

**Files:**
- Modify: `userconf/plugins/plan-runner-harness.js`

- [ ] **Step 1: 增加 run worktree 路径、exclude 与 task id helper**

在 `statePaths()` 后增加 run worktree 和本地 ignore helpers：

```js
function planRunnerWorktreeRoot(originWorktree) {
  return join(originWorktree, ".plan-runner-worktrees")
}

function planRunnerWorktreePath(originWorktree, taskID) {
  return join(planRunnerWorktreeRoot(originWorktree), `${taskID}`)
}

async function ensurePlanRunnerWorktreeIgnored(originWorktree) {
  const gitignorePath = join(originWorktree, ".gitignore")
  const entry = ".plan-runner-worktrees/"
  let content = ""
  try {
    content = await readFile(gitignorePath, "utf8")
  } catch (error) {
    if (error?.code !== "ENOENT") throw error
  }
  if (content.split("\n").includes(entry)) return
  await appendFile(gitignorePath, `${content && !content.endsWith("\n") ? "\n" : ""}${entry}\n`)
}
```

新增专用启动 task id helper，避免依赖原生 `task` 的 `callID`：

```js
function planRunnerToolTaskID(sessionID) {
  return taskIdFrom(sessionID, `start-${randomUUID()}`)
}
```

- [ ] **Step 2: 扩展初始 state 字段**

替换 `createInitialState()` 返回对象中的工作区相关字段：

```js
function createInitialState({ taskID, parentSessionID, dispatchCallID, worktree, originWorktree = worktree }) {
  return {
    version: STATE_VERSION,
    task_id: taskID,
    status: "dispatching",
    parent_session_id: parentSessionID,
    dispatch_call_id: dispatchCallID,
    plan_runner_session_id: null,
    origin_worktree: originWorktree,
    worktree,
    branch: null,
    harness_owned_worktree: false,
    git_base: null,
    updated_at: Date.now(),
    lease_expires_at: Date.now() + 10 * 60 * 1000,
    brief_path: null,
    brief_sha256: null,
    tasks: [],
    active_task: null,
    modified_files: [],
    child_sessions: [],
    reviews: {
      round: 0,
      audit: [],
      external: [],
    },
    self_check: {
      status: "not_started",
      round: 0,
    },
  }
}
```

- [ ] **Step 3: 新增 run worktree 创建 helper**

放在 `createChildWorktree()` 前：

```js
async function createPlanRunnerWorktree(stateDir, taskID, originWorktree, originGitInfo) {
  if (!originGitInfo?.is_git_repo) throw new Error("start_plan_runner requires a git repository")
  const baseCommit = originGitInfo.head || await currentGitHead(originWorktree)
  if (!baseCommit) throw new Error("start_plan_runner requires a readable git HEAD")
  await ensurePlanRunnerWorktreeIgnored(originWorktree)
  const runWorktree = planRunnerWorktreePath(originWorktree, taskID)
  const branch = `planrunner/${safeId(taskID)}`
  await ensureDir(dirname(runWorktree))
  if (!(await pathExists(runWorktree))) {
    await execFileAsync("git", ["-C", originWorktree, "worktree", "add", "-b", branch, runWorktree, baseCommit], { timeout: 30000 })
  }
  const runGitInfo = await inspectGitWorktree(runWorktree)
  if (!runGitInfo.is_git_repo) throw new Error("start_plan_runner failed to create a git worktree")
  if (runGitInfo.status_porcelain) throw new Error(`start_plan_runner created dirty worktree: ${runGitInfo.status_porcelain}`)
  const originStatus = await gitCommand(originWorktree, ["status", "--porcelain=v1"])
  if (originStatus.includes(".plan-runner-worktrees/")) throw new Error("start_plan_runner worktree path is not ignored by origin workspace")
  return { worktree: runWorktree, branch, base_commit: baseCommit, git: runGitInfo }
}
```

- [ ] **Step 4: 新增 prompt 注入 helper**

放在 `ensureHarnessMarker()` 后：

```js
function ensurePlanRunnerStartPrompt(prompt, state) {
  const dirty = state.origin_git?.status_porcelain
    ? ["", "Origin workspace dirty changes were excluded from this run:", state.origin_git.status_porcelain].join("\n")
    : ""
  return [
    ensureHarnessMarker(prompt, state.task_id),
    "",
    `Assigned plan-runner worktree: ${state.worktree}`,
    `Plan-runner branch: ${state.branch}`,
    `Plan-runner base commit: ${state.base_commit}`,
    `Origin workspace: ${state.origin_worktree}`,
    "Use the assigned plan-runner worktree for all file operations and bash workdir values.",
    "Do not modify the origin workspace.",
    dirty,
  ].filter(Boolean).join("\n")
}
```

- [ ] **Step 5: 实现 `startPlanRunnerTool()`**

放在 `writePlanTool()` 前：

```js
async function startPlanRunnerTool(args, context, stateDir, { client, directory }) {
  if (!client?.session?.create || !client?.session?.prompt) {
    throw new Error("start_plan_runner requires client.session.create and client.session.prompt")
  }
  const prompt = String(args?.prompt || "").trim()
  if (!prompt) throw new Error("start_plan_runner requires prompt")

  const parentSessionID = context.sessionID
  const taskID = planRunnerToolTaskID(parentSessionID)
  const originWorktree = directory || context.worktree || context.directory || process.cwd()
  const originGit = await inspectGitWorktree(originWorktree)
  const run = await createPlanRunnerWorktree(stateDir, taskID, originWorktree, originGit)
  const state = createInitialState({
    taskID,
    parentSessionID,
    dispatchCallID: "start_plan_runner",
    originWorktree,
    worktree: run.worktree,
  })
  state.origin_git = originGit
  state.git = run.git
  state.base_commit = run.base_commit
  state.git_base = run.base_commit
  state.branch = run.branch
  state.harness_owned_worktree = true

  const briefContent = prompt
  const paths = statePaths(stateDir, taskID)
  await ensureDir(dirname(paths.brief))
  await writeFile(paths.brief, briefContent)
  state.brief_path = paths.brief
  state.brief_sha256 = sha256(briefContent)
  await writeTaskState(stateDir, state)
  await writeSessionIndex(stateDir, parentSessionID, taskID, "parent")
  await appendEvent(stateDir, taskID, { type: "dispatch_started", session_id: parentSessionID, tool: "start_plan_runner", worktree: run.worktree, branch: run.branch, base_commit: run.base_commit })

  const query = { directory: run.worktree }
  const created = await client.session.create({
    query,
    body: {
      parentID: parentSessionID,
      title: `plan-runner: ${taskID}`,
    },
  })
  throwIfSdkError(created, "plan-runner session create failed")
  const planRunnerSessionID = sessionIDFromCreateResult(created)
  if (!planRunnerSessionID) throw new Error("plan-runner session id missing")

  const nextState = await readTaskState(stateDir, taskID)
  nextState.plan_runner_session_id = planRunnerSessionID
  nextState.status = "planning_required"
  nextState.updated_at = Date.now()
  nextState.lease_expires_at = Date.now() + 10 * 60 * 1000
  await writeTaskState(stateDir, nextState)
  await writeSessionIndex(stateDir, planRunnerSessionID, taskID, "plan-runner")

  const prompted = await client.session.prompt({
    path: { id: planRunnerSessionID },
    query,
    body: {
      agent: "plan-runner",
      parts: [{ type: "text", text: ensurePlanRunnerStartPrompt(prompt, nextState) }],
    },
  })
  throwIfSdkError(prompted, "plan-runner prompt dispatch failed")
  await appendEvent(stateDir, taskID, { type: "plan_runner_bound", session_id: planRunnerSessionID, tool: "start_plan_runner" })

  return {
    output: `plan-runner started: ${taskID}`,
    metadata: {
      task_id: taskID,
      session_id: planRunnerSessionID,
      worktree: run.worktree,
      branch: run.branch,
      base_commit: run.base_commit,
    },
  }
}
```

- [ ] **Step 6: 暴露 custom tool**

在 `tool: { ... }` 中、`write_plan` 前加入：

```js
      start_plan_runner: tool({
        description: "Start a plan-runner session in a dedicated harness-owned git worktree.",
        args: {
          prompt: tool.schema.string().min(1),
        },
        execute: (args, context) => startPlanRunnerTool(args, context, stateDir, { client, directory: worktree }),
      }),
```

- [ ] **Step 7: 跑 focused GREEN**

Run:

```bash
node --test --test-name-pattern "start_plan_runner creates a harness-owned run worktree" "userconf/plugins/test/plan-runner-harness.test.mjs"
```

Expected: PASS，1 pass。

---

### Task 3: RED/GREEN - 禁止原生 `task` 派发 plan-runner

**Files:**
- Modify: `userconf/plugins/test/plan-runner-harness.test.mjs`
- Modify: `userconf/plugins/plan-runner-harness.js`

- [ ] **Step 1: 写 native task ban failing test**

替换当前 `creates task state on plan-runner dispatch and binds child session after task returns` 用例，或新增相邻用例：

```js
  it("rejects native task dispatch for plan-runner and points to start_plan_runner", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      initGitWorkspace(workspace)
      const stateDir = join(root, "state")
      const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })
      const output = { args: { background: true, subagent_type: "plan-runner", prompt: "Implement." } }

      await assert.rejects(
        () => hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, output),
        /Use start_plan_runner instead of native task/i,
      )
      assert.equal(existsSync(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json")), false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
```

- [ ] **Step 2: 跑 RED**

Run:

```bash
node --test --test-name-pattern "rejects native task dispatch for plan-runner" "userconf/plugins/test/plan-runner-harness.test.mjs"
```

Expected: FAIL，因为旧逻辑会创建 state 而不是拒绝。

- [ ] **Step 3: 实现 native task ban**

在 `tool.execute.before` 中，放在 `sessionIndex?.role === "plan-runner"` 分支之前：

```js
      if (input.tool === "task" && isPlanRunnerDispatch(output.args)) {
        throw new Error("Use start_plan_runner instead of native task for plan-runner dispatch")
      }
```

在 plan-runner child dispatch 分支中也拒绝显式 plan-runner：

```js
      if (input.tool === "task" && sessionIndex?.role === "plan-runner") {
        if (isPlanRunnerDispatch(output.args)) throw new Error("plan-runner cannot dispatch another plan-runner with native task")
        await enforcePhaseGate(stateDir, input, output)
        await prepareChildDispatch(stateDir, input, output, sessionIndex)
        return
      }
```

- [ ] **Step 4: 跑 GREEN**

Run:

```bash
node --test --test-name-pattern "rejects native task dispatch for plan-runner" "userconf/plugins/test/plan-runner-harness.test.mjs"
```

Expected: PASS，1 pass。

---

### Task 4: 迁移测试 helper 到 `start_plan_runner`

**Files:**
- Modify: `userconf/plugins/test/plan-runner-harness.test.mjs`

- [ ] **Step 1: 新增 mock client helper**

在 `initGitWorkspace()` 后加入：

```js
function planRunnerClient({ planRunnerSessionID = "ses_plan_runner", prompts = [], creates = [] } = {}) {
  return {
    session: {
      create: async (payload) => {
        creates.push(payload)
        return { data: { id: planRunnerSessionID } }
      },
      prompt: async (payload) => {
        prompts.push(payload)
        return { data: {} }
      },
      promptAsync: async (payload) => {
        prompts.push(payload)
        return { data: {} }
      },
    },
  }
}
```

- [ ] **Step 2: 替换 `dispatchPlanRunner()` helper**

将当前 helper 改为调用 custom tool，并从 metadata 读取 task path：

```js
async function dispatchPlanRunner({ hooks, workspace, parentSessionID = "ses_parent", prompt = "Implement." }) {
  mkdirSync(workspace, { recursive: true })
  const result = await hooks.tool.start_plan_runner.execute(
    { prompt },
    makeContext({ sessionID: parentSessionID, workspace }),
  )
  return join("tasks", `${result.metadata.task_id}.json`)
}
```

- [ ] **Step 3: 新增 hooks factory helper**

避免每个用例重复 mock client：

```js
async function createPlanRunnerHarness({ workspace, stateDir, client, options = {} }) {
  const mockClient = client || planRunnerClient()
  return PlanRunnerHarnessPlugin({ directory: workspace, client: mockClient }, { stateDir, ...options })
}
```

- [ ] **Step 4: 迁移测试中的 plugin 初始化**

把不关心 client 行为的用例从：

```js
const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })
```

改为：

```js
initGitWorkspace(workspace)
const hooks = await createPlanRunnerHarness({ workspace, stateDir })
```

对已自定义 `client.session.create/prompt/promptAsync` 的 audit/external review 用例，保留自定义 client，但初始化前必须 `initGitWorkspace(workspace)`，并确保 `client.session.create` 返回 `ses_plan_runner` 给 `start_plan_runner`，audit session 测试中第二次 create 返回 `ses_audit`：

```js
let createCalls = 0
const client = {
  session: {
    create: async () => {
      createCalls += 1
      return { data: { id: createCalls === 1 ? "ses_plan_runner" : "ses_audit" } }
    },
    prompt: async (payload) => prompts.push(payload),
    promptAsync: async (payload) => prompts.push(payload),
  },
}
```

- [ ] **Step 5: 跑迁移后 harness 全量**

Run:

```bash
node --test "userconf/plugins/test/plan-runner-harness.test.mjs"
```

Expected: PASS，所有 plan-runner harness tests 通过。当前基线是 83 pass；新增 dedicated tool 用例后预期至少 84 pass。

---

### Task 5: 更新 worktree 边界与 finish_plan 语义测试

**Files:**
- Modify: `userconf/plugins/test/plan-runner-harness.test.mjs`
- Modify: `userconf/plugins/plan-runner-harness.js`

- [ ] **Step 1: 删除旧 linked worktree 禁止测试，改为允许 origin 为 linked worktree**

替换 `blocks plan-runner dispatch from a linked git worktree`：

```js
  it("allows start_plan_runner from a linked origin worktree because execution uses a harness-owned run worktree", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const mainWorkspace = join(root, "main")
      const linkedWorkspace = join(root, "linked")
      const baseCommit = initGitWorkspace(mainWorkspace)
      git(mainWorkspace, ["worktree", "add", "--detach", linkedWorkspace, "HEAD"])
      const stateDir = join(root, "state")
      const hooks = await createPlanRunnerHarness({ workspace: linkedWorkspace, stateDir })

      const result = await hooks.tool.start_plan_runner.execute(
        { prompt: "Implement from linked origin." },
        makeContext({ sessionID: "ses_parent", workspace: linkedWorkspace }),
      )

      const state = readJson(join(stateDir, "tasks", `${result.metadata.task_id}.json`))
      assert.equal(state.origin_worktree, linkedWorkspace)
      assert.notEqual(state.worktree, linkedWorkspace)
      assert.equal(state.base_commit, baseCommit)
      assert.equal(state.harness_owned_worktree, true)
      assert.equal(state.git.is_linked_worktree, true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
```

- [ ] **Step 2: 移除 `planRunnerDispatchBlocker()` 的 linked/dirty 拦截用于专用工具**

保留函数给 legacy diagnostic 时使用，或删除只由原生 task dispatch 调用的分支。`startPlanRunnerTool()` 不调用 `planRunnerDispatchBlocker()`，只要求 origin 是 git repo 且 `HEAD` 可读。

- [ ] **Step 3: 确认 finish_plan 只检查 run worktree**

新增用例：origin dirty 但 run worktree clean 且已有 commit 时可以进入 audit：

```js
  it("finish_plan checks the harness-owned run worktree instead of origin workspace dirtiness", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      initGitWorkspace(workspace)
      writeFileSync(join(workspace, "origin-dirty.txt"), "excluded\n")
      const stateDir = join(root, "state")
      const prompts = []
      const hooks = await createPlanRunnerHarness({
        workspace,
        stateDir,
        client: planRunnerClient({ prompts }),
        options: { completionGatePollMs: 5, completionGateTimeoutMs: 100 },
      })
      const statePath = await prepareCompletionReadyState({ hooks, workspace, stateDir })
      const stateBeforeCommit = readJson(statePath)
      writeFileSync(join(stateBeforeCommit.worktree, "probe-output.txt"), "implemented\n")
      git(stateBeforeCommit.worktree, ["add", "."])
      git(stateBeforeCommit.worktree, ["commit", "-m", "test: implement isolated plan"])

      const finish = hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace: stateBeforeCommit.worktree }))
        .catch(() => {})
      await waitUntil(() => prompts.some((payload) => payload.body?.agent === "plan-runner-audit"))
      const state = readJson(statePath)
      assert.equal(state.status, "audit_review")
      assert.equal(existsSync(join(workspace, "origin-dirty.txt")), true)
      await finish
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
```

- [ ] **Step 4: 跑 focused tests**

Run:

```bash
node --test --test-name-pattern "allows start_plan_runner from a linked origin|finish_plan checks the harness-owned run worktree" "userconf/plugins/test/plan-runner-harness.test.mjs"
```

Expected: PASS，2 pass。

---

### Task 6: 工具定义、skill 与知识文档同步

**Files:**
- Modify: `userconf/skills/plan-runner-dispatch/SKILL.md`
- Modify: `userconf/plugins/test/init-opencode-agents.test.mjs`
- Modify: `docs/knowledge/subagent-dispatch-hook.md`
- Modify: `docs/knowledge/opencode-shared-skills.md`
- Add: `docs/bugs/bug-plan-runner-native-task-dispatch-shared-workspace.md`

- [ ] **Step 1: 补 bug RCA**

创建 `docs/bugs/bug-plan-runner-native-task-dispatch-shared-workspace.md`：

```markdown
# bug: 原生 task 派发 plan-runner 导致共享 workspace 并发污染

## 现象

两个 agent 会话在同一个 workspace 使用 plan-runner 时，一个会话的写入会让另一个会话的 dispatch / finish_plan clean preflight 失败。由于 plan-runner 由原生 `task` 派发，harness 无法在工具入口天然保证 dedicated worktree。

## 根因 (6 要素)

1. **触发条件**：多个会话从同一 workspace 用原生 `task({ subagent_type: "plan-runner" })` 启动 plan-runner。
2. **期望链路**：plan-runner 的可验证工作区由 harness 创建并独占，origin workspace 的 dirty 内容不进入本次 diff。
3. **实际链路**：plan-runner session 直接绑定 origin workspace，clean / review / commit boundary 都受其他会话写入影响。
4. **关键假设失效**：要求 origin workspace 长期 clean 在多 agent 并发下不可维护。
5. **旁证**：当前 `planRunnerDispatchBlocker()` 拦 dirty / linked worktree，说明执行目录和入口 workspace 被混为同一个概念。
6. **影响范围**：并发 plan-runner 互相阻塞，或把非本次任务 diff 纳入 review / commit boundary。

## 修复方向

新增 `start_plan_runner` 专用工具，在工具内创建 harness-owned run worktree 并派发 plan-runner；禁止原生 `task` 直接派发 plan-runner。

## 验证

- RED：`start_plan_runner` 不存在、原生 `task` 可派发 plan-runner。
- GREEN：专用工具创建 run worktree，origin dirty 不污染 run worktree，原生 `task` 派发 plan-runner 被拒绝。
```

- [ ] **Step 2: 更新 `docs/knowledge/subagent-dispatch-hook.md`**

在 dispatch lifecycle 段落中写明：

```markdown
- plan-runner 必须通过 `start_plan_runner` custom tool 启动；原生 `task` 派发 `plan-runner` 被 harness 拒绝。
- `start_plan_runner` 记录 `origin_worktree`，从 `base_commit` 创建 dedicated harness-owned `worktree`，并把 plan-runner session 的所有工具和 review/finish_plan 边界绑定到该 run worktree。
- origin workspace dirty 内容默认排除在本次 run 外；如果用户希望纳入，必须先 commit/stash 或由未来显式 snapshot 模式处理。
```

- [ ] **Step 3: 更新 `plan-runner-dispatch` skill 测试断言**

保持 `userconf/plugins/test/init-opencode-agents.test.mjs` 中的断言：

```js
    assert.match(skill, /start_plan_runner/)
    assert.match(skill, /Do not use the native `task` tool/i)
    assert.doesNotMatch(skill, /subagent_type["`]?:\s*["`]plan-runner["`]/)
    assert.match(skill, /harness-owned worktree/i)
```

- [ ] **Step 4: 跑文档/skill focused tests**

Run:

```bash
node --test --test-name-pattern "plan-runner-dispatch skill routes through the dedicated start_plan_runner tool" "userconf/plugins/test/init-opencode-agents.test.mjs"
```

Expected: PASS，1 pass。

---

### Task 7: validated 输出引导主 agent 合回 origin workspace 并清理 worktree

**Files:**
- Modify: `userconf/plugins/plan-runner-harness.js`
- Modify: `userconf/plugins/test/plan-runner-harness.test.mjs`
- Modify: `docs/knowledge/subagent-dispatch-hook.md`

- [ ] **Step 1: 写 merge-back 指引 RED 测试**

在 `PlanRunnerHarnessPlugin` describe 中新增用例，放在 external review pass / validated 相关用例附近：

```js
  it("returns merge-back instructions and cleanup metadata after validation", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      initGitWorkspace(workspace)
      const stateDir = join(root, "state")
      const prompts = []
      const hooks = await createPlanRunnerHarness({
        workspace,
        stateDir,
        client: planRunnerClient({ prompts }),
        options: {
          completionGatePollMs: 5,
          completionGateTimeoutMs: 1000,
          externalReview: async () => ({ result: "pass", provider: "test-provider", findings: "No issues" }),
        },
      })

      const { statePath, finish } = await prepareAuditReviewState({ hooks, workspace, stateDir })
      const stateBeforeCommit = readJson(statePath)
      writeFileSync(join(stateBeforeCommit.worktree, "probe-output.txt"), "implemented\n")
      git(stateBeforeCommit.worktree, ["add", "."])
      git(stateBeforeCommit.worktree, ["commit", "-m", "test: implement isolated plan"])
      await hooks.event({ event: auditTextPartEvent(JSON.stringify({ result: "pass", required_fixes: [] })) })
      await hooks.event({ event: auditIdleEvent() })

      const result = await finish
      const text = String(result.output || result)
      const state = readJson(statePath)
      assert.equal(state.status, "validated")
      assert.match(text, /Merge Back:/)
      assert.match(text, new RegExp(`Origin workspace: ${state.origin_worktree.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`))
      assert.match(text, new RegExp(`Run worktree: ${state.worktree.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`))
      assert.match(text, new RegExp(`git merge --no-ff ${state.branch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`))
      assert.match(text, /git worktree remove/)
      assert.deepEqual(result.metadata.merge_back, {
        origin_worktree: state.origin_worktree,
        run_worktree: state.worktree,
        branch: state.branch,
        base_commit: state.base_commit,
        head_commit: state.git_head,
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
```

- [ ] **Step 2: 跑 RED**

Run:

```bash
node --test --test-name-pattern "returns merge-back instructions and cleanup metadata after validation" "userconf/plugins/test/plan-runner-harness.test.mjs"
```

Expected: FAIL，`Merge Back:` 或 `metadata.merge_back` 缺失。

- [ ] **Step 3: 记录 run worktree HEAD**

在 `finalizeIfComplete()` validated 分支写 state 前设置 `git_head`：

```js
  const nextState = cloneState(state)
  nextState.git_head = await currentGitHead(nextState.worktree)
  nextState.status = "validated"
  rememberCompletionGateResult(nextState, "validated", "terminal_gate", [])
  nextState.updated_at = Date.now()
  await writeTaskState(stateDir, nextState)
  await appendEvent(stateDir, state.task_id, { type: "task_validated" })
```

在 fail-open validated 分支同样设置：

```js
      nextState.git_head = await currentGitHead(nextState.worktree)
      nextState.status = "validated"
```

- [ ] **Step 4: 新增 merge-back 文本 helper**

放在 `completionGateResultText()` 前：

```js
function mergeBackInstructions(state) {
  if (state?.status !== "validated" || !state?.harness_owned_worktree) return []
  return [
    "",
    "Merge Back:",
    `- Origin workspace: ${state.origin_worktree}`,
    `- Run worktree: ${state.worktree}`,
    `- Branch: ${state.branch}`,
    `- Base commit: ${state.base_commit || state.git_base || "unknown"}`,
    `- Head commit: ${state.git_head || "unknown"}`,
    "- In the origin workspace, run `git status --short`; if dirty, stop and ask the user before merging.",
    `- If origin is clean, run \`git merge --no-ff ${state.branch}\` from the origin workspace.`,
    `- After a successful merge, run \`git worktree remove ${state.worktree}\` and \`git branch -d ${state.branch}\`.`,
  ]
}
```

在 `completionGateResultText(state)` 返回前追加：

```js
  lines.push(...mergeBackInstructions(state))
```

- [ ] **Step 5: 新增 metadata helper 并接入 `finish_plan` 返回值**

放在 `completionGateResultText()` 附近：

```js
function mergeBackMetadata(state) {
  if (state?.status !== "validated" || !state?.harness_owned_worktree) return null
  return {
    origin_worktree: state.origin_worktree,
    run_worktree: state.worktree,
    branch: state.branch,
    base_commit: state.base_commit || state.git_base || null,
    head_commit: state.git_head || null,
  }
}
```

在 `finishPlanTool()` 两个返回 `metadata` 的位置加入：

```js
          merge_back: mergeBackMetadata(state),
```

和：

```js
      merge_back: mergeBackMetadata(finishedState),
```

- [ ] **Step 6: 明确 cleanup 不自动执行**

不要在 harness 中自动执行 `git merge`、`git worktree remove` 或 `git branch -d`。这些操作必须由主 agent 在 origin workspace 状态检查后显式执行。若 origin dirty，主 agent 停止并报告冲突风险。

- [ ] **Step 7: 更新知识文档**

在 `docs/knowledge/subagent-dispatch-hook.md` 的 terminal gate 段落中加入：

```markdown
- `finish_plan` validated 输出会提供 merge-back 指引和 `metadata.merge_back`，但 harness 不自动合回 origin workspace，也不自动删除 run worktree。主 agent 必须先在 `origin_worktree` 检查 `git status --short`；clean 时可 `git merge --no-ff <branch>`，成功后再 `git worktree remove <run_worktree>` 和 `git branch -d <branch>`。
```

- [ ] **Step 8: 跑 focused GREEN**

Run:

```bash
node --test --test-name-pattern "returns merge-back instructions and cleanup metadata after validation" "userconf/plugins/test/plan-runner-harness.test.mjs"
```

Expected: PASS，1 pass。

---

### Task 8: `start_plan_runner` 支持复用 existing worktree 续派发

**Files:**
- Modify: `userconf/plugins/test/plan-runner-harness.test.mjs`
- Modify: `userconf/plugins/plan-runner-harness.js`
- Modify: `docs/knowledge/subagent-dispatch-hook.md`

- [ ] **Step 1: 写 existing worktree resume RED 测试**

在 dedicated tool 用例附近新增：

```js
  it("start_plan_runner resumes an existing run worktree without clearing partial changes", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      initGitWorkspace(workspace)
      const stateDir = join(root, "state")
      const prompts = []
      const creates = []
      const hooks = await createPlanRunnerHarness({
        workspace,
        stateDir,
        client: planRunnerClient({ planRunnerSessionID: "ses_plan_runner_first", prompts, creates }),
      })
      const first = await hooks.tool.start_plan_runner.execute(
        { prompt: "Implement first attempt." },
        makeContext({ sessionID: "ses_parent", workspace }),
      )
      const taskID = first.metadata.task_id
      const statePath = join(stateDir, "tasks", `${taskID}.json`)
      const firstState = readJson(statePath)
      writeFileSync(join(firstState.worktree, "partial.txt"), "keep me\n")
      const nonValidatedState = {
        ...firstState,
        status: "executing",
        active_task: "T2",
        tasks: [
          { id: "T1", title: "done", status: "completed", files: [], checks: [], negative_checks: [], evidence: [] },
          { id: "T2", title: "needs resume", status: "in_progress", files: [], checks: [], negative_checks: [], evidence: [] },
        ],
      }
      writeFileSync(statePath, `${JSON.stringify(nonValidatedState, null, 2)}\n`)

      const resumeClient = planRunnerClient({ planRunnerSessionID: "ses_plan_runner_second", prompts, creates })
      const resumeHooks = await createPlanRunnerHarness({ workspace, stateDir, client: resumeClient })
      const resumed = await resumeHooks.tool.start_plan_runner.execute(
        {
          prompt: "Continue after approving the plan change.",
          task_id: taskID,
          existing_worktree: firstState.worktree,
          reason: "approved replan",
        },
        makeContext({ sessionID: "ses_parent", workspace }),
      )

      const resumedState = readJson(statePath)
      assert.equal(resumed.metadata.task_id, taskID)
      assert.equal(resumed.metadata.worktree, firstState.worktree)
      assert.equal(resumedState.plan_runner_session_id, "ses_plan_runner_second")
      assert.equal(resumedState.previous_plan_runner_session_id, "ses_plan_runner_first")
      assert.equal(resumedState.status, "planning_required")
      assert.equal(resumedState.active_task, null)
      assert.equal(resumedState.resume.count, 1)
      assert.equal(readFileSync(join(firstState.worktree, "partial.txt"), "utf8"), "keep me\n")
      assert.match(prompts.at(-1).body.parts[0].text, /Resuming existing plan-runner task/)
      assert.match(prompts.at(-1).body.parts[0].text, new RegExp(taskID.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
      assert.equal(readJson(join(stateDir, "sessions", "ses_plan_runner_second.json")).role, "plan-runner")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
```

- [ ] **Step 2: 跑 RED**

Run:

```bash
node --test --test-name-pattern "start_plan_runner resumes an existing run worktree" "userconf/plugins/test/plan-runner-harness.test.mjs"
```

Expected: FAIL，`task_id` / `existing_worktree` 参数未被工具 schema 或实现接受。

- [ ] **Step 3: 扩展 `start_plan_runner` args schema**

把 custom tool args 改为：

```js
        args: {
          prompt: tool.schema.string().min(1),
          task_id: tool.schema.string().optional(),
          existing_worktree: tool.schema.string().optional(),
          reason: tool.schema.string().optional(),
        },
```

- [ ] **Step 4: 新增 resume prompt helper**

放在 `ensurePlanRunnerStartPrompt()` 后：

```js
function ensurePlanRunnerResumePrompt(prompt, state, previousSessionID, reason) {
  return [
    ensureHarnessMarker(prompt, state.task_id),
    "",
    "Resuming existing plan-runner task.",
    `Harness Task ID: ${state.task_id}`,
    `Previous plan-runner session: ${previousSessionID || "none"}`,
    `Resume reason: ${reason || "not specified"}`,
    `Assigned plan-runner worktree: ${state.worktree}`,
    `Plan-runner branch: ${state.branch}`,
    `Plan-runner base commit: ${state.base_commit || state.git_base || "unknown"}`,
    "Existing partial changes in the assigned worktree were intentionally preserved.",
    "Re-read the existing worktree and task-state before changing files.",
    "If the previous run ended with a Change Request, rewrite the plan with write_plan before continuing implementation.",
  ].join("\n")
}
```

- [ ] **Step 5: 新增 resume implementation helper**

放在 `startPlanRunnerTool()` 附近：

```js
async function resumePlanRunnerTool(args, context, stateDir, { client }) {
  const taskID = String(args?.task_id || "").trim()
  if (!taskID) throw new Error("start_plan_runner resume requires task_id")
  const state = await readTaskState(stateDir, taskID)
  if (!state) throw new Error(`start_plan_runner cannot find task state: ${taskID}`)
  const expectedWorktree = String(args?.existing_worktree || state.worktree || "").trim()
  if (!expectedWorktree) throw new Error("start_plan_runner resume requires existing_worktree or state.worktree")
  if (state.worktree && state.worktree !== expectedWorktree) {
    throw new Error(`start_plan_runner existing_worktree mismatch: expected ${state.worktree}, got ${expectedWorktree}`)
  }
  if (!(await pathExists(expectedWorktree))) throw new Error(`start_plan_runner existing_worktree does not exist: ${expectedWorktree}`)
  const gitInfo = await inspectGitWorktree(expectedWorktree)
  if (!gitInfo.is_git_repo) throw new Error("start_plan_runner existing_worktree must be a git worktree")

  const previousSessionID = state.plan_runner_session_id || null
  const created = await client.session.create({
    query: { directory: expectedWorktree },
    body: { parentID: context.sessionID, title: `plan-runner resume: ${taskID}` },
  })
  throwIfSdkError(created, "plan-runner resume session create failed")
  const planRunnerSessionID = sessionIDFromCreateResult(created)
  if (!planRunnerSessionID) throw new Error("plan-runner resume session id missing")

  const nextState = cloneState(state)
  nextState.previous_plan_runner_session_id = previousSessionID
  nextState.plan_runner_session_id = planRunnerSessionID
  nextState.status = "planning_required"
  nextState.active_task = null
  delete nextState.completion_gate
  nextState.git = gitInfo
  nextState.updated_at = Date.now()
  nextState.lease_expires_at = Date.now() + 10 * 60 * 1000
  nextState.resume = {
    count: Number(nextState.resume?.count || 0) + 1,
    previous_session_id: previousSessionID,
    reason: String(args?.reason || ""),
    resumed_at: Date.now(),
  }
  await writeTaskState(stateDir, nextState)
  await writeSessionIndex(stateDir, context.sessionID, taskID, "parent")
  await writeSessionIndex(stateDir, planRunnerSessionID, taskID, "plan-runner")

  const prompt = ensurePlanRunnerResumePrompt(String(args.prompt || ""), nextState, previousSessionID, args?.reason)
  const prompted = await client.session.prompt({
    path: { id: planRunnerSessionID },
    query: { directory: expectedWorktree },
    body: { agent: "plan-runner", parts: [{ type: "text", text: prompt }] },
  })
  throwIfSdkError(prompted, "plan-runner resume prompt dispatch failed")
  await appendEvent(stateDir, taskID, { type: "plan_runner_resumed", session_id: planRunnerSessionID, previous_session_id: previousSessionID, worktree: expectedWorktree })
  return {
    output: `plan-runner resumed: ${taskID}`,
    metadata: { task_id: taskID, session_id: planRunnerSessionID, worktree: expectedWorktree, resumed: true },
  }
}
```

在 `startPlanRunnerTool()` 开头、创建新 task 之前加入：

```js
  if (args?.task_id || args?.existing_worktree) {
    return resumePlanRunnerTool(args, context, stateDir, { client })
  }
```

- [ ] **Step 6: 跑 GREEN**

Run:

```bash
node --test --test-name-pattern "start_plan_runner resumes an existing run worktree" "userconf/plugins/test/plan-runner-harness.test.mjs"
```

Expected: PASS，1 pass。

---

### Task 9: parent completion / resume notification

**Files:**
- Modify: `userconf/plugins/test/plan-runner-harness.test.mjs`
- Modify: `userconf/plugins/plan-runner-harness.js`
- Modify: `docs/knowledge/subagent-dispatch-hook.md`
- Modify: `docs/bugs/bug-plan-runner-change-request-bypasses-harness-gate.md`

- [ ] **Step 1: 写 validated completion report RED 测试**

在 external review pass / validated 相关用例附近新增：

```js
  it("sends a parent completion report only after finish_plan validates", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      initGitWorkspace(workspace)
      const stateDir = join(root, "state")
      const prompts = []
      const hooks = await createPlanRunnerHarness({
        workspace,
        stateDir,
        client: planRunnerClient({ prompts }),
        options: {
          completionGatePollMs: 5,
          completionGateTimeoutMs: 1000,
          externalReview: async () => ({ result: "pass", provider: "test-provider", findings: "No issues" }),
        },
      })

      const { statePath, finish } = await prepareAuditReviewState({ hooks, workspace, stateDir })
      const stateBeforeCommit = readJson(statePath)
      writeFileSync(join(stateBeforeCommit.worktree, "probe-output.txt"), "implemented\n")
      git(stateBeforeCommit.worktree, ["add", "."])
      git(stateBeforeCommit.worktree, ["commit", "-m", "test: implement isolated plan"])
      await hooks.event({ event: auditTextPartEvent(JSON.stringify({ result: "pass", required_fixes: [] })) })
      await hooks.event({ event: auditIdleEvent() })
      await finish

      const reportPrompt = prompts.find((payload) => (
        payload.path?.id === "ses_parent"
        && payload.body?.parts?.[0]?.text?.includes("[PLAN-RUNNER VALIDATED]")
      ))
      assert.ok(reportPrompt)
      assert.match(reportPrompt.body.parts[0].text, /Status: validated/)
      assert.match(reportPrompt.body.parts[0].text, /Merge Back:/)
      assert.match(reportPrompt.body.parts[0].text, /This is the only completion report/)
      const state = readJson(statePath)
      assert.equal(state.status, "validated")
      assert.ok(state.parent_notifications?.completion_report?.sent_at)
      assert.match(readFileSync(join(stateDir, "events", `${state.task_id}.jsonl`), "utf8"), /parent_completion_report_sent/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
```

- [ ] **Step 2: 跑 completion report RED**

Run:

```bash
node --test --test-name-pattern "sends a parent completion report only after finish_plan validates" "userconf/plugins/test/plan-runner-harness.test.mjs"
```

Expected: FAIL，parent prompt 中没有 `[PLAN-RUNNER VALIDATED]`。

- [ ] **Step 3: 写 resume notification RED 测试**

若测试文件还没有 state fixture helper，先在测试 helper 区域新增：

```js
function createStateFixture(overrides = {}) {
  return {
    version: 2,
    task_id: "planrun-ses_parent-call_test",
    status: "planning_required",
    parent_session_id: "ses_parent",
    dispatch_call_id: "call_test",
    plan_runner_session_id: "ses_plan_runner",
    origin_worktree: overrides.worktree || null,
    worktree: overrides.worktree || null,
    branch: null,
    harness_owned_worktree: false,
    git_base: null,
    updated_at: Date.now(),
    lease_expires_at: Date.now() + 10 * 60 * 1000,
    brief_path: null,
    brief_sha256: null,
    tasks: [],
    active_task: null,
    modified_files: [],
    child_sessions: [],
    reviews: { round: 0, audit: [], external: [] },
    self_check: { status: "not_started", round: 0 },
    ...overrides,
  }
}
```

在 watchdog tests 附近新增：

```js
  it("notifies the parent to resume when plan-runner ends before validated without changing harness status", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      initGitWorkspace(workspace)
      const stateDir = join(root, "state")
      const prompts = []
      const hooks = await createPlanRunnerHarness({ workspace, stateDir, client: planRunnerClient({ prompts }) })
      mkdirSync(join(stateDir, "tasks"), { recursive: true })
      mkdirSync(join(stateDir, "sessions"), { recursive: true })
      const taskID = "planrun-ses_parent-call_change"
      const state = createStateFixture({
        task_id: taskID,
        parent_session_id: "ses_parent",
        plan_runner_session_id: "ses_plan_runner",
        worktree: workspace,
        status: "executing",
        active_task: "T2",
        tasks: [
          { id: "T1", title: "done", status: "completed", files: [], checks: [], negative_checks: [], evidence: [] },
          { id: "T2", title: "in progress", status: "in_progress", files: [], checks: [], negative_checks: [], evidence: [] },
        ],
      })
      writeFileSync(join(stateDir, "tasks", `${taskID}.json`), `${JSON.stringify(state, null, 2)}\n`)
      writeFileSync(join(stateDir, "sessions", "ses_plan_runner.json"), `${JSON.stringify({ task_id: taskID, role: "plan-runner" }, null, 2)}\n`)
      const text = [
        "Change Request:",
        "- Original assumption: 删除 mcp_server.py 不影响生产代码。",
        "- Contradicting evidence: webhook.py 仍 import mcp_server。",
        "- Needed decision: 是否扩大计划范围。",
      ].join("\n")

      await hooks.event({ event: messagePartEvent({ sessionID: "ses_plan_runner", text }) })
      await hooks.event({ event: messageUpdatedEvent({ sessionID: "ses_plan_runner", messageID: "msg_change", completed: true }) })

      const nextState = readJson(join(stateDir, "tasks", `${taskID}.json`))
      assert.equal(nextState.status, "executing")
      assert.equal(nextState.active_task, "T2")
      assert.equal(nextState.completion_gate, undefined)
      assert.ok(nextState.parent_notifications?.["resume_required.ses_plan_runner"]?.sent_at)
      const notification = prompts.find((payload) => (
        payload.path?.id === "ses_parent"
        && payload.body?.parts?.[0]?.text?.includes("[PLAN-RUNNER RESUME REQUIRED]")
      ))
      assert.ok(notification)
      assert.match(notification.body.parts[0].text, /Current harness status: executing/)
      assert.match(notification.body.parts[0].text, /Suggested resume call:/)
      assert.match(notification.body.parts[0].text, /existing_worktree/)
      assert.match(readFileSync(join(stateDir, "events", `${taskID}.jsonl`), "utf8"), /parent_resume_notification_sent/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
```

若缺少 `messagePartEvent()` / `messageUpdatedEvent()` test helper，新增：

```js
function messagePartEvent({ sessionID, text }) {
  return {
    type: "message.part.updated",
    properties: {
      sessionID,
      part: { type: "text", text },
    },
  }
}

function messageUpdatedEvent({ sessionID, messageID = "msg", completed = false }) {
  return {
    type: "message.updated",
    properties: {
      sessionID,
      info: {
        id: messageID,
        sessionID,
        role: "assistant",
        time: completed ? { completed: Date.now() } : {},
      },
    },
  }
}
```

- [ ] **Step 4: 跑 resume notification RED**

Run:

```bash
node --test --test-name-pattern "notifies the parent to resume when plan-runner ends before validated" "userconf/plugins/test/plan-runner-harness.test.mjs"
```

Expected: FAIL，parent prompt 中没有 `[PLAN-RUNNER RESUME REQUIRED]`。

- [ ] **Step 5: 新增 parent notification helpers**

放在 `completionGateResultText()` 附近：

```js
function notificationExcerpt(text, max = 12000) {
  const value = String(text || "").trim()
  if (value.length <= max) return value || "(no final text captured)"
  return `${value.slice(0, max)}\n... [truncated]`
}

function parentPromptDirectory(state) {
  return state.origin_worktree || state.worktree
}

function parentCompletionReportText(state) {
  const tasks = Array.isArray(state.tasks) ? state.tasks : []
  const modifiedFiles = Array.isArray(state.modified_files) ? state.modified_files : []
  const evidence = collectTaskEvidence(state)
  const commands = evidence.filter((item) => item.type === "command")
  return [
    "[PLAN-RUNNER VALIDATED]",
    "",
    `Harness Task ID: ${state.task_id}`,
    `Plan-runner session: ${state.plan_runner_session_id}`,
    "Status: validated",
    "",
    "Validated scope:",
    `- Tasks: ${tasks.filter((task) => task.status === "completed").length}/${tasks.length}`,
    "- Modified files:",
    ...(modifiedFiles.length ? modifiedFiles.map((file) => `  - ${file}`) : ["  - none recorded"]),
    "- Validation commands:",
    ...(commands.length ? commands.map((item) => `  - ${item.command} -> ${item.success ? "PASS" : "FAIL"}`) : ["  - none recorded"]),
    "- Review gates:",
    "  - deterministic: passed",
    `  - audit: ${(state.reviews?.audit || []).length ? "passed" : "not recorded"}`,
    `  - external: ${(state.reviews?.external || []).length ? "passed" : "not recorded"}`,
    "",
    "Run worktree:",
    state.worktree,
    "",
    "Origin workspace:",
    state.origin_worktree || state.worktree,
    "",
    "Merge Back:",
    "- Review metadata.merge_back from finish_plan result if available.",
    "- In origin workspace, run `git status --short`.",
    "- If clean, merge with `git merge --no-ff <branch>`.",
    "- Then cleanup with `git worktree remove <run_worktree>` and `git branch -d <branch>`.",
    "",
    "Important:",
    "- This is the only completion report.",
    "- Do not treat plan-runner raw final text as completion unless task-state is validated.",
  ].join("\n")
}

function parentResumeNotificationText(state, sessionID, finalText) {
  return [
    "[PLAN-RUNNER RESUME REQUIRED]",
    "",
    "This plan-runner session ended before validation.",
    "",
    `Harness Task ID: ${state.task_id}`,
    `Previous plan-runner session: ${sessionID}`,
    `Current harness status: ${state.status}`,
    `Active task: ${state.active_task || "none"}`,
    `Run worktree: ${state.worktree}`,
    `Origin workspace: ${state.origin_worktree || state.worktree}`,
    `Plan path: ${state.plan_path || "none"}`,
    `Brief path: ${state.brief_path || "none"}`,
    "",
    "Last plan-runner output:",
    "---",
    notificationExcerpt(finalText),
    "---",
    "",
    "Required next step for the main agent:",
    "- Do not report completion unless task-state status is \"validated\".",
    "- Inspect the task-state and the run worktree.",
    "- If the last output asks for a decision, ask the user.",
    "- If no user decision is needed, resume by calling start_plan_runner with the same task_id and existing_worktree.",
    "",
    "Suggested resume call:",
    "start_plan_runner({",
    `  "task_id": "${state.task_id}",`,
    `  "existing_worktree": "${state.worktree}",`,
    "  \"reason\": \"previous plan-runner ended before finish_plan\",",
    "  \"prompt\": \"Continue the existing plan-runner run from task-state. Do not restart from scratch. Re-read the existing worktree, plan, active task, and previous final output. Preserve existing partial changes. If the plan must change, call write_plan with the revised task contract. Continue until finish_plan returns validated.\"",
    "})",
  ].join("\n")
}
```

新增去重发送 helper：

```js
async function notifyParentSession({ stateDir, client, state, key, eventType, failureEventType, text }) {
  if (!client?.session?.prompt || !state.parent_session_id) return false
  const notifications = state.parent_notifications || {}
  if (notifications[key]?.sent_at) return false

  try {
    const prompted = await client.session.prompt({
      path: { id: state.parent_session_id },
      query: { directory: parentPromptDirectory(state) },
      body: { parts: [{ type: "text", text }] },
    })
    throwIfSdkError(prompted, `${eventType} prompt failed`)
  } catch (error) {
    await appendEvent(stateDir, state.task_id, { type: failureEventType, error: formatDiagnosticError(error) })
    return false
  }

  const nextState = cloneState(state)
  nextState.parent_notifications = {
    ...notifications,
    [key]: { sent_at: Date.now() },
  }
  nextState.updated_at = Date.now()
  await writeTaskState(stateDir, nextState)
  await appendEvent(stateDir, state.task_id, { type: eventType })
  return true
}
```

- [ ] **Step 6: validated 后通知 parent**

在 `finalizeIfComplete()` 的 `task_validated` 事件之后调用：

```js
  await notifyParentSession({
    stateDir,
    client,
    state: nextState,
    key: "completion_report",
    eventType: "parent_completion_report_sent",
    failureEventType: "parent_completion_report_failed",
    text: parentCompletionReportText(nextState),
  })
```

- [ ] **Step 7: plan-runner final 后通知 parent resume**

放在 `handleAuditReviewMessage()` 后：

```js
async function handlePlanRunnerFinalNotification({ stateDir, client, event }) {
  if (event.type !== "message.updated" && event.type !== "message.part.updated") return
  const sessionID = event.properties?.sessionID
  if (!sessionID) return
  const index = await readSessionIndex(stateDir, sessionID)
  if (!index || index.role !== "plan-runner") return
  const state = await readTaskState(stateDir, index.task_id)
  if (!state || state.plan_runner_session_id !== sessionID || state.status === "validated") return

  if (event.type === "message.part.updated") {
    const text = extractTextFromMessagePart(event.properties?.part)
    if (!text) return
    const nextState = cloneState(state)
    nextState.pending_plan_runner_final_text = text
    nextState.updated_at = Date.now()
    await writeTaskState(stateDir, nextState)
    return
  }

  if (!event.properties?.info?.time?.completed) return
  const finalText = extractTextFromMessageInfo(event.properties?.info)
    || state.pending_plan_runner_final_text
    || ""
  await notifyParentSession({
    stateDir,
    client,
    state,
    key: `resume_required.${sessionID}`,
    eventType: "parent_resume_notification_sent",
    failureEventType: "parent_resume_notification_failed",
    text: parentResumeNotificationText(state, sessionID, finalText),
  })
}
```

在 event pipeline 中、`handlePlanRunnerWatchdogIdle()` 前加入：

```js
      await handlePlanRunnerFinalNotification({ stateDir, client, event })
```

- [ ] **Step 8: 跑 GREEN**

Run:

```bash
node --test --test-name-pattern "sends a parent completion report only after finish_plan validates|notifies the parent to resume when plan-runner ends before validated" "userconf/plugins/test/plan-runner-harness.test.mjs"
```

Expected: PASS，2 pass。

- [ ] **Step 9: 更新知识与 bug doc**

在 `docs/knowledge/subagent-dispatch-hook.md` 补充：

```markdown
- `status === "validated"` 是唯一成功完成条件。plan-runner raw final text 不能作为完成报告。
- `finish_plan` validated 后，harness 会向 parent session 发送 `[PLAN-RUNNER VALIDATED]` completion report，包含任务、验证、review gate 和 merge-back 指引。
- plan-runner session 若结束但 task-state 仍未 `validated`，harness 不修改业务状态，只向 parent session 发送 `[PLAN-RUNNER RESUME REQUIRED]`。主 agent 读取 task-state；需要用户决策就提问，不需要就调用 `start_plan_runner({ task_id, existing_worktree, reason, prompt })` 续派发。
```

在 `docs/bugs/bug-plan-runner-change-request-bypasses-harness-gate.md` 的修复方向改为：

```markdown
## 修复方向

- 成功完成报告只能来自 `finish_plan` validated 后的 harness parent notification。
- plan-runner 提前结束但未 validated 时，harness 只发送 resume notification，不新增业务终态，不覆盖原 `status` / `active_task` 现场。
- 主 agent 收到 notification 后检查 task-state；`status !== "validated"` 时只能续派发或询问用户，不能报告完成。
```

在实际验证段补充 RED/GREEN 命令。

---

### Task 10: 全量验证与人工交接材料

**Files:**
- Modify: `docs/bugs/bug-plan-runner-native-task-dispatch-shared-workspace.md`
- Modify: `docs/bugs/bug-plan-runner-change-request-bypasses-harness-gate.md`

- [ ] **Step 1: 跑 harness 全量**

Run:

```bash
node --test "userconf/plugins/test/plan-runner-harness.test.mjs"
```

Expected: PASS，数量应为当前 83 加新增 dedicated tool / ban / worktree / resume / parent notification tests 后的总数。

- [ ] **Step 2: 跑插件测试全量**

Run:

```bash
node --test "userconf/plugins/test"/*.mjs "scripts/test/opencode-subagent-event-probe.test.mjs"
```

Expected: PASS，数量应为当前 226 加新增测试后的总数。

- [ ] **Step 3: 跑 whitespace check**

Run:

```bash
git diff --check
```

Expected: no output。

- [ ] **Step 4: 把实际验证结果写入 bug doc**

在 `docs/bugs/bug-plan-runner-native-task-dispatch-shared-workspace.md` 末尾追加：

```markdown
## 实际验证

- RED：`node --test --test-name-pattern "start_plan_runner creates a harness-owned run worktree|rejects native task dispatch for plan-runner" "userconf/plugins/test/plan-runner-harness.test.mjs"` 在旧实现下失败。
- GREEN：focused tests 通过。
- `node --test "userconf/plugins/test/plan-runner-harness.test.mjs"`：通过。
- `node --test "userconf/plugins/test"/*.mjs "scripts/test/opencode-subagent-event-probe.test.mjs"`：通过。
- `git diff --check`：通过。
```

在 `docs/bugs/bug-plan-runner-change-request-bypasses-harness-gate.md` 末尾追加：

```markdown
## 实际验证

- RED：`node --test --test-name-pattern "sends a parent completion report only after finish_plan validates|notifies the parent to resume when plan-runner ends before validated" "userconf/plugins/test/plan-runner-harness.test.mjs"` 在旧实现下失败。
- GREEN：focused tests 通过。
- `node --test "userconf/plugins/test/plan-runner-harness.test.mjs"`：通过。
- `node --test "userconf/plugins/test"/*.mjs "scripts/test/opencode-subagent-event-probe.test.mjs"`：通过。
- `git diff --check`：通过。
```

- [ ] **Step 5: 最终报告需包含 merge-back 约束**

最终报告必须说明：

```markdown
- `start_plan_runner` 只产出 run worktree / branch / commit boundary；不会自动把结果合回 origin workspace。
- `finish_plan` validated 后，harness 会向 parent session 发送 `[PLAN-RUNNER VALIDATED]` completion report，并保留 `metadata.merge_back` / merge-back 命令指引。
- `start_plan_runner` 支持 `task_id` + `existing_worktree` 续派发；用于批准 Change Request 后继续已有 run worktree。
- plan-runner 结束但 task-state 未 `validated` 时，harness 发送 `[PLAN-RUNNER RESUME REQUIRED]`；不改变原 `status` / `active_task` 现场。
- origin workspace dirty 内容默认排除；合回前由主 agent 在 origin workspace 运行 `git status --short`，clean 时再执行 merge，dirty 时停止询问用户。
- merge 成功后由主 agent 显式执行 `git worktree remove <run_worktree>` 和 `git branch -d <branch>`。
- 原生 `task` 派发 plan-runner 已被拒绝，必须使用 `start_plan_runner`。
```

---

## 自审结果

- **Spec coverage:** 覆盖专用 tool、harness-owned worktree、existing worktree 续派发、parent completion report、parent resume notification、禁止原生 task、origin dirty 排除、linked origin 允许、finish_plan 绑定 run worktree、validated merge-back 指引、cleanup metadata、skill/docs/test 同步。
- **Placeholder scan:** 未发现禁用占位语句；每个代码变更步骤给出具体路径、代码块、命令和期望输出。
- **Type consistency:** 计划中统一使用 `start_plan_runner`、`task_id`、`existing_worktree`、`origin_worktree`、`worktree`、`branch`、`harness_owned_worktree`、`base_commit`、`git_base`、`parent_notifications` 字段；测试断言和实现片段字段名一致。
