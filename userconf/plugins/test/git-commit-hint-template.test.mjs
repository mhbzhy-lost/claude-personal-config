import { test } from "node:test"
import assert from "node:assert/strict"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

process.env.CLAUDE_CONFIG_HOME = join(import.meta.dirname, "..", "..", "..")

const { GitCommitHintPlugin } = await import(
  "../../../templates/knowledge-gate/.opencode/plugins/git-commit-hint.js"
)

const makeHook = async () => {
  const hooks = await GitCommitHintPlugin({})
  return hooks["tool.execute.before"]
}

test("blocks bare git commit with knowledge gate hint", async () => {
  const before = await makeHook()
  await assert.rejects(
    before({ tool: "bash" }, { args: { command: 'git commit -m "feat: x"' } }),
    (err) => {
      assert.match(err.message, /knowledge gate/i)
      assert.match(err.message, /knowledge-gate\.json/)
      return true
    }
  )
})

test("blocks git commit inside chained command", async () => {
  const before = await makeHook()
  await assert.rejects(
    before({ tool: "bash" }, { args: { command: 'git add -A && git commit -m "x"' } }),
    /knowledge gate/
  )
})

test("does not block non-git bash commands", async () => {
  const before = await makeHook()
  await before({ tool: "bash" }, { args: { command: "npm test" } })
})

test("does not block non-bash tools", async () => {
  const before = await makeHook()
  await before({ tool: "read" }, { args: { file: "x.js" } })
})

test("allows skip via bash tool env field", async () => {
  const before = await makeHook()
  await before(
    { tool: "bash" },
    { args: { command: 'git commit -m "feat: x"', env: { GIT_COMMIT_HINT_SKIP: "1" } } }
  )
})

test("allows skip via command prefix", async () => {
  const before = await makeHook()
  await before(
    { tool: "bash" },
    { args: { command: 'GIT_COMMIT_HINT_SKIP=1 git commit -m "feat: x"' } }
  )
})

test("allows skip in later segment after ;", async () => {
  const before = await makeHook()
  await before(
    { tool: "bash" },
    { args: { command: 'npm test; GIT_COMMIT_HINT_SKIP=1 git commit -m "feat: x"' } }
  )
})
