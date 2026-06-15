// external-review-gate.js
//
// OpenCode plugin: intercept git push via tool.execute.before, delegate to
// the shared review gate hook script (shared/hooks/external-review-gate.sh).
//
// The hook script is host-agnostic — reads stdin JSON (Claude Code protocol),
// outputs stdout JSON. This plugin translates the result to OpenCode's
// throw-to-block mechanism.
//
// Fail-open: script failure / timeout → allow (consistent with Claude Code end).

import { execFileSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = process.env.CLAUDE_CONFIG_HOME || join(__dirname, "..")
const HOOK_SCRIPT = join(repoRoot, "shared", "hooks", "external-review-gate.sh")

const SKIP_ENV = "EXTERNAL_REVIEW_SKIP"
const SKIP_VALUES = new Set(["1", "true", "yes", "on"])
const isTruthy = (v) => SKIP_VALUES.has(String(v ?? "").trim().toLowerCase())

export const ExternalReviewGatePlugin = async () => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "bash") return

      const command = output.args?.command || ""
      if (!/(^|[^\w-])git\s+push(\s|$)/.test(command)) return

      // Escape hatch: command prefix (fast path, avoid subprocess)
      const skipMatch = command.match(
        new RegExp(`${SKIP_ENV}=(\\S+)\\s+git\\s+push`),
      )
      if (skipMatch && isTruthy(skipMatch[1])) return

      // Construct payload matching Claude Code hook protocol.
      // Include env/environment so the bash script can check structured escape hatch.
      const payload = JSON.stringify({
        tool_name: "Bash",
        tool_input: {
          command,
          ...(output.args?.env ? { env: output.args.env } : {}),
          ...(output.args?.environment
            ? { environment: output.args.environment }
            : {}),
        },
      })

      // Run the hook script (it handles all logic: env check, diff, review, marker)
      let stdout
      try {
        stdout = execFileSync("bash", [HOOK_SCRIPT], {
          input: payload,
          encoding: "utf-8",
          timeout: 600_000,
          maxBuffer: 10 * 1024 * 1024,
          stdio: ["pipe", "pipe", "pipe"],
        })
      } catch {
        // Fail-open: script failure, timeout → allow
        return
      }

      // Parse response — empty stdout = silent pass-through (non-push, exempt, etc.)
      const trimmed = stdout.trim()
      if (!trimmed) return

      let response
      try {
        response = JSON.parse(trimmed)
      } catch {
        return
      }

      const hookOutput = response?.hookSpecificOutput
      if (hookOutput?.permissionDecision === "deny") {
        throw new Error(
          hookOutput.permissionDecisionReason || "External review denied",
        )
      }
      // "allow" or unrecognized → proceed
    },
  }
}
