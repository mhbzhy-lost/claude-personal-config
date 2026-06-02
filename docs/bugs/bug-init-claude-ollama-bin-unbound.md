# Bug: init_claude 在 skill-catalog 默认禁用时引用未定义 OLLAMA_BIN

## 现象

执行 `bash init_claude.sh` 时，脚本已完成 Superpowers.md 软链、skills 同步、
`block-catalog` MCP 移除、playwright MCP 检查和 plugin 检查后退出：

```text
init_claude.sh: line 1229: OLLAMA_BIN: unbound variable
```

## 根因 (6 要素)

1. **触发条件**：`ENABLE_SKILL_CATALOG_MCP` 使用默认值 `false`，脚本启用
   `set -u`。
2. **期望链路**：skill-catalog MCP 默认禁用时，Ollama 初始化和旧模型清理提示都应跳过。
3. **实际链路**：Ollama 初始化块被 `if [ "${ENABLE_SKILL_CATALOG_MCP:-false}" = "true" ]`
   包裹，`OLLAMA_BIN` 只在该块内赋值；但文件尾部仍无条件执行
   `[ -x "$OLLAMA_BIN" ]`。
4. **关键假设失效**：尾部清理提示假设 `OLLAMA_BIN` 总会被定义；这在默认禁用
   skill-catalog MCP 后不成立。
5. **旁证**：本次真实运行 `init_claude.sh` 输出 `skill-catalog MCP 默认禁用` 后，
   在第 1229 行触发 `OLLAMA_BIN: unbound variable`。
6. **实现偏差**：旧模型清理提示属于 Ollama/skill-catalog 逻辑，却没有跟随同一个
   feature flag 或变量存在性 guard。

## 影响范围

- 默认运行 `bash init_claude.sh` 会以非零状态结束。
- 前面的软链和 MCP 清理已经执行，但末尾 `.zshrc` launcher 注册与最终完成提示可能被跳过。
- 不影响 OpenCode/Codex init 的本次同步结果。

## 修复原则

- 不重新启用 skill-catalog MCP。
- 仅在 `ENABLE_SKILL_CATALOG_MCP=true` 且 `OLLAMA_BIN` / `OLLAMA_MODELS_DIR` /
  `OLLAMA_HOST_URL` 已定义时输出旧 qwen2.5 清理提示。
- 补一条 source-level 或 shell 级回归测试，覆盖默认禁用 skill-catalog 时不会出现
  未定义变量。

## 待确认

是否按上述原则修复 `init_claude.sh`，并补测试后重新运行 `bash init_claude.sh`。
