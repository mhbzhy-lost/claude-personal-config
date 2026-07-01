import { execFile } from "node:child_process"
import { access, appendFile, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises"
import { createHash, randomUUID } from "node:crypto"
import { homedir } from "node:os"
import { basename, dirname, isAbsolute, join, normalize, relative } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const STATE_VERSION = 1
const PLANNING_TOOLS = new Set(["read", "glob", "grep", "webfetch", "question", "skill", "write_plan"])
const TODO_TOOLS = new Set(["read", "glob", "grep", "webfetch", "question", "skill", "todowrite"])
const EXECUTION_TOOLS = new Set(["read", "glob", "grep", "webfetch", "question", "skill", "edit", "write", "apply_patch", "bash", "task", "todowrite", "finish_plan"])
const EXECUTION_CONTEXT_TOOLS = new Set(["edit", "write", "apply_patch", "bash", "task"])
const ACTIVE_STATUSES = new Set(["dispatching", "planning_required", "waiting_for_todo", "ready_to_execute", "executing", "audit_review", "external_review", "repairing", "interrupted"])
const COMPLETION_GATE_RESULT_STATUSES = new Set(["validated", "repairing", "blocked", "interrupted", "stale"])

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

async function readTaskStateForSession(stateDir, sessionID, allowedRoles = ["plan-runner"]) {
  const index = await readSessionIndex(stateDir, sessionID)
  if (!index) return null
  if (allowedRoles && !allowedRoles.includes(index.role)) return null
  return readTaskState(stateDir, index.task_id)
}

async function markExpiredTasks(stateDir) {
  const tasksDir = join(stateDir, "tasks")
  let entries
  try {
    entries = await readdir(tasksDir, { withFileTypes: true })
  } catch (error) {
    if (error?.code === "ENOENT") return
    throw error
  }

  const now = Date.now()
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue
    const taskID = entry.name.slice(0, -5)
    const state = await readTaskState(stateDir, taskID)
    if (!state || !ACTIVE_STATUSES.has(state.status)) continue
    if (!state.lease_expires_at || state.lease_expires_at > now) continue

    state.status = "stale"
    state.updated_at = now
    await writeTaskState(stateDir, state)
    await appendEvent(stateDir, state.task_id, { type: "task_stale" })
  }
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

async function currentGitHead(worktree) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", worktree, "rev-parse", "HEAD"], { timeout: 10000 })
    return stdout.trim() || null
  } catch {
    return null
  }
}

async function gitCommand(worktree, args) {
  const { stdout } = await execFileAsync("git", ["-C", worktree, ...args], { timeout: 10000 })
  return stdout.trim()
}

async function inspectGitWorktree(worktree) {
  try {
    const repoRoot = await gitCommand(worktree, ["rev-parse", "--show-toplevel"])
    const gitDir = await gitCommand(worktree, ["rev-parse", "--absolute-git-dir"])
    const gitCommonDir = await gitCommand(worktree, ["rev-parse", "--path-format=absolute", "--git-common-dir"])
    const head = await gitCommand(worktree, ["rev-parse", "HEAD"])
    const statusPorcelain = await gitCommand(worktree, ["status", "--porcelain=v1"])
    return {
      is_git_repo: true,
      repo_root: normalize(repoRoot),
      git_dir: normalize(gitDir),
      git_common_dir: normalize(gitCommonDir),
      head,
      status_porcelain: statusPorcelain,
      is_linked_worktree: normalize(gitDir) !== normalize(gitCommonDir),
    }
  } catch {
    return { is_git_repo: false }
  }
}

function planRunnerDispatchBlocker(gitInfo) {
  if (!gitInfo?.is_git_repo) return null
  if (gitInfo.is_linked_worktree) {
    return {
      code: "plan_runner_disallowed_linked_worktree",
      message: "plan-runner must start from the primary repo checkout, not a linked git worktree",
      repo_root: gitInfo.repo_root,
      git_dir: gitInfo.git_dir,
      git_common_dir: gitInfo.git_common_dir,
    }
  }
  if (gitInfo.status_porcelain) {
    return {
      code: "plan_runner_requires_clean_repo",
      message: "plan-runner requires a clean repo at dispatch; commit or clear existing changes first",
      repo_root: gitInfo.repo_root,
      status_porcelain: gitInfo.status_porcelain,
    }
  }
  return null
}

