/**
 * stop-verification plugin for OpenCode
 *
 * 终态验证提醒。监听 session.idle 事件（turn 结束后触发），
 * 通过 toast 通知用户检查验证状态。
 *
 * 与 Claude Code / Codex 的 Stop hook 差异：
 * - Stop hook 在 turn 结束前注入，模型可自我修正
 * - session.idle 在 turn 结束后触发，只能做后置通知
 *
 * 不使用 client.session.prompt 避免 idle → prompt → response → idle 死循环。
 */

export const StopVerificationPlugin = async (ctx) => {
  return {
    event: async ({ event }) => {
      if (event.type !== "session.idle") return

      if (ctx.client?.tui?.showToast) {
        await ctx.client.tui.showToast({
          body: {
            message: "⚠️ Turn 结束：是否已验证？是否有未提交变更？",
            variant: "warning",
          },
        })
      }
    },
  }
}
