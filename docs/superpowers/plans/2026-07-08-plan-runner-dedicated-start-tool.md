# Plan Runner 专用启动工具实现计划

> **给 agentic workers:** 本计划按 TDD 执行。优先使用 Plan-Runner 执行本计划；若 `start_plan_runner` 尚未实现导致无法自举，则使用 Inline Execution 在当前会话按任务执行。不要引用未纳入白名单的 Superpowers sub-skill。

**Goal:** 新增 `start_plan_runner` 专用工具，让 harness 负责创建新的 plan-runner 专属 worktree、派发 plan-runner session，并禁止原生 `task` 工具直接派发 plan-runner。

**Architecture:** `main workspace` 只作为调度入口；`start_plan_runner` 每次从当前 `HEAD` 创建 dedicated harness-owned linked worktree，位置固定为 origin workspace 内的 `.plan-runner-worktrees/<task_id>`。旧的非 `validated` task-state 只作为历史诊断/审计材料，不复用 `task_id`、不复用 harness state machine，也不支持 `task_id` / `existing_worktree` 形式的恢复参数。创建 worktree 前，harness 懒加载检查 origin workspace 的 `.gitignore`；若缺少 `.plan-runner-worktrees/` 条目则追加后再创建，保证该目录不被 Git 追踪。所有 plan-runner 写操作、测试、review 和 commit boundary 都绑定到该 run worktree。原生 `task` 仍可由普通 agent 使用，但 `subagent_type/agent = plan-runner` 必须被拒绝。

**Tech Stack:** OpenCode plugin custom tool、Node.js `node:test`、Git worktree、现有 `PlanRunnerHarnessPlugin` task-state/event/session 索引。

---

## 文件结构

- Modify: `userconf/plugins/plan-runner-harness.js`
  - 新增 `start_plan_runner` custom tool。
  - `start_plan_runner` 只支持创建新 run；重新派发必须产生新的 `task_id` 和新的 harness state。
  - 新增 plan-runner run worktree 创建 helper，路径为 `origin_worktree/.plan-runner-worktrees/<task_id>`。
  - 新增 `.gitignore` 懒加载 helper，确保 `.plan-runner-worktrees/` 不进入 origin `git status`。
  - 原生 `task` 派发 plan-runner 时直接拒绝。
  - 非 `validated` 的旧 state 只保留为诊断材料；如需继续，应把旧 task/worktree 信息写进新 prompt 作为历史上下文。
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
- Modify: `docs/bugs/bug-plan-runner-test-suite-worktree-setup-stall.md`
  - 记录默认测试慢化和 audit 回流竞态的 RCA，并说明 slow 分组验证方式。

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

### Task 7: 明确 run worktree 合回由主 agent 手工处理

**Files:**
- Modify: `docs/knowledge/subagent-dispatch-hook.md`

- [ ] **Step 1: 记录非自动合回约束**

本轮不让 harness 自动执行 `git merge`、`git worktree remove` 或 `git branch -d`。
`start_plan_runner` 只负责创建 run worktree 和绑定 plan-runner session；后续修复已让
`finish_plan` 在 `validated` 后通过 parent notification 提示主 agent 手工合回，合回 origin
workspace 仍属于主 agent 的显式步骤。

- [ ] **Step 2: 更新知识文档**

在 `docs/knowledge/subagent-dispatch-hook.md` 的 terminal gate 段落中加入：

```markdown
- harness 不自动把 run worktree 合回 origin workspace，也不自动删除 run worktree。
  `finish_plan` 进入 `validated` 后会向 parent session 投递 merge-back 通知。主 agent 若要
  合回，必须先在 origin workspace 检查 `git status --short`；clean 时再执行通知中的
  `git merge --ff-only <branch>` 和 `git worktree remove <run_worktree>`。dirty 时停止并询问用户。
```

- [ ] **Step 3: 验证**

该约束是文档/流程边界；代码层由现有行为保证：harness 没有 merge / cleanup helper，
只在 `validated` 后回投 parent-facing merge-back 通知。

---

### Task 8: `start_plan_runner` 重派发必须创建全新 task-state

**Files:**
- Modify: `userconf/plugins/test/plan-runner-harness.test.mjs`
- Modify: `docs/knowledge/subagent-dispatch-hook.md`

- [ ] **Step 1: 写 fresh-state re-dispatch 回归测试**

在 dedicated tool 用例附近新增：

```js
it("start_plan_runner creates a fresh task state instead of resuming non-validated runs", async () => {
  // 第一次 start_plan_runner 生成 task A。
  // 手工把 task A 改成非 validated 状态，并留下历史 resume 字段模拟旧残留。
  // 第二次 start_plan_runner 必须生成 task B。
  // 断言 task A 未被改写，task B 不含 resume / previous_plan_runner_session_id。
})
```

核心断言：
- `second.metadata.task_id !== first.metadata.task_id`
- `second.metadata.worktree !== first.metadata.worktree`
- 旧 task-state 的 `status` / 历史字段保持不变
- 新 task-state 为 `planning_required`
- 新 task-state 不含 `resume` / `previous_plan_runner_session_id`
- 新 event log 只有新 run 的 `dispatch_started`，没有 `plan_runner_resumed`

