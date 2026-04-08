# 输出格式：模型标签

每次 agent 向用户输出文本时（不包含 tool call），**输出的第一个词之前**必须加 `[model_name]` 标签（model_name 为当前实际使用的模型名，例如 `[claude-opus-4-6]`、`[claude-sonnet-4-6]`）。

- 适用于所有文本输出，包括但不限于：用户交互后的首次回答、进入/退出 plan mode 后的输出、以及同一轮内的多段文本输出
- 标签不单独成行，直接作为正文的前缀，后接正文内容

---

# Git Commit Message 规范

采用 Conventional Commits 风格的轻量化中文版：type/scope 英文，subject/body 中文。

**需要创建 commit 时**，先读 `~/.claude/guidelines/git-commit.md` 获取完整规范（字段约束、示例、反例、拆分原则）。无 commit 任务时无需加载。
