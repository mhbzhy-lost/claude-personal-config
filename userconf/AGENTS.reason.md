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

> **原因**：commit message 规范分散在 skill 文档中，agent 每次 commit 前先加载
> skill 才能得知正确格式，反复重试校验浪费 token。收敛进 AGENTS.md 核心约束，
> session 启动时一次注入到位；可机械校验的部分由插件与 git hook 兜底，主观部分
> 靠 agent 自行判断。"禁止 AI 署名"避免 git 历史被 AI 辅助标识污染，同时保留对
> AI 工具文件名的正常描述空间，避免误伤。

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

## 并发与 Subagent

> **原因**：并发阈值（<3 用 subagent，≥3 用 Dynamic Workflow）是经验性分界线——
> 3 个以下并发在 LLM 单 turn 内可管理，再多则 LLM 容易遗漏 DAG 依赖或重复派发，
> 脚本编排比 turn-by-turn 更可靠。
>
> "串行多步也用 subagent" 是为了保护主对话上下文。主对话的每一轮 tool call 和
> 文件内容都会累积进 context window，串行长任务的中间产物会把主对话挤到
> compaction，丢失用户意图和方案讨论。subagent 是上下文隔离的边界。
>
> Worktree 隔离对 coding 类 Dynamic Workflow 是强制的。脚本在启动 opencode server
> 前自动 `git worktree add` 到独立目录并 `process.chdir` 过去，保证多个 coding agent
> 不会互相覆盖。脚本不自动合并/删除 worktree（冲突需要 LLM 判断），而是在报告里
> 输出 merge 指引让主 agent 执行。


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

---

## 修复卡壳熔断

> **原因**：同一思路连续失败 3 次说明当前假设大概率有误，继续硬试是在错误方向
> 上加倍投入。强制 Web 调研引入外部信息打破 agent 的
> 确认偏误闭环。"换个角度"不重置计数，因为实际上仍在同一问题上，只是 agent
> 在 rationalize 继续尝试。
