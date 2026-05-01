# Superpowers 流程增强

- Brainstorming 与 writing-plans 阶段都必须调用 `/knowledge-retrieval` 检索技能库辅助决策（前者侧重选型/架构方向，后者侧重落地模式与 task 拆分参考）。
- Writing-plans 必须对子任务做 DAG 拓扑分析，确定执行顺序和并发可行性。
- Subagent-driven-development 须按 writing-plans 产出的依赖图进行任务编排：以 task 为调度单位，独立 task 可并行派发；每个 task 内部仍走 subagent-driven-development 规定的完整流程，不因并发而变更。
- 每个 implementer subagent 在动手实施前必须先执行 `/knowledge-retrieval` 检索其 task 涉及的技术域；该约束写入子代理 prompt，由子代理自身执行，主 agent 不代办（主 agent 仅负责在 dispatch prompt 中显式声明此要求）。
- Subagents 统一在后台执行，不阻塞主对话。依赖未满足的 task 须等待前驱完成后再派发，不得因后台模式而提前并发。
- 并发 task 须使用独立 git worktree 隔离文件变更，避免冲突；并发结束后合并工作树，无法自动解决的冲突须提请用户决策。
- Superpowers 工作流完成后，须对照 writing-plans 产出的计划逐项核实，确保无遗漏或错位；若存在未提交变更，须完成一次提交，保持工作树干净。
