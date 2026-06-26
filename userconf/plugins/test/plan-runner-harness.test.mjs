import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

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
            { title: "Persist state", completion_criteria: ["state file exists"] },
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
        evidence_required: ["diff"],
      })
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
        { tool: "bash", sessionID: "ses_plan_runner", callID: "call_bash" },
        { args: { command: "printf ok" } },
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

  it("does not count plan document summary diffs as implementation evidence", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const prompts = []
      const hooks = await PlanRunnerHarnessPlugin(
        { directory: workspace, client: { session: { promptAsync: async (payload) => prompts.push(payload) } } },
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

      await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_plan_runner" } } })
      await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_plan_runner" } } })

      const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.equal(state.status, "repairing")
      assert.equal(state.evidence.length, 0)
      assert.equal(prompts.length, 2)
      assert.match(prompts[1].body.parts[0].text, /T1 has no diff evidence/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("records write and edit filePath inputs as diff evidence", async () => {
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

      const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.deepEqual(state.modified_files, [join("src", "created.txt"), join("src", "updated.txt")])
      assert.deepEqual(state.evidence.map((item) => item.files), [[join("src", "created.txt")], [join("src", "updated.txt")]])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("prompts verification self-check before dispatching an audit subagent", async () => {
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

      let state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.equal(state.status, "self_checking")
      assert.deepEqual(state.self_check, { status: "prompted", round: 1 })
      assert.equal(prompts.length, 1)
      assert.match(prompts[0].body.parts[0].text, /verification-before-completion self-check/i)
      assert.match(prompts[0].body.parts[0].text, /do not claim complete/i)

      await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_plan_runner" } } })

      state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.equal(state.status, "audit_review")
      assert.deepEqual(state.self_check, { status: "completed", round: 1 })
      assert.equal(prompts.length, 2)
      assert.equal(createdSessions.length, 1)
      assert.equal(createdSessions[0].body.parentID, "ses_plan_runner")
      assert.equal(createdSessions[0].query.directory, workspace)
      assert.equal(prompts[1].path.id, "ses_audit")
      assert.equal(prompts[1].body.agent, "plan-runner-audit")
      assert.match(prompts[1].body.parts[0].text, /audit_review_required/i)
      assert.match(prompts[1].body.parts[0].text, /external-llm-review|reviewer\.py/i)
      assert.deepEqual(state.child_sessions, [{ session_id: "ses_audit", role: "audit", status: "running" }])

      const events = readFileSync(join(stateDir, "events", "planrun-ses_parent-call_dispatch.jsonl"), "utf8")
      assert.match(events, /"type":"audit_review_dispatched"/)
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

      await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_plan_runner" } } })
      await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_plan_runner" } } })

      const state = readJson(statePath)
      assert.equal(state.status, "audit_review")
      assert.deepEqual(state.child_sessions, [{ session_id: "ses_audit", role: "audit", status: "running" }])
      assert.equal(prompts[1].body.agent, "plan-runner-audit")
      assert.match(prompts[1].body.parts[0].text, /none recorded/)
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

      await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_plan_runner" } } })
      await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_plan_runner" } } })

      const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.equal(state.status, "audit_review")
      assert.equal(prompts[1].path.id, "ses_audit")
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
              promptAsync: async (payload) => {
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

      await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_plan_runner" } } })
      await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_plan_runner" } } })

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

  it("does not treat command-only evidence as completed implementation evidence", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-runner-harness-test-"))
    try {
      const workspace = join(root, "workspace")
      const stateDir = join(root, "state")
      const prompts = []
      const hooks = await PlanRunnerHarnessPlugin(
        { directory: workspace, client: { session: { promptAsync: async (payload) => prompts.push(payload) } } },
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

      await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_plan_runner" } } })

      assert.equal(prompts.length, 1)
      assert.match(prompts[0].body.parts[0].text, /self_check_required/)

      await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_plan_runner" } } })

      assert.equal(prompts.length, 2)
      assert.match(prompts[1].body.parts[0].text, /T1 has no diff evidence/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("prompts only the plan-runner session on idle validation failure", async () => {
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

      await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_plan_runner" } } })

      assert.equal(prompts.length, 1)
      assert.equal(prompts[0].path.id, "ses_plan_runner")
      assert.equal(prompts[0].query.directory, workspace)
      assert.match(prompts[0].body.parts[0].text, /self_check_required/i)

      await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_plan_runner" } } })

      assert.equal(prompts.length, 2)
      assert.equal(prompts[1].path.id, "ses_plan_runner")
      assert.match(prompts[1].body.parts[0].text, /validation failed/i)
      assert.match(prompts[1].body.parts[0].text, /T1/)

      const state = readJson(join(stateDir, "tasks", "planrun-ses_parent-call_dispatch.json"))
      assert.equal(state.status, "repairing")
      assert.equal(state.reviews.round, 1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
