import { spawn, spawnSync } from "node:child_process"
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs"
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
  spawnSync("sleep", [String(ms / 1000)])
}

function waitForServer({ logPath, port, process, timeoutMs }) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (process.exitCode != null) return false
    if (existsSync(logPath)) {
      const log = readFileSync(logPath, "utf8")
      if (log.includes(`http://127.0.0.1:${port}`)) return true
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

  waitForRepairEvidence(paths.logPath, Math.min(postRunWaitMs, timeoutMs))

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

function parseArgs(argv) {
  const options = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--root") options.root = argv[++i]
    else if (arg === "--model") options.model = argv[++i]
    else if (arg === "--timeout-ms") options.timeoutMs = Number(argv[++i])
    else if (arg === "--dry-run") options.dryRun = true
    else if (arg === "--help" || arg === "-h") options.help = true
  }
  return options
}

function usage() {
  return `Usage: node ${basename(fileURLToPath(import.meta.url))} [--dry-run] [--root DIR] [--model provider/model] [--timeout-ms N]`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
  } else if (options.dryRun) {
    console.log(JSON.stringify(createProbeWorkspace({ root: options.root }), null, 2))
  } else {
    const result = runProbe(options)
    console.log(JSON.stringify(result, null, 2))
    process.exitCode = result.status ?? (result.signal ? 1 : 0)
  }
}
