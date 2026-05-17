# 全局记忆

已知陷阱、过往 bug 记录于当前宿主的 memory 文件
（Claude Code: `~/.claude/memory.md`；Codex: `~/.codex/memory.md`）。**两个强制查阅时机**：

1. **动手前**——开工任何 coding / 调试 / 排查任务前，必须执行可观测动作：
   `cat <host-memory-file>` 通读全文 + 主动报告匹配到的相关条目（或显式说明
   "无匹配条目"）。其中 `<host-memory-file>` 指当前宿主对应的 memory 路径。
   仅在心里"想了想 memory"不算履行。
2. **遇到报错 / 测试失败 / 异常行为时**——在做新的根因分析或修复尝试之前：
   - 命中已记录的坑 → 直接按记录中的解法走
   - 未命中 → 启动 bug-analysis 流程，分析定型后回写到 memory.md

跳过此查阅视为流程违规，回退重做。

# Bugfix 流程约束

**bug 定义**：任何与预期不符的可观测现象——测试失败、人类提交的 bug、截图
全白 / 渲染异常 / 静默失败 / unexpected behavior 等——一律视为 bug，无论是否
有显式报错。看似"明显原因、改改就好"的现象同样适用，禁止凭直觉跳过流程。

bug 一经识别，禁止直接进入修复。必须先完成根因分析，输出 `bug-analysis.md`，
再由用户确认后执行修复。

## 根因分析必须回答（缺任一项不得修复）

**现象**：测试在哪里失败，错误信息是什么
**调用链**：从测试入口到失败点的完整业务逻辑链（非堆栈）
**根因假设**：列出 1-3 个候选假设
**验证方式**：日志 / 单测 / 断点
**根因确认**：一句话结论
**影响范围**：根因还可能在哪些其他路径上触发

## 修复方案要求

- 必须针对根因，不得只针对症状
- 说明为什么此修复不会在其他路径引入新问题
- 补充覆盖根因路径的单测（非复现原失败用例）

## 修复后验证

- 原失败用例必须通过
- 影响范围中列出的路径必须有对应测试覆盖并通过
- 全量测试重跑，不得有新增失败
- 新增失败视为引入回归，回退本次修复重新分析

## 修复后异源复审（external-llm-review）

bugfix 流程硬约束，优先级高于 §5 的"高风险任务才上"。

### 触发与范围

- **何时跑**：修复后验证全部 ✅ 之后；fix 未收敛前不跑
- **审查范围**：`BASE..HEAD` 严格对齐本次修复 commit
- **必须输入**：`bug-analysis.md`（根因结论 + 影响范围）+ 本次 diff

### 审查重点（dispatch prompt 必须明确要求 reviewer 回答）

1. 修复是否真正针对 `bug-analysis.md` 确认的根因？是否仍在打症状？
2. `影响范围` 中列出的其他路径，本次修复是否触达？有无遗漏？
3. 修复是否在其他路径引入新失败模式（边界、并发、错误处理）？
4. 新增单测是否覆盖根因路径？

### 结果处置

- Critical / Important → 回到根因分析阶段，更新 `bug-analysis.md` 或修复方案后重走流程
- Minor → 用户决策是否本次处理
- ✅ 通过 → 可提交
- 综合判断 4 步规则与协议切换详见 `external-llm-review` skill

### 豁免条款（须在提交说明中标注豁免原因）

- 修复 diff < 10 行且仅涉及单个无外部依赖的函数
- 纯文档 / 配置 / 拼写类 bug
- 项目合规策略不允许源码 diff 出域（须在 `bug-analysis.md` 显式记录）
- 未配 `.env` 或外部凭据时优先补齐凭据，不默认走豁免

## 修复卡壳熔断（3 次无进展即停）

同一问题连续 3 次修复尝试失败或无新进展，禁止继续沿当前思路硬试，必须先做调研：

1. 重跑 `knowledge-retrieval` skill 检索相关知识与当前宿主 memory 文件中已记录的陷阱
2. 用当前宿主提供的 Web 搜索 / 抓取工具查官方 issue tracker / changelog / 社区讨论，
   确认是否存在同类问题及上游解法