async function blockPlanRunnerDispatch({ stateDir, state, parentSessionID, blocker }) {
  state.status = "blocked"
  state.blocker = blocker
  state.updated_at = Date.now()
  await writeTaskState(stateDir, state)
  await writeSessionIndex(stateDir, parentSessionID, state.task_id, "parent")
  await appendEvent(stateDir, state.task_id, { type: "dispatch_blocked", code: blocker.code, blocker })
  throw new Error(`${blocker.code}: ${blocker.message}`)
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

function repairEvidenceTaskIDs(state) {
  const completed = new Set(completedTaskIDs(state))
  const missingEvidenceTasks = state.plan_contract.tasks
    .filter((task) => completed.has(task.id) && taskEvidenceFailures(state, task).length > 0)
    .map((task) => task.id)
  if (missingEvidenceTasks.length) return missingEvidenceTasks

  const taskIDs = new Set(state.plan_contract.tasks.map((task) => task.id))
  const latestAudit = state.reviews?.audit?.at(-1) || {}
  const auditTasks = [...(latestAudit.rejected_tasks || []), ...(latestAudit.unknown_tasks || [])]
    .filter((taskID) => taskIDs.has(taskID))
  if (auditTasks.length) return [...new Set(auditTasks)]

  return completedTaskIDs(state)
}

function evidenceTaskIDs(state) {
  if (state.status === "repairing") return repairEvidenceTaskIDs(state)
  const activeTaskID = activeTodoTaskID(state.todo.last_seen, state.plan_contract.tasks)
  if (activeTaskID) return [activeTaskID]
  return []
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

  if (state.status === "audit_review" || state.status === "external_review") {
    throw new Error(`plan-runner terminal gate: ${input.tool} is not allowed during ${state.status}`)
  }

  if (state.status === "ready_to_execute" || state.status === "executing" || state.status === "repairing") {
    if (state.status === "repairing" && input.tool === "todowrite") throw new Error("plan-runner phase gate: todowrite is not allowed during repairing")
    if (!EXECUTION_TOOLS.has(input.tool)) throw new Error(`plan-runner phase gate: ${input.tool} is not allowed during ${state.status}`)
    if (state.status !== "repairing" && EXECUTION_CONTEXT_TOOLS.has(input.tool) && countInProgressTodos(state.todo.last_seen) !== 1) {
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
  if (!index || index.role !== "plan-runner") return
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
  if (input.tool === "write" || input.tool === "edit" || input.tool === "apply_patch") {
    const files = input.tool === "apply_patch" ? patchFileNames(input.args?.patchText) : [input.args?.filePath].filter((file) => typeof file === "string")
    if (files.length) await recordDiffEvidence(stateDir, { sessionID: input.sessionID, files, eventID: `tool-after-${input.callID}` })
    return
  }

  const state = await readTaskStateForSession(stateDir, input.sessionID)
  if (!state || input.tool !== "bash") return

  const taskIDs = evidenceTaskIDs(state)
  if (!taskIDs.length) return

  const exitCode = output.metadata?.exit ?? null
  const evidence = {
    id: `ev-command-${input.callID}`,
    type: "command",
    task_ids: taskIDs,
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
    const task = state.plan_contract.tasks.find((item) => item.id === taskID)
    reasons.push(...taskEvidenceFailures(state, task || { id: taskID }))
  }

  return reasons
}

async function gitCommitBoundaryFailures(state) {
  const baseCommit = state.base_commit || state.git_base
  if (!baseCommit) return []

  const gitInfo = await inspectGitWorktree(state.worktree)
  if (!gitInfo.is_git_repo) return []

  const reasons = []
  if (gitInfo.is_linked_worktree) reasons.push("plan_runner_disallowed_linked_worktree: plan-runner cannot finish from a linked git worktree")
  if (gitInfo.status_porcelain) reasons.push(`plan_runner_requires_clean_repo_before_review: ${gitInfo.status_porcelain}`)
  if (gitInfo.head === baseCommit) reasons.push(`plan_runner_requires_commit_range: HEAD equals base commit ${baseCommit}`)
  if (gitInfo.head !== baseCommit) {
    try {
      const changedFiles = await gitCommand(state.worktree, ["diff", "--name-only", `${baseCommit}..HEAD`])
      if (!changedFiles) reasons.push(`plan_runner_requires_commit_range: ${baseCommit}..HEAD contains no diff`)
    } catch (error) {
      reasons.push(`plan_runner_requires_commit_range: ${formatDiagnosticError(error)}`)
    }
  }
  return reasons
}

function taskEvidenceFailures(state, task) {
  if (!state.evidence.some((item) => item.type === "diff" && item.task_ids?.includes(task.id))) return [`${task.id} has no diff evidence`]
  return []
}

function isCompletionAttempt(state) {
  if (!state.plan_path || !state.plan_sha256 || state.plan_contract.tasks.length === 0) return false
  if (!state.todo.mirrored) return false
  if (completedTaskIDs(state).length === 0) return false
  return !state.todo.last_seen.some((todo) => todo.status === "pending" || todo.status === "in_progress")
}

function auditPromptText(state) {
  const modifiedFiles = Array.isArray(state.modified_files) ? state.modified_files : []
  const files = modifiedFiles.length ? modifiedFiles.map((file) => `- ${file}`) : ["- none recorded"]
  const tasks = state.plan_contract.tasks.length
    ? state.plan_contract.tasks.map((task) => `- ${task.id}: ${task.title}; completion: ${task.completion_criteria.join("; ")}`)
    : ["- none recorded"]
  const todos = state.plan_contract.tasks.length
    ? state.plan_contract.tasks.map((task) => {
      const todo = state.todo.last_seen.find((item) => String(item.content || "").includes(task.id))
      const status = todo?.status || "missing"
      return `- ${task.id}: ${status} - ${task.title}`
    })
    : ["- none recorded"]
  return [
    "Plan-runner audit_review_required: deterministic checks passed; audit the completed scope before the harness continues.",
    "- You are the harness-dispatched audit subagent. Do not modify files.",
    "- You must consume the Todo state observed by harness below; do not pass work that merely marks todos complete.",
    "- Check whether each completed todo has a complete implementation, not just an interface shell, stub, mock, or code that only satisfy tests.",
    "- Review the plan path, task contract, todo state, modified files, and observed validation context.",
    "- Return only fields consumed by the harness: result, rejected_tasks, unknown_tasks, unmapped_files, required_fixes.",
    `- Harness Task ID: ${state.task_id}`,
    `- Plan path: ${state.plan_path}`,
    "- Task contract:",
    ...tasks,
    "- Todo state observed by harness:",
    ...todos,
    "- Modified files observed by harness:",
    ...files,
  ].join("\n")
}

function sessionIDFromCreateResult(result) {
  const value = result?.data?.id ?? result?.data ?? result?.id
  return typeof value === "object" ? value?.id : value
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state))
}

function diagnosticValue(value) {
  if (!value) return null
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function formatDiagnosticError(error) {
  if (typeof error === "string") return error
  const parts = []
  if (error?.stack) parts.push(String(error.stack))
  else if (error?.message) parts.push(String(error.message))

  for (const value of [error?.response?.data, error?.data, error?.stderr, error?.body]) {
    const text = diagnosticValue(value)
    if (text && !parts.includes(text)) parts.push(text)
  }

  if (parts.length) return parts.join("\n")
  return diagnosticValue(error) || "unknown error"
}

function throwIfSdkError(result, context) {
  if (!result?.error) return
  const errData = result.error?.data || result.error
  const message = errData?.message || errData?.name || diagnosticValue(errData) || "unknown SDK error"
  throw new Error(`${context}: ${message}`)
}

function extractTextFromMessageInfo(info = {}) {
  const parts = Array.isArray(info.parts) ? info.parts : []
  const texts = parts.map((part) => part?.text || part?.content).filter(Boolean)
  if (texts.length) return texts.join("\n")
  return info.text || info.content || info.summary?.text || ""
}

function extractTextFromMessagePart(part = {}) {
  if (part.type !== "text") return ""
  return part.text || part.content || ""
}

function extractJsonObject(text) {
  const value = String(text || "").trim()
  if (!value) throw new Error("audit review did not return valid JSON")

  const fence = value.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fence ? fence[1].trim() : value
  const start = candidate.indexOf("{")
  const end = candidate.lastIndexOf("}")
  if (start === -1 || end === -1 || end < start) throw new Error("audit review did not return valid JSON")
  return JSON.parse(candidate.slice(start, end + 1))
}

function normalizeStringArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item)) : []
}

