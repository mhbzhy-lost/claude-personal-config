# 输出格式：模型标签

在以下三个时机，**输出的第一个词之前**必须加 `[model_name]` 标签（model_name 为当前实际使用的模型名）：

| 时机 | 示例标签 |
|---|---|
| 每次用户发起交互后的第一次回答 | `[claude-sonnet-4-6]` |
| 进入 plan mode（`EnterPlanMode`）后第一次输出 | `[claude-opus-4-6]` |
| 退出 plan mode（`ExitPlanMode`）后第一次输出 | `[claude-sonnet-4-6]` |

- 每次用户消息都需要加标签，不限于 session 内的第一次
- 标签单独成行，正文另起一行

---

# Git Commit Message 规范

采用 Conventional Commits 风格的轻量化中文版：type/scope 英文，subject/body 中文。

**需要创建 commit 时**，先读 `~/.claude/guidelines/git-commit.md` 获取完整规范（字段约束、示例、反例、拆分原则）。无 commit 任务时无需加载。
