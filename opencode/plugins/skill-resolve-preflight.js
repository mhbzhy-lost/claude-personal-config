/**
 * skill-resolve-preflight plugin for OpenCode
 *
 * 对齐 Claude Code 端的 PreToolUse hook（claude/hooks/skill-resolve-preflight.sh）：
 * 拦截对 skill-catalog 的 resolve 调用，强制 agent 至少携带
 *   tool_input.tech_stack / language / capability
 * 三个字段之一为非空字符串数组，避免 resolve 在无意图信号下退化为全量检索。
 *
 * 工具命名说明（已实测 OpenCode 1.14.x）：
 *   OpenCode 把 MCP 工具暴露为 "<server-key>_<tool-name>" 单下划线格式，
 *   与 Claude 端 "mcp__<server>__<tool>" 双下划线**不同**。本仓 skill-catalog
 *   在 ~/.config/opencode/opencode.json 的 mcp key 是 "skill-catalog"，
 *   故 resolve 工具名是 "skill-catalog_resolve"。若改 key 或换 server 需同步此处。
 *
 * 跳过标记：args 中任意字符串字段包含 "skip-skill-resolve-preflight" 即放行
 * （应急逃生，正常不应使用）。
 */

const TARGET_TOOL = "skill-catalog_resolve"
const ESCAPE_HATCH = "skip-skill-resolve-preflight"

const _nonempty = (v) =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.some((x) => typeof x === "string" && x.trim().length > 0)

export const SkillResolvePreflightPlugin = async () => ({
  "tool.execute.before": async (input, output) => {
    if (input.tool !== TARGET_TOOL) return

    const args = output.args ?? {}

    if (JSON.stringify(args).includes(ESCAPE_HATCH)) return

    if (_nonempty(args.tech_stack) || _nonempty(args.language) || _nonempty(args.capability)) {
      return
    }

    throw new Error(
      "[skill-resolve-preflight] 调用 skill-catalog_resolve 必须携带意图识别结果：" +
        "tech_stack / language / capability 三个参数至少一个为非空字符串数组。\n" +
        "请基于当前会话上下文（user_prompt + workspace 信号）先做意图识别，" +
        "分别判断涉及的技术栈、编程语言、能力域，再从合法 tag 闭集中挑选若干标签后重试。" +
        "纯语言题（如 '写一段 C++ 模板'）可仅填 language。\n" +
        "合法闭集见 SubagentStart 注入的 %skill 规范；未触发注入时勿改调 list_skills，" +
        "流程详见 claude-skills/knowledge-retrieval/references/knowledge-retrieval-process.md。"
    )
  },
})
