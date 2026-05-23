/**
 * skill-resolve-preflight plugin for OpenCode
 *
 * 对齐 Claude / Codex 端的 skill-resolve-preflight shell hook：拦截对
 * skill-catalog 的 resolve 调用，强制 agent 至少携带 tech_stack /
 * language / capability 之一为非空字符串数组，避免 resolve 在无意图
 * 信号下退化为全量检索。
 *
 * 工具名 / 文案 / escape hatch 全部从 SSOT 读取：
 *   shared/policies/skill-resolve-preflight.json
 * 三端 wrapper 引用同一份；防止文案 drift。
 *
 * OpenCode 把 MCP 工具暴露为 "<server-key>_<tool-name>"（单下划线），
 * 与 Claude / Codex 的 "mcp__<server>__<tool>"（双下划线）不同。
 * SSOT 的 tool_names 字段按 host 区分。
 */

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const pluginDir = dirname(fileURLToPath(import.meta.url))
// CLAUDE_CONFIG_HOME is the primary resolution path (works for both in-repo
// plugin and cp-copies). Fallback assumes the cp-copy layout where init_*.sh
// symlinked ~/.config/opencode/shared/ → repo/shared/.
const repoRoot = process.env.CLAUDE_CONFIG_HOME || join(pluginDir, "..")
const policyPath = join(repoRoot, "shared/policies/skill-resolve-preflight.json")

const loadPolicy = () => {
  const policy = JSON.parse(readFileSync(policyPath, "utf8"))
  const targetTool = policy.tool_names?.opencode
  if (!targetTool) {
    throw new Error(`skill-resolve-preflight policy missing tool_names.opencode at ${policyPath}`)
  }
  return {
    targetTool,
    escapeHatch: policy.escape_hatch_marker || "skip-skill-resolve-preflight",
    denyReason: (policy.deny_reason_template || [])
      .join("")
      .replaceAll("{tool_name}", targetTool),
  }
}

const _nonempty = (v) =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.some((x) => typeof x === "string" && x.trim().length > 0)

export const SkillResolvePreflightPlugin = async () => {
  const { targetTool, escapeHatch, denyReason } = loadPolicy()
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool !== targetTool) return

      const args = output.args ?? {}

      if (JSON.stringify(args).includes(escapeHatch)) return

      if (_nonempty(args.tech_stack) || _nonempty(args.language) || _nonempty(args.capability)) {
        return
      }

      throw new Error(denyReason)
    },
  }
}
