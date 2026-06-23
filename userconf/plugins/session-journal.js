const TEST_CMD_RE = /\b(jest|vitest|pytest|mocha|node --test|npm test|pnpm test|bun test|swift test|cargo test|go test)\b/

import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync, renameSync, readdirSync } from "node:fs"
import { join } from "node:path"

const JOURNAL_FILE = "journal.jsonl"

export function findWorkspaceSessionDir(workdir) {
  const root = workdir || process.cwd()
  return join(root, ".opencode", "session")
}

export function ensureSessionDir(sessionDir) {
  if (!existsSync(sessionDir)) {
    mkdirSync(sessionDir, { recursive: true })
  }
  return sessionDir
}

export function appendEntry(sessionDir, entry) {
  ensureSessionDir(sessionDir)
  appendFileSync(join(sessionDir, JOURNAL_FILE), JSON.stringify(entry) + "\n")
}

export function readJournal(sessionDir) {
  const path = join(sessionDir, JOURNAL_FILE)
  if (!existsSync(path)) return []
  const raw = readFileSync(path, "utf-8")
  const entries = []
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue
    try {
      entries.push(JSON.parse(line))
    } catch {
      // skip malformed lines
    }
  }
  return entries
}

export function archiveSession(sessionDir) {
  const journalPath = join(sessionDir, JOURNAL_FILE)
  if (!existsSync(journalPath)) return

  const archiveDir = join(sessionDir, "archive")
  if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true })

  const ts = new Date().toISOString().replace(/[:.]/g, "-")
  renameSync(journalPath, join(archiveDir, `${ts}.jsonl`))

  const summaryPath = join(sessionDir, "summary.md")
  if (existsSync(summaryPath)) {
    renameSync(summaryPath, join(archiveDir, `${ts}-summary.md`))
  }
}

export function detectRepeatEdits(entries, threshold = 3) {
  const counts = new Map()
  for (const e of entries) {
    if (e.tool !== "edit" && e.tool !== "write") continue
    const key = e.file || ""
    if (!key) continue
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  const patterns = []
  for (const [file, count] of counts) {
    if (count >= threshold) patterns.push({ file, count })
  }
  return patterns
}

export function detectTestFailSequence(entries) {
  const testEntries = entries.filter(
    e => e.tool === "bash" && e.command && TEST_CMD_RE.test(e.command)
  )
  const sequences = []
  let current = null

  for (const e of testEntries) {
    const cmdKey = e.command.replace(/\s+/g, " ").slice(0, 80)
    if (e.exitCode !== 0) {
      if (!current || current.command !== cmdKey) {
        current = { type: "test-fail-cycle", command: cmdKey, failCount: 1 }
      } else {
        current.failCount++
      }
    } else {
      if (current && current.failCount >= 2) {
        sequences.push({ ...current })
      }
      current = null
    }
  }
  if (current && current.failCount >= 2) {
    sequences.push({ ...current })
  }
  return sequences
}

const BYPASS_ENV_RE = /\b[A-Z_]*SKIP[A-Z_]*=\S+/
const BYPASS_FLAG_RE = /--no-verify/

export function detectBypassUsage(entries) {
  const usages = []
  for (const e of entries) {
    if (e.tool !== "bash" || !e.command) continue
    if (BYPASS_ENV_RE.test(e.command)) {
      usages.push({ type: "env-bypass", command: e.command.slice(0, 120) })
    } else if (BYPASS_FLAG_RE.test(e.command)) {
      usages.push({ type: "flag-bypass", command: e.command.slice(0, 120) })
    }
  }
  return usages
}

function findLastTestFail(entries) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e.tool === "bash" && e.command && TEST_CMD_RE.test(e.command) && e.exitCode !== 0) {
      return { command: e.command.slice(0, 80), exitCode: e.exitCode }
    }
  }
  return null
}

export function distill(entries) {
  const repeatEdits = detectRepeatEdits(entries)
  const testCycles = detectTestFailSequence(entries)
  const bypasses = detectBypassUsage(entries)

  const antiPatterns = []
  for (const p of repeatEdits) {
    antiPatterns.push(`${p.file}: 已编辑 ${p.count} 次，可能陷入修复循环，检查是否需要回退或换思路`)
  }
  for (const p of testCycles) {
    antiPatterns.push(`测试命令 "${p.command}" 连续失败 ${p.failCount} 次后才通过，回顾中间修复是否必要`)
  }

  const openIssues = []
  for (const b of bypasses) {
    openIssues.push(`检测到门禁绕过 (${b.type}): ${b.command}`)
  }
  const lastTestFail = findLastTestFail(entries)
  if (lastTestFail) {
    openIssues.push(`最近的测试失败: ${lastTestFail.command} (exit code ${lastTestFail.exitCode})`)
  }

  const editFiles = [...new Set(entries.filter(e => e.tool === "edit" || e.tool === "write").map(e => e.file).filter(Boolean))]
  const progress = editFiles.length ? `本次 session 已编辑 ${editFiles.length} 个文件: ${editFiles.slice(-5).join(", ")}` : ""

  return { antiPatterns, openIssues, progress }
}

export function formatSummary(summary) {
  if (!summary.antiPatterns.length && !summary.openIssues.length && !summary.progress) {
    return ""
  }
  const lines = []
  if (summary.progress) {
    lines.push(`[session-journal] ${summary.progress}`)
  }
  if (summary.antiPatterns.length) {
    lines.push(`⚠️ 反模式:`)
    for (const p of summary.antiPatterns) {
      lines.push(`  - ${p}`)
    }
  }
  if (summary.openIssues.length) {
    lines.push(`⚠️ 开放问题:`)
    for (const i of summary.openIssues) {
      lines.push(`  - ${i}`)
    }
  }
  return lines.join("\n")
}

const SUMMARY_JSON_FILE = "summary.json"
const SUMMARY_MD_FILE = "summary.md"

const EMPTY_SUMMARY = () => ({ antiPatterns: [], openIssues: [], progress: "" })

export function writeSummary(sessionDir, summary) {
  ensureSessionDir(sessionDir)
  writeFileSync(join(sessionDir, SUMMARY_JSON_FILE), JSON.stringify(summary, null, 2))
  const lines = []
  lines.push(`# Session 反模式摘要`)
  lines.push("")
  lines.push(`> 自动蒸馏于 ${new Date().toISOString()}`)
  lines.push("")
  if (summary.progress) {
    lines.push(`**进度**: ${summary.progress}`)
    lines.push("")
  }
  if (summary.antiPatterns.length) {
    lines.push(`## 反模式`)
    for (const p of summary.antiPatterns) {
      lines.push(`- ${p}`)
    }
    lines.push("")
  }
  if (summary.openIssues.length) {
    lines.push(`## 开放问题`)
    for (const i of summary.openIssues) {
      lines.push(`- ${i}`)
    }
  }
  writeFileSync(join(sessionDir, SUMMARY_MD_FILE), lines.join("\n"))
}

export function readSummary(sessionDir) {
  const jsonPath = join(sessionDir, SUMMARY_JSON_FILE)
  if (!existsSync(jsonPath)) return EMPTY_SUMMARY()
  try {
    const data = JSON.parse(readFileSync(jsonPath, "utf-8"))
    return {
      antiPatterns: data.antiPatterns || [],
      openIssues: data.openIssues || [],
      progress: data.progress || "",
    }
  } catch {
    return EMPTY_SUMMARY()
  }
}
