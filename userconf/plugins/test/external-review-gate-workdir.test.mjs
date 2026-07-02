import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(TEST_DIR, "..", "..", "..")

function restoreEnv(key, previous) {
  if (previous === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = previous
  }
}

function git(cwd, args) {
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "External Review Gate Test",
      GIT_AUTHOR_EMAIL: "external-review-gate-test@example.com",
      GIT_COMMITTER_NAME: "External Review Gate Test",
      GIT_COMMITTER_EMAIL: "external-review-gate-test@example.com",
    },
    stdio: "pipe",
  })
}

function initRepoWithRemote(worktree, remote, filename) {
  mkdirSync(worktree, { recursive: true })
  git(dirname(remote), ["init", "--bare", remote])
  git(dirname(worktree), ["init", "-b", "main", worktree])
  git(worktree, ["config", "user.name", "External Review Gate Test"])
  git(worktree, ["config", "user.email", "external-review-gate-test@example.com"])
  writeFileSync(join(worktree, filename), "initial\n")
  git(worktree, ["add", filename])
  git(worktree, ["commit", "-m", "initial"])
  git(worktree, ["remote", "add", "origin", remote])
  git(worktree, ["push", "-u", "origin", "main"])
}

function commitLargeCodeChange(worktree, filename, label) {
  const lines = Array.from({ length: 12 }, (_, index) => {
    return `export const ${label}${index} = ${index}`
  })
  writeFileSync(join(worktree, filename), `${lines.join("\n")}\n`)
  git(worktree, ["add", filename])
  git(worktree, ["commit", "-m", `change ${label}`])
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

test("OpenCode plugin forwards Bash workdir and cwd to shared hook payload", async (t) => {
  const temp = mkdtempSync(join(tmpdir(), "erg-plugin-"))
  t.after(() => rmSync(temp, { recursive: true, force: true }))

  const hookDir = join(temp, "shared", "hooks")
  const capturePath = join(temp, "payload.json")
  mkdirSync(hookDir, { recursive: true })
  writeFileSync(
    join(hookDir, "external-review-gate.sh"),
    "#!/usr/bin/env bash\ncat > \"$EXTERNAL_REVIEW_GATE_CAPTURE\"\n",
  )
  chmodSync(join(hookDir, "external-review-gate.sh"), 0o755)

  const previousHome = process.env.CLAUDE_CONFIG_HOME
  const previousCapture = process.env.EXTERNAL_REVIEW_GATE_CAPTURE
  process.env.CLAUDE_CONFIG_HOME = temp
  process.env.EXTERNAL_REVIEW_GATE_CAPTURE = capturePath
  t.after(() => {
    restoreEnv("CLAUDE_CONFIG_HOME", previousHome)
    restoreEnv("EXTERNAL_REVIEW_GATE_CAPTURE", previousCapture)
  })

  const pluginUrl = new URL("../external-review-gate.js", import.meta.url)
  pluginUrl.searchParams.set("case", `payload-${Date.now()}`)
  const { ExternalReviewGatePlugin } = await import(pluginUrl.href)
  const hooks = await ExternalReviewGatePlugin()

  await hooks["tool.execute.before"](
    { tool: "bash" },
    {
      args: {
        command: "git push origin main",
        workdir: "/tmp/child-repo",
        cwd: "/tmp/fallback-cwd",
        env: { EXAMPLE_ENV: "1" },
        environment: { EXAMPLE_ENVIRONMENT: "2" },
      },
    },
  )

  const payload = JSON.parse(readFileSync(capturePath, "utf8"))
  assert.equal(payload.tool_input.command, "git push origin main")
  assert.equal(payload.tool_input.workdir, "/tmp/child-repo")
  assert.equal(payload.tool_input.cwd, "/tmp/fallback-cwd")
  assert.deepEqual(payload.tool_input.env, { EXAMPLE_ENV: "1" })
  assert.deepEqual(payload.tool_input.environment, { EXAMPLE_ENVIRONMENT: "2" })
})

test("shared hook logs review context from Bash workdir child repo", (t) => {
  const temp = mkdtempSync(join(tmpdir(), "erg-hook-"))
  t.after(() => rmSync(temp, { recursive: true, force: true }))

  const parent = join(temp, "parent")
  const child = join(parent, "child-repo")
  const fakeHome = join(temp, "home")
  const fakeReviewDir = join(fakeHome, "userconf", "skills", "external-llm-review")
  const binDir = join(temp, "bin")
  const uvCwdPath = join(temp, "uv-cwd.txt")

  initRepoWithRemote(parent, join(temp, "parent.git"), "parent.js")
  initRepoWithRemote(child, join(temp, "child.git"), "child.js")
  commitLargeCodeChange(parent, "parent.js", "parentChange")
  commitLargeCodeChange(child, "child.js", "childChange")
  const expectedChildRepo = realpathSync(child)

  mkdirSync(fakeReviewDir, { recursive: true })
  writeFileSync(join(fakeReviewDir, ".env"), "EXTERNAL_REVIEW_TEST=1\n")
  writeFileSync(join(fakeReviewDir, "reviewer.py"), "print('unused')\n")
  mkdirSync(binDir, { recursive: true })
  writeFileSync(
    join(binDir, "uv"),
    `#!/usr/bin/env bash
pwd > "$UV_CAPTURE_CWD"
cat <<'REVIEW'
## Critical
None

## Important
None

## Minor
None

## Assessment
Ready
REVIEW
`,
  )
  chmodSync(join(binDir, "uv"), 0o755)

  const payload = JSON.stringify({
    tool_name: "Bash",
    tool_input: {
      command: "git push origin main",
      workdir: child,
    },
  })

  const result = spawnSync("bash", [join(REPO_ROOT, "shared/hooks/external-review-gate.sh")], {
    cwd: parent,
    input: payload,
    encoding: "utf8",
    env: {
      ...process.env,
      CLAUDE_CONFIG_HOME: fakeHome,
      PATH: `${binDir}:${process.env.PATH}`,
      UV_CAPTURE_CWD: uvCwdPath,
    },
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stderr, new RegExp(`Review repo: ${escapeRegex(expectedChildRepo)}`))
  assert.match(result.stderr, /Review range: origin\/main\.\.HEAD/)
  assert.match(result.stderr, /Review file count: 1/)
  assert.equal(readFileSync(uvCwdPath, "utf8").trim(), expectedChildRepo)
})
