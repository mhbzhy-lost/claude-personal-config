import { execFile } from "node:child_process"
import { access, appendFile, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises"
import { createHash, randomUUID } from "node:crypto"
import { homedir } from "node:os"
import { basename, dirname, isAbsolute, join, normalize, relative } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const STATE_VERSION = 2
const PLANNING_TOOLS = new Set(["read", "glob", "grep", "webfetch", "question", "skill", "write_plan"])
const READY_TO_EXECUTE_TOOLS = new Set(["read", "glob", "grep", "webfetch", "question", "skill", "start_task", "finish_plan"])
const EXECUTION_TOOLS = new Set(["read", "glob", "grep", "webfetch", "question", "skill", "start_task", "edit", "write", "apply_patch", "bash", "task", "dispatch_child", "complete_task", "finish_plan"])
const EXECUTION_CONTEXT_TOOLS = new Set(["edit", "write", "apply_patch", "bash", "task"])
const REPAIR_CONTEXT_TOOLS = new Set(["edit", "write", "apply_patch", "bash"])
const COMPLETION_GATE_RESULT_STATUSES = new Set(["validated", "repairing", "blocked", "interrupted"])
const TERMINAL_COMPLETION_GATE_STATUSES = new Set(["validated", "blocked", "interrupted"])
const MAX_AUDIT_INVALID_JSON_ATTEMPTS = 2
const MAX_GATE_FAILURES = 2
const MAX_WATCHDOG_NUDGES = 1
const MAX_RUNTIME_DISPOSAL_ATTEMPTS = 2

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
    brief: join(stateDir, "briefs", `${taskID}.md`),
    plan: join(stateDir, "plans", `${taskID}.md`),
  }
}

function planRunnerWorktreeRoot(originWorktree) {
  return join(originWorktree, ".plan-runner-worktrees")
}

function planRunnerWorktreePath(originWorktree, taskID) {
  return join(planRunnerWorktreeRoot(originWorktree), `${taskID}`)
}

async function ensurePlanRunnerWorktreeIgnored(originWorktree) {
  const excludePath = await gitCommand(originWorktree, ["rev-parse", "--path-format=absolute", "--git-path", "info/exclude"])
  const entry = ".plan-runner-worktrees/"
  let content = ""
  try {
    content = await readFile(excludePath, "utf8")
  } catch (error) {
    if (error?.code !== "ENOENT") throw error
  }
  if (content.split("\n").includes(entry)) return
  await ensureDir(dirname(excludePath))
  await appendFile(excludePath, `${content && !content.endsWith("\n") ? "\n" : ""}${entry}\n`)
}

function planRunnerToolTaskID(sessionID) {
  return taskIdFrom(sessionID, `start-${randomUUID()}`)
}

function sessionPath(stateDir, sessionID) {
  return join(stateDir, "sessions", `${safeId(sessionID)}.json`)
}

