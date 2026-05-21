/**
 * git-commit-hint plugin for OpenCode
 *
 * 拦截 bash 工具的 git commit 操作，并渲染共享 hint 内容。
 */

import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const hintContentPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "git-commit-hint-content.json",
)

const renderGitCommitHint = async (host) => {
  try {
    const content = JSON.parse(await readFile(hintContentPath, "utf8"))
    return content.template
      .join("\n")
      .replaceAll("{hook_name}", content.hook_names[host])
      .replaceAll("{escape_instruction}", content.escape_instructions[host])
  } catch (err) {
    process.stderr.write(`git-commit-hint: failed to render shared hint: ${err}\n`)
    return ""
  }
}

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

      const hint = await renderGitCommitHint("opencode")
      if (!hint) return
      throw new Error(hint)
    },
  }
}
