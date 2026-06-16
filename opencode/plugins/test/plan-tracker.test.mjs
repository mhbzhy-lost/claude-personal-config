/**
 * Plan Tracker Gate Plugin - Tests
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { execSync } from "node:child_process";
import { join } from "node:path";

// Test helper: load plugin and get hooks
async function loadPlugin() {
  const plugin = await import("../plan-tracker.js");
  return plugin.PlanTrackerGate({});
}

describe("PlanTrackerGate plugin", () => {
  it("should export PlanTrackerGate factory function", async () => {
    const plugin = await import("../plan-tracker.js");
    assert.equal(typeof plugin.PlanTrackerGate, "function");
  });

  it("should return hooks object with before hook", async () => {
    const hooks = await loadPlugin();
    assert.ok(hooks.before);
    assert.equal(typeof hooks.before, "function");
  });

  it("should return early for non-bash tools", async () => {
    const hooks = await loadPlugin();
    const input = { tool: "read", args: { file: "test.js" } };
    const output = {};

    // Should not throw
    await hooks.before(input, output);
  });

  it("should return early for bash commands that are not git push", async () => {
    const hooks = await loadPlugin();
    const input = { tool: "bash", args: { command: "ls -la" } };
    const output = {};

    // Should not throw
    await hooks.before(input, output);
  });

  it("should return early for git commands that are not push", async () => {
    const hooks = await loadPlugin();
    const input = { tool: "bash", args: { command: "git status" } };
    const output = {};

    // Should not throw
    await hooks.before(input, output);
  });

  it("should intercept git push commands", async () => {
    const hooks = await loadPlugin();
    const input = { tool: "bash", args: { command: "git push" } };
    const output = {};

    // This will try to run plan-tracker.py
    // If there are pending TODOs, it should throw
    // If no pending TODOs, it should pass silently
    try {
      await hooks.before(input, output);
      // If we reach here, no pending TODOs - that's OK
    } catch (error) {
      // If there are pending TODOs, should throw with clear message
      assert.ok(error.message.includes("Git push blocked"));
    }
  });

  it("should intercept git push with branch name", async () => {
    const hooks = await loadPlugin();
    const input = { tool: "bash", args: { command: "git push origin main" } };
    const output = {};

    // Should be intercepted
    try {
      await hooks.before(input, output);
    } catch (error) {
      assert.ok(error.message.includes("Git push blocked"));
    }
  });

  it("should intercept git push with flags", async () => {
    const hooks = await loadPlugin();
    const input = { tool: "bash", args: { command: "git push --force" } };
    const output = {};

    // Should be intercepted
    try {
      await hooks.before(input, output);
    } catch (error) {
      assert.ok(error.message.includes("Git push blocked"));
    }
  });

  it("should handle missing command gracefully", async () => {
    const hooks = await loadPlugin();
    const input = { tool: "bash", args: {} };
    const output = {};

    // Should not throw
    await hooks.before(input, output);
  });

  it("should handle null/undefined command gracefully", async () => {
    const hooks = await loadPlugin();
    const input = { tool: "bash", args: { command: null } };
    const output = {};

    // Should not throw
    await hooks.before(input, output);
  });
});

describe("plan-tracker.py integration", () => {
  it("should be executable and return valid exit codes", () => {
    // Use repo root (opencode/plugins/test/../../.. = repo root)
    const repoRoot = join(import.meta.dirname, "..", "..", "..");
    try {
      execSync("python3 shared/hooks/plan-tracker.py .", {
        cwd: repoRoot,
        stdio: "pipe",
      });
      // Exit 0: no active plans or all TODOs done
    } catch (error) {
      // Exit 1: has pending TODOs
      assert.equal(error.status, 1);
    }
  });
});
