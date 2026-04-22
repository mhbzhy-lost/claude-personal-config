# coding-expert 使用规范

**主 agent 专注与用户讨论需求与方案、规划任务、选档派发与汇总上报；执行类子任务（不限于编码）默认委派给 `coding-expert` 三档 agent。凡是可以写成自包含 prompt + 验收标准的执行单元，都应派发。**

## 职责边界

- **主 agent**：理解需求、澄清歧义、对齐方案、拆分任务、选档派发、整合结果回传用户；**尽量不亲自执行**
- **coding-expert 三档**：实际落地执行——编码、重构、调研、文档编写、配置修改、代码分析、bug 诊断、测试扩展等一切具体产出

主 agent 亲自动手的场景仅限于：
- 与用户对话、讨论方案、澄清需求、解释概念
- 派发前的**少量必要上下文收集**（如读一两个关键文件、grep 一个符号以判断选档）
- **极小且一次性**的操作（如改一行 CLAUDE.md、追加一条 memory）

含判断或跨多步/多文件的任务，即便不写代码（如"梳理 xx 模块调用关系"、"整理 yy 文档结构"、"排查 zz 报错根因"），也应派发 coding-expert，而非主 agent 自己铺开执行。

## 适用场景

以下任一情形均应派发 coding-expert：
- **并发子任务**：发现可并行的子任务时，利用多个 coding-expert 并发执行
- **plan mode 计划落地**：plan mode 规划的计划进入执行阶段后，每个子任务交由 coding-expert 完成
- **todo list 子任务执行**：非 plan mode 场景下以 todo list 拆分的子任务，每个子任务同样委派给 coding-expert
- **单个较重的执行单元**：即便未拆分，只要任务含多步操作或跨文件判断，主 agent 也应派发而非自执行

## 三档选型（决定 subagent_type）

三份定义位于 `~/.claude/agents/coding-expert{,-light,-heavy}.md`，共享 `~/.claude/guidelines/coding-expert-rules.md` 规范（由 SubagentStart hook 强制注入，子 agent 无需手动加载）：

| subagent_type | model | effort | 适用批次 |
|---|---|---|---|
| `coding-expert-light` | Sonnet 4.6 | low | 纯补丁 / 范式迁移（"对标 batch D 写 yyy"）/ 文档 / docstring / 机械 helper / 枚举追加 / 单测扩展 / 小修 bugfix（已定位+已知修复） |
| `coding-expert` | Opus | low | 默认档。含判断但规格清晰：功能实现、单模块重构、接口变更、Bug fix（已定位根因）、性能优化、测试编写 |
| `coding-expert-heavy` | Opus | medium | 新架构设计（新节点/agent/contract 职责边界）、跨模块耦合判断（"删 X 影响哪些 Y"）、Bug 根因诊断（失败 log 推因）、实现路径权衡（A vs B）、首次构建新范式 |

派发前自问三连（Plan 批次已标注 `Model/Effort` 时直接映射，跳过启发式）：

```
1. 本批次是新架构设计 / 跨模块耦合 / bug 根因 / 无先例可抄？
   YES → coding-expert-heavy
2. 本批次规格明确、无需权衡（纯补丁 / 迁移 / 文档 / 机械 helper）？
   YES → coding-expert-light
3. 其他情况（含判断但不复杂）：
   → coding-expert（默认）
```

**选档规则**：
- 不确定时**保守选高档**
- light/heavy 在执行中自判档位不匹配会写"降级建议/升级建议"上报 → 主 agent 按上报调整后续派发

## 调用要求

- 传入的 prompt 必须自包含：含目标、前置上下文、涉及文件路径/符号、验收标准
- 多个独立子任务并行分发时，必须在同一消息内并发发起多个 Agent 调用
- **skill 知识检索由子 agent 自理**，无需主 agent 转传 harness 注入的 skill 名字

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