function auditFailureReasons(result) {
  const reasons = []
  if (result.result !== "pass") reasons.push(`audit result is ${result.result || "missing"}`)
  for (const field of ["rejected_tasks", "unknown_tasks", "unmapped_files"]) {
    if (result[field]?.length) reasons.push(`${field}: ${result[field].join(", ")}`)
  }
  for (const fix of result.required_fixes || []) reasons.push(fix)
  return reasons
}

function normalizeAuditReview(text) {
  try {
    const parsed = extractJsonObject(text)
    return {
      result: parsed.result === "pass" ? "pass" : "fail",
      rejected_tasks: normalizeStringArray(parsed.rejected_tasks),
      unknown_tasks: normalizeStringArray(parsed.unknown_tasks),
      unmapped_files: normalizeStringArray(parsed.unmapped_files),
      required_fixes: normalizeStringArray(parsed.required_fixes),
    }
  } catch (error) {
    return {
      result: "fail",
      rejected_tasks: [],
      unknown_tasks: [],
      unmapped_files: [],
      required_fixes: [`audit review must return valid JSON: ${formatDiagnosticError(error)}`],
    }
  }
}

function normalizeExternalReview(result = {}) {
  return {
    round: Number(result.round || 1),
    kind: "external",
    result: result.result === "pass" ? "pass" : result.result === "issues" ? "issues" : "unavailable",
    provider: result.provider || "unknown",
    findings: result.findings || result.error || "",
  }
}

function execFileAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
        return
      }
      resolve({ stdout, stderr })
    })
  })
}

function markdownSectionHasIssues(text, header) {
  const pattern = new RegExp(`#{1,4}\\s*${header}.*?\\n([\\s\\S]*?)(?=\\n#{1,4}\\s|$)`, "i")
  const match = String(text || "").match(pattern)
  if (!match) return false
  const meaningfulLines = match[1]
    .split("\n")
    .map((line) => line.trim())
    .map((line) => line.replace(/^[-*+]\s*/, "").replace(/^[`*_\s]+|[`*_\s]+$/g, ""))
    .map((line) => line.replace(/[。．.!！?？]+$/u, "").trim())
    .filter(Boolean)
    .filter((line) => !/^(none\.?|n\/?a|no\s+(\w+\s+)?issues(\s+found)?|nothing\s+to\s+report|✅|无)$/i.test(line))
  return meaningfulLines.length > 0
}

function reviewTextHasBlockingIssues(text) {
  return markdownSectionHasIssues(text, "Critical") || markdownSectionHasIssues(text, "Important")
}

const DEFAULT_EXTERNAL_REVIEW_PROVIDERS = ["idealab-anthropic", "bailian", "idealab-openai"]

function parseProviderList(value) {
  return String(value || "").split(/[\s,]+/).map((item) => item.trim()).filter(Boolean)
}

function externalReviewProviders(options = {}) {
  if (Array.isArray(options.externalReviewProviders)) return options.externalReviewProviders.filter(Boolean)
  if (options.externalReviewCommand) return []
  const configuredChain = parseProviderList(process.env.OPENCODE_PLAN_RUNNER_EXTERNAL_REVIEW_PROVIDERS)
  if (configuredChain.length) return configuredChain
  const configuredProvider = parseProviderList(process.env.EXTERNAL_LLM_REVIEW_PROVIDER)
  if (configuredProvider.length) return configuredProvider
  return DEFAULT_EXTERNAL_REVIEW_PROVIDERS
}

async function defaultReviewerPath() {
  const configHome = process.env.CLAUDE_CONFIG_HOME
  const candidates = [
    configHome ? join(configHome, "userconf", "skills", "external-llm-review", "reviewer.py") : null,
    join(homedir(), ".agents", "skills", "external-llm-review", "reviewer.py"),
    join(dirname(dirname(fileURLToPath(import.meta.url))), "skills", "external-llm-review", "reviewer.py"),
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate
  }
  return candidates.at(-1)
}

async function defaultReviewerCommand() {
  return {
    command: "uv",
    args: [
      "run",
      "--no-project",
      "--with",
      "httpx",
      "--with",
      "python-dotenv",
      "--with",
      "pyyaml",
      "python",
      await defaultReviewerPath(),
    ],
  }
}

async function runExternalReviewCommand(state, options = {}) {
  const reviewRound = nextExternalReviewRound(state)
  const baseCommit = state.base_commit || state.git_base
  if (!baseCommit) {
    return { round: reviewRound, result: "unavailable", provider: "command", findings: "base_commit is missing" }
  }

  const reviewCommand = options.externalReviewCommand || await defaultReviewerCommand()
  const baseArgs = [
    ...(reviewCommand.args || []),
    baseCommit,
    "HEAD",
    "--worktree",
    state.worktree,
    "--review-depth",
    "exhaustive",
    "--review-round",
    String(reviewRound),
    "--max-issues",
    "25",
  ]
  if (state.plan_path) baseArgs.push("--spec", state.plan_path)

  const providers = externalReviewProviders(options)
  const attempts = providers.length ? providers : [null]
  const failures = []
  for (const provider of attempts) {
    const args = [...baseArgs]
    if (provider) args.push("--provider", provider)

    try {
      const { stdout, stderr } = await execFileAsync(reviewCommand.command, args, {
        cwd: state.worktree,
        timeout: Number(process.env.OPENCODE_PLAN_RUNNER_EXTERNAL_REVIEW_TIMEOUT_MS || 540000),
        maxBuffer: 10 * 1024 * 1024,
      })
      const findings = [stdout, stderr].filter(Boolean).join("\n")
      if (!findings.trim()) {
        failures.push(`${provider || "command"}: external review produced no output`)
        continue
      }
      return {
        result: reviewTextHasBlockingIssues(findings) ? "issues" : "pass",
        round: reviewRound,
        provider: provider || "command",
        findings,
      }
    } catch (error) {
      failures.push(`${provider || "command"}: ${formatDiagnosticError({ ...error, stderr: error?.stderr, body: error?.stdout })}`)
    }
  }
  return {
    result: "unavailable",
    round: reviewRound,
    provider: providers.at(-1) || "command",
    findings: failures.join("\n\n") || "external review unavailable",
  }
}