- [ ] **Step 2: 跑 focused 回归**

Run:

```bash
node --test --test-name-pattern "start_plan_runner creates a fresh task state" "userconf/plugins/test/plan-runner-harness.test.mjs"
```

Expected: PASS。该测试锁定当前 fresh-state 语义，不要求新增生产实现。

- [ ] **Step 3: 更新知识文档**

在 `docs/knowledge/subagent-dispatch-hook.md` 补充：

```markdown
- `start_plan_runner` 只创建新的 run worktree 和新的 task-state。非 `validated` 的旧
  task-state 只作为历史诊断材料；重新派发时不要传 `task_id` / `existing_worktree`，也不要
  改写旧 state。若需要延续上下文，把旧 task id、旧 worktree 和发现写入新的 prompt。
```

---

### Task 9: 默认测试保持快速，terminal-gate 集成路径 opt-in

**Files:**
- Modify: `userconf/plugins/test/plan-runner-harness.test.mjs`
- Add: `docs/bugs/bug-plan-runner-test-suite-worktree-setup-stall.md`
- Modify: `docs/knowledge/subagent-dispatch-hook.md`

- [ ] **Step 1: fixture 分层**

默认 `dispatchPlanRunner()` 写等价 task-state/session fixture；只有 `dedicated: true`
或 dedicated tool 专属用例真实调用 `start_plan_runner` 创建 run worktree。

- [ ] **Step 2: 慢测分组**

新增：

```js
const RUN_SLOW_PLAN_RUNNER_TESTS = process.env.OPENCODE_PLAN_RUNNER_SLOW_TESTS === "1"
const slowIt = RUN_SLOW_PLAN_RUNNER_TESTS ? it : it.skip
```

audit dispatch、audit regeneration、external review command、fail-open、完整 `finish_plan`
等待链用例使用 `slowIt(...)`。默认测试只保留快速核心状态机覆盖。

- [ ] **Step 3: 修正 audit 回流同步点**

`prepareAuditReviewState()` 不能只等待 `state.status === "audit_review"`，必须等
`audit_review_dispatched` event 出现后再让测试回灌 `ses_audit` 的 message/idle 事件，避免
session index 尚未写入时丢事件。

- [ ] **Step 4: 验证默认与慢测**

Run:

```bash
node --test "userconf/plugins/test/plan-runner-harness.test.mjs"
OPENCODE_PLAN_RUNNER_SLOW_TESTS=1 node --test "userconf/plugins/test/plan-runner-harness.test.mjs"
```

Expected: 默认 suite 在 30s 内通过并跳过 slow 用例；slow opt-in suite 全部通过。

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

Expected: PASS，默认跳过 slow terminal-gate 集成用例。

- [ ] **Step 2: 跑 harness slow opt-in**

Run:

```bash
OPENCODE_PLAN_RUNNER_SLOW_TESTS=1 node --test "userconf/plugins/test/plan-runner-harness.test.mjs"
```

Expected: PASS，slow 用例全部执行。

- [ ] **Step 3: 跑插件测试全量**

Run:

```bash
node --test "userconf/plugins/test"/*.mjs "scripts/test/opencode-subagent-event-probe.test.mjs"
```

Expected: PASS，默认跳过 slow terminal-gate 集成用例。

- [ ] **Step 4: 跑 whitespace check**

Run:

```bash
git diff --check
```

Expected: no output。

- [ ] **Step 5: 把实际验证结果写入 bug doc**

在 `docs/bugs/bug-plan-runner-test-suite-worktree-setup-stall.md` 记录默认测试、slow opt-in、
全量插件测试和 whitespace check 的实际结果。

- [ ] **Step 6: 最终报告需包含边界约束**

最终报告必须说明：

```markdown
- `start_plan_runner` 每次创建新的 run worktree / branch / task-state。
- 非 `validated` 旧 state 只作为历史诊断/审计材料；重新派发必须新建 run，不传 `task_id` / `existing_worktree`。
- origin workspace dirty 内容默认排除；`validated` 后 harness 向 parent session 回投 merge-back 通知；合回前由主 agent 在 origin workspace 运行 `git status --short`，clean 时再执行通知中的 `git merge --ff-only <branch>`，dirty 时停止询问用户。
- merge 成功后由主 agent 显式执行 `git worktree remove <run_worktree>`；是否删除 branch 按本地 git workflow 决定。
- 原生 `task` 派发 plan-runner 已被拒绝，必须使用 `start_plan_runner`。
```

---

## 自审结果

- **Spec coverage:** 覆盖专用 tool、harness-owned worktree、fresh-state 重派发、禁止原生 task、origin dirty 排除、linked origin 允许、finish_plan 绑定 run worktree、测试快慢分组、skill/docs/test 同步。
- **Placeholder scan:** 未发现禁用占位语句；每个代码变更步骤给出具体路径、代码块、命令和期望输出。
- **Type consistency:** 计划中统一使用 `start_plan_runner`、`origin_worktree`、`worktree`、`branch`、`harness_owned_worktree`、`base_commit`、`git_base` 字段；`task_id` 只作为新 run 的 metadata，不作为恢复参数。
