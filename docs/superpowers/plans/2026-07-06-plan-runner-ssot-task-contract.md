# Plan-runner SSOT Task Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace plan-runner's `todowrite`-derived task ledger with a single structured `write_plan.tasks` contract owned by the harness.

**Architecture:** The main agent provides the human-readable Execution Brief in the plan-runner dispatch prompt. The plan-runner agent calls `write_plan({ tasks })` exactly once to define the machine execution contract, then drives task progress through harness-owned task status tools instead of OpenCode `todowrite`. Child implementation dispatch is still initiated by plan-runner calling OpenCode `task()`; the harness intercepts that call to choose the child agent, create a worktree, and enforce paths. The harness records objective evidence from tool events, Git diff, and command exits; audit/external review remain fixed lifecycle gates outside the agent-defined task list.

**Tech Stack:** OpenCode plugin hooks, JavaScript ESM, Node `node:test`, filesystem JSON state under `~/.config/opencode/task-state`, external reviewer CLI, Git commit ranges.

---

## Scope Check

This plan covers one subsystem: `plan-runner` harness state and prompt protocol. It intentionally does not redesign the external review skill, provider fallback, or OpenCode core task API. Those remain existing dependencies consumed through current interfaces.

## File Structure

- Modify: `userconf/plugins/plan-runner-harness.js`
  - Owns the plan-runner state machine, custom tools, phase gate, child worktree creation, event-derived evidence, deterministic checks, audit dispatch, external review dispatch, and task-state JSON schema.
- Modify: `userconf/plugins/test/plan-runner-harness.test.mjs`
  - SSOT for harness behavior. Add RED tests before each behavior change.
- Modify: `userconf/agents/plan-runner.md`
  - Remove `todowrite Tn:` protocol from plan-runner instructions. Deny `todowrite` permission directly so the tool is not visible to the agent. Require `write_plan({ tasks })`, `start_task`, `complete_task`, `finish_plan`.
- Modify: `userconf/agents/plan-runner-audit.md`
  - Keep audit read-only, keep no explicit `model` field so OpenCode inherits the parent plan-runner/session model, and update wording from todo list review to structured task contract review.
- Modify: `userconf/plugins/test/init-opencode-agents.test.mjs`
  - Assert updated plan-runner prompt contract, direct `todowrite` denial, audit model inheritance, and absence of stale `todowrite` lifecycle requirements.
- Modify: `docs/knowledge/subagent-dispatch-hook.md`
  - Document the new single source of truth: `write_plan.tasks` plus harness-owned task status.
- Modify: `docs/runbook/plan-runner-smoke.md`
  - Update smoke instructions and pass criteria for structured `write_plan.tasks` and `start_task/complete_task`.
- Optional create: `docs/bugs/bug-plan-runner-duplicated-task-state.md`
  - Only create this if the implementer classifies the current duplicate `write_plan`/`todowrite` task state as a bugfix rather than a planned refactor. If created, use the repo's six-element bug format before implementation.

## Desired State Shape

The task-state JSON should use `write_plan.tasks` as the only task definition source:

```json
{
  "version": 2,
  "task_id": "planrun-ses_parent-call_dispatch",
  "status": "ready_to_execute",
  "parent_session_id": "ses_parent",
  "dispatch_call_id": "call_dispatch",
  "plan_runner_session_id": "ses_plan_runner",
  "worktree": "/repo",
  "base_commit": "<sha>",
  "brief_path": "/Users/name/.config/opencode/task-state/briefs/planrun-...md",
  "brief_sha256": "<sha256>",
  "tasks": [
    {
      "id": "T1",
      "title": "update plan-runner harness schema",
      "files": ["userconf/plugins/plan-runner-harness.js"],
      "checks": ["node --test userconf/plugins/test/plan-runner-harness.test.mjs"],
      "negative_checks": [],
      "status": "pending",
      "evidence": []
    }
  ],
  "active_task": null,
  "child_sessions": [
    {
      "session_id": "ses_child",
      "role": "executor",
      "status": "running",
      "worktree": "/repo/.plan-runner/worktrees/planrun-ses_parent-call_dispatch/call_child",
      "branch": "planrunner/planrun-ses_parent-call_dispatch/call_child",
      "base_commit": "<sha>"
    }
  ],
  "reviews": { "audit": [], "external": [] },
  "completion_gate": null,
  "gate_failures": []
}
```

Do not keep `todo.last_seen`, `todo.mirrored`, `plan_contract.dag`, or `plan_contract.parallel_sets` in newly written version 2 state. Read old version 1 state only for diagnostics and tests that explicitly cover backward compatibility.

## Child Worktree Isolation Invariant

When plan-runner dispatches implementation child subagents with `task`, the harness must create a Git worktree before the child is created. The child receives a prompt that names the assigned worktree and requires all file operations and bash commands to run there. The task output visible to plan-runner must include the child worktree path and branch so the root plan-runner knows where the child wrote code.

This plan does not add autonomous DAG scheduling inside the harness. Plan-runner still decides when an implementation child is needed and still triggers dispatch by calling `task(background=true, ...)`. The harness owns the mechanics and policy of that dispatch, not the scheduling decision.

Important boundary: OpenCode's `task` tool currently has no `workdir` or `directory` parameter. The harness therefore cannot rely on task parameters alone. It must enforce isolation by combining all of these controls:

- Create the worktree with `git worktree add` using `execFile`, not shell string concatenation.
- Mutate the child prompt before task dispatch to include the assigned worktree path, branch, and required final report format.
- Record the child session in task-state with `{ session_id, role, status, worktree, branch, base_commit }`.
- Apply phase-gate checks to child sessions as well as the root plan-runner session.
- For child `bash` calls, set or require `workdir` to the assigned child worktree.
- For child file tools, reject absolute paths outside the assigned child worktree.
- Require child final reports to include `Child worktree: <path>` and `Child branch: <branch>`; also append this metadata to the immediate `task` output if the hook API allows mutating the tool output.
- Root plan-runner remains responsible for inspecting child worktrees, merging accepted changes back to the root worktree, resolving conflicts, and running final validation.

## Audit Agent Model Inheritance Invariant

`plan-runner-audit` must not set a `model` field in frontmatter or `agents.json`. The harness dispatches it with `body.agent = "plan-runner-audit"` from the plan-runner session; OpenCode should resolve the audit run using the parent/session model context. If a future OpenCode version stops inheriting this model, fix the dispatcher only after proving the behavior change with a live smoke, not by silently hard-coding a model in `plan-runner-audit.md`.

### Task 1: Define Structured `write_plan.tasks` With RED Tests

**Files:**
- Modify: `userconf/plugins/test/plan-runner-harness.test.mjs:319-488`
- Modify: `userconf/plugins/plan-runner-harness.js:166-201`
- Modify: `userconf/plugins/plan-runner-harness.js:1504-1536`

- [ ] **Step 1: Add a helper for structured plan tasks in the harness tests**

Add this helper near the existing `planContent()` helper in `userconf/plugins/test/plan-runner-harness.test.mjs`:

```js
function structuredPlanTasks() {
  return [
    {
      id: "T1",
      title: "update plan-runner harness schema",
      files: ["userconf/plugins/plan-runner-harness.js"],
      checks: ["node --test userconf/plugins/test/plan-runner-harness.test.mjs"],
      negative_checks: [],
    },
    {
      id: "T2",
      title: "update plan-runner prompt contract",
      files: ["userconf/agents/plan-runner.md", "userconf/plugins/test/init-opencode-agents.test.mjs"],
      checks: ["node --test userconf/plugins/test/init-opencode-agents.test.mjs"],
      negative_checks: [],
    },
  ]
}
```

- [ ] **Step 2: Replace the old content-only write_plan test with a RED structured-contract test**

Replace the test named `write_plan writes content markdown and leaves task contract for todo derivation` with:

