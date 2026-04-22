# Coding Expert 共享规范（三档 subagent 通用）

**本文件由 subagent 在开工前第一个 Read 工具调用加载。** 无论档位，规范是代码质量底线，低档位不降低规范。

---

## 通用规范

### 【开工前】框架知识检索 — 硬约束

**开工后第一个工具调用必须是 `mcp__skill-catalog__resolve({ user_prompt, cwd })`。无豁免、无分档、无 agent 侧判断权。**

`user_prompt` 传入主 agent 派发的核心任务描述（若派发 prompt 很长，取能代表意图的一两句即可），`cwd` 传入工作目录。调用成本约百毫秒，不会拖慢交付。

resolve 返回后按下列三档处理：

**档 a. 主 agent 派发 prompt 里已指定 skill name**

先确认这些 name 出现在 resolve 候选里（防止主 agent 下发了已下线/重命名的 skill）。然后对每个 name 调 `mcp__skill-catalog__get_skill({ name })` 读完整内容，再动手。若主 agent 给的 name 不在候选集里，走档 b 重新挑选。

**档 b. resolve 候选非空且有相关 skill**

`skills` 数组每条是 `{name, description}` 二元组，按内部启发式 rank 排序——**读 description 做 pick-vs-skip 判断**，对真正对口的 1-3 条调 `get_skill(name)` 读详情。

- 列表顺序仅作粗排提示，**description 才是 pick-vs-skip 的 ground truth**
- 不要无差别对全部返回的 skill 都 `get_skill`，那会浪费 context
- `resolve` 默认返回至多 ~35 条候选，已经过 workspace 指纹 + LLM 分类过滤，无需额外过滤参数

**档 c. resolve 返回 `tech_stack=[]` 或所有候选 description 明显不相关**

即本次任务确实不涉及 skill 库覆盖的框架（纯逻辑、纯文档、纯配置等）。此时**首次 assistant 输出的首行必须写** `skill-retrieval: no-match`，然后正常动手。这是把"跳过 get_skill"的决定落到 transcript 里，便于事后审计。

**禁区**

- 不得跳过 `resolve` 步骤——任何省略行为都视为违规，哪怕你觉得任务"显然不涉及框架"。判断权归 server，不归你
- 不得调用 `mcp__skill-catalog__list_skills`（全量清单数百条，会污染子上下文；应走 `resolve` 让 MCP server 筛选）
- 不得自行跑 LLM 分类器（MCP server 里的 classifier 已经完成这步）
- 不得对 `resolve` 返回的所有候选都 `get_skill`（要先过 description 筛）


### 【工作完成】减少汇报内容 — 建议

子 agent 退出时，不要向主 agent 汇报内容，除非有异常需要主 agent 决策。

---

**规范结束**。回到你的档位专有指令继续执行。
