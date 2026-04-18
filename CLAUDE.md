# 优先使用 MCP 工具

**执行任何任务前，必须先检索当前上下文中可用的 MCP 工具，优先利用它们完成工作。**

原则：
- **先查后做**：动手写代码或调用通用工具前，先检查 system-reminder 中列出的 MCP 工具（`mcp__*`），判断是否已有现成能力可以直接使用
- **工具优先于手写**：如果 MCP 工具能完成目标（如文件操作、API 调用等），必须优先使用，避免自己从零编写代码
- **未知则搜索**：如果不确定是否有匹配的工具，使用 ToolSearch 检索 deferred tools

---

# 知识检索规范（强制）

**规划任务、形成技术决策或排查故障前，必须先通过知识检索流程获取相关技术栈的准确信息，禁止凭记忆编写框架/组件代码。**

主 agent 遇到涉及特定技术栈的任务时，按序执行：

1. **判断技术栈**：调用
   `Agent({ subagent_type: "stack-detector", prompt: <user 原始 prompt> })`
   拿到 `{"tech_stack": [...]}`
2. **筛选相关 skill**：调用
   `Agent({ subagent_type: "skill-matcher", prompt: <包含 tech_stack + user 原始 prompt，可选 capability / top_n / language> })`
   拿到 `{"skills": ["skill-a", "skill-b", ...]}`。该 agent 会在隔离子上下文内自行调用 `list_skills` 并完成语义筛选，主上下文只接收最终 name 列表。复合场景（如"登录模块"同时涉及 UI + 校验 + 网络 + 认证）主 agent 可显式传入 `capability` 数组进一步收敛候选。
3. **按需加载详情**：对 skill-matcher 返回的每个 name，调用 `mcp__skill-catalog__get_skill({ name })` 获取完整内容
4. **基于检索到的知识开始实际任务**

禁止行为：
- 跳过知识检索直接凭记忆编写框架/组件 API
- **主 agent 直接调用 `mcp__skill-catalog__list_skills`**（该职责已由 skill-matcher 吸收；需要候选清单必须通过 skill-matcher）

---

# 技术文档编写须知

编写开发计划或技术方案时，规划执行路径必须**明确标注各子项的依赖拓扑**：
- 每个子任务标明其前置依赖（无依赖则标注"无"）
- 可并行的子任务显式标注为同一批次
- 发现可并行的编码子任务时，可利用 `coding-expert` agent 并发执行

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

**开发计划执行完成后，必须调用一次 `test-auditor` agent 进行测试质量审查。**

触发条件（同时满足）：
- 执行磁盘上已有的技术计划，或执行 plan mode 规划的计划
- 该计划的主要开发工作已完成（代码变更已落地）

调用方式：将项目根目录路径和本次计划涉及的模块/文件范围传给 `test-auditor` agent，由其完成测试审查、清理冗余 case、补充全流程 case，并执行完整测试套件验证稳定性。

**审查范围**：仅审查本次计划新增或改动的测试，不做全量扫描；用户明确要求"全量审查"时除外。

---

# Skill 蒸馏工作流

蒸馏新 skill 时，按以下五阶段**严格顺序**执行：

1. **规划**：调用 `source-planner` agent，输入 `tech_stack + scope + constraints`。该 agent 会查现有 skill 库去重、WebSearch 官方权威源、输出结构化 `sources[] + skip[] + notes`。**主 agent 不得跳过本阶段**——即使已知 URL 清单也要走 planner 做去重与权威性核对
2. **采集**：把 planner 的 JSON 输出直接传给 `skill-fetcher` agent，按清单下载到 `/tmp/skill-src/<tech_stack>/<skill_name>/`，每个目录附带 `_manifest.md`。skill-fetcher **不再接受**自由格式的"目标技术 + 重点方向"输入
3. **预处理**：对每个产出了素材的 skill 目录，调用 `skill-preprocessor` agent。**保守模式**——只去噪（删 HTML 残留 / 导航 / 重复段落）、按固定模板归档合并，**不改写原文表述**。输出到 `<skill_dir>/_processed/SOURCE.md + _meta.json`
4. **蒸馏**：调用 `skill-builder` agent，传入 `target_skill_name + material_dir`。builder **只读** `_processed/` 下的产物，禁止回退读原始素材。frontmatter 不产出 `capability`
5. **打标**：调用 `skill-marker` agent，为 SKILL.md 追加 `capability: [...]`。taxonomy 由 SubagentStart hook 自动注入。**必须一次性批量调用完成**——skill-marker 子上下文走 5 分钟 TTL 的 ephemeral cache，分散多次调用会让每次都重新建缓存（hook 注入的 4K taxonomy + agent 提示词都要重刷），命中率从 90%+ 跌到 70% 左右；集中一次批量调用既保证 marker 命中率，也省去主 agent 多轮编排成本

**批量蒸馏**：
- 同一 planner 调用可产出多个 skill 的 sources
- fetcher 支持单次处理多 skill（按 target_skill_name 分组落盘）
- preprocessor 按 skill 粒度独立跑，可并行
- builder 按 skill 粒度独立跑，可并行
- marker 最后**一次调用**覆盖全部新产 skill（target 传父目录 + glob），禁止拆成多次分批——这是 prompt caching 命中率的关键要求

**增量采集**：planner 的 `scope.mode=incremental` 配合 `skip_collected_within` 可自动跳过新鲜度未过期的 skill，避免重复蒸馏。

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
