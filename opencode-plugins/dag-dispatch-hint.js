/**
 * dag-dispatch-hint plugin for OpenCode
 *
 * 拦截 task 工具（subagent 派发），强制 agent 派发前完成 DAG 拓扑分析：
 *  - 同一并发集合（无相互依赖）的 task 必须在同一 assistant message 内
 *    一次性发出多个 task tool call 实现并行派发
 *  - 仅有真实依赖关系时才允许串行
 *  - subagent 统一后台运行，主对话保持响应
 *
 * 对齐 ~/.claude/CLAUDE.md §2「可并发：DAG 拓扑而非串行」与
 * §3「不阻塞：subagent 后台执行」。
 *
 * 跳过标记：task 的任意字符串参数中包含 "skip-dag-hint" 字面值即放行。
 * 推荐落在 description 字段（agent 直觉最易接受）。
 *
 * 工具名与参数结构（已对照 sst/opencode 源码 packages/opencode/src/tool/task.ts）：
 *   id = "task"
 *   Parameters = { description, prompt, subagent_type, task_id?, command? }
 */

export const DagDispatchHintPlugin = async (ctx) => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "task") return

      // 整 args JSON-stringify 后做正则匹配，不依赖具体字段名
      const haystack = JSON.stringify(output.args ?? {})

      // 逃生舱：任意字符串参数含 "skip-dag-hint" 字面值即放行
      if (/skip-dag-hint/i.test(haystack)) return

      throw new Error(
        "[dag-dispatch 插件] 准备派发 subagent，必须先完成 DAG 拓扑分析。\n" +
        "\n" +
        "1) 并发派发要求（CLAUDE.md §2 可并发）\n" +
        "   - 列出当前阶段所有待派发 task\n" +
        "   - 标注每个 task 的前驱依赖\n" +
        "   - 无相互依赖的 task 必须在同一 assistant message 内\n" +
        "     一次性发出多个 task tool call 实现并行派发\n" +
        "   - 串行派发独立 task 视为流程违规\n" +
        "\n" +
        "2) 后台执行（CLAUDE.md §3 不阻塞）\n" +
        "   - subagent 统一后台运行，不阻塞主对话\n" +
        "   - 依赖前驱的 task 必须等前驱完成后再派发\n" +
        "\n" +
        "3) 逃生路径（满足任一时，在本次 task 的 description 字段\n" +
        "   （或 prompt 等任一字符串参数）中加入字面值 \"skip-dag-hint\"\n" +
        "   即可放行）：\n" +
        "   a. 当前阶段实际只有 1 个 task，无并发空间\n" +
        "   b. 已完成 DAG 分析，本次派发是某并发集合内的全部 task\n" +
        "      之一，且其余兄弟 task 已在同一 message 内一并发出\n" +
        "   c. 当前 task 依赖未完成的前驱，必须串行等待\n" +
        "\n" +
        "不满足放行条件请重新组织派发方式后再次发起。"
      )
    },
  }
}
