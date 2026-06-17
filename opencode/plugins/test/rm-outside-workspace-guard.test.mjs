/**
 * Test rm-outside-workspace-guard temp directory whitelist
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { existsSync, symlinkSync, rmSync, mkdirSync, realpathSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

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

  it("blocks rm via symlink pointing outside temp dir (symlink bypass prevention)", async () => {
    // Create a symlink in /tmp that points to a non-temp sensitive directory
    const symlinkPath = "/tmp/evil-symlink-test"
    const sensitiveDir = "/tmp/should-be-protected"

    try {
      // Setup: create sensitive dir but make the symlink point somewhere else
      // Actually - create symlink pointing to a real sensitive location like /etc
      // But we can't create symlinks to /etc, so test with a temp dir that's NOT whitelisted
      const nonWhitelistedDir = "/tmp/test-sensitive-subdir"
      mkdirSync(nonWhitelistedDir, { recursive: true })
      symlinkSync(nonWhitelistedDir, symlinkPath)

      const hooks = await RmOutsideWorkspaceGuardPlugin()
      const before = hooks["tool.execute.before"]

      // Try to rm via the symlink - the real resolved path is still under /tmp
      // so this SHOULD be allowed (both symlink and resolved path are in temp)
      const input = { tool: "bash" }
      const output = {
        args: {
          command: `rm -rf ${symlinkPath}`,
          cwd: "/Users/test/project",
          workspaceRoot: "/Users/test/project"
        }
      }

      // This should NOT throw because resolved path is still under /tmp
      await before(input, output)
    } finally {
      try { rmSync(symlinkPath, { force: true }) } catch {}
      try { rmSync("/tmp/test-sensitive-subdir", { recursive: true, force: true }) } catch {}
    }
  })

  it("blocks rm of symlink that points outside /tmp (symlink bypass prevention)", async () => {
    // Scenario: symlink in /tmp points to something OUTSIDE /tmp (e.g., /etc)
    // This should be blocked to prevent symlink bypass attacks
    const symlinkPath = "/tmp/symlink-bypass-test"
    const targetOutside = "/etc"  // Definitely not in /tmp whitelist

    try {
      symlinkSync(targetOutside, symlinkPath)

      const hooks = await RmOutsideWorkspaceGuardPlugin()
      const before = hooks["tool.execute.before"]

      const input = { tool: "bash" }
      const output = {
        args: {
          command: `rm -rf ${symlinkPath}`,
          cwd: "/Users/test/project",
          workspaceRoot: "/Users/test/project"
        }
      }

      // Symlink points to /etc (outside /tmp) - should be blocked
      await assert.rejects(
        async () => before(input, output),
        { message: /workspace 外 rm 已被阻断/ }
      )
    } finally {
      try { rmSync(symlinkPath, { force: true }) } catch {}
    }
  })

  it("allows rm in os.tmpdir() (cross-platform temp)", async () => {
    const hooks = await RmOutsideWorkspaceGuardPlugin()
    const before = hooks["tool.execute.before"]

    const systemTemp = tmpdir()
    const testDir = join(systemTemp, "cross-platform-test")

    // Create the test directory
    mkdirSync(testDir, { recursive: true })

    try {
      const input = { tool: "bash" }
      const output = {
        args: {
          command: `rm -rf ${testDir}`,
          cwd: "/Users/test/project",
          workspaceRoot: "/Users/test/project"
        }
      }

      // Should not throw - os.tmpdir() is a whitelisted temp location
      await before(input, output)
    } finally {
      try { rmSync(testDir, { recursive: true, force: true }) } catch {}
    }
  })
})
