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
      if (!/(^|[^\w-])git\s+commit(\s|$)/.test(command)) return

      // 逃生舱：description 含特殊标记则放行
      if (/skip-git-commit-hint/i.test(description)) return

      throw new Error(
        "[git-commit 插件] 准备执行 git commit，提交前必须完成以下两件事：\n" +
        "1) 通过 Skill 工具调用 git-commit skill 获取 commit message 规范，再生成 message；\n" +
        "2) 通过 Skill 工具调用 external-llm-review skill，对本次 staged diff " +
        "（`git diff --cached`）跑一次外源评审；未给出 non-blocking 结论前不得 commit，" +
        "fix 后需重新跑直到收敛。\n" +
        "若满足 CLAUDE.md「异源复审 / 何时不必用」豁免条件（纯文档配置、作用域<50 行且无外部依赖、" +
        "无 API 凭据、项目合规策略禁止外发），可跳过第 2 步并在 commit message 注明豁免原因。\n" +
        '如需完全跳过此检查，请在 description 中包含 "skip-git-commit-hint"。'
      )
    },
  }
}
