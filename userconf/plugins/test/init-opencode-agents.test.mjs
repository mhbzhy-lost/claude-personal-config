import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { join } from "node:path"
import { tmpdir } from "node:os"

const repoRoot = new URL("../../..", import.meta.url).pathname
const initScript = join(repoRoot, "init_opencode.sh")

describe("init_opencode agents sync", () => {
  it("symlinks userconf plugins including plan-runner harness", () => {
    const configDir = mkdtempSync(join(tmpdir(), "opencode-plugins-"))

    try {
      execFileSync(
        "bash",
        [
          "-c",
          [
            `OPENCODE_CONFIG_DIR=${JSON.stringify(configDir)}`,
            "OPENCODE_INIT_AS_LIBRARY=1",
            `source ${JSON.stringify(initScript)}`,
            "declare -F sync_opencode_plugins >/dev/null",
            "sync_opencode_plugins",
          ].join("; "),
        ],
        { encoding: "utf8" },
      )

      const linkPath = join(configDir, "plugins", "plan-runner-harness.js")
      const linkTarget = execFileSync("readlink", [linkPath], { encoding: "utf8" }).trim()

      assert.equal(linkTarget, join(repoRoot, "userconf", "plugins", "plan-runner-harness.js"))
    } finally {
      rmSync(configDir, { recursive: true, force: true })
    }
  })

  it("symlinks userconf agents into the OpenCode global agents directory", () => {
    const configDir = mkdtempSync(join(tmpdir(), "opencode-agents-"))

    try {
      execFileSync(
        "bash",
        [
        "-c",
          [
            `OPENCODE_CONFIG_DIR=${JSON.stringify(configDir)}`,
            "OPENCODE_INIT_AS_LIBRARY=1",
            `source ${JSON.stringify(initScript)}`,
            "declare -F sync_opencode_agents >/dev/null",
            "sync_opencode_agents",
          ].join("; "),
        ],
        { encoding: "utf8" },
      )

      const linkPath = join(configDir, "agents", "plan-runner.md")
      const linkTarget = execFileSync("readlink", [linkPath], { encoding: "utf8" }).trim()

      assert.equal(linkTarget, join(repoRoot, "userconf", "agents", "plan-runner.md"))
    } finally {
      rmSync(configDir, { recursive: true, force: true })
    }
  })

  it("plan-runner may orchestrate default child subagents without recursive delegation", () => {
    const prompt = readFileSync(join(repoRoot, "userconf", "agents", "plan-runner.md"), "utf8")

    assert.match(prompt, /task:\s*allow/)
    assert.match(prompt, /default child subagent/i)
    assert.match(prompt, /do not use custom agents/i)
    assert.match(prompt, /return evidence only/i)
  })

  it("plan-runner uses write_plan as the harness plan entrypoint", () => {
    const prompt = readFileSync(join(repoRoot, "userconf", "agents", "plan-runner.md"), "utf8")

    assert.match(prompt, /write_plan:\s*allow/)
    assert.match(prompt, /call `write_plan`/i)
    assert.doesNotMatch(prompt, /TODO:\s*\/\s*DONE:/)
    assert.doesNotMatch(prompt, /Every plan step must use `TODO:`/)
  })
})