function nextExternalReviewRound(state) {
  return Math.min(((state.reviews?.external || []).length) + 1, 2)
}

function completionGateActive(state) {
  return state.completion_gate?.mode === "finish_plan"
}

function rememberCompletionGateResult(state, status, source, reasons) {
  if (!completionGateActive(state)) return
  state.completion_gate = {
    ...state.completion_gate,
    status,
    source,
    reasons,
    updated_at: Date.now(),
  }
}

async function promptRepair({ stateDir, state, source, reasons }) {
  const nextState = cloneState(state)
  const completionGateExhausted = completionGateActive(nextState) && source === "external_review" && (nextState.reviews.external || []).length >= 2
  if (nextState.reviews.round >= 2 || completionGateExhausted) {
    nextState.status = "blocked"
    rememberCompletionGateResult(nextState, "blocked", source, reasons)
    nextState.updated_at = Date.now()
    await writeTaskState(stateDir, nextState)
    await appendEvent(stateDir, state.task_id, { type: `${source}_blocked`, reasons })
    return
  }

  nextState.status = "repairing"
  nextState.reviews.round += 1
  rememberCompletionGateResult(nextState, "repair_required", source, reasons)
  nextState.updated_at = Date.now()
  await writeTaskState(stateDir, nextState)
  await appendEvent(stateDir, state.task_id, { type: `${source}_repair_required`, reasons })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForCompletionGateState(stateDir, taskID, { pollMs, timeoutMs }) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const state = await readTaskState(stateDir, taskID)
    if (!state) return null
    if (COMPLETION_GATE_RESULT_STATUSES.has(state.status)) return state
    await sleep(pollMs)
  }

  const state = await readTaskState(stateDir, taskID)
  if (!state) return null
  state.status = "interrupted"
  rememberCompletionGateResult(state, "interrupted", "completion_gate", [`finish_plan timed out after ${timeoutMs}ms`])
  state.updated_at = Date.now()
  await writeTaskState(stateDir, state)
  await appendEvent(stateDir, taskID, { type: "finish_plan_timeout", timeout_ms: timeoutMs })
  return state
}

function completionGateResultText(state) {
  const gate = state?.completion_gate || {}
  const status = state?.status === "validated"
    ? "validated"
    : state?.status === "repairing"
      ? "repair_required"
      : state?.status || "interrupted"
  const lines = [
    `Result: ${status}`,
    "",
    `Harness Task ID: ${state?.task_id || "unknown"}`,
  ]
  if (gate.source) lines.push(`Source: ${String(gate.source).replaceAll("_", " ")}`)
  if (Array.isArray(gate.reasons) && gate.reasons.length) {
    lines.push("", "Reasons:", ...gate.reasons.map((reason) => `- ${reason}`))
  }
  if (state?.reviews?.audit?.length || state?.reviews?.external?.length) {
    lines.push("", "Reviews:")
    if (state.reviews.audit.length) lines.push(`- audit: ${state.reviews.audit.at(-1).result}`)
    if (state.reviews.external.length) {
      const latest = state.reviews.external.at(-1)
      lines.push(`- external: ${latest.result}${latest.provider ? ` (${latest.provider})` : ""}`)
    }
  }
  return lines.join("\n")
}

async function finishPlanTool(args, context, stateDir, { client, directory, externalReview, pollMs, timeoutMs }) {
  if (context.agent !== "plan-runner") throw new Error("finish_plan is only available to the plan-runner agent")
  const sessionID = context.sessionID
  const state = await readTaskStateForSession(stateDir, sessionID)
  if (!state) throw new Error("finish_plan task state is not readable")
  if (state.plan_runner_session_id !== sessionID) throw new Error("finish_plan must run in the bound plan-runner session")

  const nextState = cloneState(state)
  nextState.completion_gate = {
    mode: "finish_plan",
    status: "running",
    started_at: Date.now(),
  }
  if ((nextState.self_check?.status || "not_started") === "not_started" && isCompletionAttempt(nextState)) {
    nextState.self_check = {
      status: "completed",
      round: (nextState.self_check?.round || 0) + 1,
    }
    await completeSelfCheck({ stateDir, sessionID, state: nextState, boundary: "finish_plan" })
  } else {
    nextState.updated_at = Date.now()
    await writeTaskState(stateDir, nextState)
  }

  await continuePlanRunnerReview({ stateDir, client, directory, sessionID, state: nextState, externalReview })
  const finishedState = await waitForCompletionGateState(stateDir, nextState.task_id, { pollMs, timeoutMs })
  if (!finishedState) throw new Error("finish_plan task state disappeared while waiting for completion gate")

  return {
    output: completionGateResultText(finishedState),
    metadata: {
      task_id: finishedState.task_id,
      status: finishedState.status,
      completion_gate: finishedState.completion_gate || null,
    },
  }
}

