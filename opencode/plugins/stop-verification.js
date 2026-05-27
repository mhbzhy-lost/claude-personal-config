/**
 * stop-verification plugin for OpenCode
 *
 * 终态验证提醒。监听 session.idle 事件（turn 结束后触发），
 * 通过 toast 通知提醒用户检查。
 *
 * 不使用 client.session.prompt —— 实测会导致无限循环：
 * idle → prompt → response → idle → prompt → ...
 * chat.message 无法可靠区分用户消息和注入消息，ESC 取消也触发 idle。
 *
 * 与 Claude Code / Codex 的 Stop hook 差异：
 * - Stop hook 在 turn 结束前注入，模型可在同一 turn 内自我修正
 * - 本 plugin 仅做后置 toast 通知，不影响对话流
 */

export const StopVerificationPlugin = async (ctx) => {
  return {
    event: async ({ event }) => {
      if (event.type !== "session.idle") return

      if (ctx.client?.tui?.showToast) {
        await ctx.client.tui.showToast({
          body: {
            message: "⚠️ 停止前确认：已运行验证？有未提交变更？",
            variant: "warning",
          },
        })
      }
    },
  }
}
