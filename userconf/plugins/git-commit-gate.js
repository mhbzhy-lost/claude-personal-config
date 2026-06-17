/**
 * git-commit-gate plugin for OpenCode
 *
 * Programmatic enforcement of the commit message format defined in
 * userconf/AGENTS.md `Git Commit 规范` section. Runs at tool.execute.before on the
 * bash tool: parses the shell command to extract the commit message, validates
 * it against the conventional-commit rules, and throws a structured error
 * when violations are found — agent sees the feedback inline and can retry.
 *
 * Complements the pre-commit git hook (.githooks/pre-commit-commit-message)
 * which runs the same validation at the git layer as a backstop.
 *
 * Skip flag: GIT_COMMIT_HOOK_SKIP=1 in the bash env or command prefix
 * bypasses validation, matching the pattern used by git-commit-hint.js.
 */

const GIT_COMMIT_RE = /(?:^|[^a-zA-Z0-9_-])git\s+commit(?:\s|$)/
const SKIP_ENV = "GIT_COMMIT_HOOK_SKIP"
const SKIP_VALUES = new Set(["1", "true", "yes", "on"])
const VALID_TYPES = new Set([
  "feat", "fix", "refactor", "perf", "test", "docs",
  "style", "chore", "build", "ci", "revert",
])

const SUBJECT_RE = /^(?<type>[a-z]+)(?:\([^)]+\))?(?<bang>!)?:\s*(?<subject>.+)$/
const CHINESE_CHAR_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/

const isTruthy = (v) => SKIP_VALUES.has(String(v || "").trim().toLowerCase())

/**
 * Parse a bash command containing `git commit` and extract the message.
 * Returns { message: string|null, fromFile: boolean }.
 * - `-m "<msg>"` / `--message "<msg>"`: extract quoted string (supports `\"` escapes)
 * - `-m $'<msg>'`: extract dollar-sign ANSI-C string (supports \n, \t, etc.)
 * - `-m <word>`: bare word
 * - `-F <path>` / `--file <path>`: sets fromFile = true, message = null
 * - `--amend --no-edit`: message = null
 * - No message flag: message = null
 */
const processDollarAnsi = (raw) =>
  raw.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\\\/g, "\\")

export const parseGitCommitArgs = (command) => {
  let fromFile = false

  // Heredoc / $(...) shell expansion — can't reliably extract the message
  // from a regex parse of the raw command string. Treat like -F / --file.
  if (/\$\(\s*cat\s*<</.test(command)) {
    return { message: null, fromFile: true }
  }

  const dollarLong = command.match(/--message\s*=\s*\$'([\s\S]*?)'|--message\s+\$'([\s\S]*?)'/)
  if (dollarLong) {
    return { message: processDollarAnsi(dollarLong[1] ?? dollarLong[2] ?? ""), fromFile }
  }

  const messageLong = command.match(
    /--message(?:=\s*|\s+)(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(\S+))/,
  )
  if (messageLong) {
    const raw = messageLong[1] ?? messageLong[2] ?? messageLong[3] ?? ""
    return { message: raw, fromFile }
  }

  const gitPos = command.indexOf("git commit")
  if (gitPos === -1) return { message: null, fromFile }
  const afterCommit = command.slice(gitPos)

  const dollarShort = afterCommit.match(/\s-m\s*\$'([\s\S]*?)'/)
  if (dollarShort) {
    return { message: processDollarAnsi(dollarShort[1]), fromFile }
  }

  const quotedShort = afterCommit.match(
    /\s-m\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(\S+))/,
  )
  if (quotedShort) {
    const raw = quotedShort[1] ?? quotedShort[2] ?? quotedShort[3] ?? ""
    return { message: raw, fromFile }
  }

  if (/\s-F(?:\s|=)|\s--file(?:\s|=)/.test(afterCommit)) {
    fromFile = true
  }

  return { message: null, fromFile }
}

/**
 * Validate a commit message. Returns { errors: Array<{code, detail}> }.
 * Empty errors array = passes validation.
 */
