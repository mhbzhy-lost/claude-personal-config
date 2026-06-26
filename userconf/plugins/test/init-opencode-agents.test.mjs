import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { join } from "node:path"
import { tmpdir } from "node:os"

const repoRoot = new URL("../../..", import.meta.url).pathname
const initScript = join(repoRoot, "init_opencode.sh")

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

      assert.equal(existsSync(join(pluginDir, "session-journal.js")), false)
    } finally {
      rmSync(configDir, { recursive: true, force: true })
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

      assert.equal(existsSync(join(pluginDir, "session-journal.js")), false)
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
      execFileSync("ln", ["-s", workflowSource, legacyLink])

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
      assert.equal(existsSync(legacyLink), false)
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

  it("plan-runner may orchestrate default child subagents without recursive delegation", () => {
    const prompt = readFileSync(join(repoRoot, "userconf", "agents", "plan-runner.md"), "utf8")

    assert.match(prompt, /task:\s*allow/)
    assert.match(prompt, /default child subagent/i)
    assert.match(prompt, /do not use custom agents/i)
    assert.match(prompt, /return evidence only/i)
  })

  it("plan-runner uses write_plan as the harness plan entrypoint", () => {
    const prompt = readFileSync(join(repoRoot, "userconf", "agents", "plan-runner.md"), "utf8")

    assert.match(prompt, /write_plan:\s*allow/)
    assert.match(prompt, /call `write_plan`/i)
    assert.doesNotMatch(prompt, /TODO:\s*\/\s*DONE:/)
    assert.doesNotMatch(prompt, /Every plan step must use `TODO:`/)
  })
})
