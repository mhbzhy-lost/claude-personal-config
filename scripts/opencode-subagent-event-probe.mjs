import { spawn, spawnSync } from "node:child_process"
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { fileURLToPath } from "node:url"

const DEFAULT_PROMPT = `
This is an OpenCode subagent event probe.

Do these steps exactly:
1. Use the task tool once with background=true. Ask the child agent to run bash command: printf PROBE_SUBAGENT_OK
2. Run bash command: printf PROBE_ROOT_OK
3. Try to run bash command: printf __PROBE_BLOCK_ME__
4. If that command is blocked, report the block briefly and stop.

If you later receive a message containing PROBE_VALIDATE_FIX, run bash command: printf PROBE_REPAIR_OK and then stop.
`.trim()

const sleepArray = new Int32Array(new SharedArrayBuffer(4))

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true })
}

function pluginSource() {
  return String.raw`import { appendFileSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"

const logPath = process.env.OPENCODE_SUBAGENT_EVENT_PROBE_LOG
const promptOnIdle = process.env.OPENCODE_SUBAGENT_EVENT_PROBE_PROMPT_ON_IDLE === "1"
const promptedSessions = new Set()

function sanitize(value) {
  try {
    return JSON.parse(JSON.stringify(value, (_key, current) => {
      if (typeof current === "function") return "[Function]"
      if (typeof current === "bigint") return String(current)
      return current
    }))
  } catch (error) {
    return { unserializable: true, message: String(error?.message || error) }
  }
}

function record(kind, payload = {}) {
  if (!logPath) return
  mkdirSync(dirname(logPath), { recursive: true })
  appendFileSync(logPath, JSON.stringify({ ts: Date.now(), kind, ...sanitize(payload) }) + "\n")
}

function getSessionID(event) {
  return event?.properties?.info?.id || event?.properties?.sessionID || event?.properties?.id || event?.properties?.session?.id || null
}

async function promptSession(client, directory, sessionID) {
  if (!promptOnIdle || !sessionID || promptedSessions.has(sessionID)) return
  promptedSessions.add(sessionID)

  try {
    await client.session.promptAsync({
      path: { id: sessionID },
      query: { directory },
      body: {
        parts: [
          {
            type: "text",
            text: "PROBE_VALIDATE_FIX: validation failed after idle. Continue in this same session and run bash: printf PROBE_REPAIR_OK",
          },
        ],
      },
    })
    record("validate.prompt_async.ok", { sessionID })
  } catch (error) {
    record("validate.prompt_async.error", { sessionID, error: String(error?.message || error) })
  }
}

function logHook(name) {
  return async (input, output) => {
    record(name, { input, output })
  }
}

export default async ({ client, directory }) => {
  record("plugin.init", {
    directory,
    clientKeys: Object.keys(client || {}),
    sessionKeys: Object.keys(client?.session || {}),
  })

  return {
    config: (config) => {
      record("config", { config })
    },
    event: async ({ event }) => {
      record("event", { event })
      if (event?.type === "session.idle") {
        await promptSession(client, directory, getSessionID(event))
      }
    },
    "chat.message": logHook("chat.message"),
    "chat.params": logHook("chat.params"),
    "chat.headers": logHook("chat.headers"),
    "tool.definition": logHook("tool.definition"),
    "tool.execute.before": async (input, output) => {
      record("tool.execute.before", { input, output })
      const command = output?.args?.command || input?.args?.command || ""
      if (input?.tool === "bash" && command.includes("__PROBE_BLOCK_ME__")) {
        record("tool.execute.before.blocked", { tool: input.tool, command })
        throw new Error("[probe-block] blocked __PROBE_BLOCK_ME__")
      }
    },
    "tool.execute.after": logHook("tool.execute.after"),
    "command.execute.before": logHook("command.execute.before"),
    "shell.env": logHook("shell.env"),
    "permission.ask": logHook("permission.ask"),
    "experimental.chat.messages.transform": logHook("experimental.chat.messages.transform"),
    "experimental.chat.system.transform": logHook("experimental.chat.system.transform"),
    "experimental.session.compacting": logHook("experimental.session.compacting"),
    "experimental.compaction.autocontinue": logHook("experimental.compaction.autocontinue"),
    "experimental.text.complete": logHook("experimental.text.complete"),
  }
}
`
}

