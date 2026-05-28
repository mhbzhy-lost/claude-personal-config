# Codex coding guard 未覆盖 apply_patch 编辑入口

## 现象

Codex 侧已注册 `codex/hooks/coding-guard.sh`，但本会话中通过
`functions.apply_patch` 修改非测试代码文件时，没有看到 TDD / bug 分析提醒。

## 调用链

1. `~/.codex/hooks.json` 注册 `PreToolUse` matcher：`Edit|Write`。
2. `codex/hooks/coding-guard.sh` 从 `payload.tool_input.file_path` 读取单文件路径。
3. 当前 Codex 运行时提供的实际编辑入口是 `functions.apply_patch`。
4. `functions.apply_patch` 的输入是 patch 文本，不是 `file_path` 单字段。
5. 因此 hook 没有匹配真实工具名；即使匹配，也无法从 patch 文本中识别被改文件。

## 根因假设

Codex hook 从 Claude Code 的 `Edit|Write` 模型迁移而来，只覆盖了“单文件编辑工具”
形态，没有把 Codex harness 注入的 patch 编辑工具作为一等编辑入口处理。

## 验证方式

- 单测：`functions.apply_patch` / `apply_patch` payload 修改非测试 `.sh` 文件时应输出
  coding guard 提醒。
- 单测：patch 只修改 `tests/` 下文件时应静默放行。
- 单测：`codex/hooks.json` 必须注册 `apply_patch` 与 `functions.apply_patch` matcher。

## 根因确认

手动喂 `Edit` + `file_path` payload 时，`coding-guard.sh` 会对非测试代码文件输出提醒；
喂测试文件或 `.json/.md` 时静默。这说明脚本的文件过滤逻辑可用，缺口在 Codex
真实编辑工具名和 patch 输入形态兼容。

## 影响范围

- Codex 端通过 `functions.apply_patch` 修改 `.sh/.py/.ts/...` 非测试代码文件时，
  不会触发 TDD / bug 分析提醒。
- Claude / Qwen / OpenCode 端不直接受影响；它们各自使用不同编辑工具名或插件机制。

## 修复方案

在 Codex hook 模板中把 matcher 扩展为 `Edit|Write|apply_patch|functions.apply_patch`。
同时让 `codex/hooks/coding-guard.sh` 支持从 patch 文本中提取
`*** Add File:`、`*** Update File:`、`*** Delete File:`、`*** Move to:` 后面的路径；
只要任一被改文件是非测试代码文件，就输出同一条提醒。

外源 review 后补充两类健壮性约束：

- stdin 读取必须容忍非法 UTF-8 字节，避免 hook 因输入解码异常阻断主流程。
- 测试目录判断必须覆盖 `tests/...` 这类相对路径，不能只匹配 `/tests/`。