function parentPath(stateDir, sessionID) {
  return join(stateDir, "parents", `${safeId(sessionID)}.json`)
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

async function readParentTaskIDs(stateDir, sessionID) {
  const [parent, index] = await Promise.all([
    readJson(parentPath(stateDir, sessionID)),
    readSessionIndex(stateDir, sessionID),
  ])
  return [...new Set([
    ...(Array.isArray(parent?.task_ids) ? parent.task_ids : []),
    ...(index?.role === "parent" && index.task_id ? [index.task_id] : []),
  ])]
}

async function appendParentTaskID(stateDir, sessionID, taskID) {
  const path = parentPath(stateDir, sessionID)
  const parent = await readJson(path)
  const taskIDs = [...new Set([
    ...(Array.isArray(parent?.task_ids) ? parent.task_ids : []),
    taskID,
  ])]
  await writeJsonAtomic(path, {
    session_id: sessionID,
    task_ids: taskIDs,
    updated_at: Date.now(),
  })
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

async function writeTaskState(stateDir, state) {
  await writeJsonAtomic(statePaths(stateDir, state.task_id).task, state)
}

function isPlanRunnerDispatch(args = {}) {
  return args.subagent_type === "plan-runner" || args.agent === "plan-runner"
}

function isInsidePath(base, target) {
  if (!base || !target) return false
  const normalizedBase = normalize(base)
  const normalizedTarget = normalize(isAbsolute(target) ? target : join(normalizedBase, target))
  const rel = relative(normalizedBase, normalizedTarget)
  return rel === "" || (!!rel && !rel.startsWith("..") && !isAbsolute(rel))
}

function ensureHarnessMarker(prompt, taskID) {
  const marker = `Harness Task ID: ${taskID}`
  const text = String(prompt || "")
  if (text.includes(marker)) return text
  return `${marker}\n\n${text}`.trim()
}

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

function mergeBackPromptText(state) {
  return [
    "Plan-runner validated. The harness did not merge the dedicated run worktree back into the origin workspace.",
    "",
    `Harness Task ID: ${state.task_id}`,
    `Origin workspace: ${state.origin_worktree}`,
    `Run worktree: ${state.worktree}`,
    `Plan-runner branch: ${state.branch}`,
    `Base commit: ${state.base_commit || state.git_base || "unknown"}`,
    `Head commit: ${state.parent_notification?.head_commit || state.git?.head || "unknown"}`,
    "",
    "Merge back instructions for the parent/main agent:",
    "- Inspect the origin workspace and confirm it is clean enough for merge-back.",
    `- From the origin workspace, run: git merge --ff-only ${state.branch}`,
    `- After a successful merge, run: git worktree remove "${state.worktree}"`,
    "- Delete the plan-runner branch after cleanup if that matches the local git workflow.",
    "",
    "Do not ask the plan-runner to modify the origin workspace. The parent/main agent owns merge-back and cleanup.",
  ].join("\n")
}

function shouldNotifyParentMergeBack(state) {
  if (state?.status !== "validated") return false
  if (!state.harness_owned_worktree) return false
  if (!state.parent_session_id || !state.origin_worktree || !state.worktree || !state.branch) return false
  if (state.origin_worktree === state.worktree) return false
  const notification = state.parent_notification || {}
  return !(notification.type === "merge_back" && (notification.status === "sent" || notification.status === "sending"))
}

function ensureChildWorktreePrompt(prompt, child) {
  const text = String(prompt || "")
  if (text.includes(`Assigned child worktree: ${child.worktree}`)) return text
  return [
    `Assigned child worktree: ${child.worktree}`,
    `Child branch: ${child.branch}`,
    `Child base commit: ${child.base_commit}`,
    `Root plan task: ${child.task_id}`,
    "Use the assigned child worktree for all file operations and bash workdir values.",
    "Do not modify the main workspace or any other child worktree.",
    "Return a concise outcome with files touched, commands run, validation output, blockers, and risks.",
    "",
    text,
  ].join("\n").trim()
}

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
    base_commit: null,
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

function normalizePlanTasks(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) throw new Error("write_plan requires tasks")
  return tasks.map((task, index) => {
    const expectedID = `T${index + 1}`
    const id = task?.id ? String(task.id) : expectedID
    if (id !== expectedID) throw new Error(`write_plan tasks must use contiguous ids; expected ${expectedID}`)
    if (!task.title) throw new Error(`write_plan task ${id} requires title`)
    return {
      id,
      title: String(task.title),
      files: Array.isArray(task.files) ? task.files.map(String) : [],
      checks: Array.isArray(task.checks) ? task.checks.map(String) : [],
      negative_checks: Array.isArray(task.negative_checks) ? task.negative_checks.map(String) : [],
      status: "pending",
      evidence: [],
    }
  })
}

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

function gitBoundaryRepairBash(command) {
  const segments = String(command || "")
    .split(/\s*(?:&&|;)\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean)
  return segments.length > 0 && segments.every((segment) => /^git(?:\s|$)/.test(segment))
}

function completionBoundaryExecutionAllowed(state, input, output) {
  if (input.tool !== "bash") return false
  if (!isCompletionAttempt(state)) return false
  return gitBoundaryRepairBash(output?.args?.command || input.args?.command)
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

async function registeredGitWorktrees(worktree) {
  const output = await gitCommand(worktree, ["worktree", "list", "--porcelain"])
  return new Set(output
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => normalize(line.slice("worktree ".length))))
}

async function childWorktreeCleanupFailures(state) {
  const children = (state.child_sessions || []).filter((child) => child.worktree)
  if (!children.length) return []

  let registered = new Set()
  try {
    registered = await registeredGitWorktrees(state.worktree)
  } catch {
    registered = new Set()
  }

  const reasons = []
  for (const child of children) {
    const childWorktree = normalize(child.worktree)
    if (await pathExists(childWorktree) || registered.has(childWorktree)) {
      reasons.push(`plan_runner_requires_child_worktree_cleanup: ${childWorktree}`)
    }
  }
  return reasons
}

async function createPlanRunnerWorktree(taskID, originWorktree, originGitInfo) {
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

async function createChildWorktree(stateDir, state, callID) {
  if (!state.git?.is_git_repo) throw new Error("plan-runner child worktree requires a git repository")
  const baseCommit = state.base_commit || state.git_base || state.git?.head || "HEAD"
  const childRoot = join(stateDir, "child-worktrees", state.task_id)
  const worktree = join(childRoot, safeId(callID))
  const branch = `planrunner-child/${safeId(state.task_id)}/${safeId(callID)}`
  await ensureDir(childRoot)
  if (!(await pathExists(worktree))) {
    await execFileAsync("git", ["-C", state.worktree, "worktree", "add", "-b", branch, worktree, baseCommit], { timeout: 30000 })
  }
  return { worktree, branch, base_commit: baseCommit }
}

function childSessionByCall(state, callID) {
  return (state.child_sessions || []).find((child) => child.call_id === callID) || null
}

function childSessionBySessionID(state, sessionID) {
  return (state.child_sessions || []).find((child) => child.session_id === sessionID) || null
}

function ensureChildWorktreeTaskToolDescription(input, output) {
  const toolName = input?.tool || input?.name || output?.name
  if (toolName !== "task") return
  const description = output?.description
  if (typeof description !== "string") return
  const worktreeDescription = "When the plan-runner agent uses this tool to dispatch a child subagent, the harness automatically creates a dedicated git worktree for that child and injects the assigned worktree and branch into the child prompt."
  if (description.includes(worktreeDescription)) return
  output.description = `${description}\n\n${worktreeDescription}`
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

function repairEvidenceTaskIDs(state) {
  if (!Array.isArray(state.tasks)) return []
  const failed = state.tasks
    .filter((task) => task.status === "completed" && taskEvidenceFailures(state, task).length > 0)
    .map((task) => task.id)
  if (failed.length) return failed
  return completedTaskIDs(state)
}

function evidenceTaskIDs(state) {
  if (!Array.isArray(state.tasks)) return []
  if (state.status === "repairing") return repairEvidenceTaskIDs(state)
  return state.active_task ? [state.active_task] : []
}

async function enforcePhaseGate(stateDir, input, output = {}) {
  const state = await readTaskStateForSession(stateDir, input.sessionID)
  if (!state) return

  if (input.tool === "todowrite") throw new Error("plan-runner phase gate: todowrite is forbidden for plan-runner")

  if (state.status === "planning_required") {
    if (!PLANNING_TOOLS.has(input.tool)) throw new Error(`plan-runner phase gate: ${input.tool} is not allowed during planning_required`)
    return
  }

  if (TERMINAL_COMPLETION_GATE_STATUSES.has(state.status) && input.tool === "finish_plan") return

  if (state.status === "audit_review" || state.status === "external_review" || TERMINAL_COMPLETION_GATE_STATUSES.has(state.status)) {
    throw new Error(`plan-runner terminal gate: ${input.tool} is not allowed during ${state.status}`)
  }

  if (state.status === "ready_to_execute" || state.status === "executing" || state.status === "repairing") {
    if (state.status === "ready_to_execute") {
      if (!READY_TO_EXECUTE_TOOLS.has(input.tool)) throw new Error(`plan-runner phase gate: start_task is required before execution tools during ${state.status}`)
      return
    }
    if (!EXECUTION_TOOLS.has(input.tool)) throw new Error(`plan-runner phase gate: ${input.tool} is not allowed during ${state.status}`)
    if (EXECUTION_CONTEXT_TOOLS.has(input.tool) && !activeTask(state)) {
      if (state.status === "repairing" && REPAIR_CONTEXT_TOOLS.has(input.tool)) return
      if (completionBoundaryExecutionAllowed(state, input, output)) return
      throw new Error("plan-runner phase gate: start_task is required before execution tools")
    }
  }
}

async function prepareChildDispatch(stateDir, input, output, sessionIndex) {
  const state = await readTaskState(stateDir, sessionIndex.task_id)
  if (!state) throw new Error("plan-runner child dispatch state is not readable")
  if (state.plan_runner_session_id !== input.sessionID) throw new Error("plan-runner child dispatch must run in the bound plan-runner session")
  if (!Array.isArray(state.tasks)) throw new Error("plan-runner child dispatch requires structured tasks")
  const task = activeTask(state)
  if (!task) throw new Error("plan-runner child dispatch requires an active task")

  const worktree = await createChildWorktree(stateDir, state, input.callID)
  const child = {
    call_id: input.callID,
    session_id: null,
    role: "executor",
    status: "dispatching",
    task_id: task.id,
    ...worktree,
  }

  state.child_sessions = (state.child_sessions || []).filter((item) => item.call_id !== input.callID)
  state.child_sessions.push(child)
  state.updated_at = Date.now()
  await writeTaskState(stateDir, state)
  await appendEvent(stateDir, state.task_id, {
    type: "child_worktree_created",
    call_id: input.callID,
    task_id: task.id,
    worktree: child.worktree,
    branch: child.branch,
    base_commit: child.base_commit,
  })

  output.args = output.args || {}
  output.args.background = true
  output.args.subagent_type = "executor"
  output.args.prompt = ensureChildWorktreePrompt(output.args.prompt, child)
}

async function bindChildDispatch(stateDir, client, input, output, sessionIndex, pendingChildTerminals) {
  const state = await readTaskState(stateDir, sessionIndex.task_id)
  if (!state) return
  const childSessionID = output.metadata?.sessionId
  const parentSessionID = output.metadata?.parentSessionId
  if (!childSessionID || parentSessionID !== input.sessionID) return
  const child = childSessionByCall(state, input.callID)
  if (!child) return

  const pending = pendingChildTerminals.get(childSessionID)
  if (pending) pendingChildTerminals.delete(childSessionID)
  state.child_sessions = (state.child_sessions || []).map((item) => {
    if (item.call_id !== input.callID) return item
    if (pending?.type === "session.error") {
      return { ...item, session_id: childSessionID, status: "failed", error: pending.error, failed_at: pending.at }
    }
    return { ...item, session_id: childSessionID, status: pending ? "completed" : "running" }
  })
  state.updated_at = Date.now()
  await writeTaskState(stateDir, state)
  await writeSessionIndex(stateDir, childSessionID, state.task_id, "child")
  await appendEvent(stateDir, state.task_id, {
    type: "child_session_bound",
    call_id: input.callID,
    session_id: childSessionID,
    worktree: child.worktree,
    branch: child.branch,
  })
  if (pending) {
    await appendEvent(stateDir, state.task_id, {
      type: pending.type === "session.error" ? "child_session_failed" : "child_session_completed",
      session_id: childSessionID,
      ...(pending.error ? { error: pending.error } : {}),
      recovered_before_binding: true,
    })
    await wakePlanRunnerAfterChildren({ stateDir, client, taskID: state.task_id })
  }
}

function childToolPaths(tool, args = {}) {
  const paths = []
  for (const key of ["filePath", "file_path", "path"]) {
    if (typeof args[key] === "string" && args[key].trim()) paths.push({ key, path: args[key] })
  }
  if (tool === "apply_patch") {
    for (const path of patchFileNames(args.patchText)) paths.push({ key: "patchText", path, patch: true })
  }
  return paths
}

async function enforceChildSessionGate(stateDir, input, output, sessionIndex) {
  const state = await readTaskState(stateDir, sessionIndex.task_id)
  if (!state) return
  const child = childSessionBySessionID(state, input.sessionID)
  if (!child) throw new Error("plan-runner child session is not bound to a child worktree")
  if (state.status === "audit_review" || state.status === "external_review") {
    throw new Error(`plan-runner terminal gate: child ${input.tool} is not allowed during ${state.status}`)
  }
  if (input.tool === "task") throw new Error("plan-runner child sessions cannot dispatch nested tasks")

  output.args = output.args || {}
  if (input.tool === "bash") {
    const requestedWorkdir = output.args.workdir || output.args.cwd
    if (requestedWorkdir && !isInsidePath(child.worktree, requestedWorkdir)) {
      throw new Error("plan-runner child tool path is outside assigned child worktree")
    }
    output.args.workdir = child.worktree
  }

  for (const item of childToolPaths(input.tool, output.args)) {
    const absolute = isAbsolute(item.path) ? normalize(item.path) : normalize(join(child.worktree, item.path))
    if (!isInsidePath(child.worktree, absolute)) {
      throw new Error("plan-runner child tool path is outside assigned child worktree")
    }
    if (item.patch && !isAbsolute(item.path)) {
      throw new Error("plan-runner child apply_patch paths must be absolute inside assigned child worktree")
    }
    if (!item.patch && !isAbsolute(item.path)) output.args[item.key] = absolute
  }
}

async function recordToolEvidence(stateDir, input, output) {
  if (input.tool === "write" || input.tool === "edit" || input.tool === "apply_patch") {
    const files = input.tool === "apply_patch" ? patchFileNames(input.args?.patchText) : [input.args?.filePath].filter((file) => typeof file === "string")
    if (files.length) await recordDiffEvidence(stateDir, { sessionID: input.sessionID, files, eventID: `tool-after-${input.callID}` })
    return
  }

  const state = await readTaskStateForSession(stateDir, input.sessionID, ["plan-runner", "child"])
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

  const task = findTask(state, taskIDs[0])
  if (!task) return
  task.evidence = (task.evidence || []).filter((item) => item.id !== evidence.id)
  task.evidence.push(evidence)
  state.updated_at = Date.now()
  await writeTaskState(stateDir, state)
  await appendEvent(stateDir, state.task_id, { type: "evidence_recorded", evidence_id: evidence.id, tool: input.tool, call_id: input.callID, task_id: taskIDs[0] })
}

function completedTaskIDs(state) {
  if (!Array.isArray(state.tasks)) return []
  return state.tasks.filter((task) => task.status === "completed").map((task) => task.id)
}

function findDeterministicCheckFailures(state) {
  const reasons = []
  if (!Array.isArray(state.tasks) || !state.tasks.length) reasons.push("write_plan task contract is empty")
  if (state.active_task) reasons.push(`active task is still running: ${state.active_task}`)
  for (const task of state.tasks || []) {
    if (task.status !== "completed") reasons.push(`${task.id} is not completed`)
    if (task.status === "completed") reasons.push(...taskEvidenceFailures(state, task))
  }

  return reasons
}

async function gitCommitBoundaryFailures(state) {
  const baseCommit = state.base_commit || state.git_base
  if (!baseCommit) return []

  const gitInfo = await inspectGitWorktree(state.worktree)
  if (!gitInfo.is_git_repo) return []

  const reasons = []
  reasons.push(...await childWorktreeCleanupFailures(state))
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
  const evidence = task.evidence || []
  const diffFiles = new Set(evidence.filter((item) => item.type === "diff").flatMap((item) => item.files || []))
  const successfulCommands = new Set(evidence.filter((item) => item.type === "command" && item.success).map((item) => item.command))
  const failedCommands = new Set(evidence.filter((item) => item.type === "command" && !item.success).map((item) => item.command))
  const reasons = []
  for (const file of task.files || []) {
    if (!diffFiles.has(file)) reasons.push(`${task.id} missing diff evidence for ${file}`)
  }
  for (const command of task.checks || []) {
    if (!successfulCommands.has(command)) reasons.push(`${task.id} missing successful check: ${command}`)
  }
  for (const command of task.negative_checks || []) {
    if (!failedCommands.has(command)) reasons.push(`${task.id} missing failing negative check: ${command}`)
  }
  return reasons
}

function isCompletionAttempt(state) {
  return Array.isArray(state.tasks) && state.tasks.length > 0 && !state.active_task && state.tasks.every((task) => task.status === "completed")
}

function hasRunningChildSession(state) {
  return (state.child_sessions || []).some((child) => child.status === "running")
}

function hasTerminalGateResult(state) {
  return [state.status, state.completion_gate?.status].some((status) => TERMINAL_COMPLETION_GATE_STATUSES.has(status))
}

function watchdogNudgeCount(state) {
  return Number(state.watchdog_nudge?.count || 0)
}

function shouldSendWatchdogNudge(state, sessionID) {
  if (!state || state.plan_runner_session_id !== sessionID) return false
  if (state.status !== "ready_to_execute" && state.status !== "executing") return false
  if (!isCompletionAttempt(state)) return false
  if (completionGateActive(state) || hasTerminalGateResult(state)) return false
  if (hasRunningChildSession(state)) return false
  return watchdogNudgeCount(state) < MAX_WATCHDOG_NUDGES
}

function watchdogNudgePromptText(state) {
  return [
    "Plan-runner watchdog: original plan tasks are complete and the session is idle.",
    "Immediate next step: call finish_plan now.",
    "No final report: do not write any final report before finish_plan returns validated.",
    "Do not run audit or external review manually; finish_plan owns the terminal gate.",
    `Harness Task ID: ${state.task_id}`,
  ].join("\n")
}

function auditPromptText(state) {
  const modifiedFiles = Array.isArray(state.modified_files) ? state.modified_files : []
  const files = modifiedFiles.length ? modifiedFiles.map((file) => `- ${file}`) : ["- none recorded"]
  const tasks = Array.isArray(state.tasks) && state.tasks.length
    ? state.tasks.map((task) => `- ${task.id}: ${task.status} - ${task.title}; files: ${(task.files || []).join(", ") || "none"}; checks: ${(task.checks || []).join(" | ") || "none"}`)
    : ["- none recorded"]
  return [
    "Plan-runner audit_review_required: deterministic checks passed; audit the completed scope before the harness continues.",
    "- You are the harness-dispatched audit subagent. Do not modify files.",
    "- Check whether each completed task has a complete implementation, not just an interface shell, stub, mock, or code that only satisfies tests.",
    "- Review the write_plan artifact, injected Execution Brief, structured task contract, observed files, and observed validation commands.",
    "- Return only fields consumed by the harness: result, required_fixes.",
    `- Harness Task ID: ${state.task_id}`,
    `- Plan path: ${state.plan_path || "none"}`,
    `- Brief path: ${state.brief_path}`,
    "- Structured tasks:",
    ...tasks,
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

function gateFailures(state = {}) {
  return Array.isArray(state.gate_failures) ? state.gate_failures : []
}

function ensureGateFailures(state) {
  if (!Array.isArray(state.gate_failures)) state.gate_failures = []
  return state.gate_failures
}

function gateFailureCount(state, source) {
  return gateFailures(state).filter((failure) => failure.source === source).length
}

function nextGateFailureAttempt(state, source) {
  return gateFailureCount(state, source) + 1
}

function shouldFailOpenGate(state, source) {
  return nextGateFailureAttempt(state, source) >= MAX_GATE_FAILURES
}

function gateFailedOpen(state, source) {
  return gateFailures(state).some((failure) => failure.source === source && failure.failed_open)
}

function recordGateFailure(state, source, reasons, { failedOpen = false } = {}) {
  const entry = {
    source,
    attempt: nextGateFailureAttempt(state, source),
    reasons: (Array.isArray(reasons) ? reasons : [reasons]).map((reason) => String(reason)),
    failed_open: Boolean(failedOpen),
    ts: Date.now(),
  }
  ensureGateFailures(state).push(entry)
  return entry
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

function shouldDisposeRunRuntime(state, directory) {
  const disposal = state?.runtime_disposal || {}
  const rootTerminal = state?.plan_runner_terminal_idle_at || state?.plan_runner_terminal_error_at
  const notificationDone = ["sent", "failed"].includes(state?.parent_notification?.status)
  return Boolean(
    TERMINAL_COMPLETION_GATE_STATUSES.has(state?.status)
      && state.harness_owned_worktree
      && state.worktree
      && state.origin_worktree
      && state.worktree !== state.origin_worktree
      && directory === state.origin_worktree
      && rootTerminal
      && notificationDone
      && disposal.status !== "disposing"
      && disposal.status !== "disposed"
      && (disposal.status !== "failed" || Number(disposal.attempts || 0) < MAX_RUNTIME_DISPOSAL_ATTEMPTS),
  )
}

async function disposeRunRuntime({ stateDir, client, directory, state }) {
  if (!shouldDisposeRunRuntime(state, directory)) return state

  const disposingState = cloneState(state)
  const previousDisposal = disposingState.runtime_disposal || {}
  disposingState.runtime_disposal = {
    status: "disposing",
    directory: disposingState.worktree,
    attempts: Number(previousDisposal.attempts || 0) + 1,
    ...(previousDisposal.error ? { last_error: previousDisposal.error } : {}),
    ...(previousDisposal.failed_at ? { last_failed_at: previousDisposal.failed_at } : {}),
    started_at: Date.now(),
  }
  disposingState.updated_at = Date.now()
  await writeTaskState(stateDir, disposingState)

  try {
    if (typeof client?.instance?.dispose !== "function") {
      throw new Error("client.instance.dispose is unavailable")
    }
    const disposed = await client.instance.dispose({ query: { directory: disposingState.worktree } })
    throwIfSdkError(disposed, "run worktree runtime disposal failed")
    const disposedState = cloneState(await readTaskState(stateDir, state.task_id) || disposingState)
    disposedState.runtime_disposal = {
      status: "disposed",
      directory: disposingState.worktree,
      attempts: disposingState.runtime_disposal.attempts,
      ...(disposingState.runtime_disposal.last_error ? { last_error: disposingState.runtime_disposal.last_error } : {}),
      ...(disposingState.runtime_disposal.last_failed_at ? { last_failed_at: disposingState.runtime_disposal.last_failed_at } : {}),
      disposed_at: Date.now(),
    }
    disposedState.updated_at = Date.now()
    await writeTaskState(stateDir, disposedState)
    await appendEvent(stateDir, state.task_id, { type: "runtime_disposal_disposed", directory: disposingState.worktree })
    return disposedState
  } catch (error) {
    const failedState = cloneState(await readTaskState(stateDir, state.task_id) || disposingState)
    failedState.runtime_disposal = {
      status: "failed",
      directory: disposingState.worktree,
      attempts: disposingState.runtime_disposal.attempts,
      error: formatDiagnosticError(error),
      ...(disposingState.runtime_disposal.last_error ? { last_error: disposingState.runtime_disposal.last_error } : {}),
      ...(disposingState.runtime_disposal.last_failed_at ? { last_failed_at: disposingState.runtime_disposal.last_failed_at } : {}),
      failed_at: Date.now(),
    }
    failedState.updated_at = Date.now()
    await writeTaskState(stateDir, failedState)
    await appendEvent(stateDir, state.task_id, {
      type: "runtime_disposal_failed",
      directory: disposingState.worktree,
      error: failedState.runtime_disposal.error,
    })
    return failedState
  }
}

function extractTextFromMessageInfo(info = {}) {
  const parts = Array.isArray(info.parts) ? info.parts : []
  const texts = parts.map((part) => part?.text || part?.content).filter(Boolean)
  if (texts.length) return texts.join("\n")
  return info.text || info.content || info.summary?.text || ""
}

function promptResultHasSdkResponseShape(result = {}) {
  return Boolean(result?.data && typeof result.data === "object" && (
    Object.prototype.hasOwnProperty.call(result.data, "info")
      || Object.prototype.hasOwnProperty.call(result.data, "parts")
  ))
}

function extractPromptResultText(result = {}) {
  const data = result?.data ?? result
  const parts = data?.parts
  if (Array.isArray(parts)) {
    const text = parts.map(extractTextFromMessagePart).filter(Boolean).join("\n")
    if (text) return text
  }
  return extractTextFromMessageInfo(data?.info || data)
}

function extractTextFromMessagePart(part = {}) {
  if (part.type !== "text") return ""
  return part.text || part.content || ""
}

function assistantMessageID(message = {}) {
  const id = message?.info?.id || message?.id || message?.messageID
  return typeof id === "string" && id ? id : null
}

function assistantMessageCompleted(message = {}) {
  const info = message?.info || message
  return Boolean(
    info?.time?.completed
      || info?.completed_at
      || info?.completedAt
      || info?.completed === true,
  )
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
  for (const fix of result.required_fixes || []) reasons.push(fix)
  return reasons
}

function invalidAuditReview(reason) {
  return {
    result: "invalid",
    required_fixes: [reason],
    invalid_json: true,
  }
}

function normalizeAuditReview(text) {
  try {
    const parsed = extractJsonObject(text)
    if (parsed.result !== "pass" && parsed.result !== "fail") {
      return invalidAuditReview("audit review must return valid JSON with result set to pass or fail")
    }
    if (!Array.isArray(parsed.required_fixes)) {
      return invalidAuditReview("audit review must return valid JSON with required_fixes as an array")
    }
    return {
      result: parsed.result,
      required_fixes: normalizeStringArray(parsed.required_fixes),
    }
  } catch (error) {
    return invalidAuditReview(`audit review must return valid JSON: ${formatDiagnosticError(error)}`)
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
  else if (state.brief_path) baseArgs.push("--spec", state.brief_path)

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
  recordGateFailure(nextState, source, reasons)
  nextState.status = "repairing"
  nextState.reviews.round += 1
  rememberCompletionGateResult(nextState, "repair_required", source, reasons)
  nextState.updated_at = Date.now()
  await writeTaskState(stateDir, nextState)
  await appendEvent(stateDir, state.task_id, { type: `${source}_repair_required`, reasons })
}

async function failOpenGate({ stateDir, state, source, reasons }) {
  recordGateFailure(state, source, reasons, { failedOpen: true })
  state.updated_at = Date.now()
  await appendEvent(stateDir, state.task_id, { type: `${source}_failed_open`, reasons })
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
  const failures = gateFailures(state)
  if (failures.length) {
    lines.push("", "Gate Failures:")
    for (const failure of failures) {
      const status = failure.failed_open ? "fail-open" : "repair-required"
      lines.push(`- ${failure.source}#${failure.attempt} ${status}: ${(failure.reasons || []).join("; ")}`)
    }
  }
  return lines.join("\n")
}

function preflightBlockResultText(state, reasons) {
  return [
    "Result: preflight_blocked",
    "",
    `Harness Task ID: ${state?.task_id || "unknown"}`,
    "",
    "Reasons:",
    ...reasons.map((reason) => `- ${reason}`),
    "",
    "Next Steps:",
    "- Fix the preflight reasons in this same plan-runner session.",
    "- For dirty root repos, git add/commit the completed work and confirm git status --short is clean.",
    "- For child worktrees, merge or intentionally discard their work, then remove the child worktree.",
    "- Call finish_plan again only after the preflight checks are clean.",
  ].join("\n")
}

async function notifyParentMergeBack({ stateDir, client, directory, state }) {
  const currentState = await readTaskState(stateDir, state.task_id) || state
  if (!shouldNotifyParentMergeBack(currentState) || (!currentState.plan_runner_terminal_idle_at && !currentState.plan_runner_terminal_error_at)) return currentState

  const sendingState = cloneState(currentState)
  const headCommit = await currentGitHead(sendingState.worktree)
  sendingState.parent_notification = {
    type: "merge_back",
    status: "sending",
    session_id: sendingState.parent_session_id,
    origin_worktree: sendingState.origin_worktree,
    worktree: sendingState.worktree,
    branch: sendingState.branch,
    base_commit: sendingState.base_commit || sendingState.git_base || null,
    head_commit: headCommit,
    started_at: Date.now(),
  }
  sendingState.updated_at = Date.now()
  await writeTaskState(stateDir, sendingState)

  try {
    const promptParent = client?.session?.promptAsync
      ? (payload) => client.session.promptAsync(payload)
      : null
    if (!promptParent) throw new Error("client.session.promptAsync is unavailable")
    const query = { directory: sendingState.origin_worktree || directory || sendingState.worktree }
    const prompted = await promptParent({
      path: { id: sendingState.parent_session_id },
      query,
      body: {
        parts: [{ type: "text", text: mergeBackPromptText(sendingState) }],
      },
    })
    throwIfSdkError(prompted, "parent merge-back prompt failed")

    const notifiedState = cloneState(await readTaskState(stateDir, state.task_id) || sendingState)
    notifiedState.parent_notification = {
      type: "merge_back",
      status: "sent",
      session_id: sendingState.parent_session_id,
      origin_worktree: sendingState.origin_worktree,
      worktree: sendingState.worktree,
      branch: sendingState.branch,
      base_commit: sendingState.base_commit || sendingState.git_base || null,
      head_commit: headCommit,
      sent_at: Date.now(),
    }
    notifiedState.updated_at = Date.now()
    await writeTaskState(stateDir, notifiedState)
    await appendEvent(stateDir, state.task_id, {
      type: "parent_merge_back_notified",
      session_id: sendingState.parent_session_id,
      origin_worktree: sendingState.origin_worktree,
      worktree: sendingState.worktree,
      branch: sendingState.branch,
      base_commit: sendingState.base_commit || sendingState.git_base || null,
      head_commit: headCommit,
    })
    return notifiedState
  } catch (error) {
    const failedState = cloneState(await readTaskState(stateDir, state.task_id) || sendingState)
    failedState.parent_notification = {
      type: "merge_back",
      status: "failed",
      session_id: sendingState.parent_session_id,
      origin_worktree: sendingState.origin_worktree,
      worktree: sendingState.worktree,
      branch: sendingState.branch,
      base_commit: sendingState.base_commit || sendingState.git_base || null,
      head_commit: headCommit,
      error: formatDiagnosticError(error),
      failed_at: Date.now(),
    }
    failedState.updated_at = Date.now()
    await writeTaskState(stateDir, failedState)
    await appendEvent(stateDir, state.task_id, {
      type: "parent_merge_back_notify_failed",
      session_id: sendingState.parent_session_id,
      error: formatDiagnosticError(error),
    })
    return failedState
  }
}

function terminalResultPromptText(state) {
  const code = state.blocker?.code || state.plan_runner_error?.message || "unknown"
  const finalText = state.blocker?.final_text || null
  return [
    "Plan-runner reached a terminal result; preserve the run worktree for review.",
    `Harness Task ID: ${state.task_id}`,
    `Result status: ${state.status}`,
    `Code or error: ${code}`,
    ...(finalText ? [`Final text: ${finalText}`] : []),
    `Run worktree: ${state.worktree}`,
    `Branch: ${state.branch || "unknown"}`,
    "The worktree and branch are preserved; inspect them before deciding next steps.",
  ].join("\n")
}

async function notifyParentTerminalResult({ stateDir, client, directory, state }) {
  const currentState = await readTaskState(stateDir, state.task_id) || state
  if (!(["blocked", "interrupted"].includes(currentState.status)) || !currentState.parent_session_id) return currentState
  if (!currentState.plan_runner_terminal_idle_at && !currentState.plan_runner_terminal_error_at) return currentState
  if (["sending", "sent", "failed"].includes(currentState.parent_notification?.status)) return currentState

  const sending = cloneState(currentState)
  sending.parent_notification = {
    type: "terminal_result",
    status: "sending",
    result_status: sending.status,
    session_id: sending.parent_session_id,
    task_id: sending.task_id,
    code: sending.blocker?.code || sending.plan_runner_error?.message || null,
    final_text: sending.blocker?.final_text || null,
    worktree: sending.worktree,
    branch: sending.branch,
    started_at: Date.now(),
  }
  sending.updated_at = Date.now()
  await writeTaskState(stateDir, sending)

  try {
    if (!client?.session?.promptAsync) throw new Error("client.session.promptAsync is unavailable")
    const prompted = await client.session.promptAsync({
      path: { id: sending.parent_session_id },
      query: { directory: sending.origin_worktree || directory || sending.worktree },
      body: { parts: [{ type: "text", text: terminalResultPromptText(sending) }] },
    })
    throwIfSdkError(prompted, "parent terminal result prompt failed")
    const sent = cloneState(await readTaskState(stateDir, state.task_id) || sending)
    sent.parent_notification = { ...sending.parent_notification, status: "sent", sent_at: Date.now() }
    sent.updated_at = Date.now()
    await writeTaskState(stateDir, sent)
    await appendEvent(stateDir, state.task_id, { type: "parent_terminal_result_notified", session_id: sending.parent_session_id, result_status: sending.status })
    return sent
  } catch (error) {
    const failed = cloneState(await readTaskState(stateDir, state.task_id) || sending)
    failed.parent_notification = { ...sending.parent_notification, status: "failed", error: formatDiagnosticError(error), failed_at: Date.now() }
    failed.updated_at = Date.now()
    await writeTaskState(stateDir, failed)
    await appendEvent(stateDir, state.task_id, { type: "parent_terminal_result_notify_failed", session_id: sending.parent_session_id, error: failed.parent_notification.error })
    return failed
  }
}

async function notifyParentTerminalResultIfReady({ stateDir, client, directory, state }) {
  if (state.status === "validated") return notifyParentMergeBack({ stateDir, client, directory, state })
  return notifyParentTerminalResult({ stateDir, client, directory, state })
}

async function recordStartPlanRunnerDispatchFailure({ stateDir, taskID, phase, error }) {
  const currentState = await readTaskState(stateDir, taskID)
  if (!currentState) return
  if (currentState.status === "interrupted" && currentState.plan_runner_terminal_error_at) return

  const at = Date.now()
  const failed = cloneState(currentState)
  failed.status = "interrupted"
  failed.plan_runner_error = {
    message: formatDiagnosticError(error),
    phase,
    at,
  }
  failed.plan_runner_terminal_error_at = at
  // The tool invocation itself synchronously delivered this failure to the parent.
  failed.parent_notification = {
    type: "dispatch_error",
    status: "failed",
    synchronous_delivery: true,
    phase,
  }
  failed.updated_at = at
  await writeTaskState(stateDir, failed)
  await appendEvent(stateDir, taskID, {
    type: "plan_runner_dispatch_failed",
    phase,
    session_id: failed.plan_runner_session_id || null,
    error: failed.plan_runner_error.message,
  })
  await appendEvent(stateDir, taskID, {
    type: "parent_dispatch_error_synchronously_delivered",
    phase,
    session_id: failed.parent_session_id,
  })
}

async function recordStartPlanRunnerDispatchUnknown({ stateDir, taskID, phase, error }) {
  const state = await readTaskState(stateDir, taskID)
  if (!state) return
  state.dispatch_delivery = {
    status: "unknown",
    phase,
    error: formatDiagnosticError(error),
    at: Date.now(),
  }
  state.updated_at = state.dispatch_delivery.at
  await writeTaskState(stateDir, state)
  await appendEvent(stateDir, taskID, {
    type: "plan_runner_dispatch_delivery_unknown",
    phase,
    session_id: state.plan_runner_session_id || null,
    error: state.dispatch_delivery.error,
  })
}

async function finishPlanTool(args, context, stateDir, { client, directory, externalReview, pollMs, timeoutMs }) {
  if (context.agent !== "plan-runner") throw new Error("finish_plan is only available to the plan-runner agent")
  const sessionID = context.sessionID
  const state = await readTaskStateForSession(stateDir, sessionID)
  if (!state) throw new Error("finish_plan task state is not readable")
  if (state.plan_runner_session_id !== sessionID) throw new Error("finish_plan must run in the bound plan-runner session")
  if (TERMINAL_COMPLETION_GATE_STATUSES.has(state.status)) {
    return {
      output: completionGateResultText(state),
      metadata: {
        task_id: state.task_id,
        status: state.status,
        completion_gate: state.completion_gate || null,
      },
    }
  }

  if (isCompletionAttempt(state)) {
    const preflightReasons = await gitCommitBoundaryFailures(state)
    if (preflightReasons.length) {
      await appendEvent(stateDir, state.task_id, { type: "finish_plan_preflight_blocked", reasons: preflightReasons })
      return {
        output: preflightBlockResultText(state, preflightReasons),
        metadata: {
          task_id: state.task_id,
          status: "preflight_blocked",
          reasons: preflightReasons,
        },
      }
    }
  }

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
  if (!state.brief_path || !state.brief_sha256) reasons.push("dispatch brief is not written")
  else {
    try {
      const brief = await readFile(state.brief_path, "utf8")
      if (sha256(brief) !== state.brief_sha256) reasons.push("brief file hash does not match task state")
    } catch (error) {
      reasons.push(`brief file is not readable: ${formatDiagnosticError(error)}`)
    }
  }
  if (!Array.isArray(state.tasks) || !state.tasks.length) reasons.push("write_plan task contract is empty")
  if (state.active_task) reasons.push(`active task is still running: ${state.active_task}`)
  for (const task of state.tasks || []) {
    if (task.status !== "completed") reasons.push(`${task.id} has no completed task status`)
    if (task.status === "completed") reasons.push(...taskEvidenceFailures(state, task))
  }
  const evidenceFiles = new Set((state.tasks || []).flatMap((task) => task.evidence || []).filter((item) => item.type === "diff").flatMap((item) => item.files || []))
  for (const file of state.modified_files || []) {
    if (!evidenceFiles.has(file)) reasons.push(`modified file is not mapped to evidence: ${file}`)
  }
  if (state.child_sessions?.some((child) => child.status === "running")) reasons.push("child sessions are still running")
  if (!state.reviews.audit.length && !gateFailedOpen(state, "audit_review")) reasons.push("audit review did not run")
  if (state.reviews.external.at(-1)?.result !== "pass" && !gateFailedOpen(state, "external_review")) reasons.push("latest external review did not pass")
  return reasons
}

async function finalizeIfComplete({ stateDir, client, directory, state }) {
  const reasons = await finalCompletenessFailures(state)
  if (reasons.length) {
    if (shouldFailOpenGate(state, "completeness_check")) {
      const nextState = cloneState(state)
      await failOpenGate({ stateDir, state: nextState, source: "completeness_check", reasons })
      nextState.status = "validated"
      rememberCompletionGateResult(nextState, "validated", "terminal_gate", [])
      nextState.updated_at = Date.now()
      await writeTaskState(stateDir, nextState)
      await appendEvent(stateDir, state.task_id, { type: "task_validated", fail_open: true })
       return
    }
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
    if (shouldFailOpenGate(reviewedState, "external_review")) {
      await failOpenGate({ stateDir, state: reviewedState, source: "external_review", reasons: [review.findings || `external review ${review.result}`] })
      await writeTaskState(stateDir, reviewedState)
      await finalizeIfComplete({ stateDir, client, directory, state: reviewedState })
      return
    }
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

async function requestAuditRegeneration({ stateDir, client, directory, sessionID, state, reason, attempts, externalReview }) {
  if (!client?.session?.prompt) {
    await recordAuditDispatchFailure({ stateDir, client, directory, sessionID: state.plan_runner_session_id, state, error: "audit regeneration prompt unavailable", auditSessionID: sessionID, externalReview })
    return
  }

  const nextState = cloneState(state)
  nextState.reviews.audit_invalid_json_attempts = attempts
  recordGateFailure(nextState, "audit_review", [reason])
  delete nextState.reviews.pending_audit_text
  nextState.updated_at = Date.now()
  await writeTaskState(stateDir, nextState)

  const query = { directory: directory || state.worktree }
  const prompted = await client.session.prompt({
    path: { id: sessionID },
    query,
    body: {
      agent: "plan-runner-audit",
      parts: [{
        type: "text",
        text: [
          "Your previous audit response was invalid JSON for the plan-runner harness.",
          `Reason: ${reason}`,
          "Return only this JSON shape, with no markdown fences or extra text:",
          '{"result":"pass","required_fixes":[]}',
          "Set result to fail and put concise string fixes in required_fixes only when fixes remain.",
        ].join("\n"),
      }],
    },
  })
  throwIfSdkError(prompted, "audit regeneration prompt failed")
  await appendEvent(stateDir, state.task_id, { type: "audit_review_regeneration_requested", audit_session_id: sessionID, attempts, reason })
}

async function failOpenInvalidAudit({ stateDir, client, directory, sessionID, state, audit, attempts, externalReview }) {
  const nextState = cloneState(state)
  nextState.reviews.audit_invalid_json_attempts = attempts
  recordGateFailure(nextState, "audit_review", [audit.required_fixes?.[0] || "audit review did not return valid JSON"], { failedOpen: true })
  nextState.reviews.audit = [...(nextState.reviews.audit || []), {
    result: "pass",
    required_fixes: [],
    invalid_json_reason: audit.required_fixes?.[0] || "audit review did not return valid JSON",
    invalid_json_attempts: attempts,
  }]
  delete nextState.reviews.pending_audit_text
  nextState.child_sessions = (nextState.child_sessions || []).map((child) => (
    child.session_id === sessionID ? { ...child, status: "completed" } : child
  ))
  nextState.updated_at = Date.now()
  await writeTaskState(stateDir, nextState)
  await appendEvent(stateDir, state.task_id, {
    type: "audit_review_invalid_json_fail_open",
    attempts,
    reason: audit.required_fixes?.[0] || "audit review did not return valid JSON",
  })
  await appendEvent(stateDir, state.task_id, { type: "audit_review_passed", fail_open: true })
  await runExternalReview({ stateDir, client, directory, state: nextState, externalReview })
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
  if (audit.invalid_json) {
    const attempts = (state.reviews.audit_invalid_json_attempts || 0) + 1
    if (attempts < MAX_AUDIT_INVALID_JSON_ATTEMPTS) {
      await requestAuditRegeneration({ stateDir, client, directory, sessionID, state, reason: audit.required_fixes?.[0] || "invalid JSON", attempts, externalReview })
      return
    }
    await failOpenInvalidAudit({ stateDir, client, directory, sessionID, state, audit, attempts, externalReview })
    return
  }

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
    if (shouldFailOpenGate(nextState, "audit_review")) {
      await failOpenGate({ stateDir, state: nextState, source: "audit_review", reasons })
      await writeTaskState(stateDir, nextState)
      await runExternalReview({ stateDir, client, directory, state: nextState, externalReview })
      return
    }
    await promptRepair({ stateDir, state: nextState, source: "audit_review", reasons })
    return
  }

  await appendEvent(stateDir, state.task_id, { type: "audit_review_passed" })
  await runExternalReview({ stateDir, client, directory, state: nextState, externalReview })
}

async function handleChildSessionIdle({ stateDir, client, event }) {
  if (event.type !== "session.idle") return
  const sessionID = event.properties?.sessionID
  if (!sessionID) return
  const index = await readSessionIndex(stateDir, sessionID)
  if (!index || index.role !== "child") return

  const state = await readTaskState(stateDir, index.task_id)
  if (!state) return
  const child = childSessionBySessionID(state, sessionID)
  if (!child) return

  if (child.status === "running") {
    state.child_sessions = (state.child_sessions || []).map((item) => (
      item.session_id === sessionID ? { ...item, status: "completed" } : item
    ))
    state.updated_at = Date.now()
    await writeTaskState(stateDir, state)
    await appendEvent(stateDir, state.task_id, { type: "child_session_completed", session_id: sessionID })
  }
  await wakePlanRunnerAfterChildren({ stateDir, client, taskID: index.task_id })
}

async function handleParentSessionIdle({ stateDir, client, directory, event }) {
  if (event.type !== "session.idle") return
  const sessionID = event.properties?.sessionID
  if (!sessionID) return
  const taskIDs = await readParentTaskIDs(stateDir, sessionID)
  if (!taskIDs.length) return
  for (const taskID of taskIDs) {
    let state = await readTaskState(stateDir, taskID)
    if (state && !state.task_id) state = { ...state, task_id: taskID }
    try {
      await disposeRunRuntime({ stateDir, client, directory, state })
    } catch {
      // One disposal must not prevent sibling plan-runner instances from being released.
    }
  }
}

async function readPlanRunnerFinalMessage(client, state) {
  const result = await client.session.messages({
    path: { id: state.plan_runner_session_id },
    query: { directory: state.worktree, limit: 20 },
  })
  throwIfSdkError(result, "plan-runner final message read failed")
  const messages = Array.isArray(result?.data) ? result.data : []
  return [...messages].reverse().find((item) => item?.info?.role === "assistant") || null
}

function rootWakePromptText(state) {
  const children = (state.child_sessions || []).map((child) => (
    `- ${child.session_id}: ${child.status}; worktree: ${child.worktree || "unknown"}`
  ))
  return [
    "Plan-runner child sessions have settled.",
    `Harness Task ID: ${state.task_id}`,
    `Active task: ${state.active_task || "none"}`,
    "Child session results:",
    ...(children.length ? children : ["- none"]),
    "Process or merge the child results and continue the current plan.",
    "Do not treat a child having started as a final result.",
  ].join("\n")
}

async function wakePlanRunnerAfterChildren({ stateDir, client, taskID }) {
  const state = await readTaskState(stateDir, taskID)
  if (!state || state.status !== "waiting_for_children" || hasRunningChildSession(state)) return
  const rootWait = state.root_wait || {}
  if (rootWait.status !== "sleeping" && rootWait.status !== "failed") return
  if (Number(rootWait.attempts || 0) >= 2) return

  const waking = cloneState(state)
  waking.root_wait = {
    ...rootWait,
    status: "waking",
    attempts: Number(rootWait.attempts || 0) + 1,
    waking_at: Date.now(),
  }
  waking.updated_at = Date.now()
  await writeTaskState(stateDir, waking)

  try {
    if (!client?.session?.promptAsync) throw new Error("client.session.promptAsync is unavailable")
    const dispatched = await client.session.promptAsync({
      path: { id: waking.plan_runner_session_id },
      query: { directory: waking.worktree },
      body: {
        agent: "plan-runner",
        parts: [{ type: "text", text: rootWakePromptText(waking) }],
      },
    })
    throwIfSdkError(dispatched, "plan-runner root reawaken failed")
    const awake = await readTaskState(stateDir, taskID)
    if (!awake || awake.status !== "waiting_for_children" || awake.root_wait?.status !== "waking") return
    awake.status = awake.root_wait.resume_status || "executing"
    awake.root_wait = { ...awake.root_wait, status: "awake", awake_at: Date.now() }
    awake.updated_at = Date.now()
    await writeTaskState(stateDir, awake)
    await appendEvent(stateDir, taskID, { type: "plan_runner_root_reawakened", session_id: awake.plan_runner_session_id, attempts: awake.root_wait.attempts })
  } catch (error) {
    const failed = await readTaskState(stateDir, taskID)
    if (!failed || failed.status !== "waiting_for_children") return
    failed.root_wait = {
      ...failed.root_wait,
      status: "failed",
      error: formatDiagnosticError(error),
      failed_at: Date.now(),
    }
    if (Number(failed.root_wait.attempts || 0) >= 2) {
      failed.status = "interrupted"
      failed.plan_runner_error = { message: failed.root_wait.error, at: Date.now() }
      failed.plan_runner_terminal_error_at = failed.plan_runner_error.at
    }
    failed.updated_at = Date.now()
    await writeTaskState(stateDir, failed)
    await appendEvent(stateDir, taskID, { type: "plan_runner_root_reawaken_failed", session_id: failed.plan_runner_session_id, attempts: failed.root_wait.attempts, error: failed.root_wait.error })
    if (Number(failed.root_wait.attempts || 0) === 1) {
      await wakePlanRunnerAfterChildren({ stateDir, client, taskID })
      return
    }
    if (failed.status === "interrupted") {
      await appendEvent(stateDir, taskID, { type: "plan_runner_root_reawaken_terminal_failure", session_id: failed.plan_runner_session_id, attempts: failed.root_wait.attempts, error: failed.root_wait.error })
      await notifyParentTerminalResultIfReady({ stateDir, client, directory: failed.worktree, state: failed })
    }
  }
}

async function handleChildSessionError({ stateDir, client, event }) {
  if (event.type !== "session.error") return
  const sessionID = event.properties?.sessionID
  if (!sessionID) return
  const index = await readSessionIndex(stateDir, sessionID)
  if (!index || index.role !== "child") return
  const state = await readTaskState(stateDir, index.task_id)
  if (!state) return
  const child = childSessionBySessionID(state, sessionID)
  if (!child) return
  if (child.status === "running") {
    const error = formatDiagnosticError(event.properties?.error)
    state.child_sessions = (state.child_sessions || []).map((item) => (
      item.session_id === sessionID ? { ...item, status: "failed", error, failed_at: Date.now() } : item
    ))
    state.updated_at = Date.now()
    await writeTaskState(stateDir, state)
    await appendEvent(stateDir, state.task_id, { type: "child_session_failed", session_id: sessionID, error })
  }
  await wakePlanRunnerAfterChildren({ stateDir, client, taskID: index.task_id })
}

async function handlePlanRunnerTerminalIdle({ stateDir, client, event }) {
  if (event.type !== "session.idle") return
  const sessionID = event.properties?.sessionID
  if (!sessionID) return
  const index = await readSessionIndex(stateDir, sessionID)
  if (!index || index.role !== "plan-runner") return
  const state = await readTaskState(stateDir, index.task_id)
  if (!state) return

  if (TERMINAL_COMPLETION_GATE_STATUSES.has(state.status)) {
    if (state.plan_runner_terminal_idle_at) return
    state.plan_runner_terminal_idle_at = Date.now()
    state.updated_at = Date.now()
    await writeTaskState(stateDir, state)
    await notifyParentTerminalResultIfReady({ stateDir, client, directory: state.origin_worktree, state })
    return
  }
  if (shouldSendWatchdogNudge(state, sessionID)) return
  if (state.status === "self_checking") return

  let message
  let collectionError
  try {
    if (!client?.session?.messages) throw new Error("client.session.messages is unavailable")
    message = await readPlanRunnerFinalMessage(client, state)
  } catch (error) {
    collectionError = error
  }

  const runningChildren = (state.child_sessions || []).filter((child) => child.status === "running")
  if (runningChildren.length) {
    const messageID = message ? assistantMessageID(message) : null
    const text = message
      ? extractTextFromMessageInfo(message.info || {})
        || (message.parts || []).map(extractTextFromMessagePart).filter(Boolean).join("\n")
      : ""
    const nextState = cloneState(state)
    nextState.status = "waiting_for_children"
    nextState.root_wait = {
      status: "sleeping",
      resume_status: state.status,
      child_session_ids: runningChildren.map((child) => child.session_id),
      final_text: text || null,
      ...(messageID ? { last_assistant_message_id: messageID } : {}),
      ...(collectionError ? { message_collection_error: formatDiagnosticError(collectionError) } : {}),
      attempts: 0,
      started_at: Date.now(),
    }
    nextState.lease_expires_at = Date.now() + 10 * 60 * 1000
    nextState.updated_at = Date.now()
    await writeTaskState(stateDir, nextState)
    await appendEvent(stateDir, state.task_id, { type: "plan_runner_waiting_for_children", child_session_ids: nextState.root_wait.child_session_ids })
    return
  }

  if (collectionError) {
    const currentState = await readTaskState(stateDir, state.task_id) || state
    if (currentState.status === "interrupted" && currentState.plan_runner_terminal_error_at) return
    const failed = cloneState(currentState)
    failed.status = "interrupted"
    failed.plan_runner_error = {
      message: formatDiagnosticError(collectionError),
      at: Date.now(),
    }
    failed.plan_runner_terminal_error_at = failed.plan_runner_error.at
    failed.updated_at = failed.plan_runner_error.at
    await writeTaskState(stateDir, failed)
    await appendEvent(stateDir, state.task_id, {
      type: "plan_runner_final_message_collection_failed",
      session_id: sessionID,
      error: failed.plan_runner_error.message,
    })
    await notifyParentTerminalResultIfReady({ stateDir, client, directory: failed.origin_worktree, state: failed })
    return
  }
  if (!message) return
  const messageID = assistantMessageID(message)
  if (state.root_wait?.status === "awake" && state.root_wait.last_assistant_message_id && messageID === state.root_wait.last_assistant_message_id) return
  if (state.root_wait?.status === "awake" && messageID && !assistantMessageCompleted(message)) return
  const text = extractTextFromMessageInfo(message.info || {})
    || (message.parts || []).map(extractTextFromMessagePart).filter(Boolean).join("\n")
  const nextState = cloneState(state)
  nextState.status = "blocked"
  nextState.blocker = text
    ? { code: "plan_runner_stopped_before_finish_plan", final_text: text }
    : { code: "plan_runner_empty_response", message: "Plan-runner returned an empty response before finish_plan; the run was blocked." }
  nextState.plan_runner_terminal_idle_at = Date.now()
  nextState.updated_at = Date.now()
  await writeTaskState(stateDir, nextState)
  await appendEvent(stateDir, state.task_id, {
    type: nextState.blocker.code,
    ...(text ? { final_text: text } : { message: nextState.blocker.message }),
  })
  await notifyParentTerminalResultIfReady({ stateDir, client, directory: nextState.origin_worktree, state: nextState })
}

async function handlePlanRunnerSessionError({ stateDir, client, event }) {
  if (event.type !== "session.error") return
  const sessionID = event.properties?.sessionID
  if (!sessionID) return
  const index = await readSessionIndex(stateDir, sessionID)
  if (!index || index.role !== "plan-runner") return
  const state = await readTaskState(stateDir, index.task_id)
  if (!state) return

  if (TERMINAL_COMPLETION_GATE_STATUSES.has(state.status)) {
    if (state.plan_runner_terminal_error_at) return
    const nextState = cloneState(state)
    nextState.plan_runner_error = {
      message: formatDiagnosticError(event.properties?.error),
      at: Date.now(),
    }
    nextState.plan_runner_terminal_error_at = nextState.plan_runner_error.at
    nextState.updated_at = nextState.plan_runner_error.at
    await writeTaskState(stateDir, nextState)
    await appendEvent(stateDir, state.task_id, {
      type: "plan_runner_terminal_error",
      session_id: sessionID,
      error: nextState.plan_runner_error.message,
      terminal_status: state.status,
    })
    await notifyParentTerminalResultIfReady({ stateDir, client, directory: nextState.origin_worktree, state: nextState })
    return
  }

  const nextState = cloneState(state)
  nextState.status = "interrupted"
  nextState.plan_runner_error = {
    message: formatDiagnosticError(event.properties?.error),
    at: Date.now(),
  }
  nextState.plan_runner_terminal_error_at = nextState.plan_runner_error.at
  nextState.updated_at = nextState.plan_runner_error.at
  await writeTaskState(stateDir, nextState)
  await appendEvent(stateDir, state.task_id, {
    type: "plan_runner_error",
    session_id: sessionID,
    error: nextState.plan_runner_error.message,
  })
  await notifyParentTerminalResultIfReady({ stateDir, client, directory: nextState.origin_worktree, state: nextState })
}

async function handlePlanRunnerWatchdogIdle({ stateDir, client, directory, event }) {
  if (event.type !== "session.idle") return
  const sessionID = event.properties?.sessionID
  if (!sessionID || !client?.session?.prompt) return

  const index = await readSessionIndex(stateDir, sessionID)
  if (!index || index.role !== "plan-runner") return
  let state = await readTaskState(stateDir, index.task_id)
  if (state && !state.task_id) state = { ...state, task_id: index.task_id }
  if (!shouldSendWatchdogNudge(state, sessionID)) return

  const nextState = cloneState(state)
  nextState.watchdog_nudge = {
    count: watchdogNudgeCount(nextState) + 1,
    last_sent_at: Date.now(),
  }
  nextState.updated_at = Date.now()
  await writeTaskState(stateDir, nextState)

  try {
    const query = { directory: directory || state.worktree }
    const prompted = await client.session.prompt({
      path: { id: sessionID },
      query,
      body: {
        agent: "plan-runner",
        parts: [{ type: "text", text: watchdogNudgePromptText(state) }],
      },
    })
    throwIfSdkError(prompted, "watchdog nudge prompt failed")
  } catch (error) {
    await appendEvent(stateDir, index.task_id, { type: "watchdog_nudge_failed", session_id: sessionID, count: nextState.watchdog_nudge.count, error: formatDiagnosticError(error) })
    return
  }

  await appendEvent(stateDir, index.task_id, { type: "watchdog_nudge_sent", session_id: sessionID, count: nextState.watchdog_nudge.count })
}

async function recordAuditDispatchFailure({ stateDir, client, directory, sessionID, state, error, auditSessionID = null, externalReview }) {
  const failedState = cloneState(state)
  const reason = formatDiagnosticError(error)

  if (auditSessionID) {
    const childSessions = Array.isArray(failedState.child_sessions) ? failedState.child_sessions : []
    failedState.child_sessions = childSessions.filter((item) => item.session_id !== auditSessionID)
    failedState.child_sessions.push({ session_id: auditSessionID, role: "audit", status: "orphaned" })
  }

  const event = {
    type: "audit_dispatch_failed",
    session_id: sessionID,
    error: reason,
  }
  if (auditSessionID) event.orphan_session_id = auditSessionID

  try {
    if (shouldFailOpenGate(failedState, "audit_review")) {
      await failOpenGate({ stateDir, state: failedState, source: "audit_review", reasons: [reason] })
      await writeTaskState(stateDir, failedState)
      await appendEvent(stateDir, state.task_id, event)
      await runExternalReview({ stateDir, client, directory, state: failedState, externalReview })
      return
    }

    recordGateFailure(failedState, "audit_review", [reason])
    failedState.status = "repairing"
    failedState.reviews.round += 1
    rememberCompletionGateResult(failedState, "repair_required", "audit_review", [reason])
    failedState.updated_at = Date.now()
    await writeTaskState(stateDir, failedState)
    await appendEvent(stateDir, state.task_id, event)
    await appendEvent(stateDir, state.task_id, { type: "audit_review_repair_required", reasons: [reason] })
  } catch (recordError) {
    console.error("plan-runner audit failure recording failed", formatDiagnosticError(recordError))
  }
}

async function dispatchAuditReview({ stateDir, client, directory, sessionID, state, externalReview }) {
  if (!client?.session?.create || !client?.session?.prompt) {
    await recordAuditDispatchFailure({ stateDir, client, directory, sessionID, state, error: "session create/prompt unavailable", externalReview })
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
    await recordAuditDispatchFailure({ stateDir, client, directory, sessionID, state, error, auditSessionID, externalReview })
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
  const state = await readTaskStateForSession(stateDir, sessionID, ["plan-runner", "child"])
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
  if (Array.isArray(state.tasks)) {
    const task = findTask(state, taskIDs[0])
    if (!task) return
    task.evidence = (task.evidence || []).filter((item) => item.id !== evidence.id)
    task.evidence.push(evidence)
  }
  state.updated_at = Date.now()
  await writeTaskState(stateDir, state)
  await appendEvent(stateDir, state.task_id, { type: "evidence_recorded", evidence_id: evidence.id, event_id: eventID, task_id: taskIDs[0] })
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
    await dispatchAuditReview({ stateDir, client, directory, sessionID, state, externalReview })
    return
  }

  if (shouldFailOpenGate(state, "deterministic_check")) {
    await failOpenGate({ stateDir, state, source: "deterministic_check", reasons })
    if ((state.reviews.audit || []).length) {
      await writeTaskState(stateDir, state)
      await runExternalReview({ stateDir, client, directory, state, externalReview })
      return
    }

    state.status = "audit_review"
    state.updated_at = Date.now()
    await writeTaskState(stateDir, state)
    await dispatchAuditReview({ stateDir, client, directory, sessionID, state, externalReview })
    return
  }

  state.status = "repairing"
  await promptRepair({ stateDir, state, source: "deterministic_check", reasons })
  await appendEvent(stateDir, state.task_id, { type: "repair_required", session_id: sessionID, reasons })
}

async function completeSelfCheck({ stateDir, sessionID, state, boundary }) {
  state.self_check.status = "completed"
  state.updated_at = Date.now()
  await writeTaskState(stateDir, state)
  await appendEvent(stateDir, state.task_id, { type: "self_check_completed", session_id: sessionID, boundary })
}

async function startTaskTool(args, context, stateDir) {
  if (context.agent !== "plan-runner") throw new Error("start_task is only available to the plan-runner agent")
  const sessionIndex = await readSessionIndex(stateDir, context.sessionID)
  if (!sessionIndex) throw new Error("start_task session is not bound to a plan-runner task")
  const state = await readTaskState(stateDir, sessionIndex.task_id)
  if (!state) throw new Error("start_task task state is not readable")
  if (state.plan_runner_session_id !== context.sessionID) throw new Error("start_task must run in the bound plan-runner session")
  if (state.active_task) throw new Error(`active task is already running: ${state.active_task}`)

  const task = findTask(state, args?.id)
  if (!task) throw new Error(`unknown plan task: ${args?.id}`)
  if (task.status !== "pending") throw new Error(`start_task requires pending status for ${task.id}, got ${task.status}`)

  updateTask(state, task.id, { status: "in_progress" })
  state.active_task = task.id
  state.status = "executing"
  state.updated_at = Date.now()
  await writeTaskState(stateDir, state)
  await appendEvent(stateDir, state.task_id, { type: "task_started", task_id: task.id })
  return { output: `task started: ${task.id}`, metadata: { task_id: state.task_id, active_task: task.id } }
}

async function completeTaskTool(args, context, stateDir) {
  if (context.agent !== "plan-runner") throw new Error("complete_task is only available to the plan-runner agent")
  const sessionIndex = await readSessionIndex(stateDir, context.sessionID)
  if (!sessionIndex) throw new Error("complete_task session is not bound to a plan-runner task")
  const state = await readTaskState(stateDir, sessionIndex.task_id)
  if (!state) throw new Error("complete_task task state is not readable")
  if (state.plan_runner_session_id !== context.sessionID) throw new Error("complete_task must run in the bound plan-runner session")
  if (state.active_task !== args?.id) throw new Error(`complete_task requires active task ${state.active_task || "none"}, got ${args?.id}`)

  updateTask(state, args.id, { status: "completed" })
  state.active_task = null
  state.updated_at = Date.now()
  await writeTaskState(stateDir, state)
  await appendEvent(stateDir, state.task_id, { type: "task_completed", task_id: args.id })
  return { output: `task completed: ${args.id}`, metadata: { task_id: state.task_id, completed_task: args.id } }
}

async function getPlanRunnerStatusTool(args, context, stateDir) {
  const taskID = String(args?.task_id || "")
  if (!taskID || safeId(taskID) !== taskID) throw new Error("get_plan_runner_status requires a safe task id")
  const state = await readTaskState(stateDir, taskID)
  if (!state) throw new Error(`plan-runner task not found: ${taskID}`)
  if (state.parent_session_id !== context.sessionID) throw new Error("plan-runner task is not owned by this parent session")
  const summary = {
    task_id: state.task_id,
    status: state.status,
    session_id: state.plan_runner_session_id || null,
    origin_worktree: state.origin_worktree || null,
    worktree: state.worktree || null,
    branch: state.branch || null,
    base_commit: state.base_commit || state.git_base || null,
    active_task: state.active_task || null,
    task_counts: {
      total: (state.tasks || []).length,
      completed: (state.tasks || []).filter((task) => task.status === "completed").length,
      in_progress: (state.tasks || []).filter((task) => task.status === "in_progress").length,
    },
    completion_gate: state.completion_gate || null,
    blocker: state.blocker || null,
    plan_runner_error: state.plan_runner_error || null,
    root_wait: state.root_wait || null,
    parent_notification: state.parent_notification || null,
    runtime_disposal: state.runtime_disposal || null,
    updated_at: state.updated_at || null,
  }
  return {
    output: `Plan-runner task ${summary.task_id}: ${summary.status}`,
    metadata: summary,
  }
}

async function startPlanRunnerTool(args, context, stateDir, { client, directory, enqueueState }) {
  if (!client?.session?.create || !client?.session?.promptAsync) {
    throw new Error("start_plan_runner requires client.session.create and client.session.promptAsync")
  }
  const prompt = String(args?.prompt || "").trim()
  if (!prompt) throw new Error("start_plan_runner requires prompt")

  const parentSessionID = context.sessionID
  const taskID = planRunnerToolTaskID(parentSessionID)
  const originWorktree = directory || context.worktree || context.directory || process.cwd()
  const originGit = await inspectGitWorktree(originWorktree)
  const run = await createPlanRunnerWorktree(taskID, originWorktree, originGit)
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
  await enqueueState(() => appendParentTaskID(stateDir, parentSessionID, taskID))
  await appendEvent(stateDir, taskID, {
    type: "dispatch_started",
    session_id: parentSessionID,
    tool: "start_plan_runner",
    worktree: run.worktree,
    branch: run.branch,
    base_commit: run.base_commit,
  })

  const query = { directory: run.worktree }
  let planRunnerSessionID
  let nextState
  let created
  try {
    created = await client.session.create({
      query,
      body: {
        parentID: parentSessionID,
        title: `plan-runner: ${taskID}`,
      },
    })
  } catch (error) {
    await recordStartPlanRunnerDispatchUnknown({ stateDir, taskID, phase: "session_create", error })
    throw error
  }
  try {
    throwIfSdkError(created, "plan-runner session create failed")
    planRunnerSessionID = sessionIDFromCreateResult(created)
    if (!planRunnerSessionID) throw new Error("plan-runner session id missing")

    nextState = await readTaskState(stateDir, taskID)
    nextState.plan_runner_session_id = planRunnerSessionID
    nextState.status = "planning_required"
    nextState.updated_at = Date.now()
    nextState.lease_expires_at = Date.now() + 10 * 60 * 1000
    await writeTaskState(stateDir, nextState)
    await writeSessionIndex(stateDir, planRunnerSessionID, taskID, "plan-runner")

  } catch (error) {
    await recordStartPlanRunnerDispatchFailure({ stateDir, taskID, phase: "session_create", error })
    throw error
  }

  let dispatched
  try {
    dispatched = await client.session.promptAsync({
      path: { id: planRunnerSessionID },
      query,
      body: {
        agent: "plan-runner",
        parts: [{ type: "text", text: ensurePlanRunnerStartPrompt(prompt, nextState) }],
      },
    })
  } catch (error) {
    await recordStartPlanRunnerDispatchUnknown({ stateDir, taskID, phase: "prompt_async", error })
    throw error
  }
  try {
    throwIfSdkError(dispatched, "plan-runner async prompt dispatch failed")
  } catch (error) {
    await recordStartPlanRunnerDispatchFailure({ stateDir, taskID, phase: "prompt_async", error })
    throw error
  }
  await appendEvent(stateDir, taskID, { type: "plan_runner_dispatch_accepted", session_id: planRunnerSessionID, tool: "start_plan_runner" })

  return {
    output: "Plan-Runner 已后台派发，终态将异步通知；请勿主动轮询。",
    metadata: {
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
    },
  }
}

function dispatchChildPromptText(state, child, description, userPrompt) {
  const task = activeTask(state)
  return [
    ensureHarnessMarker(userPrompt, state.task_id),
    "",
    `Active task: ${child.task_id}${task ? ` - ${task.title}` : ""}`,
    `Assigned child worktree: ${child.worktree}`,
    `Child branch: ${child.branch}`,
    `Child base commit: ${child.base_commit}`,
    `Root plan task: ${state.task_id}`,
    `Dispatch description: ${description}`,
    "Use the assigned child worktree for all file operations and bash workdir values.",
    "Do not modify the main workspace or any other child worktree.",
    "Do not dispatch nested plan-runners or subagents with plan-runner agent.",
    "Do not set the root plan task status. Only return task-level results.",
    `Return a concise outcome with files touched, commands run, validation output, blockers, and risks.`,
  ].join("\n").trim()
}

async function dispatchChildTool(args, context, stateDir, { client }) {
  if (context.agent !== "plan-runner") throw new Error("dispatch_child is only available to the plan-runner agent")

  const description = String(args?.description || "").trim()
  if (!description) throw new Error("dispatch_child requires description")
  const prompt = String(args?.prompt || "").trim()
  if (!prompt) throw new Error("dispatch_child requires prompt")

  const sessionIndex = await readSessionIndex(stateDir, context.sessionID)
  if (!sessionIndex) throw new Error("dispatch_child session is not bound to a plan-runner task")
  const state = await readTaskState(stateDir, sessionIndex.task_id)
  if (!state) throw new Error("dispatch_child task state is not readable")
  if (state.plan_runner_session_id !== context.sessionID) throw new Error("dispatch_child must run in the bound plan-runner session")
  if (!Array.isArray(state.tasks)) throw new Error("dispatch_child requires structured tasks")
  const task = activeTask(state)
  if (!task) throw new Error("dispatch_child requires an active task")

  const callID = context.callID || `dispatch_child_${randomUUID()}`
  const worktree = await createChildWorktree(stateDir, state, callID)

  const child = {
    call_id: callID,
    session_id: null,
    role: "executor",
    status: "dispatching",
    task_id: task.id,
    ...worktree,
  }

  state.child_sessions = (state.child_sessions || []).filter((item) => item.call_id !== callID)
  state.child_sessions.push(child)
  state.updated_at = Date.now()
  await writeTaskState(stateDir, state)
  await appendEvent(stateDir, state.task_id, {
    type: "child_worktree_created",
    call_id: callID,
    task_id: task.id,
    worktree: child.worktree,
    branch: child.branch,
    base_commit: child.base_commit,
  })

  const query = { directory: child.worktree }
  let childSessionID
  let created
  try {
    created = await client.session.create({
      query,
      body: {
        parentID: state.plan_runner_session_id,
        title: `plan-runner child: ${description}`,
      },
    })
  } catch (error) {
    child.dispatch_delivery = {
      status: "unknown",
      phase: "session_create",
      error: formatDiagnosticError(error),
      at: Date.now(),
    }
    const current = await readTaskState(stateDir, state.task_id)
    if (current) {
      current.child_sessions = (current.child_sessions || []).map((item) => (
        item.call_id === callID ? child : item
      ))
      current.updated_at = Date.now()
      await writeTaskState(stateDir, current)
      await appendEvent(stateDir, current.task_id, {
        type: "child_dispatch_delivery_unknown",
        call_id: callID,
        phase: "session_create",
        error: child.dispatch_delivery.error,
      })
    }
    throw error
  }
  try {
    throwIfSdkError(created, "dispatch_child session create failed")
    childSessionID = sessionIDFromCreateResult(created)
    if (!childSessionID) throw new Error("dispatch_child session id missing")

    const next = await readTaskState(stateDir, state.task_id)
    child.session_id = childSessionID
    child.status = "starting"
    next.child_sessions = (next.child_sessions || []).map((item) => (
      item.call_id === callID ? child : item
    ))
    next.updated_at = Date.now()
    await writeTaskState(stateDir, next)
    await writeSessionIndex(stateDir, childSessionID, state.task_id, "child")
  } catch (error) {
    const current = await readTaskState(stateDir, state.task_id)
    if (current) {
      current.child_sessions = (current.child_sessions || []).map((item) => (
        item.call_id === callID ? { ...child, status: "failed", session_id: child.session_id || null } : item
      ))
      current.updated_at = Date.now()
      await writeTaskState(stateDir, current)
      await appendEvent(stateDir, current.task_id, {
        type: "child_dispatch_failed",
        call_id: callID,
        phase: "session_create",
        error: formatDiagnosticError(error),
      })
    }
    throw error
  }

  let dispatched
  try {
    const awake = await readTaskState(stateDir, state.task_id)
    dispatched = await client.session.promptAsync({
      path: { id: childSessionID },
      query,
      body: {
        agent: "executor",
        parts: [{ type: "text", text: dispatchChildPromptText(awake, child, description, prompt) }],
      },
    })
  } catch (error) {
    const current = await readTaskState(stateDir, state.task_id)
    if (current) {
      current.child_sessions = (current.child_sessions || []).map((item) => {
        if (item.call_id !== callID) return item
        return {
          ...item,
          session_id: childSessionID,
          status: "starting",
          dispatch_delivery: {
            status: "unknown",
            phase: "prompt_async",
            error: formatDiagnosticError(error),
            at: Date.now(),
          },
        }
      })
      current.updated_at = Date.now()
      await writeTaskState(stateDir, current)
      await appendEvent(stateDir, current.task_id, {
        type: "child_dispatch_delivery_unknown",
        call_id: callID,
        session_id: childSessionID,
        phase: "prompt_async",
        error: current.child_sessions.find((item) => item.call_id === callID).dispatch_delivery.error,
      })
    }
    throw error
  }
  try {
    throwIfSdkError(dispatched, "dispatch_child async prompt dispatch failed")
  } catch (error) {
    const current = await readTaskState(stateDir, state.task_id)
    if (current) {
      current.child_sessions = (current.child_sessions || []).map((item) => (
        item.call_id === callID ? { ...item, session_id: childSessionID, status: "failed" } : item
      ))
      current.updated_at = Date.now()
      await writeTaskState(stateDir, current)
      await appendEvent(stateDir, current.task_id, {
        type: "child_dispatch_failed",
        call_id: callID,
        session_id: childSessionID,
        phase: "prompt_async",
        error: formatDiagnosticError(error),
      })
    }
    throw error
  }

  const accepted = await readTaskState(stateDir, state.task_id)
  accepted.child_sessions = (accepted.child_sessions || []).map((item) => (
    item.call_id === callID ? { ...item, session_id: childSessionID, status: "running" } : item
  ))
  accepted.updated_at = Date.now()
  await writeTaskState(stateDir, accepted)
  await appendEvent(stateDir, accepted.task_id, {
    type: "child_dispatch_accepted",
    call_id: callID,
    session_id: childSessionID,
    tool: "dispatch_child",
  })

  return {
    output: "Child executor session dispatched asynchronously.",
    metadata: {
      task_id: child.task_id,
      dispatch_status: "accepted",
      session_id: childSessionID,
      sessionId: childSessionID,
      parentSessionId: state.plan_runner_session_id,
      background: true,
      worktree: child.worktree,
      branch: child.branch,
      base_commit: child.base_commit,
    },
  }
}

async function writePlanTool(args, context, stateDir) {
  if (context.agent !== "plan-runner") throw new Error("write_plan is only available to the plan-runner agent")

  const sessionIndex = await readSessionIndex(stateDir, context.sessionID)
  if (!sessionIndex) throw new Error("write_plan session is not bound to a plan-runner task")

  const state = await readTaskState(stateDir, sessionIndex.task_id)
  if (!state) throw new Error("write_plan task state is not readable")
  if (state.status !== "planning_required") throw new Error(`write_plan requires planning_required status, got ${state.status}`)

  const markdown = String(args?.content || "")
  if (markdown.trim()) {
    const planPath = statePaths(stateDir, state.task_id).plan
    await ensureDir(dirname(planPath))
    await writeFile(planPath, markdown)

    state.plan_path = planPath
    state.plan_sha256 = sha256(markdown)
  }

  const tasks = normalizePlanTasks(args?.tasks)
  state.version = STATE_VERSION
  state.status = "ready_to_execute"
  state.updated_at = Date.now()
  state.lease_expires_at = Date.now() + 10 * 60 * 1000
  state.tasks = tasks
  state.active_task = null
  delete state.todo
  delete state.plan_contract
  await writeTaskState(stateDir, state)
  await appendEvent(stateDir, state.task_id, { type: "plan_contract_written", task_count: tasks.length, plan_path: state.plan_path || null })

  return {
    output: `task contract written: ${tasks.length} tasks`,
    metadata: {
      task_id: state.task_id,
      task_count: tasks.length,
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
  let stateQueue = Promise.resolve()
  const pendingChildTerminals = new Map()
  const pendingChildDispatchCalls = new Set()

  function enqueueState(handler) {
    const run = stateQueue.then(handler)
    stateQueue = run.catch(() => {})
    return run
  }

  return {
    tool: {
      start_plan_runner: tool({
        description: "Start a plan-runner session in a dedicated harness-owned git worktree.",
        args: {
          prompt: tool.schema.string().min(1),
        },
        execute: (args, context) => startPlanRunnerTool(args, context, stateDir, { client, directory: worktree, enqueueState }),
      }),
      dispatch_child: tool({
        description: "Dispatch a child executor subagent in a dedicated git worktree bound to an active structured plan task.",
        args: {
          description: tool.schema.string().min(1),
          prompt: tool.schema.string().min(1),
        },
        execute: (args, context) => enqueueState(() => dispatchChildTool(args, context, stateDir, { client })),
      }),
      get_plan_runner_status: tool({
        description: "Read a parent-owned plan-runner task status summary.",
        args: {
          task_id: tool.schema.string().min(1),
        },
        execute: (args, context) => getPlanRunnerStatusTool(args, context, stateDir),
      }),
      write_plan: tool({
        description: "Write the structured plan-runner task contract and advance harness state.",
        args: {
          content: tool.schema.string().optional(),
          tasks: tool.schema.array(tool.schema.object({})).min(1),
        },
        execute: (args, context) => writePlanTool(args, context, stateDir),
      }),
      start_task: tool({
        description: "Mark one structured plan-runner task as in progress.",
        args: {
          id: tool.schema.string().min(1),
        },
        execute: (args, context) => startTaskTool(args, context, stateDir),
      }),
      complete_task: tool({
        description: "Mark the active structured plan-runner task as completed.",
        args: {
          id: tool.schema.string().min(1),
        },
        execute: (args, context) => completeTaskTool(args, context, stateDir),
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

    "tool.definition": async (input, output) => {
      ensureChildWorktreeTaskToolDescription(input, output)
    },

    "tool.execute.before": async (input, output) => enqueueState(async () => {
      const sessionIndex = await readSessionIndex(stateDir, input.sessionID)
      if (input.tool === "task" && isPlanRunnerDispatch(output?.args)) {
        if (sessionIndex?.role === "plan-runner") throw new Error("plan-runner cannot dispatch another plan-runner with native task")
        throw new Error("Use start_plan_runner instead of native task for plan-runner dispatch")
      }
      if (sessionIndex?.role === "child") {
        await enforceChildSessionGate(stateDir, input, output, sessionIndex)
        return
      }
      if (input.tool === "task" && sessionIndex?.role === "plan-runner") {
        await enforcePhaseGate(stateDir, input, output)
        await prepareChildDispatch(stateDir, input, output, sessionIndex)
        pendingChildDispatchCalls.add(input.callID)
        return
      }
      if (input.tool !== "task" || !isPlanRunnerDispatch(output.args)) {
        await enforcePhaseGate(stateDir, input, output)
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
      const briefContent = String(output.args.prompt || "")
      const paths = statePaths(stateDir, taskID)
      await ensureDir(dirname(paths.brief))
      await writeFile(paths.brief, briefContent)
      state.brief_path = paths.brief
      state.brief_sha256 = sha256(briefContent)
      if (blocker) {
        await blockPlanRunnerDispatch({ stateDir, state, parentSessionID: input.sessionID, blocker })
      }
      await writeTaskState(stateDir, state)
      await writeSessionIndex(stateDir, input.sessionID, taskID, "parent")
      await appendEvent(stateDir, taskID, { type: "dispatch_started", session_id: input.sessionID, call_id: input.callID })
      output.args.prompt = ensureHarnessMarker(output.args.prompt, taskID)
    }),

    "tool.execute.after": async (input, output) => enqueueState(async () => {
      const sessionIndex = await readSessionIndex(stateDir, input.sessionID)
      if (input.tool === "task" && sessionIndex?.role === "plan-runner") {
        await bindChildDispatch(stateDir, client, input, output, sessionIndex, pendingChildTerminals)
        pendingChildDispatchCalls.delete(input.callID)
        if (pendingChildDispatchCalls.size === 0) pendingChildTerminals.clear()
        return
      }
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
    }),

    event: async ({ event }) => {
      if ((event.type === "session.idle" || event.type === "session.error") && event.properties?.sessionID) {
        const sessionID = event.properties.sessionID
        const index = await readSessionIndex(stateDir, sessionID)
        if (!index && pendingChildDispatchCalls.size > 0) {
          const existing = pendingChildTerminals.get(sessionID)
          if (pendingChildTerminals.size >= 64) pendingChildTerminals.delete(pendingChildTerminals.keys().next().value)
          if (existing?.type === "session.error" && event.type === "session.idle") return
          pendingChildTerminals.set(sessionID, {
            type: event.type,
            error: event.type === "session.error" ? formatDiagnosticError(event.properties?.error) : null,
            at: Date.now(),
          })
        }
      }
      return enqueueState(async () => {
        await handleSessionDiff(stateDir, event)
        await handleMessageDiff(stateDir, event)
        await handleAuditReviewMessage(stateDir, event)
        await handleChildSessionIdle({ stateDir, client, event })
        await handleAuditReviewIdle({ stateDir, client, directory: worktree, event, externalReview })
        await handleParentSessionIdle({ stateDir, client, directory: worktree, event })
        await handlePlanRunnerTerminalIdle({ stateDir, client, event })
        await handlePlanRunnerSessionError({ stateDir, client, event })
        await handleChildSessionError({ stateDir, client, event })
        await handlePlanRunnerWatchdogIdle({ stateDir, client, directory: worktree, event })
      })
    },
  }
}

export default PlanRunnerHarnessPlugin
