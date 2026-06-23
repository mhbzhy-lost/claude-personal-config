import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { mkdtempSync, rmSync, mkdirSync, existsSync, appendFileSync, writeFileSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  distill,
  detectRepeatEdits,
  detectTestFailSequence,
  detectBypassUsage,
  formatSummary,
  findWorkspaceSessionDir,
  appendEntry,
  readJournal,
  archiveSession,
  ensureSessionDir,
  writeSummary,
  readSummary,
  SessionJournalPlugin,
} from "../session-journal.js"

describe("distill()", () => {
  it("空 journal 返回空 summary", () => {
    const result = distill([])
    assert.deepEqual(result, { antiPatterns: [], openIssues: [], progress: "" })
  })
})

describe("detectRepeatEdits()", () => {
  it("同一文件编辑 3 次应检测为反模式", () => {
    const entries = [
      { tool: "edit", file: "src/auth.ts", ts: 1 },
      { tool: "edit", file: "src/util.ts", ts: 2 },
      { tool: "edit", file: "src/auth.ts", ts: 3 },
      { tool: "edit", file: "src/auth.ts", ts: 4 },
    ]
    const result = detectRepeatEdits(entries, 3)
    assert.equal(result.length, 1)
    assert.equal(result[0].file, "src/auth.ts")
    assert.equal(result[0].count, 3)
  })

  it("不同文件各编辑 1 次不应触发", () => {
    const entries = [
      { tool: "edit", file: "src/a.ts", ts: 1 },
      { tool: "edit", file: "src/b.ts", ts: 2 },
    ]
    assert.equal(detectRepeatEdits(entries, 3).length, 0)
  })

  it("阈值可通过参数调整", () => {
    const entries = [
      { tool: "edit", file: "src/a.ts", ts: 1 },
      { tool: "edit", file: "src/a.ts", ts: 2 },
    ]
    assert.equal(detectRepeatEdits(entries, 3).length, 0)
    assert.equal(detectRepeatEdits(entries, 2).length, 1)
  })

  it("只统计 edit 和 write 工具，忽略 read/bash", () => {
    const entries = [
      { tool: "read", file: "src/a.ts", ts: 1 },
      { tool: "bash", file: "src/a.ts", ts: 2 },
      { tool: "edit", file: "src/a.ts", ts: 3 },
    ]
    assert.equal(detectRepeatEdits(entries, 2).length, 0)
  })
})

describe("detectTestFailSequence()", () => {
  it("检测 test fail → edit → fail 循环", () => {
    const entries = [
      { tool: "bash", command: "npm test", exitCode: 1, ts: 1 },
      { tool: "edit", file: "src/auth.ts", ts: 2 },
      { tool: "bash", command: "npm test", exitCode: 1, ts: 3 },
      { tool: "edit", file: "src/auth.ts", ts: 4 },
      { tool: "bash", command: "npm test", exitCode: 0, ts: 5 },
    ]
    const result = detectTestFailSequence(entries)
    assert.equal(result.length, 1)
    assert.equal(result[0].type, "test-fail-cycle")
    assert.equal(result[0].command, "npm test")
    assert.equal(result[0].failCount, 2)
  })

  it("单次 test fail 不触发", () => {
    const entries = [
      { tool: "bash", command: "npm test", exitCode: 1, ts: 1 },
      { tool: "bash", command: "npm test", exitCode: 0, ts: 2 },
    ]
    assert.equal(detectTestFailSequence(entries).length, 0)
  })

  it("非 test 命令不参与匹配", () => {
    const entries = [
      { tool: "bash", command: "ls -la", exitCode: 1, ts: 1 },
      { tool: "bash", command: "ls -la", exitCode: 1, ts: 2 },
    ]
    assert.equal(detectTestFailSequence(entries).length, 0)
  })
})

