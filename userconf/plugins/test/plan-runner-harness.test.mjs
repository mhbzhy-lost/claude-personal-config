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

async function prepareAuditReviewState({ hooks, workspace, stateDir }) {
  const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Implement." } }
  await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
  await hooks["tool.execute.after"](
    { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
    { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
  )
  await hooks.tool.write_plan.execute(
    {
      title: "Audit Consumption Slice",
      tasks: [{ title: "Edit file", completion_criteria: ["diff evidence exists"] }],
      dag: [],
      parallel_sets: [],
    },
    makeContext({ sessionID: "ses_plan_runner", workspace }),
  )
  await hooks.event({ event: { type: "todo.updated", properties: { sessionID: "ses_plan_runner", todos: [{ content: "T1: Edit file", status: "in_progress" }] } } })
  await hooks.event({ event: { type: "message.updated", properties: { sessionID: "ses_plan_runner", info: { id: "msg_with_diff", summary: { diffs: [{ file: "probe-output.txt" }] } } } } })
  await hooks.event({ event: { type: "todo.updated", properties: { sessionID: "ses_plan_runner", todos: [{ content: "T1: Edit file", status: "completed" }] } } })
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
  const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Implement." } }
  await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
  await hooks["tool.execute.after"](
    { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
    { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
  )
  await hooks.tool.write_plan.execute(
    {
      title: "Completion Gate Slice",
      tasks: [{ title: "Edit file", completion_criteria: ["diff evidence exists"] }],
      dag: [],
      parallel_sets: [],
    },
    makeContext({ sessionID: "ses_plan_runner", workspace }),
  )
  await hooks.event({ event: { type: "todo.updated", properties: { sessionID: "ses_plan_runner", todos: [{ content: "T1: Edit file", status: "in_progress" }] } } })
  await hooks.event({ event: { type: "message.updated", properties: { sessionID: "ses_plan_runner", info: { id: "msg_with_diff", summary: { diffs: [{ file: "probe-output.txt" }] } } } } })
  await hooks.event({ event: { type: "todo.updated", properties: { sessionID: "ses_plan_runner", todos: [{ content: "T1: Edit file", status: "completed" }] } } })

  return join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json")
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

describe("PlanRunnerHarnessPlugin", () => {
  it("does not export helper functions as plugin entries", async () => {
    const mod = await import("../plan-runner-harness.js")
    const functionExports = Object.entries(mod)
      .filter(([, value]) => typeof value === "function")
      .map(([name]) => name)

    assert.deepEqual(functionExports.sort(), ["PlanRunnerHarnessPlugin", "default"].sort())
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

  it("write_plan writes markdown and stores only the consumed plan contract", async () => {
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

      const result = await hooks.tool.write_plan.execute(
        {
          title: "Harness Slice",
          goal: "Create the first harness slice",
          approach: "Use a small state file and markdown plan",
          non_goals: ["No full validation loop yet"],
          tasks: [
            { title: "Persist state", completion_criteria: ["state file exists"], evidence_required: ["command"] },
            { title: "Write markdown", completion_criteria: ["plan file exists"] },
          ],
          dag: [["T1", "T2"]],
          parallel_sets: [],
          stop_conditions: ["promptAsync unavailable"],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      )

      assert.match(String(result.output || result), /plan written/i)

      const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.equal(state.status, "waiting_for_todo")
      assert.equal(state.plan_contract.tasks.length, 2)
      assert.deepEqual(state.plan_contract.tasks[0], {
        id: "T1",
        title: "Persist state",
        completion_criteria: ["state file exists"],
      })
      assert.equal("evidence_required" in state.plan_contract.tasks[0], false)
      assert.deepEqual(state.plan_contract.dag, [["T1", "T2"]])
      assert.equal("check_commands" in state.plan_contract, false)
      assert.ok(state.plan_sha256)
      assert.ok(existsSync(state.plan_path))

      const markdown = readFileSync(state.plan_path, "utf8")
      assert.match(markdown, /# Harness Slice/)
      assert.match(markdown, /Plan item T1: Persist state/)
      assert.equal(markdown.includes("TODO:"), false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("write_plan uses the persisted task worktree when tool context reports root", async () => {
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
          title: "Root Context Slice",
          tasks: [{ title: "Persist plan", completion_criteria: ["plan file exists under workspace"] }],
          dag: [],
          parallel_sets: [],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace: "/" }),
      )

      const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.equal(state.plan_path, join(workspace, "docs", "plans", "planrun-ses_parent-call_dispatch.md"))
      assert.ok(existsSync(state.plan_path))
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

  it("write_plan rejects cyclic DAGs", async () => {
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

      await assert.rejects(
        () => hooks.tool.write_plan.execute(
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
        ),
        /cycle/,
      )
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

      const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })

      await assert.doesNotReject(
        () => hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_plan_runner" } } }),
      )

      assert.equal(existsSync(taskPath), false)
      assert.equal(existsSync(join(stateDir, "corrupt", "tasks", `${taskID}.json`)), true)
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

  it("phase gate blocks execution until plan is written and todos mirror all tasks", async () => {
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
          { args: { command: "printf before-todo" } },
        ),
        /waiting_for_todo/,
      )

      await assert.doesNotReject(() => hooks["tool.execute.before"](
        { tool: "skill", sessionID: "ses_plan_runner", callID: "call_skill_todo" },
        { args: { name: "verification-before-completion" } },
      ))

      await hooks.event({
        event: {
          type: "todo.updated",
          properties: {
            sessionID: "ses_plan_runner",
            todos: [
              { content: "T1: Persist state", status: "in_progress" },
              { content: "T2: Write markdown", status: "pending" },
            ],
          },
        },
      })

      const stateAfterTodo = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.equal(stateAfterTodo.status, "ready_to_execute")
      assert.equal(stateAfterTodo.todo.mirrored, true)

      await assert.doesNotReject(() => hooks["tool.execute.before"](
        { tool: "skill", sessionID: "ses_plan_runner", callID: "call_skill_execute" },
        { args: { name: "verification-before-completion" } },
      ))

      await assert.doesNotReject(() => hooks["tool.execute.before"](
        { tool: "apply_patch", sessionID: "ses_plan_runner", callID: "call_patch" },
        { args: { patchText: "*** Begin Patch\n*** End Patch" } },
      ))

      await assert.doesNotReject(() => hooks["tool.execute.before"](
        { tool: "bash", sessionID: "ses_plan_runner", callID: "call_bash" },
        { args: { command: "printf ok" } },
      ))
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

  it("records command evidence for execution tools and maps it to the active todo", async () => {
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
          title: "Evidence Slice",
          tasks: [{ title: "Run command", completion_criteria: ["command evidence exists"] }],
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
            todos: [{ content: "T1: Run command", status: "in_progress" }],
          },
        },
      })

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
      assert.equal(state.evidence.length, 1)
      assert.deepEqual(state.evidence[0], {
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
          title: "Diff Slice",
          tasks: [{ title: "Edit file", completion_criteria: ["diff evidence exists"] }],
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
            todos: [{ content: "T1: Edit file", status: "in_progress" }],
          },
        },
      })

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
      assert.deepEqual(state.evidence[0], {
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
          title: "Message Diff Slice",
          tasks: [{ title: "Edit file", completion_criteria: ["diff evidence exists"] }],
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
            todos: [{ content: "T1: Edit file", status: "in_progress" }],
          },
        },
      })

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
      await hooks.event({
        event: {
          type: "todo.updated",
          properties: {
            sessionID: "ses_plan_runner",
            todos: [{ content: "T1: Edit file", status: "completed" }],
          },
        },
      })

      const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.deepEqual(state.modified_files, ["probe-output.txt"])
      assert.deepEqual(state.evidence[0], {
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
          title: "Concurrent Diff Slice",
          tasks: [{ title: "Edit file", completion_criteria: ["diff evidence exists"] }],
          dag: [],
          parallel_sets: [],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      )
      await hooks.event({ event: { type: "todo.updated", properties: { sessionID: "ses_plan_runner", todos: [{ content: "T1: Edit file", status: "in_progress" }] } } })

      await Promise.all([
        hooks.event({ event: { type: "message.updated", properties: { sessionID: "ses_plan_runner", info: { id: "msg_a", summary: { diffs: [{ file: "a.txt" }] } } } } }),
        hooks.event({ event: { type: "message.updated", properties: { sessionID: "ses_plan_runner", info: { id: "msg_b", summary: { diffs: [{ file: "b.txt" }] } } } } }),
      ])

      const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.deepEqual([...state.modified_files].sort(), ["a.txt", "b.txt"])
      assert.deepEqual(state.evidence.map((item) => item.id).sort(), ["ev-diff-msg_a", "ev-diff-msg_b"])
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
          title: "Plan Diff Only",
          tasks: [{ title: "Edit file", completion_criteria: ["diff evidence exists"] }],
          dag: [],
          parallel_sets: [],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      )
      await hooks.event({ event: { type: "todo.updated", properties: { sessionID: "ses_plan_runner", todos: [{ content: "T1: Edit file", status: "in_progress" }] } } })
      await hooks.event({ event: { type: "message.updated", properties: { sessionID: "ses_plan_runner", info: { id: "msg_plan_diff", summary: { diffs: [{ file: join("docs", "plans", "planrun-ses_parent-call_dispatch.md") }] } } } } })
      await hooks.event({ event: { type: "todo.updated", properties: { sessionID: "ses_plan_runner", todos: [{ content: "T1: Edit file", status: "completed" }] } } })

      const finishResult = await hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))

      const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.equal(state.status, "repairing")
      assert.equal(state.evidence.length, 0)
      assert.equal(prompts.length, 0)
      assert.match(String(finishResult.output || finishResult), /T1 has no diff evidence/)
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
          title: "Tool File Evidence",
          tasks: [{ title: "Edit file", completion_criteria: ["diff evidence exists"] }],
          dag: [],
          parallel_sets: [],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      )
      await hooks.event({ event: { type: "todo.updated", properties: { sessionID: "ses_plan_runner", todos: [{ content: "T1: Edit file", status: "in_progress" }] } } })

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
      assert.deepEqual(state.evidence.map((item) => item.files), [
        [join("src", "created.txt")],
        [join("src", "updated.txt")],
        [join("src", "patched.txt"), join("src", "renamed-from.txt"), join("src", "renamed-to.txt")],
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("does not start terminal gate from plan-runner idle; finish_plan is required", async () => {
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

      const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Implement." } }
      await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
        { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
      )
      await hooks.tool.write_plan.execute(
        {
          title: "Self Check Slice",
          tasks: [{ title: "Edit file", completion_criteria: ["diff evidence exists"] }],
          dag: [],
          parallel_sets: [],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      )
      await hooks.event({ event: { type: "todo.updated", properties: { sessionID: "ses_plan_runner", todos: [{ content: "T1: Edit file", status: "in_progress" }] } } })
      await hooks.event({ event: { type: "message.updated", properties: { sessionID: "ses_plan_runner", info: { id: "msg_with_diff", summary: { diffs: [{ file: "probe-output.txt" }] } } } } })
      await hooks.event({ event: { type: "todo.updated", properties: { sessionID: "ses_plan_runner", todos: [{ content: "T1: Edit file", status: "completed" }] } } })

      await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_plan_runner" } } })

      const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.equal(state.status, "ready_to_execute")
      assert.deepEqual(state.self_check, { status: "not_started", round: 0 })
      assert.equal(prompts.length, 0)
      assert.equal(createdSessions.length, 0)
      assert.deepEqual(state.child_sessions, [])

      const events = readFileSync(join(stateDir, "events", "planrun-ses_parent-call_dispatch.jsonl"), "utf8")
      assert.doesNotMatch(events, /"type":"self_check_completed"/)
      assert.doesNotMatch(events, /"type":"self_check_prompt_sent"/)
      assert.doesNotMatch(events, /"type":"audit_review_dispatched"/)
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

      const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Implement." } }
      await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
        { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
      )
      await hooks.tool.write_plan.execute(
        {
          title: "Synchronous Audit Prompt",
          tasks: [{ title: "Edit file", completion_criteria: ["diff evidence exists"] }],
          dag: [],
          parallel_sets: [],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      )
      await hooks.event({ event: { type: "todo.updated", properties: { sessionID: "ses_plan_runner", todos: [{ content: "T1: Edit file", status: "in_progress" }] } } })
      await hooks.event({ event: { type: "message.updated", properties: { sessionID: "ses_plan_runner", info: { id: "msg_with_diff", summary: { diffs: [{ file: "probe-output.txt" }] } } } } })
      await hooks.event({ event: { type: "todo.updated", properties: { sessionID: "ses_plan_runner", todos: [{ content: "T1: Edit file", status: "completed" }] } } })

      const finish = hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))
        .catch(() => {})
      await waitUntil(() => prompts.some((payload) => payload.body?.agent === "plan-runner-audit"))

      const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.equal(state.status, "audit_review")
      assert.equal(asyncPromptCalls, 0)
      assert.equal(prompts.length, 1)
      assert.equal(prompts[0].path.id, "ses_audit")
      assert.equal(prompts[0].body.agent, "plan-runner-audit")
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
      const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Implement." } }
      await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
        { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
      )
      await hooks.tool.write_plan.execute(
        {
          title: "Audit Consumption Slice",
          tasks: [{ title: "Edit file", completion_criteria: ["diff evidence exists"] }],
          dag: [],
          parallel_sets: [],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      )
      await hooks.event({ event: { type: "todo.updated", properties: { sessionID: "ses_plan_runner", todos: [{ content: "T1: Edit file", status: "in_progress" }] } } })
      await hooks.event({ event: { type: "message.updated", properties: { sessionID: "ses_plan_runner", info: { id: "msg_with_diff", summary: { diffs: [{ file: "probe-output.txt" }] } } } } })
      await hooks.event({ event: { type: "todo.updated", properties: { sessionID: "ses_plan_runner", todos: [{ content: "T1: Edit file", status: "completed" }] } } })
      const finish = hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))
        .catch(() => {})
      await waitUntil(() => prompts.some((payload) => payload.body?.agent === "plan-runner-audit"))

      const statePath = join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json")
      assert.equal(readJson(statePath).status, "audit_review")
      assert.equal(prompts.at(-1).body.agent, "plan-runner-audit")

      await assert.rejects(
        () => hooks["tool.execute.before"](
          { tool: "todowrite", sessionID: "ses_plan_runner", callID: "call_terminal_todo" },
          { args: { todos: [{ content: "T1: Edit file", status: "completed" }] } },
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

      const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Implement." } }
      await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
        { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
      )
      await hooks.tool.write_plan.execute(
        {
          title: "Legacy State Slice",
          tasks: [{ title: "Edit file", completion_criteria: ["diff evidence exists"] }],
          dag: [],
          parallel_sets: [],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      )
      await hooks.event({ event: { type: "todo.updated", properties: { sessionID: "ses_plan_runner", todos: [{ content: "T1: Edit file", status: "in_progress" }] } } })
      await hooks.event({ event: { type: "message.updated", properties: { sessionID: "ses_plan_runner", info: { id: "msg_with_diff", summary: { diffs: [{ file: "probe-output.txt" }] } } } } })
      await hooks.event({ event: { type: "todo.updated", properties: { sessionID: "ses_plan_runner", todos: [{ content: "T1: Edit file", status: "completed" }] } } })

      const statePath = join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json")
      const legacyState = readJson(statePath)
      delete legacyState.modified_files
      delete legacyState.child_sessions
      writeFileSync(statePath, JSON.stringify(legacyState, null, 2) + "\n")

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

      const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Implement." } }
      await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
        { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
      )
      await hooks.tool.write_plan.execute(
        {
          title: "Unwrapped Create Result",
          tasks: [{ title: "Edit file", completion_criteria: ["diff evidence exists"] }],
          dag: [],
          parallel_sets: [],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      )
      await hooks.event({ event: { type: "todo.updated", properties: { sessionID: "ses_plan_runner", todos: [{ content: "T1: Edit file", status: "in_progress" }] } } })
      await hooks.event({ event: { type: "message.updated", properties: { sessionID: "ses_plan_runner", info: { id: "msg_with_diff", summary: { diffs: [{ file: "probe-output.txt" }] } } } } })
      await hooks.event({ event: { type: "todo.updated", properties: { sessionID: "ses_plan_runner", todos: [{ content: "T1: Edit file", status: "completed" }] } } })

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

      const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Implement." } }
      await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
        { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
      )
      await hooks.tool.write_plan.execute(
        {
          title: "Prompt Failure",
          tasks: [{ title: "Edit file", completion_criteria: ["diff evidence exists"] }],
          dag: [],
          parallel_sets: [],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      )
      await hooks.event({ event: { type: "todo.updated", properties: { sessionID: "ses_plan_runner", todos: [{ content: "T1: Edit file", status: "in_progress" }] } } })
      await hooks.event({ event: { type: "message.updated", properties: { sessionID: "ses_plan_runner", info: { id: "msg_with_diff", summary: { diffs: [{ file: "probe-output.txt" }] } } } } })
      await hooks.event({ event: { type: "todo.updated", properties: { sessionID: "ses_plan_runner", todos: [{ content: "T1: Edit file", status: "completed" }] } } })

      await hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))

      const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.equal(state.status, "interrupted")
      assert.deepEqual(state.child_sessions, [{ session_id: "ses_audit", role: "audit", status: "orphaned" }])

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

      const taskOutput = { args: { background: true, subagent_type: "plan-runner", prompt: "Implement." } }
      await hooks["tool.execute.before"]({ tool: "task", sessionID: "ses_parent", callID: "call_dispatch" }, taskOutput)
      await hooks["tool.execute.after"](
        { tool: "task", sessionID: "ses_parent", callID: "call_dispatch", args: taskOutput.args },
        { metadata: { parentSessionId: "ses_parent", sessionId: "ses_plan_runner" } },
      )
      await hooks.tool.write_plan.execute(
        {
          title: "SDK Error Audit Dispatch",
          tasks: [{ title: "Edit file", completion_criteria: ["diff evidence exists"] }],
          dag: [],
          parallel_sets: [],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      )
      await hooks.event({ event: { type: "todo.updated", properties: { sessionID: "ses_plan_runner", todos: [{ content: "T1: Edit file", status: "in_progress" }] } } })
      await hooks.event({ event: { type: "message.updated", properties: { sessionID: "ses_plan_runner", info: { id: "msg_with_diff", summary: { diffs: [{ file: "probe-output.txt" }] } } } } })
      await hooks.event({ event: { type: "todo.updated", properties: { sessionID: "ses_plan_runner", todos: [{ content: "T1: Edit file", status: "completed" }] } } })

      await hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))

      const statePath = join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json")
      const state = readJson(statePath)
      assert.equal(state.status, "interrupted")
      assert.deepEqual(state.child_sessions, [{ session_id: "ses_audit", role: "audit", status: "orphaned" }])
      const events = readFileSync(join(stateDir, "events", "planrun-ses_parent-call_dispatch.jsonl"), "utf8")
      assert.match(events, /audit_dispatch_failed/)
      assert.match(events, /agent not found: plan-runner-audit/)
      assert.doesNotMatch(events, /audit_review_dispatched/)
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
        /repairing/,
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("repairs the plan-runner session when audit review output is not valid JSON", async () => {
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

      await hooks.event({ event: auditMessageEvent("Audit result: pass\nnot json") })
      await hooks.event({ event: auditIdleEvent() })
      const finishResult = await finish

      const state = readJson(statePath)
      assert.equal(state.status, "repairing")
      assert.equal(state.reviews.audit[0].result, "fail")
      assert.match(state.reviews.audit[0].required_fixes[0], /valid JSON/i)
      assert.match(String(finishResult.output || finishResult), /Result: repair_required/)
      assert.match(String(finishResult.output || finishResult), /valid JSON/i)
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

      assert.match(String(result.output || result), /Result: repair_required/)
      assert.match(String(result.output || result), /plan_runner_requires_clean_repo_before_review/)
      assert.equal(prompts.length, 0)
      const state = readJson(statePath)
      assert.equal(state.status, "repairing")
      assert.equal(state.completion_gate.source, "deterministic_check")
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
      assert.equal(args[0], "base-commit-sha")
      assert.equal(args[1], "HEAD")
      assert.equal(args.includes("WORKTREE"), false)
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

  it("marks expired active task state as stale on the next event", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })
      const taskDir = join(stateDir, "tasks")
      mkdirSync(taskDir, { recursive: true })
      writeFileSync(join(taskDir, "planrun-expired.json"), JSON.stringify({
        version: 1,
        task_id: "planrun-expired",
        status: "repairing",
        parent_session_id: "ses_parent",
        dispatch_call_id: "call_dispatch",
        plan_runner_session_id: "ses_plan_runner",
        worktree: workspace,
        updated_at: Date.now() - 20 * 60 * 1000,
        lease_expires_at: Date.now() - 10 * 60 * 1000,
        plan_path: null,
        plan_sha256: null,
        plan_contract: { tasks: [], dag: [], parallel_sets: [] },
        todo: { mirrored: false, last_seen: [] },
        evidence: [],
        modified_files: [],
        child_sessions: [],
        reviews: { round: 1, audit: [], external: [] },
        self_check: { status: "completed", round: 1 },
      }, null, 2) + "\n")

      await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_unrelated" } } })

      const state = readJson(join(taskDir, "planrun-expired.json"))
      assert.equal(state.status, "stale")
      const events = readFileSync(join(stateDir, "events", "planrun-expired.jsonl"), "utf8")
      assert.match(events, /"type":"task_stale"/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("does not mark expired task state as stale on high-frequency message events", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const hooks = await PlanRunnerHarnessPlugin({ directory: workspace }, { stateDir })
      const taskDir = join(stateDir, "tasks")
      const statePath = join(taskDir, "planrun-expired.json")
      mkdirSync(taskDir, { recursive: true })
      writeFileSync(statePath, JSON.stringify({
        version: 1,
        task_id: "planrun-expired",
        status: "repairing",
        parent_session_id: "ses_parent",
        dispatch_call_id: "call_dispatch",
        plan_runner_session_id: "ses_plan_runner",
        worktree: workspace,
        updated_at: Date.now() - 20 * 60 * 1000,
        lease_expires_at: Date.now() - 10 * 60 * 1000,
        plan_path: null,
        plan_sha256: null,
        plan_contract: { tasks: [], dag: [], parallel_sets: [] },
        todo: { mirrored: false, last_seen: [] },
        evidence: [],
        modified_files: [],
        child_sessions: [],
        reviews: { round: 1, audit: [], external: [] },
        self_check: { status: "completed", round: 1 },
      }, null, 2) + "\n")

      await hooks.event({ event: { type: "message.updated", properties: { sessionID: "ses_unrelated", info: { id: "msg" } } } })
      assert.equal(readJson(statePath).status, "repairing")

      await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_unrelated" } } })
      assert.equal(readJson(statePath).status, "stale")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("does not revive legacy self_checking prompted task states", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const taskDir = join(stateDir, "tasks")
      const sessionDir = join(stateDir, "sessions")
      const taskID = "planrun-legacy-self-check"
      mkdirSync(taskDir, { recursive: true })
      mkdirSync(sessionDir, { recursive: true })
      writeFileSync(join(sessionDir, "ses_plan_runner.json"), JSON.stringify({
        session_id: "ses_plan_runner",
        task_id: taskID,
        role: "plan-runner",
      }, null, 2) + "\n")
      writeFileSync(join(taskDir, `${taskID}.json`), JSON.stringify({
        version: 1,
        task_id: taskID,
        status: "self_checking",
        parent_session_id: "ses_parent",
        dispatch_call_id: "call_dispatch",
        plan_runner_session_id: "ses_plan_runner",
        worktree: workspace,
        updated_at: Date.now(),
        lease_expires_at: Date.now() + 10 * 60 * 1000,
        plan_path: join(workspace, "docs", "plans", `${taskID}.md`),
        plan_sha256: "sha",
        plan_contract: { tasks: [{ id: "T1", title: "Edit file", completion_criteria: ["done"], evidence_required: ["diff"] }], dag: [], parallel_sets: [] },
        todo: { mirrored: true, last_seen: [{ content: "T1: Edit file", status: "completed" }] },
        evidence: [{ id: "ev-diff", type: "diff", task_ids: ["T1"], event_ids: ["evt"], files: ["probe-output.txt"] }],
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
          title: "Command Evidence",
          tasks: [{ title: "Run validation", completion_criteria: ["command evidence exists"], evidence_required: ["command"] }],
          dag: [],
          parallel_sets: [],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      )
      await hooks.event({ event: { type: "todo.updated", properties: { sessionID: "ses_plan_runner", todos: [{ content: "T1: Run validation", status: "in_progress" }] } } })
      await hooks["tool.execute.after"](
        { tool: "bash", sessionID: "ses_plan_runner", callID: "call_validate", args: { command: "node --test" } },
        { metadata: { exit: 0 }, output: "ok" },
      )
      await hooks.event({ event: { type: "todo.updated", properties: { sessionID: "ses_plan_runner", todos: [{ content: "T1: Run validation", status: "completed" }] } } })

      const statePath = join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json")
      assert.equal("evidence_required" in readJson(statePath).plan_contract.tasks[0], false)

      const finishResult = await hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))

      const state = readJson(statePath)
      assert.equal(state.status, "repairing")
      assert.match(String(finishResult.output || finishResult), /Result: repair_required/)
      assert.match(String(finishResult.output || finishResult), /T1 has no diff evidence/)
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
          title: "Command Only",
          tasks: [{ title: "Implement code", completion_criteria: ["diff evidence exists"] }],
          dag: [],
          parallel_sets: [],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      )
      await hooks.event({ event: { type: "todo.updated", properties: { sessionID: "ses_plan_runner", todos: [{ content: "T1: Implement code", status: "completed" }] } } })
      await hooks["tool.execute.after"](
        { tool: "bash", sessionID: "ses_plan_runner", callID: "call_test", args: { command: "node --test" } },
        { metadata: { exit: 0 }, output: "ok" },
      )

      const statePath = join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json")
      const finishResult = await hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))

      assert.equal(prompts.length, 0)
      assert.match(String(finishResult.output || finishResult), /Result: repair_required/)
      assert.match(String(finishResult.output || finishResult), /T1 has no diff evidence/)
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
          title: "Repair Completion Boundary",
          tasks: [{ title: "Implement file", completion_criteria: ["diff evidence exists"] }],
          dag: [],
          parallel_sets: [],
        },
        makeContext({ sessionID: "ses_plan_runner", workspace }),
      )
      await hooks.event({ event: { type: "todo.updated", properties: { sessionID: "ses_plan_runner", todos: [{ content: "T1: Implement file", status: "completed" }] } } })

      const statePath = join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json")
      const firstFinish = await hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))

      assert.equal(readJson(statePath).status, "repairing")
      assert.match(String(firstFinish.output || firstFinish), /T1 has no diff evidence/)

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

      const secondFinish = hooks.tool.finish_plan.execute({}, makeContext({ sessionID: "ses_plan_runner", workspace }))
      await waitUntil(() => prompts.some((payload) => payload.body?.agent === "plan-runner-audit"))
      state = readJson(statePath)
      assert.equal(state.status, "audit_review")
      assert.equal(prompts[0].body.agent, "plan-runner-audit")
      const events = readFileSync(join(stateDir, "events", "planrun-ses_parent-call_dispatch.jsonl"), "utf8")
      assert.match(events, /deterministic_check_passed/)
      assert.match(events, /audit_review_dispatched/)
      secondFinish.catch(() => {})
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("binds repair diff evidence to the missing completed task before stale active todos", async () => {
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
        version: 1,
        task_id: taskID,
        status: "repairing",
        parent_session_id: "ses_parent",
        dispatch_call_id: "call_dispatch",
        plan_runner_session_id: "ses_plan_runner",
        worktree: workspace,
        updated_at: Date.now(),
        lease_expires_at: Date.now() + 10 * 60 * 1000,
        plan_path: join(workspace, "docs", "plans", `${taskID}.md`),
        plan_sha256: "sha",
        plan_contract: {
          tasks: [
            { id: "T1", title: "Write file", completion_criteria: ["done"] },
            { id: "T2", title: "Implement marker", completion_criteria: ["diff"] },
            { id: "T3", title: "Whitespace", completion_criteria: ["diff"] },
          ],
          dag: [],
          parallel_sets: [],
        },
        todo: {
          mirrored: true,
          last_seen: [
            { content: "T1 Write file", status: "completed", priority: "high" },
            { content: "T2 Implement marker", status: "completed", priority: "high" },
            { content: "T3 Whitespace", status: "in_progress", priority: "high" },
          ],
        },
        evidence: [{ id: "ev-diff", type: "diff", task_ids: ["T1"], event_ids: ["evt"], files: ["probe-output.txt"] }],
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
      const evidence = state.evidence.find((item) => item.id === "ev-diff-tool-after-call_repair_t2")
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
          title: "Idle Slice",
          tasks: [{ title: "Need evidence", completion_criteria: ["diff evidence exists"] }],
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
            todos: [{ content: "T1: Need evidence", status: "completed" }],
          },
        },
      })

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
