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
// All failures are logged to ${CLAUDE_CONFIG_HOME}/logs/external-review-gate.log.

import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = process.env.CLAUDE_CONFIG_HOME || join(__dirname, "..")
const HOOK_SCRIPT = join(repoRoot, "shared", "hooks", "external-review-gate.sh")
const LOG_DIR = join(repoRoot, "logs")
const LOG_FILE = join(LOG_DIR, "external-review-gate.log")
const LOG_ROTATE_SIZE = 1 * 1024 * 1024

const SKIP_ENV = "EXTERNAL_REVIEW_SKIP"
const SKIP_VALUES = new Set(["1", "true", "yes", "on"])
const isTruthy = (v) => SKIP_VALUES.has(String(v ?? "").trim().toLowerCase())

export const extractSkipLine = (stderr) => {
  if (!stderr) return null
  for (const line of stderr.split("\n")) {
    const t = line.trim()
    if (/\bskip:|\ballow\b|\bexempt:/.test(t)) {
      return t.replace(/^\[external-review-gate\]\s*/, "")
    }
  }
  return null
}

export const sanitizeStderr = (input) => {
  if (input == null) return ""
  const s = String(input)
  if (!s) return s
  return s
    .replace(/Bearer\s+[^\s;,\)]+/gi, "Bearer [REDACTED]")
    .replace(/x-api-key:\s*[^\s,;]+/gi, "x-api-key: [REDACTED]")
    .replace(
      /(api[_-]?key|token|secret|access[_-]?token|auth[_-]?token)([=:])([^\s&;,'"`]+|\{[^}]*\})/gi,
      "$1$2[REDACTED]",
    )
    .replace(
      /"(api[_-]?key|token|secret|access[_-]?token|auth[_-]?token)"\s*:\s*"[^"]*"/gi,
      '"$1":"[REDACTED]"',
    )
}

const appendLog = (label, text) => {
  try {
    if (!text || !text.trim()) return
    mkdirSync(LOG_DIR, { recursive: true })
    try {
      if (statSync(LOG_FILE).size > LOG_ROTATE_SIZE) {
        writeFileSync(LOG_FILE, "")
      }
    } catch { /* first write */ }
    const ts = new Date().toISOString()
    writeFileSync(
      LOG_FILE,
      `[${ts}] ${label}\n${text}\n`,
      { flag: "a" },
    )
  } catch {
    // Last-resort: surface on stderr if file write fails
    process.stderr.write(`[external-review-gate] ${label}\n${text}\n`)
  }
}

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

      // Capture stdout (hook response) AND stderr (diagnostic logs)
      let stdout = ""
      let stderr = ""
      try {
        stdout = execFileSync("bash", [HOOK_SCRIPT], {
          input: payload,
          encoding: "utf-8",
          timeout: 600_000,
          maxBuffer: 10 * 1024 * 1024,
          stdio: ["pipe", "pipe", "pipe"],
        }) ?? ""
        stderr = ""
      } catch (err) {
        stderr = err?.stderr?.toString?.() ?? String(err)
        appendLog(`FAIL (git push: ${command.slice(0, 80)})`, sanitizeStderr(stderr))
        return
      }

      if (stderr.trim()) {
        appendLog(`RUN (git push: ${command.slice(0, 80)})`, sanitizeStderr(stderr))
        const reason = extractSkipLine(stderr)
        if (reason) console.log(reason)
      }

      const trimmed = stdout.trim()
      if (!trimmed) return

      let response
      try {
        response = JSON.parse(trimmed)
      } catch (err) {
        appendLog("PARSE_ERROR", `stdout: ${trimmed.slice(0, 500)}\nerr: ${err.message}`)
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