describe("detectBypassUsage()", () => {
  it("检测 SKIP 环境变量", () => {
    const entries = [
      { tool: "bash", command: "GIT_COMMIT_HOOK_SKIP=1 git commit -m 'test'", ts: 1 },
    ]
    const result = detectBypassUsage(entries)
    assert.equal(result.length, 1)
    assert.equal(result[0].type, "env-bypass")
  })

  it("无 bypass 的命令不触发", () => {
    const entries = [
      { tool: "bash", command: "git commit -m 'test'", ts: 1 },
    ]
    assert.equal(detectBypassUsage(entries).length, 0)
  })

  it("检测 --no-verify flag", () => {
    const entries = [
      { tool: "bash", command: "git commit --no-verify -m 'test'", ts: 1 },
    ]
    const result = detectBypassUsage(entries)
    assert.equal(result.length, 1)
    assert.equal(result[0].type, "flag-bypass")
  })
})

describe("distill() 聚合", () => {
  it("聚合所有检测结果", () => {
    const entries = [
      { tool: "edit", file: "src/auth.ts", ts: 1 },
      { tool: "edit", file: "src/auth.ts", ts: 2 },
      { tool: "edit", file: "src/auth.ts", ts: 3 },
      { tool: "bash", command: "npm test", exitCode: 1, ts: 4 },
      { tool: "edit", file: "src/auth.ts", ts: 5 },
      { tool: "bash", command: "npm test", exitCode: 1, ts: 6 },
      { tool: "edit", file: "src/auth.ts", ts: 7 },
      { tool: "bash", command: "npm test", exitCode: 0, ts: 8 },
      { tool: "bash", command: "GIT_COMMIT_HOOK_SKIP=1 git commit -m 'x'", ts: 9 },
    ]
    const result = distill(entries)
    assert.ok(result.antiPatterns.length > 0)
    assert.ok(result.openIssues.length > 0)
  })

  it("生成 human-readable progress 摘要", () => {
    const entries = [
      { tool: "edit", file: "src/a.ts", ts: 1 },
      { tool: "edit", file: "src/b.ts", ts: 2 },
      { tool: "bash", command: "npm test", exitCode: 0, ts: 3 },
    ]
    const result = distill(entries)
    assert.ok(result.progress.includes("2"))
    assert.ok(result.progress.includes("src/a.ts") || result.progress.includes("src/b.ts"))
  })
})

describe("formatSummary()", () => {
  it("将 distill 结果格式化为 agent 可读文本", () => {
    const summary = {
      antiPatterns: ["src/a.ts: 已编辑 5 次"],
      openIssues: ["最近的测试失败: npm test"],
      progress: "本次 session 已编辑 2 个文件",
    }
    const text = formatSummary(summary)
    assert.ok(text.includes("⚠️"))
    assert.ok(text.includes("src/a.ts"))
    assert.ok(text.includes("npm test"))
  })

  it("空 summary 返回空字符串", () => {
    const summary = { antiPatterns: [], openIssues: [], progress: "" }
    assert.equal(formatSummary(summary), "")
  })

  it("只有 progress 没有反模式时只输出 progress", () => {
    const summary = { antiPatterns: [], openIssues: [], progress: "已编辑 1 个文件" }
    const text = formatSummary(summary)
    assert.ok(text.includes("已编辑"))
    assert.ok(!text.includes("⚠️"))
  })
})

// =============================================
// Task 2: Journal I/O 测试
// =============================================

describe("findWorkspaceSessionDir()", () => {
  it("workdir 直接返回 session 路径", () => {
    const dir = findWorkspaceSessionDir("/some/workspace")
    assert.equal(dir, join("/some/workspace", ".opencode", "session"))
  })

  it("workdir 为 null 时 fallback 到 cwd", () => {
    const dir = findWorkspaceSessionDir(null)
    assert.ok(dir.endsWith(".opencode/session") || dir.includes(".opencode"))
  })
})

