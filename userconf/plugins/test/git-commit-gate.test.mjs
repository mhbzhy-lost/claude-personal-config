import { test } from "node:test"
import assert from "node:assert/strict"
import { parseGitCommitArgs, validateCommitMessage } from "../git-commit-gate.js"

// ── parseGitCommitArgs ──────────────────────────────────

test("parse -m short flag, single arg", () => {
  const r = parseGitCommitArgs('git commit -m "feat(foo): add bar"')
  assert.equal(r.message, "feat(foo): add bar")
})

test("parse --message long flag", () => {
  const r = parseGitCommitArgs('git commit --message "feat: x"')
  assert.equal(r.message, "feat: x")
})

test("parse message with escaped inner quotes", () => {
  const r = parseGitCommitArgs('git commit -m "fix(parser): handle \\"\\\\\\" in strings"')
  assert.equal(r.message, 'fix(parser): handle \\"\\\\\\" in strings')
})

test("parse skips flag-only commit", () => {
  const r = parseGitCommitArgs("git commit --allow-empty -a")
  assert.equal(r.message, null)
})

test("parse --amend -m preserves message", () => {
  const r = parseGitCommitArgs('git commit --amend -m "fix: new msg"')
  assert.equal(r.message, "fix: new msg")
})

test("parse --no-edit returns null", () => {
  const r = parseGitCommitArgs("git commit --amend --no-edit")
  assert.equal(r.message, null)
})

test("parse -F returns null (file, skip validation)", () => {
  const r = parseGitCommitArgs("git commit -F /path/to/msg")
  assert.equal(r.message, null)
  assert.equal(r.fromFile, true)
})

test("parse message with line breaks via $'...' syntax", () => {
  const r = parseGitCommitArgs("git commit -m $'feat(scope): subj\\n\\nbody text here'")
  assert.equal(r.message, "feat(scope): subj\n\nbody text here")
})

test("heredoc in --message treated as fromFile", () => {
  const r = parseGitCommitArgs("git commit --message \"$(cat <<'EOF'\nfeat(foo): bar\nEOF\n)\"")
  assert.equal(r.fromFile, true)
  assert.equal(r.message, null)
})

test("heredoc in -m treated as fromFile", () => {
  const r = parseGitCommitArgs("git commit -m \"$(cat <<'EOF'\nfeat(foo): bar\nEOF\n)\"")
  assert.equal(r.fromFile, true)
  assert.equal(r.message, null)
})

test("parse multiline bash with git commit mid-sequence", () => {
  const r = parseGitCommitArgs(
    "git add -A\ngit commit -m \"chore: cleanup\""
  )
  assert.equal(r.message, "chore: cleanup")
})

// ── validateCommitMessage ───────────────────────────────

test("valid: conventional subject 中文", () => {
  const r = validateCommitMessage("feat(plugins): 增加 commit 校验插件")
  assert.equal(r.errors.length, 0)
})

test("valid: feat with !", () => {
  const r = validateCommitMessage("feat(orchestrator)!: 重命名字段")
  assert.equal(r.errors.length, 0)
})

test("valid: type only, no scope", () => {
  const r = validateCommitMessage("fix: 修复空指针")
  assert.equal(r.errors.length, 0)
})

test("valid: revert type", () => {
  const r = validateCommitMessage("revert: 回滚前次提交")
  assert.equal(r.errors.length, 0)
})

test("error: bad type", () => {
  const r = validateCommitMessage("bugfix: 修复 bug")
  assert.ok(r.errors.some((e) => e.code === "BAD_TYPE"))
})

test("error: missing subject", () => {
  const r = validateCommitMessage("feat(scope):")
  assert.ok(r.errors.some((e) => e.code === "MISSING_SUBJECT"))
})

test("error: subject no chinese", () => {
  const r = validateCommitMessage("feat(scope): add new feature")
  assert.ok(r.errors.some((e) => e.code === "SUBJECT_NO_CHINESE"))
})

test("error: subject ends with chinese period", () => {
  const r = validateCommitMessage("feat(scope): 增加功能。")
  assert.ok(r.errors.some((e) => e.code === "SUBJECT_ENDS_WITH_PUNCTUATION"))
})

test("error: subject ends with dot", () => {
  const r = validateCommitMessage("feat(scope): 增加功能.")
  assert.ok(r.errors.some((e) => e.code === "SUBJECT_ENDS_WITH_PUNCTUATION"))
})

test("error: subject past tense 已修复", () => {
  const r = validateCommitMessage("feat(scope): 已修复空指针")
  assert.ok(r.errors.some((e) => e.code === "SUBJECT_PAST_TENSE"))
})

test("error: subject past tense 实现了", () => {
  const r = validateCommitMessage("feat(scope): 实现了新特性")
  assert.ok(r.errors.some((e) => e.code === "SUBJECT_PAST_TENSE"))
})

test("error: subject past tense 修复了", () => {
  const r = validateCommitMessage("fix(scope): 修复了空指针")
  assert.ok(r.errors.some((e) => e.code === "SUBJECT_PAST_TENSE"))
})

test("error: zero info subject update", () => {
  const r = validateCommitMessage("chore(scope): update")
  assert.ok(r.errors.some((e) => e.code === "ZERO_INFO_SUBJECT"))
})

test("error: zero info subject bugfix", () => {
  const r = validateCommitMessage("fix(scope): bugfix")
  assert.ok(r.errors.some((e) => e.code === "ZERO_INFO_SUBJECT"))
})

test("error: Co-Authored-By Claude", () => {
  const r = validateCommitMessage(
    "feat(x): 增加\n\nbody\n\nCo-Authored-By: Claude Sonnet"
  )
  assert.ok(r.errors.some((e) => e.code === "AI_SIGNATURE"))
})

test("error: Co-Authored-By Copilot", () => {
  const r = validateCommitMessage(
    "feat(x): 增加\n\nCo-Authored-By: GitHub Copilot <bot@github.com>"
  )
  assert.ok(r.errors.some((e) => e.code === "AI_SIGNATURE"))
})

test("error: Generated with Claude", () => {
  const r = validateCommitMessage(
    "feat(x): 增加\n\nGenerated with Claude Code"
  )
  assert.ok(r.errors.some((e) => e.code === "AI_SIGNATURE"))
})

test("no false positive: commit message that mentions claude-config in body", () => {
  const r = validateCommitMessage(
    "docs: 更新 userconf/AGENTS.md 中的说明"
  )
  assert.equal(r.errors.length, 0)
})

test("valid subject exactly 50 chars", () => {
  const s = "feat: " + "中".repeat(44) // 6 + 44 = 50 chars
  assert.equal(s.length, 50)
  const r = validateCommitMessage(s)
  assert.equal(r.errors.length, 0)
})

test("body with valid content does not trigger errors", () => {
  const r = validateCommitMessage(
    "feat(plugins): 新增 git commit 门插件\n\nbody explaining why\n\nRef: #123"
  )
  assert.equal(r.errors.length, 0)
})