3. 综合检索结果重做根因分析，更新 `bug-analysis.md` 后再继续修复

**计数规则**：同一可观测症状（同一截图、同一报错信息、同一异常行为）下的
所有 fix 尝试合并计数；切换假设 / 改动不同文件 / 调整不同参数都不重置。
"我换了个新角度试试"不算新问题。

跳过熔断继续硬试视为流程违规，回退重做。

# Superpowers 流程增强

## 1. 反幻觉：每阶段强制知识检索 + Web 补充调研

- `brainstorming` 与 `writing-plans` 阶段必须调用 `knowledge-retrieval`
  （前者侧重选型与架构，后者侧重落地模式与 task 拆分）
- 每个 implementer subagent 动手前必须自己跑 `knowledge-retrieval`；
  约束写入 dispatch prompt，主 agent 不代办
- **Web 补充调研**：`knowledge-retrieval` 之后，命中以下任一情形必须再用
  当前宿主提供的 Web 搜索 / 抓取工具拉最新资料：
  - 涉及第三方框架 / SDK / API 的版本号、breaking changes、deprecation
  - < 1 年内发布或仍在活跃迭代的协议、库、规范
  - 安全相关（CVE、token 格式、auth flow、加密协议变更）
  - 本地 skill 与已读文档均未覆盖的外部 API
- Web 结果与本地 skill 冲突时，当前任务以官方最新文档为准；**不得自动
  回写 skill 库**——先列出"本地 vs 最新"差异请用户确认，同意后再回写

## 2. 可并发：DAG 拓扑而非串行

- `writing-plans` 必须对子任务做 DAG 依赖分析，明确执行顺序与并发集合
- `subagent-driven-development` 按 DAG 编排：独立 task 并行派发
- 并发 task 在独立 git worktree 中隔离：
  - 主 agent 留在协调层，**不调用 `using-git-worktrees` skill**，直接
    `git worktree add` 一次性建好所有 worktree；须履行以下安全契约：
    - **目录优先级**：`.worktrees/`（已存在则复用）> `worktrees/` > 默认新建 `.worktrees/`
    - **`.gitignore` 校验**：首次 add 前一次性确保 worktree 目录已被忽略，
      未忽略则 add+commit；后续并发 add 不重复校验
    - **Submodule guard**：若 cwd 在子模块内，先 `cd` 到 superproject root 再建
    - **Sandbox 降级**：`git worktree add` 因权限拒绝失败时整批回退到
      串行执行，并提示用户
  - 路径写入各 subagent prompt；subagent 在已就绪的 worktree 内执行任务
  - 并发结束后合并工作树；自动合并失败的冲突提请用户决策

## 3. subagents worker 执行策略

- 使用 `superpowers:subagent-driven-development` / `dispatching-parallel-agents`
  时，implementer / worker 默认走 `opencode-deepseek-worker` skill；是否适用、
  如何派发、如何验收，全部以该 skill 文档声明为准。
- 不在 `opencode-deepseek-worker` skill 职责范围内的任务，不得强行派给该
  worker，必须 fallback 回主对话当前使用的模型执行。
- reviewer / final reviewer 不走 DeepSeek worker；仍由当前宿主按 review skill
  与外源复审规则执行。

## 4. 不阻塞：subagent 后台执行

- 所有 subagent 统一后台运行，主对话保持响应
- 依赖未满足的 task 须等前驱完成后再派发

## 5. 完整性：终态校验 + 工作树干净

- 工作流完成后对照 `writing-plans` 产出逐项核实
- 存在未提交变更须完成一次提交

## 6. 异源复审：抓同族盲点

### 触发决策

| superpowers 评审 | 是否需外源 |
| - | - |
| spec-compliance reviewer | 否 |
| code-quality reviewer（每个 task） | 是 |
| final code-reviewer（所有 task 完成时） | 是 |

### 调用约束

- 同族 code-quality ✅ Approved 之后才跑外源
- 外源 `BASE..HEAD` 与同族评审区间严格对齐
- 调用方式、协议切换、综合判断 4 步规则见 `external-llm-review` skill
- 仅在高风险任务 / 结论不放心 / 项目策略强制要求时上