describe("appendEntry()", () => {
  it("写入 JSONL 条目", () => {
    const tmpRepo = mkdtempSync(join(tmpdir(), "sj-test-"))
    const sessionDir = join(tmpRepo, ".opencode", "session")
    ensureSessionDir(sessionDir)
    try {
      appendEntry(sessionDir, { tool: "edit", file: "src/a.ts", ts: 1 })
      appendEntry(sessionDir, { tool: "bash", command: "ls", exitCode: 0, ts: 2 })
      const entries = readJournal(sessionDir)
      assert.equal(entries.length, 2)
      assert.equal(entries[0].tool, "edit")
      assert.equal(entries[1].tool, "bash")
    } finally {
      rmSync(tmpRepo, { recursive: true, force: true })
    }
  })

  it("不存在的 journal 返回空数组", () => {
    const tmpRepo = mkdtempSync(join(tmpdir(), "sj-test-"))
    const sessionDir = join(tmpRepo, ".opencode", "session")
    ensureSessionDir(sessionDir)
    try {
      assert.deepEqual(readJournal(sessionDir), [])
    } finally {
      rmSync(tmpRepo, { recursive: true, force: true })
    }
  })

  it("损坏的 JSON 行跳过并继续", () => {
    const tmpRepo = mkdtempSync(join(tmpdir(), "sj-test-"))
    const sessionDir = join(tmpRepo, ".opencode", "session")
    ensureSessionDir(sessionDir)
    try {
      appendEntry(sessionDir, { tool: "edit", file: "a.ts", ts: 1 })
      appendFileSync(join(sessionDir, "journal.jsonl"), "NOT JSON\n")
      appendEntry(sessionDir, { tool: "write", file: "b.ts", ts: 2 })
      const entries = readJournal(sessionDir)
      assert.equal(entries.length, 2)
    } finally {
      rmSync(tmpRepo, { recursive: true, force: true })
    }
  })
})

describe("archiveSession()", () => {
  it("将当前 journal 移到 archive 目录", () => {
    const tmpRepo = mkdtempSync(join(tmpdir(), "sj-test-"))
    const sessionDir = join(tmpRepo, ".opencode", "session")
    ensureSessionDir(sessionDir)
    try {
      appendFileSync(join(sessionDir, "journal.jsonl"), '{"tool":"edit","ts":1}\n')
      writeFileSync(join(sessionDir, "summary.md"), "# Test summary")

      archiveSession(sessionDir)

      assert.ok(!existsSync(join(sessionDir, "journal.jsonl")))
      assert.ok(existsSync(join(sessionDir, "archive")))
      const archived = readdirSync(join(sessionDir, "archive"))
      assert.ok(archived.length >= 1)
    } finally {
      rmSync(tmpRepo, { recursive: true, force: true })
    }
  })

  it("空 journal 不归档，archive 目录不创建", () => {
    const tmpRepo = mkdtempSync(join(tmpdir(), "sj-test-"))
    const sessionDir = join(tmpRepo, ".opencode", "session")
    ensureSessionDir(sessionDir)
    try {
      archiveSession(sessionDir)
      assert.ok(!existsSync(join(sessionDir, "archive")))
    } finally {
      rmSync(tmpRepo, { recursive: true, force: true })
    }
  })
})

// =============================================
// Task 3: Summary 读写测试
// =============================================

describe("writeSummary() + readSummary()", () => {
  it("写入并读回 summary", () => {
    const tmpRepo = mkdtempSync(join(tmpdir(), "sj-test-"))
    const sessionDir = join(tmpRepo, ".opencode", "session")
    ensureSessionDir(sessionDir)
    try {
      const summary = {
        antiPatterns: ["src/a.ts: 已编辑 3 次"],
        openIssues: [],
        progress: "已编辑 1 个文件",
      }
      writeSummary(sessionDir, summary)
      const loaded = readSummary(sessionDir)
      assert.deepEqual(loaded, summary)
    } finally {
      rmSync(tmpRepo, { recursive: true, force: true })
    }
  })

  it("不存在的 summary 返回空 summary", () => {
    const tmpRepo = mkdtempSync(join(tmpdir(), "sj-test-"))
    const sessionDir = join(tmpRepo, ".opencode", "session")
    ensureSessionDir(sessionDir)
    try {
      const loaded = readSummary(sessionDir)
      assert.deepEqual(loaded, { antiPatterns: [], openIssues: [], progress: "" })
    } finally {
      rmSync(tmpRepo, { recursive: true, force: true })
    }
  })

  it("写入 summary.md 包含反模式内容", () => {
    const tmpRepo = mkdtempSync(join(tmpdir(), "sj-test-"))
    const sessionDir = join(tmpRepo, ".opencode", "session")
    ensureSessionDir(sessionDir)
    try {
      const summary = {
        antiPatterns: ["src/auth.ts: 已编辑 5 次"],
        openIssues: ["门禁绕过"],
        progress: "已编辑 2 个文件",
      }
      writeSummary(sessionDir, summary)
      const mdPath = join(sessionDir, "summary.md")
      assert.ok(existsSync(mdPath))
      const md = readFileSync(mdPath, "utf-8")
      assert.ok(md.includes("src/auth.ts"))
      assert.ok(md.includes("门禁绕过"))
    } finally {
      rmSync(tmpRepo, { recursive: true, force: true })
    }
  })
})

