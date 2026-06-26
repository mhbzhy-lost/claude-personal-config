# Bug: init 无法清理相对 target 的托管软链

## 现象

push review 指出 `init_opencode.sh` 使用 `readlink` 原始字符串与绝对路径比较，历史环境中若托管软链以相对 target 创建，废弃 plugin 或 legacy skill 软链会残留。

## 根因 (6 要素)

1. **触发条件**：`~/.config/opencode/plugins/session-journal.js` 或 `~/.config/opencode/skills/workflow-usage` 是指向本仓托管源的相对路径软链，包括 target parent 已缺失的 stale 软链。
2. **期望链路**：初始化脚本识别该软链仍指向本仓托管源，并按废弃或迁移规则删除旧软链。
3. **实际链路**：`readlink` 返回软链内保存的相对字符串，脚本直接与 `$src_path/...` 或 `$workflow_skill_source` 的绝对字符串比较。
4. **关键假设失效**：实现假设历史软链全部由本仓脚本用绝对路径创建，忽略了用户手工创建或旧脚本相对创建的可能。
5. **旁证**：测试中的 dangling symlink 用 `existsSync` 断言会跟随 target，导致未清理的断链也显示为不存在，掩盖了这类残留。
6. **实现偏差**：托管关系应比较解析后的路径语义，而不是比较 `readlink` 的原始字符串。

## 修复方案

新增软链 target 比较 helper：先保留原始字符串完全匹配的快路径，再把相对 target 按软链所在目录解析为规范路径，与期望路径比较；对于 parent 已缺失的历史托管软链，再用明确的托管后缀兜底识别。

## 验证

新增相对 target 和 stale 相对 target 的 retired plugin 清理测试；`workflow-usage` legacy 软链测试覆盖相对 target 与 stale 相对 target；旧 dangling symlink 断言改成 `lstat`，不再跟随 target。
