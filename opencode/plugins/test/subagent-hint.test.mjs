import { describe, it } from "node:test"
import assert from "node:assert/strict"

describe("subagent-hint plugin", () => {
  async function loadHook() {
    const mod = await import("../subagent-hint.js")
    const hooks = await mod.SubagentHintPlugin({})
    return hooks["tool.execute.before"]
  }

  it("module exports SubagentHintPlugin function", async () => {
    const mod = await import("../subagent-hint.js")
    assert.equal(typeof mod.SubagentHintPlugin, "function")
  })

  it("does not export helper functions as legacy plugin entries", async () => {
    const mod = await import("../subagent-hint.js")
    const functionExports = Object.entries(mod)
      .filter(([, value]) => typeof value === "function")
      .map(([name]) => name)

    assert.deepEqual(functionExports, ["SubagentHintPlugin"])
  })

  it("task + background=true → 放行", async () => {
    const hook = await loadHook()
    await assert.doesNotReject(() =>
      hook({ tool: "task" }, { args: { prompt: "do work", background: true } }),
    )
  })

  it("task + background 未设置 → 拦截", async () => {
    const hook = await loadHook()
    await assert.rejects(
      () => hook({ tool: "task" }, { args: { prompt: "do work" } }),
      (err) => {
        assert.ok(err.message.includes("background"), "提示应包含 'background'")
        return true
      },
    )
  })

  it("task + background=false → 拦截", async () => {
    const hook = await loadHook()
    await assert.rejects(
      () => hook({ tool: "task" }, { args: { prompt: "do work", background: false } }),
      (err) => {
        assert.ok(err.message.includes("后台"), "提示应包含'后台'")
        return true
      },
    )
  })

  it("非 task 工具 → 放行", async () => {
    const hook = await loadHook()
    await assert.doesNotReject(() =>
      hook({ tool: "bash" }, { args: { command: "ls" } }),
    )
  })
})