function agentSource() {
  return `---
description: Probe subagent that runs the exact requested shell command.
mode: subagent
permission:
  bash: allow
  edit: deny
  write: deny
  task: deny
---

You are a probe worker. Run only the exact bash command requested by the parent, report the output, and stop.
`
}

function auditChildPluginSource() {
  return String.raw`import { appendFileSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"

const logPath = process.env.OPENCODE_AUDIT_CHILD_PROBE_LOG
const auditAgent = process.env.OPENCODE_AUDIT_CHILD_PROBE_AGENT || "probe-audit"
let prompted = false
let childSessionID = null

function sanitize(value) {
  try {
    return JSON.parse(JSON.stringify(value, (_key, current) => {
      if (typeof current === "function") return "[Function]"
      if (typeof current === "bigint") return String(current)
      return current
    }))
  } catch (error) {
    return { unserializable: true, message: String(error?.message || error) }
  }
}

function record(kind, payload = {}) {
  if (!logPath) return
  mkdirSync(dirname(logPath), { recursive: true })
  appendFileSync(logPath, JSON.stringify({ ts: Date.now(), kind, ...sanitize(payload) }) + "\n")
}

function sessionIDFromCreateResult(result) {
  const value = result?.data?.id ?? result?.data ?? result?.id
  return typeof value === "object" ? value?.id : value
}

function sdkErrorText(result) {
  if (!result?.error) return null
  const data = result.error?.data || result.error
  return data?.message || data?.name || JSON.stringify(data)
}

function eventSessionID(event) {
  return event?.properties?.sessionID || event?.properties?.info?.sessionID || event?.properties?.message?.sessionID || null
}

export default async ({ client, directory }) => {
  record("plugin.init", {
    directory,
    clientKeys: Object.keys(client || {}),
    sessionKeys: Object.keys(client?.session || {}),
    auditAgent,
  })

  return {
    event: async ({ event }) => {
      record("event", { event })
      const eventSession = eventSessionID(event)
      if (childSessionID && eventSession === childSessionID) {
        if (event?.type === "message.updated") record("audit.child.message_updated", { sessionID: childSessionID })
        if (event?.type === "session.idle") record("audit.child.idle", { sessionID: childSessionID })
      }
      if (prompted || event?.type !== "session.idle") return
      const parentSessionID = event.properties?.sessionID
      if (!parentSessionID) return
      prompted = true

      try {
        const created = await client.session.create({
          query: { directory },
          body: {
            parentID: parentSessionID,
            title: "audit child probe",
          },
        })
        childSessionID = sessionIDFromCreateResult(created)
        const createError = sdkErrorText(created)
        if (createError) {
          record("audit.create.error", { sessionID: childSessionID, result: created, error: createError })
          return
        }
        record("audit.create.ok", { sessionID: childSessionID, result: created })

        const body = {
          parts: [{ type: "text", text: "Return JSON exactly: {\"result\":\"pass\",\"probe\":\"audit-child\"}" }],
        }
        if (auditAgent !== "__omit__") body.agent = auditAgent

        const promptedResult = await client.session.prompt({
          path: { id: childSessionID },
          query: { directory },
          body,
        })
        const promptError = sdkErrorText(promptedResult)
        if (promptError) {
          record("audit.prompt.error", { sessionID: childSessionID, result: promptedResult, error: promptError })
          return
        }
        record("audit.prompt.ok", { sessionID: childSessionID, result: promptedResult })
      } catch (error) {
        record("audit.prompt.throw", {
          sessionID: childSessionID,
          error: String(error?.stack || error?.message || error),
          data: error?.data || error?.response?.data || null,
        })
      }
    },
  }
}
`
}

