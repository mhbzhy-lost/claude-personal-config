import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execSync } from "node:child_process"

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..")

test("install-knowledge-gate.sh installs plugin with SSOT hint text rendered", () => {
  const tmp = mkdtempSync(join(tmpdir(), "kg-plugin-test-"))
  try {
    execSync(`bash "${join(REPO_ROOT, "scripts/install-knowledge-gate.sh")}" "${tmp}"`, {
      cwd: REPO_ROOT,
      stdio: "pipe",
    })

    assert.ok(existsSync(join(tmp, ".agent/hooks/knowledge-gate.py")))
    assert.ok(existsSync(join(tmp, ".agent/knowledge-gate.json")))
    assert.ok(existsSync(join(tmp, ".githooks/pre-commit")))

    const pluginPath = join(tmp, ".opencode/plugins/git-commit-hint.js")
    assert.ok(existsSync(pluginPath), "plugin should be installed")

    const plugin = readFileSync(pluginPath, "utf8")
    assert.ok(
      plugin.includes(".agent/knowledge-gate.json"),
      "plugin should contain rendered hint about .agent/knowledge-gate.json"
    )
    assert.ok(
      !plugin.includes("HINT_TEXT = null"),
      "placeholder should be replaced with rendered text"
    )
    assert.ok(
      plugin.includes("GIT_COMMIT_HINT_SKIP"),
      "plugin should include skip env var hint"
    )
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test("install-knowledge-gate.sh does not overwrite existing project-local files", () => {
  const tmp = mkdtempSync(join(tmpdir(), "kg-keep-test-"))
  try {
    mkdirSync(join(tmp, ".agent"), { recursive: true })
    mkdirSync(join(tmp, ".githooks"), { recursive: true })
    writeFileSync(join(tmp, ".agent/knowledge-gate.json"), '{"custom":"content"}')
    writeFileSync(join(tmp, ".githooks/pre-commit"), "#!/bin/sh\n# custom hook\n")

    execSync(`bash "${join(REPO_ROOT, "scripts/install-knowledge-gate.sh")}" "${tmp}"`, {
      cwd: REPO_ROOT,
      stdio: "pipe",
    })

    assert.equal(readFileSync(join(tmp, ".agent/knowledge-gate.json"), "utf8"), '{"custom":"content"}')
    assert.match(readFileSync(join(tmp, ".githooks/pre-commit"), "utf8"), /custom hook/)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})
