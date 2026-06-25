import { access, appendFile, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises"
import { createHash, randomUUID } from "node:crypto"
import { homedir } from "node:os"
import { basename, dirname, join } from "node:path"
import { pathToFileURL } from "node:url"

const STATE_VERSION = 1
const PLANNING_TOOLS = new Set(["read", "glob", "grep", "webfetch", "question", "write_plan"])
const TODO_TOOLS = new Set(["read", "glob", "grep", "webfetch", "question", "todowrite"])
const EXECUTION_TOOLS = new Set(["read", "glob", "grep", "webfetch", "question", "edit", "write", "bash", "task", "todowrite"])
const EXECUTION_CONTEXT_TOOLS = new Set(["edit", "write", "bash", "task"])

function defaultStateDir() {
  return join(homedir(), ".config", "opencode", "task-state")
}

function safeId(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9_.-]/g, "-")
}

function taskIdFrom(parentSessionID, dispatchCallID) {
  return `planrun-${safeId(parentSessionID)}-${safeId(dispatchCallID)}`
}

async function pathExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function ensureDir(path) {
  await mkdir(path, { recursive: true })
}

function fallbackTool(input) {
  return input
}

function fallbackSchema() {
  const chain = {
    min: () => chain,
    optional: () => chain,
  }
  return chain
}

fallbackTool.schema = {
  string: fallbackSchema,
  array: () => fallbackSchema(),
  object: () => fallbackSchema(),
  tuple: () => fallbackSchema(),
}

async function loadToolHelper() {
  try {
    return (await import("@opencode-ai/plugin/tool")).tool
  } catch {
    const installedTool = join(homedir(), ".opencode", "node_modules", "@opencode-ai", "plugin", "dist", "tool.js")
    if (await pathExists(installedTool)) return (await import(pathToFileURL(installedTool).href)).tool
    return fallbackTool
  }
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex")
}

function statePaths(stateDir, taskID) {
  return {
    task: join(stateDir, "tasks", `${taskID}.json`),
    events: join(stateDir, "events", `${taskID}.jsonl`),
  }
}

function sessionPath(stateDir, sessionID) {
  return join(stateDir, "sessions", `${safeId(sessionID)}.json`)
}

async function writeJsonAtomic(path, value) {
  await ensureDir(dirname(path))
  const tmp = `${path}.tmp.${process.pid}.${randomUUID()}`
  try {
    await writeFile(tmp, JSON.stringify(value, null, 2) + "\n")
    await rename(tmp, path)
  } catch (error) {
    try { await unlink(tmp) } catch {}
    throw error
  }
}

async function quarantineCorruptJson(path) {
  const quarantinePath = join(dirname(dirname(path)), "corrupt", basename(dirname(path)), basename(path))
  try {
    await ensureDir(dirname(quarantinePath))
    await rename(path, quarantinePath)
    return quarantinePath
  } catch {
    return null
  }
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"))
  } catch (error) {
    if (error?.code === "ENOENT") return null
    if (error instanceof SyntaxError) {
      await quarantineCorruptJson(path)
      return null
    }
    throw error
  }
}

async function appendEvent(stateDir, taskID, event) {
  const { events } = statePaths(stateDir, taskID)
  await ensureDir(dirname(events))
  await appendFile(events, JSON.stringify({ ts: Date.now(), ...event }) + "\n")
}

async function writeSessionIndex(stateDir, sessionID, taskID, role) {
  await writeJsonAtomic(sessionPath(stateDir, sessionID), { session_id: sessionID, task_id: taskID, role })
}

async function readSessionIndex(stateDir, sessionID) {
  return readJson(sessionPath(stateDir, sessionID))
}

async function readTaskState(stateDir, taskID) {
  return readJson(statePaths(stateDir, taskID).task)
}

async function readTaskStateForSession(stateDir, sessionID) {
  const index = await readSessionIndex(stateDir, sessionID)
  if (!index) return null
  return readTaskState(stateDir, index.task_id)
}

async function writeTaskState(stateDir, state) {
  await writeJsonAtomic(statePaths(stateDir, state.task_id).task, state)
}

