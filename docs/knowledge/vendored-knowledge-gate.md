---
title: Vendored knowledge gate
kind: convention
status: active
applies_to:
  - templates/knowledge-gate/
  - scripts/install-knowledge-gate.sh
  - shared/policies/git-commit-hint.json
last_verified: 2026-06-17
source: knowledge gate design decision
---

# 知识库硬门禁必须随项目交付

`claude-config` 可以维护 knowledge gate 的模板和安装器，但目标项目运行时不能依赖本仓。需要硬门禁的项目必须把 checker、规则文件和可选 Git hook wrapper 复制进项目内并提交。

## 适用场景

修改 knowledge gate 模板、安装器、git commit hint 文案，或给目标项目接入知识库硬门禁时，必须检查本文。

## 项目事实 / 约定

全局 opencode 不再拦截 `git commit`（format 校验由 `git-commit-gate.js` 负责，knowledge gate 由目标项目自己承担）。项目路径语义只能由目标项目自己的 `.agent/knowledge-gate.json` 表达。

模板 checker 支持两类粒度：

- any：`satisfy_by: ["docs/knowledge/**"]`，命中规则后任意知识文档更新即可满足。
- topic：`satisfy_by: ["docs/knowledge/runtime.md"]`，命中规则后必须更新指定主题文档。

默认不实现一源文件一文档的 mapped 模式；需要这种强约束的项目应在自己的 checker 副本上扩展，而不是把复杂映射推回全局模板。

模板 checker 使用 Python `fnmatch.fnmatchcase` 匹配路径，`*` 会匹配 `/`。如果目标
项目需要 shell glob 式“单星不跨目录、双星跨目录”，应在 vendored 副本中扩展匹配
实现，并同步更新该项目自己的规则说明。

## 配套的 opencode plugin

模板同时附带一个项目级 opencode plugin（`templates/knowledge-gate/.opencode/plugins/git-commit-hint.js`），安装时会一并落到目标项目的 `.opencode/plugins/git-commit-hint.js`。它是知识门禁语义在 opencode 会话内的提醒：拦截 `git commit` 并提示 agent 先满足 `.agent/knowledge-gate.json` 的规则、更新 `docs/knowledge/`。

- 职责只限 knowledge gate 提醒，不做 commit message 格式校验（由全局 `git-commit-gate` 插件负责）。
- 通过 opencode 的自动发现机制生效（`.opencode/plugins/` 目录无需显式注册）。
- Hint 文案 SSOT 在 `shared/policies/git-commit-hint.json`；`install-knowledge-gate.sh` 安装时把 template 渲染成字符串嵌入插件文件，目标项目运行时不再依赖本仓。
- 修改 hint 文案时：更新 SSOT JSON 即可，已安装的 workspace 下次重跑 install 脚本会 pick up 新版本。

## 修改时注意

- 安装器默认不覆盖目标项目已有文件。
- 无 `.agent/knowledge-gate.json` 时 checker 必须 no-op。
- `.agent/knowledge-gate.json` 存在但无效，或 `git diff --cached` 无法读取 staged
  diff 时，checker 必须 fail-close 并返回 `2`。
- checker 必须只依赖 Python 标准库和 Git。
- 不要让目标项目运行时 import `claude-config`。

## 验证方式

```bash
# plugin 行为测试（block / skip）
node --test userconf/plugins/test/git-commit-hint-template.test.mjs

# 安装脚本测试（4 文件落盘、SSOT 渲染、不覆盖既有）
node --test userconf/plugins/test/install-knowledge-gate.test.mjs
```

端对端：对目标项目跑一次 `bash scripts/install-knowledge-gate.sh /path/to/repo`，
再用 opencode 打开并执行 `git commit -m "..."`，应看到 knowledge gate 提示阻断。
