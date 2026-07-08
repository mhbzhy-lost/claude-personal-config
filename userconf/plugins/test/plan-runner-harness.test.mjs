import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { describe, it } from "node:test"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { PlanRunnerHarnessPlugin } from "../plan-runner-harness.js"

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

function makeContext({ sessionID, workspace, agent = "plan-runner" }) {
  return {
    sessionID,
    messageID: "msg_test",
    agent,
    directory: workspace,
    worktree: workspace,
    abort: new AbortController().signal,
    metadata() {},
  }
}

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
}

function initGitWorkspace(workspace) {
  mkdirSync(workspace, { recursive: true })
  git(workspace, ["init"])
  git(workspace, ["config", "user.name", "Plan Runner Test"])
  git(workspace, ["config", "user.email", "plan-runner@example.invalid"])
  writeFileSync(join(workspace, "README.md"), "# test workspace\n")
  git(workspace, ["add", "README.md"])
  git(workspace, ["commit", "-m", "initial commit"])
  return git(workspace, ["rev-parse", "HEAD"])
}

function planContent(title = "Harness Slice") {
  return [
    `# ${title}`,
    "",
    "## Goal",
    "Exercise the plan-runner harness behavior under test.",
    "",
    "## Architecture",
    "Use reviewer-facing prose; harness structure is supplied through write_plan tasks.",
    "",
    "## File Structure",
    "- userconf/plugins/plan-runner-harness.js",
    "",
    "## TDD task steps",
    "- RED: run the focused failing test.",
    "- GREEN: implement the minimum harness change.",
    "",
    "## Commands with expected output",
    "- node --test userconf/plugins/test/plan-runner-harness.test.mjs # expected: pass",
    "",
    "## Risks / Stop Conditions",
    "- Stop if the test needs behavior outside the harness contract.",
    "",
  ].join("\n")
}

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

async function dispatchPlanRunner({ hooks, workspace, parentSessionID = "ses_parent", planRunnerSessionID = "ses_plan_runner", callID = "call_dispatch", prompt = "Implement." }) {
  mkdirSync(workspace, { recursive: true })
  const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt } }
  await hooks["tool.execute.before"]({ tool: "task", sessionID: parentSessionID, callID }, taskOutput)
  await hooks["tool.execute.after"](
    { tool: "task", sessionID: parentSessionID, callID, args: taskOutput.args },
    { metadata: { parentSessionId: parentSessionID, sessionId: planRunnerSessionID } },
  )
  return join("tasks", `planrun-${parentSessionID}-${callID}.json`)
}

async function startStructuredTask({ hooks, workspace, id = "T1", sessionID = "ses_plan_runner" }) {
  await hooks.tool.start_task.execute({ id }, makeContext({ sessionID, workspace }))
}

async function completeStructuredTask({ hooks, workspace, id = "T1", sessionID = "ses_plan_runner" }) {
  await hooks.tool.complete_task.execute({ id }, makeContext({ sessionID, workspace }))
}

function oneTask({ id = "T1", title = "Edit file", files = ["probe-output.txt"], checks = [], negative_checks = [] } = {}) {
  return { id, title, files, checks, negative_checks }
}

async function prepareAuditReviewState({ hooks, workspace, stateDir }) {
  await dispatchPlanRunner({ hooks, workspace })
  await hooks.tool.write_plan.execute(
    {
      content: planContent("Audit Consumption Slice"),
      title: "Audit Consumption Slice",
      tasks: [oneTask()],
      dag: [],
      parallel_sets: [],
    },
    makeContext({ sessionID: "ses_plan_runner", workspace }),
  )
  await startStructuredTask({ hooks, workspace })
  await hooks.event({ event: { type: "message.updated", properties: { sessionID: "ses_plan_runner", info: { id: "msg_with_diff", summary: { diffs: [{ file: "probe-output.txt" }] } } } } })
  await completeStructuredTask({ hooks, workspace })
  const statePath = join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json")
  const finish = hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))
    .catch((error) => ({ error }))
  await waitUntil(() => {
    try {
      return ["audit_review", "interrupted"].includes(readJson(statePath).status)
    } catch {
      return false
    }
  })

  return { statePath, finish }
}

async function prepareCompletionReadyState({ hooks, workspace, stateDir }) {
  await dispatchPlanRunner({ hooks, workspace })
  const statePath = join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json")
  await hooks.tool.write_plan.execute(
    {
      content: planContent("Completion Gate Slice"),
      title: "Completion Gate Slice",
      tasks: [oneTask()],
      dag: [],
      parallel_sets: [],
    },
    makeContext({ sessionID: "ses_plan_runner", workspace }),
  )
  await startStructuredTask({ hooks, workspace })
  const stateForWorktree = readJson(statePath)
  writeFileSync(join(stateForWorktree.worktree || workspace, "probe-output.txt"), "completed probe output\n")
  await hooks.event({ event: { type: "message.updated", properties: { sessionID: "ses_plan_runner", info: { id: "msg_with_diff", summary: { diffs: [{ file: "probe-output.txt" }] } } } } })
  await completeStructuredTask({ hooks, workspace })

  return statePath
}

async function waitUntil(condition, timeoutMs = 1000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error("condition not met before timeout")
}

function auditMessageEvent(text) {
  return {
    type: "message.updated",
    properties: {
      sessionID: "ses_audit",
      info: {
        id: "msg_audit_result",
        parts: [{ type: "text", text }],
      },
    },
  }
}

function auditTextPartEvent(text) {
  return {
    type: "message.part.updated",
    properties: {
      sessionID: "ses_audit",
      part: {
        id: "prt_audit_text",
        messageID: "msg_audit_result",
        type: "text",
        text,
      },
    },
  }
}

function auditIdleEvent() {
  return { type: "session.idle", properties: { sessionID: "ses_audit" } }
}

function expiredTaskState({ taskID = "planrun-expired", status = "repairing", workspace, completionGate } = {}) {
  const state = {
    version: 2,
    task_id: taskID,
    status,
    parent_session_id: "ses_parent",
    dispatch_call_id: "call_dispatch",
    plan_runner_session_id: "ses_plan_runner",
    worktree: workspace,
    updated_at: Date.now() - 20 * 60 * 1000,
    lease_expires_at: Date.now() - 10 * 60 * 1000,
    brief_path: null,
    brief_sha256: null,
    tasks: [],
    active_task: null,
    modified_files: [],
    child_sessions: [],
    reviews: { round: status === "repairing" ? 1 : 0, audit: [], external: [] },
    self_check: { status: "completed", round: 1 },
  }
  if (completionGate) state.completion_gate = completionGate
  return state
}