```js
it("write_plan stores structured tasks as the single execution contract", async () => {
  const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
  try {
    const workspace = join(root, "workspace")
    const stateDir = join(root, "state")
    const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })

    const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Execution Brief:\nImplement the brief." } }
    await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
    await hooks["tool.execute.after"](
      { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
      { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
    )

    const result = await hooks.tool.write_plan.execute(
      { tasks: structuredPlanTasks() },
      makeContext({ sessionID: "ses_plan_runner", workspace }),
    )

    assert.match(String(result.output || result), /task contract written/i)
    const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
    assert.equal(state.version, 2)
    assert.equal(state.status, "ready_to_execute")
    assert.equal(state.active_task, null)
    assert.deepEqual(state.tasks, structuredPlanTasks().map((task) => ({ ...task, status: "pending", evidence: [] })))
    assert.equal("todo" in state, false)
    assert.equal("plan_contract" in state, false)
    assert.ok(state.brief_path)
    assert.ok(state.brief_sha256)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

- [ ] **Step 3: Add a RED test that content-only write_plan no longer advances the state**

Add this test after the structured-contract test:

```js
it("write_plan rejects content-only plans because tasks are the SSOT", async () => {
  const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
  try {
    const workspace = join(root, "workspace")
    const stateDir = join(root, "state")
    const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })

    const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Execution Brief:\nImplement the brief." } }
    await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
    await hooks["tool.execute.after"](
      { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
      { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
    )

    await assert.rejects(
      () => hooks.tool.write_plan.execute(
        { content: "# Human-only plan" },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      ),
      /write_plan requires tasks/i,
    )

    const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
    assert.equal(state.status, "planning_required")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

- [ ] **Step 4: Run the focused test and verify RED**

Run:

```bash
node --test userconf/plugins/test/plan-runner-harness.test.mjs --test-name-pattern "write_plan"
```

Expected: FAIL. The existing implementation still requires `content`, leaves `plan_contract`, and does not write `tasks` as the SSOT.

- [ ] **Step 5: Commit the RED tests**

```bash
git add userconf/plugins/test/plan-runner-harness.test.mjs
git commit -m "test(plan-runner): 增加结构化计划契约用例"
```

### Task 2: Implement Version 2 Task State And Structured `write_plan`

**Files:**
- Modify: `userconf/plugins/plan-runner-harness.js:8-19`
- Modify: `userconf/plugins/plan-runner-harness.js:75-83`
- Modify: `userconf/plugins/plan-runner-harness.js:166-201`
- Modify: `userconf/plugins/plan-runner-harness.js:1504-1536`

- [ ] **Step 1: Change the state version and add brief paths**

In `userconf/plugins/plan-runner-harness.js`, change the state version and add a brief path helper near `statePaths()`:

```js
const STATE_VERSION = 2

function statePaths(stateDir, taskID) {
  return {
    task: join(stateDir, "tasks", `${taskID}.json`),
    events: join(stateDir, "events", `${taskID}.jsonl`),
    brief: join(stateDir, "briefs", `${taskID}.md`),
  }
}
```

- [ ] **Step 2: Replace the initial state task ledger fields**

Update `createInitialState()` so new state no longer writes `plan_contract` or `todo`:

```js
function createInitialState({ taskID, parentSessionID, dispatchCallID, worktree }) {
  return {
    version: STATE_VERSION,
    task_id: taskID,
    status: "dispatching",
    parent_session_id: parentSessionID,
    dispatch_call_id: dispatchCallID,
    plan_runner_session_id: null,
    worktree,
    base_commit: null,
    updated_at: Date.now(),
    brief_path: null,
    brief_sha256: null,
    tasks: [],
    active_task: null,
    child_sessions: [],
    reviews: {
      audit: [],
      external: [],
    },
    completion_gate: null,
    gate_failures: [],
  }
}
```

- [ ] **Step 3: Add task schema normalization helpers**

Add these helpers before `writePlanTool()`:

```js
function normalizeTaskID(value, index) {
  const id = String(value || `T${index + 1}`).trim()
  if (!/^T[1-9]\d*$/.test(id)) throw new Error(`write_plan task id must be Tn, got ${id}`)
  return id
}

function normalizeStringList(value, label, taskID) {
  if (!Array.isArray(value)) throw new Error(`write_plan ${taskID}.${label} must be an array`)
  return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))]
}

function normalizePlanTasks(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) throw new Error("write_plan requires tasks")
  const normalized = tasks.map((task, index) => {
    const id = normalizeTaskID(task?.id, index)
    const title = String(task?.title || "").trim()
    if (!title) throw new Error(`write_plan ${id}.title is required`)
    return {
      id,
      title,
      files: normalizeStringList(task?.files || [], "files", id),
      checks: normalizeStringList(task?.checks || [], "checks", id),
      negative_checks: normalizeStringList(task?.negative_checks || [], "negative_checks", id),
      status: "pending",
      evidence: [],
    }
  })
  const ids = normalized.map((task) => task.id)
  if (new Set(ids).size !== ids.length) throw new Error("write_plan task ids must be unique")
  const expected = normalized.map((_, index) => `T${index + 1}`)
  if (ids.join(",") !== expected.join(",")) throw new Error(`write_plan task ids must be contiguous: ${expected.join(", ")}`)
  return normalized
}
```

- [ ] **Step 4: Store the dispatch brief outside the repo**

In `tool.execute.before`, after `state.base_commit = gitInfo.head || null`, write the prompt to `statePaths(stateDir, taskID).brief`:

```js
const briefPath = statePaths(stateDir, taskID).brief
const briefContent = String(output.args.prompt || "")
await ensureDir(dirname(briefPath))
await writeFile(briefPath, briefContent.endsWith("\n") ? briefContent : `${briefContent}\n`)
state.brief_path = briefPath
state.brief_sha256 = sha256(briefContent)
```

Keep this file under `~/.config/opencode/task-state/briefs/` so dispatch does not dirty the repo before plan-runner starts.

- [ ] **Step 5: Rewrite `writePlanTool()` to consume only tasks**

Replace the body after the status check with:

```js
const tasks = normalizePlanTasks(args?.tasks)
state.status = "ready_to_execute"
state.updated_at = Date.now()
state.tasks = tasks
state.active_task = null
delete state.plan_contract
delete state.todo
delete state.plan_path
delete state.plan_sha256
await writeTaskState(stateDir, state)
await appendEvent(stateDir, state.task_id, { type: "plan_contract_written", task_count: tasks.length })
return {
  output: `task contract written: ${tasks.length} tasks`,
  metadata: { task_id: state.task_id, task_count: tasks.length },
}
```

- [ ] **Step 6: Run the focused write_plan tests and verify GREEN**

Run:

```bash
node --test userconf/plugins/test/plan-runner-harness.test.mjs --test-name-pattern "write_plan"
```

Expected: PASS for the structured write_plan tests. Some unrelated old tests may still fail if they depend on `todowrite`; those are handled in later tasks.

- [ ] **Step 7: Commit the structured write_plan implementation**

```bash
git add userconf/plugins/plan-runner-harness.js userconf/plugins/test/plan-runner-harness.test.mjs
git commit -m "fix(plan-runner): 使用结构化计划作为任务事实源"
```

### Task 3: Replace `todowrite` Cursor With Harness Task Status Tools

**Files:**
- Modify: `userconf/plugins/plan-runner-harness.js:9-12`
- Modify: `userconf/plugins/plan-runner-harness.js:414-443`
- Modify: `userconf/plugins/plan-runner-harness.js:1558-1576`
- Modify: `userconf/plugins/test/plan-runner-harness.test.mjs`

- [ ] **Step 1: Add RED tests for `start_task` and `complete_task`**

Add this test after the structured write_plan tests:

```js
it("start_task and complete_task maintain the single task status cursor", async () => {
  const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
  try {
    const workspace = join(root, "workspace")
    const stateDir = join(root, "state")
    const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })

    const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Execution Brief:\nImplement the brief." } }
    await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
    await hooks["tool.execute.after"](
      { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
      { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
    )
    await hooks.tool.write_plan.execute({ tasks: structuredPlanTasks() }, makeContext({ sessionID: "ses_plan_runner", workspace }))

    await hooks.tool.start_task.execute({ id: "T1" }, makeContext({ sessionID: "ses_plan_runner", workspace }))
    let state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
    assert.equal(state.status, "executing")
    assert.equal(state.active_task, "T1")
    assert.equal(state.tasks[0].status, "in_progress")
    assert.equal(state.tasks[1].status, "pending")

    await hooks.tool.complete_task.execute({ id: "T1" }, makeContext({ sessionID: "ses_plan_runner", workspace }))
    state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
    assert.equal(state.active_task, null)
    assert.equal(state.tasks[0].status, "completed")
    assert.equal(state.tasks[1].status, "pending")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Add a RED test that execution tools require `active_task` and `todowrite` is blocked**

Add this test after the previous one:

```js
it("blocks execution tools until start_task selects an active task", async () => {
  const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
  try {
    const workspace = join(root, "workspace")
    const stateDir = join(root, "state")
    const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })

    const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Execution Brief:\nImplement the brief." } }
    await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
    await hooks["tool.execute.after"](
      { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
      { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
    )
    await hooks.tool.write_plan.execute({ tasks: structuredPlanTasks() }, makeContext({ sessionID: "ses_plan_runner", workspace }))

    await assert.rejects(
      () => hooks["tool.execute.before"]({ tool: "bash", sessionID: "ses_plan_runner", callID: "call_bash" }, { args: { command: "git status --short" } }),
      /start_task is required before execution tools/i,
    )
    await assert.rejects(
      () => hooks["tool.execute.before"]({ tool: "todowrite", sessionID: "ses_plan_runner", callID: "call_todo" }, { args: { todos: [] } }),
      /todowrite is forbidden for plan-runner/i,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

- [ ] **Step 3: Run the new tests and verify RED**

Run:

```bash
node --test userconf/plugins/test/plan-runner-harness.test.mjs --test-name-pattern "start_task|active task"
```

Expected: FAIL because `start_task` and `complete_task` do not exist yet, execution still checks `todowrite` state, and `todowrite` is not globally blocked for plan-runner sessions.

- [ ] **Step 4: Replace tool allowlists**

At the top of `userconf/plugins/plan-runner-harness.js`, replace the old todo tool sets with:

```js
const PLANNING_TOOLS = new Set(["read", "glob", "grep", "webfetch", "question", "skill", "write_plan"])
const READY_TO_EXECUTE_TOOLS = new Set(["read", "glob", "grep", "webfetch", "question", "skill", "start_task"])
const EXECUTION_TOOLS = new Set(["read", "glob", "grep", "webfetch", "question", "skill", "edit", "write", "apply_patch", "bash", "task", "complete_task", "finish_plan"])
const EXECUTION_CONTEXT_TOOLS = new Set(["edit", "write", "apply_patch", "bash", "task"])
```

Do not include `todowrite` in any plan-runner allowlist. Add an early guard in `enforcePhaseGate()`:

```js
if (input.tool === "todowrite") throw new Error("plan-runner phase gate: todowrite is forbidden for plan-runner")
```

- [ ] **Step 5: Add task lookup and status helpers**

Add these helpers near `cloneState()`:

```js
function findTask(state, id) {
  return (state.tasks || []).find((task) => task.id === id) || null
}

function updateTask(state, id, patch) {
  const index = (state.tasks || []).findIndex((task) => task.id === id)
  if (index < 0) throw new Error(`unknown plan task: ${id}`)
  state.tasks[index] = { ...state.tasks[index], ...patch }
  return state.tasks[index]
}

function activeTask(state) {
  return state.active_task ? findTask(state, state.active_task) : null
}

function unfinishedTasks(state) {
  return (state.tasks || []).filter((task) => task.status === "pending" || task.status === "in_progress")
}
```

- [ ] **Step 6: Add `start_task` tool**

Inside the plugin `tool` object, add:

```js
start_task: tool({
  description: "Start executing one structured plan task.",
  args: { id: tool.schema.string().min(1) },
  async execute(args, context) {
    if (context.agent !== "plan-runner") throw new Error("start_task is only available to the plan-runner agent")
    const sessionIndex = await readSessionIndex(stateDir, context.sessionID)
    if (!sessionIndex) throw new Error("start_task session is not bound to a plan-runner task")
    const state = await readTaskState(stateDir, sessionIndex.task_id)
    if (!state) throw new Error("start_task task state is not readable")
    if (state.status !== "ready_to_execute" && state.status !== "executing") throw new Error(`start_task requires ready_to_execute or executing status, got ${state.status}`)
    if (state.active_task) throw new Error(`complete active task ${state.active_task} before starting another task`)
    const task = findTask(state, args.id)
    if (!task) throw new Error(`unknown plan task: ${args.id}`)
    if (task.status === "completed") throw new Error(`task ${args.id} is already completed`)
    state.active_task = args.id
    state.status = "executing"
    updateTask(state, args.id, { status: "in_progress" })
    state.updated_at = Date.now()
    await writeTaskState(stateDir, state)
    await appendEvent(stateDir, state.task_id, { type: "task_started", task_id: args.id })
    return `started ${args.id}`
  },
})
```

- [ ] **Step 7: Add `complete_task` tool**

Inside the plugin `tool` object, add:

```js
complete_task: tool({
  description: "Mark the active structured plan task as claimed complete.",
  args: { id: tool.schema.string().min(1) },
  async execute(args, context) {
    if (context.agent !== "plan-runner") throw new Error("complete_task is only available to the plan-runner agent")
    const sessionIndex = await readSessionIndex(stateDir, context.sessionID)
    if (!sessionIndex) throw new Error("complete_task session is not bound to a plan-runner task")
    const state = await readTaskState(stateDir, sessionIndex.task_id)
    if (!state) throw new Error("complete_task task state is not readable")
    if (state.active_task !== args.id) throw new Error(`complete_task must target active task ${state.active_task || "<none>"}`)
    updateTask(state, args.id, { status: "completed" })
    state.active_task = null
    state.updated_at = Date.now()
    await writeTaskState(stateDir, state)
    await appendEvent(stateDir, state.task_id, { type: "task_completed", task_id: args.id })
    return `completed ${args.id}`
  },
})
```

- [ ] **Step 8: Update the phase gate to use `active_task`**

Replace the `ready_to_execute/executing/repairing` branch in `enforcePhaseGate()` with:

```js
if (state.status === "ready_to_execute") {
  if (!READY_TO_EXECUTE_TOOLS.has(input.tool)) throw new Error(`plan-runner phase gate: ${input.tool} is not allowed during ready_to_execute`)
  return
}

if (state.status === "executing" || state.status === "repairing") {
  if (!EXECUTION_TOOLS.has(input.tool)) throw new Error(`plan-runner phase gate: ${input.tool} is not allowed during ${state.status}`)
  if (EXECUTION_CONTEXT_TOOLS.has(input.tool) && !activeTask(state)) {
    throw new Error("plan-runner phase gate: start_task is required before execution tools")
  }
}
```

- [ ] **Step 9: Run start/complete tests and verify GREEN**

Run:

```bash
node --test userconf/plugins/test/plan-runner-harness.test.mjs --test-name-pattern "start_task|active task"
```

Expected: PASS.

- [ ] **Step 10: Commit task cursor tools**

```bash
git add userconf/plugins/plan-runner-harness.js userconf/plugins/test/plan-runner-harness.test.mjs
git commit -m "fix(plan-runner): 用任务状态工具替代 todowrite 游标"
```

### Task 4: Attribute Evidence To `active_task` And Validate Files/Checks

**Files:**
- Modify: `userconf/plugins/plan-runner-harness.js:472-500`
- Modify: `userconf/plugins/plan-runner-harness.js:509-548`
- Modify: `userconf/plugins/plan-runner-harness.js:1412-1435`
- Modify: `userconf/plugins/test/plan-runner-harness.test.mjs`

- [ ] **Step 1: Add RED test for command evidence on the active task**

Add this test near existing evidence tests:

```js
it("records bash command evidence on the active structured task", async () => {
  const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
  try {
    const workspace = join(root, "workspace")
    const stateDir = join(root, "state")
    const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })
    const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Execution Brief:\nImplement the brief." } }
    await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
    await hooks["tool.execute.after"](
      { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
      { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
    )
    await hooks.tool.write_plan.execute({ tasks: structuredPlanTasks() }, makeContext({ sessionID: "ses_plan_runner", workspace }))
    await hooks.tool.start_task.execute({ id: "T1" }, makeContext({ sessionID: "ses_plan_runner", workspace }))

    await hooks["tool.execute.after"](
      { tool: "bash", sessionID: "ses_plan_runner", callID: "call_check", args: { command: "node --test userconf/plugins/test/plan-runner-harness.test.mjs" } },
      { metadata: { exit: 0 } },
    )

    const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
    assert.deepEqual(state.tasks[0].evidence, [
      {
        id: "ev-command-call_check",
        type: "command",
        command: "node --test userconf/plugins/test/plan-runner-harness.test.mjs",
        success: true,
        exit_code: 0,
      },
    ])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Add RED test for missing required checks**

Add this deterministic failure test:

```js
it("deterministic check requires each task check command to run successfully", async () => {
  const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
  try {
    const workspace = initGitWorkspace(root)
    const stateDir = join(root, "state")
    const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir, externalReview: async () => ({ result: "pass", provider: "test", findings: "" }) })
    const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Execution Brief:\nImplement the brief." } }
    await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
    await hooks["tool.execute.after"](
      { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
      { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
    )
    await hooks.tool.write_plan.execute({ tasks: structuredPlanTasks() }, makeContext({ sessionID: "ses_plan_runner", workspace }))
    await hooks.tool.start_task.execute({ id: "T1" }, makeContext({ sessionID: "ses_plan_runner", workspace }))
    await hooks["tool.execute.after"](
      { tool: "edit", sessionID: "ses_plan_runner", callID: "call_edit", args: { filePath: join(workspace, "userconf/plugins/plan-runner-harness.js") } },
      { metadata: {} },
    )
    await hooks.tool.complete_task.execute({ id: "T1" }, makeContext({ sessionID: "ses_plan_runner", workspace }))

    const output = await hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))
    assert.match(String(output.output || output), /T1 missing successful check/i)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

Use the existing repository test helpers for Git setup if their names differ; keep the assertion text exact in the production failure message.

- [ ] **Step 3: Run the evidence tests and verify RED**

Run:

```bash
node --test userconf/plugins/test/plan-runner-harness.test.mjs --test-name-pattern "active structured task|missing successful check"
```

Expected: FAIL because evidence is still stored in top-level `evidence` and checks are not matched to `tasks[].checks`.

- [ ] **Step 4: Add task evidence helpers**

Add these helpers near `updateTask()`:

```js
function pushTaskEvidence(state, taskID, evidence) {
  const task = findTask(state, taskID)
  if (!task) throw new Error(`unknown plan task: ${taskID}`)
  const nextEvidence = (task.evidence || []).filter((item) => item.id !== evidence.id)
  updateTask(state, taskID, { evidence: [...nextEvidence, evidence] })
}

function taskCommandEvidence(task) {
  return (task.evidence || []).filter((item) => item.type === "command")
}

function taskDiffEvidence(task) {
  return (task.evidence || []).filter((item) => item.type === "diff")
}
```

- [ ] **Step 5: Record command evidence under the active task**

Replace the evidence object in `recordToolEvidence()` with:

```js
const task = activeTask(state)
if (!task) return
const exitCode = output.metadata?.exit ?? null
pushTaskEvidence(state, task.id, {
  id: `ev-command-${input.callID}`,
  type: "command",
  command: input.args?.command || "",
  success: exitCode === 0,
  exit_code: exitCode,
})
state.updated_at = Date.now()
await writeTaskState(stateDir, state)
await appendEvent(stateDir, state.task_id, { type: "evidence_recorded", evidence_id: `ev-command-${input.callID}`, tool: input.tool, call_id: input.callID, task_id: task.id })
```

- [ ] **Step 6: Record diff evidence under the active task**

Replace the task id lookup in `recordDiffEvidence()` with `const task = activeTask(state)`, and push this evidence:

```js
pushTaskEvidence(state, task.id, {
  id: `ev-diff-${eventID}`,
  type: "diff",
  files: normalizedFiles,
})
```

Keep `appendEvent()` with `task_id: task.id` for audit logs.

- [ ] **Step 7: Implement task-level deterministic failures**

Replace `taskEvidenceFailures()` with:

```js
function taskEvidenceFailures(task) {
  const reasons = []
  const diffFiles = new Set(taskDiffEvidence(task).flatMap((item) => item.files || []))
  for (const file of task.files || []) {
    if (!diffFiles.has(file)) reasons.push(`${task.id} missing diff evidence for ${file}`)
  }
  const successfulCommands = new Set(taskCommandEvidence(task).filter((item) => item.success).map((item) => item.command))
  for (const command of task.checks || []) {
    if (!successfulCommands.has(command)) reasons.push(`${task.id} missing successful check: ${command}`)
  }
  const failedCommands = new Set(taskCommandEvidence(task).filter((item) => !item.success).map((item) => item.command))
  for (const command of task.negative_checks || []) {
    if (!failedCommands.has(command)) reasons.push(`${task.id} missing failing negative check: ${command}`)
  }
  return reasons
}
```

- [ ] **Step 8: Update `findDeterministicCheckFailures()` to use `tasks` status**

Replace its task/todo checks with:

```js
if (!Array.isArray(state.tasks) || state.tasks.length === 0) reasons.push("write_plan task contract is empty")
if (state.active_task) reasons.push(`active task is still running: ${state.active_task}`)
for (const task of state.tasks || []) {
  if (task.status !== "completed") reasons.push(`${task.id} is not completed`)
  if (task.status === "completed") reasons.push(...taskEvidenceFailures(task))
}
```

- [ ] **Step 9: Run focused tests and verify GREEN**

Run:

```bash
node --test userconf/plugins/test/plan-runner-harness.test.mjs --test-name-pattern "active structured task|missing successful check"
```

Expected: PASS.

- [ ] **Step 10: Commit task evidence changes**

```bash
git add userconf/plugins/plan-runner-harness.js userconf/plugins/test/plan-runner-harness.test.mjs
git commit -m "fix(plan-runner): 用任务契约校验证据和检查命令"
```

### Task 5: Keep Audit And External Review As Harness Gates Outside Tasks

**Files:**
- Modify: `userconf/plugins/plan-runner-harness.js:589-618`
- Modify: `userconf/plugins/plan-runner-harness.js:849-870`
- Modify: `userconf/plugins/plan-runner-harness.js:1050-1076`
- Modify: `userconf/plugins/test/plan-runner-harness.test.mjs`
- Modify: `userconf/agents/plan-runner-audit.md`
- Modify: `userconf/plugins/test/init-opencode-agents.test.mjs`

- [ ] **Step 1: Add RED test that external review uses the dispatch brief, not write_plan markdown**

Add this test near existing external review tests:

```js
it("passes the dispatch brief path to external review as the spec", async () => {
  const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
  try {
    const workspace = initGitWorkspace(root)
    const stateDir = join(root, "state")
    let reviewedSpec = null
    const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, {
      stateDir,
      externalReview: async (state) => {
        reviewedSpec = state.brief_path
        return { result: "pass", provider: "test", findings: "" }
      },
    })

    const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Execution Brief:\nHuman review brief text." } }
    await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
    await hooks["tool.execute.after"](
      { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
      { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
    )
    await hooks.tool.write_plan.execute({ tasks: [structuredPlanTasks()[0]] }, makeContext({ sessionID: "ses_plan_runner", workspace }))

    await hooks.tool.start_task.execute({ id: "T1" }, makeContext({ sessionID: "ses_plan_runner", workspace }))
    await hooks["tool.execute.after"](
      { tool: "edit", sessionID: "ses_plan_runner", callID: "call_edit", args: { filePath: join(workspace, "userconf/plugins/plan-runner-harness.js") } },
      { metadata: {} },
    )
    await hooks["tool.execute.after"](
      { tool: "bash", sessionID: "ses_plan_runner", callID: "call_check", args: { command: "node --test userconf/plugins/test/plan-runner-harness.test.mjs" } },
      { metadata: { exit: 0 } },
    )
    await hooks.tool.complete_task.execute({ id: "T1" }, makeContext({ sessionID: "ses_plan_runner", workspace }))

    await hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))
    assert.ok(reviewedSpec)
    assert.match(readFileSync(reviewedSpec, "utf8"), /Human review brief text/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Run the external review spec test and verify RED**

Run:

```bash
node --test userconf/plugins/test/plan-runner-harness.test.mjs --test-name-pattern "dispatch brief path"
```

Expected: FAIL if `brief_path` is missing or external review still uses `plan_path`.

- [ ] **Step 3: Update external review command spec path**

In `runExternalReviewCommand()`, replace the spec argument logic with:

```js
if (state.brief_path) baseArgs.push("--spec", state.brief_path)
```

Do not fall back to `state.plan_path` for version 2 state. Version 1 fallback can be:

```js
else if (state.version === 1 && state.plan_path) baseArgs.push("--spec", state.plan_path)
```

- [ ] **Step 4: Update audit prompt to use structured tasks**

Replace `auditPromptText()` task/todo sections with:

```js
const planTasks = Array.isArray(state.tasks) ? state.tasks : []
const tasks = planTasks.length
  ? planTasks.map((task) => `- ${task.id}: ${task.status} - ${task.title}; files: ${(task.files || []).join(", ") || "none"}; checks: ${(task.checks || []).join(" | ") || "none"}`)
  : ["- none recorded"]
return [
  "Plan-runner audit_review_required: deterministic checks passed; audit the completed scope before the harness continues.",
  "- You are the harness-dispatched audit subagent. Do not modify files.",
  "- Check whether each completed task has a complete implementation, not just an interface shell, stub, mock, or code that only satisfies tests.",
  "- Review the injected Execution Brief, structured task contract, observed files, and observed validation commands.",
  "- Return only fields consumed by the harness: result, required_fixes.",
  `- Harness Task ID: ${state.task_id}`,
  `- Brief path: ${state.brief_path}`,
  "- Structured tasks:",
  ...tasks,
  "- Modified files observed by harness:",
  ...files,
].join("\n")
```

In existing audit dispatch tests that already inspect `prompts[0].body.agent`, add:

```js
assert.equal(prompts[0].body.agent, "plan-runner-audit")
assert.equal(prompts[0].body.model, undefined)
```

This preserves parent/session model inheritance; do not add `model` to the audit prompt body.

- [ ] **Step 5: Add RED audit-agent test for parent model inheritance and structured task wording**

Add or replace this test in `userconf/plugins/test/init-opencode-agents.test.mjs` near the existing audit-agent tests:

```js
it("plan-runner audit agent inherits parent model and reviews structured tasks", () => {
  const agent = readFileSync(join(repoRoot, "userconf", "agents", "plan-runner-audit.md"), "utf8")

  assert.match(agent, /^mode:\s*subagent$/m)
  assert.match(agent, /todowrite:\s*deny/)
  assert.doesNotMatch(agent, /^model:/m)
  assert.match(agent, /inherit.*parent.*model|parent.*session.*model/i)
  assert.match(agent, /structured task contract/i)
  assert.doesNotMatch(agent, /todo list/i)
})
```

Expected: FAIL because the current audit prompt still talks about the todo list and does not document model inheritance.

- [ ] **Step 6: Update the audit-agent visible contract without adding a model**

In `userconf/agents/plan-runner-audit.md`, keep the frontmatter without `model:` and replace the body with:

````markdown
You are a plan-runner audit reviewer. Validate whether the completed task
matches the harness terminal gate state. Do not modify files. Do not dispatch
subagents. Do not run commands.

This agent intentionally has no `model` frontmatter. It inherits the parent
plan-runner/session model selected by OpenCode.

Review only the provided Execution Brief, structured task contract, modified
files, validation context, scope deviations, and remaining risks. Every completed
structured task should correspond to real implemented behavior, not just an
interface shell, stub, mock, or code that only satisfies tests.

Set `result` to `fail` if the work appears incomplete, out of scope, or only
implemented enough to satisfy shallow checks.

Return only a JSON object. Do not wrap it in markdown fences. Do not include
extra explanation before or after the JSON.
Use only `result` and `required_fixes`; do not add task/file classification
fields.
If the harness asks you to regenerate because the previous response was invalid,
return the same JSON shape again and no surrounding prose.

```json
{
  "result": "pass" | "fail",
  "required_fixes": []
}
```

Use an empty array when no fixes are required. Set `result` to `fail` when any
required fix remains, and describe each fix as a concise string in
`required_fixes`.
````

- [ ] **Step 7: Keep review gates outside task status**

Search for tests or prompt text that ask the agent to create tasks for `audit_review`, `external_review`, `finish_plan`, or final report. Replace those assertions with wording that these are lifecycle gates and must not appear in `write_plan.tasks`.

Run:

```bash
node --test userconf/plugins/test/plan-runner-harness.test.mjs --test-name-pattern "external review|audit review|finish_plan"
```

Expected: PASS after updating tests and code.

- [ ] **Step 8: Commit review gate cleanup**

```bash
git add userconf/plugins/plan-runner-harness.js userconf/plugins/test/plan-runner-harness.test.mjs userconf/agents/plan-runner-audit.md userconf/plugins/test/init-opencode-agents.test.mjs
git commit -m "fix(plan-runner): 将审计与外审保持为固定门禁"
```

### Task 6: Update Plan-runner Prompt And Prompt Tests

**Files:**
- Modify: `userconf/agents/plan-runner.md`
- Modify: `userconf/plugins/test/init-opencode-agents.test.mjs:521-597`

- [ ] **Step 1: Add RED prompt test for structured task tools and direct `todowrite` permission denial**

Replace prompt assertions that require `todowrite Tn:` with:

```js
it("plan-runner prompt uses write_plan tasks and harness task status tools", () => {
  const prompt = readFileSync(join(repoRoot, "userconf", "agents", "plan-runner.md"), "utf8")

  const missing = missingPromptClauses(prompt, [
    { label: "write_plan tasks", pattern: /write_plan\(\{\s*tasks/i },
    { label: "start_task", pattern: /start_task/i },
    { label: "complete_task", pattern: /complete_task/i },
    { label: "tasks are single source of truth", pattern: /tasks.*single source of truth|single source of truth.*tasks/i },
    { label: "audit external lifecycle gates", pattern: /audit.*external.*lifecycle gates|lifecycle gates.*audit.*external/i },
    { label: "harness owns child dispatch", pattern: /harness-managed child dispatch|harness.*owns.*agent selection/i },
  ])

  assert.deepEqual(missing, [])
  assert.match(prompt, /todowrite:\s*deny/)
  assert.doesNotMatch(prompt, /Tn:\s*todo/i)
  assert.doesNotMatch(prompt, /mirror.*todo/i)
  assert.doesNotMatch(prompt, /\bexecutor\b/i)
})
```

- [ ] **Step 2: Run prompt test and verify RED**

Run:

```bash
node --test userconf/plugins/test/init-opencode-agents.test.mjs --test-name-pattern "write_plan tasks"
```

Expected: FAIL because the agent frontmatter still allows `todowrite` and the prompt still describes the old mirror behavior.

- [ ] **Step 3: Replace plan-runner permission and workflow wording**

In `userconf/agents/plan-runner.md`, change the frontmatter permission line to:

```yaml
  todowrite: deny
```

Then replace the workflow section with:

```markdown
Required workflow:

1. Read the injected Execution Brief and restate the scope in one short paragraph.
2. Inspect only enough context to define a concrete machine task contract.
3. Before editing, call `write_plan({ tasks })`. Every task must have `id`, `title`, `files`, `checks`, and `negative_checks` fields. The `tasks` array is the single source of truth for execution.
4. Execute one task at a time: call `start_task({ id })`, make the minimal changes, run the required checks, then call `complete_task({ id })`.
5. When implementation child work is needed, call `task(background=true, ...)` through the harness-managed child dispatch path. Do not choose or hard-code child agent types yourself; the harness owns agent selection, worktree creation, and path enforcement.
6. Do not create tasks for `finish_plan`, audit review, external review, waiting for validation, or final reporting. Those are harness lifecycle gates.
7. After all tasks are completed and validation commands are run, create a local git commit containing the plan-runner changes. Do not push.
8. Confirm the repo is clean after the local commit, then call `finish_plan` before writing any final report.
9. If `finish_plan` returns `repair_required`, repair the listed issues inside the same session without rewriting the original `tasks` contract unless the harness explicitly requires a new plan.
10. Only after `finish_plan` returns `validated`, return a concise final report with result, commit range, modified files, validation summary, scope deviations, and remaining risks.
```

- [ ] **Step 4: Add task contract wording**

In the same file, replace the Plan document requirements section with:

```markdown
Structured task contract requirements:

- `write_plan({ tasks })` is not a human review document. It is the machine execution contract consumed by the harness.
- Each task id must be contiguous: `T1`, `T2`, `T3`, ... without gaps.
- Each task `title` must describe one verifiable implementation slice.
- `files` must list exact repo-relative files that should change for the task. For no-diff validation tasks, use an empty `files` array and put the required command in `checks`.
- `checks` must list exact commands that must run successfully before `complete_task`.
- `negative_checks` must list exact commands expected to fail during an intentional negative-control step, when the task uses a negative-control test.
- Do not put audit review, external review, final reporting, or `finish_plan` into `tasks`.
```

- [ ] **Step 5: Run prompt tests and verify GREEN**

Run:

```bash
node --test userconf/plugins/test/init-opencode-agents.test.mjs --test-name-pattern "write_plan tasks|finish_plan"
```

Expected: PASS.

- [ ] **Step 6: Commit prompt changes**

```bash
git add userconf/agents/plan-runner.md userconf/plugins/test/init-opencode-agents.test.mjs
git commit -m "docs(plan-runner): 改用结构化任务契约提示"
```

### Task 7: Remove Old `todowrite` State Consumption And Update Documentation

**Files:**
- Modify: `userconf/plugins/plan-runner-harness.js`
- Modify: `userconf/plugins/test/plan-runner-harness.test.mjs`
- Modify: `docs/knowledge/subagent-dispatch-hook.md:85-240`
- Modify: `docs/runbook/plan-runner-smoke.md`

- [ ] **Step 1: Delete the todo event handler from active flow**

Remove or bypass these functions for version 2 state:

```js
handleTodoUpdated
derivePlanContractFromTodos
activeTodoTaskID
isTerminalGateTodo
originalTodos
```

Keep compatibility helpers only if tests still need to read old version 1 state. New version 2 event flow must not call `handleTodoUpdated()` for decision-making.

- [ ] **Step 2: Update final completeness checks**

In `finalCompletenessFailures()`, replace todo checks with task checks:

```js
if (!Array.isArray(state.tasks) || state.tasks.length === 0) reasons.push("write_plan task contract is empty")
if (state.active_task) reasons.push(`active task is still running: ${state.active_task}`)
for (const task of state.tasks || []) {
  if (task.status !== "completed") reasons.push(`${task.id} has no completed task status`)
  if (task.status === "completed") reasons.push(...taskEvidenceFailures(task))
}
if (state.child_sessions?.some((child) => child.status === "running")) reasons.push("child sessions are still running")
if (!state.reviews.audit.length && !gateFailedOpen(state, "audit_review")) reasons.push("audit review did not run")
if (state.reviews.external.at(-1)?.result !== "pass" && !gateFailedOpen(state, "external_review")) reasons.push("latest external review did not pass")
```

- [ ] **Step 3: Replace old tests that assert todo-derived contracts**

Delete tests whose behavior is now intentionally obsolete:

```text
write_plan writes content verbatim and derives the plan contract from Tn todos
keeps waiting_for_todo with an actionable diagnostic when todos cannot derive Tn tasks
phase gate blocks execution until plan is written and todos mirror all tasks
keeps waiting_for_todo with an actionable diagnostic when todo text omits harness task ids
maps T10 todo evidence to T10 instead of treating it as T1
```

Replace them with tests that assert `write_plan.tasks`, `start_task`, `complete_task`, and `active_task` behavior from Tasks 1-4.

- [ ] **Step 4: Update knowledge documentation**

In `docs/knowledge/subagent-dispatch-hook.md`, replace the section that says harness state comes from `todowrite Tn:` with:

```markdown
- `write_plan({ tasks })` 是执行任务的唯一事实源。主 agent 的 Execution Brief 是需求输入，不是状态机。
- harness 维护每个 task 的 `status`、`active_task` 和工具事件证据；plan-runner 不能通过 `todowrite` 或自报 evidence 重定义任务。
- `audit_review`、`external_review`、`finish_plan` 和最终报告是固定 lifecycle gate，不能进入 `write_plan.tasks`。
- deterministic check 只做机器事实检查：task 状态、files diff、checks 命令、negative checks、repo clean 和 commit range。
```

- [ ] **Step 5: Update the smoke runbook**

In `docs/runbook/plan-runner-smoke.md`, replace instructions that mention `todowrite` with:

```markdown
- 先调用 `write_plan({ tasks })` 定义结构化任务契约；
- 每个任务执行前调用 `start_task({ id })`，完成后调用 `complete_task({ id })`；
- 不使用 `todowrite` 作为 plan-runner 执行账本；
- 所有任务 completed 且验证命令完成后，先创建本地 commit，确认 repo clean，再调用 `finish_plan`。
```

- [ ] **Step 6: Run documentation and prompt tests**

Run:

```bash
node --test userconf/plugins/test/init-opencode-agents.test.mjs
git diff --check
```

Expected: all tests pass, no whitespace errors.

- [ ] **Step 7: Commit removal of todo dependency**

```bash
git add userconf/plugins/plan-runner-harness.js userconf/plugins/test/plan-runner-harness.test.mjs docs/knowledge/subagent-dispatch-hook.md docs/runbook/plan-runner-smoke.md
git commit -m "refactor(plan-runner): 移除 todowrite 执行账本依赖"
```

### Task 8: Add Harness-Managed Child Worktree Isolation

**Files:**
- Modify: `userconf/plugins/plan-runner-harness.js:79-88`
- Modify: `userconf/plugins/plan-runner-harness.js:132-149`
- Modify: `userconf/plugins/plan-runner-harness.js:155-157`
- Modify: `userconf/plugins/plan-runner-harness.js:1578-1627`
- Modify: `userconf/plugins/test/plan-runner-harness.test.mjs`
- Modify: `docs/knowledge/subagent-dispatch-hook.md:66-74`
- Modify: `docs/runbook/plan-runner-smoke.md`

- [ ] **Step 1: Add RED test that a plan-runner child task dispatch creates a git worktree**

Add this test near the task dispatch tests in `userconf/plugins/test/plan-runner-harness.test.mjs`:

```js
it("creates a git worktree before plan-runner dispatches an implementation child task", async () => {
  const root = mkdtempSync(join(tmpdir(), "plan-runner-child-worktree-"))
  try {
    const workspace = initGitWorkspace(root)
    const stateDir = join(root, "state")
    const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })

    const rootTaskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Execution Brief:\nImplement the brief." } }
    await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, rootTaskOutput)
    await hooks["tool.execute.after"](
      { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: rootTaskOutput.args },
      { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
    )
    await hooks.tool.write_plan.execute({ tasks: [structuredPlanTasks()[0]] }, makeContext({ sessionID: "ses_plan_runner", workspace }))
    await hooks.tool.start_task.execute({ id: "T1" }, makeContext({ sessionID: "ses_plan_runner", workspace }))

    const childOutput = { args: { background: true, subagent_type: "general", description: "implement T1", prompt: "Implement T1." } }
    await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_plan_runner", callID: "call_child" }, childOutput)

    assert.equal(childOutput.args.subagent_type, "executor")
    assert.match(childOutput.args.prompt, /Assigned child worktree:/)
    assert.match(childOutput.args.prompt, /Child branch:/)
    const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
    const child = state.child_sessions.find((item) => item.dispatch_call_id === "call_child")
    assert.ok(child)
    assert.equal(child.status, "dispatching")
    assert.equal(child.role, "executor")
    assert.equal(child.parent_task_id, "T1")
    assert.ok(child.worktree.startsWith(join(workspace, ".plan-runner", "worktrees")))
    assert.ok(existsSync(child.worktree))
    assert.match(child.branch, /^planrunner\//)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Add RED test that the child session index stores the assigned worktree**

Add this test after the previous one:

```js
it("records child session worktree metadata after child task dispatch returns", async () => {
  const root = mkdtempSync(join(tmpdir(), "plan-runner-child-worktree-"))
  try {
    const workspace = initGitWorkspace(root)
    const stateDir = join(root, "state")
    const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })

    const rootTaskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Execution Brief:\nImplement the brief." } }
    await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, rootTaskOutput)
    await hooks["tool.execute.after"](
      { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: rootTaskOutput.args },
      { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
    )
    await hooks.tool.write_plan.execute({ tasks: [structuredPlanTasks()[0]] }, makeContext({ sessionID: "ses_plan_runner", workspace }))
    await hooks.tool.start_task.execute({ id: "T1" }, makeContext({ sessionID: "ses_plan_runner", workspace }))

    const childOutput = { args: { background: true, subagent_type: "general", description: "implement T1", prompt: "Implement T1." } }
    await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_plan_runner", callID: "call_child" }, childOutput)
    await hooks["tool.execute.after"](
      { tool: "task", sessionID: "ses_plan_runner", callID: "call_child", args: childOutput.args },
      { metadata: { parentSessionId: "ses_plan_runner", sessionId: "ses_child", background: true } },
    )

    const childIndex = readJson(join(stateDir, "sessions", "ses_child.json"))
    assert.equal(childIndex.role, "child")
    assert.equal(childIndex.task_id, "planrun-ses_parent-call_dispatch")
    assert.ok(childIndex.worktree)
    const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
    const child = state.child_sessions.find((item) => item.session_id === "ses_child")
    assert.equal(child.status, "running")
    assert.equal(child.role, "executor")
    assert.equal(child.worktree, childIndex.worktree)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

- [ ] **Step 3: Run the child worktree tests and verify RED**

Run:

```bash
node --test userconf/plugins/test/plan-runner-harness.test.mjs --test-name-pattern "child worktree"
```

Expected: FAIL because child task dispatch currently uses the raw OpenCode `task` tool without creating worktrees or recording child worktree metadata.

- [ ] **Step 4: Add child worktree path helpers**

Add these helpers near `safeId()` in `userconf/plugins/plan-runner-harness.js`:

```js
function childWorktreeRoot(worktree, taskID) {
  return join(worktree, ".plan-runner", "worktrees", safeId(taskID))
}

function childWorktreePath(worktree, taskID, callID) {
  return join(childWorktreeRoot(worktree, taskID), safeId(callID))
}

function childBranchName(taskID, callID) {
  return `planrunner/${safeId(taskID)}/${safeId(callID)}`
}
```

- [ ] **Step 5: Extend session index metadata**

Replace `writeSessionIndex()` with an optional metadata argument:

```js
async function writeSessionIndex(stateDir, sessionID, taskID, role, metadata = {}) {
  await writeJsonAtomic(sessionPath(stateDir, sessionID), { session_id: sessionID, task_id: taskID, role, ...metadata })
}
```

Existing callers continue to work because `metadata` defaults to `{}`.

- [ ] **Step 6: Add child task detection**

Add this helper near `isPlanRunnerDispatch()`:

```js
function isPlanRunnerChildDispatch(input, state) {
  return input.tool === "task" && state?.plan_runner_session_id === input.sessionID && !isPlanRunnerDispatch(input.args || {})
}
```

This treats tasks launched by the bound plan-runner session as child implementation work unless they are recursive `plan-runner` dispatches, which should remain disallowed by prompt and review policy.

- [ ] **Step 7: Create the child worktree in `tool.execute.before`**

In `tool.execute.before`, before the generic `enforcePhaseGate()` branch returns for non-plan-runner task calls, add:

```js
const sessionIndex = await readSessionIndex(stateDir, input.sessionID)
const parentState = sessionIndex ? await readTaskState(stateDir, sessionIndex.task_id) : null
if (isPlanRunnerChildDispatch(input, parentState)) {
  if (!activeTask(parentState)) throw new Error("plan-runner child task dispatch requires an active task")
  const gitInfo = await inspectGitWorktree(parentState.worktree)
  if (gitInfo.status_porcelain) throw new Error(`plan_runner_requires_clean_repo_before_child_worktree: ${gitInfo.status_porcelain}`)
  const worktreePath = childWorktreePath(parentState.worktree, parentState.task_id, input.callID)
  const branch = childBranchName(parentState.task_id, input.callID)
  await ensureDir(dirname(worktreePath))
  await execFileAsync("git", ["-C", parentState.worktree, "worktree", "add", "-b", branch, worktreePath, gitInfo.head], { timeout: 60000 })
  const childAgent = "executor"
  output.args.subagent_type = childAgent
  const promptPrefix = [
    `Assigned child worktree: ${worktreePath}`,
    `Child branch: ${branch}`,
    `Base commit: ${gitInfo.head}`,
    "All file edits and bash commands for this child task must operate inside the assigned child worktree.",
    "Final response must include these exact lines:",
    `Child worktree: ${worktreePath}`,
    `Child branch: ${branch}`,
  ].join("\n")
  output.args.prompt = `${promptPrefix}\n\n${String(output.args.prompt || "")}`
  parentState.child_sessions = (parentState.child_sessions || []).filter((item) => item.dispatch_call_id !== input.callID)
  parentState.child_sessions.push({
    dispatch_call_id: input.callID,
    parent_task_id: parentState.active_task,
    role: childAgent,
    status: "dispatching",
    worktree: worktreePath,
    branch,
    base_commit: gitInfo.head,
  })
  parentState.updated_at = Date.now()
  await writeTaskState(stateDir, parentState)
  await appendEvent(stateDir, parentState.task_id, { type: "child_worktree_created", call_id: input.callID, task_id: parentState.active_task, worktree: worktreePath, branch })
  return
}
```

- [ ] **Step 8: Bind the returned child session to the worktree**

In `tool.execute.after`, before the existing plan-runner dispatch binding block, add:

```js
const sessionIndex = await readSessionIndex(stateDir, input.sessionID)
const parentState = sessionIndex ? await readTaskState(stateDir, sessionIndex.task_id) : null
if (isPlanRunnerChildDispatch(input, parentState)) {
  const childSessionID = output.metadata?.sessionId
  const parentSessionID = output.metadata?.parentSessionId
  if (!childSessionID || parentSessionID !== input.sessionID) return
  const child = (parentState.child_sessions || []).find((item) => item.dispatch_call_id === input.callID)
  if (!child) return
  child.session_id = childSessionID
  child.status = "running"
  parentState.updated_at = Date.now()
  await writeTaskState(stateDir, parentState)
  await writeSessionIndex(stateDir, childSessionID, parentState.task_id, "child", { worktree: child.worktree, branch: child.branch, parent_task_id: child.parent_task_id })
  if (typeof output.output === "string") {
    output.output += `\nChild worktree: ${child.worktree}\nChild branch: ${child.branch}`
  }
  await appendEvent(stateDir, parentState.task_id, { type: "child_session_bound", session_id: childSessionID, call_id: input.callID, worktree: child.worktree, branch: child.branch })
  return
}
```

If OpenCode's hook object uses a different property than `output.output` for the immediate task result, update the test to match the actual property, but keep the invariant that plan-runner can see the worktree path from the task result or from the injected child final report.

- [ ] **Step 9: Add child path enforcement for bash and file tools**

Add a helper:

```js
function pathInside(base, candidate) {
  const rel = relative(base, candidate)
  return rel === "" || (!!rel && !rel.startsWith("..") && !isAbsolute(rel))
}

function assertChildPathAllowed(childIndex, filePath) {
  if (!filePath) return
  const absolute = isAbsolute(filePath) ? normalize(filePath) : normalize(join(childIndex.worktree, filePath))
  if (!pathInside(childIndex.worktree, absolute)) throw new Error(`child session cannot access path outside assigned worktree: ${filePath}`)
}
```

Then add this branch near the top of `enforcePhaseGate()`:

```js
const index = await readSessionIndex(stateDir, input.sessionID)
if (index?.role === "child") {
  if (input.tool === "bash") {
    input.args = input.args || {}
    input.args.workdir = input.args.workdir || index.worktree
    if (!pathInside(index.worktree, normalize(input.args.workdir))) throw new Error("child bash workdir must be inside assigned worktree")
    return
  }
  if (input.tool === "edit" || input.tool === "write") {
    assertChildPathAllowed(index, input.args?.filePath)
    return
  }
}
```

Do not block read-only tools in this first implementation. The important invariant is preventing child write/bash operations from landing in the root worktree.

- [ ] **Step 10: Run child worktree tests and verify GREEN**

Run:

```bash
node --test userconf/plugins/test/plan-runner-harness.test.mjs --test-name-pattern "child worktree|assigned worktree"
```

Expected: PASS.

- [ ] **Step 11: Update docs for worktree isolation**

In `docs/knowledge/subagent-dispatch-hook.md`, replace the note that `task` has no workdir parameter with:

```markdown
- OpenCode `task` does not expose a workdir parameter, so plan-runner harness creates child git worktrees before child task dispatch, injects the assigned worktree into the child prompt, records the child session metadata, and enforces child bash/write tools against that worktree.
- Child final reports must include `Child worktree:` and `Child branch:` so the root plan-runner can inspect, merge, and validate the child output.
```

In `docs/runbook/plan-runner-smoke.md`, add one smoke criterion:

```markdown
- 若 plan-runner 派发 coding child subagent，task-state 必须记录 child `worktree` / `branch`，child 写入必须发生在该 worktree 内，root plan-runner 负责合并回主工作区。
```

- [ ] **Step 12: Commit child worktree isolation**

```bash
git add userconf/plugins/plan-runner-harness.js userconf/plugins/test/plan-runner-harness.test.mjs docs/knowledge/subagent-dispatch-hook.md docs/runbook/plan-runner-smoke.md
git commit -m "fix(plan-runner): 为子任务创建隔离 worktree"
```

### Task 9: Full Regression And Live Smoke

**Files:**
- Modify only if failures expose required fixes: files from prior tasks.
- Read: `docs/runbook/plan-runner-smoke.md`
- Read: `~/.config/opencode/task-state/tasks/<task_id>.json`
- Read: `~/.config/opencode/task-state/events/<task_id>.jsonl`

- [ ] **Step 1: Run full plugin tests**

Run:

```bash
node --test "userconf/plugins/test"/*.mjs "scripts/test/opencode-subagent-event-probe.test.mjs"
```

Expected: all tests pass. At the time of writing, the known baseline was `216 pass / 0 fail`; after this refactor the exact count may increase, but failures must be zero.

- [ ] **Step 2: Run shell syntax and diff checks**

Run:

```bash
bash -n init_opencode.sh
git diff --check
```

Expected: both commands exit 0; `git diff --check` prints no output.

- [ ] **Step 3: Sync OpenCode config**

Run:

```bash
bash init_opencode.sh
```

Expected: init completes and reports `[done] init_opencode.sh 完成`. Restart or start a fresh `opencode serve` before live smoke so the new agent prompt and plugin are loaded.

- [ ] **Step 4: Verify local commits for the refactor before smoke**

Run:

```bash
git status --short
```

Expected: `git status --short` is clean before live smoke. Do not push.

- [ ] **Step 5: Run fresh serve + background plan-runner smoke with one child worktree task**

Use a fresh `opencode serve`, then dispatch a parent prompt that only calls `task(background=true, subagent_type=plan-runner)`. The Execution Brief must force one child subagent dispatch so the smoke validates worktree isolation:

```text
Execution Brief: Run a real plan-runner SSOT + child worktree smoke. Define one write_plan task for updating docs/runbook/plan-runner-smoke.md. For the implementation, dispatch exactly one background child subagent with task(), let the child edit only its assigned worktree, then inspect the child worktree, merge the accepted change back to the root worktree, run the task checks, complete_task, create a local commit, do not push, then call finish_plan. The child final response must include Child worktree and Child branch lines.
```

Expected task-state events include:

```text
dispatch_started
plan_runner_bound
plan_contract_written
task_started
child_worktree_created
child_session_bound
task_completed
self_check_completed
deterministic_check_passed
audit_review_dispatched
audit_review_passed
external_review_started
external_review_passed
task_validated
```

- [ ] **Step 6: Independently verify smoke state**

Run a Python check similar to this with the actual task id:

```bash
python3 - <<'PY'
import json
from pathlib import Path
task = Path.home() / '.config/opencode/task-state/tasks/<task_id>.json'
events = Path.home() / '.config/opencode/task-state/events/<task_id>.jsonl'
state = json.loads(task.read_text())
event_types = [json.loads(line)['type'] for line in events.read_text().splitlines() if line.strip()]
assert state['status'] == 'validated'
assert 'todo' not in state
assert 'plan_contract' not in state
assert all(task['status'] == 'completed' for task in state['tasks'])
children = state.get('child_sessions') or []
assert children, 'expected one child worktree session'
assert all(child.get('worktree') and child.get('branch') for child in children)
assert 'child_worktree_created' in event_types
assert 'child_session_bound' in event_types
assert 'task_validated' in event_types
assert 'task_stale' not in event_types
print('plan-runner SSOT smoke validated')
PY
```

Expected: `plan-runner SSOT smoke validated`.

- [ ] **Step 7: Commit smoke documentation if the smoke changed repo docs**

If the smoke task produced a local commit, leave it as the final smoke commit. If smoke produced only uncommitted docs, create a commit:

```bash
git add docs/runbook/plan-runner-smoke.md docs/plans/<task_id>.md
git commit -m "docs(plan-runner): 记录单一事实源烟测"
```

Expected: `git status --short` prints no output.

## Self-Review

**Spec coverage:** The plan covers the discussed decisions: main agent owns human brief, `write_plan.tasks` is the single task definition source, `todowrite` is removed from plan-runner execution, audit/external review stay fixed gates, deterministic check verifies machine facts, and harness evidence is based on tool/Git observations.

**Placeholder scan:** This plan contains no undefined task bodies, no deferred implementation notes, and no generic placeholder instructions. Every code-changing task includes concrete test snippets, implementation snippets, commands, expected outcomes, and commit commands.

**Type consistency:** The plan consistently uses `tasks`, `active_task`, `brief_path`, `brief_sha256`, `start_task`, `complete_task`, `checks`, and `negative_checks`. It avoids reintroducing `plan_contract`, `todo.mirrored`, or `todo.last_seen` for version 2 state.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-06-plan-runner-ssot-task-contract.md`. Two execution options:

**1. Plan-Runner (recommended)** - Load `plan-runner-dispatch` and let the plan-runner subagent execute the plan with harness gates, audit review, and terminal validation.

**2. Inline Execution** - Execute the tasks in the current session with manual checkpoints; use this only if the repo is not clean enough to dispatch plan-runner or if you intentionally want to bypass harness orchestration.

Which approach?
