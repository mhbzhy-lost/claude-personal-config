/**
 * coding-guard plugin for OpenCode
 *
 * tool.execute.after(edit|write): 编辑非测试代码文件后提醒 TDD + bugfix 流程。
 * 白名单过滤代码文件后缀，测试文件静默放行。
 *
 * 使用 after 而非 before：OpenCode 的 before hook 只能 throw 硬阻拦或静默放行，
 * 没有软提醒机制。after hook 可以修改 output（title/output/metadata），
 * 在工具执行后向 agent 注入提醒文字，效果等同于其他 AI 编码工具的软提醒。
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

const REMINDER =
  "\n\n⛔ [coding-guard] 编辑非测试代码文件后确认：" +
  "(1) TDD：对应的失败测试写了吗？" +
  "(2) 若在修 bug：docs/bugs/bug-*.md 分析文档写了吗？"

export const CodingGuardPlugin = async () => {
  return {
    "tool.execute.after": async (input, output) => {
      if (input.tool !== "edit" && input.tool !== "write") return

      const filePath = input.args?.file_path || input.args?.filePath || ""
      if (!filePath) return

      const ext = extname(filePath).toLowerCase()
      if (!CODE_EXTENSIONS.has(ext)) return

      if (TEST_PATTERN.test(basename(filePath))) return
      if (TEST_DIR_PATTERN.test(filePath)) return

      // 在工具输出后追加提醒，agent 会在下一步决策时看到
      if (output.output != null) {
        output.output = String(output.output) + REMINDER
      } else {
        output.output = REMINDER
      }
    },
  }
}
