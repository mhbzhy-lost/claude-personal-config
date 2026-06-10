# 核心约束（宪法级）

与 CLAUDE.md 节标题一一对应。

`Superpowers.md` 用于承载选择性软链 Superpowers workflow 的使用规则；
由各端初始化入口按自身机制显式注入，避免把这部分策略混入宪法级规则正文。

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

## 并发

> **原因**：串行浪费独立任务的并行潜力；DAG 显式声明依赖才能安全并发。
> subagent 让独立任务在隔离上下文中推进，避免主对话串行吞吐受限；
> worktree 隔离避免并发 subagent 的文件写入冲突。

详细的 worktree 安全契约（目录优先级、gitignore 校验、submodule guard、
sandbox 降级）已移入 writing-plans skill 的职责范围。原 reason 保留在下方备查：

<details>
<summary>并发策略原 reason（备查）</summary>

- **目录优先级 `.worktrees/`**：约定俗成的隐藏目录；已存在时复用避免目录爆炸。
- **`.gitignore` 校验**：worktree 目录未忽略会污染 working tree。
- **submodule guard**：子模块内 worktree add 会建到子模块独立 .git 里。
- **sandbox 降级**：权限受限时不应硬卡，降级到串行至少能跑完。
- **worker 策略**：实现型 subagent 默认交给 Codex 插件，是为了复用 Claude Code
  内的 `/codex:rescue`、后台 job、status/result/resume 等闭环；OpenCode DeepSeek
  worker 保留为显式 fallback，避免默认路径在多套 worker 间摇摆。

</details>

---

## Subagent

> **原因**：subagent 的价值在于把独立上下文并行推进；如果创建后同步等待，
> 主对话会退化成串行调度器，既浪费并发窗口，也更容易在长任务中丢失全局协调。
> 后台模式让主对话继续做 DAG 调度、风险收敛和验证准备，只在真实冲突或需要
> 用户决策时停下来。
>
> 长耗时 bash 命令同样会占住主对话的执行通道，尤其是构建、全量测试、日志跟踪、
> 扫描和远程诊断这类耗时不稳定的任务。强制转交后台 subagent 是为了保留主对话
> 的交互窗口，让主对话可以继续拆分任务、响应用户打断，并在回收点做独立校验。

---

## 决策报告

> **原因**：用户审决策报告的目标是"2 分钟内能拍板"。5 行限制强制抽取关键信号；
> 推荐+不选+选错代价三段式给用户全部决策必要信息。业务语言避免技术术语让
> 非技术 stakeholder 也能参与决策。"各有优劣"等于 agent 把决策推回给用户，
> 违背决策报告本职。

---

## Skill 行为 override

### `writing-plans`

> **原因**：LLM 知识截止 + 训练数据中的代码常含过期 API，凭直觉写计划最容易翻车。
> 强制 Web 调研可以覆盖训练截止后的窗口期，并把第三方 SDK、CVE、新协议、
> 平台规则等外部约束纳入计划。计划含 DAG + 验证方式是为了支撑并发编排和
> 终态校验。

### `receiving-code-review`

> **原因**：LLM 默认倾向"performative agreement"——收到反馈立刻同意并照做，
> 即使反馈本身有误。强制先验证再采纳避免 reviewer 的误报被 agent 放大成错误修改。

---

## 修复卡壳熔断

> **原因**：同一思路连续失败 3 次说明当前假设大概率有误，继续硬试是在错误方向
> 上加倍投入。强制 Web 调研引入外部信息打破 agent 的
> 确认偏误闭环。"换个角度"不重置计数，因为实际上仍在同一问题上，只是 agent
> 在 rationalize 继续尝试。
