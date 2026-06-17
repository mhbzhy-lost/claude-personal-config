/**
 * Test rm-outside-workspace-guard temp directory whitelist
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"

// Load the plugin
const { RmOutsideWorkspaceGuardPlugin } = await import("../rm-outside-workspace-guard.js")

describe("rm-outside-workspace-guard temp directories", () => {
  it("allows rm in /tmp subdirectories", async () => {
    const hooks = await RmOutsideWorkspaceGuardPlugin()
    const before = hooks["tool.execute.before"]

    const input = { tool: "bash" }
    const output = {
      args: {
        command: "rm -rf /tmp/test-dir",
        cwd: "/Users/test/project",
        workspaceRoot: "/Users/test/project"
      }
    }

    // Should not throw
    await before(input, output)
  })

  it("allows rm in /private/tmp subdirectories", async () => {
    const hooks = await RmOutsideWorkspaceGuardPlugin()
    const before = hooks["tool.execute.before"]

    const input = { tool: "bash" }
    const output = {
      args: {
        command: "rm -rf /private/tmp/test-dir",
        cwd: "/Users/test/project",
        workspaceRoot: "/Users/test/project"
      }
    }

    // Should not throw
    await before(input, output)
  })

  it("allows rm with multiple targets in temp dirs", async () => {
    const hooks = await RmOutsideWorkspaceGuardPlugin()
    const before = hooks["tool.execute.before"]

    const input = { tool: "bash" }
    const output = {
      args: {
        command: "rm /tmp/file1 /private/tmp/file2",
        cwd: "/Users/test/project",
        workspaceRoot: "/Users/test/project"
      }
    }

    // Should not throw
    await before(input, output)
  })

  it("blocks rm in other directories outside workspace", async () => {
    const hooks = await RmOutsideWorkspaceGuardPlugin()
    const before = hooks["tool.execute.before"]

    const input = { tool: "bash" }
    const output = {
      args: {
        command: "rm -rf /Users/test/other-project",
        cwd: "/Users/test/project",
        workspaceRoot: "/Users/test/project"
      }
    }

    // Should throw
    await assert.rejects(
      async () => before(input, output),
      /workspace 外 rm 已被阻断/
    )
  })

  it("allows mix of workspace and temp dir targets", async () => {
    const hooks = await RmOutsideWorkspaceGuardPlugin()
    const before = hooks["tool.execute.before"]

    const input = { tool: "bash" }
    const output = {
      args: {
        command: "rm /Users/test/project/file /tmp/other-file",
        cwd: "/Users/test/project",
        workspaceRoot: "/Users/test/project"
      }
    }

    // Should not throw - both targets are allowed
    await before(input, output)
  })

  it("blocks mix of workspace and non-temp outside targets", async () => {
    const hooks = await RmOutsideWorkspaceGuardPlugin()
    const before = hooks["tool.execute.before"]

    const input = { tool: "bash" }
    const output = {
      args: {
        command: "rm /Users/test/project/file /Users/test/other/file",
        cwd: "/Users/test/project",
        workspaceRoot: "/Users/test/project"
      }
    }

    // Should throw - second target is outside workspace and not in temp
    await assert.rejects(
      async () => before(input, output),
      /workspace 外 rm 已被阻断/
    )
  })
})
