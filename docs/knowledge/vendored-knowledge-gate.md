---
title: Vendored knowledge gate
kind: convention
status: active
applies_to:
  - templates/knowledge-gate/
  - scripts/install-knowledge-gate.sh
  - shared/policies/git-commit-hint.json
last_verified: 2026-06-10
source: knowledge gate design decision
---

# 知识库硬门禁必须随项目交付

`claude-config` 可以维护 knowledge gate 的模板和安装器，但目标项目运行时不能依赖本仓。需要硬门禁的项目必须把 checker、规则文件和可选 Git hook wrapper 复制进项目内并提交。

## 适用场景

修改 knowledge gate 模板、安装器、git commit hint 文案，或给目标项目接入知识库硬门禁时，必须检查本文。

## 项目事实 / 约定

全局 git commit hook 只做流程提醒，不硬编码项目路径规则。项目路径语义只能由目标项目自己的 `.agent/knowledge-gate.json` 表达。

模板 checker 支持两类粒度：

- any：`satisfy_by: ["docs/knowledge/**"]`，命中规则后任意知识文档更新即可满足。
- topic：`satisfy_by: ["docs/knowledge/runtime.md"]`，命中规则后必须更新指定主题文档。

默认不实现一源文件一文档的 mapped 模式；需要这种强约束的项目应在自己的 checker 副本上扩展，而不是把复杂映射推回全局模板。

## 修改时注意

- 安装器默认不覆盖目标项目已有文件。
- 无 `.agent/knowledge-gate.json` 时 checker 必须 no-op。
- checker 必须只依赖 Python 标准库和 Git。
- 不要让目标项目运行时 import `claude-config`。

## 验证方式

```bash
python3 -m unittest \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_knowledge_gate_noops_when_config_is_missing \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_knowledge_gate_blocks_matching_paths_without_knowledge_update \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_knowledge_gate_allows_when_matching_knowledge_file_is_staged \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_install_knowledge_gate_copies_template_without_overwrite
```
