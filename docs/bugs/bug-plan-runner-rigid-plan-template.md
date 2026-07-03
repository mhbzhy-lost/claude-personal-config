# bug: plan-runner 计划文档仍像固定模板

## 现象

`plan-runner` 已改为通过 `write_plan({ content })` 写人审计划文档，但生成的 `docs/plans/planrun-*.md` 仍高度结构化，通常按固定 `Goal / Architecture / File Structure / TDD task steps / Commands / Risks` 六段输出，阅读体验接近表单而不是执行计划。

## 根因 (6 要素)

1. **触发条件**：plan-runner 启动后按 `userconf/agents/plan-runner.md` 的 Plan document requirements 调用 `write_plan`。
2. **期望链路**：计划文档应参照 `writing-plans` 的优势，给低上下文执行者足够信息：目标、方案、文件、任务切片、测试、验证和风险；但不强制固定模板，也不承担执行账本职责。
3. **实际链路**：agent prompt 明确要求 `content` markdown must include at least `Goal`, `Architecture`, `File Structure`, `TDD task steps`, `Commands with expected output`, and `Risks / Stop Conditions` sections。
4. **关键假设失效**：以为固定六段是“精简版 writing-plans”；实际它会诱导 agent 继续填模板，弱化具体实施信息和自然语言设计承诺。
5. **旁证**：最新 plan 文档仍呈固定段落结构；`init-opencode-agents.test.mjs` 也断言这些固定章节必须存在。
6. **影响范围**：所有 plan-runner 生成的计划文档都会偏表单化，不利于人审和 external review 快速理解真实执行方案。

## 修复方向

把 Plan document requirements 改为 writing-plans 风格的自然语言执行计划：保留 exact files、small slices、RED/GREEN、exact commands、risk/stop condition、no placeholders 等要求；去掉固定六段模板、checkbox tracking、execution options 和 Superpowers 执行模式交接。

## 验证

- RED：测试要求 prompt 明确“compact implementation plan in prose / no rigid template / exact file paths / exact commands / no checkbox tracking / no execution options”，当前 prompt 缺失并失败。
- GREEN：更新 prompt 后，agent 配置测试通过；已重跑 `bash init_opencode.sh` 同步全局 agent 软链，OpenCode 重启后生效。
