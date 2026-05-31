/**
 * Block `rm` targets outside the current workspace.
 *
 * This intentionally has no agent-visible escape hatch. If the agent needs to
 * remove an external path, it must print the exact command for the user to run
 * manually.
 */

import { existsSync, realpathSync } from "node:fs"
import { resolve, sep } from "node:path"

const CONTROL_SPLIT = new Set([";", "&&", "||"])
const WRAPPER_COMMANDS = new Set(["sudo", "command"])

const splitSegments = (command) => {
  const segments = []
  let current = ""
  let quote = null

  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i]
    const next = command[i + 1]

    if (quote) {
      current += ch
      if (ch === quote) quote = null
      continue
    }

    if (ch === "'" || ch === '"') {
      quote = ch
      current += ch
      continue
    }

    if (ch === ";" || (ch === "&" && next === "&") || (ch === "|" && next === "|")) {
      if (current.trim()) segments.push(current.trim())
      current = ""
      if (ch !== ";") i += 1
      continue
    }

    current += ch
  }

  if (current.trim()) segments.push(current.trim())
  return segments
}

const tokenize = (segment) => {
  const tokens = []
  let current = ""
  let quote = null

  for (let i = 0; i < segment.length; i += 1) {
    const ch = segment[i]

    if (quote) {
      if (ch === quote) {
        quote = null
      } else {
        current += ch
      }
      continue
    }

    if (ch === "'" || ch === '"') {
      quote = ch
      continue
    }

    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current)
        current = ""
      }
      continue
    }

    current += ch
  }

  if (current) tokens.push(current)
  return tokens
}

const isAssignment = (token) => /^[A-Za-z_][A-Za-z0-9_]*=.*$/.test(token)
const isRmCommand = (token) => token === "rm" || token.endsWith("/rm")

const normalizeExistingOrLexical = (path) => {
  try {
    return existsSync(path) ? realpathSync(path) : resolve(path)
  } catch {
    return resolve(path)
  }
}

const isInside = (candidate, root) => {
  const normalizedRoot = root.endsWith(sep) ? root : root + sep
  return candidate === root || candidate.startsWith(normalizedRoot)
}

const commandStartIndex = (tokens) => {
  let index = 0
  if (tokens[index] === "env") index += 1
  while (index < tokens.length && isAssignment(tokens[index])) index += 1
  while (WRAPPER_COMMANDS.has(tokens[index])) index += 1
  return index
}

const rmTargets = (tokens, rmIndex) => {
  const targets = []
  let optionsEnded = false

  for (const token of tokens.slice(rmIndex + 1)) {
    if (!optionsEnded && token === "--") {
      optionsEnded = true
      continue
    }
    if (!optionsEnded && token.startsWith("-")) continue
    targets.push(token)
  }

  return targets
}

const hasShellExpansion = (target) => /[$`*?\[\]{}]/.test(target)

const checkedRmTargets = (command, workspaceRoot, initialCwd) => {
  const blocked = []
  let cwd = initialCwd

  for (const segment of splitSegments(command)) {
    const tokens = tokenize(segment)
    if (tokens.length === 0) continue

    const start = commandStartIndex(tokens)
    if (tokens[start] === "cd" && tokens[start + 1]) {
      cwd = normalizeExistingOrLexical(resolve(cwd, tokens[start + 1]))
      continue
    }

    if (!isRmCommand(tokens[start])) continue

    for (const target of rmTargets(tokens, start)) {
      if (hasShellExpansion(target)) {
        blocked.push({ target, absoluteTarget: `${target}（包含 shell 展开，需用户手动确认）` })
        continue
      }
      const absoluteTarget = normalizeExistingOrLexical(resolve(cwd, target))
      if (!isInside(absoluteTarget, workspaceRoot)) {
        blocked.push({ target, absoluteTarget })
      }
    }
  }

  return blocked
}

export const RmOutsideWorkspaceGuardPlugin = async () => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "bash") return

      const command = output.args?.command || ""
      const hasRmCommand =
        /(^|[;&|]\s*)(env\s+)?(\w+=\S+\s+)*(sudo\s+|command\s+)*(?:\S+\/)?rm(\s|$)/.test(command) ||
        /(\$\(|`)[^`)]*\brm\b/.test(command)
      if (!command || !hasRmCommand) {
        return
      }

      if (/[|$`()]/.test(command)) {
        throw new Error(
          "workspace 外 rm 已被阻断。\n" +
          "rm 命令包含 pipe、变量、命令替换或 subshell 等 shell 展开，OpenCode 不能安全判断目标；" +
          "如确需删除，请用户手动执行：\n\n" +
          command,
        )
      }

      const cwd = normalizeExistingOrLexical(
        output.args?.cwd || output.args?.workdir || process.cwd(),
      )
      const workspaceRoot = normalizeExistingOrLexical(output.args?.workspaceRoot || cwd)
      const blocked = checkedRmTargets(command, workspaceRoot, cwd)

      if (blocked.length === 0) return

      const blockedList = blocked.map((item) => `- ${item.absoluteTarget}`).join("\n")
      throw new Error(
        "workspace 外 rm 已被阻断。\n" +
        "OpenCode 不能代为执行该删除；如确需删除，请用户手动执行：\n\n" +
        `${command}\n\n` +
        `阻断目标：\n${blockedList}`,
      )
    },
  }
}