async function finalCompletenessFailures(state) {
  const reasons = []
  if (state.status !== "external_review") reasons.push(`status is ${state.status}, expected external_review`)
  if (!state.plan_path || !state.plan_sha256) reasons.push("plan is not written")
  else {
    try {
      const plan = await readFile(state.plan_path, "utf8")
      if (sha256(plan) !== state.plan_sha256) reasons.push("plan file hash does not match task state")
    } catch (error) {
      reasons.push(`plan file is not readable: ${formatDiagnosticError(error)}`)
    }
  }
  if (!state.todo.mirrored) reasons.push("todo list does not mirror all plan tasks")
  if (state.todo.last_seen.some((todo) => todo.status === "pending" || todo.status === "in_progress")) reasons.push("todo list still has pending or in_progress items")
  const completed = new Set(completedTaskIDs(state))
  for (const task of state.plan_contract.tasks) {
    if (!completed.has(task.id)) reasons.push(`${task.id} has no completed todo`)
    reasons.push(...taskEvidenceFailures(state, task))
  }
  const evidenceFiles = new Set(state.evidence.filter((item) => item.type === "diff").flatMap((item) => item.files || []))
  for (const file of state.modified_files || []) {
    if (!evidenceFiles.has(file)) reasons.push(`modified file is not mapped to evidence: ${file}`)
  }
  if (state.child_sessions?.some((child) => child.status === "running")) reasons.push("child sessions are still running")
  if (!state.reviews.audit.length) reasons.push("audit review did not run")
  if (state.reviews.external.at(-1)?.result !== "pass") reasons.push("latest external review did not pass")
  if (state.reviews.round > 2) reasons.push("review repair round limit exceeded")
  return reasons
}

async function finalizeIfComplete({ stateDir, client, directory, state }) {
  const reasons = await finalCompletenessFailures(state)
  if (reasons.length) {
    await promptRepair({ stateDir, state, source: "completeness_check", reasons })
    return
  }

  const nextState = cloneState(state)
  nextState.status = "validated"
  rememberCompletionGateResult(nextState, "validated", "terminal_gate", [])
  nextState.updated_at = Date.now()
  await writeTaskState(stateDir, nextState)
  await appendEvent(stateDir, state.task_id, { type: "task_validated" })
}

async function runExternalReview({ stateDir, client, directory, state, externalReview }) {
  const nextState = cloneState(state)
  nextState.status = "external_review"
  nextState.updated_at = Date.now()
  await writeTaskState(stateDir, nextState)
  await appendEvent(stateDir, state.task_id, { type: "external_review_started" })

  let review
  try {
    review = normalizeExternalReview(await externalReview(nextState))
  } catch (error) {
    review = normalizeExternalReview({ result: "unavailable", error: formatDiagnosticError(error) })
  }

  const reviewedState = cloneState(nextState)
  reviewedState.reviews.external = [...(reviewedState.reviews.external || []), review]
  reviewedState.updated_at = Date.now()
  await writeTaskState(stateDir, reviewedState)

  if (review.result !== "pass") {
    await appendEvent(stateDir, state.task_id, { type: "external_review_failed", result: review.result })
    await promptRepair({ stateDir, state: reviewedState, source: "external_review", reasons: [review.findings || `external review ${review.result}`] })
    return
  }

  await appendEvent(stateDir, state.task_id, { type: "external_review_passed", provider: review.provider })
  await finalizeIfComplete({ stateDir, client, directory, state: reviewedState })
}

async function handleAuditReviewMessage(stateDir, event) {
  if (event.type !== "message.updated" && event.type !== "message.part.updated") return
  const sessionID = event.properties?.sessionID
  if (!sessionID) return
  const index = await readSessionIndex(stateDir, sessionID)
  if (!index || index.role !== "audit") return

  const state = await readTaskState(stateDir, index.task_id)
  if (!state || state.status !== "audit_review") return
  const text = event.type === "message.part.updated"
    ? extractTextFromMessagePart(event.properties?.part)
    : extractTextFromMessageInfo(event.properties?.info)
  if (!text) return
  state.reviews.pending_audit_text = text
  state.updated_at = Date.now()
  await writeTaskState(stateDir, state)
}

