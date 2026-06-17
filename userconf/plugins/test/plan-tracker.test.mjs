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
  const hooks = await plugin.PlanTrackerGate({});
  return hooks["tool.execute.before"];
}

describe("PlanTrackerGate plugin", () => {
  it("should export PlanTrackerGate factory function", async () => {
    const plugin = await import("../plan-tracker.js");
    assert.equal(typeof plugin.PlanTrackerGate, "function");
  });

  it("should return hooks object with tool.execute.before hook", async () => {
    const plugin = await import("../plan-tracker.js");
    const hooks = await plugin.PlanTrackerGate({});
    assert.ok(hooks["tool.execute.before"]);
    assert.equal(typeof hooks["tool.execute.before"], "function");
  });

  it("should return early for non-bash tools", async () => {
    const before = await loadPlugin();
    const input = { tool: "read", args: { file: "test.js" } };
    const output = {};

    await before(input, output);
  });

  it("should return early for bash commands that are not git push", async () => {
    const before = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "ls -la" } };

    await before(input, output);
  });

  it("should return early for git commands that are not push", async () => {
    const before = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "git status" } };

    await before(input, output);
  });

  it("should intercept git push commands", async () => {
    const before = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "git push" } };

    try {
      await before(input, output);
    } catch (error) {
      assert.ok(!error.message.includes("禁止 && 组合"));
    }
  });

  it("should intercept git push with branch name", async () => {
    const before = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "git push origin main" } };

    try {
      await before(input, output);
    } catch (error) {
      assert.ok(!error.message.includes("禁止 && 组合"));
    }
  });

  it("should intercept git push with flags", async () => {
    const before = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "git push --force" } };

    try {
      await before(input, output);
    } catch (error) {
      assert.ok(!error.message.includes("禁止 && 组合"));
    }
  });

  it("should NOT intercept git push --dry-run", async () => {
    const before = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "git push --dry-run" } };

    await before(input, output);
  });

  it("should NOT intercept git push --mirror", async () => {
    const before = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "git push --mirror" } };

    await before(input, output);
  });

  it("should NOT intercept git push -n", async () => {
    const before = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "git push -n" } };

    await before(input, output);
  });

  it("should NOT intercept git push-url (not a subcommand)", async () => {
    const before = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "git push-url https://example.com" } };

    await before(input, output);
  });

  it("should handle missing command gracefully", async () => {
    const before = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: {} };

    await before(input, output);
  });

  it("should handle null/undefined command gracefully", async () => {
    const before = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: null } };

    await before(input, output);
  });

  it("should BLOCK && mixing git and non-git commands", async () => {
    const before = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "cd /tmp/repo && git push" } };

    await assert.rejects(
      async () => before(input, output),
      /禁止 .*组合 git 与非 git 命令/
    );
  });

  it("should BLOCK && with npm test and git", async () => {
    const before = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "npm test && git push" } };

    await assert.rejects(
      async () => before(input, output),
      /禁止 .*组合 git 与非 git 命令/
    );
  });

  it("should ALLOW && with only git commands", async () => {
    const before = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "git add -A && git commit -m \"test\" && git push" } };

    try {
      await before(input, output);
    } catch (error) {
      assert.ok(!error.message.includes("禁止 && 组合"));
    }
  });

  it("should BLOCK ; with mixed commands (git + non-git)", async () => {
    const before = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "cd /tmp/repo; git push" } };

    await assert.rejects(
      async () => before(input, output),
      /禁止 .*组合 git 与非 git 命令/
    );
  });

  it("should BLOCK ; with npm test and git status", async () => {
    const before = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "npm test; git status" } };

    await assert.rejects(
      async () => before(input, output),
      /禁止 .*组合 git 与非 git 命令/
    );
  });

  it("should ALLOW ; with only git commands", async () => {
    const before = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "git status; git log" } };

    await before(input, output);
  });

  it("should ALLOW | pipes (not restricted)", async () => {
    const before = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "git log | head" } };

    await before(input, output);
  });

  it("should ALLOW env var prefix on git commands", async () => {
    const before = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "GIT_AUTHOR_NAME=test git commit -m \"test\"" } };

    await before(input, output);
  });

  it("should use output.args.workdir as scan target when set", async () => {
    const before = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "git push", workdir: "/tmp" } };

    try {
      await before(input, output);
    } catch (error) {
      assert.ok(!error.message.includes("禁止 && 组合"));
    }
  });

  it("should BLOCK git -C with TODO repo", async () => {
    const before = await loadPlugin();
    const input = { tool: "bash" };
    // git -C targets /tmp/plan-test-work which has active TODOs
    const output = { args: { command: "git -C /tmp/plan-test-work push" } };

    await assert.rejects(
      async () => before(input, output),
      /Git push blocked/
    );
  });

  it("should mention verification-before-completion skill in block message", async () => {
    const before = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "git -C /tmp/plan-test-work push" } };

    try {
      await before(input, output);
      assert.fail("Expected rejection");
    } catch (error) {
      assert.ok(
        error.message.includes("verification-before-completion"),
        `Error should mention verification-before-completion skill: ${error.message}`
      );
    }
  });

  it("should BLOCK git -C with path traversal attack", async () => {
    const before = await loadPlugin();
    const input = { tool: "bash" };
    // Attempting to scan outside workspace
    const output = { args: { command: "git -C /etc push" } };

    await assert.rejects(
      async () => before(input, output),
      /Path is outside allowed workspace boundaries/
    );
  });

  it("should NOT hang on ReDoS attempt with many spaces", async () => {
    const before = await loadPlugin();
    const input = { tool: "bash" };
    // Craft input with many spaces to trigger ReDoS if vulnerable
    const spaces = " ".repeat(50);
    const output = { args: { command: `git${spaces}xxx` } };

    // Should resolve quickly (within 100ms), not hang
    const start = Date.now();
    await before(input, output);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 100, `Took ${elapsed}ms, expected <100ms`);
  });

  it("should BLOCK && mixing with exec shell wrapper on git", async () => {
    const before = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "exec git push && npm test" } };

    await assert.rejects(
      async () => before(input, output),
      /禁止 .*组合 git 与非 git 命令/
    );
  });

  it("should BLOCK && mixing with sudo shell wrapper on git", async () => {
    const before = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "sudo git push && npm test" } };

    await assert.rejects(
      async () => before(input, output),
      /禁止 .*组合 git 与非 git 命令/
    );
  });

  it("should ALLOW git -C with relative path from subdirectory", async () => {
    const before = await loadPlugin();
    const input = { tool: "bash" };
    // From repo/subdir, git -C ../.. points to repo root (should be allowed)
    const output = { args: { command: "git -C ../.. push" } };

    // Should not throw path traversal error
    try {
      await before(input, output);
    } catch (error) {
      assert.ok(
        !error.message.includes("outside workspace"),
        `Unexpected path traversal error: ${error.message}`
      );
    }
  });

  it("should ALLOW git --no-pager -C with global options before -C", async () => {
    const before = await loadPlugin();
    const input = { tool: "bash" };
    // git global options can appear before -C
    const output = { args: { command: "git --no-pager -C /tmp/plan-test-work push" } };

    // Should extract /tmp/plan-test-work and block due to TODOs (not path traversal)
    await assert.rejects(
      async () => before(input, output),
      /Git push blocked/
    );
  });

  it("should NOT leak absolute paths in error message", async () => {
    const before = await loadPlugin();
    const input = { tool: "bash" };
    const output = { args: { command: "git -C /etc push" } };

    try {
      await before(input, output);
      assert.fail("Expected path traversal error");
    } catch (error) {
      // Should not contain /Users or /home absolute paths
      assert.ok(
        !error.message.includes("/Users/"),
        `Error message leaks absolute path: ${error.message}`
      );
      assert.ok(
        error.message.includes("outside"),
        `Error message should mention 'outside': ${error.message}`
      );
    }
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