function auditAgentSource() {
  return `---
description: probe-audit subagent used by the audit child prompt probe.
mode: subagent
permission:
  read: allow
  glob: deny
  grep: deny
  list: deny
  bash: deny
  edit: deny
  write: deny
  task: deny
  todowrite: deny
---

You are probe-audit. Return only the exact JSON requested by the prompt and stop.
`
}

export function createProbeWorkspace({ root } = {}) {
  const workspace = root || join(tmpdir(), `opencode-subagent-probe-${Date.now()}`)
  const opencodeDir = join(workspace, ".opencode")
  const pluginDir = join(opencodeDir, "plugins")
  const agentDir = join(opencodeDir, "agents")
  ensureDir(pluginDir)
  ensureDir(agentDir)

  const configPath = join(opencodeDir, "opencode.json")
  const pluginPath = join(pluginDir, "subagent-event-probe.js")
  const agentPath = join(agentDir, "probe-worker.md")
  const logPath = join(workspace, "probe-events.jsonl")
  const stdoutPath = join(workspace, "opencode-run.stdout")
  const stderrPath = join(workspace, "opencode-run.stderr")
  const serveLogPath = join(workspace, "opencode-serve.log")

  writeFileSync(configPath, JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    permission: "allow",
    plugin: ["./plugins/subagent-event-probe.js"],
  }, null, 2) + "\n")
  writeFileSync(pluginPath, pluginSource())
  writeFileSync(agentPath, agentSource())

  return { workspace, configPath, pluginPath, agentPath, logPath, stdoutPath, stderrPath, serveLogPath }
}

export function createAuditChildProbeWorkspace({ root } = {}) {
  const workspace = root || join(tmpdir(), `opencode-audit-child-probe-${Date.now()}`)
  const opencodeDir = join(workspace, ".opencode")
  const pluginDir = join(opencodeDir, "plugins")
  const agentDir = join(opencodeDir, "agents")
  ensureDir(pluginDir)
  ensureDir(agentDir)

  const configPath = join(opencodeDir, "opencode.json")
  const pluginPath = join(pluginDir, "audit-child-probe.js")
  const agentPath = join(agentDir, "probe-audit.md")
  const logPath = join(workspace, "audit-child-events.jsonl")
  const stdoutPath = join(workspace, "opencode-run.stdout")
  const stderrPath = join(workspace, "opencode-run.stderr")
  const serveLogPath = join(workspace, "opencode-serve.log")

  writeFileSync(configPath, JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    permission: "allow",
    plugin: ["./plugins/audit-child-probe.js"],
  }, null, 2) + "\n")
  writeFileSync(pluginPath, auditChildPluginSource())
  writeFileSync(agentPath, auditAgentSource())

  return { workspace, configPath, pluginPath, agentPath, logPath, stdoutPath, stderrPath, serveLogPath }
}

