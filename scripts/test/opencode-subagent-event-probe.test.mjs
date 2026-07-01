import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import * as probe from "../opencode-subagent-event-probe.mjs"
import { buildRunArgs, createAuditChildProbeWorkspace, createProbeWorkspace, formatServeNotReadyError, parseArgs, readTextFromOffset, shouldWaitForRepairEvidence, summarizeAuditChildProbe, summarizeProbeEvents } from "../opencode-subagent-event-probe.mjs"

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
