/**
 * stop-verification plugin for OpenCode
 *
 * 终态验证提醒。监听 session.idle 事件（turn 结束后触发），
 * 通过 client.session.prompt 向 session 注入验证提醒，触发 agent 自检。
 *
 * 防无限循环：每个 session 只触发一次；用户发新消息后重置。
 *
 * 与 Claude Code / Codex 的 Stop hook 差异：
 * - Stop hook 在 turn 结束前注入，模型可在同一 turn 内自我修正
 * - session.idle 在 turn 结束后触发，注入 prompt 会产生新 turn
 */

export const StopVerificationPlugin = async (ctx) => {
  // 每个 session 跟踪是否已触发过 stop-verification
  const firedSessions = new Set()

  return {
    "chat.message": async (input) => {
      // 用户发新消息时重置，允许下次 idle 再触发
      if (input.sessionID) {
        firedSessions.delete(input.sessionID)
      }
    },

    event: async ({ event }) => {
      if (event.type !== "session.idle") return

      const sessionID = event.properties?.sessionID
      if (!sessionID) return

      // 同一轮只触发一次
      if (firedSessions.has(sessionID)) return
      firedSessions.add(sessionID)

      if (ctx.client?.session?.prompt) {
        await ctx.client.session.prompt({
          path: { id: sessionID },
          body: {
            parts: [
              {
                type: "text",
                text: "⚠️ [stop-verification] 停止前确认：(1) 已运行验证命令并确认输出？(2) 有未提交变更？",
              },
            ],
          },
        })
      }
    },
  }
}