export const validateCommitMessage = (message) => {
  const errors = []
  const trimmed = message.trim()
  const [firstLine] = trimmed.split("\n")

  const lowerMsg = trimmed.toLowerCase()
  if (
    /co-authored-by:.*\b(claude|copilot|cursor|windsurf|cody)\b/i.test(lowerMsg) ||
    /generated with (claude|copilot|cursor)/i.test(lowerMsg) ||
    /ai-assisted/i.test(lowerMsg)
  ) {
    errors.push({
      code: "AI_SIGNATURE",
      detail:
        "commit message 中出现 AI 工具署名（Co-Authored-By: Claude/Copilot / Generated with Claude），严格禁止",
    })
  }

  const match = firstLine.match(SUBJECT_RE)
  if (!match) {
    errors.push({
      code: "MISSING_SUBJECT",
      detail:
        "首行格式错误。应为 `type(scope): 中文简述` 或 `type: 中文简述`",
    })
    return { errors }
  }

  const { type, subject } = match.groups

  if (!VALID_TYPES.has(type)) {
    errors.push({
      code: "BAD_TYPE",
      detail: `无效 type: "${type}"。允许值：${[...VALID_TYPES].sort().join(", ")}`,
    })
  }

  if (!subject || !subject.trim()) {
    errors.push({ code: "MISSING_SUBJECT", detail: "subject 缺失（冒号后无内容）" })
    return { errors }
  }

  if (!CHINESE_CHAR_RE.test(subject)) {
    errors.push({
      code: "SUBJECT_NO_CHINESE",
      detail: "subject 必须包含中文字符（祈使句中文）",
    })
  }

  if (subject.endsWith("。") || subject.endsWith(".")) {
    errors.push({
      code: "SUBJECT_ENDS_WITH_PUNCTUATION",
      detail: "subject 不能以句号（。/ .）结尾",
    })
  }

  if (/已(?:修复|实现|增加|新增)/.test(subject)) {
    errors.push({
      code: "SUBJECT_PAST_TENSE",
      detail: "subject 不能用过去时（已修复 / 已实现 / 已增加）。用祈使句：修复 / 实现 / 增加",
    })
  }
  if (/了(?:\s|$|，|。)/.test(subject) || /修复了|实现了|增加了|新增了|删除了/.test(subject)) {
    errors.push({
      code: "SUBJECT_PAST_TENSE",
      detail: "subject 不要用「X了」。用祈使句：修复 / 实现 / 增加",
    })
  }

  const ZERO_INFO = new Set([
    "fix", "update", "bugfix", "wip", "modify",
    "修改", "更新", "改动", "调整", "变更",
  ])
  if (ZERO_INFO.has(subject.trim().toLowerCase())) {
    errors.push({
      code: "ZERO_INFO_SUBJECT",
      detail: "subject 信息量为零。描述具体做了什么，不要只写「fix」「update」「update」「修改」",
    })
  }

  return { errors }
}

const commandHasSkip = (command) => {
  const segments = command.split(/\s*(?:;|&&|\|\|)\s*/)
  return segments.some((segment) => {
    let tokens = segment
      .trim()
      .split(/(?:\s|&&|;|\|\|)+/)
      .filter(Boolean)
    if (tokens[0] === "env") tokens = tokens.slice(1)
    for (const tok of tokens) {
      const eq = tok.indexOf("=")
      if (eq <= 0) break
      const name = tok.slice(0, eq)
      const value = tok.slice(eq + 1)
      if (name === SKIP_ENV && isTruthy(value)) return true
    }
    return false
  })
}

const toolEnvSkip = (args) => {
  for (const env of [args?.env, args?.environment]) {
    if (env && typeof env === "object" && isTruthy(env[SKIP_ENV])) return true
  }
  return false
}

const formatErrors = (errors) => {
  const lines = [
    "commit message 不符合 Conventional Commits 规范，已阻断。",
    "",
  ]
  for (const err of errors) {
    lines.push(`[${err.code}] ${err.detail}`)
  }
  lines.push("")
  lines.push("示例格式：")
  lines.push("  feat(scope): 增加节点级恢复 picker")
  lines.push("  fix(recovery): 修复 abort 后未真正退出")
  lines.push("  refactor(status): .status 写盘加 checksum 与双副本")
  lines.push("")
  lines.push(
    "逃逸：GIT_COMMIT_HOOK_SKIP=1 bash 工具 env 字段，或命令前缀 GIT_COMMIT_HOOK_SKIP=1 git commit ...",
  )
  return lines.join("\n")
}

export const GitCommitGatePlugin = async () => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "bash") return

      const command = output.args?.command || ""
      if (!GIT_COMMIT_RE.test(command)) return

      if (toolEnvSkip(output.args) || commandHasSkip(command)) return

      const { message, fromFile } = parseGitCommitArgs(command)

      if (fromFile) return
      if (message === null) return

      const { errors } = validateCommitMessage(message)
      if (errors.length > 0) {
        throw new Error(formatErrors(errors))
      }
    },
  }
}

export default GitCommitGatePlugin
