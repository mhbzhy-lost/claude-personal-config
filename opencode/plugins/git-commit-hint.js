/**
 * git-commit-hint plugin for OpenCode
 *
 * 拦截 bash 工具的 git commit 操作，并渲染共享 hint 内容。
 */

import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const pluginDir = dirname(fileURLToPath(import.meta.url))
// SSOT for hint content: shared across claude / codex / opencode wrappers.
// CLAUDE_CONFIG_HOME (exported by init_*.sh into ~/.zshrc) is the primary
// resolution path — it works for both the in-repo plugin and cp-copies under
// ~/.config/opencode/plugins/. The fallback is sized for the cp-copy layout:
// init_opencode.sh symlinks ~/.config/opencode/shared/ → repo/shared/, so
// pluginDir/.. resolves to ~/.config/opencode/ and ../shared/* lands on the
// SSOT. The in-repo case relies on CLAUDE_CONFIG_HOME being set (it is, in
// unit tests we inject it explicitly).
const repoRoot = process.env.CLAUDE_CONFIG_HOME || join(pluginDir, "..")
const hintContentPath = join(repoRoot, "shared/policies/git-commit-hint.json")
const knowledgeReadmePath = join(repoRoot, "docs/knowledge/README.md")
const skipEnvName = "GIT_COMMIT_HINT_SKIP"
const skipValues = new Set(["1", "true", "yes", "on"])

const renderGitCommitHint = async (host) => {
  try {
    const content = JSON.parse(await readFile(hintContentPath, "utf8"))
    return content.template
      .join("\n")
      .replaceAll("{hook_name}", content.hook_names[host])
      .replaceAll("{escape_instruction}", content.escape_instructions[host])
      .replaceAll("{knowledge_readme}", knowledgeReadmePath)
  } catch (err) {
    process.stderr.write(`git-commit-hint: failed to render shared hint: ${err}\n`)
    return ""
  }
}

const isTruthy = (value) => skipValues.has(String(value || "").trim().toLowerCase())

const toolEnvRequestsSkip = (args) => {
  for (const env of [args?.env, args?.environment]) {
    if (env && typeof env === "object" && isTruthy(env[skipEnvName])) return true
  }
  return false
}

// Parse one shell-semantic segment: strip optional `env` prefix, then walk
// leading `VAR=value` tokens to find the skip flag, then require `git commit`
// at the first non-VAR position. Returns true only when the skip flag lives
// in the same segment as `git commit`, which matches the documented escape:
// "命令前缀 GIT_COMMIT_HINT_SKIP=1 git commit ...".
const segmentRequestsSkip = (segment) => {
  let tokens = segment.trim().split(/\s+/).filter(Boolean)
  if (tokens[0] === "env") tokens = tokens.slice(1)

  let skipRequested = false
  let index = 0
  for (; index < tokens.length; index += 1) {
    const match = tokens[index].match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) break
    if (match[1] === skipEnvName && isTruthy(match[2])) skipRequested = true
  }

  return skipRequested && tokens[index] === "git" && tokens[index + 1] === "commit"
}

const commandEnvPrefixRequestsSkip = (command) => {
  // A full bash invocation often strings commands with `;` / `&&` / `||`:
  //   export FOO=1... ; GIT_COMMIT_HINT_SKIP=1 git commit -m "..."
  // The prefix-only parser above would choke on `export` at token 0 and
  // never see the skip flag on the subsequent segment. Split along shell
  // operators so each segment is parsed independently.
  const segments = command.split(/\s*(?:;|&&|\|\|)\s*/)
  return segments.some(segmentRequestsSkip)
}

export const GitCommitHintPlugin = async (ctx) => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "bash") return

      const command = output.args?.command || ""

      // 仅匹配 git commit（排除 git commit-tree/git commit-graph 等子命令）
      if (!/(^|[^\w-])git\s+commit(\s|$)/.test(command)) return

      // 逃生舱：结构化 bash env 优先；无独立 env 字段的工具可用命令前缀赋值
      if (toolEnvRequestsSkip(output.args) || commandEnvPrefixRequestsSkip(command)) return

      const hint = await renderGitCommitHint("opencode")
      if (!hint) return
      throw new Error(hint)
    },
  }
}
