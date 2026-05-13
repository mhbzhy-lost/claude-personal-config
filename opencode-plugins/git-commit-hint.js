/**
 * git-commit-hint plugin for OpenCode
 *
 * 拦截 bash 工具的 git commit 操作，提示 agent 先调用 /git-commit skill
 * 获取 Conventional Commits 规范后再撰写 commit message。
 *
 * 跳过标记：在 bash 工具的 description 中包含 "skip-git-commit-hint" 即可绕过。
 */

export const GitCommitHintPlugin = async (ctx) => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "bash") return

      const command = output.args?.command || ""
      const description = output.args?.description || ""

      // 仅匹配 git commit（排除 git commit-tree/git commit-graph 等子命令）
      if (!/\bgit\s+commit\b/.test(command)) return

      // 逃生舱：description 含特殊标记则放行
      if (/skip-git-commit-hint/i.test(description)) return

      throw new Error(
        "[git-commit 插件] 检测到 git commit 操作。\n" +
        "请先通过 Skill 工具调用 git-commit skill 获取 Conventional Commits 规范，\n" +
        "再按规范生成 commit message 后执行 git commit。\n" +
        '如需跳过此检查，请在 description 中包含 "skip-git-commit-hint"。'
      )
    },
  }
}
