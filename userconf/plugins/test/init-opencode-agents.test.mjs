import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { join, relative } from "node:path"
import { tmpdir } from "node:os"

const repoRoot = new URL("../../..", import.meta.url).pathname
const initScript = join(repoRoot, "init_opencode.sh")

function missingPromptClauses(prompt, clauses) {
  return clauses
    .filter(({ pattern }) => !pattern.test(prompt))
    .map(({ label }) => label)
}

function pathExistsNoFollow(path) {
  try {
    lstatSync(path)
    return true
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return false
    }
    throw error
  }
}

describe("init_opencode agents sync", () => {
  it("symlinks userconf plugins including plan-runner harness", () => {
    const configDir = mkdtempSync(join(tmpdir(), "opencode-plugins-"))

    try {
      execFileSync(
        "bash",
        [
          "-c",
          [
            `OPENCODE_CONFIG_DIR=${JSON.stringify(configDir)}`,
            "OPENCODE_INIT_AS_LIBRARY=1",
            `source ${JSON.stringify(initScript)}`,
            "declare -F sync_opencode_plugins >/dev/null",
            "sync_opencode_plugins",
          ].join("; "),
        ],
        { encoding: "utf8" },
      )

      const linkPath = join(configDir, "plugins", "plan-runner-harness.js")
      const linkTarget = execFileSync("readlink", [linkPath], { encoding: "utf8" }).trim()

      assert.equal(linkTarget, join(repoRoot, "userconf", "plugins", "plan-runner-harness.js"))
    } finally {
      rmSync(configDir, { recursive: true, force: true })
    }
  })

  it("does not sync retired session-journal plugin", () => {
    const configDir = mkdtempSync(join(tmpdir(), "opencode-plugins-"))

    try {
      execFileSync(
        "bash",
        [
          "-c",
          [
            `OPENCODE_CONFIG_DIR=${JSON.stringify(configDir)}`,
            "OPENCODE_INIT_AS_LIBRARY=1",
            `source ${JSON.stringify(initScript)}`,
            "sync_opencode_plugins",
          ].join("; "),
        ],
        { encoding: "utf8" },
      )

      assert.equal(existsSync(join(configDir, "plugins", "session-journal.js")), false)
    } finally {
      rmSync(configDir, { recursive: true, force: true })
    }
  })

  it("removes retired session-journal symlinks from previous installs", () => {
    const configDir = mkdtempSync(join(tmpdir(), "opencode-plugins-"))

    try {
      const pluginDir = join(configDir, "plugins")
      execFileSync("mkdir", ["-p", pluginDir])
      execFileSync("ln", ["-s", join(repoRoot, "userconf", "plugins", "session-journal.js"), join(pluginDir, "session-journal.js")])

      execFileSync(
        "bash",
        [
          "-c",
          [
            `OPENCODE_CONFIG_DIR=${JSON.stringify(configDir)}`,
            "OPENCODE_INIT_AS_LIBRARY=1",
            `source ${JSON.stringify(initScript)}`,
            "sync_opencode_plugins",
          ].join("; "),
        ],
        { encoding: "utf8" },
      )

      assert.equal(pathExistsNoFollow(join(pluginDir, "session-journal.js")), false)
    } finally {
      rmSync(configDir, { recursive: true, force: true })
    }
  })

  it("removes retired session-journal symlinks when target is relative", () => {
    const root = mkdtempSync(join(tmpdir(), "opencode-relative-retired-"))

    try {
      const fakeRepo = join(root, "repo")
      const configDir = join(root, "config")
      const pluginDir = join(configDir, "plugins")
      const retiredLink = join(pluginDir, "session-journal.js")
      const retiredSource = join(fakeRepo, "userconf", "plugins", "session-journal.js")
      mkdirSync(join(fakeRepo, "userconf", "plugins"), { recursive: true })
      mkdirSync(pluginDir, { recursive: true })
      writeFileSync(join(fakeRepo, "init_opencode.sh"), readFileSync(initScript, "utf8"))
      execFileSync("ln", ["-s", relative(pluginDir, retiredSource), retiredLink])

      execFileSync(
        "bash",
        [
          "-c",
          [
            `OPENCODE_CONFIG_DIR=${JSON.stringify(configDir)}`,
            "OPENCODE_INIT_AS_LIBRARY=1",
            `source ${JSON.stringify(join(fakeRepo, "init_opencode.sh"))}`,
            "sync_opencode_plugins",
          ].join("; "),
        ],
        { encoding: "utf8" },
      )

      assert.equal(pathExistsNoFollow(retiredLink), false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("removes retired session-journal symlinks when relative target parent is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "opencode-stale-retired-"))

    try {
      const fakeRepo = join(root, "repo")
      const configDir = join(root, "config")
      const pluginDir = join(configDir, "plugins")
      const retiredLink = join(pluginDir, "session-journal.js")
      const staleManagedSource = join(root, "missing", "userconf", "plugins", "session-journal.js")
      mkdirSync(join(fakeRepo, "userconf", "plugins"), { recursive: true })
      mkdirSync(pluginDir, { recursive: true })
      writeFileSync(join(fakeRepo, "init_opencode.sh"), readFileSync(initScript, "utf8"))
      execFileSync("ln", ["-s", relative(pluginDir, staleManagedSource), retiredLink])

      execFileSync(
        "bash",
        [
          "-c",
          [
            `OPENCODE_CONFIG_DIR=${JSON.stringify(configDir)}`,
            "OPENCODE_INIT_AS_LIBRARY=1",
            `source ${JSON.stringify(join(fakeRepo, "init_opencode.sh"))}`,
            "sync_opencode_plugins",
          ].join("; "),
        ],
        { encoding: "utf8" },
      )

      assert.equal(pathExistsNoFollow(retiredLink), false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("removes retired plugin symlinks when repo path contains glob characters", () => {
    const root = mkdtempSync(join(tmpdir(), "opencode-[plugins]-"))

    try {
      const fakeRepo = join(root, "repo")
      const configDir = join(root, "config")
      const pluginDir = join(configDir, "plugins")
      mkdirSync(join(fakeRepo, "userconf", "plugins"), { recursive: true })
      mkdirSync(pluginDir, { recursive: true })
      writeFileSync(join(fakeRepo, "init_opencode.sh"), readFileSync(initScript, "utf8"))
      writeFileSync(join(fakeRepo, "userconf", "plugins", "dummy-plugin.js"), "export default async () => ({})\n")
      execFileSync("ln", ["-s", join(fakeRepo, "userconf", "plugins", "session-journal.js"), join(pluginDir, "session-journal.js")])

      execFileSync(
        "bash",
        [
          "-c",
          [
            `OPENCODE_CONFIG_DIR=${JSON.stringify(configDir)}`,
            "OPENCODE_INIT_AS_LIBRARY=1",
            `source ${JSON.stringify(join(fakeRepo, "init_opencode.sh"))}`,
            "sync_opencode_plugins",
          ].join("; "),
        ],
        { encoding: "utf8" },
      )

      assert.equal(pathExistsNoFollow(join(pluginDir, "session-journal.js")), false)
      const dummyTarget = execFileSync("readlink", [join(pluginDir, "dummy-plugin.js")], { encoding: "utf8" }).trim()
      assert.equal(dummyTarget, join(fakeRepo, "userconf", "plugins", "dummy-plugin.js"))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("symlinks userconf agents into the OpenCode global agents directory", () => {
    const configDir = mkdtempSync(join(tmpdir(), "opencode-agents-"))

    try {
      execFileSync(
        "bash",
        [
        "-c",
          [
            `OPENCODE_CONFIG_DIR=${JSON.stringify(configDir)}`,
            "OPENCODE_INIT_AS_LIBRARY=1",
            `source ${JSON.stringify(initScript)}`,
            "declare -F sync_opencode_agents >/dev/null",
            "sync_opencode_agents",
          ].join("; "),
        ],
        { encoding: "utf8" },
      )

      const linkPath = join(configDir, "agents", "plan-runner.md")
      const linkTarget = execFileSync("readlink", [linkPath], { encoding: "utf8" }).trim()

      assert.equal(linkTarget, join(repoRoot, "userconf", "agents", "plan-runner.md"))
    } finally {
      rmSync(configDir, { recursive: true, force: true })
    }
  })

  it("configures executor as deterministic no-effort worker", () => {
    const agents = JSON.parse(readFileSync(join(repoRoot, "userconf", "agents.json"), "utf8"))

    assert.equal(agents.executor.mode, "subagent")
    assert.equal(agents.executor.temperature, 0)
    assert.equal(agents.executor.variant, "none")
    assert.equal(agents.executor.options, undefined)
    assert.match(agents.executor.description, /Deterministic code executor/i)
    assert.equal(agents["GPT-Pro"].variant, "max")
    assert.deepEqual(agents["GPT-Pro"].options, { reasoningMode: "pro" })
  })

  it("updates an existing executor config during opencode.json sync", () => {
    const configDir = mkdtempSync(join(tmpdir(), "opencode-json-agents-"))

    try {
      writeFileSync(
        join(configDir, "opencode.json"),
        JSON.stringify(
          {
            "$schema": "https://opencode.ai/config.json",
            agent: {
              executor: {
                description: "Old executor config",
                mode: "subagent",
                temperature: 0,
                options: {
                  effort: "high",
                  reasoningEffort: "high",
                },
              },
            },
          },
          null,
          2,
        ),
      )

      execFileSync(
        "bash",
        [
          "-c",
          [
            `OPENCODE_CONFIG_DIR=${JSON.stringify(configDir)}`,
            "OPENCODE_INIT_AS_LIBRARY=1",
            `source ${JSON.stringify(initScript)}`,
            "declare -F sync_opencode_json >/dev/null",
            "sync_opencode_json",
          ].join("; "),
        ],
        { encoding: "utf8" },
      )

      const desiredAgents = JSON.parse(readFileSync(join(repoRoot, "userconf", "agents.json"), "utf8"))
      const config = JSON.parse(readFileSync(join(configDir, "opencode.json"), "utf8"))

      assert.deepEqual(config.agent.executor, desiredAgents.executor)
    } finally {
      rmSync(configDir, { recursive: true, force: true })
    }
  })

  it("syncs managed primary agent permissions while preserving its local model", () => {
    const configDir = mkdtempSync(join(tmpdir(), "opencode-json-primary-agent-"))

    try {
      writeFileSync(
        join(configDir, "opencode.json"),
        JSON.stringify({
          agent: {
            GPT: { model: "openai/local-choice", mode: "primary" },
            "GPT-Pro": {
              model: "openai/gpt-5.6-sol",
              mode: "primary",
              options: { reasoningEffort: "xhigh", keep: true },
            },
          },
        }),
      )

      execFileSync(
        "bash",
        [
          "-c",
          [
            `OPENCODE_CONFIG_DIR=${JSON.stringify(configDir)}`,
            "OPENCODE_INIT_AS_LIBRARY=1",
            `source ${JSON.stringify(initScript)}`,
            "sync_opencode_json",
          ].join("; "),
        ],
        { encoding: "utf8" },
      )

      const desiredAgents = JSON.parse(readFileSync(join(repoRoot, "userconf", "agents.json"), "utf8"))
      const config = JSON.parse(readFileSync(join(configDir, "opencode.json"), "utf8"))
      assert.equal(config.agent.GPT.model, "openai/local-choice")
      assert.deepEqual(config.agent.GPT.permission, desiredAgents.GPT.permission)
      assert.equal(config.agent["GPT-Pro"].variant, "max")
      assert.deepEqual(config.agent["GPT-Pro"].options, desiredAgents["GPT-Pro"].options)
    } finally {
      rmSync(configDir, { recursive: true, force: true })
    }
  })

  it("migrates legacy lowercase GPT agents while preserving local model settings", () => {
    const configDir = mkdtempSync(join(tmpdir(), "opencode-json-agent-case-rename-"))

    try {
      writeFileSync(
        join(configDir, "opencode.json"),
        JSON.stringify({
          agent: {
            gpt: { model: "openai/local-gpt", mode: "primary", local: true },
            "gpt-pro": { model: "openai/local-gpt-pro", mode: "primary" },
          },
        }),
      )

      const output = execFileSync(
        "bash",
        [
          "-c",
          [
            `OPENCODE_CONFIG_DIR=${JSON.stringify(configDir)}`,
            "OPENCODE_INIT_AS_LIBRARY=1",
            `source ${JSON.stringify(initScript)}`,
            "sync_opencode_json",
          ].join("; "),
        ],
        { encoding: "utf8" },
      )

      const desiredAgents = JSON.parse(readFileSync(join(repoRoot, "userconf", "agents.json"), "utf8"))
      const config = JSON.parse(readFileSync(join(configDir, "opencode.json"), "utf8"))
      assert.equal(config.agent.gpt, undefined)
      assert.equal(config.agent["gpt-pro"], undefined)
      assert.equal(config.agent.GPT.model, "openai/local-gpt")
      assert.equal(config.agent.GPT.local, true)
      assert.deepEqual(config.agent.GPT.permission, desiredAgents.GPT.permission)
      assert.equal(config.agent["GPT-Pro"].model, "openai/local-gpt-pro")
      assert.equal(config.agent["GPT-Pro"].variant, "max")
      assert.match(output, /\[agent\] gpt -> GPT 已迁移/)
      assert.match(output, /\[agent\] gpt-pro -> GPT-Pro 已迁移/)
    } finally {
      rmSync(configDir, { recursive: true, force: true })
    }
  })

  it("removes legacy lowercase GPT agents without overwriting current-name local models", () => {
    const configDir = mkdtempSync(join(tmpdir(), "opencode-json-agent-case-conflict-"))

    try {
      writeFileSync(
        join(configDir, "opencode.json"),
        JSON.stringify({
          agent: {
            gpt: { model: "openai/legacy-gpt", mode: "primary" },
            GPT: { model: "openai/current-gpt", mode: "primary" },
            "gpt-pro": { model: "openai/legacy-gpt-pro", mode: "primary" },
            "GPT-Pro": { model: "openai/current-gpt-pro", mode: "primary" },
          },
        }),
      )

      const output = execFileSync(
        "bash",
        [
          "-c",
          [
            `OPENCODE_CONFIG_DIR=${JSON.stringify(configDir)}`,
            "OPENCODE_INIT_AS_LIBRARY=1",
            `source ${JSON.stringify(initScript)}`,
            "sync_opencode_json",
          ].join("; "),
        ],
        { encoding: "utf8" },
      )

      const config = JSON.parse(readFileSync(join(configDir, "opencode.json"), "utf8"))
      assert.equal(config.agent.gpt, undefined)
      assert.equal(config.agent["gpt-pro"], undefined)
      assert.equal(config.agent.GPT.model, "openai/current-gpt")
      assert.equal(config.agent["GPT-Pro"].model, "openai/current-gpt-pro")
      assert.match(output, /\[agent\] gpt -> GPT 已移除旧配置，新名称配置保留/)
      assert.match(output, /\[agent\] gpt-pro -> GPT-Pro 已移除旧配置，新名称配置保留/)
    } finally {
      rmSync(configDir, { recursive: true, force: true })
    }
  })

  it("adds Exa remote MCP during opencode.json sync", () => {
    const configDir = mkdtempSync(join(tmpdir(), "opencode-json-exa-"))

    try {
      execFileSync(
        "bash",
        [
          "-c",
          [
            `OPENCODE_CONFIG_DIR=${JSON.stringify(configDir)}`,
            "OPENCODE_INIT_AS_LIBRARY=1",
            `source ${JSON.stringify(initScript)}`,
            "declare -F sync_opencode_json >/dev/null",
            "sync_opencode_json",
          ].join("; "),
        ],
        { encoding: "utf8" },
      )

      const config = JSON.parse(readFileSync(join(configDir, "opencode.json"), "utf8"))

      assert.deepEqual(config.mcp.exa, {
        type: "remote",
        url: "https://mcp.exa.ai/mcp",
        enabled: true,
      })
    } finally {
      rmSync(configDir, { recursive: true, force: true })
    }
  })

  it("repairs shared skill symlinks that still point to deprecated claude-skills", () => {
    const skillsDir = mkdtempSync(join(tmpdir(), "agents-skills-"))

    try {
      const linkPath = join(skillsDir, "external-llm-review")
      execFileSync("ln", ["-s", join(repoRoot, "claude-skills", "external-llm-review"), linkPath])

      execFileSync(
        "bash",
        [
          "-c",
          [
            `AGENTS_SKILLS_DIR=${JSON.stringify(skillsDir)}`,
            "OPENCODE_INIT_AS_LIBRARY=1",
            `source ${JSON.stringify(initScript)}`,
            "declare -F sync_shared_skills >/dev/null",
            "sync_shared_skills",
          ].join("; "),
        ],
        { encoding: "utf8" },
      )

      const linkTarget = execFileSync("readlink", [linkPath], { encoding: "utf8" }).trim()

      assert.equal(linkTarget, join(repoRoot, "userconf", "skills", "external-llm-review"))
    } finally {
      rmSync(skillsDir, { recursive: true, force: true })
    }
  })

  it("symlinks Superpowers skills from vendor fallback", () => {
    const skillsDir = mkdtempSync(join(tmpdir(), "agents-skills-"))

    try {
      execFileSync(
        "bash",
        [
          "-c",
          [
            `AGENTS_SKILLS_DIR=${JSON.stringify(skillsDir)}`,
            "OPENCODE_INIT_AS_LIBRARY=1",
            `source ${JSON.stringify(initScript)}`,
            "declare -F sync_shared_skills >/dev/null",
            "sync_shared_skills",
          ].join("; "),
        ],
        { encoding: "utf8" },
      )

      const linkPath = join(skillsDir, "systematic-debugging")
      const linkTarget = execFileSync("readlink", [linkPath], { encoding: "utf8" }).trim()

      assert.equal(linkTarget, join(repoRoot, "vendor", "superpowers", "skills", "systematic-debugging"))
    } finally {
      rmSync(skillsDir, { recursive: true, force: true })
    }
  })

  it("symlinks workflow-usage into shared agents skills and removes legacy OpenCode skill link", () => {
    const root = mkdtempSync(join(tmpdir(), "workflow-skill-"))

    try {
      const skillsDir = join(root, "agents-skills")
      const configDir = join(root, "opencode")
      const legacyDir = join(configDir, "skills")
      const legacyLink = join(legacyDir, "workflow-usage")
      const workflowSource = join(repoRoot, "vendor", "opencode-dynamic-workflow", "skills", "workflow-usage")
      mkdirSync(legacyDir, { recursive: true })
      execFileSync("ln", ["-s", relative(legacyDir, workflowSource), legacyLink])

      execFileSync(
        "bash",
        [
          "-c",
          [
            `AGENTS_SKILLS_DIR=${JSON.stringify(skillsDir)}`,
            `OPENCODE_CONFIG_DIR=${JSON.stringify(configDir)}`,
            "OPENCODE_INIT_AS_LIBRARY=1",
            `source ${JSON.stringify(initScript)}`,
            "sync_shared_skills",
          ].join("; "),
        ],
        { encoding: "utf8" },
      )

      const sharedTarget = execFileSync("readlink", [join(skillsDir, "workflow-usage")], { encoding: "utf8" }).trim()
      assert.equal(sharedTarget, workflowSource)
      assert.equal(pathExistsNoFollow(legacyLink), false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("removes legacy workflow-usage skill link when relative target parent is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "workflow-stale-skill-"))

    try {
      const skillsDir = join(root, "agents-skills")
      const configDir = join(root, "opencode")
      const legacyDir = join(configDir, "skills")
      const legacyLink = join(legacyDir, "workflow-usage")
      const staleManagedSource = join(root, "missing", "vendor", "opencode-dynamic-workflow", "skills", "workflow-usage")
      mkdirSync(legacyDir, { recursive: true })
      execFileSync("ln", ["-s", relative(legacyDir, staleManagedSource), legacyLink])

      execFileSync(
        "bash",
        [
          "-c",
          [
            `AGENTS_SKILLS_DIR=${JSON.stringify(skillsDir)}`,
            `OPENCODE_CONFIG_DIR=${JSON.stringify(configDir)}`,
            "OPENCODE_INIT_AS_LIBRARY=1",
            `source ${JSON.stringify(initScript)}`,
            "sync_shared_skills",
          ].join("; "),
        ],
        { encoding: "utf8" },
      )

      assert.equal(pathExistsNoFollow(legacyLink), false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("runs workflow submodule install only when workflow-usage is whitelisted", () => {
    const root = mkdtempSync(join(tmpdir(), "workflow-whitelist-"))

    try {
      const withWorkflow = join(root, "with-workflow.list")
      const withoutWorkflow = join(root, "without-workflow.list")
      writeFileSync(withWorkflow, "external-llm-review\nworkflow-usage\n")
      writeFileSync(withoutWorkflow, "external-llm-review\n")

      const output = execFileSync(
        "bash",
        [
          "-c",
          [
            "OPENCODE_INIT_AS_LIBRARY=1",
            `source ${JSON.stringify(initScript)}`,
            `AGENTS_SKILLS_LIST=${JSON.stringify(withWorkflow)} should_install_workflow_usage && printf yes`,
            "printf /",
            `AGENTS_SKILLS_LIST=${JSON.stringify(withoutWorkflow)} should_install_workflow_usage || printf no`,
          ].join("; "),
        ],
        { encoding: "utf8" },
      )

      assert.equal(output, "yes/no")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("external-llm-review skill documentation points at userconf skill path", () => {
    const skill = readFileSync(join(repoRoot, "userconf", "skills", "external-llm-review", "SKILL.md"), "utf8")

    assert.match(skill, /userconf\/skills\/external-llm-review/)
    assert.doesNotMatch(skill, /claude-skills\/external-llm-review/)
  })

  it("plan-runner-dispatch skill routes through the dedicated start_plan_runner tool", () => {
    const list = readFileSync(join(repoRoot, "agents", "skills.list"), "utf8")
    const skill = readFileSync(join(repoRoot, "userconf", "skills", "plan-runner-dispatch", "SKILL.md"), "utf8")

    assert.match(list, /^plan-runner-dispatch$/m)
    assert.match(skill, /^name: plan-runner-dispatch$/m)
    assert.match(skill, /^description: Use when .*写计划并执行.*开始执行.*按方案落地/m)
    assert.match(skill, /start_plan_runner/)
    assert.match(skill, /Before calling `start_plan_runner`.*writing-plans.*complete plan document/is)
    assert.match(skill, /If no complete plan document exists.*do not call `start_plan_runner`.*load `writing-plans`/is)
    assert.match(skill, /preflight.*takes priority over.*Required Action/is)
    assert.match(skill, /agreed approach.*must not.*substitute.*complete plan document/is)
    assert.match(skill, /Do not use the native `task` tool/i)
    assert.doesNotMatch(skill, /subagent_type["`]?:\s*["`]plan-runner["`]/)
    assert.match(skill, /Do not implement the request in the primary agent/i)
    assert.match(skill, /harness-owned worktree/i)
  })

  it("global writing-plans override makes Subagent-Driven self-contained", () => {
    const agents = readFileSync(join(repoRoot, "userconf", "AGENTS.md"), "utf8")
    const reason = readFileSync(join(repoRoot, "userconf", "AGENTS.reason.md"), "utf8")

    assert.match(agents, /Subagent-Driven.*不加载、也不依赖 `subagent-driven-development`/s)
    assert.match(agents, /主 agent.*后台模式.*逐任务派发/s)
    assert.match(reason, /Subagent-Driven.*不依赖 `subagent-driven-development`/s)
  })

  it("recommends executor for coding tasks without making it a dispatch gate", () => {
    const agents = readFileSync(join(repoRoot, "userconf", "AGENTS.md"), "utf8")
    const reason = readFileSync(join(repoRoot, "userconf", "AGENTS.reason.md"), "utf8")

    assert.match(agents, /编码任务.*推荐使用 `executor`/)
    assert.match(reason, /编码任务.*推荐使用 `executor`/)
  })

  it("permission template exposes only the plan-runner entrypoint to primary agents", () => {
    const agents = JSON.parse(readFileSync(join(repoRoot, "userconf", "agents.json"), "utf8"))
    const permissionTemplate = JSON.parse(readFileSync(join(repoRoot, "userconf", "permission.json"), "utf8")).template
    const lifecycleTools = ["write_plan", "start_task", "complete_task", "finish_plan"]

    assert.equal(permissionTemplate["*"], "allow")
    assert.equal(permissionTemplate.start_plan_runner, "deny")
    assert.equal(permissionTemplate.get_plan_runner_status, "deny")
    assert.equal(permissionTemplate.dispatch_child, "deny")
    for (const tool of lifecycleTools) {
      assert.equal(permissionTemplate[tool], "deny", `${tool} should be globally hidden outside explicit agent overrides`)
    }

    for (const agentName of ["GPT", "GPT-Pro", "qwen", "claude"]) {
      assert.equal(agents[agentName]?.permission?.start_plan_runner, "allow")
      assert.equal(agents[agentName]?.permission?.get_plan_runner_status, "allow")
      for (const tool of lifecycleTools) assert.notEqual(agents[agentName]?.permission?.[tool], "allow")
      assert.notEqual(agents[agentName]?.permission?.dispatch_child, "allow")
    }
    assert.equal(agents.gpt, undefined)
    assert.equal(agents["gpt-pro"], undefined)

    assert.notEqual(agents.executor?.permission?.start_plan_runner, "allow")
    assert.notEqual(agents.executor?.permission?.get_plan_runner_status, "allow")
    assert.notEqual(agents.executor?.permission?.dispatch_child, "allow")
    for (const tool of lifecycleTools) assert.notEqual(agents.executor?.permission?.[tool], "allow")
  })

  it("reserves dispatch_child for the plan-runner agent", () => {
    const planRunner = readFileSync(join(repoRoot, "userconf", "agents", "plan-runner.md"), "utf8")
    const audit = readFileSync(join(repoRoot, "userconf", "agents", "plan-runner-audit.md"), "utf8")

    assert.match(planRunner, /^\s*task:\s*deny\s*$/m)
    assert.match(planRunner, /^\s*dispatch_child:\s*allow\s*$/m)
    assert.match(planRunner, /dispatch_child\(\{\s*description,\s*prompt\s*\}\)/)
    assert.doesNotMatch(audit, /^\s*dispatch_child:/m)
  })

  it("project plan-runner troubleshooting skill documents task-state diagnostics", () => {
    const skill = readFileSync(join(repoRoot, ".agents", "skills", "plan-runner-troubleshooting", "SKILL.md"), "utf8")

    assert.match(skill, /^name: plan-runner-troubleshooting$/m)
    assert.match(skill, /^description: Use when .*plan-runner.*task-state.*finish_plan/m)
    assert.match(skill, /~\/\.config\/opencode\/task-state\/tasks\/<task_id>\.json/)
    assert.match(skill, /~\/\.config\/opencode\/task-state\/events\/<task_id>\.jsonl/)
    assert.match(skill, /OPENCODE_CONFIG_DIR/)
    assert.match(skill, /XDG_CONFIG_HOME/)
    assert.match(skill, /dispatch_started.*plan_runner_bound.*plan_contract_written/s)
    assert.match(skill, /finish_plan_preflight_blocked/)
    assert.match(skill, /child_worktree_created/)
    assert.match(skill, /child_session_completed/)
    assert.match(skill, /audit_review_dispatched/)
    assert.match(skill, /external_review_passed/)
    assert.match(skill, /task_validated/)
    assert.match(skill, /git worktree list --porcelain/)
    assert.match(skill, /Do not trust.*agent.*final report/i)
    assert.match(skill, /opencode run --attach.*background.*serve/i)
  })

  it("plan-runner agent description describes responsibility, not trigger phrases", () => {
    const agent = readFileSync(join(repoRoot, "userconf", "agents", "plan-runner.md"), "utf8")
    const description = agent.match(/^description:\s*(.+)$/m)?.[1] || ""

    assert.match(description, /bounded implementation plans/i)
    assert.match(description, /validation/i)
    assert.doesNotMatch(description, /写计划并执行|开始执行|进入执行阶段|按方案落地|开始落地|开始写计划并执行/)
  })

  it("plan-runner audit agent is read-only and cannot dispatch child tasks", () => {
    const agent = readFileSync(join(repoRoot, "userconf", "agents", "plan-runner-audit.md"), "utf8")

    assert.match(agent, /^mode:\s*subagent$/m)
    assert.match(agent, /edit:\s*deny/)
    assert.match(agent, /write:\s*deny/)
    assert.match(agent, /task:\s*deny/)
    assert.match(agent, /You are a plan-runner audit reviewer/i)
  })

  it("plan-runner audit agent returns the JSON contract consumed by the harness", () => {
    const agent = readFileSync(join(repoRoot, "userconf", "agents", "plan-runner-audit.md"), "utf8")

    assert.doesNotMatch(agent, /^model:/m)
    assert.match(agent, /inherit.*parent.*model|parent.*session.*model/i)
    assert.match(agent, /Return only a JSON object/i)
    assert.match(agent, /"result": "pass" \| "fail"/)
    assert.match(agent, /"required_fixes": \[\]/)
    assert.match(agent, /only.*result.*required_fixes/i)
    assert.match(agent, /structured task contract/i)
    assert.doesNotMatch(agent, /todo list/i)
    assert.match(agent, /interface shell|stub|only satisfy tests/i)
    assert.doesNotMatch(agent, /"rejected_tasks"/)
    assert.doesNotMatch(agent, /"unknown_tasks"/)
    assert.doesNotMatch(agent, /"unmapped_files"/)
    assert.doesNotMatch(agent, /"verified_tasks"/)
    assert.doesNotMatch(agent, /"round"/)
    assert.doesNotMatch(agent, /"kind"/)
    assert.doesNotMatch(agent, /Audit result:\s*pass \| fail/i)
  })

  it("every shared skill whitelist entry has a userconf or vendor source", () => {
    const list = readFileSync(join(repoRoot, "agents", "skills.list"), "utf8")
      .split("\n")
      .map((line) => line.replace(/#.*$/, "").trim())
      .filter(Boolean)

    for (const skill of list) {
      const sources = [
        join(repoRoot, "userconf", "skills", skill, "SKILL.md"),
        join(repoRoot, "vendor", "superpowers", "skills", skill, "SKILL.md"),
        join(repoRoot, "vendor", "opencode-dynamic-workflow", "skills", skill, "SKILL.md"),
      ]

      assert.ok(sources.some((path) => existsSync(path)), `${skill} should have a source SKILL.md`)
    }
  })

  it("rejects invalid shared skill names before creating symlinks", () => {
    const root = mkdtempSync(join(tmpdir(), "agents-skills-invalid-"))

    try {
      const skillsDir = join(root, "skills")
      const listPath = join(root, "skills.list")
      writeFileSync(listPath, "../escape\nwcag-check\n")

      const output = execFileSync(
        "bash",
        [
          "-c",
          [
            `AGENTS_SKILLS_DIR=${JSON.stringify(skillsDir)}`,
            `AGENTS_SKILLS_LIST=${JSON.stringify(listPath)}`,
            "OPENCODE_INIT_AS_LIBRARY=1",
            `source ${JSON.stringify(initScript)}`,
            "sync_shared_skills",
          ].join("; "),
        ],
        { encoding: "utf8" },
      )

      assert.match(output, /invalid skill name/)
      assert.equal(existsSync(join(root, "escape")), false)

      const linkPath = join(skillsDir, "wcag-check")
      const linkTarget = execFileSync("readlink", [linkPath], { encoding: "utf8" }).trim()

      assert.equal(linkTarget, join(repoRoot, "userconf", "skills", "wcag-check"))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("plan-runner delegates child agent selection to harness-managed dispatch", () => {
    const prompt = readFileSync(join(repoRoot, "userconf", "agents", "plan-runner.md"), "utf8")

    assert.match(prompt, /task:\s*deny/)
    assert.match(prompt, /dispatch_child:\s*allow/)
    assert.match(prompt, /harness-managed child dispatch|harness.*owns.*agent selection/i)
    assert.match(prompt, /dispatch_child\(\{\s*description,\s*prompt\s*\}\)/)
    assert.doesNotMatch(prompt, /\bexecutor\b/i)
    assert.doesNotMatch(prompt, /default child subagent/i)
    assert.doesNotMatch(prompt, /do not use custom agents/i)
    assert.doesNotMatch(prompt, /return evidence only/i)
  })

  it("plan-runner prompt uses write_plan tasks and harness task status tools", () => {
    const prompt = readFileSync(join(repoRoot, "userconf", "agents", "plan-runner.md"), "utf8")

    const missing = missingPromptClauses(prompt, [
      { label: "write_plan tasks", pattern: /write_plan\(\{\s*tasks/i },
      { label: "start_task", pattern: /start_task/i },
      { label: "complete_task", pattern: /complete_task/i },
      { label: "tasks are single source of truth", pattern: /tasks.*single source of truth|single source of truth.*tasks/i },
      { label: "audit external lifecycle gates", pattern: /audit.*external.*lifecycle gates|lifecycle gates.*audit.*external/i },
    ])

    assert.deepEqual(missing, [])
    assert.match(prompt, /todowrite:\s*deny/)
    assert.doesNotMatch(prompt, /Tn:\s*todo/i)
    assert.doesNotMatch(prompt, /mirror.*todo/i)
    assert.doesNotMatch(prompt, /superpowers:subagent-driven-development|executing-plans/)
  })

  it("plan-runner prompt separates the execution brief from harness task state", () => {
    const prompt = readFileSync(join(repoRoot, "userconf", "agents", "plan-runner.md"), "utf8")

    const missing = missingPromptClauses(prompt, [
      { label: "Execution Brief", pattern: /Execution Brief/i },
      { label: "machine execution contract", pattern: /machine execution contract/i },
      { label: "tasks single source", pattern: /tasks.*single source of truth|single source of truth.*tasks/i },
    ])

    assert.deepEqual(missing, [])
    assert.doesNotMatch(prompt, /structured state.*todowrite|todowrite.*structured state/i)
  })

  it("plan-runner prompt requires independent worktrees for all concurrent child work", () => {
    const prompt = readFileSync(join(repoRoot, "userconf", "agents", "plan-runner.md"), "utf8")

    const missing = missingPromptClauses(prompt, [
      { label: "no concurrency in main workspace", pattern: /no concurrency.*main workspace|main workspace.*no concurrency/i },
      { label: "parallel or DAG branches", pattern: /parallel\/DAG|parallel.*DAG/i },
      { label: "child worktree managed by harness", pattern: /harness.*worktree|worktree.*harness/i },
      { label: "child only edits its worktree", pattern: /child only edits its worktree/i },
      { label: "root merges back", pattern: /root merges back/i },
      { label: "root handles conflicts failures validation", pattern: /root handles.*conflicts.*failures.*validation/i },
    ])

    assert.deepEqual(missing, [])
  })

  it("plan-runner uses write_plan and finish_plan as harness lifecycle entrypoints", () => {
    const prompt = readFileSync(join(repoRoot, "userconf", "agents", "plan-runner.md"), "utf8")

    assert.match(prompt, /write_plan:\s*allow/)
    assert.match(prompt, /start_task:\s*allow/)
    assert.match(prompt, /complete_task:\s*allow/)
    assert.match(prompt, /finish_plan:\s*allow/)
    assert.match(prompt, /question:\s*deny/)
    assert.match(prompt, /call `write_plan\(\{ tasks \}\)`|call `write_plan` with `tasks`/i)
    assert.match(prompt, /create a local git commit/i)
    assert.match(prompt, /Do not push/i)
    assert.match(prompt, /repo is clean/i)
    assert.match(prompt, /call `finish_plan` before writing any final report/i)
    assert.match(prompt, /preflight_blocked/i)
    assert.match(prompt, /Only after `finish_plan` returns `validated`/i)
    assert.match(prompt, /Do not create a plan task for `finish_plan`/i)
    assert.doesNotMatch(prompt, /evidence_required/)
    assert.doesNotMatch(prompt, /provide evidence/i)
    assert.doesNotMatch(prompt, /claimed_done.*evidence/i)
    assert.doesNotMatch(prompt, /TODO:\s*\/\s*DONE:/)
    assert.doesNotMatch(prompt, /Every plan step must use `TODO:`/)
  })
})
