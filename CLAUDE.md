# 知识检索规范（开发前必做 · 强制）

**任何开发任务、任何开发计划编写，开工第一步必须是知识检索。**未完成检索前严禁凭记忆写框架/组件/库 API、严禁起草技术方案。此步骤不可跳过、不可延后、不可省略。

主 agent 遇到涉及特定技术栈的任务时，按序执行：

1. **判断技术栈**：调用
   `Agent({ subagent_type: "stack-detector", prompt: <user 原始 prompt> })`
   拿到 `{"tech_stack": [...]}`
2. **筛选相关 skill**：调用
   `Agent({ subagent_type: "skill-matcher", prompt: <包含 tech_stack + user 原始 prompt，可选 capability / top_n / language> })`
   拿到 `{"skills": ["skill-a", "skill-b", ...]}`。复合场景（如"登录模块"同时涉及 UI + 校验 + 网络 + 认证）可显式传入 `capability` 数组进一步收敛候选。
3. **按需加载详情**：对每个 name，调用 `mcp__skill-catalog__get_skill({ name })` 获取完整内容
4. **基于检索到的知识开始实际任务**

禁止行为：
- 跳过知识检索直接凭记忆编写框架/组件 API
- **主 agent 直接调用 `mcp__skill-catalog__list_skills`**（需要候选清单必须通过 skill-matcher）

---

# coding-expert 使用规范

**编码类子任务的执行默认交由 `coding-expert` agent 完成，主 agent 负责规划与编排。**

适用场景（以下任一情形均应调用 `coding-expert`）：
- **并发编码任务**：发现可并行的编码子任务时，利用多个 `coding-expert` 并发执行
- **plan mode 计划落地**：plan mode 规划的计划进入执行阶段后，每个子任务交由 `coding-expert` 完成
- **todo list 子任务执行**：非 plan mode 场景下以 todo list 拆分的子任务，每个子任务执行时同样委派给 `coding-expert`

调用要求：
- 传入的 prompt 必须自包含：含目标、前置上下文、涉及文件路径/符号、验收标准
- 多个独立子任务并行分发时，必须在同一消息内并发发起多个 Agent 调用

---

# 技术文档编写须知

编写开发计划或技术方案时，规划执行路径必须**明确标注各子项的依赖拓扑**：
- 每个子任务标明其前置依赖（无依赖则标注"无"）
- 可并行的子任务显式标注为同一批次

---

# 开发计划执行前的预检

**从磁盘读取开发计划并准备执行前，必须调用一次 `plan-validator` agent 进行预检。**

触发条件：用户要求执行磁盘上已有的技术文档（如 `docs/plans/*.md`、设计文档等）。

调用方式：将计划文件路径传给 `plan-validator` agent，检查知识过期、前提失效、逻辑矛盾三类问题。

处理裁定：
- `✅ GO`：直接进入执行阶段
- `⚠️ HOLD`：暂停执行，向用户汇报阻塞性问题列表，由用户决策**修复计划**还是**忽略并继续执行**，获得明确指令后再动手

每次对话针对同一计划仅触发一次。

---

# 开发计划执行后的测试审查

**开发计划执行完成后，必须调用一次 `test-auditor` agent 进行测试质量审查。**

触发条件（同时满足）：
- 执行磁盘上已有的技术计划，或执行 plan mode 规划的计划
- 该计划的主要开发工作已完成（代码变更已落地）

调用方式：将项目根目录路径和本次计划涉及的模块/文件范围传给 `test-auditor` agent，完成测试审查、清理冗余 case、补充全流程 case，并执行完整测试套件验证稳定性。

**审查范围**：仅审查本次计划新增或改动的测试，不做全量扫描；用户明确要求"全量审查"时除外。

---

# 开发计划执行后的提交

**从磁盘读取开发计划并完成执行后，必须按照 Git Commit Message 规范进行一次提交。**

触发条件（同时满足）：
- 用户要求执行磁盘上已有的技术文档（如 `docs/plans/*.md`、设计文档等）
- 该计划的主要开发工作已完成（代码变更已落地）
- 本会话尚未针对本次计划执行创建过提交

执行顺序：测试审查完成后，读取 `~/.claude/guidelines/git-commit.md` 规范，再执行提交。每次对话仅触发一次。

---

# Skill 蒸馏工作流

蒸馏新 skill 时，先读 `~/.claude/guidelines/skill-distillation.md` 获取完整五阶段流程（规划 / 采集 / 预处理 / 蒸馏 / 打标）及批量、增量采集规则。无蒸馏任务时无需加载。

---

# Git Commit Message 规范

采用 Conventional Commits 风格的轻量化中文版：type/scope 英文，subject/body 中文。

**需要创建 commit 时**，先读 `~/.claude/guidelines/git-commit.md` 获取完整规范（字段约束、示例、反例、拆分原则）。无 commit 任务时无需加载。
