/**
 * git-commit-hint plugin (knowledge-gate scope, template)
 *
 * Repo-local template. install-knowledge-gate.sh renders the HINT text from
 * shared/policies/git-commit-hint.json into a vendored standalone copy installed
 * to target projects under .opencode/plugins/.
 *
 * In the repo (tests): HINT is read from CLAUDE_CONFIG_HOME/shared/policies/.
 * In target projects: HINT is the inlined text produced by the installer.
 *
 * Skip: GIT_COMMIT_HINT_SKIP=1 in bash tool env / command prefix
 */

import { readFile, readFileSync } from "node:fs"
import { readFile as fsReadFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const pluginDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = process.env.CLAUDE_CONFIG_HOME || join(pluginDir, "..", "..")
const hintContentPath = join(repoRoot, "shared", "policies", "git-commit-hint.json")

const GIT_COMMIT_RE = /(?:^|[^\w-])git\s+commit(?:\s|$)/
const SKIP_ENV = "GIT_COMMIT_HINT_SKIP"
const SKIP_VALUES = new Set(["1", "true", "yes", "on"])

const loadHintFromSSOT = async () => {
  try {
    const content = JSON.parse(await fsReadFile(hintContentPath, "utf8"))
    return content.template
      .join("\n")
      .replaceAll("{escape_instruction}", content.escape_instructions.opencode)
  } catch (err) {
    process.stderr.write(`[git-commit-hint] failed to load SSOT: ${err.message}\n`)
    return ""
  }
}

// In vendored copies, this literal is replaced at install time with the rendered
// hint text. In the source template, we fall back to reading the SSOT file at
// load time (the CLAUDE_CONFIG_HOME env var points at the config repo).
// HINT_PLACEHOLDER_START
const HINT_TEXT = null
// HINT_PLACEHOLDER_END

const isTruthy = (value) => SKIP_VALUES.has(String(value || "").trim().toLowerCase())

const toolEnvSkip = (args) => {
  for (const env of [args?.env, args?.environment]) {
    if (env && typeof env === "object" && isTruthy(env[SKIP_ENV])) return true
  }
  return false
}

const commandSkip = (command) => {
  const segments = command.split(/\s*(?:;|&&|\|\|)\s*/)
  return segments.some((segment) => {
    let tokens = segment.trim().split(/\s+/).filter(Boolean)
    if (tokens[0] === "env") tokens = tokens.slice(1)

    let skipRequested = false
    let index = 0
    for (; index < tokens.length; index += 1) {
      const match = tokens[index].match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
      if (!match) break
      if (match[1] === SKIP_ENV && isTruthy(match[2])) skipRequested = true
    }

    return skipRequested && tokens[index] === "git" && tokens[index + 1] === "commit"
  })
}

export const GitCommitHintPlugin = async () => {
  const hintText = HINT_TEXT ?? await loadHintFromSSOT()
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "bash") return

      const command = output.args?.command || ""
      if (!GIT_COMMIT_RE.test(command)) return

      if (toolEnvSkip(output.args) || commandSkip(command)) return

      if (!hintText) {
        process.stderr.write("[git-commit-hint] no hint text available, allowing commit\n")
        return
      }
      throw new Error(hintText)
    },
  }
}

export default GitCommitHintPlugin
