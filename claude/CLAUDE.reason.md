# 核心约束（宪法级）

与 CLAUDE.md 节标题一一对应。

---

## 记忆

> **原因**：踩过的坑不应该再踩第二遍；遇到报错时优先比对历史记录可以省去重新
> 摸索的成本。命中时直接走旧解法是最大 ROI 路径；未命中时回写形成正反馈循环。
> 设成"违规回退"而非"建议"是因为软建议会被 rationalize 跳过。

---

## Bug

> **原因**：测试失败 / 报错的表象 ≠ 根因。直接动手修复经常只是打症状（如把
> 断言改宽、加 try-catch 吞异常），留下隐患甚至引入新 bug。强制产出结构化分析
> 文档迫使先把调用链、影响范围梳理清楚；用户确认环节避免 agent 在错误假设上推进。

根因分析 6 要素（现象、调用链、假设、验证、确认、影响范围）的逐项 reason
已移入 systematic-debugging skill 的上下文中，此处不再重复。

---

## TDD

> **原因**：复用 superpowers skill 完整规范避免重写 RED-GREEN-REFACTOR 细节。
> 3 条豁免按"成本 < 测试编写"的实际边界放宽——单行改动、已有覆盖、纯文档配置
> 不产生未验证的逻辑变更。user instructions > skill 是优先级原则。

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

## 异源复审

> **原因**：bug 修复放过盲点的代价远高于 feature 开发——同族模型对自身修复
> 倾向 normalize 通过，必须异源抓盲点。Feature 按风险决定是因为外源 API 费用
> 有真金白银成本，低风险任务边际价值低。

豁免条款 reason：< 10 行单函数无外部依赖时外源边际价值低于 token 成本；
纯文档配置无逻辑可审；合规禁止是硬法律红线；凭据缺失不算豁免理由应补齐。

---

## 并发

> **原因**：串行浪费独立任务的并行潜力；DAG 显式声明依赖才能安全并发。
> worktree 隔离避免并发 subagent 的文件写入冲突。

详细的 worktree 安全契约（目录优先级、gitignore 校验、submodule guard、
sandbox 降级）已移入 subagent-driven-development / writing-plans skill 的
职责范围。原 reason 保留在下方备查：

<details>
<summary>并发策略原 reason（备查）</summary>

- **目录优先级 `.worktrees/`**：约定俗成的隐藏目录；已存在时复用避免目录爆炸。
- **`.gitignore` 校验**：worktree 目录未忽略会污染 working tree。
- **submodule guard**：子模块内 worktree add 会建到子模块独立 .git 里。
- **sandbox 降级**：权限受限时不应硬卡，降级到串行至少能跑完。
- **worker 策略**：CLAUDE.md 只保留调度入口和 fallback 原则，避免复述 worker
  skill 的职责细节。

</details>

---

## Skill 行为 override

### `writing-plans`

> **原因**：LLM 知识截止 + 训练数据中的代码常含过期 API，凭直觉写计划最容易翻车。
> 强制先检索 = 用本地高质量 skill 库压制幻觉。Web 补充覆盖训练截止后的窗口期：
> 版本/CVE/新协议这几类变化最快，必须实时查。计划含 DAG + 验证方式是为了
> 支撑并发编排和终态校验。

### `receiving-code-review`

> **原因**：LLM 默认倾向"performative agreement"——收到反馈立刻同意并照做，
> 即使反馈本身有误。强制先验证再采纳避免 reviewer 的误报被 agent 放大成错误修改。

---

## 决策报告

> **原因**：用户审决策报告的目标是"2 分钟内能拍板"。5 行限制强制抽取关键信号；
> 推荐+不选+选错代价三段式给用户全部决策必要信息。业务语言避免技术术语让
> 非技术 stakeholder 也能参与决策。"各有优劣"等于 agent 把决策推回给用户，
> 违背决策报告本职。

---

## 修复卡壳熔断

> **原因**：同一思路连续失败 3 次说明当前假设大概率有误，继续硬试是在错误方向
> 上加倍投入。强制调研（knowledge-retrieval + Web）引入外部信息打破 agent 的
> 确认偏误闭环。"换个角度"不重置计数，因为实际上仍在同一问题上，只是 agent
> 在 rationalize 继续尝试。
