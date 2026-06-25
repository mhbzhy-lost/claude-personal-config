import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { buildRunArgs, createProbeWorkspace, formatServeNotReadyError, summarizeProbeEvents } from "../opencode-subagent-event-probe.mjs"

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
})
