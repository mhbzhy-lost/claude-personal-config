---
title: Codex hooks 托管边界
kind: convention
status: active
applies_to:
  - init_codex.sh
  - codex/hooks.json
  - codex/hooks/
last_verified: 2026-06-10
source: codex hooks overwrite bugfix
---

# `init_codex.sh` 只管理本仓 Codex hooks

`~/.codex/hooks.json` 不是本仓独占文件。`init_codex.sh` 渲染 hooks 时只能替换
`codex/hooks.json` 模板中声明的本仓托管 hook，必须保留用户或第三方工具写入的
非托管 hook。

## 适用场景

修改 Codex hooks 模板、`render_hooks_json`、新增/删除 hook 脚本，或排查
`~/.codex/hooks.json` 与仓内模板不一致时，必须检查本文。

## 项目事实 / 约定

仓内 `codex/hooks.json` 是本仓托管 hook 的单一来源。渲染时会把
`__CLAUDE_CONFIG_HOME__` 替换成当前仓库绝对路径，再用模板中的 hook 命令路径推导
托管 marker，例如 `codex/hooks/git-commit-hint.sh` 或
`shared/hooks/subagent-dispatch-hint.sh`。

目标 `~/.codex/hooks.json` 中命中这些 marker 的旧条目会被替换为模板中的当前条目。
未命中托管 marker 的条目和事件视为非托管配置，必须保留，包括第三方
`PreToolUse`、`PostToolUse`、`PostToolUseFailure` 等 hook。非托管条目的既有顺序
也应保留；如果某个事件原来没有本仓托管条目，新托管条目追加到该事件末尾。

如果目标文件不存在、不是 JSON，或顶层不是对象，脚本可以按模板生成完整托管配置。

## 原因

Codex hook 文件也可能由桌面插件、用户脚本或其他工具共同维护。覆盖写会删除非本仓
配置；只按列表位置合并又无法区分旧托管条目和第三方条目。因此托管边界必须来自
本仓模板中的稳定命令路径，而不是事件名或数组下标。

## 修改时注意

- 新增本仓 hook 时，先加入 `codex/hooks.json`；渲染逻辑会自动把其命令路径纳入
  托管 marker。
- 删除本仓 hook 时，如果需要清理历史遗留条目，必须确保旧命令路径仍能被托管
  marker 识别，或补专门的退役 marker 测试。
- 不要在 `render_hooks_json` 中恢复整文件覆盖写。
- 不要把第三方 hook 纳入仓内模板；模板只表达本仓托管条目。

## 验证方式

```bash
python3 -m unittest \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_init_codex_preserves_unmanaged_hooks_when_rendering
python3 -m unittest codex/hooks/tests/test_codex_hooks.py
```
