import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import * as probe from "../opencode-subagent-event-probe.mjs"
import { buildRunArgs, createAuditChildProbeWorkspace, createProbeWorkspace, createPromptAsyncProbeWorkspace, formatServeNotReadyError, parseArgs, promptAsyncProbeExitStatus, readTextFromOffset, shouldStopWaitingForPromptAsyncProbe, shouldWaitForRepairEvidence, summarizeAuditChildProbe, summarizeProbeEvents, summarizePromptAsyncProbe } from "../opencode-subagent-event-probe.mjs"

describe("opencode subagent event probe", () => {
  it("creates a self-contained OpenCode probe workspace", () => {
    const root = mkdtempSync(join(tmpdir(), "opencode-subagent-probe-test-"))
    try {
      const paths = createProbeWorkspace({ root })

      const config = JSON.parse(readFileSync(paths.configPath, "utf8"))
      assert.deepEqual(config.plugin, ["./plugins/subagent-event-probe.js"])
      assert.equal(config.permission, "allow")

      const plugin = readFileSync(paths.pluginPath, "utf8")
      assert.ok(plugin.includes('"tool.execute.before"'))
      assert.ok(plugin.includes('"tool.execute.after"'))
      assert.ok(plugin.includes("event: async"))
      assert.ok(plugin.includes("__PROBE_BLOCK_ME__"))
      assert.ok(plugin.includes("client.session.promptAsync"))

      const agent = readFileSync(paths.agentPath, "utf8")
      assert.ok(agent.includes("mode: subagent"))
      assert.ok(agent.includes("bash: allow"))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("creates a self-contained audit-child prompt probe workspace", () => {
    const root = mkdtempSync(join(tmpdir(), "opencode-audit-child-probe-test-"))
    try {
      const paths = createAuditChildProbeWorkspace({ root })

      const config = JSON.parse(readFileSync(paths.configPath, "utf8"))
      assert.deepEqual(config.plugin, ["./plugins/audit-child-probe.js"])
      assert.equal(config.permission, "allow")

      const plugin = readFileSync(paths.pluginPath, "utf8")
      assert.ok(plugin.includes("client.session.create"))
      assert.ok(plugin.includes("client.session.prompt"))
      assert.ok(plugin.includes("probe-audit"))
      assert.ok(plugin.includes("audit.prompt.error"))
      assert.ok(plugin.includes("audit.child.message_updated"))
      assert.ok(plugin.includes("audit.child.idle"))

      const agent = readFileSync(paths.agentPath, "utf8")
      assert.ok(agent.includes("mode: subagent"))
      assert.ok(agent.includes("probe-audit"))
      assert.ok(agent.includes("write: deny"))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("creates a self-contained prompt-async child probe workspace", () => {
    const root = mkdtempSync(join(tmpdir(), "opencode-prompt-async-probe-test-"))
    try {
      const paths = createPromptAsyncProbeWorkspace({ root })
      const config = JSON.parse(readFileSync(paths.configPath, "utf8"))
      assert.deepEqual(config.plugin, ["./plugins/prompt-async-probe.js"])
      assert.equal(config.permission, "allow")

      const plugin = readFileSync(paths.pluginPath, "utf8")
      assert.ok(plugin.includes("client.session.create"))
      assert.ok(plugin.includes("client.session.promptAsync"))
      assert.ok(plugin.includes("prompt_async.create.start"))
      assert.ok(plugin.includes("prompt_async.prompt.accepted"))
      assert.ok(plugin.includes("message.part.updated"))
      assert.ok(plugin.includes("session.error"))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("preserves prompt-async event evidence when the event contains a cycle", async () => {
    const root = mkdtempSync(join(tmpdir(), "opencode-prompt-async-probe-test-"))
    const previousLogPath = process.env.OPENCODE_PROMPT_ASYNC_PROBE_LOG
    try {
      const paths = createPromptAsyncProbeWorkspace({ root })
      process.env.OPENCODE_PROMPT_ASYNC_PROBE_LOG = paths.logPath
      const pluginModule = await import(`${pathToFileURL(paths.pluginPath).href}?test=${Date.now()}`)
      const hooks = await pluginModule.default({ client: {}, directory: root })
      const event = { type: "message.updated", properties: { sessionID: "ses_cycle" } }
      event.self = event

      await hooks.event({ event })

      const [record] = readFileSync(paths.logPath, "utf8").trim().split("\n").map(JSON.parse)
      assert.equal(record.kind, "event")
      assert.equal(record.event.type, "message.updated")
      assert.equal(record.event.properties.sessionID, "ses_cycle")
      assert.equal(record.event.self, "[Circular]")
    } finally {
      if (previousLogPath === undefined) delete process.env.OPENCODE_PROMPT_ASYNC_PROBE_LOG
      else process.env.OPENCODE_PROMPT_ASYNC_PROBE_LOG = previousLogPath
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("clears stale prompt-async evidence when reusing a probe root", () => {
    const root = mkdtempSync(join(tmpdir(), "opencode-prompt-async-probe-test-"))
    try {
      const stalePaths = [
        "prompt-async-events.jsonl",
        "opencode-run.stdout",
        "opencode-run.stderr",
        "opencode-serve.log",
      ]
      for (const path of stalePaths) writeFileSync(join(root, path), "stale prompt-async evidence\n")
      writeFileSync(join(root, "probe-events.jsonl"), "other mode evidence\n")

      const paths = createPromptAsyncProbeWorkspace({ root })

      for (const path of [paths.logPath, paths.stdoutPath, paths.stderrPath, paths.serveLogPath]) {
        assert.equal(readFileSync(path, "utf8"), "")
      }
      assert.equal(readFileSync(join(root, "probe-events.jsonl"), "utf8"), "other mode evidence\n")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("builds attach-mode run args so server hooks execute", () => {
    const args = buildRunArgs({
      attachUrl: "http://127.0.0.1:41337",
      workspace: "/tmp/probe",
      model: "provider/model",
      prompt: "probe prompt",
    })

    assert.deepEqual(args, [
      "run",
      "--attach",
      "http://127.0.0.1:41337",
      "--dir",
      "/tmp/probe",
      "--format",
      "json",
      "--model",
      "provider/model",
      "probe prompt",
    ])
  })

  it("summarizes validate prompt and repair command evidence", () => {
    const summary = summarizeProbeEvents([
      { kind: "validate.prompt_async.ok" },
      { kind: "tool.execute.before", input: { tool: "bash" }, output: { args: { command: "printf PROBE_REPAIR_OK" } } },
    ])

    assert.equal(summary.promptAsyncOk, true)
    assert.equal(summary.repairCommandObserved, true)
  })

  it("summarizes audit-child prompt, database counts, and serve log excerpt", () => {
    const summary = summarizeAuditChildProbe({
      events: [
        { kind: "audit.create.ok", sessionID: "ses_child", result: { data: { id: "ses_child" } } },
        { kind: "audit.prompt.error", sessionID: "ses_child", error: "Unexpected server error" },
      ],
      dbRows: {
        session: 1,
        message: 0,
        part: 0,
        session_input: 0,
      },
      serveLogText: "stack before\nUnexpected server error\nstack after",
    })

    assert.equal(summary.create, "ok")
    assert.equal(summary.prompt, "error")
    assert.equal(summary.prompt_error, "Unexpected server error")
    assert.equal(summary.child_session_id, "ses_child")
    assert.deepEqual(summary.db, { session: 1, message: 0, part: 0, session_input: 0, error: null })
    assert.match(summary.log_excerpt, /Unexpected server error/)
  })

  it("preserves audit-child database read errors in the summary", () => {
    const summary = summarizeAuditChildProbe({
      events: [
        { kind: "audit.create.ok", sessionID: "ses_child", result: { data: { id: "ses_child" } } },
      ],
      dbRows: {
        error: "spawnSync sqlite3 ENOENT",
      },
    })

    assert.deepEqual(summary.db, { session: 0, message: 0, part: 0, session_input: 0, error: "spawnSync sqlite3 ENOENT" })
  })

  it("resolves audit-child database path from XDG_DATA_HOME before HOME", () => {
    assert.equal(typeof probe.opencodeDbPathFromEnv, "function")
    assert.equal(
      probe.opencodeDbPathFromEnv({ XDG_DATA_HOME: "/tmp/xdg-data", HOME: "/tmp/home" }),
      join("/tmp/xdg-data", "opencode", "opencode.db"),
    )
    assert.equal(
      probe.opencodeDbPathFromEnv({ HOME: "/tmp/home" }),
      join("/tmp/home", ".local", "share", "opencode", "opencode.db"),
    )
  })

  it("rejects probe CLI options that are missing required values", () => {
    assert.throws(() => parseArgs(["--mode"]), /Missing value for --mode/)
    assert.throws(() => parseArgs(["--mode", "--dry-run"]), /Missing value for --mode/)
  })

  it("summarizes audit-child event backflow for message update and idle", () => {
    const summary = summarizeAuditChildProbe({
      events: [
        { kind: "audit.create.ok", sessionID: "ses_child", result: { data: { id: "ses_child" } } },
        { kind: "audit.prompt.ok", sessionID: "ses_child", result: {} },
        { kind: "event", event: { type: "message.updated", properties: { info: { sessionID: "ses_child" } } } },
        { kind: "event", event: { type: "session.idle", properties: { sessionID: "ses_child" } } },
      ],
    })

    assert.equal(summary.backflow.message_updated, true)
    assert.equal(summary.backflow.idle, true)
  })

  it("summarizes prompt-async acceptance strictly before child terminal evidence", () => {
    const summary = summarizePromptAsyncProbe([
      { ts: 10, kind: "prompt_async.create.start" },
      { ts: 20, kind: "prompt_async.create.ok", sessionID: "ses_child" },
      { ts: 30, kind: "prompt_async.prompt.accepted", sessionID: "ses_child", status: 204 },
      { ts: 40, kind: "event", event: { type: "message.updated", properties: { info: { sessionID: "ses_child" } } } },
      { ts: 50, kind: "event", event: { type: "message.part.updated", properties: { sessionID: "ses_child" } } },
      { ts: 60, kind: "event", event: { type: "session.idle", properties: { sessionID: "ses_child" } } },
    ])

    assert.equal(summary.child_session_id, "ses_child")
    assert.equal(summary.create.status, "ok")
    assert.equal(summary.prompt.status, "accepted")
    assert.equal(summary.prompt.status_code, 204)
    assert.equal(summary.terminal.type, "idle")
    assert.equal(summary.accepted_before_terminal, true)
    assert.deepEqual(summary.evidence, { message_updated: true, message_part_updated: true })
  })

  it("does not treat acceptance at the terminal timestamp as before terminal", () => {
    const summary = summarizePromptAsyncProbe([
      { ts: 20, kind: "prompt_async.create.ok", sessionID: "ses_child" },
      { ts: 30, kind: "prompt_async.prompt.accepted", sessionID: "ses_child", status: 204 },
      { ts: 30, kind: "event", event: { type: "session.error", properties: { sessionID: "ses_child" } } },
    ])

    assert.equal(summary.terminal.type, "error")
    assert.equal(summary.accepted_before_terminal, false)
  })

  it("does not pass prompt-async when the SDK response has no HTTP status", () => {
    const summary = summarizePromptAsyncProbe([
      { ts: 20, kind: "prompt_async.create.ok", sessionID: "ses_child" },
      { ts: 30, kind: "prompt_async.prompt.accepted", sessionID: "ses_child" },
      { ts: 40, kind: "event", event: { type: "session.idle", properties: { sessionID: "ses_child" } } },
    ])

    assert.equal(summary.prompt.status_code, null)
    assert.equal(summary.pass, false)
  })

  it("passes prompt-async only with accepted 204 before a child terminal event", () => {
    const success = summarizePromptAsyncProbe([
      { ts: 20, kind: "prompt_async.create.ok", sessionID: "ses_child" },
      { ts: 30, kind: "prompt_async.prompt.accepted", sessionID: "ses_child", status: 204 },
      { ts: 40, kind: "event", event: { type: "message.updated", properties: { info: { sessionID: "ses_child" } } } },
      { ts: 50, kind: "event", event: { type: "session.idle", properties: { sessionID: "ses_child" } } },
    ])
    const missingTerminal = summarizePromptAsyncProbe([
      { ts: 20, kind: "prompt_async.create.ok", sessionID: "ses_child" },
      { ts: 30, kind: "prompt_async.prompt.accepted", sessionID: "ses_child", status: 204 },
    ])
    const badOrder = summarizePromptAsyncProbe([
      { ts: 20, kind: "prompt_async.create.ok", sessionID: "ses_child" },
      { ts: 30, kind: "event", event: { type: "session.error", properties: { sessionID: "ses_child" } } },
      { ts: 40, kind: "prompt_async.prompt.accepted", sessionID: "ses_child", status: 204 },
    ])

    assert.equal(success.pass, true)
    assert.equal(missingTerminal.pass, false)
    assert.equal(badOrder.pass, false)
  })

  it("makes prompt-async exit nonzero when a successful parent run lacks probe proof", () => {
    assert.equal(promptAsyncProbeExitStatus({ status: 0, signal: null, error: null }, { pass: false }), 1)
    assert.equal(promptAsyncProbeExitStatus({ status: 0, signal: null, error: null }, { pass: true }), 0)
    assert.equal(promptAsyncProbeExitStatus({ status: 2, signal: null, error: null }, { pass: true }), 2)
  })

  it("stops waiting for prompt-async as soon as a child terminal event arrives", () => {
    assert.equal(shouldStopWaitingForPromptAsyncProbe({ create: { status: "ok" }, prompt: { status: "accepted" }, terminal: { type: "idle" }, pass: false }), true)
    assert.equal(shouldStopWaitingForPromptAsyncProbe({ create: { status: "ok" }, prompt: { status: "accepted" }, terminal: { type: null }, pass: false }), false)
  })

  it("rejects unknown modes, arguments, and invalid numeric CLI values", () => {
    assert.throws(() => parseArgs(["--mode", "prompt-asnyc"]), /Unknown mode/)
    assert.throws(() => parseArgs(["--unknown"]), /Unknown argument/)
    assert.throws(() => parseArgs(["--timeout-ms", "0"]), /positive finite number/)
    assert.throws(() => parseArgs(["--timeout-ms", "NaN"]), /positive finite number/)
    assert.throws(() => parseArgs(["--port", "0"]), /integer between 1 and 65535/)
    assert.throws(() => parseArgs(["--port", "41339.5"]), /integer between 1 and 65535/)
    assert.deepEqual(parseArgs(["--mode", "audit-child", "--timeout-ms", "1", "--port", "65535"]), {
      mode: "audit-child",
      timeoutMs: 1,
      port: 65535,
    })
  })

  it("includes serve log path when reporting server startup failure", () => {
    const error = formatServeNotReadyError({
      attachUrl: "http://127.0.0.1:41337",
      serveLogPath: "/tmp/probe/opencode-serve.log",
    })

    assert.match(error, /http:\/\/127\.0\.0\.1:41337/)
    assert.match(error, /opencode-serve\.log/)
  })

  it("uses in-process sleep instead of external sleep command", () => {
    const source = readFileSync(new URL("../opencode-subagent-event-probe.mjs", import.meta.url), "utf8")

    assert.doesNotMatch(source, /spawnSync\("sleep"/)
    assert.match(source, /Atomics\.wait/)
  })

  it("reads only newly appended log bytes", () => {
    const root = mkdtempSync(join(tmpdir(), "opencode-subagent-probe-test-"))
    try {
      const logPath = join(root, "serve.log")
      writeFileSync(logPath, "ready\n")

      const first = readTextFromOffset(logPath, 0)
      appendFileSync(logPath, "next\n")
      const second = readTextFromOffset(logPath, first.offset)

      assert.equal(first.text, "ready\n")
      assert.equal(second.text, "next\n")
      assert.equal(second.offset, Buffer.byteLength("ready\nnext\n"))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("skips repair evidence wait after run timeout", () => {
    assert.equal(shouldWaitForRepairEvidence({ signal: "SIGTERM", error: null }), false)
    assert.equal(shouldWaitForRepairEvidence({ signal: null, error: new Error("timeout") }), false)
    assert.equal(shouldWaitForRepairEvidence({ signal: null, error: null }), true)
  })
})
