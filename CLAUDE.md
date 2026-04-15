# 输出格式：模型标签

每次 agent 向用户输出文本时（不包含 tool call），**输出的第一个词之前**必须加 `[model_name]` 标签（model_name 为当前实际使用的模型名，例如 `[claude-opus-4-6]`、`[claude-sonnet-4-6]`）。

- 适用于所有文本输出，包括但不限于：用户交互后的首次回答、进入/退出 plan mode 后的输出、以及同一轮内的多段文本输出
- 标签不单独成行，直接作为正文的前缀，后接正文内容

---

# 优先使用 MCP 工具

**执行任何任务前，必须先检索当前上下文中可用的 MCP 工具，优先利用它们完成工作。**

原则：
- **先查后做**：动手写代码或调用通用工具前，先检查 system-reminder 中列出的 MCP 工具（`mcp__*`），判断是否已有现成能力可以直接使用
- **工具优先于手写**：如果 MCP 工具能完成目标（如文件操作、API 调用等），必须优先使用，避免自己从零编写代码
- **未知则搜索**：如果不确定是否有匹配的工具，使用 ToolSearch 检索 deferred tools

---

# Skill 加载流程（强制）

Skill 不再通过 Claude Code 原生机制预加载，而是由 `skill-catalog` MCP server 按需服务。**凭记忆写框架/组件代码会引入幻觉，必须先查 skill。**

主 agent 遇到涉及特定技术栈的任务时，按序执行：

1. **判断技术栈**：调用
   `Agent({ subagent_type: "stack-detector", prompt: <user 原始 prompt> })`
   拿到 `{"tech_stack": [...]}`
2. **查询 skill 清单**：调用 `mcp__skill_catalog__list_skills({ tech_stack })` 拿到 skill 概览
3. **按需加载详情**：对相关 skill 调用 `mcp__skill_catalog__get_skill({ name })`
4. **开始实际任务**

例外（可跳过步骤 1-3）：
- 纯探索/搜索/问答类任务
- 同一会话已走过 stack-detector，后续同栈任务直接复用 `tech_stack`（必要时可再次 list_skills 看新清单）
- 用户在 prompt 中已明确指定技术栈（如 "用 Next.js 写"），可跳过步骤 1，直接用该 tag 查询

禁止行为：
- 跳过 skill 查询直接凭记忆编写框架/组件 API
- 绕过 skill-catalog 直接 Read `claude-config/skills/` 下的 SKILL.md（除非 MCP server 故障做应急）

---

# 并行编码子任务必须使用 dev-expert

**当主模型打算并行分发开发/编码类子任务（feature 实现、重构、bug 修复、跨模块改动等）给 subagent 时，必须指定 `subagent_type: dev-expert`，以保证并行 subagent 使用 Opus 模型、不发生降级。**

适用范围：
- 一次性派发多个 Agent 并行修改代码、编写实现、写测试等编码任务
- 单个编码子任务若希望强制 Opus 质量，也可指定 dev-expert

不适用范围（无需强制使用 dev-expert）：
- 非编码任务（探索/搜索、计划撰写、审查、问答、文档）
- 已有更专用的 agent（Explore、Plan、test-expert、plan-validator、pua:* 等）时，按原专用 agent 处理
- 主模型自己在主会话中串行执行的编码任务

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

**审查范围**：仅审查本次计划新增或改动的测试，不做全量扫描；用户明确要求"全量审查"时除外。

每次对话仅触发一次，若本会话已完成测试审查则跳过。

---

# Git Commit Message 规范

采用 Conventional Commits 风格的轻量化中文版：type/scope 英文，subject/body 中文。

**需要创建 commit 时**，先读 `~/.claude/guidelines/git-commit.md` 获取完整规范（字段约束、示例、反例、拆分原则）。无 commit 任务时无需加载。

---

# 开发计划执行后的提交

**从磁盘读取开发计划并完成执行后，必须按照 Git Commit Message 规范进行一次提交。**

触发条件（同时满足）：
- 用户要求执行磁盘上已有的技术文档（如 `docs/plans/*.md`、设计文档等）
- 该计划的主要开发工作已完成（代码变更已落地）
- 本会话尚未针对本次计划执行创建过提交

执行顺序：测试审查完成后，读取 `~/.claude/guidelines/git-commit.md` 规范，再执行提交。每次对话仅触发一次。