async function handleAuditReviewIdle({ stateDir, client, directory, event, externalReview }) {
  if (event.type !== "session.idle") return
  const sessionID = event.properties?.sessionID
  if (!sessionID) return
  const index = await readSessionIndex(stateDir, sessionID)
  if (!index || index.role !== "audit") return

  const state = await readTaskState(stateDir, index.task_id)
  if (!state || state.status !== "audit_review") return
  const audit = normalizeAuditReview(state.reviews.pending_audit_text || "")
  const nextState = cloneState(state)
  nextState.reviews.audit = [...(nextState.reviews.audit || []), audit]
  delete nextState.reviews.pending_audit_text
  nextState.child_sessions = (nextState.child_sessions || []).map((child) => (
    child.session_id === sessionID ? { ...child, status: "completed" } : child
  ))
  nextState.updated_at = Date.now()
  await writeTaskState(stateDir, nextState)

  const reasons = auditFailureReasons(audit)
  if (reasons.length) {
    await appendEvent(stateDir, state.task_id, { type: "audit_review_failed", reasons })
    await promptRepair({ stateDir, state: nextState, source: "audit_review", reasons })
    return
  }

  await appendEvent(stateDir, state.task_id, { type: "audit_review_passed" })
  await runExternalReview({ stateDir, client, directory, state: nextState, externalReview })
}

function shouldCheckExpiredTasks(event) {
  return event?.type === "session.idle" || event?.type === "todo.updated"
}

async function recordAuditDispatchFailure({ stateDir, sessionID, state, error, auditSessionID = null }) {
  const failedState = cloneState(state)
  failedState.status = "interrupted"
  failedState.updated_at = Date.now()

  if (auditSessionID) {
    const childSessions = Array.isArray(failedState.child_sessions) ? failedState.child_sessions : []
    failedState.child_sessions = childSessions.filter((item) => item.session_id !== auditSessionID)
    failedState.child_sessions.push({ session_id: auditSessionID, role: "audit", status: "orphaned" })
  }

  const event = {
    type: "audit_dispatch_failed",
    session_id: sessionID,
    error: formatDiagnosticError(error),
  }
  if (auditSessionID) event.orphan_session_id = auditSessionID

  try {
    await writeTaskState(stateDir, failedState)
    await appendEvent(stateDir, state.task_id, event)
  } catch (recordError) {
    console.error("plan-runner audit failure recording failed", formatDiagnosticError(recordError))
  }
}

async function dispatchAuditReview({ stateDir, client, directory, sessionID, state }) {
  if (!client?.session?.create || !client?.session?.prompt) {
    await recordAuditDispatchFailure({ stateDir, sessionID, state, error: "session create/prompt unavailable" })
    return
  }

  let auditSessionID = null
  try {
    const query = { directory: directory || state.worktree }
    const created = await client.session.create({
      query,
      body: {
        parentID: sessionID,
        title: `plan-runner audit: ${state.task_id}`,
      },
    })
    throwIfSdkError(created, "audit session create failed")
    auditSessionID = sessionIDFromCreateResult(created)
    if (!auditSessionID) throw new Error("audit session id missing")

    const nextState = cloneState(state)
    const childSessions = Array.isArray(nextState.child_sessions) ? nextState.child_sessions : []
    nextState.child_sessions = childSessions.filter((item) => item.session_id !== auditSessionID)
    nextState.child_sessions.push({ session_id: auditSessionID, role: "audit", status: "running" })
    nextState.updated_at = Date.now()
    await writeTaskState(stateDir, nextState)
    await writeSessionIndex(stateDir, auditSessionID, state.task_id, "audit")

    const prompted = await client.session.prompt({
      path: { id: auditSessionID },
      query,
      body: {
        agent: "plan-runner-audit",
        parts: [{ type: "text", text: auditPromptText(state) }],
      },
    })
    throwIfSdkError(prompted, "audit prompt dispatch failed")
    await appendEvent(stateDir, state.task_id, { type: "audit_review_dispatched", session_id: sessionID, audit_session_id: auditSessionID })
  } catch (error) {
    await recordAuditDispatchFailure({ stateDir, sessionID, state, error, auditSessionID })
  }
}

function diffFileName(entry) {
  if (typeof entry === "string") return entry
  return entry?.file || entry?.path || entry?.filename || entry?.name || null
}

function patchFileNames(patchText) {
  if (typeof patchText !== "string") return []
  const files = []
  for (const line of patchText.split("\n")) {
    const match = line.match(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/) || line.match(/^\*\*\* Move to: (.+)$/)
    if (match?.[1]?.trim()) files.push(match[1].trim())
  }
  return [...new Set(files)]
}

