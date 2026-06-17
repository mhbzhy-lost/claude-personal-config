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
    const input = { tool: "bash" };
    const output = { args: { command: "ls -la" } };

    await hooks.before(input, output);
  });

  it("should return early for git commands that are not push", async () => {
    const hooks = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "git status" } };

    await hooks.before(input, output);
  });

  it("should intercept git push commands", async () => {
    const hooks = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "git push" } };

    // Will run plan-tracker.py on process.cwd() (this repo)
    // Just ensure it does not throw a mixing-rule error
    try {
      await hooks.before(input, output);
    } catch (error) {
      assert.ok(!error.message.includes("禁止 && 组合"));
    }
  });

  it("should intercept git push with branch name", async () => {
    const hooks = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "git push origin main" } };

    try {
      await hooks.before(input, output);
    } catch (error) {
      assert.ok(!error.message.includes("禁止 && 组合"));
    }
  });

  it("should intercept git push with flags", async () => {
    const hooks = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "git push --force" } };

    try {
      await hooks.before(input, output);
    } catch (error) {
      assert.ok(!error.message.includes("禁止 && 组合"));
    }
  });

  it("should NOT intercept git push --dry-run", async () => {
    const hooks = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "git push --dry-run" } };

    await hooks.before(input, output);
  });

  it("should NOT intercept git push --mirror", async () => {
    const hooks = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "git push --mirror" } };

    await hooks.before(input, output);
  });

  it("should NOT intercept git push -n", async () => {
    const hooks = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "git push -n" } };

    await hooks.before(input, output);
  });

  it("should NOT intercept git push-url (not a subcommand)", async () => {
    const hooks = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "git push-url https://example.com" } };

    await hooks.before(input, output);
  });

  it("should handle missing command gracefully", async () => {
    const hooks = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: {} };

    await hooks.before(input, output);
  });

  it("should handle null/undefined command gracefully", async () => {
    const hooks = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: null } };

    await hooks.before(input, output);
  });

  it("should BLOCK && mixing git and non-git commands", async () => {
    const hooks = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "cd /tmp/repo && git push" } };

    await assert.rejects(
      async () => hooks.before(input, output),
      /禁止 && 组合 git 与非 git 命令/
    );
  });

  it("should BLOCK && with npm test and git", async () => {
    const hooks = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "npm test && git push" } };

    await assert.rejects(
      async () => hooks.before(input, output),
      /禁止 && 组合 git 与非 git 命令/
    );
  });

  it("should ALLOW && with only git commands", async () => {
    const hooks = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "git add -A && git commit -m \"test\" && git push" } };

    // No mixing error; plan-tracker.py may reject but that's orthogonal
    try {
      await hooks.before(input, output);
    } catch (error) {
      assert.ok(!error.message.includes("禁止 && 组合"));
    }
  });

  it("should ALLOW ; with mixed commands (not restricted)", async () => {
    const hooks = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "cd /tmp/repo; git push" } };

    try {
      await hooks.before(input, output);
    } catch (error) {
      assert.ok(!error.message.includes("禁止 && 组合"));
    }
  });

  it("should ALLOW | pipes (not restricted)", async () => {
    const hooks = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "git log | head" } };

    await hooks.before(input, output);
  });

  it("should ALLOW env var prefix on git commands", async () => {
    const hooks = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "GIT_AUTHOR_NAME=test git commit -m \"test\"" } };

    await hooks.before(input, output);
  });

  it("should use output.args.workdir as scan target when set", async () => {
    const hooks = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "git push", workdir: "/tmp" } };

    try {
      await hooks.before(input, output);
    } catch (error) {
      assert.ok(!error.message.includes("禁止 && 组合"));
    }
  });

  it("should BLOCK && mixing with exec shell wrapper on git", async () => {
    const hooks = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "exec git push && npm test" } };

    await assert.rejects(
      async () => hooks.before(input, output),
      /禁止 && 组合 git 与非 git 命令/
    );
  });

  it("should BLOCK && mixing with sudo shell wrapper on git", async () => {
    const hooks = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "sudo git push && npm test" } };

    await assert.rejects(
      async () => hooks.before(input, output),
      /禁止 && 组合 git 与非 git 命令/
    );
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