export function readProbeEvents(logPath) {
  if (!existsSync(logPath)) return []
  return readFileSync(logPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

export function summarizeProbeEvents(events) {
  const kinds = [...new Set(events.map((event) => event.kind))]
  const eventTypes = [...new Set(events.filter((event) => event.kind === "event").map((event) => event.event?.type).filter(Boolean))]
  const toolCalls = events
    .filter((event) => event.kind === "tool.execute.before")
    .map((event) => ({ tool: event.input?.tool, args: event.output?.args || event.input?.args || {} }))
  return {
    kinds,
    eventTypes,
    toolCalls,
    blocked: events.some((event) => event.kind === "tool.execute.before.blocked"),
    promptAsyncOk: events.some((event) => event.kind === "validate.prompt_async.ok"),
    promptAsyncError: events.find((event) => event.kind === "validate.prompt_async.error") || null,
    repairCommandObserved: toolCalls.some((call) => String(call.args?.command || "").includes("PROBE_REPAIR_OK")),
  }
}

function findProbeEvent(events, kinds) {
  return events.find((event) => kinds.includes(event.kind)) || null
}

function probeEventSessionID(event) {
  return event?.event?.properties?.sessionID || event?.event?.properties?.info?.sessionID || event?.event?.properties?.message?.sessionID || null
}

function compactLogExcerpt(text) {
  const value = String(text || "")
  const needles = ["Unexpected server error", "agent not found", "plan-runner-audit", "probe-audit", "ERROR", "Error"]
  const index = needles.map((needle) => value.indexOf(needle)).filter((item) => item >= 0).sort((a, b) => a - b)[0]
  if (index === undefined) return value.slice(-2000)
  return value.slice(Math.max(0, index - 1000), index + 3000)
}

export function summarizeAuditChildProbe({ events = [], dbRows = {}, serveLogText = "" } = {}) {
  const createEvent = findProbeEvent(events, ["audit.create.ok", "audit.create.error"])
  const promptEvent = findProbeEvent(events, ["audit.prompt.ok", "audit.prompt.error", "audit.prompt.throw"])
  const childSessionID = promptEvent?.sessionID || createEvent?.sessionID || null
  const childEvents = events.filter((event) => event.sessionID === childSessionID || probeEventSessionID(event) === childSessionID)
  return {
    create: createEvent?.kind === "audit.create.ok" ? "ok" : createEvent ? "error" : "missing",
    prompt: promptEvent?.kind === "audit.prompt.ok" ? "ok" : promptEvent ? "error" : "missing",
    prompt_error: promptEvent?.error || null,
    child_session_id: childSessionID,
    db: {
      session: Number(dbRows.session || 0),
      message: Number(dbRows.message || 0),
      part: Number(dbRows.part || 0),
      session_input: Number(dbRows.session_input || 0),
      error: dbRows.error || null,
    },
    backflow: {
      message_updated: childEvents.some((event) => event.kind === "audit.child.message_updated" || event.event?.type === "message.updated"),
      idle: childEvents.some((event) => event.kind === "audit.child.idle" || event.event?.type === "session.idle"),
    },
    events: [...new Set(events.map((event) => event.kind))],
    log_excerpt: compactLogExcerpt(serveLogText),
  }
}

export function buildRunArgs({ attachUrl, workspace, model, prompt }) {
  const args = ["run", "--attach", attachUrl, "--dir", workspace, "--format", "json"]
  if (model) args.push("--model", model)
  args.push(prompt)
  return args
}

export function formatServeNotReadyError({ attachUrl, serveLogPath }) {
  return `opencode serve did not become ready on ${attachUrl}; see log: ${serveLogPath}`
}

function sleepMs(ms) {
  Atomics.wait(sleepArray, 0, 0, ms)
}

export function readTextFromOffset(path, offset = 0) {
  const fd = openSync(path, "r")
  try {
    const size = fstatSync(fd).size
    const start = Math.min(offset, size)
    const length = size - start
    if (length === 0) return { text: "", offset: size }
    const buffer = Buffer.alloc(length)
    readSync(fd, buffer, 0, length, start)
    return { text: buffer.toString("utf8"), offset: size }
  } finally {
    closeSync(fd)
  }
}

export function shouldWaitForRepairEvidence(result) {
  return !result.error && !result.signal
}

function waitForServer({ logPath, port, process, timeoutMs }) {
  const start = Date.now()
  let offset = 0
  let recentLog = ""
  while (Date.now() - start < timeoutMs) {
    if (process.exitCode != null) return false
    if (existsSync(logPath)) {
      const next = readTextFromOffset(logPath, offset)
      offset = next.offset
      recentLog = (recentLog + next.text).slice(-4096)
      if (recentLog.includes(`http://127.0.0.1:${port}`)) return true
    }
    sleepMs(100)
  }
  return false
}

function waitForRepairEvidence(logPath, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const summary = summarizeProbeEvents(readProbeEvents(logPath))
    if (summary.promptAsyncOk && summary.repairCommandObserved) return true
    sleepMs(200)
  }
  return false
}

function waitForAuditChildProbe(logPath, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const events = readProbeEvents(logPath)
    if (events.some((event) => ["audit.prompt.error", "audit.prompt.throw", "audit.create.error"].includes(event.kind))) return true
    const summary = summarizeAuditChildProbe({ events })
    if (summary.prompt === "ok" && summary.backflow.message_updated && summary.backflow.idle) return true
    sleepMs(200)
  }
  return false
}

