/**
 * dag-dispatch-hint plugin for OpenCode
 *
 * 拦截 task 工具（subagent 派发），强制 agent 派发前对齐
 * claude/CLAUDE.md 的「并发」与「Subagent」全局规则：
 *  - 同一并发集合（无相互依赖）的 task 必须在同一 assistant message 内
 *    一次性发出多个 task tool call 实现并行派发
 *  - 仅有真实依赖关系时才允许串行
 *  - coding task 必须通过 git worktree 隔离，合并后跑验证
 *  - 自动合并失败或语义冲突时停止并请求用户决策
 *  - subagent 统一后台运行，主对话保持响应
 *
 * 跳过标记：task 的任意字符串参数中包含 "skip-dag-hint" 字面值即放行。
 * 推荐落在 description 字段（agent 直觉最易接受）。
 *
 * 工具名与参数结构（已对照 sst/opencode 源码 packages/opencode/src/tool/task.ts）：
 *   id = "task"
 *   Parameters = { description, prompt, subagent_type, task_id?, command? }
 */

import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const pluginDir = dirname(fileURLToPath(import.meta.url))

const policyCandidates = () => {
  const roots = [
    process.env.CLAUDE_CONFIG_HOME,
    join(pluginDir, "..", ".."),
    join(pluginDir, ".."),
  ].filter(Boolean)
  return roots.map((root) => join(root, "shared/policies/subagent-dispatch-hint.json"))
}

const loadDispatchHint = () => {
  for (const policyPath of policyCandidates()) {
    if (!existsSync(policyPath)) continue
    const policy = JSON.parse(readFileSync(policyPath, "utf8"))
    return (policy.template || []).join("\n")
  }
  throw new Error("subagent-dispatch-hint policy not found")
}

export const DagDispatchHintPlugin = async (ctx) => {
  const dispatchHint = loadDispatchHint()
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "task") return

      // 整 args JSON-stringify 后做正则匹配，不依赖具体字段名
      const haystack = JSON.stringify(output.args ?? {})

      // 逃生舱：任意字符串参数含 "skip-dag-hint" 字面值即放行
      if (/skip-dag-hint/i.test(haystack)) return

      throw new Error(dispatchHint)
    },
  }
}