### 何时不必用

- 任务纯文档 / 配置（spec 评审、yaml 校验等）
- 模块作用域 < 50 行且无外部依赖
- 未配 `.env` 也未 export 凭据
- 项目合规策略不允许源码 diff 出域

## 7. 输出语言约束

- 编写 skill 时可以全英文，优先保证 skill 触发描述和正文对 agent 清晰可检索。
- 技术文档、设计文档、实施计划、review 结论、bug-analysis 等面向用户或项目沉淀的
  文档，默认使用中文；只有用户明确要求英文或目标生态强制英文时才改用英文。

## 8. 决策报告格式约束

### 必填（主报告）

每个决策项总长不超过 5 行，按以下模板：

**[决策项]**：我们需要决定 ___（业务语言，不用技术术语）
**推荐**：___ ，因为 ___（一句话，聚焦最关键理由）
**不选其他的原因**：___ （一句话，聚焦最致命的短板）
**如果选错**：___ 时会暴露，修复代价是 ___（低/中/高）

### 禁止在主报告出现

- 特性对比表（移入附录）
- 技术术语未解释直接使用
- 超过 2 个备选方案的并列描述
- "各有优劣"类结论（必须给出明确推荐）

### 附录（用户主动要求才展开）

完整调研细节、benchmark 数据、备选方案分析

## 9. TDD 开发准则

**执行流参照当前环境中的 TDD skill / workflow** 的 RED-GREEN-REFACTOR
完整规范；若存在 `superpowers:test-driven-development`，优先按其流程执行。
coding 任务原则上严格按该流程执行。

**本仓豁免条款**（满足任一可免走 TDD）：

- 单行修改（变量名、配置值、拼写）
- 目标代码已有覆盖该变更路径的测试
- 纯文档 / 配置类变更

冲突时本节豁免优先于 skill 判定（user instructions > skill）。其余情形违反
视为实现无效，回退重做。

### 分层测试策略

#### 三层定义

| 层级 | 验证对象 | 典型运行时长 | 隔离度 |
| - | - | - | - |
| **单测** | 单个函数/方法的输入输出与边界 | 毫秒级 | 完全隔离 |
| **集成测试** | 单个模块对外契约 | 秒级 | 部分真实（外部依赖 stub） |
| **e2e 测试** | 端到端用户流程 | 十秒～分钟级 | 完全真实 |

**冒烟测试** 单独定位为 CI 入口的健康检查，不与上述三层混用。

#### 最小测试覆盖契约

| 开发任务粒度 | 最小必补 | 按影响追加 |
| - | - | - |
| 细粒度（单函数/方法） | 单测 | 落在模块对外契约 → 加集成；落在关键用户路径 → 加 e2e |
| 模块级（多函数协作的对外行为变更） | 单测 + 集成 | 落在关键用户路径 → 加 e2e |
| 需求级（新功能 / 跨模块流程） | 单测 + 集成 + e2e | — |

**关键用户路径**：登录鉴权、付费/订单、核心数据写入、对外 API 契约等
线上故障直接影响业务/用户的路径。不确定时归类为关键路径。

#### e2e 准入门槛

- e2e 仅覆盖关键用户路径；非关键需求用"集成测试 + 手动验证清单"替代
- e2e 套件总运行时上限 **5 分钟**，超限必须砍 / 拆并行
- 同一路径已有 e2e 覆盖时，新需求优先扩展现有用例断言而非新建
- e2e 失败必须 < 24h 内修复或暂时跳过（带 ticket 编号）

#### e2e 的 RED 阶段调整

- 启动 e2e 前先跑环境健康检查（端口 / 浏览器 / seed 数据）
- 失败信息含 `connection refused` / `timeout` / `undefined is not a function`
  等环境特征时，先排查环境再回到 RED 判定
- e2e 的 mock 边界：有副作用的外部依赖（付费、邮件、短信）必须 stub；
  只读类外部 API 按真实成本与稳定性决定
