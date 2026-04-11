# 输出格式：模型标签

每次 agent 向用户输出文本时（不包含 tool call），**输出的第一个词之前**必须加 `[model_name]` 标签（model_name 为当前实际使用的模型名，例如 `[claude-opus-4-6]`、`[claude-sonnet-4-6]`）。

- 适用于所有文本输出，包括但不限于：用户交互后的首次回答、进入/退出 plan mode 后的输出、以及同一轮内的多段文本输出
- 标签不单独成行，直接作为正文的前缀，后接正文内容

---

# 开发计划执行前的预检

**从磁盘读取开发计划并准备执行前，必须调用一次 `plan-validator` agent 进行预检。**

触发条件：用户要求执行磁盘上已有的技术文档（如 `docs/plans/*.md`、设计文档等）。

调用方式：将计划文件路径传给 `plan-validator` agent，由其对照当前代码库状态检查知识过期、前提失效、逻辑矛盾三类问题。

处理裁定：
- `✅ GO`：直接进入执行阶段
- `⚠️ HOLD`：暂停执行，向用户汇报阻塞性问题列表，由用户决策**修复计划**还是**忽略并继续执行**，获得明确指令后再动手

每次对话针对同一计划仅触发一次。

---

# 开发计划执行后的测试审查

**从磁盘读取开发计划并完成执行后，必须调用一次 `test-expert` agent 进行测试质量审查。**

触发条件（同时满足）：
- 用户要求执行磁盘上已有的技术文档（如 `docs/plans/*.md`、设计文档等）
- 该计划的主要开发工作已完成（代码变更已落地）

调用方式：将项目根目录路径和本次计划涉及的模块/文件范围传给 `test-expert` agent，由其完成测试审查、清理冗余 case、补充全流程 case，并执行完整测试套件验证稳定性。

每次对话仅触发一次，若本会话已完成测试审查则跳过。

---

# Git Commit Message 规范

采用 Conventional Commits 风格的轻量化中文版：type/scope 英文，subject/body 中文。

**需要创建 commit 时**，先读 `~/.claude/guidelines/git-commit.md` 获取完整规范（字段约束、示例、反例、拆分原则）。无 commit 任务时无需加载。

---

# 会话链式执行

当用户说"完成后自动开启新会话执行任务X"（或类似表述）时：

1. 完成当前任务
2. 用 Bash 工具将任务X的描述写入 `~/.claude_chain_next`（覆盖写入）
3. 告知用户"已排队下一个任务，请输入 /exit 退出当前会话以自动启动"

**前提**：用户的 `~/.zshrc` 中需有以下包装函数，否则信号文件不会被处理：

```zsh
function claude() {
    command claude "$@"
    local next_file="${HOME}/.claude_chain_next"
    if [[ -f "$next_file" ]]; then
        local next_task
        next_task=$(cat "$next_file")
        rm -f "$next_file"
        exec command claude "$next_task"
    fi
}
```

---

# 开发计划执行后的提交

**从磁盘读取开发计划并完成执行后，必须按照 Git Commit Message 规范进行一次提交。**

触发条件（同时满足）：
- 用户要求执行磁盘上已有的技术文档（如 `docs/plans/*.md`、设计文档等）
- 该计划的主要开发工作已完成（代码变更已落地）
- 本会话尚未针对本次计划执行创建过提交

执行顺序：测试审查完成后，读取 `~/.claude/guidelines/git-commit.md` 规范，再执行提交。每次对话仅触发一次。