function isPlanRunnerDispatch(args = {}) {
  return args.subagent_type === "plan-runner" || args.agent === "plan-runner"
}

function ensureHarnessMarker(prompt, taskID) {
  const marker = `Harness Task ID: ${taskID}`
  const text = String(prompt || "")
  if (text.includes(marker)) return text
  return `${marker}\n\n${text}`.trim()
}

function createInitialState({ taskID, parentSessionID, dispatchCallID, worktree }) {
  return {
    version: STATE_VERSION,
    task_id: taskID,
    status: "dispatching",
    parent_session_id: parentSessionID,
    dispatch_call_id: dispatchCallID,
    plan_runner_session_id: null,
    worktree,
    git_base: null,
    updated_at: Date.now(),
    lease_expires_at: Date.now() + 10 * 60 * 1000,
    plan_path: null,
    plan_sha256: null,
    plan_contract: {
      tasks: [],
      dag: [],
      parallel_sets: [],
    },
    todo: {
      mirrored: false,
      last_seen: [],
    },
    evidence: [],
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

function validateDag(taskIDs, dag = []) {
  const edges = new Map()
  for (const id of taskIDs) edges.set(id, [])
  for (const edge of dag) {
    if (!Array.isArray(edge) || edge.length !== 2) throw new Error("dag edge must contain exactly two task ids")
    for (const id of edge) {
      if (!taskIDs.has(id)) throw new Error(`dag references unknown task id: ${id}`)
    }
    edges.get(edge[0]).push(edge[1])
  }

  const visiting = new Set()
  const visited = new Set()
  const visit = (id) => {
    if (visiting.has(id)) throw new Error("dag contains a cycle")
    if (visited.has(id)) return
    visiting.add(id)
    for (const next of edges.get(id)) visit(next)
    visiting.delete(id)
    visited.add(id)
  }

  for (const id of taskIDs) {
    visit(id)
  }
}

function formatMarkdown({ taskID, input, contract }) {
  const lines = []
  lines.push(`# ${input.title}`)
  lines.push("")
  lines.push(`Harness Task ID: ${taskID}`)
  lines.push("")
  if (input.goal) {
    lines.push("## Goal")
    lines.push("")
    lines.push(input.goal)
    lines.push("")
  }
  if (input.approach) {
    lines.push("## Approach")
    lines.push("")
    lines.push(input.approach)
    lines.push("")
  }
  if (input.non_goals?.length) {
    lines.push("## Non Goals")
    lines.push("")
    for (const item of input.non_goals) lines.push(`- ${item}`)
    lines.push("")
  }
  lines.push("## Tasks")
  lines.push("")
  for (const task of contract.tasks) {
    lines.push(`- Plan item ${task.id}: ${task.title}`)
    for (const criterion of task.completion_criteria) lines.push(`  - Completion: ${criterion}`)
  }
  lines.push("")
  if (contract.dag.length) {
    lines.push("## DAG")
    lines.push("")
    for (const [from, to] of contract.dag) lines.push(`- ${from} -> ${to}`)
    lines.push("")
  }
  if (contract.parallel_sets.length) {
    lines.push("## Parallel Sets")
    lines.push("")
    for (const set of contract.parallel_sets) lines.push(`- ${set.join(", ")}`)
    lines.push("")
  }
  if (input.stop_conditions?.length) {
    lines.push("## Stop Conditions")
    lines.push("")
    for (const item of input.stop_conditions) lines.push(`- ${item}`)
    lines.push("")
  }
  return lines.join("\n")
}

function buildPlanContract(input) {
  const tasks = input.tasks.map((task, index) => ({
    id: `T${index + 1}`,
    title: task.title,
    completion_criteria: task.completion_criteria,
    evidence_required: ["diff"],
  }))
  const taskIDs = new Set(tasks.map((task) => task.id))
  const dag = input.dag || []
  validateDag(taskIDs, dag)
  return {
    tasks,
    dag,
    parallel_sets: input.parallel_sets || [],
  }
}

function countInProgressTodos(todos = []) {
  return todos.filter((todo) => todo.status === "in_progress").length
}

function activeTodoTaskID(todos = [], tasks = []) {
  const active = todos.find((todo) => todo.status === "in_progress")
  if (!active) return null
  const content = String(active.content || "")
  return tasks.find((task) => content.includes(task.id))?.id || null
}

function todosCoverTasks(todos = [], tasks = []) {
  return tasks.every((task) => todos.some((todo) => String(todo.content || "").includes(task.id)))
}

async function enforcePhaseGate(stateDir, input) {
  const state = await readTaskStateForSession(stateDir, input.sessionID)
  if (!state) return

  if (state.status === "planning_required") {
    if (!PLANNING_TOOLS.has(input.tool)) throw new Error(`plan-runner phase gate: ${input.tool} is not allowed during planning_required`)
    return
  }

  if (state.status === "waiting_for_todo") {
    if (!TODO_TOOLS.has(input.tool)) throw new Error(`plan-runner phase gate: ${input.tool} is not allowed during waiting_for_todo`)
    return
  }

  if (state.status === "ready_to_execute" || state.status === "executing" || state.status === "repairing" || state.status === "self_checking") {
    if (!EXECUTION_TOOLS.has(input.tool)) throw new Error(`plan-runner phase gate: ${input.tool} is not allowed during ${state.status}`)
    if (EXECUTION_CONTEXT_TOOLS.has(input.tool) && countInProgressTodos(state.todo.last_seen) !== 1) {
      throw new Error("plan-runner phase gate: exactly one in_progress todo is required for execution tools")
    }
    if (state.status === "ready_to_execute" && EXECUTION_CONTEXT_TOOLS.has(input.tool)) {
      state.status = "executing"
      state.updated_at = Date.now()
      await writeTaskState(stateDir, state)
    }
  }
}

async function handleTodoUpdated(stateDir, event) {
  if (event.type !== "todo.updated") return
  const sessionID = event.properties?.sessionID
  const todos = event.properties?.todos
  if (!sessionID || !Array.isArray(todos)) return

  const index = await readSessionIndex(stateDir, sessionID)
  if (!index) return
  const state = await readTaskState(stateDir, index.task_id)
  if (!state) return
  state.todo.last_seen = todos
  state.todo.mirrored = todosCoverTasks(todos, state.plan_contract.tasks)
  if (state.status === "waiting_for_todo" && state.todo.mirrored) state.status = "ready_to_execute"
  state.updated_at = Date.now()
  await writeTaskState(stateDir, state)
  await appendEvent(stateDir, state.task_id, { type: "todo_updated", session_id: sessionID, mirrored: state.todo.mirrored })
}

async function recordToolEvidence(stateDir, input, output) {
  const state = await readTaskStateForSession(stateDir, input.sessionID)
  if (!state || input.tool !== "bash") return

  const taskID = activeTodoTaskID(state.todo.last_seen, state.plan_contract.tasks)
  if (!taskID) return

  const exitCode = output.metadata?.exit ?? null
  const evidence = {
    id: `ev-command-${input.callID}`,
    type: "command",
    task_ids: [taskID],
    event_ids: [`tool-after-${input.callID}`],
    command: input.args?.command || "",
    success: exitCode === 0,
    exit_code: exitCode,
  }

  state.evidence = state.evidence.filter((item) => item.id !== evidence.id)
  state.evidence.push(evidence)
  state.updated_at = Date.now()
  await writeTaskState(stateDir, state)
  await appendEvent(stateDir, state.task_id, { type: "evidence_recorded", evidence_id: evidence.id, tool: input.tool, call_id: input.callID })
}

function completedTaskIDs(state) {
  return state.plan_contract.tasks
    .filter((task) => state.todo.last_seen.some((todo) => todo.status === "completed" && String(todo.content || "").includes(task.id)))
    .map((task) => task.id)
}

function findDeterministicCheckFailures(state) {
  const reasons = []
  if (!state.plan_path || !state.plan_sha256 || state.plan_contract.tasks.length === 0) reasons.push("plan is not written")
  if (!state.todo.mirrored) reasons.push("todo list does not mirror all plan tasks")
  if (state.todo.last_seen.some((todo) => todo.status === "pending" || todo.status === "in_progress")) reasons.push("todo list still has pending or in_progress items")

  for (const taskID of completedTaskIDs(state)) {
    const hasDiffEvidence = state.evidence.some((item) => item.type === "diff" && item.task_ids?.includes(taskID))
    if (!hasDiffEvidence) reasons.push(`${taskID} has no diff evidence`)
  }

  return reasons
}

function isCompletionAttempt(state) {
  if (!state.plan_path || !state.plan_sha256 || state.plan_contract.tasks.length === 0) return false
  if (!state.todo.mirrored) return false
  if (completedTaskIDs(state).length === 0) return false
  return !state.todo.last_seen.some((todo) => todo.status === "pending" || todo.status === "in_progress")
}

function selfCheckPromptText() {
  return [
    "Plan-runner self_check_required: perform verification-before-completion self-check before claiming completion.",
    "- Re-read the plan tasks and current todo status.",
    "- For every completed todo, cite concrete evidence from this run.",
    "- For file or code changes, ensure diff evidence exists.",
    "- For validation, cite command, exit/result, and output excerpt.",
    "- Do not say should/probably/seems as completion evidence.",
    "- If evidence is missing, do not claim complete; reopen the relevant todo, gather evidence, then mark it completed again.",
    "- After this self-check, provide the final report again.",
  ].join("\n")
}

function diffFileName(entry) {
  if (typeof entry === "string") return entry
  return entry?.file || entry?.path || entry?.filename || entry?.name || null
}

async function recordDiffEvidence(stateDir, { sessionID, files, eventID }) {
  if (!sessionID) return
  const state = await readTaskStateForSession(stateDir, sessionID)
  if (!state) return

  const taskID = activeTodoTaskID(state.todo.last_seen, state.plan_contract.tasks)
  if (!taskID) return

  if (files.length === 0) return

  state.modified_files = [...new Set([...state.modified_files, ...files])]
  const evidence = {
    id: `ev-diff-${eventID}`,
    type: "diff",
    task_ids: [taskID],
    event_ids: [eventID],
    files,
  }
  state.evidence = state.evidence.filter((item) => item.id !== evidence.id)
  state.evidence.push(evidence)
  state.updated_at = Date.now()
  await writeTaskState(stateDir, state)
  await appendEvent(stateDir, state.task_id, { type: "evidence_recorded", evidence_id: evidence.id, event_id: eventID })
}

async function handleSessionDiff(stateDir, event) {
  if (event.type !== "session.diff") return
  const eventID = event.id || `session-diff-${Date.now()}`
  const files = (event.properties?.diff || []).map(diffFileName).filter(Boolean)
  await recordDiffEvidence(stateDir, { sessionID: event.properties?.sessionID, files, eventID })
}

async function handleMessageDiff(stateDir, event) {
  if (event.type === "message.updated") {
    const eventID = event.id || event.properties?.info?.id || `message-diff-${Date.now()}`
    const files = (event.properties?.info?.summary?.diffs || []).map(diffFileName).filter(Boolean)
    await recordDiffEvidence(stateDir, { sessionID: event.properties?.sessionID, files, eventID })
    return
  }

  if (event.type === "message.part.updated" && event.properties?.part?.type === "patch") {
    const eventID = event.id || event.properties.part.id || `patch-diff-${Date.now()}`
    const files = (event.properties.part.files || []).map(diffFileName).filter(Boolean)
    await recordDiffEvidence(stateDir, { sessionID: event.properties?.sessionID, files, eventID })
  }
}

async function handlePlanRunnerIdle({ stateDir, client, directory, event }) {
  if (event.type !== "session.idle") return
  const sessionID = event.properties?.sessionID
  if (!sessionID) return
  const index = await readSessionIndex(stateDir, sessionID)
  if (!index || index.role !== "plan-runner") return

  const state = await readTaskState(stateDir, index.task_id)
  if (!state) return
  if (state.plan_runner_session_id !== sessionID) return
  if (!["waiting_for_todo", "ready_to_execute", "executing", "repairing", "self_checking"].includes(state.status)) return

  if (state.status === "self_checking" && state.self_check?.status === "prompted") {
    state.self_check.status = "completed"
    state.updated_at = Date.now()
    await writeTaskState(stateDir, state)
    await appendEvent(stateDir, state.task_id, { type: "self_check_completed", session_id: sessionID })
  } else if ((state.self_check?.status || "not_started") === "not_started" && isCompletionAttempt(state)) {
    if (!client?.session?.promptAsync) {
      state.status = "interrupted"
      state.updated_at = Date.now()
      await writeTaskState(stateDir, state)
      await appendEvent(stateDir, state.task_id, { type: "self_check_prompt_failed", session_id: sessionID, error: "promptAsync unavailable" })
      return
    }

    try {
      await client.session.promptAsync({
        path: { id: sessionID },
        query: { directory: directory || state.worktree },
        body: { parts: [{ type: "text", text: selfCheckPromptText() }] },
      })
      state.status = "self_checking"
      state.self_check = {
        status: "prompted",
        round: (state.self_check?.round || 0) + 1,
      }
      state.updated_at = Date.now()
      await writeTaskState(stateDir, state)
      await appendEvent(stateDir, state.task_id, { type: "self_check_prompt_sent", session_id: sessionID })
      return
    } catch (error) {
      state.status = "interrupted"
      state.updated_at = Date.now()
      await writeTaskState(stateDir, state)
      await appendEvent(stateDir, state.task_id, { type: "self_check_prompt_failed", session_id: sessionID, error: String(error?.message || error) })
      return
    }
  }

  if (state.reviews.round >= 2) {
    state.status = "blocked"
    state.updated_at = Date.now()
    await writeTaskState(stateDir, state)
    return
  }

  const reasons = findDeterministicCheckFailures(state)
  if (reasons.length === 0) {
    state.status = "audit_review"
    state.updated_at = Date.now()
    await writeTaskState(stateDir, state)
    await appendEvent(stateDir, state.task_id, { type: "deterministic_check_passed", session_id: sessionID })
    return
  }

  if (!client?.session?.promptAsync) {
    state.status = "interrupted"
    state.updated_at = Date.now()
    await writeTaskState(stateDir, state)
    await appendEvent(stateDir, state.task_id, { type: "repair_prompt_failed", session_id: sessionID, error: "promptAsync unavailable", reasons })
    return
  }

  const text = [
    "Plan-runner validation failed. Continue in this same session and repair the following issues:",
    ...reasons.map((reason) => `- ${reason}`),
  ].join("\n")

  try {
    await client.session.promptAsync({
      path: { id: sessionID },
      query: { directory: directory || state.worktree },
      body: { parts: [{ type: "text", text }] },
    })
    state.status = "repairing"
    state.reviews.round += 1
    state.updated_at = Date.now()
    await writeTaskState(stateDir, state)
    await appendEvent(stateDir, state.task_id, { type: "repair_prompt_sent", session_id: sessionID, reasons })
  } catch (error) {
    state.status = "interrupted"
    state.updated_at = Date.now()
    await writeTaskState(stateDir, state)
    await appendEvent(stateDir, state.task_id, { type: "repair_prompt_failed", session_id: sessionID, error: String(error?.message || error), reasons })
  }
}

async function writePlanTool(args, context, stateDir) {
  if (context.agent !== "plan-runner") throw new Error("write_plan is only available to the plan-runner agent")

  const sessionIndex = await readSessionIndex(stateDir, context.sessionID)
  if (!sessionIndex) throw new Error("write_plan session is not bound to a plan-runner task")

  const state = await readTaskState(stateDir, sessionIndex.task_id)
  if (!state) throw new Error("write_plan task state is not readable")
  if (state.status !== "planning_required") throw new Error(`write_plan requires planning_required status, got ${state.status}`)

  const contract = buildPlanContract(args)
  const worktree = state.worktree || context.worktree || context.directory
  const planPath = join(worktree, "docs", "plans", `${state.task_id}.md`)
  const markdown = formatMarkdown({ taskID: state.task_id, input: args, contract })
  await ensureDir(dirname(planPath))
  await writeFile(planPath, markdown)

  state.status = "waiting_for_todo"
  state.updated_at = Date.now()
  state.lease_expires_at = Date.now() + 10 * 60 * 1000
  state.plan_path = planPath
  state.plan_sha256 = sha256(markdown)
  state.plan_contract = contract
  await writeTaskState(stateDir, state)
  await appendEvent(stateDir, state.task_id, { type: "plan_written", plan_path: planPath, plan_sha256: state.plan_sha256 })

  return {
    output: `plan written: ${planPath}`,
    metadata: {
      task_id: state.task_id,
      plan_path: planPath,
      plan_sha256: state.plan_sha256,
    },
  }
}

export const PlanRunnerHarnessPlugin = async (ctx = {}, options = {}) => {
  const tool = await loadToolHelper()
  const stateDir = options.stateDir || process.env.OPENCODE_PLAN_RUNNER_STATE_DIR || defaultStateDir()
  const worktree = ctx.directory || process.cwd()
  const client = ctx.client

  return {
    tool: {
      write_plan: tool({
        description: "Write a plan-runner execution plan and bind it to harness task state.",
        args: {
          title: tool.schema.string().min(1),
          goal: tool.schema.string().optional(),
          approach: tool.schema.string().optional(),
          non_goals: tool.schema.array(tool.schema.string()).optional(),
          tasks: tool.schema.array(tool.schema.object({
            title: tool.schema.string().min(1),
            completion_criteria: tool.schema.array(tool.schema.string().min(1)).min(1),
          })).min(1),
          dag: tool.schema.array(tool.schema.tuple([tool.schema.string(), tool.schema.string()])).optional(),
          parallel_sets: tool.schema.array(tool.schema.array(tool.schema.string())).optional(),
          stop_conditions: tool.schema.array(tool.schema.string()).optional(),
        },
        execute: (args, context) => writePlanTool(args, context, stateDir),
      }),
    },

    "tool.execute.before": async (input, output) => {
      if (input.tool !== "task" || !isPlanRunnerDispatch(output.args)) {
        await enforcePhaseGate(stateDir, input)
        return
      }

      const taskID = taskIdFrom(input.sessionID, input.callID)
      const state = createInitialState({
        taskID,
        parentSessionID: input.sessionID,
        dispatchCallID: input.callID,
        worktree,
      })
      await writeTaskState(stateDir, state)
      await writeSessionIndex(stateDir, input.sessionID, taskID, "parent")
      await appendEvent(stateDir, taskID, { type: "dispatch_started", session_id: input.sessionID, call_id: input.callID })
      output.args.prompt = ensureHarnessMarker(output.args.prompt, taskID)
    },

    "tool.execute.after": async (input, output) => {
      if (input.tool !== "task" || !isPlanRunnerDispatch(input.args)) {
        await recordToolEvidence(stateDir, input, output)
        return
      }
      const taskID = taskIdFrom(input.sessionID, input.callID)
      const taskPath = statePaths(stateDir, taskID).task
      if (!(await pathExists(taskPath))) return

      const childSessionID = output.metadata?.sessionId
      const parentSessionID = output.metadata?.parentSessionId
      if (!childSessionID || parentSessionID !== input.sessionID) return

      const state = await readTaskState(stateDir, taskID)
      if (!state) return
      state.plan_runner_session_id = childSessionID
      state.status = "planning_required"
      state.updated_at = Date.now()
      state.lease_expires_at = Date.now() + 10 * 60 * 1000
      await writeTaskState(stateDir, state)
      await writeSessionIndex(stateDir, childSessionID, taskID, "plan-runner")
      await appendEvent(stateDir, taskID, { type: "plan_runner_bound", session_id: childSessionID, call_id: input.callID })
    },

    event: async ({ event }) => {
      await handleTodoUpdated(stateDir, event)
      await handleSessionDiff(stateDir, event)
      await handleMessageDiff(stateDir, event)
      await handlePlanRunnerIdle({ stateDir, client, directory: worktree, event })
    },
  }
}

export default PlanRunnerHarnessPlugin