function sqliteQuote(value) {
  return `'${String(value || "").replaceAll("'", "''")}'`
}

export function opencodeDbPathFromEnv(env = process.env) {
  if (env.XDG_DATA_HOME) return join(env.XDG_DATA_HOME, "opencode", "opencode.db")
  return join(homedirFromEnv(env), ".local", "share", "opencode", "opencode.db")
}

function readAuditChildDbRows(sessionID, dbPath = opencodeDbPathFromEnv()) {
  if (!sessionID) return {}
  const quoted = sqliteQuote(sessionID)
  const sql = [
    `select 'session', count(*) from session where id = ${quoted};`,
    `select 'message', count(*) from message where session_id = ${quoted};`,
    `select 'part', count(*) from part where session_id = ${quoted};`,
    `select 'session_input', count(*) from session_input where session_id = ${quoted};`,
  ].join(" ")
  const result = spawnSync("sqlite3", [dbPath, sql], { encoding: "utf8" })
  if (result.error || result.status !== 0) return { error: result.error ? String(result.error.message || result.error) : result.stderr }
  return Object.fromEntries(result.stdout.split("\n").filter(Boolean).map((line) => {
    const [key, count] = line.split("|")
    return [key, Number(count || 0)]
  }))
}

function homedirFromEnv(env = process.env) {
  return env.HOME || env.USERPROFILE || tmpdir()
}

export function runProbe({ root, model, timeoutMs = 180000, prompt = DEFAULT_PROMPT, port = 41337, postRunWaitMs = 30000 } = {}) {
  const paths = createProbeWorkspace({ root })
  const serveOut = openSync(paths.serveLogPath, "a")
  const serveErr = openSync(paths.serveLogPath, "a")
  const serve = spawn("opencode", ["serve", "--port", String(port), "--hostname", "127.0.0.1", "--print-logs", "--log-level", "DEBUG"], {
    cwd: paths.workspace,
    stdio: ["ignore", serveOut, serveErr],
    env: {
      ...process.env,
      OPENCODE_SUBAGENT_EVENT_PROBE_LOG: paths.logPath,
      OPENCODE_SUBAGENT_EVENT_PROBE_PROMPT_ON_IDLE: "1",
    },
  })

  const attachUrl = `http://127.0.0.1:${port}`
  const ready = waitForServer({ logPath: paths.serveLogPath, port, process: serve, timeoutMs: Math.min(timeoutMs, 15000) })
  if (!ready) {
    try { serve.kill() } catch {}
    closeSync(serveOut)
    closeSync(serveErr)
    return {
      ...paths,
      status: 1,
      signal: null,
      error: formatServeNotReadyError({ attachUrl, serveLogPath: paths.serveLogPath }),
      summary: summarizeProbeEvents(readProbeEvents(paths.logPath)),
    }
  }

  const result = spawnSync("opencode", buildRunArgs({ attachUrl, workspace: paths.workspace, model, prompt }), {
    cwd: process.cwd(),
    timeout: timeoutMs,
    encoding: "utf8",
  })

  if (shouldWaitForRepairEvidence(result)) {
    waitForRepairEvidence(paths.logPath, Math.min(postRunWaitMs, timeoutMs))
  }

  try { serve.kill() } catch {}
  closeSync(serveOut)
  closeSync(serveErr)

  writeFileSync(paths.stdoutPath, result.stdout || "")
  writeFileSync(paths.stderrPath, result.stderr || "")

  const events = readProbeEvents(paths.logPath)
  return {
    ...paths,
    status: result.status,
    signal: result.signal,
    error: result.error ? String(result.error.message || result.error) : null,
    summary: summarizeProbeEvents(events),
  }
}