// =============================================
// Task 4: SessionJournalPlugin factory + after hook
// =============================================

describe("SessionJournalPlugin", () => {
  it("export async factory 函数", () => {
    assert.equal(typeof SessionJournalPlugin, "function")
  })

  it("返回 tool.execute.after + experimental.session.compacting + event hooks", async () => {
    const hooks = await SessionJournalPlugin({})
    assert.equal(typeof hooks["tool.execute.after"], "function")
    assert.equal(typeof hooks["experimental.session.compacting"], "function")
    assert.equal(typeof hooks["event"], "function")
  })
})

describe("tool.execute.after hook", () => {
  it("bash 命令写入 journal entry", async () => {
    const tmpRepo = mkdtempSync(join(tmpdir(), "sj-hook-"))
    try {
      const hooks = await SessionJournalPlugin({})
      const after = hooks["tool.execute.after"]
      await after(
        { tool: "bash" },
        { args: { command: "ls -la", workdir: tmpRepo }, exitCode: 0 }
      )
      const sessionDir = findWorkspaceSessionDir(tmpRepo)
      const entries = readJournal(sessionDir)
      assert.equal(entries.length, 1)
      assert.equal(entries[0].tool, "bash")
      assert.equal(entries[0].command, "ls -la")
    } finally {
      rmSync(tmpRepo, { recursive: true, force: true })
    }
  })

  it("edit 命令后注入 summary 到 output", async () => {
    const tmpRepo = mkdtempSync(join(tmpdir(), "sj-hook-"))
    const sessionDir = findWorkspaceSessionDir(tmpRepo)
    ensureSessionDir(sessionDir)
    try {
      writeSummary(sessionDir, {
        antiPatterns: ["test.ts: 已编辑 5 次"],
        openIssues: [],
        progress: "已编辑 1 个文件",
      })
      const hooks = await SessionJournalPlugin({})
      const after = hooks["tool.execute.after"]
      const input = { tool: "edit", args: { filePath: "test.ts" } }
      const output = { args: { workdir: tmpRepo }, output: "Edit successful" }
      await after(input, output)
      assert.ok(output.output.includes("test.ts: 已编辑 5 次"))
    } finally {
      rmSync(tmpRepo, { recursive: true, force: true })
    }
  })

  it("空 summary 不注入任何内容", async () => {
    const tmpRepo = mkdtempSync(join(tmpdir(), "sj-hook-"))
    try {
      const hooks = await SessionJournalPlugin({})
      const after = hooks["tool.execute.after"]
      const input = { tool: "edit", args: { filePath: "a.ts" } }
      const output = { args: { workdir: tmpRepo }, output: "Edit successful" }
      await after(input, output)
      assert.equal(output.output, "Edit successful")
    } finally {
      rmSync(tmpRepo, { recursive: true, force: true })
    }
  })

  it("read 工具不触发 summary 注入", async () => {
    const tmpRepo = mkdtempSync(join(tmpdir(), "sj-hook-"))
    const sessionDir = findWorkspaceSessionDir(tmpRepo)
    ensureSessionDir(sessionDir)
    writeSummary(sessionDir, { antiPatterns: ["x.ts: 已编辑 3 次"], openIssues: [], progress: "" })
    try {
      const hooks = await SessionJournalPlugin({})
      const after = hooks["tool.execute.after"]
      const input = { tool: "read" }
      const output = { args: { workdir: tmpRepo }, output: "file content" }
      await after(input, output)
      assert.equal(output.output, "file content")
    } finally {
      rmSync(tmpRepo, { recursive: true, force: true })
    }
  })

  it("累计编辑条目触发蒸馏", async () => {
    const tmpRepo = mkdtempSync(join(tmpdir(), "sj-hook-"))
    try {
      const hooks = await SessionJournalPlugin({})
      const after = hooks["tool.execute.after"]
      for (let i = 0; i < 12; i++) {
        await after(
          { tool: "edit", args: { filePath: `src/file${i}.ts` } },
          { args: { workdir: tmpRepo }, output: `Edit #${i}` }
        )
      }
      const sessionDir = findWorkspaceSessionDir(tmpRepo)
      const summary = readSummary(sessionDir)
      assert.ok(summary.progress.length > 0, "蒸馏应在累计足够条目后触发")
    } finally {
      rmSync(tmpRepo, { recursive: true, force: true })
    }
  })
})

