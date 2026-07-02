# bug: plan-runner 结构化计划文档重复 harness 状态

## 现象

`write_plan` 生成的 `docs/plans/planrun-*.md` 主要是 `Goal / Approach / Tasks / DAG / Parallel Sets / Stop Conditions` 的结构化表单。真实执行中，harness 已经通过 task state 和 `todowrite` 维护同一组结构化信息，导致 plan 文档对人审、external review 和设计承诺的价值下降。

## 根因 (6 要素)

1. **触发条件**：plan-runner 调用 `write_plan` 时把 `tasks/dag/parallel_sets` 等 harness 账本字段作为主要输入。
2. **期望链路**：plan 文档应承载人工可审的正文：目标、架构、文件结构、TDD 步骤、验证命令、风险和停止条件；结构化执行账本应由 harness state / todo 维护。
3. **实际链路**：`write_plan` 同时格式化 markdown 并构造 `plan_contract`，markdown 只是 `plan_contract` 的表单 dump。
4. **关键假设失效**：曾假设 plan 文档可以同时服务人审和 harness contract；实际 external review 更需要设计正文，而 harness 只需要稳定的 `Tn:` todo 映射。
5. **旁证**：`plan-runner-harness.js` 的 `formatMarkdown()` 从 contract 生成 `Plan item Tn`，`buildPlanContract()` 又从同一批 task 参数写 state；`todowrite` 已经被 phase gate 用作执行阶段的真实账本入口。
6. **影响范围**：所有 plan-runner 任务都会生成低信息密度 plan 文档；reviewer 需要从机器表单反推设计，且 plan 文档与 harness state 出现双重事实来源。

## 修复方向

`write_plan` 改为以 `content` 正文为核心，只负责显式 tool call、写 plan 文件、保存 sha 和推进状态；`plan_contract.tasks` 从首次有效 `todowrite` 的精确 `Tn:` 前缀派生。旧 state 只做最低必要读取兼容，不继续把 `write_plan(tasks)` 暴露为新协议。

## 验证

- RED：新增单测证明旧 harness 在 `content` 调用下仍尝试读取 `tasks`，并会消费 legacy `dag/tasks` 构造 plan contract。
- GREEN：同一场景下 plan 文件正文来自 `content`，`plan_contract` 在 todo mirror 前为空，首次有效 `Tn:` todo 后才派生 task ledger。