export function runAuditChildProbe({ root, model, timeoutMs = 120000, port = 41338, auditAgent = "probe-audit" } = {}) {
  const paths = createAuditChildProbeWorkspace({ root })
  const serveOut = openSync(paths.serveLogPath, "a")
  const serveErr = openSync(paths.serveLogPath, "a")
  const serve = spawn("opencode", ["serve", "--port", String(port), "--hostname", "127.0.0.1", "--print-logs", "--log-level", "DEBUG"], {
    cwd: paths.workspace,
    stdio: ["ignore", serveOut, serveErr],
    env: {
      ...process.env,
      OPENCODE_AUDIT_CHILD_PROBE_LOG: paths.logPath,
      OPENCODE_AUDIT_CHILD_PROBE_AGENT: auditAgent,
    },
  })

  const attachUrl = `http://127.0.0.1:${port}`
  const ready = waitForServer({ logPath: paths.serveLogPath, port, process: serve, timeoutMs: Math.min(timeoutMs, 15000) })
  if (!ready) {
    try { serve.kill() } catch {}
    closeSync(serveOut)
    closeSync(serveErr)
    return {
      ...paths,
      status: 1,
      signal: null,
      error: formatServeNotReadyError({ attachUrl, serveLogPath: paths.serveLogPath }),
      summary: summarizeAuditChildProbe({ events: readProbeEvents(paths.logPath), serveLogText: existsSync(paths.serveLogPath) ? readFileSync(paths.serveLogPath, "utf8") : "" }),
    }
  }

  const prompt = "Say PROBE_AUDIT_CHILD_PARENT_READY and stop."
  const result = spawnSync("opencode", buildRunArgs({ attachUrl, workspace: paths.workspace, model, prompt }), {
    cwd: process.cwd(),
    timeout: timeoutMs,
    encoding: "utf8",
  })

  if (shouldWaitForRepairEvidence(result)) waitForAuditChildProbe(paths.logPath, Math.min(30000, timeoutMs))

  try { serve.kill() } catch {}
  closeSync(serveOut)
  closeSync(serveErr)

  writeFileSync(paths.stdoutPath, result.stdout || "")
  writeFileSync(paths.stderrPath, result.stderr || "")

  const events = readProbeEvents(paths.logPath)
  const childSessionID = summarizeAuditChildProbe({ events }).child_session_id
  const serveLogText = existsSync(paths.serveLogPath) ? readFileSync(paths.serveLogPath, "utf8") : ""
  return {
    ...paths,
    status: result.status,
    signal: result.signal,
    error: result.error ? String(result.error.message || result.error) : null,
    summary: summarizeAuditChildProbe({ events, dbRows: readAuditChildDbRows(childSessionID), serveLogText }),
  }
}

function requireArgValue(argv, index, arg) {
  const value = argv[index + 1]
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`)
  return value
}

export function parseArgs(argv) {
  const options = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--mode") options.mode = requireArgValue(argv, i++, arg)
    else if (arg === "--root") options.root = requireArgValue(argv, i++, arg)
    else if (arg === "--model") options.model = requireArgValue(argv, i++, arg)
    else if (arg === "--timeout-ms") options.timeoutMs = Number(requireArgValue(argv, i++, arg))
    else if (arg === "--port") options.port = Number(requireArgValue(argv, i++, arg))
    else if (arg === "--audit-agent") options.auditAgent = requireArgValue(argv, i++, arg)
    else if (arg === "--dry-run") options.dryRun = true
    else if (arg === "--help" || arg === "-h") options.help = true
  }
  return options
}

function usage() {
  return `Usage: node ${basename(fileURLToPath(import.meta.url))} [--mode default|audit-child] [--dry-run] [--root DIR] [--model provider/model] [--timeout-ms N] [--port N] [--audit-agent NAME]`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
  } else if (options.dryRun) {
    const paths = options.mode === "audit-child" ? createAuditChildProbeWorkspace({ root: options.root }) : createProbeWorkspace({ root: options.root })
    console.log(JSON.stringify(paths, null, 2))
  } else {
    const result = options.mode === "audit-child" ? runAuditChildProbe(options) : runProbe(options)
    console.log(JSON.stringify(result, null, 2))
    process.exitCode = result.status ?? (result.signal ? 1 : 0)
  }
}
