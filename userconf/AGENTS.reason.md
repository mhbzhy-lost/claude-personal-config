# 核心约束（宪法级）

与 AGENTS.md 节标题一一对应。

Superpowers 选择性规则已合入 AGENTS.md，作为同级章节，统一注入路径。

---

## 记忆

> **原因**：踩过的坑不应该再踩第二遍；遇到报错时优先比对历史记录可以省去重新
> 摸索的成本。命中时直接走旧解法是最大 ROI 路径；未命中时回写形成正反馈循环。
>
> SessionStart hook 自动注入 memory 替代了原来的"动手前强制 cat"规则，降低了
> agent 忘记检查的概率。保留 fallback cat 路径是因为 OpenCode 等不支持
> SessionStart 的环境仍需手动读取。"遇到可沉淀经验时写入"是回写正反馈循环
> 的要求——memory 只读不写会逐渐陈旧。

---

## Bug

> **原因**：测试失败 / 报错的表象 ≠ 根因。直接动手修复经常只是打症状（如把
> 断言改宽、加 try-catch 吞异常），留下隐患甚至引入新 bug。强制产出结构化分析
> 文档迫使先把调用链、影响范围梳理清楚；用户确认环节避免 agent 在错误假设上推进。

根因分析 6 要素（现象、调用链、假设、验证、确认、影响范围）的逐项 reason
已移入 systematic-debugging skill 的上下文中，此处不再重复。

---

## Git Commit 规范

> **原因**：commit message 规范从 AGENTS.md 迁出到 `git-commit-convention` skill，
> 按需加载。机械校验部分由 `git-commit-gate` 插件兜底，主观约束由 skill 承载。
> "禁止 AI 署名"避免 git 历史被 AI 辅助标识污染，同时保留对 AI 工具文件名的正常
> 描述空间，避免误伤。

---

## TDD

> **原因**：agent 在实际执行中频繁跳过 TDD，仅靠"必须"声明约束力不足。
> 改为"绝对红线 + 动手前必须先加载 skill"形成强制触发器，确保 agent 在写
> 实现代码前已进入 TDD 流程。"先实现再补测试 = 违规，回退重来"提供明确后果。
> 豁免要求显式声明理由，堵住隐式扩大豁免范围的漏洞。
> 具体 RED-GREEN-REFACTOR 细节由 test-driven-development skill 承载，不在此重复。

分层测试策略（三层定义、最小覆盖契约、e2e 准入）的详细 reason 原存于旧版
CLAUDE.reason.md §9，现随内容移入 test-driven-development skill 的职责范围；
skill 本身不可修改，原 reason 保留在下方备查：

<details>
<summary>分层测试策略原 reason（备查）</summary>

- **三层定义**：skill 全程按 unit test 周期写，未覆盖集成/e2e 的差异。
- **最小覆盖契约**：任务粒度 → 测试层级不是单射映射；"不确定时归为关键路径"
  是 over-cover 偏好。
- **e2e 准入 5 分钟阈值**：超过时 dev 会跳过本地跑 e2e，反馈周期退化。
- **e2e RED 调整**：skill 的 Verify RED 假设"失败=特性缺失"，e2e 易被环境噪声
  污染，必须先做健康检查。

</details>

---

## 输出语言

> **原因**：skill 的第一读者是 agent，英文关键词利于跨宿主检索；技术文档和计划
> 的第一读者是项目维护者，中文降低审阅成本。

---

## 决策报告

> **原因**：用户审决策报告的目标是"2 分钟内能拍板"。5 行限制强制抽取关键信号；
> 推荐+不选+选错代价三段式给用户全部决策必要信息。业务语言避免技术术语让
> 非技术 stakeholder 也能参与决策。"各有优劣"等于 agent 把决策推回给用户，
> 违背决策报告本职。

---

## Skill 行为 override

### `receiving-code-review`

> **原因**：LLM 默认倾向"performative agreement"——收到反馈立刻同意并照做，
> 即使反馈本身有误。强制先验证再采纳避免 reviewer 的误报被 agent 放大成错误修改。

### `writing-plans`

> **原因**：writing-plans skill 原始提供两种执行方式（subagent-driven /
> inline execution），但两者都依赖未纳入白名单的 sub-skill（`subagent-driven-development`、
> `executing-plans` → `finishing-a-development-branch` + `using-git-worktrees`），
> 且不提供 harness 门禁。覆盖为 Plan-Runner / Subagent-Driven / Inline 三种：
> Plan-Runner 作为推荐项提供完整的质量门禁（deterministic check、audit review、
> external review、terminal gate）；Subagent-Driven 不依赖 `subagent-driven-development`，
> 由主 agent 直接派发后台 subagent，保留对任务间审查的控制；Inline 不引入额外
> skill，适合简单计划或无需门禁的场景。

---

## Subagent

> **原因**：编码任务优先派发 subagent 是为了保护主对话上下文。主对话的每一轮
> tool call 和文件内容都会累积进 context window，串行长任务的中间产物会把主对话
> 挤到 compaction，丢失用户意图和方案讨论。subagent 是上下文隔离的边界。
> 
> AGENTS.md 只保留 trigger（"优先派发"），详细规则（类型选择、模型路由、输出检查、
> 升级处理）收敛在 `subagent-dispatch` skill，按需加载，避免全局规则膨胀。

---

## Superpowers

> **原因**：本仓不通过 `vendor/superpowers` plugin 暴露整包 skills，而是用
> `agents/skills.list` 选择性软链到 `~/.agents/skills`。这样可以避免 OpenCode /
> Codex 看到未治理的全部 Superpowers skills，也避免 duplicate skill warning。
>
> "先加载再行动"沿用 Superpowers `using-superpowers` 的核心约束：skill 是流程入口，
> 不是事后参考资料。要求在回答、追问、读文件、tool call 前判断并加载，是为了防止
> agent 先按默认习惯推进，再用 skill 为既有决策背书。
>
> 当前 Superpowers workflow linked 集合以 `agents/skills.list` 为同步来源，但
> AGENTS.md 必须显式列出参与 Superpowers 流程编排的白名单 workflow skills，避免
> agent 继续引用 `verification-before-completion`、`brainstorming` 等未暴露的上游技能。
> 该约束只收窄 Superpowers workflow discipline，不禁止运行时可用的项目、调度、评审、
> provider 或平台类 skills 按各自 description 触发。`writing-skills` 仍需显式说明其依赖 `test-driven-development`
> 背景，否则 agent 容易把它当成普通文档模板，而不是按 RED-GREEN-REFACTOR
> 验证行为变化的流程。

---

## 修复卡壳熔断

> **原因**：同一思路连续失败 3 次说明当前假设大概率有误，继续硬试是在错误方向
> 上加倍投入。强制 Web 调研引入外部信息打破 agent 的
> 确认偏误闭环。"换个角度"不重置计数，因为实际上仍在同一问题上，只是 agent
> 在 rationalize 继续尝试。