function normalizeEvidenceFile(state, file) {
  const text = String(file || "").trim()
  if (!text) return null

  const absolute = isAbsolute(text) ? normalize(text) : state.worktree ? normalize(join(state.worktree, text)) : null
  if (state.plan_path && absolute === normalize(state.plan_path)) return null

  if (state.worktree && absolute) {
    const rel = relative(state.worktree, absolute)
    if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return rel
  }
  return text
}

async function recordDiffEvidence(stateDir, { sessionID, files, eventID }) {
  if (!sessionID) return
  const state = await readTaskStateForSession(stateDir, sessionID)
  if (!state) return

  const taskIDs = evidenceTaskIDs(state)
  if (!taskIDs.length) return

  const normalizedFiles = [...new Set(files.map((file) => normalizeEvidenceFile(state, file)).filter(Boolean))]
  if (normalizedFiles.length === 0) return

  state.modified_files = [...new Set([...(state.modified_files || []), ...normalizedFiles])]
  const evidence = {
    id: `ev-diff-${eventID}`,
    type: "diff",
    task_ids: taskIDs,
    event_ids: [eventID],
    files: normalizedFiles,
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

async function continuePlanRunnerReview({ stateDir, client, directory, sessionID, state, externalReview }) {
  if (state.reviews.round >= 2) {
    state.status = "blocked"
    rememberCompletionGateResult(state, "blocked", "review_round_limit", ["review repair round limit exceeded"])
    state.updated_at = Date.now()
    await writeTaskState(stateDir, state)
    return
  }

  const reasons = [...findDeterministicCheckFailures(state), ...await gitCommitBoundaryFailures(state)]
  if (reasons.length === 0) {
    if ((state.reviews.audit || []).length) {
      await appendEvent(stateDir, state.task_id, { type: "deterministic_check_passed", session_id: sessionID })
      await runExternalReview({ stateDir, client, directory, state, externalReview })
      return
    }

    state.status = "audit_review"
    state.updated_at = Date.now()
    await writeTaskState(stateDir, state)
    await appendEvent(stateDir, state.task_id, { type: "deterministic_check_passed", session_id: sessionID })
    await dispatchAuditReview({ stateDir, client, directory, sessionID, state })
    return
  }

  state.status = "repairing"
  state.reviews.round += 1
  rememberCompletionGateResult(state, "repair_required", "deterministic_check", reasons)
  state.updated_at = Date.now()
  await writeTaskState(stateDir, state)
  await appendEvent(stateDir, state.task_id, { type: "repair_required", session_id: sessionID, reasons })
}

async function completeSelfCheck({ stateDir, sessionID, state, boundary }) {
  state.self_check.status = "completed"
  state.updated_at = Date.now()
  await writeTaskState(stateDir, state)
  await appendEvent(stateDir, state.task_id, { type: "self_check_completed", session_id: sessionID, boundary })
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
  const externalReview = options.externalReview || ((state) => runExternalReviewCommand(state, options))
  const completionGatePollMs = Number(options.completionGatePollMs || process.env.OPENCODE_PLAN_RUNNER_COMPLETION_GATE_POLL_MS || 1000)
  const completionGateTimeoutMs = Number(options.completionGateTimeoutMs || process.env.OPENCODE_PLAN_RUNNER_COMPLETION_GATE_TIMEOUT_MS || 1800000)
  let eventQueue = Promise.resolve()

  function enqueueEvent(handler) {
    const run = eventQueue.then(handler)
    eventQueue = run.catch(() => {})
    return run
  }

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
      finish_plan: tool({
        description: "Run and wait for the plan-runner terminal gate before returning a final report.",
        args: {},
        execute: (args, context) => finishPlanTool(args, context, stateDir, {
          client,
          directory: worktree,
          externalReview,
          pollMs: completionGatePollMs,
          timeoutMs: completionGateTimeoutMs,
        }),
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
      const gitInfo = await inspectGitWorktree(worktree)
      const blocker = planRunnerDispatchBlocker(gitInfo)
      state.git = gitInfo
      state.base_commit = gitInfo.head || null
      state.git_base = gitInfo.head || await currentGitHead(worktree)
      if (blocker) {
        await blockPlanRunnerDispatch({ stateDir, state, parentSessionID: input.sessionID, blocker })
      }
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

    event: async ({ event }) => enqueueEvent(async () => {
      if (shouldCheckExpiredTasks(event)) await markExpiredTasks(stateDir)
      await handleTodoUpdated(stateDir, event)
      await handleSessionDiff(stateDir, event)
      await handleMessageDiff(stateDir, event)
      await handleAuditReviewMessage(stateDir, event)
      await handleAuditReviewIdle({ stateDir, client, directory: worktree, event, externalReview })
    }),
  }
}

export default PlanRunnerHarnessPlugin
