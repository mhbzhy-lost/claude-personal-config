# 项目记忆

本仓的已知陷阱、过往 bug 记录于 [memory.md](memory.md)，动手前先查阅。

# Superpowers 流程增强

## 1. 反幻觉：每阶段强制知识检索

- `brainstorming` 与 `writing-plans` 阶段必须调用 `/knowledge-retrieval`
  （前者侧重选型与架构，后者侧重落地模式与 task 拆分参考）。
- 每个 implementer subagent 动手前必须自己跑 `/knowledge-retrieval`
  检索其 task 涉及的技术域；该约束写入 dispatch prompt，由子代理执行，
  主 agent 不代办。

## 2. 可并发：DAG 拓扑而非串行

- `writing-plans` 必须对子任务做 DAG 依赖分析，明确执行顺序与并发可行集合。
- `subagent-driven-development` 按 DAG 编排：独立 task 并行派发，每个
  task 内部仍走 skill 规定的完整流程。
- 并发 task 在独立 git worktree 中隔离：
  - 主 agent 留在协调层，**不调用 `using-git-worktrees` skill**（其设计
    是把当前 agent 移入 worktree，与协调语义冲突），改为直接
    `git worktree add` 一次性建好所有 worktree。绕过 skill 时主 agent
    须自行履行其安全契约：
    - **目录优先级**：`.worktrees/`（已存在则复用）> `worktrees/` >
      默认新建 `.worktrees/`
    - **`.gitignore` 校验**：首次 add 前一次性确保 worktree 目录已被忽略，
      未忽略则 add+commit；后续并发 add 不重复校验，避免竞态
    - **Submodule guard**：若 cwd 在子模块内，先 `cd` 到 superproject
      root 再建
    - **Sandbox 降级**：`git worktree add` 因权限拒绝失败时整批回退到
      串行执行（在原工作目录顺序跑 task），并提示用户
  - 路径写入各 subagent prompt；subagent 在已就绪的 worktree 内执行任务，
    `using-git-worktrees` skill 自动识别"已在 worktree"并跳过创建段，
    setup 与 baseline 由 skill 标准步骤完成。
  - 并发结束后合并工作树；自动合并失败的冲突提请用户决策。

## 3. 不阻塞：subagent 后台执行

- 所有 subagent 统一后台运行，主对话保持响应。
- 依赖未满足的 task 须等前驱完成后再派发；不因后台模式而提前并发破坏依赖序。

## 4. 完整性：终态校验 + 工作树干净

- 工作流完成后对照 `writing-plans` 产出逐项核实，确保无遗漏或错位。
- 存在未提交变更须完成一次提交。

## 5. 异源复审：抓同族盲点

同族模型对自身生成代码倾向 normalize 通过，需异源抓盲点。

### 触发决策

| superpowers 评审 | 是否需外源 | 理由 |
| - | - | - |
| spec-compliance reviewer | 否 | 评的是 plan 一致性，不需异源验证 |
| code-quality reviewer（每个 task） | **是** | 同族模型对自身生成代码倾向 normalize 通过；需异源抓盲点 |
| final code-reviewer（所有 task 完成时） | **是** | 整体合并面、跨 task 一致性问题更需异源 |

### 调用约束

- 同族 code-quality ✅ Approved 之后才跑外源（fix 没收敛前外源没意义）
- 外源 `BASE..HEAD` 与同族评审区间严格对齐
- 调用方式、协议切换、综合判断 4 步规则见 `external-llm-review` skill
- 不要每个 task 都用：高风险任务 / 结论不放心 / 项目策略强制要求才上（token 成本不可忽略）

### 何时不必用

- 任务纯文档/配置（spec 评审、yaml 校验等）
- 模块作用域 < 50 行且没有外部依赖（同族模型已足够）
- 没配 `.env` 也没 export 凭据（API endpoint 缺失）
- 项目合规策略不允许把源码 diff 送到外部 endpoint

# Block 驱动开发（独立模式）

`block-driven-development` skill 是一条**独立的开发模式**，
与上面的 Superpowers 流程**完全并列、互不嵌套**。通过 Skill 工具按名调用，
不依赖具体文件位置。
用途：在用户一次性交付完整需求后，或通过多轮交互确定需求后，
**一旦进入执行阶段，人类不再干涉，直到完整交付**——
端到端跑完从 0 到 1（或新业务接入）的整个开发，检索 block、拷贝、定制、
单测、e2e、一键部署脚本，全部由 agent 闭环完成。

**模式切换**（互斥）：
- ✅ 进入 block-driven-development：用户给出含可识别业务模式
  （IM / 列表 / 详情 / 评论 / 通知 / 订单 / 商品…）的完整需求，
  并默许 agent 独立推进。此时**不再触发 Superpowers 的 brainstorming /
  writing-plans / subagent-driven-development 流程**，需求拆解、计划、
  执行、验证全部按 skill 内 8 阶段进行。
- ❌ 不进入：bugfix、重构、调参、纯文档、需求残缺或需反复对齐——
  回到 Superpowers 流程（brainstorming → writing-plans → subagent-driven-development）。
- ❓ 边界模糊：若任务介于两者之间，或无法判断该走哪条流程，**主动向用户确认**
  再决策——`AskUserQuestion` 列出"走 block-driven 独立模式 / 走 Superpowers 流程"
  两个选项，附简短判据，由用户拍板，不擅自代选。

进入后由 skill 自治；主 agent 仅在 Phase 7 e2e 全绿 + Phase 8 一键脚本
就绪后向用户汇报终态。中途**不主动追问需求**——若必须澄清，记入
`<workspace>/open-questions.md` 并选最合理默认推进，最后汇报时一并列出。
