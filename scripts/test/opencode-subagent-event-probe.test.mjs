import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { buildRunArgs, createProbeWorkspace, formatServeNotReadyError, readTextFromOffset, shouldWaitForRepairEvidence, summarizeProbeEvents } from "../opencode-subagent-event-probe.mjs"

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
