/**
 * stop-verification plugin for OpenCode
 *
 * 终态验证提醒。OpenCode 没有独立的 Stop 事件，
 * 使用 session.end.before 或 tool.execute.after 均无法精确模拟。
 *
 * 替代方案：挂载到 tool.execute.before 匹配 "done" / "complete" 类工具。
 * 但 OpenCode 实际上没有显式的 "stop" 工具调用——模型直接停止生成。
 *
 * 因此本 plugin 作为占位，仅在 OpenCode 未来支持 session.end / stop
 * 事件时启用。当前不做任何拦截。
 *
 * 对齐说明：Claude Code 端通过 Stop hook 实现；Codex 端同样缺乏此事件。
 * 终态验证目前依赖 CLAUDE.md 中的文字约束 + verification-before-completion skill。
 */

export const StopVerificationPlugin = async () => {
  return {}
}