// =============================================
// Task 5: experimental.session.compacting hook
// =============================================

describe("experimental.session.compacting hook", () => {
  it("存在 summary 时注入到 compaction context", async () => {
    const tmpRepo = mkdtempSync(join(tmpdir(), "sj-compact-"))
    const sessionDir = findWorkspaceSessionDir(tmpRepo)
    ensureSessionDir(sessionDir)
    try {
      writeSummary(sessionDir, {
        antiPatterns: ["src/auth.ts: 已编辑 5 次"],
        openIssues: ["最近的测试失败: npm test"],
        progress: "已编辑 3 个文件",
      })
      const hooks = await SessionJournalPlugin({ directory: tmpRepo })
      const compacting = hooks["experimental.session.compacting"]
      const output = { context: [], prompt: null }
      await compacting({}, output)
      assert.ok(output.context.length > 0)
      const injected = output.context.join("\n")
      assert.ok(injected.includes("src/auth.ts"))
      assert.ok(injected.includes("npm test"))
    } finally {
      rmSync(tmpRepo, { recursive: true, force: true })
    }
  })

  it("无 summary 时不注入任何 context", async () => {
    const tmpRepo = mkdtempSync(join(tmpdir(), "sj-compact-"))
    try {
      const hooks = await SessionJournalPlugin({ directory: tmpRepo })
      const compacting = hooks["experimental.session.compacting"]
      const output = { context: [], prompt: null }
      await compacting({}, output)
      assert.equal(output.context.length, 0)
    } finally {
      rmSync(tmpRepo, { recursive: true, force: true })
    }
  })
})

// =============================================
// Task 6: event hook (session.created → archive)
// =============================================

describe("event hook", () => {
  it("session.created 归档旧 journal", async () => {
    const tmpRepo = mkdtempSync(join(tmpdir(), "sj-evt-"))
    const sessionDir = findWorkspaceSessionDir(tmpRepo)
    ensureSessionDir(sessionDir)
    try {
      appendFileSync(join(sessionDir, "journal.jsonl"), '{"tool":"edit","ts":1}\n')
      writeFileSync(join(sessionDir, "summary.md"), "# old summary")
      const hooks = await SessionJournalPlugin({ directory: tmpRepo })
      await hooks.event({ event: { type: "session.created", properties: {} } })
      assert.ok(!existsSync(join(sessionDir, "journal.jsonl")))
      assert.ok(existsSync(join(sessionDir, "archive")))
    } finally {
      rmSync(tmpRepo, { recursive: true, force: true })
    }
  })

  it("非 session.created 事件不触发归档", async () => {
    const tmpRepo = mkdtempSync(join(tmpdir(), "sj-evt-"))
    const sessionDir = findWorkspaceSessionDir(tmpRepo)
    ensureSessionDir(sessionDir)
    try {
      appendFileSync(join(sessionDir, "journal.jsonl"), '{"tool":"edit","ts":1}\n')
      const hooks = await SessionJournalPlugin({ directory: tmpRepo })
      await hooks.event({ event: { type: "session.idle", properties: {} } })
      assert.ok(existsSync(join(sessionDir, "journal.jsonl")))
    } finally {
      rmSync(tmpRepo, { recursive: true, force: true })
    }
  })
})