describe("PlanRunnerHarnessPlugin", () => {
  it("does not export helper functions as plugin entries", async () => {
    const mod = await import("../plan-runner-harness.js")
    const functionExports = Object.entries(mod)
      .filter(([, value]) => typeof value === "function")
      .map(([name]) => name)

    assert.deepEqual(functionExports.sort(), ["PlanRunnerHarnessPlugin", "default"].sort())
  })

  it("documents automatic child worktree creation in the subagent dispatch tool description", async () => {
    const hooks = await PlanRunnerHarnessPlugin({ directory: process.cwd() }, { stateDir: join(tmpdir(), "plan-runner-harness-test-unused") })
    const definition = { description: "Launch a new agent to handle complex, multistep tasks autonomously." }

    await hooks["tool.definition"]({ tool: "task" }, definition)

    assert.match(definition.description, /automatically creates a dedicated git worktree/i)
    assert.match(definition.description, /assigned worktree/i)
  })

  it("uses unique temp names for atomic state writes", () => {
    const source = readFileSync(new URL("../plan-runner-harness.js", import.meta.url), "utf8")

    assert.match(source, /randomUUID/)
    assert.doesNotMatch(source, /`\$\{path\}\.tmp\.\$\{process\.pid\}`/)
  })

  it("uses async fs operations in hook runtime", () => {
    const source = readFileSync(new URL("../plan-runner-harness.js", import.meta.url), "utf8")

    assert.match(source, /node:fs\/promises/)
    assert.doesNotMatch(source, /\b(appendFileSync|existsSync|mkdirSync|readFileSync|renameSync|writeFileSync)\b/)
  })

  it("creates task state on plan-runner dispatch and binds child session after task returns", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })

      const output = {
        args: {
          background: true,
          subagent_type: "plan-runner",
          prompt: "Implement the brief.",
        },
      }

      await hooks["tool.execute.before"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch" },
        output,
      )

      assert.match(output.args.prompt, /Harness Task ID: planrun-ses_parent-call_dispatch/)

      const statePath = join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json")
      const parentIndexPath = join(stateDir, "sessions", "ses_parent.json")
      assert.equal(readJson(statePath).status, "dispatching")
      assert.equal(readJson(parentIndexPath).task_id, "planrun-ses_parent-call_dispatch")

      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: output.args },
        {
          title: "Plan runner",
          output: "started",
          metadata: {
            parentSessionId: "ses_parent",
            sessionId: "ses_plan_runner",
            background: true,
          },
        },
      )

      const state = readJson(statePath)
      assert.equal(state.status, "planning_required")
      assert.equal(state.plan_runner_session_id, "ses_plan_runner")
      assert.equal(readJson(join(stateDir, "sessions", "ses_plan_runner.json")).task_id, state.task_id)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("blocks plan-runner dispatch when the git repo is dirty", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      initGitWorkspace(workspace)
      writeFileSync(join(workspace, "dirty.txt"), "uncommitted\n")
      const stateDir = join(root, "state")
      const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })
      const output = { args: { background: true, subagent_type: "plan-runner", prompt: "Implement." } }

      await assert.rejects(
        () => hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, output),
        /plan_runner_requires_clean_repo/,
      )

      const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.equal(state.status, "blocked")
      assert.equal(state.blocker.code, "plan_runner_requires_clean_repo")
      assert.match(state.blocker.status_porcelain, /dirty\.txt/)
      const events = readFileSync(join(stateDir, "events", "planrun-ses_parent-call_dispatch.jsonl"), "utf8")
      assert.match(events, /"type":"dispatch_blocked"/)
      assert.match(events, /plan_runner_requires_clean_repo/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("blocks plan-runner dispatch from a linked git worktree", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const mainWorkspace = join(root, "main")
      const linkedWorkspace = join(root, "linked")
      initGitWorkspace(mainWorkspace)
      git(mainWorkspace, ["worktree", "add", "--detach", linkedWorkspace, "HEAD"])
      const stateDir = join(root, "state")
      const hooks = await PlanRunnerHarnessPlugin({ directory: linkedWorkspace }, { stateDir })
      const output = { args: { background: true, subagent_type: "plan-runner", prompt: "Implement." } }

      await assert.rejects(
        () => hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, output),
        /plan_runner_disallowed_linked_worktree/,
      )

      const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.equal(state.status, "blocked")
      assert.equal(state.blocker.code, "plan_runner_disallowed_linked_worktree")
      assert.notEqual(state.blocker.git_dir, state.blocker.git_common_dir)
      const events = readFileSync(join(stateDir, "events", "planrun-ses_parent-call_dispatch.jsonl"), "utf8")
      assert.match(events, /"type":"dispatch_blocked"/)
      assert.match(events, /plan_runner_disallowed_linked_worktree/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

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

  it("allows start_task to select the next pending structured task after completing the previous task", async () => {
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

      await hooks["tool.execute.before"]({ tool: "start_task", sessionID: "ses_plan_runner", callID: "call_start_t1" }, { args: { id: "T1" } })
      await hooks.tool.start_task.execute({ id: "T1" }, makeContext({ sessionID: "ses_plan_runner", workspace }))
      await hooks["tool.execute.before"]({ tool: "complete_task", sessionID: "ses_plan_runner", callID: "call_complete_t1" }, { args: { id: "T1" } })
      await hooks.tool.complete_task.execute({ id: "T1" }, makeContext({ sessionID: "ses_plan_runner", workspace }))

      await hooks["tool.execute.before"]({ tool: "start_task", sessionID: "ses_plan_runner", callID: "call_start_t2" }, { args: { id: "T2" } })
      await hooks.tool.start_task.execute({ id: "T2" }, makeContext({ sessionID: "ses_plan_runner", workspace }))

      const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.equal(state.status, "executing")
      assert.equal(state.active_task, "T2")
      assert.equal(state.tasks[0].status, "completed")
      assert.equal(state.tasks[1].status, "in_progress")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("blocks execution tools until start_task selects an active task and blocks todowrite", async () => {
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

  it("creates a harness-managed worktree and rewrites child task dispatch", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const baseCommit = initGitWorkspace(workspace)
      const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })

      const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Execution Brief:\nImplement the brief." } }
      await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
        { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
      )
      await hooks.tool.write_plan.execute({ tasks: structuredPlanTasks() }, makeContext({ sessionID: "ses_plan_runner", workspace }))
      await hooks.tool.start_task.execute({ id: "T1" }, makeContext({ sessionID: "ses_plan_runner", workspace }))

      const childOutput = { args: { background: true, subagent_type: "general", prompt: "Implement child slice." } }
      await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_plan_runner", callID: "call_child" }, childOutput)

      assert.equal(childOutput.args.subagent_type, "executor")
      assert.equal(childOutput.args.background, true)
      assert.match(childOutput.args.prompt, /Assigned child worktree:/)
      assert.match(childOutput.args.prompt, /Child branch:/)
      assert.match(childOutput.args.prompt, /Root plan task: T1/)

      let state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      const child = state.child_sessions.find((item) => item.call_id === "call_child")
      assert.equal(child.role, "executor")
      assert.equal(child.status, "dispatching")
      assert.equal(child.task_id, "T1")
      assert.equal(child.base_commit, baseCommit)
      assert.ok(child.worktree.startsWith(join(stateDir, "child-worktrees", "planrun-ses_parent-call_dispatch")))
      assert.equal(existsSync(child.worktree), true)
      assert.equal(git(child.worktree, ["rev-parse", "HEAD"]), baseCommit)

      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_plan_runner", callID: "call_child", args: childOutput.args },
        { metadata: { parentSessionId: "ses_plan_runner", sessionId: "ses_child" } },
      )

      state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      const boundChild = state.child_sessions.find((item) => item.session_id === "ses_child")
      assert.equal(boundChild.status, "running")
      assert.equal(boundChild.worktree, child.worktree)
      assert.equal(readJson(join(stateDir, "sessions", "ses_child.json")).role, "child")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("marks harness-managed executor child sessions completed when the child idles", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      initGitWorkspace(workspace)
      const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })

      const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Execution Brief:\nImplement the brief." } }
      await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
        { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
      )
      await hooks.tool.write_plan.execute({ tasks: structuredPlanTasks() }, makeContext({ sessionID: "ses_plan_runner", workspace }))
      await hooks.tool.start_task.execute({ id: "T1" }, makeContext({ sessionID: "ses_plan_runner", workspace }))

      const childOutput = { args: { background: true, prompt: "Validate child slice." } }
      await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_plan_runner", callID: "call_child" }, childOutput)
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_plan_runner", callID: "call_child", args: childOutput.args },
        { metadata: { parentSessionId: "ses_plan_runner", sessionId: "ses_child" } },
      )

      await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_child" } } })

      const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      const child = state.child_sessions.find((item) => item.session_id === "ses_child")
      assert.equal(child.status, "completed")
      const events = readFileSync(join(stateDir, "events", "planrun-ses_parent-call_dispatch.jsonl"), "utf8")
      assert.match(events, /"type":"child_session_completed"/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("enforces child session tools inside the assigned worktree", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      initGitWorkspace(workspace)
      const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })

      const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Execution Brief:\nImplement the brief." } }
      await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
        { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
      )
      await hooks.tool.write_plan.execute({ tasks: structuredPlanTasks() }, makeContext({ sessionID: "ses_plan_runner", workspace }))
      await hooks.tool.start_task.execute({ id: "T1" }, makeContext({ sessionID: "ses_plan_runner", workspace }))

      const childOutput = { args: { background: true, prompt: "Implement child slice." } }
      await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_plan_runner", callID: "call_child" }, childOutput)
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_plan_runner", callID: "call_child", args: childOutput.args },
        { metadata: { parentSessionId: "ses_plan_runner", sessionId: "ses_child" } },
      )
      const child = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json")).child_sessions.find((item) => item.session_id === "ses_child")

      const bashOutput = { args: { command: "git status --short" } }
      await hooks["tool.execute.before"]({ tool: "bash", sessionID: "ses_child", callID: "call_bash" }, bashOutput)
      assert.equal(bashOutput.args.workdir, child.worktree)

      await assert.rejects(
        () => hooks["tool.execute.before"]({ tool: "bash", sessionID: "ses_child", callID: "call_bad_bash" }, { args: { command: "pwd", workdir: workspace } }),
        /outside assigned child worktree/i,
      )
      await assert.rejects(
        () => hooks["tool.execute.before"]({ tool: "write", sessionID: "ses_child", callID: "call_bad_write" }, { args: { filePath: join(workspace, "README.md"), content: "bad" } }),
        /outside assigned child worktree/i,
      )
      await assert.doesNotReject(
        () => hooks["tool.execute.before"]({ tool: "write", sessionID: "ses_child", callID: "call_good_write" }, { args: { filePath: join(child.worktree, "child.txt"), content: "ok" } }),
      )
      await assert.rejects(
        () => hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_child", callID: "call_nested" }, { args: { background: true, prompt: "nested" } }),
        /child sessions cannot dispatch/i,
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("write_plan keeps structured tasks as SSOT when content is present", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })

      const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Implement the brief." } }
      await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
        { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
      )

      const tasks = [{
        id: "T1",
        title: "Structured task",
        files: ["docs/example.md"],
        checks: ["git diff --check"],
        negative_checks: [],
      }]

      await hooks.tool.write_plan.execute(
        {
          content: "# Reviewer-facing plan\n\nThis prose is the only plan document source.",
          tasks,
          dag: [["T1", "T1"]],
          parallel_sets: [["T1"]],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      )

      const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.equal(state.version, 2)
      assert.equal(state.status, "ready_to_execute")
      assert.equal(state.active_task, null)
      assert.deepEqual(state.tasks, tasks.map((task) => ({ ...task, status: "pending", evidence: [] })))
      assert.equal("todo" in state, false)
      assert.equal("plan_contract" in state, false)
      assert.equal(state.plan_path, join(stateDir, "plans", "planrun-ses_parent-call_dispatch.md"))
      assert.equal(existsSync(join(workspace, "docs", "plans", "planrun-ses_parent-call_dispatch.md")), false)
      assert.equal(readFileSync(state.plan_path, "utf8"), "# Reviewer-facing plan\n\nThis prose is the only plan document source.")

      await hooks["tool.execute.before"]({ tool: "start_task", sessionID: "ses_plan_runner", callID: "call_start_t1" }, { args: { id: "T1" } })
      await hooks.tool.start_task.execute({ id: "T1" }, makeContext({ sessionID: "ses_plan_runner", workspace }))

      const started = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.equal(started.status, "executing")
      assert.equal(started.active_task, "T1")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("write_plan stores plan content under stateDir when tool context reports root", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })

      const taskOutput = {
        args: {
          background: true,
          subagent_type: "plan-runner",
          prompt: "Implement the brief.",
        },
      }
      await hooks["tool.execute.before"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch" },
        taskOutput,
      )
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
        { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
      )

      await hooks.tool.write_plan.execute(
        {
          content: planContent("Root Context Slice"),
          title: "Root Context Slice",
          tasks: [{ title: "Persist plan", completion_criteria: ["plan file exists under workspace"] }],
          dag: [],
          parallel_sets: [],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace: "/" }),
      )

      const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.equal(state.plan_path, join(stateDir, "plans", "planrun-ses_parent-call_dispatch.md"))
      assert.ok(existsSync(state.plan_path))
      assert.equal(existsSync(join(workspace, "docs", "plans", "planrun-ses_parent-call_dispatch.md")), false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("write_plan rejects non plan-runner sessions", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir: join(root, "state") })

      await assert.rejects(
        () => hooks.tool.write_plan.execute(
          {
            content: planContent("Invalid"),
            title: "Invalid",
            tasks: [{ title: "Task", completion_criteria: ["done"] }],
            dag: [],
            parallel_sets: [],
          },
          makeContext({ sessionID: "ses_other", workspace, agent: "build" }),
        ),
        /plan-runner/,
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("write_plan ignores legacy DAG fields and derives task ids from array order", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })

      const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Implement." } }
      await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
        { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
      )

      await hooks.tool.write_plan.execute(
        {
          title: "Cyclic DAG",
          tasks: [
            { title: "First", completion_criteria: ["first done"] },
            { title: "Second", completion_criteria: ["second done"] },
          ],
          dag: [["T1", "T2"], ["T2", "T1"]],
          parallel_sets: [],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      )

      const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.equal(state.status, "ready_to_execute")
      assert.deepEqual(state.tasks.map((task) => task.id), ["T1", "T2"])
      assert.equal("plan_contract" in state, false)
      assert.equal("todo" in state, false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("quarantines corrupt task state instead of throwing on idle event", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const taskID = "corrupt-task"
      const taskPath = join(stateDir, "tasks", `${taskID}.json`)

      mkdirSync(join(stateDir, "sessions"), { recursive: true })
      mkdirSync(join(stateDir, "tasks"), { recursive: true })
      writeFileSync(join(stateDir, "sessions", "ses_plan_runner.json"), JSON.stringify({ session_id: "ses_plan_runner", task_id: taskID, role: "plan-runner" }))
      writeFileSync(taskPath, "{not valid json")

      const hooks = await PlanRunnerHarnessPlugin(
        { directory: workspace, client: { session: { prompt: async () => {} } } },
        { stateDir },
      )

      await assert.doesNotReject(
        () => hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_plan_runner" } } }),
      )

      assert.equal(existsSync(taskPath), false)
      assert.equal(existsSync(join(stateDir, "corrupt", "tasks", `${taskID}.json`)), true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("does not read plan-runner state on idle when watchdog prompt is unavailable", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const taskID = "corrupt-task-without-prompt"
      const taskPath = join(stateDir, "tasks", `${taskID}.json`)

      mkdirSync(join(stateDir, "sessions"), { recursive: true })
      mkdirSync(join(stateDir, "tasks"), { recursive: true })
      writeFileSync(join(stateDir, "sessions", "ses_plan_runner.json"), JSON.stringify({ session_id: "ses_plan_runner", task_id: taskID, role: "plan-runner" }))
      writeFileSync(taskPath, "{not valid json")

      const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })

      await assert.doesNotReject(
        () => hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_plan_runner" } } }),
      )

      assert.equal(existsSync(taskPath), true)
      assert.equal(existsSync(join(stateDir, "corrupt", "tasks", `${taskID}.json`)), false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("keeps corrupt state fail-open even when quarantine rename fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const taskID = "corrupt-task"
      const taskPath = join(stateDir, "tasks", `${taskID}.json`)

      mkdirSync(join(stateDir, "sessions"), { recursive: true })
      mkdirSync(join(stateDir, "tasks"), { recursive: true })
      mkdirSync(join(stateDir, "corrupt", "tasks", `${taskID}.json`), { recursive: true })
      writeFileSync(join(stateDir, "sessions", "ses_plan_runner.json"), JSON.stringify({ session_id: "ses_plan_runner", task_id: taskID, role: "plan-runner" }))
      writeFileSync(taskPath, "{not valid json")

      const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })

      await assert.doesNotReject(
        () => hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_plan_runner" } } }),
      )
      assert.equal(existsSync(taskPath), true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("phase gate blocks execution until write_plan and start_task select a structured task", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })

      const taskOutput = {
        args: {
          background: true,
          subagent_type: "plan-runner",
          prompt: "Implement the brief.",
        },
      }
      await hooks["tool.execute.before"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch" },
        taskOutput,
      )
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
        { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
      )

      await assert.rejects(
        () => hooks["tool.execute.before"](
          { tool: "bash", sessionID: "ses_plan_runner", callID: "call_bash" },
          { args: { command: "printf early" } },
        ),
        /planning_required/,
      )

      await assert.doesNotReject(() => hooks["tool.execute.before"](
        { tool: "skill", sessionID: "ses_plan_runner", callID: "call_skill_planning" },
        { args: { name: "test-driven-development" } },
      ))

      await hooks.tool.write_plan.execute(
        {
          content: planContent("Harness Slice"),
          title: "Harness Slice",
          tasks: [
            { title: "Persist state", completion_criteria: ["state file exists"] },
            { title: "Write markdown", completion_criteria: ["plan file exists"] },
          ],
          dag: [],
          parallel_sets: [],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      )

      await assert.rejects(
        () => hooks["tool.execute.before"](
          { tool: "bash", sessionID: "ses_plan_runner", callID: "call_bash" },
          { args: { command: "printf before-start" } },
        ),
        /start_task is required/,
      )

      await assert.doesNotReject(() => hooks["tool.execute.before"](
        { tool: "skill", sessionID: "ses_plan_runner", callID: "call_skill_todo" },
        { args: { name: "verification-before-completion" } },
      ))

      const stateAfterPlan = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.equal(stateAfterPlan.status, "ready_to_execute")
      assert.equal("todo" in stateAfterPlan, false)
      assert.equal("plan_contract" in stateAfterPlan, false)

      await assert.doesNotReject(() => hooks["tool.execute.before"](
        { tool: "skill", sessionID: "ses_plan_runner", callID: "call_skill_execute" },
        { args: { name: "verification-before-completion" } },
      ))

      await assert.rejects(() => hooks["tool.execute.before"](
        { tool: "apply_patch", sessionID: "ses_plan_runner", callID: "call_patch" },
        { args: { patchText: "*** Begin Patch\n*** End Patch" } },
      ), /start_task is required/)

      await startStructuredTask({ hooks, workspace, id: "T1" })

      await assert.doesNotReject(() => hooks["tool.execute.before"](
        { tool: "bash", sessionID: "ses_plan_runner", callID: "call_bash" },
        { args: { command: "printf ok" } },
      ))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("ignores todo.updated events after structured write_plan", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })

      const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Implement the brief." } }
      await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
        { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
      )

      await hooks.tool.write_plan.execute(
        {
          content: planContent("Harness Slice"),
          title: "Harness Slice",
          tasks: [
            { title: "Persist state", completion_criteria: ["state file exists"] },
            { title: "Write markdown", completion_criteria: ["plan file exists"] },
          ],
          dag: [],
          parallel_sets: [],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      )

      await hooks.event({
        event: {
          type: "todo.updated",
          properties: {
            sessionID: "ses_plan_runner",
            todos: [
              { content: "Persist state", status: "in_progress" },
              { content: "Write markdown", status: "pending" },
            ],
          },
        },
      })

      const stateAfterTodo = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.equal(stateAfterTodo.status, "ready_to_execute")
      assert.deepEqual(stateAfterTodo.tasks.map((task) => task.id), ["T1", "T2"])
      assert.equal("todo" in stateAfterTodo, false)
      assert.equal("plan_contract" in stateAfterTodo, false)
      const events = readFileSync(join(stateDir, "events", "planrun-ses_parent-call_dispatch.jsonl"), "utf8")
      assert.doesNotMatch(events, /todo_mirror_diagnostic/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("maps command evidence to the active structured T10 task", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })

      const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Implement the brief." } }
      await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
        { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
      )

      const tasks = Array.from({ length: 10 }, (_, index) => ({
        title: `Task ${index + 1}`,
        completion_criteria: [`criterion ${index + 1}`],
      }))
      await hooks.tool.write_plan.execute(
        { content: planContent("Harness Slice"), title: "Harness Slice", tasks, dag: [], parallel_sets: [] },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      )

      await startStructuredTask({ hooks, workspace, id: "T10" })

      await hooks["tool.execute.before"](
        { tool: "bash", sessionID: "ses_plan_runner", callID: "call_bash" },
        { args: { command: "printf ok" } },
      )
      await hooks["tool.execute.after"](
        { tool: "bash", sessionID: "ses_plan_runner", callID: "call_bash", args: { command: "printf ok" } },
        { metadata: { exit: 0 } },
      )

      const stateAfterEvidence = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      const commandEvidence = stateAfterEvidence.tasks[9].evidence.find((item) => item.id === "ev-command-call_bash")
      assert.deepEqual(commandEvidence.task_ids, ["T10"])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("blocks todowrite during repairing because repair work must not rewrite the original plan ledger", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })
      const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Implement." } }

      await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
        { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
      )
      await hooks.tool.write_plan.execute(
        {
          content: planContent("Repair Todo"),
          title: "Repair Todo",
          tasks: [{ title: "Finish gate", completion_criteria: ["finish_plan attempted"] }],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      )
      const statePath = join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json")
      const state = readJson(statePath)
      state.status = "repairing"
      state.completion_gate = {
        mode: "finish_plan",
        status: "repair_required",
        source: "deterministic_check",
        reasons: ["structured task is still active"],
      }
      writeFileSync(statePath, JSON.stringify(state, null, 2))

      await assert.rejects(
        () => hooks["tool.execute.before"](
          { tool: "todowrite", sessionID: "ses_plan_runner", callID: "call_repair_todo" },
          { args: { todos: [{ content: "T1: Finish gate", status: "completed", priority: "high" }] } },
        ),
        /todowrite is forbidden for plan-runner/,
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("runs deterministic checks from structured task status instead of finish_plan todos", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const prompts = []
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async (payload) => prompts.push(payload),
            },
          },
        },
        { stateDir },
      )
      const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Implement." } }

      await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
        { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
      )
      await hooks.tool.write_plan.execute(
        {
          content: planContent("Gate Todo Smoke"),
          title: "Gate Todo Smoke",
          tasks: [oneTask()],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      )
      await startStructuredTask({ hooks, workspace })
      await hooks.event({ event: { type: "message.updated", properties: { sessionID: "ses_plan_runner", info: { id: "msg_with_diff", summary: { diffs: [{ file: "probe-output.txt" }] } } } } })
      await completeStructuredTask({ hooks, workspace })

      const finish = hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))
      const statePath = join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json")
      await waitUntil(() => readJson(statePath).status === "audit_review")
      await hooks.event({ event: auditMessageEvent(JSON.stringify({
        round: 1,
        kind: "audit",
        result: "fail",
        verified_tasks: ["T1"],
        rejected_tasks: [],
        unknown_tasks: [],
        unmapped_files: [],
        required_fixes: ["audit repair required"],
      })) })
      await hooks.event({ event: auditIdleEvent() })
      const result = await finish
      const state = readJson(statePath)

      assert.equal(state.completion_gate.status, "repair_required")
      assert.equal(state.completion_gate.source, "audit_review")
      assert.ok(prompts.some((payload) => payload.path?.id === "ses_audit"))
      assert.doesNotMatch(String(result.output), /not completed/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("does not apply plan-runner phase gate to the parent session", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })
      const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Implement." } }

      await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
        { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
      )

      await assert.doesNotReject(() => hooks["tool.execute.before"](
        { tool: "bash", sessionID: "ses_parent", callID: "call_parent_bash" },
        { args: { command: "git status --short" } },
      ))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("records command evidence for execution tools and maps it to the active structured task", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })

      const taskOutput = {
        args: { background: true, subagent_type: "plan-runner", prompt: "Implement." },
      }
      await hooks["tool.execute.before"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch" },
        taskOutput,
      )
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
        { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
      )
      await hooks.tool.write_plan.execute(
        {
          content: planContent("Evidence Slice"),
          title: "Evidence Slice",
          tasks: [{ ...oneTask({ title: "Run command", files: [], checks: ["node --test userconf/plugins/test/plan-runner-harness.test.mjs"] }) }],
          dag: [],
          parallel_sets: [],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      )
      await startStructuredTask({ hooks, workspace })

      await hooks["tool.execute.before"](
        { tool: "bash", sessionID: "ses_plan_runner", callID: "call_test" },
        { args: { command: "node --test userconf/plugins/test/plan-runner-harness.test.mjs" } },
      )
      await hooks["tool.execute.after"](
        {
          tool: "bash",
          sessionID: "ses_plan_runner",
          callID: "call_test",
          args: { command: "node --test userconf/plugins/test/plan-runner-harness.test.mjs" },
        },
        {
          title: "node --test",
          output: "ok",
          metadata: { output: "ok", exit: 0, truncated: false },
        },
      )

      const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.equal(state.tasks[0].evidence.length, 1)
      assert.deepEqual(state.tasks[0].evidence[0], {
        id: "ev-command-call_test",
        type: "command",
        task_ids: ["T1"],
        event_ids: ["tool-after-call_test"],
        command: "node --test userconf/plugins/test/plan-runner-harness.test.mjs",
        success: true,
        exit_code: 0,
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("records diff evidence from session.diff and updates modified files", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })

      const taskOutput = {
        args: { background: true, subagent_type: "plan-runner", prompt: "Implement." },
      }
      await hooks["tool.execute.before"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch" },
        taskOutput,
      )
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
        { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
      )
      await hooks.tool.write_plan.execute(
        {
          content: planContent("Diff Slice"),
          title: "Diff Slice",
          tasks: [oneTask({ files: ["userconf/plugins/plan-runner-harness.js"] })],
          dag: [],
          parallel_sets: [],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      )
      await startStructuredTask({ hooks, workspace })

      await hooks.event({
        event: {
          id: "evt_diff_1",
          type: "session.diff",
          properties: {
            sessionID: "ses_plan_runner",
            diff: [{ file: "userconf/plugins/plan-runner-harness.js", status: "modified" }],
          },
        },
      })

      const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.deepEqual(state.modified_files, ["userconf/plugins/plan-runner-harness.js"])
      assert.deepEqual(state.tasks[0].evidence[0], {
        id: "ev-diff-evt_diff_1",
        type: "diff",
        task_ids: ["T1"],
        event_ids: ["evt_diff_1"],
        files: ["userconf/plugins/plan-runner-harness.js"],
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("records diff evidence from message.updated summary diffs before idle validation", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })

      const taskOutput = {
        args: { background: true, subagent_type: "plan-runner", prompt: "Implement." },
      }
      await hooks["tool.execute.before"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch" },
        taskOutput,
      )
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
        { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
      )
      await hooks.tool.write_plan.execute(
        {
          content: planContent("Message Diff Slice"),
          title: "Message Diff Slice",
          tasks: [oneTask()],
          dag: [],
          parallel_sets: [],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      )
      await startStructuredTask({ hooks, workspace })

      await hooks.event({
        event: {
          type: "message.updated",
          properties: {
            sessionID: "ses_plan_runner",
            info: {
              id: "msg_with_diff",
              summary: {
                diffs: [{ file: "probe-output.txt", status: "added", additions: 1, deletions: 0 }],
              },
            },
          },
        },
      })
      await completeStructuredTask({ hooks, workspace })

      const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.deepEqual(state.modified_files, ["probe-output.txt"])
      assert.deepEqual(state.tasks[0].evidence[0], {
        id: "ev-diff-msg_with_diff",
        type: "diff",
        task_ids: ["T1"],
        event_ids: ["msg_with_diff"],
        files: ["probe-output.txt"],
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("serializes concurrent message diff events so evidence is not lost", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })
      const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Implement." } }
      await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
        { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
      )
      await hooks.tool.write_plan.execute(
        {
          content: planContent("Concurrent Diff Slice"),
          title: "Concurrent Diff Slice",
          tasks: [oneTask({ files: ["a.txt", "b.txt"] })],
          dag: [],
          parallel_sets: [],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      )
      await startStructuredTask({ hooks, workspace })

      await Promise.all([
        hooks.event({ event: { type: "message.updated", properties: { sessionID: "ses_plan_runner", info: { id: "msg_a", summary: { diffs: [{ file: "a.txt" }] } } } } }),
        hooks.event({ event: { type: "message.updated", properties: { sessionID: "ses_plan_runner", info: { id: "msg_b", summary: { diffs: [{ file: "b.txt" }] } } } } }),
      ])

      const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.deepEqual([...state.modified_files].sort(), ["a.txt", "b.txt"])
      assert.deepEqual(state.tasks[0].evidence.map((item) => item.id).sort(), ["ev-diff-msg_a", "ev-diff-msg_b"])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("does not count plan document summary diffs as implementation evidence", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const prompts = []
      const hooks = await PlanRunnerHarnessPlugin(
        { directory: workspace, client: { session: { promptAsync: async (payload) => prompts.push(payload) } } },
        { stateDir, completionGatePollMs: 5, completionGateTimeoutMs: 100 },
      )

      const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Implement." } }
      await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
        { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
      )
      await hooks.tool.write_plan.execute(
        {
          content: planContent("Plan Diff Only"),
          title: "Plan Diff Only",
          tasks: [oneTask()],
          dag: [],
          parallel_sets: [],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      )
      await startStructuredTask({ hooks, workspace })
      const stateWithPlan = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      await hooks.event({ event: { type: "message.updated", properties: { sessionID: "ses_plan_runner", info: { id: "msg_plan_diff", summary: { diffs: [{ file: stateWithPlan.plan_path }] } } } } })
      await completeStructuredTask({ hooks, workspace })

      const finishResult = await hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))

      const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.equal(state.status, "repairing")
      assert.equal(state.tasks[0].evidence.length, 0)
      assert.equal(prompts.length, 0)
      assert.match(String(finishResult.output || finishResult), /T1 missing diff evidence for probe-output\.txt/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("records write, edit, and apply_patch inputs as diff evidence", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })

      const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Implement." } }
      await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
        { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
      )
      await hooks.tool.write_plan.execute(
        {
          content: planContent("Tool File Evidence"),
          title: "Tool File Evidence",
          tasks: [oneTask({ files: [join("src", "created.txt"), join("src", "updated.txt"), join("src", "patched.txt"), join("src", "renamed-from.txt"), join("src", "renamed-to.txt")] })],
          dag: [],
          parallel_sets: [],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      )
      await startStructuredTask({ hooks, workspace })

      await hooks["tool.execute.after"](
        { tool: "write", sessionID: "ses_plan_runner", callID: "call_write", args: { filePath: join(workspace, "src", "created.txt") } },
        { metadata: {} },
      )
      await hooks["tool.execute.after"](
        { tool: "edit", sessionID: "ses_plan_runner", callID: "call_edit", args: { filePath: join(workspace, "src", "updated.txt") } },
        { metadata: {} },
      )
      await hooks["tool.execute.after"](
        {
          tool: "apply_patch",
          sessionID: "ses_plan_runner",
          callID: "call_patch",
          args: {
            patchText: [
              "*** Begin Patch",
              "*** Add File: src/patched.txt",
              "+patched",
              "*** Update File: src/renamed-from.txt",
              "*** Move to: src/renamed-to.txt",
              "@@",
              "-old",
              "+new",
              "*** End Patch",
            ].join("\n"),
          },
        },
        { metadata: {} },
      )

      const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.deepEqual(state.modified_files, [
        join("src", "created.txt"),
        join("src", "updated.txt"),
        join("src", "patched.txt"),
        join("src", "renamed-from.txt"),
        join("src", "renamed-to.txt"),
      ])
      assert.deepEqual(state.tasks[0].evidence.map((item) => item.files), [
        [join("src", "created.txt")],
        [join("src", "updated.txt")],
        [join("src", "patched.txt"), join("src", "renamed-from.txt"), join("src", "renamed-to.txt")],
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("watchdog nudges the same plan-runner session once when completed work idles before finish_plan", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const prompts = []
      const createdSessions = []
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async (payload) => {
                createdSessions.push(payload)
                return { data: { id: "ses_audit" } }
              },
              prompt: async (payload) => prompts.push(payload),
              promptAsync: async (payload) => prompts.push(payload),
            },
          },
        },
        { stateDir, completionGatePollMs: 5, completionGateTimeoutMs: 100 },
      )

      await prepareCompletionReadyState({ hooks, workspace, stateDir })

      await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_plan_runner" } } })
      await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_plan_runner" } } })

      const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.equal(state.status, "executing")
      assert.deepEqual(state.self_check, { status: "not_started", round: 0 })
      assert.equal(state.completion_gate, undefined)
      assert.equal(prompts.length, 1)
      assert.equal(prompts[0].path.id, "ses_plan_runner")
      assert.equal(prompts[0].body.agent, "plan-runner")
      assert.match(prompts[0].body.parts[0].text, /finish_plan/)
      assert.match(prompts[0].body.parts[0].text, /no final report/i)
      assert.equal(createdSessions.length, 0)
      assert.deepEqual(state.child_sessions, [])
      assert.equal(state.watchdog_nudge.count, 1)
      assert.equal(typeof state.watchdog_nudge.last_sent_at, "number")

      const events = readFileSync(join(stateDir, "events", "planrun-ses_parent-call_dispatch.jsonl"), "utf8")
      assert.match(events, /"type":"watchdog_nudge_sent"/)
      assert.doesNotMatch(events, /"type":"self_check_completed"/)
      assert.doesNotMatch(events, /"type":"self_check_prompt_sent"/)
      assert.doesNotMatch(events, /"type":"audit_review_dispatched"/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("watchdog does not nudge while a child session is still running", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const prompts = []
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              prompt: async (payload) => prompts.push(payload),
            },
          },
        },
        { stateDir },
      )
      const statePath = await prepareCompletionReadyState({ hooks, workspace, stateDir })
      const stateBeforeIdle = readJson(statePath)
      stateBeforeIdle.child_sessions = [{ session_id: "ses_child", role: "audit", status: "running" }]
      writeFileSync(statePath, JSON.stringify(stateBeforeIdle, null, 2) + "\n")

      await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_plan_runner" } } })

      const state = readJson(statePath)
      assert.equal(prompts.length, 0)
      assert.equal(state.watchdog_nudge, undefined)
      assert.deepEqual(state.child_sessions, [{ session_id: "ses_child", role: "audit", status: "running" }])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("watchdog does not nudge while finish_plan terminal gate is active", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const prompts = []
      const hooks = await PlanRunnerHarnessPlugin(
        { directory: workspace, client: { session: { prompt: async (payload) => prompts.push(payload) } } },
        { stateDir },
      )
      const statePath = await prepareCompletionReadyState({ hooks, workspace, stateDir })
      const stateBeforeIdle = readJson(statePath)
      stateBeforeIdle.completion_gate = { mode: "finish_plan", status: "running", started_at: Date.now() }
      writeFileSync(statePath, JSON.stringify(stateBeforeIdle, null, 2) + "\n")

      await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_plan_runner" } } })

      const state = readJson(statePath)
      assert.equal(prompts.length, 0)
      assert.equal(state.watchdog_nudge, undefined)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("watchdog does not nudge after finish_plan already reached a terminal status", async () => {
    for (const status of ["validated", "blocked"]) {
      const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
      try {
        const workspace = join(root, "workspace")
        const stateDir = join(root, "state")
        const prompts = []
        const hooks = await PlanRunnerHarnessPlugin(
          { directory: workspace, client: { session: { prompt: async (payload) => prompts.push(payload) } } },
          { stateDir },
        )
        const statePath = await prepareCompletionReadyState({ hooks, workspace, stateDir })
        const stateBeforeIdle = readJson(statePath)
        stateBeforeIdle.status = status
        stateBeforeIdle.completion_gate = { mode: "finish_plan", status, updated_at: Date.now() }
        writeFileSync(statePath, JSON.stringify(stateBeforeIdle, null, 2) + "\n")

        await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_plan_runner" } } })

        const state = readJson(statePath)
        assert.equal(prompts.length, 0)
        assert.equal(state.watchdog_nudge, undefined)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    }
  })

  it("watchdog does not nudge when completion gate status is interrupted", async () => {
    for (const status of ["interrupted"]) {
      const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
      try {
        const workspace = join(root, "workspace")
        const stateDir = join(root, "state")
        const prompts = []
        const hooks = await PlanRunnerHarnessPlugin(
          { directory: workspace, client: { session: { prompt: async (payload) => prompts.push(payload) } } },
          { stateDir },
        )
        const statePath = await prepareCompletionReadyState({ hooks, workspace, stateDir })
        const stateBeforeIdle = readJson(statePath)
        stateBeforeIdle.completion_gate = { status, updated_at: Date.now() }
        writeFileSync(statePath, JSON.stringify(stateBeforeIdle, null, 2) + "\n")

        await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_plan_runner" } } })

        const state = readJson(statePath)
        assert.equal(prompts.length, 0)
        assert.equal(state.watchdog_nudge, undefined)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    }
  })

  it("watchdog records failed prompt attempts so idle does not spam retries", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      let promptCalls = 0
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              prompt: async () => {
                promptCalls += 1
                throw new Error("prompt unavailable")
              },
            },
          },
        },
        { stateDir },
      )
      const statePath = await prepareCompletionReadyState({ hooks, workspace, stateDir })

      await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_plan_runner" } } })
      await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_plan_runner" } } })

      const state = readJson(statePath)
      assert.equal(promptCalls, 1)
      assert.equal(state.watchdog_nudge.count, 1)
      assert.equal(typeof state.watchdog_nudge.last_sent_at, "number")
      const events = readFileSync(join(stateDir, "events", "planrun-ses_parent-call_dispatch.jsonl"), "utf8")
      assert.equal((events.match(/"type":"watchdog_nudge_failed"/g) || []).length, 1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("watchdog records failed prompt events under the session index task id", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              prompt: async () => {
                throw new Error("prompt unavailable")
              },
            },
          },
        },
        { stateDir },
      )
      const statePath = await prepareCompletionReadyState({ hooks, workspace, stateDir })
      const stateBeforeIdle = readJson(statePath)
      delete stateBeforeIdle.task_id
      writeFileSync(statePath, JSON.stringify(stateBeforeIdle, null, 2) + "\n")

      await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_plan_runner" } } })

      const events = readFileSync(join(stateDir, "events", "planrun-ses_parent-call_dispatch.jsonl"), "utf8")
      assert.match(events, /"type":"watchdog_nudge_failed"/)
      assert.equal(existsSync(join(stateDir, "events", "undefined.jsonl")), false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("uses synchronous session.prompt to start a newly created audit session", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const prompts = []
      let asyncPromptCalls = 0
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async (payload) => {
                prompts.push(payload)
                return { data: { parts: [{ type: "text", text: "{}" }] } }
              },
              promptAsync: async () => {
                asyncPromptCalls += 1
                throw new Error("audit promptAsync must not be used for new audit sessions")
              },
            },
          },
        },
        { stateDir, completionGatePollMs: 5, completionGateTimeoutMs: 100 },
      )

      await prepareCompletionReadyState({ hooks, workspace, stateDir })

      const finish = hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))
        .catch(() => {})
      await waitUntil(() => prompts.some((payload) => payload.body?.agent === "plan-runner-audit"))

      const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.equal(state.status, "audit_review")
      assert.equal(asyncPromptCalls, 0)
      assert.equal(prompts.length, 1)
      assert.equal(prompts[0].path.id, "ses_audit")
      assert.equal(prompts[0].body.agent, "plan-runner-audit")
      assert.match(prompts[0].body.parts[0].text, new RegExp(`Plan path: ${state.plan_path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`))
      await finish
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("blocks plan-runner tools while terminal gate owns the flow", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const prompts = []
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async (payload) => prompts.push(payload),
              promptAsync: async (payload) => prompts.push(payload),
            },
          },
        },
        { stateDir, completionGatePollMs: 5, completionGateTimeoutMs: 100 },
      )
      await prepareCompletionReadyState({ hooks, workspace, stateDir })
      const finish = hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))
        .catch(() => {})
      await waitUntil(() => prompts.some((payload) => payload.body?.agent === "plan-runner-audit"))

      const statePath = join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json")
      assert.equal(readJson(statePath).status, "audit_review")
      assert.equal(prompts.at(-1).body.agent, "plan-runner-audit")

      await assert.rejects(
        () => hooks["tool.execute.before"](
          { tool: "bash", sessionID: "ses_plan_runner", callID: "call_terminal_bash" },
          { args: { command: "git status --short" } },
        ),
        /audit_review/,
      )
      await finish
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("dispatches audit review for older states missing optional array fields", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const prompts = []
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async (payload) => prompts.push(payload),
              promptAsync: async (payload) => prompts.push(payload),
            },
          },
        },
        { stateDir, completionGatePollMs: 5, completionGateTimeoutMs: 100 },
      )

      const statePath = join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json")
      await prepareCompletionReadyState({ hooks, workspace, stateDir })
      const stateMissingOptionalArrays = readJson(statePath)
      delete stateMissingOptionalArrays.modified_files
      delete stateMissingOptionalArrays.child_sessions
      writeFileSync(statePath, JSON.stringify(stateMissingOptionalArrays, null, 2) + "\n")

      const finish = hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))
        .catch(() => {})
      await waitUntil(() => prompts.some((payload) => payload.body?.agent === "plan-runner-audit"))

      const state = readJson(statePath)
      assert.equal(state.status, "audit_review")
      assert.deepEqual(state.child_sessions, [{ session_id: "ses_audit", role: "audit", status: "running" }])
      assert.equal(prompts[0].body.agent, "plan-runner-audit")
      assert.match(prompts[0].body.parts[0].text, /none recorded/)
      await finish
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("accepts unwrapped session.create results when dispatching audit review", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const prompts = []
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ id: "ses_audit" }),
              prompt: async (payload) => prompts.push(payload),
              promptAsync: async (payload) => prompts.push(payload),
            },
          },
        },
        { stateDir, completionGatePollMs: 5, completionGateTimeoutMs: 100 },
      )

      await prepareCompletionReadyState({ hooks, workspace, stateDir })

      const finish = hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))
        .catch(() => {})
      await waitUntil(() => prompts.some((payload) => payload.path?.id === "ses_audit"))

      const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.equal(state.status, "audit_review")
      assert.equal(prompts[0].path.id, "ses_audit")
      await finish
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("records orphan audit session id and diagnostic error details when prompt dispatch fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const error = new Error("prompt failed")
      error.stack = "PromptStack: prompt failed"
      error.response = { data: { message: "upstream rejected prompt" } }
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async (payload) => {
                if (payload.body?.agent === "plan-runner-audit") throw error
              },
            },
          },
        },
        { stateDir },
      )

      await prepareCompletionReadyState({ hooks, workspace, stateDir })

      await hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))

      const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.equal(state.status, "repairing")
      assert.deepEqual(state.child_sessions, [{ session_id: "ses_audit", role: "audit", status: "orphaned" }])
      assert.equal(state.completion_gate.status, "repair_required")
      assert.equal(state.completion_gate.source, "audit_review")
      assert.equal(state.gate_failures[0].source, "audit_review")
      assert.equal(state.gate_failures[0].failed_open, false)

      const events = readFileSync(join(stateDir, "events", "planrun-ses_parent-call_dispatch.jsonl"), "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
      const failure = events.find((event) => event.type === "audit_dispatch_failed")
      assert.equal(failure.orphan_session_id, "ses_audit")
      assert.match(failure.error, /PromptStack: prompt failed/)
      assert.match(failure.error, /upstream rejected prompt/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("treats SDK error objects from audit prompt dispatch as dispatch failures", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async (payload) => {
                if (payload.body?.agent === "plan-runner-audit") {
                  return { error: { data: { message: "agent not found: plan-runner-audit" } } }
                }
                return { data: {} }
              },
            },
          },
        },
        { stateDir },
      )

      await prepareCompletionReadyState({ hooks, workspace, stateDir })

      await hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))

      const statePath = join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json")
      const state = readJson(statePath)
      assert.equal(state.status, "repairing")
      assert.deepEqual(state.child_sessions, [{ session_id: "ses_audit", role: "audit", status: "orphaned" }])
      assert.equal(state.completion_gate.status, "repair_required")
      assert.equal(state.completion_gate.source, "audit_review")
      assert.equal(state.gate_failures[0].source, "audit_review")
      assert.equal(state.gate_failures[0].failed_open, false)
      const events = readFileSync(join(stateDir, "events", "planrun-ses_parent-call_dispatch.jsonl"), "utf8")
      assert.match(events, /audit_dispatch_failed/)
      assert.match(events, /agent not found: plan-runner-audit/)
      assert.doesNotMatch(events, /audit_review_dispatched/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("fails open audit dispatch after two failures and accumulates dispatch errors", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const createdSessions = []
      const externalCalls = []
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => {
                const id = `ses_audit_${createdSessions.length + 1}`
                createdSessions.push(id)
                return { data: { id } }
              },
              prompt: async () => {
                throw new Error("audit prompt unavailable")
              },
              promptAsync: async () => {},
            },
          },
        },
        {
          stateDir,
          completionGatePollMs: 5,
          completionGateTimeoutMs: 1000,
          externalReview: async (state) => {
            externalCalls.push(state.task_id)
            return { result: "pass", provider: "test-provider", findings: "No issues" }
          },
        },
      )
      const statePath = await prepareCompletionReadyState({ hooks, workspace, stateDir })

      const firstResult = await hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))
      let state = readJson(statePath)
      assert.match(String(firstResult.output || firstResult), /Result: repair_required/)
      assert.equal(state.status, "repairing")
      assert.equal(state.gate_failures.filter((item) => item.source === "audit_review").length, 1)
      assert.equal(state.gate_failures[0].failed_open, false)
      assert.equal(state.child_sessions[0].status, "orphaned")

      const secondResult = await hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))
      state = readJson(statePath)
      assert.match(String(secondResult.output || secondResult), /Result: validated/)
      assert.match(String(secondResult.output || secondResult), /audit prompt unavailable/)
      assert.equal(state.status, "validated")
      assert.equal(createdSessions.length, 2)
      assert.equal(externalCalls.length, 1)
      assert.equal(state.gate_failures.filter((item) => item.source === "audit_review").length, 2)
      assert.equal(state.gate_failures.at(-1).failed_open, true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("repairs the plan-runner session when audit review reports rejected work", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const prompts = []
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async (payload) => prompts.push(payload),
              promptAsync: async (payload) => prompts.push(payload),
            },
          },
        },
        { stateDir },
      )
      const { statePath, finish } = await prepareAuditReviewState({ hooks, workspace, stateDir })

      await hooks.event({ event: auditMessageEvent(JSON.stringify({
        round: 1,
        kind: "audit",
        result: "fail",
        verified_tasks: [],
        rejected_tasks: ["T1"],
        unknown_tasks: [],
        unmapped_files: [],
        required_fixes: ["fix T1 evidence"],
      })) })
      await hooks.event({ event: auditIdleEvent() })
      const finishResult = await finish

      const state = readJson(statePath)
      assert.equal(state.status, "repairing")
      assert.equal(state.reviews.round, 1)
      assert.equal(state.child_sessions[0].status, "completed")
      assert.equal(state.reviews.audit[0].result, "fail")
      assert.match(String(finishResult.output || finishResult), /Result: repair_required/)
      assert.match(String(finishResult.output || finishResult), /fix T1 evidence/)
      assert.equal(prompts.some((payload) => payload.path?.id === "ses_plan_runner"), false)

      await assert.rejects(
        () => hooks["tool.execute.before"](
          { tool: "todowrite", sessionID: "ses_plan_runner", callID: "call_repair_todo" },
          { args: { todos: [{ content: "T1: Edit file", status: "in_progress" }] } },
        ),
        /todowrite is forbidden for plan-runner/,
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("asks the audit child to regenerate when audit review output is not valid JSON", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const prompts = []
      const externalCalls = []
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async (payload) => prompts.push(payload),
              promptAsync: async (payload) => prompts.push(payload),
            },
          },
        },
        {
          stateDir,
          externalReview: async (state) => {
            externalCalls.push(state.task_id)
            return { result: "pass", provider: "test-provider", findings: "No issues" }
          },
        },
      )
      const { statePath, finish } = await prepareAuditReviewState({ hooks, workspace, stateDir })

      await hooks.event({ event: auditMessageEvent("Audit result: pass\nnot json") })
      await hooks.event({ event: auditIdleEvent() })

      await waitUntil(() => prompts.length >= 2)

      let state = readJson(statePath)
      assert.equal(state.status, "audit_review")
      assert.equal(state.reviews.audit.length, 0)
      assert.equal(state.reviews.audit_invalid_json_attempts, 1)
      assert.equal(prompts.at(-1).path.id, "ses_audit")
      assert.equal(prompts.at(-1).body.agent, "plan-runner-audit")
      assert.match(prompts.at(-1).body.parts[0].text, /invalid JSON/i)
      assert.match(prompts.at(-1).body.parts[0].text, /required_fixes/)

      await hooks.event({ event: auditTextPartEvent(JSON.stringify({ result: "pass", required_fixes: [] })) })
      await hooks.event({ event: auditIdleEvent() })
      const finishResult = await finish

      state = readJson(statePath)
      assert.equal(state.status, "validated")
      assert.equal(state.reviews.audit.length, 1)
      assert.equal(state.reviews.audit[0].result, "pass")
      assert.equal(externalCalls.length, 1)
      assert.match(String(finishResult.output || finishResult), /Result: validated/)
      assert.equal(prompts.some((payload) => payload.path?.id === "ses_plan_runner"), false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("fails open after two invalid audit JSON attempts and records the audit failure reason", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const prompts = []
      const externalCalls = []
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async (payload) => prompts.push(payload),
              promptAsync: async (payload) => prompts.push(payload),
            },
          },
        },
        {
          stateDir,
          externalReview: async (state) => {
            externalCalls.push(state.task_id)
            return { result: "pass", provider: "test-provider", findings: "No issues" }
          },
        },
      )
      const { statePath, finish } = await prepareAuditReviewState({ hooks, workspace, stateDir })

      await hooks.event({ event: auditMessageEvent("not json") })
      await hooks.event({ event: auditIdleEvent() })
      await waitUntil(() => prompts.length >= 2)
      await hooks.event({ event: auditMessageEvent("still not json") })
      await hooks.event({ event: auditIdleEvent() })
      const finishResult = await finish

      const state = readJson(statePath)
      assert.equal(state.status, "validated")
      assert.equal(state.reviews.audit[0].result, "pass")
      assert.match(state.reviews.audit[0].invalid_json_reason, /valid JSON/i)
      assert.equal(state.reviews.audit[0].invalid_json_attempts, 2)
      assert.equal(externalCalls.length, 1)
      assert.match(String(finishResult.output || finishResult), /Result: validated/)
      assert.equal(prompts.filter((payload) => payload.path?.id === "ses_audit").length, 2)
      assert.equal(prompts.some((payload) => payload.path?.id === "ses_plan_runner"), false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("consumes audit review JSON from text part updates before audit idle", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const prompts = []
      const externalCalls = []
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async (payload) => prompts.push(payload),
              promptAsync: async (payload) => prompts.push(payload),
            },
          },
        },
        {
          stateDir,
          externalReview: async (state) => {
            externalCalls.push(state.task_id)
            return { result: "pass", provider: "test-provider", findings: "No issues" }
          },
        },
      )
      const { statePath, finish } = await prepareAuditReviewState({ hooks, workspace, stateDir })

      await hooks.event({ event: auditTextPartEvent(JSON.stringify({
        result: "pass",
        rejected_tasks: [],
        unknown_tasks: [],
        unmapped_files: [],
        required_fixes: [],
      })) })
      await hooks.event({ event: { type: "message.updated", properties: { sessionID: "ses_audit", info: { id: "msg_audit_result", summary: { diffs: [] } } } } })
      await hooks.event({ event: auditIdleEvent() })
      const finishResult = await finish

      const state = readJson(statePath)
      assert.equal(state.status, "validated")
      assert.equal(state.reviews.audit[0].result, "pass")
      assert.equal(state.reviews.external[0].result, "pass")
      assert.equal(externalCalls.length, 1)
      assert.equal(prompts.at(-1).body.agent, "plan-runner-audit")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("does not dispatch audit more than once after audit-triggered repair", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const prompts = []
      const createdSessions = []
      const externalCalls = []
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async (payload) => {
                const id = `ses_audit_${createdSessions.length + 1}`
                createdSessions.push({ id, payload })
                return { data: { id } }
              },
              prompt: async (payload) => prompts.push(payload),
              promptAsync: async (payload) => prompts.push(payload),
            },
          },
        },
        {
          stateDir,
          externalReview: async (state) => {
            externalCalls.push(state.task_id)
            return { result: "pass", provider: "test-provider", findings: "No issues" }
          },
        },
      )
      const { statePath, finish } = await prepareAuditReviewState({ hooks, workspace, stateDir })

      await hooks.event({ event: {
        type: "message.updated",
        properties: {
          sessionID: "ses_audit_1",
          info: {
            id: "msg_audit_result",
            parts: [{ type: "text", text: JSON.stringify({
              result: "fail",
              rejected_tasks: ["T1"],
              unknown_tasks: [],
              unmapped_files: [],
              required_fixes: ["implementation is only an interface shell"],
            }) }],
          },
        },
      } })
      await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_audit_1" } } })
      const repairResult = await finish

      let state = readJson(statePath)
      assert.equal(state.status, "repairing")
      assert.equal(state.reviews.audit.length, 1)
      assert.equal(createdSessions.length, 1)
      assert.match(String(repairResult.output || repairResult), /Result: repair_required/)

      const secondFinish = hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))
      await secondFinish

      state = readJson(statePath)
      assert.equal(createdSessions.length, 1)
      assert.equal(externalCalls.length, 1)
      assert.equal(state.status, "validated")
      assert.equal(state.reviews.audit.length, 1)
      assert.equal(state.reviews.external[0].result, "pass")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("runs external review and marks the task validated after audit and external review pass", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const prompts = []
      const externalCalls = []
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async (payload) => prompts.push(payload),
              promptAsync: async (payload) => prompts.push(payload),
            },
          },
        },
        {
          stateDir,
          externalReview: async (state) => {
            externalCalls.push({ task_id: state.task_id, plan_path: state.plan_path })
            return { result: "pass", provider: "test-provider", findings: "No issues" }
          },
        },
      )
      const { statePath, finish } = await prepareAuditReviewState({ hooks, workspace, stateDir })

      await hooks.event({ event: auditMessageEvent(JSON.stringify({
        round: 1,
        kind: "audit",
        result: "pass",
        verified_tasks: ["T1"],
        rejected_tasks: [],
        unknown_tasks: [],
        unmapped_files: [],
        required_fixes: [],
      })) })
      await hooks.event({ event: auditIdleEvent() })
      const finishResult = await finish

      const state = readJson(statePath)
      assert.equal(state.status, "validated")
      assert.equal(externalCalls.length, 1)
      assert.equal(state.reviews.audit[0].result, "pass")
      assert.equal(state.reviews.external[0].result, "pass")
      assert.equal(state.reviews.external[0].provider, "test-provider")
      const events = readFileSync(join(stateDir, "events", "planrun-ses_parent-call_dispatch.jsonl"), "utf8")
      assert.match(events, /"type":"external_review_passed"/)
      assert.match(events, /"type":"task_validated"/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("consumes audit idle without runtime stale scanning when audit output is already pending", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const externalCalls = []
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async () => ({ data: {} }),
              promptAsync: async () => ({ data: {} }),
            },
          },
        },
        {
          stateDir,
          completionGatePollMs: 5,
          completionGateTimeoutMs: 1000,
          externalReview: async (state) => {
            externalCalls.push(state.task_id)
            return { result: "pass", provider: "test-provider", findings: "No issues" }
          },
        },
      )
      const { statePath, finish } = await prepareAuditReviewState({ hooks, workspace, stateDir })

      await hooks.event({ event: auditMessageEvent(JSON.stringify({
        result: "pass",
        rejected_tasks: [],
        unknown_tasks: [],
        unmapped_files: [],
        required_fixes: [],
      })) })

      const pendingState = readJson(statePath)
      assert.equal(pendingState.reviews.pending_audit_text.includes('"result":"pass"'), true)
      pendingState.lease_expires_at = Date.now() - 1000
      writeFileSync(statePath, JSON.stringify(pendingState, null, 2) + "\n")

      await hooks.event({ event: auditIdleEvent() })
      const finishResult = await finish

      const state = readJson(statePath)
      assert.equal(state.status, "validated")
      assert.match(String(finishResult.output || finishResult), /Result: validated/)
      assert.equal(externalCalls.length, 1)
      assert.equal(state.reviews.audit[0].result, "pass")
      const events = readFileSync(join(stateDir, "events", "planrun-ses_parent-call_dispatch.jsonl"), "utf8")
      assert.match(events, /"type":"audit_review_passed"/)
      assert.doesNotMatch(events, /"type":"task_stale"/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("finish_plan waits for audit and external review before allowing the final report", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const prompts = []
      const externalCalls = []
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async (payload) => prompts.push(payload),
              promptAsync: async (payload) => prompts.push(payload),
            },
          },
        },
        {
          stateDir,
          completionGatePollMs: 5,
          completionGateTimeoutMs: 1000,
          externalReview: async (state) => {
            externalCalls.push(state.task_id)
            return { result: "pass", provider: "test-provider", findings: "No issues" }
          },
        },
      )
      const statePath = await prepareCompletionReadyState({ hooks, workspace, stateDir })

      let settled = false
      const finish = hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))
        .then((result) => {
          settled = true
          return result
        })

      await waitUntil(() => prompts.some((payload) => payload.body?.agent === "plan-runner-audit"))
      assert.equal(settled, false)

      await hooks.event({ event: auditTextPartEvent(JSON.stringify({
        result: "pass",
        rejected_tasks: [],
        unknown_tasks: [],
        unmapped_files: [],
        required_fixes: [],
      })) })
      await hooks.event({ event: auditIdleEvent() })

      const result = await finish
      assert.match(String(result.output || result), /Result: validated/)
      assert.equal(externalCalls.length, 1)
      assert.equal(readJson(statePath).status, "validated")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("finish_plan requires a committed clean git repo before audit review", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      initGitWorkspace(workspace)
      const stateDir = join(root, "state")
      const prompts = []
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async (payload) => prompts.push(payload),
              promptAsync: async (payload) => prompts.push(payload),
            },
          },
        },
        { stateDir, completionGatePollMs: 5, completionGateTimeoutMs: 50 },
      )
      const statePath = await prepareCompletionReadyState({ hooks, workspace, stateDir })

      const result = await hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))

      assert.match(String(result.output || result), /Result: preflight_blocked/)
      assert.match(String(result.output || result), /plan_runner_requires_clean_repo_before_review/)
      assert.equal(prompts.length, 0)
      const state = readJson(statePath)
      assert.notEqual(state.status, "repairing")
      assert.equal(state.completion_gate, undefined)
      assert.equal(state.gate_failures, undefined)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("allows git boundary bash after completed tasks hit finish_plan preflight", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      initGitWorkspace(workspace)
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
      await hooks.tool.complete_task.execute({ id: "T1" }, makeContext({ sessionID: "ses_plan_runner", workspace }))
      await hooks.tool.start_task.execute({ id: "T2" }, makeContext({ sessionID: "ses_plan_runner", workspace }))
      await hooks.tool.complete_task.execute({ id: "T2" }, makeContext({ sessionID: "ses_plan_runner", workspace }))
      writeFileSync(join(workspace, "probe-output.txt"), "dirty root change\n")

      const finishResult = await hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))

      assert.match(String(finishResult.output || finishResult), /Result: preflight_blocked/)
      await assert.doesNotReject(() => hooks["tool.execute.before"](
        { tool: "bash", sessionID: "ses_plan_runner", callID: "call_git_status" },
        { args: { command: "git status --short && git add . && git commit -m \"test boundary commit\"" } },
      ))
      await assert.rejects(
        () => hooks["tool.execute.before"]({ tool: "apply_patch", sessionID: "ses_plan_runner", callID: "call_patch" }, { args: { patchText: "*** Begin Patch\n*** End Patch" } }),
        /start_task is required before execution tools/i,
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("finish_plan requires harness-managed child worktrees to be merged and cleaned before audit review", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      initGitWorkspace(workspace)
      const stateDir = join(root, "state")
      const prompts = []
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async (payload) => prompts.push(payload),
              promptAsync: async (payload) => prompts.push(payload),
            },
          },
        },
        { stateDir, completionGatePollMs: 5, completionGateTimeoutMs: 50 },
      )
      const statePath = await prepareCompletionReadyState({ hooks, workspace, stateDir })
      writeFileSync(join(workspace, "root-merged.txt"), "root merged change\n")
      git(workspace, ["add", "."])
      git(workspace, ["commit", "-m", "root merged change"])

      const childWorktree = join(root, "child-worktree")
      git(workspace, ["worktree", "add", "-b", "planrunner/test-child", childWorktree, "HEAD"])
      writeFileSync(join(childWorktree, "child-only.txt"), "child-only change\n")
      git(childWorktree, ["add", "child-only.txt"])
      git(childWorktree, ["commit", "-m", "child only change"])
      const stateBeforeFinish = readJson(statePath)
      stateBeforeFinish.child_sessions = [{
        call_id: "call_child",
        session_id: "ses_child",
        role: "executor",
        status: "completed",
        task_id: "T1",
        worktree: childWorktree,
        branch: "planrunner/test-child",
        base_commit: stateBeforeFinish.base_commit,
      }]
      writeFileSync(statePath, JSON.stringify(stateBeforeFinish, null, 2) + "\n")

      const result = await hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))

      assert.match(String(result.output || result), /Result: preflight_blocked/)
      assert.match(String(result.output || result), /plan_runner_requires_child_worktree_cleanup/)
      assert.equal(prompts.length, 0)
      const state = readJson(statePath)
      assert.notEqual(state.status, "repairing")
      assert.equal(state.completion_gate, undefined)
      assert.equal(state.gate_failures, undefined)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("finish_plan returns external review findings to plan-runner instead of prompting the main session", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const prompts = []
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async (payload) => prompts.push(payload),
              promptAsync: async (payload) => prompts.push(payload),
            },
          },
        },
        {
          stateDir,
          completionGatePollMs: 5,
          completionGateTimeoutMs: 1000,
          externalReview: async () => ({ result: "issues", provider: "test-provider", findings: "Important issue" }),
        },
      )
      const statePath = await prepareCompletionReadyState({ hooks, workspace, stateDir })

      const finish = hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))
      await waitUntil(() => prompts.some((payload) => payload.body?.agent === "plan-runner-audit"))
      await hooks.event({ event: auditTextPartEvent(JSON.stringify({
        result: "pass",
        rejected_tasks: [],
        unknown_tasks: [],
        unmapped_files: [],
        required_fixes: [],
      })) })
      await hooks.event({ event: auditIdleEvent() })

      const result = await finish
      assert.match(String(result.output || result), /Result: repair_required/)
      assert.match(String(result.output || result), /Important issue/)
      assert.equal(readJson(statePath).status, "repairing")
      assert.equal(prompts.some((payload) => payload.path?.id === "ses_plan_runner"), false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("rechecks external review after the second repair instead of blocking at the entrypoint", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const prompts = []
      const externalCalls = []
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async (payload) => prompts.push(payload),
              promptAsync: async (payload) => prompts.push(payload),
            },
          },
        },
        {
          stateDir,
          completionGatePollMs: 5,
          completionGateTimeoutMs: 1000,
          externalReview: async (state) => {
            externalCalls.push(state.task_id)
            return { result: "pass", provider: "test-provider", findings: "No issues" }
          },
        },
      )
      const statePath = await prepareCompletionReadyState({ hooks, workspace, stateDir })
      const stateBeforeRecheck = readJson(statePath)
      stateBeforeRecheck.status = "repairing"
      stateBeforeRecheck.self_check = { status: "completed", round: 1 }
      stateBeforeRecheck.reviews = {
        round: 2,
        audit: [{ result: "pass", rejected_tasks: [], unknown_tasks: [], unmapped_files: [], required_fixes: [] }],
        external: [{ result: "issues", provider: "test-provider", findings: "previous external issue" }],
      }
      stateBeforeRecheck.completion_gate = { mode: "finish_plan", status: "repair_required", source: "external_review", reasons: ["previous external issue"] }
      writeFileSync(statePath, JSON.stringify(stateBeforeRecheck, null, 2) + "\n")

      const finishResult = await hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))

      const state = readJson(statePath)
      assert.match(String(finishResult.output || finishResult), /Result: validated/)
      assert.equal(state.status, "validated")
      assert.equal(externalCalls.length, 1)
      assert.equal(prompts.length, 0)
      assert.equal(state.reviews.external.length, 2)
      assert.equal(state.reviews.external.at(-1).result, "pass")
      const events = readFileSync(join(stateDir, "events", "planrun-ses_parent-call_dispatch.jsonl"), "utf8")
      assert.match(events, /"type":"external_review_started"/)
      assert.match(events, /"type":"external_review_passed"/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("fails open deterministic check after two failures and accumulates the errors", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      initGitWorkspace(workspace)
      const stateDir = join(root, "state")
      const prompts = []
      const externalCalls = []
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async (payload) => prompts.push(payload),
              promptAsync: async (payload) => prompts.push(payload),
            },
          },
        },
        {
          stateDir,
          completionGatePollMs: 5,
          completionGateTimeoutMs: 1000,
          externalReview: async (state) => {
            externalCalls.push(state.task_id)
            return { result: "pass", provider: "test-provider", findings: "No issues" }
          },
        },
      )
      const statePath = await prepareCompletionReadyState({ hooks, workspace, stateDir })
      git(workspace, ["add", "."])
      git(workspace, ["commit", "-m", "docs(smoke): 准备门禁状态"])
      const stateBeforeRecheck = readJson(statePath)
      stateBeforeRecheck.status = "repairing"
      stateBeforeRecheck.tasks[0].evidence = []
      stateBeforeRecheck.gate_failures = [
        { source: "deterministic_check", attempt: 1, reasons: ["previous deterministic failure"], failed_open: false },
        { source: "completeness_check", attempt: 1, reasons: ["previous completeness failure"], failed_open: false },
      ]
      stateBeforeRecheck.completion_gate = { mode: "finish_plan", status: "repair_required", source: "deterministic_check", reasons: ["previous deterministic failure"] }
      writeFileSync(statePath, JSON.stringify(stateBeforeRecheck, null, 2) + "\n")

      const finish = hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))
      await waitUntil(() => prompts.some((payload) => payload.body?.agent === "plan-runner-audit"))
      await hooks.event({ event: auditTextPartEvent(JSON.stringify({ result: "pass", required_fixes: [] })) })
      await hooks.event({ event: auditIdleEvent() })
      const finishResult = await finish

      const state = readJson(statePath)
      assert.match(String(finishResult.output || finishResult), /Result: validated/)
      assert.match(String(finishResult.output || finishResult), /Gate Failures:/)
      assert.equal(state.status, "validated")
      assert.equal(externalCalls.length, 1)
      assert.equal(state.gate_failures.filter((item) => item.source === "deterministic_check").length, 2)
      assert.equal(state.gate_failures.at(-1).failed_open, true)
      assert.match(state.gate_failures.at(-1).reasons.join("\n"), /T1 missing diff evidence for probe-output\.txt/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("fails open external review after two failures and still records findings for the main agent", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const externalCalls = []
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async () => {},
              promptAsync: async () => {},
            },
          },
        },
        {
          stateDir,
          completionGatePollMs: 5,
          completionGateTimeoutMs: 1000,
          externalReview: async (state) => {
            externalCalls.push(state.task_id)
            return { result: "issues", provider: "test-provider", findings: "Important issue still present" }
          },
        },
      )
      const statePath = await prepareCompletionReadyState({ hooks, workspace, stateDir })
      const stateBeforeRecheck = readJson(statePath)
      stateBeforeRecheck.status = "repairing"
      stateBeforeRecheck.self_check = { status: "completed", round: 1 }
      stateBeforeRecheck.reviews = {
        round: 1,
        audit: [{ result: "pass", required_fixes: [] }],
        external: [{ result: "issues", provider: "test-provider", findings: "previous external issue" }],
      }
      stateBeforeRecheck.gate_failures = [{ source: "external_review", attempt: 1, reasons: ["previous external issue"], failed_open: false }]
      stateBeforeRecheck.completion_gate = { mode: "finish_plan", status: "repair_required", source: "external_review", reasons: ["previous external issue"] }
      writeFileSync(statePath, JSON.stringify(stateBeforeRecheck, null, 2) + "\n")

      const finishResult = await hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))

      const state = readJson(statePath)
      assert.match(String(finishResult.output || finishResult), /Result: validated/)
      assert.match(String(finishResult.output || finishResult), /Important issue still present/)
      assert.equal(state.status, "validated")
      assert.equal(externalCalls.length, 1)
      assert.equal(state.reviews.external.length, 2)
      assert.equal(state.reviews.external.at(-1).result, "issues")
      assert.equal(state.gate_failures.filter((item) => item.source === "external_review").length, 2)
      assert.equal(state.gate_failures.at(-1).failed_open, true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("fails open final completeness after two failures and ends with accumulated errors", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const externalCalls = []
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async () => {},
              promptAsync: async () => {},
            },
          },
        },
        {
          stateDir,
          completionGatePollMs: 5,
          completionGateTimeoutMs: 1000,
          externalReview: async (state) => {
            externalCalls.push(state.task_id)
            return { result: "pass", provider: "test-provider", findings: "No issues" }
          },
        },
      )
      const statePath = await prepareCompletionReadyState({ hooks, workspace, stateDir })
      const stateBeforeRecheck = readJson(statePath)
      stateBeforeRecheck.status = "repairing"
      stateBeforeRecheck.self_check = { status: "completed", round: 1 }
      stateBeforeRecheck.reviews = {
        round: 1,
        audit: [{ result: "pass", required_fixes: [] }],
        external: [],
      }
      stateBeforeRecheck.child_sessions = [{ session_id: "ses_child", role: "worker", status: "running" }]
      stateBeforeRecheck.gate_failures = [{ source: "completeness_check", attempt: 1, reasons: ["child sessions are still running"], failed_open: false }]
      stateBeforeRecheck.completion_gate = { mode: "finish_plan", status: "repair_required", source: "completeness_check", reasons: ["child sessions are still running"] }
      writeFileSync(statePath, JSON.stringify(stateBeforeRecheck, null, 2) + "\n")

      const finishResult = await hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))

      const state = readJson(statePath)
      assert.match(String(finishResult.output || finishResult), /Result: validated/)
      assert.match(String(finishResult.output || finishResult), /child sessions are still running/)
      assert.equal(state.status, "validated")
      assert.equal(externalCalls.length, 1)
      assert.equal(state.gate_failures.filter((item) => item.source === "completeness_check").length, 2)
      assert.equal(state.gate_failures.at(-1).failed_open, true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("does not restart terminal review after finish_plan already blocked", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const externalCalls = []
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async () => {},
              promptAsync: async () => {},
            },
          },
        },
        {
          stateDir,
          completionGatePollMs: 5,
          completionGateTimeoutMs: 1000,
          externalReview: async (state) => {
            externalCalls.push(state.task_id)
            return { result: "pass", provider: "test-provider", findings: "No issues" }
          },
        },
      )
      const statePath = await prepareCompletionReadyState({ hooks, workspace, stateDir })
      const blockedState = readJson(statePath)
      blockedState.status = "blocked"
      blockedState.self_check = { status: "completed", round: 1 }
      blockedState.reviews = {
        round: 2,
        audit: [{ result: "pass", rejected_tasks: [], unknown_tasks: [], unmapped_files: [], required_fixes: [] }],
        external: [
          { result: "issues", provider: "test-provider", findings: "first external issue" },
          { result: "issues", provider: "test-provider", findings: "second external issue" },
        ],
      }
      blockedState.completion_gate = {
        mode: "finish_plan",
        status: "blocked",
        source: "external_review",
        reasons: ["second external issue"],
      }
      writeFileSync(statePath, JSON.stringify(blockedState, null, 2) + "\n")

      const finishResult = await hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))

      const state = readJson(statePath)
      assert.match(String(finishResult.output || finishResult), /Result: blocked/)
      assert.match(String(finishResult.output || finishResult), /second external issue/)
      assert.equal(state.status, "blocked")
      assert.equal(state.completion_gate.status, "blocked")
      assert.equal(state.completion_gate.source, "external_review")
      assert.equal(externalCalls.length, 0)
      const events = readFileSync(join(stateDir, "events", "planrun-ses_parent-call_dispatch.jsonl"), "utf8")
      assert.doesNotMatch(events, /"type":"external_review_started"/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("runs configured external review command when no injected review function is provided", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const prompts = []
      const fakeReviewer = join(root, "fake-reviewer.mjs")
      writeFileSync(fakeReviewer, "console.log('### Issues\\n\\n#### Critical (Must Fix)\\nNone\\n\\n#### Important (Should Fix)\\nNone\\n\\n### Assessment\\nReady to merge? Yes')\n")
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async (payload) => prompts.push(payload),
              promptAsync: async (payload) => prompts.push(payload),
            },
          },
        },
        {
          stateDir,
          externalReviewCommand: { command: process.execPath, args: [fakeReviewer] },
        },
      )
      const { statePath, finish } = await prepareAuditReviewState({ hooks, workspace, stateDir })
      const stateBeforeAudit = readJson(statePath)
      stateBeforeAudit.git_base = "HEAD"
      writeFileSync(statePath, JSON.stringify(stateBeforeAudit, null, 2) + "\n")

      await hooks.event({ event: auditMessageEvent(JSON.stringify({
        round: 1,
        kind: "audit",
        result: "pass",
        verified_tasks: ["T1"],
        rejected_tasks: [],
        unknown_tasks: [],
        unmapped_files: [],
        required_fixes: [],
      })) })
      await hooks.event({ event: auditIdleEvent() })
      const finishResult = await finish

      const state = readJson(statePath)
      assert.equal(state.status, "validated")
      assert.equal(state.reviews.external[0].provider, "command")
      assert.match(state.reviews.external[0].findings, /Ready to merge/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("passes base commit to HEAD range to the external reviewer instead of WORKTREE", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    const oldCapturedArgs = process.env.CAPTURED_REVIEWER_ARGS
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const prompts = []
      const fakeReviewer = join(root, "fake-reviewer.mjs")
      const capturedArgs = join(root, "reviewer-args.json")
      writeFileSync(fakeReviewer, `import fs from "node:fs"
fs.writeFileSync(process.env.CAPTURED_REVIEWER_ARGS, JSON.stringify(process.argv.slice(2)))
console.log("### Issues\\n\\n#### Critical (Must Fix)\\nNone\\n\\n#### Important (Should Fix)\\nNone\\n\\n### Assessment\\nReady to merge? Yes")
`)
      process.env.CAPTURED_REVIEWER_ARGS = capturedArgs
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async (payload) => prompts.push(payload),
              promptAsync: async (payload) => prompts.push(payload),
            },
          },
        },
        {
          stateDir,
          externalReviewCommand: { command: process.execPath, args: [fakeReviewer] },
        },
      )
      const { statePath, finish } = await prepareAuditReviewState({ hooks, workspace, stateDir })
      const eventPath = join(stateDir, "events", "planrun-ses_parent-call_dispatch.jsonl")
      await waitUntil(() => readFileSync(eventPath, "utf8").includes("audit_review_dispatched"))
      const stateBeforeAudit = readJson(statePath)
      stateBeforeAudit.base_commit = "base-commit-sha"
      stateBeforeAudit.git_base = "base-commit-sha"
      writeFileSync(statePath, JSON.stringify(stateBeforeAudit, null, 2) + "\n")

      await hooks.event({ event: auditMessageEvent(JSON.stringify({
        round: 1,
        kind: "audit",
        result: "pass",
        verified_tasks: ["T1"],
        rejected_tasks: [],
        unknown_tasks: [],
        unmapped_files: [],
        required_fixes: [],
      })) })
      await hooks.event({ event: auditIdleEvent() })
      await finish

      const args = JSON.parse(readFileSync(capturedArgs, "utf8"))
      const state = readJson(statePath)
      assert.equal(args[0], "base-commit-sha")
      assert.equal(args[1], "HEAD")
      assert.equal(args.includes("WORKTREE"), false)
      const specIndex = args.indexOf("--spec")
      assert.notEqual(specIndex, -1)
      assert.equal(args[specIndex + 1], state.plan_path)
    } finally {
      if (oldCapturedArgs === undefined) delete process.env.CAPTURED_REVIEWER_ARGS
      else process.env.CAPTURED_REVIEWER_ARGS = oldCapturedArgs
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("treats Chinese none punctuation in external review issue sections as pass", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const fakeReviewer = join(root, "fake-reviewer.mjs")
      writeFileSync(fakeReviewer, `console.log("### Issues\\n\\n#### Critical (Must Fix)\\n无。\\n\\n#### Important (Should Fix)\\n无。\\n\\n### Assessment\\nReady to merge? Yes")
`)
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async () => {},
              promptAsync: async () => {},
            },
          },
        },
        {
          stateDir,
          externalReviewCommand: { command: process.execPath, args: [fakeReviewer] },
        },
      )
      const { statePath, finish } = await prepareAuditReviewState({ hooks, workspace, stateDir })
      const stateBeforeAudit = readJson(statePath)
      stateBeforeAudit.git_base = "HEAD"
      writeFileSync(statePath, JSON.stringify(stateBeforeAudit, null, 2) + "\n")

      await hooks.event({ event: auditMessageEvent(JSON.stringify({
        round: 1,
        kind: "audit",
        result: "pass",
        verified_tasks: ["T1"],
        rejected_tasks: [],
        unknown_tasks: [],
        unmapped_files: [],
        required_fixes: [],
      })) })
      await hooks.event({ event: auditIdleEvent() })
      await finish

      const state = readJson(statePath)
      assert.equal(state.status, "validated")
      assert.equal(state.reviews.external[0].result, "pass")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("uses external review count instead of repair count for reviewer round", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    const oldCapturedArgs = process.env.CAPTURED_REVIEWER_ARGS
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const fakeReviewer = join(root, "fake-reviewer.mjs")
      const capturedArgs = join(root, "reviewer-args.json")
      writeFileSync(fakeReviewer, `import fs from "node:fs"
fs.writeFileSync(process.env.CAPTURED_REVIEWER_ARGS, JSON.stringify(process.argv.slice(2)))
console.log("### Issues\\n\\n#### Critical (Must Fix)\\nNone\\n\\n#### Important (Should Fix)\\nNone\\n\\n### Assessment\\nReady to merge? Yes")
`)
      process.env.CAPTURED_REVIEWER_ARGS = capturedArgs
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async () => {},
              promptAsync: async () => {},
            },
          },
        },
        {
          stateDir,
          externalReviewCommand: { command: process.execPath, args: [fakeReviewer] },
        },
      )
      const { statePath, finish } = await prepareAuditReviewState({ hooks, workspace, stateDir })
      const stateBeforeAudit = readJson(statePath)
      stateBeforeAudit.git_base = "HEAD"
      stateBeforeAudit.reviews.round = 1
      stateBeforeAudit.reviews.external = []
      writeFileSync(statePath, JSON.stringify(stateBeforeAudit, null, 2) + "\n")

      await hooks.event({ event: auditMessageEvent(JSON.stringify({
        round: 1,
        kind: "audit",
        result: "pass",
        verified_tasks: ["T1"],
        rejected_tasks: [],
        unknown_tasks: [],
        unmapped_files: [],
        required_fixes: [],
      })) })
      await hooks.event({ event: auditIdleEvent() })
      const finishResult = await finish

      const args = JSON.parse(readFileSync(capturedArgs, "utf8"))
      const roundIndex = args.indexOf("--review-round")
      assert.notEqual(roundIndex, -1)
      assert.equal(args[roundIndex + 1], "1")
    } finally {
      if (oldCapturedArgs === undefined) delete process.env.CAPTURED_REVIEWER_ARGS
      else process.env.CAPTURED_REVIEWER_ARGS = oldCapturedArgs
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("falls back to the next external review provider when the first provider fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    const oldCapturedArgs = process.env.CAPTURED_REVIEWER_ARGS
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const fakeReviewer = join(root, "fake-reviewer.mjs")
      const capturedArgs = join(root, "reviewer-args.jsonl")
      writeFileSync(fakeReviewer, `import fs from "node:fs"
const args = process.argv.slice(2)
fs.appendFileSync(process.env.CAPTURED_REVIEWER_ARGS, JSON.stringify(args) + "\\n")
const provider = args[args.indexOf("--provider") + 1]
if (provider === "idealab-anthropic") {
  console.error("quota exhausted")
  process.exit(2)
}
console.log("### Issues\\n\\n#### Critical (Must Fix)\\nNone\\n\\n#### Important (Should Fix)\\nNone\\n\\n### Assessment\\nReady to merge? Yes")
`)
      process.env.CAPTURED_REVIEWER_ARGS = capturedArgs
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async () => {},
              promptAsync: async () => {},
            },
          },
        },
        {
          stateDir,
          externalReviewCommand: { command: process.execPath, args: [fakeReviewer] },
          externalReviewProviders: ["idealab-anthropic", "idealab-openai"],
        },
      )
      const { statePath, finish } = await prepareAuditReviewState({ hooks, workspace, stateDir })
      const stateBeforeAudit = readJson(statePath)
      stateBeforeAudit.git_base = "HEAD"
      writeFileSync(statePath, JSON.stringify(stateBeforeAudit, null, 2) + "\n")

      await hooks.event({ event: auditMessageEvent(JSON.stringify({
        result: "pass",
        rejected_tasks: [],
        unknown_tasks: [],
        unmapped_files: [],
        required_fixes: [],
      })) })
      await hooks.event({ event: auditIdleEvent() })
      await finish

      const attempts = readFileSync(capturedArgs, "utf8").trim().split("\n").map((line) => JSON.parse(line))
      const providers = attempts.map((args) => args[args.indexOf("--provider") + 1])
      assert.deepEqual(providers, ["idealab-anthropic", "idealab-openai"])

      const state = readJson(statePath)
      assert.equal(state.status, "validated")
      assert.equal(state.reviews.external[0].provider, "idealab-openai")
    } finally {
      if (oldCapturedArgs === undefined) delete process.env.CAPTURED_REVIEWER_ARGS
      else process.env.CAPTURED_REVIEWER_ARGS = oldCapturedArgs
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("uses CLAUDE_CONFIG_HOME to locate the default external reviewer command", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    const oldClaudeConfigHome = process.env.CLAUDE_CONFIG_HOME
    const oldPath = process.env.PATH
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const fakeConfigHome = join(root, "config-home")
      const fakeReviewer = join(fakeConfigHome, "userconf", "skills", "external-llm-review", "reviewer.py")
      const fakeBin = join(root, "bin")
      const capturedArgs = join(root, "uv-args.json")

      mkdirSync(dirname(fakeReviewer), { recursive: true })
      writeFileSync(fakeReviewer, "# fake reviewer\n")
      mkdirSync(fakeBin, { recursive: true })
      writeFileSync(join(fakeBin, "uv"), `#!/usr/bin/env node
const fs = require("node:fs")
fs.writeFileSync(process.env.CAPTURED_UV_ARGS, JSON.stringify(process.argv.slice(2)))
console.log("### Issues\\n\\n#### Critical (Must Fix)\\nNone\\n\\n#### Important (Should Fix)\\nNone\\n\\n### Assessment\\nReady to merge? Yes")
`)
      chmodSync(join(fakeBin, "uv"), 0o755)
      process.env.CLAUDE_CONFIG_HOME = fakeConfigHome
      process.env.PATH = `${fakeBin}:${oldPath}`
      process.env.CAPTURED_UV_ARGS = capturedArgs

      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async () => {},
              promptAsync: async () => {},
            },
          },
        },
        { stateDir },
      )
      const { statePath, finish } = await prepareAuditReviewState({ hooks, workspace, stateDir })
      const stateBeforeAudit = readJson(statePath)
      stateBeforeAudit.git_base = "HEAD"
      writeFileSync(statePath, JSON.stringify(stateBeforeAudit, null, 2) + "\n")

      await hooks.event({ event: auditMessageEvent(JSON.stringify({
        round: 1,
        kind: "audit",
        result: "pass",
        verified_tasks: ["T1"],
        rejected_tasks: [],
        unknown_tasks: [],
        unmapped_files: [],
        required_fixes: [],
      })) })
      await hooks.event({ event: auditIdleEvent() })
      const finishResult = await finish

      const args = JSON.parse(readFileSync(capturedArgs, "utf8"))
      assert.ok(args.includes(fakeReviewer), `expected default command to include ${fakeReviewer}, got ${args.join(" ")}`)
    } finally {
      if (oldClaudeConfigHome === undefined) delete process.env.CLAUDE_CONFIG_HOME
      else process.env.CLAUDE_CONFIG_HOME = oldClaudeConfigHome
      if (oldPath === undefined) delete process.env.PATH
      else process.env.PATH = oldPath
      delete process.env.CAPTURED_UV_ARGS
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("repairs the plan-runner session when external review reports issues", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const prompts = []
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async (payload) => prompts.push(payload),
              promptAsync: async (payload) => prompts.push(payload),
            },
          },
        },
        {
          stateDir,
          externalReview: async () => ({ result: "issues", provider: "test-provider", findings: "Important issue" }),
        },
      )
      const { statePath, finish } = await prepareAuditReviewState({ hooks, workspace, stateDir })

      await hooks.event({ event: auditMessageEvent(JSON.stringify({
        round: 1,
        kind: "audit",
        result: "pass",
        verified_tasks: ["T1"],
        rejected_tasks: [],
        unknown_tasks: [],
        unmapped_files: [],
        required_fixes: [],
      })) })
      await hooks.event({ event: auditIdleEvent() })
      const finishResult = await finish

      const state = readJson(statePath)
      assert.equal(state.status, "repairing")
      assert.equal(state.reviews.round, 1)
      assert.equal(state.reviews.external[0].result, "issues")
      assert.match(String(finishResult.output || finishResult), /Result: repair_required/)
      assert.match(String(finishResult.output || finishResult), /Important issue/)
      assert.equal(prompts.some((payload) => payload.path?.id === "ses_plan_runner"), false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("repairs when external review section contains an issue after a none line", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const fakeReviewer = join(root, "fake-reviewer.mjs")
      writeFileSync(fakeReviewer, `console.log(${JSON.stringify("### Issues\n\n#### Critical (Must Fix)\nNone\n\n#### Important (Should Fix)\nNone\n- missing validation for audit output\n\n### Assessment\nReady to merge? No")})\n`)
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async () => {},
              promptAsync: async () => {},
            },
          },
        },
        {
          stateDir,
          externalReviewCommand: { command: process.execPath, args: [fakeReviewer] },
        },
      )
      const { statePath, finish } = await prepareAuditReviewState({ hooks, workspace, stateDir })
      const stateBeforeAudit = readJson(statePath)
      stateBeforeAudit.git_base = "HEAD"
      writeFileSync(statePath, JSON.stringify(stateBeforeAudit, null, 2) + "\n")

      await hooks.event({ event: auditMessageEvent(JSON.stringify({
        round: 1,
        kind: "audit",
        result: "pass",
        verified_tasks: ["T1"],
        rejected_tasks: [],
        unknown_tasks: [],
        unmapped_files: [],
        required_fixes: [],
      })) })
      await hooks.event({ event: auditIdleEvent() })
      const finishResult = await finish

      const state = readJson(statePath)
      assert.equal(state.status, "repairing")
      assert.equal(state.reviews.external[0].result, "issues")
      assert.match(state.reviews.external[0].findings, /missing validation/)
      assert.match(String(finishResult.output || finishResult), /Result: repair_required/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("allows repair execution tools after review findings without restarting a completed task", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async () => {},
              promptAsync: async () => {},
            },
          },
        },
        {
          stateDir,
          completionGatePollMs: 5,
          completionGateTimeoutMs: 1000,
          externalReview: async () => ({ result: "issues", provider: "test-provider", findings: "Fix src/app.js" }),
        },
      )
      const { statePath, finish } = await prepareAuditReviewState({ hooks, workspace, stateDir })
      await hooks.event({ event: auditTextPartEvent(JSON.stringify({ result: "pass", required_fixes: [] })) })
      await hooks.event({ event: auditIdleEvent() })

      const finishResult = await finish
      const state = readJson(statePath)
      assert.match(String(finishResult.output || finishResult), /Result: repair_required/)
      assert.equal(state.status, "repairing")
      assert.equal(state.active_task, null)
      assert.deepEqual(state.tasks.map((task) => task.status), ["completed"])

      await assert.doesNotReject(() => hooks["tool.execute.before"](
        { tool: "apply_patch", sessionID: "ses_plan_runner", callID: "call_repair_patch" },
        { args: { patchText: "*** Begin Patch\n*** Update File: src/app.js\n@@\n-old\n+new\n*** End Patch" } },
      ))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("leaves expired task state untouched on idle and ignored todo events", async () => {
    const cases = [
      { name: "idle", event: { type: "session.idle", properties: { sessionID: "ses_unrelated" } } },
      { name: "todo", event: { type: "todo.updated", properties: { sessionID: "ses_unrelated", todos: [{ content: "T1: unrelated", status: "completed" }] } } },
    ]

    for (const { name, event } of cases) {
      const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
      try {
        const workspace = join(root, "workspace")
        const stateDir = join(root, "state")
        const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })
        const taskDir = join(stateDir, "tasks")
        const taskID = `planrun-expired-${name}`
        const statePath = join(taskDir, `${taskID}.json`)
        mkdirSync(taskDir, { recursive: true })
        writeFileSync(statePath, JSON.stringify(expiredTaskState({ taskID, status: "repairing", workspace }), null, 2) + "\n")

        await hooks.event({ event })

        const state = readJson(statePath)
        assert.equal(state.status, "repairing")
        assert.equal(state.task_id, taskID)
        assert.equal(existsSync(join(stateDir, "events", `${taskID}.jsonl`)), false)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    }
  })

  it("leaves expired task state untouched on high-frequency message events", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })
      const taskDir = join(stateDir, "tasks")
      const statePath = join(taskDir, "planrun-expired.json")
      mkdirSync(taskDir, { recursive: true })
      writeFileSync(statePath, JSON.stringify(expiredTaskState({ taskID: "planrun-expired", status: "repairing", workspace }), null, 2) + "\n")

      await hooks.event({ event: { type: "message.updated", properties: { sessionID: "ses_unrelated", info: { id: "msg" } } } })
      assert.equal(readJson(statePath).status, "repairing")
      assert.equal(existsSync(join(stateDir, "events", "planrun-expired.jsonl")), false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("does not let runtime stale overwrite audit external or repair gate states", async () => {
    const cases = [
      { status: "audit_review", gateStatus: "running" },
      { status: "external_review", gateStatus: "running" },
      { status: "repairing", gateStatus: "repair_required" },
    ]

    for (const { status, gateStatus } of cases) {
      const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
      try {
        const workspace = join(root, "workspace")
        const stateDir = join(root, "state")
        const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })
        const taskDir = join(stateDir, "tasks")
        const taskID = `planrun-expired-${status}`
        const statePath = join(taskDir, `${taskID}.json`)
        mkdirSync(taskDir, { recursive: true })
        writeFileSync(statePath, JSON.stringify(expiredTaskState({
          taskID,
          status,
          workspace,
          completionGate: { mode: "finish_plan", status: gateStatus, source: "test", reasons: ["pending gate"] },
        }), null, 2) + "\n")

        await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_unrelated" } } })

        const state = readJson(statePath)
        assert.equal(state.status, status)
        assert.equal(state.completion_gate.status, gateStatus)
        assert.equal(existsSync(join(stateDir, "events", `${taskID}.jsonl`)), false)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    }
  })

  it("does not revive stale self_checking prompted task states", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const taskDir = join(stateDir, "tasks")
      const sessionDir = join(stateDir, "sessions")
      const taskID = "planrun-stale-self-check"
      mkdirSync(taskDir, { recursive: true })
      mkdirSync(sessionDir, { recursive: true })
      writeFileSync(join(sessionDir, "ses_plan_runner.json"), JSON.stringify({
        session_id: "ses_plan_runner",
        task_id: taskID,
        role: "plan-runner",
      }, null, 2) + "\n")
      writeFileSync(join(taskDir, `${taskID}.json`), JSON.stringify({
        version: 2,
        task_id: taskID,
        status: "self_checking",
        parent_session_id: "ses_parent",
        dispatch_call_id: "call_dispatch",
        plan_runner_session_id: "ses_plan_runner",
        worktree: workspace,
        updated_at: Date.now(),
        lease_expires_at: Date.now() + 10 * 60 * 1000,
        brief_path: join(workspace, "briefs", `${taskID}.md`),
        brief_sha256: "sha",
        tasks: [{
          id: "T1",
          title: "Edit file",
          files: ["probe-output.txt"],
          checks: [],
          negative_checks: [],
          status: "completed",
          evidence: [{ id: "ev-diff", type: "diff", task_ids: ["T1"], event_ids: ["evt"], files: ["probe-output.txt"] }],
        }],
        active_task: null,
        modified_files: ["probe-output.txt"],
        child_sessions: [],
        reviews: { round: 0, audit: [], external: [] },
        self_check: { status: "prompted", round: 1 },
      }, null, 2) + "\n")

      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async () => ({ data: {} }),
            },
          },
        },
        { stateDir },
      )

      await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_plan_runner" } } })

      const state = readJson(join(taskDir, `${taskID}.json`))
      assert.equal(state.status, "self_checking")
      assert.equal(state.self_check.status, "prompted")
      assert.equal(existsSync(join(stateDir, "events", `${taskID}.jsonl`)), false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("ignores agent-supplied command evidence_required in write_plan", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const prompts = []
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async (payload) => prompts.push(payload),
              promptAsync: async (payload) => prompts.push(payload),
            },
          },
        },
        {
          stateDir,
          externalReview: async () => ({ result: "pass", provider: "test-provider", findings: "No issues" }),
        },
      )

      const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Validate." } }
      await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
        { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
      )
      await hooks.tool.write_plan.execute(
        {
          content: planContent("Command Evidence"),
          title: "Command Evidence",
          tasks: [{ ...oneTask({ title: "Run validation" }), evidence_required: ["command"] }],
          dag: [],
          parallel_sets: [],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      )
      await startStructuredTask({ hooks, workspace })
      await hooks["tool.execute.after"](
        { tool: "bash", sessionID: "ses_plan_runner", callID: "call_validate", args: { command: "node --test" } },
        { metadata: { exit: 0 }, output: "ok" },
      )
      await completeStructuredTask({ hooks, workspace })

      const statePath = join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json")
      assert.equal("evidence_required" in readJson(statePath).tasks[0], false)

      const finishResult = await hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))

      const state = readJson(statePath)
      assert.equal(state.status, "repairing")
      assert.match(String(finishResult.output || finishResult), /Result: repair_required/)
      assert.match(String(finishResult.output || finishResult), /T1 missing diff evidence for probe-output\.txt/)
      assert.equal(prompts.length, 0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("does not treat command-only evidence as completed implementation evidence", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const prompts = []
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async (payload) => prompts.push(payload),
              promptAsync: async (payload) => prompts.push(payload),
            },
          },
        },
        { stateDir },
      )

      const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Implement." } }
      await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
        { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
      )
      await hooks.tool.write_plan.execute(
        {
          content: planContent("Command Only"),
          title: "Command Only",
          tasks: [oneTask({ title: "Implement code" })],
          dag: [],
          parallel_sets: [],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      )
      await startStructuredTask({ hooks, workspace })
      await hooks["tool.execute.after"](
        { tool: "bash", sessionID: "ses_plan_runner", callID: "call_test", args: { command: "node --test" } },
        { metadata: { exit: 0 }, output: "ok" },
      )
      await completeStructuredTask({ hooks, workspace })

      const statePath = join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json")
      const finishResult = await hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))

      assert.equal(prompts.length, 0)
      assert.match(String(finishResult.output || finishResult), /Result: repair_required/)
      assert.match(String(finishResult.output || finishResult), /T1 missing diff evidence for probe-output\.txt/)
      assert.equal(readJson(statePath).status, "repairing")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("does not continue review when repair completes via message update; finish_plan is required", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const prompts = []
      const hooks = await PlanRunnerHarnessPlugin(
        {
          directory: workspace,
          client: {
            session: {
              create: async () => ({ data: { id: "ses_audit" } }),
              prompt: async (payload) => prompts.push(payload),
              promptAsync: async (payload) => prompts.push(payload),
            },
          },
        },
        { stateDir },
      )

      const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Implement." } }
      await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
        { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
      )
      await hooks.tool.write_plan.execute(
        {
          content: planContent("Repair Completion Boundary"),
          title: "Repair Completion Boundary",
          tasks: [oneTask({ title: "Implement file", files: ["src/app.js"] })],
          dag: [],
          parallel_sets: [],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      )
      await startStructuredTask({ hooks, workspace })
      await completeStructuredTask({ hooks, workspace })

      const statePath = join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json")
      const firstFinish = await hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))

      assert.equal(readJson(statePath).status, "repairing")
      assert.match(String(firstFinish.output || firstFinish), /T1 missing diff evidence for src\/app\.js/)

      const patchText = [
        "*** Begin Patch",
        "*** Update File: src/app.js",
        "@@",
        "-old",
        "+new",
        "*** End Patch",
      ].join("\n")
      await hooks["tool.execute.after"](
        { tool: "apply_patch", sessionID: "ses_plan_runner", callID: "call_repair_patch", args: { patchText } },
        {},
      )
      await hooks.event({
        event: {
          type: "message.updated",
          properties: {
            sessionID: "ses_plan_runner",
            info: {
              id: "msg_repair_done",
              role: "assistant",
              finish: "stop",
              time: { completed: Date.now() },
            },
          },
        },
      })

      let state = readJson(statePath)
      assert.equal(state.status, "repairing")
      assert.equal(prompts.length, 0)

      const eventPath = join(stateDir, "events", "planrun-ses_parent-call_dispatch.jsonl")
      const secondFinish = hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))
      await waitUntil(() => prompts.some((payload) => payload.body?.agent === "plan-runner-audit"))
      await waitUntil(() => readFileSync(eventPath, "utf8").includes("audit_review_dispatched"))
      state = readJson(statePath)
      assert.equal(state.status, "audit_review")
      assert.equal(prompts[0].body.agent, "plan-runner-audit")
      const events = readFileSync(eventPath, "utf8")
      assert.match(events, /deterministic_check_passed/)
      assert.match(events, /audit_review_dispatched/)
      secondFinish.catch(() => {})
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("binds repair diff evidence to the missing completed task before unrelated active work", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const taskDir = join(stateDir, "tasks")
      const sessionDir = join(stateDir, "sessions")
      const taskID = "planrun-repair-evidence"
      mkdirSync(taskDir, { recursive: true })
      mkdirSync(sessionDir, { recursive: true })
      writeFileSync(join(sessionDir, "ses_plan_runner.json"), JSON.stringify({
        session_id: "ses_plan_runner",
        task_id: taskID,
        role: "plan-runner",
      }, null, 2) + "\n")
      writeFileSync(join(taskDir, `${taskID}.json`), JSON.stringify({
        version: 2,
        task_id: taskID,
        status: "repairing",
        parent_session_id: "ses_parent",
        dispatch_call_id: "call_dispatch",
        plan_runner_session_id: "ses_plan_runner",
        worktree: workspace,
        updated_at: Date.now(),
        lease_expires_at: Date.now() + 10 * 60 * 1000,
        brief_path: join(workspace, "briefs", `${taskID}.md`),
        brief_sha256: "sha",
        tasks: [
          { id: "T1", title: "Write file", files: ["probe-output.txt"], checks: [], negative_checks: [], status: "completed", evidence: [{ id: "ev-diff", type: "diff", task_ids: ["T1"], event_ids: ["evt"], files: ["probe-output.txt"] }] },
          { id: "T2", title: "Implement marker", files: ["src/marker.js"], checks: [], negative_checks: [], status: "completed", evidence: [] },
          { id: "T3", title: "Whitespace", files: ["src/whitespace.js"], checks: [], negative_checks: [], status: "in_progress", evidence: [] },
        ],
        active_task: "T3",
        modified_files: ["probe-output.txt"],
        child_sessions: [],
        reviews: { round: 1, audit: [], external: [] },
        self_check: { status: "completed", round: 1 },
      }, null, 2) + "\n")

      const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })
      const patchText = [
        "*** Begin Patch",
        "*** Update File: src/marker.js",
        "@@",
        "-old",
        "+new",
        "*** End Patch",
      ].join("\n")
      await hooks["tool.execute.after"](
        { tool: "apply_patch", sessionID: "ses_plan_runner", callID: "call_repair_t2", args: { patchText } },
        {},
      )

      const state = readJson(join(taskDir, `${taskID}.json`))
      const evidence = state.tasks[1].evidence.find((item) => item.id === "ev-diff-tool-after-call_repair_t2")
      assert.deepEqual(evidence.task_ids, ["T2"])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("returns deterministic validation failures from finish_plan without promptAsync", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const prompts = []
      const client = {
        session: {
          promptAsync: async (payload) => {
            prompts.push(payload)
          },
        },
      }
      const hooks = await PlanRunnerHarnessPlugin({ directory: workspace, client }, { stateDir })

      const taskOutput = {
        args: { background: true, subagent_type: "plan-runner", prompt: "Implement." },
      }
      await hooks["tool.execute.before"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch" },
        taskOutput,
      )
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
        { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
      )
      await hooks.tool.write_plan.execute(
        {
          content: planContent("Idle Slice"),
          title: "Idle Slice",
          tasks: [oneTask({ title: "Need evidence" })],
          dag: [],
          parallel_sets: [],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      )
      await startStructuredTask({ hooks, workspace })
      await completeStructuredTask({ hooks, workspace })

      await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_child" } } })
      assert.equal(prompts.length, 0)

      const finishResult = await hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))

      assert.equal(prompts.length, 0)
      assert.match(String(finishResult.output || finishResult), /Result: repair_required/)
      assert.match(String(finishResult.output || finishResult), /T1/)

      const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.equal(state.status, "repairing")
      assert.equal(state.reviews.round, 1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
