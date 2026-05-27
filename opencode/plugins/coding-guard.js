/**
 * coding-guard plugin for OpenCode
 *
 * PreToolUse(edit|write): 编辑非测试代码文件时提醒 TDD + bugfix 流程。
 * 白名单过滤代码文件后缀，测试文件静默放行。
 * 对齐 Claude Code 端 claude/hooks/coding-guard.sh。
 */

import { extname, basename } from "node:path"

const CODE_EXTENSIONS = new Set([
  // 通用
  ".py", ".ts", ".tsx", ".js", ".jsx", ".go", ".rs", ".sh", ".rb",
  ".c", ".cpp", ".h", ".hpp", ".cc", ".cxx",
  // iOS/macOS
  ".swift", ".m", ".mm",
  // Android
  ".kt", ".kts", ".java",
  // HarmonyOS (ArkTS)
  ".ets",
])

const TEST_PATTERN = /(test|spec|_test|\.test\.|\.spec\.)/i
const TEST_DIR_PATTERN = /\/(tests|test|__tests__)\//i

export const CodingGuardPlugin = async () => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "edit" && input.tool !== "write") return

      const filePath = output.args?.file_path || output.args?.filePath || ""
      if (!filePath) return

      const ext = extname(filePath).toLowerCase()
      if (!CODE_EXTENSIONS.has(ext)) return

      if (TEST_PATTERN.test(basename(filePath))) return
      if (TEST_DIR_PATTERN.test(filePath)) return

      throw new Error(
        "⛔ 编辑非测试代码文件前确认：" +
        "(1) TDD：对应的失败测试写了吗？" +
        "(2) 若在修 bug：docs/bugs/bug-*.md 分析文档写了吗？"
      )
    },
  }
}
