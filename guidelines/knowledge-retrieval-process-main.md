# 知识检索流程规范（主 agent 版）

**本规范描述主 agent 在处理用户任务时应遵循的知识检索流程。意图识别由主 agent 自己承担（Opus 级判断能力），在调用 `mcp__skill-catalog__resolve` 时必须在 `tool_input` 中带上 `tech_stack` / `language` / `capability` 三个维度中的至少一个非空参数——这些字段的合法取值范围由 hook 在本 reminder 末尾以"合法 tag 闭集"的形式注入。**

---

## 1. 知识检索流程概述

主 agent 遵循以下五步流程：

1. **意图识别**：基于当前对话上下文推断用户任务涉及的技术栈、编程语言与能力域，产出 `tech_stack`（string[]）、`language`（string[]）、`capability`（string[]）候选
2. **调用 resolve**：调 `mcp__skill-catalog__resolve`，在 `tool_input` 中**必须**带 `tech_stack` / `language` / `capability` 三者中的至少一个非空
3. **读取候选**：resolve 返回候选 skill 列表（按相关度排序）
4. **筛选详情**：对相关的 1-3 条 skill 调 `mcp__skill-catalog__get_skill` 读完整内容
5. **正式执行**：完成用户原任务

## 2. 详细步骤

### 步骤 1：意图识别

阅读用户 prompt + 对话上下文 + 工作目录线索，判断：

- **tech_stack**：任务涉及哪些技术栈/框架/平台（如 `claude-code`、`react`、`harmonyos`）
- **language**：任务涉及哪些编程语言（如 `cpp`、`kotlin`、`python`、`typescript`、`swift`）——混编场景（Android kt/c++、iOS swift/objc）必须多选
- **capability**：任务涉及哪些能力域（如 `cc-hook`、`cc-mcp`、`ui-form`、`auth`）

判断原则：
- 宁缺毋滥：只选明显相关的 tag，避免污染过滤
- 三者至少一个非空
- 值**必须**来自本 reminder 末尾注入的"合法 tag 闭集"，不得自造
- `language` 会对 skill 的 `language` 字段做硬过滤（language-agnostic 的 skill 会被排除），因此 **只在用户明确约束或上下文强信号指向具体语言时填**；不确定就留空，交给 tech_stack / capability 召回

### 步骤 2：调用 resolve（必须带 tag）

```json
{
  "user_prompt": "<用户任务核心描述>",
  "cwd": "<当前工作目录>",
  "tech_stack": ["<来自闭集>"],
  "language": ["<来自闭集，可选>"],
  "capability": ["<来自闭集>"]
}
```

**硬约束**：
- `tech_stack` / `language` / `capability` **三者至少一个非空**
- 所有 tag 值必须出自本 reminder 末尾"合法 tag 闭集"
- 若意图识别阶段判定**三个维度都无合法匹配**，**不要**调用 resolve（不要三个都传空数组），改走特殊情况 3.1

### 步骤 3：读取候选

resolve 返回 `skills` 数组，每项含 `name` / `description`，按相关度排序。

### 步骤 4：筛选与 get_skill

对 resolve 返回的列表：

- **技能名称**：判断是否与任务领域相关
- **技能描述**：查看是否包含任务所需的功能或技术点

筛选原则：
- 只选与任务直接相关的 skill，通常 1-3 条
- 不要无差别获取所有候选的详情
- 列表顺序仅作参考，重点看描述

对筛选出的 skill 调：

```json
{ "name": "<选中的技能名称>" }
```

### 步骤 5：执行任务

带着 skill 内容回到用户原任务。

## 3. 特殊情况处理

### 3.1 判定无相关技术域（跳过 resolve）

若意图识别阶段判定任务与任何 `tech_stack` / `capability` 都无合法匹配（纯逻辑 / 纯文档 / 纯配置工作），**跳过 resolve 调用**，并在首次输出中明确说明：

```
本次任务不涉及框架或组件知识，无需检索技能库。
```

**禁止**以"传空列表"方式调用 resolve 作为跳过手段（PreToolUse 会拒绝）。

### 3.2 技能信息不完整

若 `get_skill` 返回内容不足：
1. 重新审视候选列表其他 skill 的描述，挑下一条 get
2. 结合任务上下文与现有知识判断
3. 必要时以不同 tag 组合再调一次 resolve

### 3.3 hook 降级（合法 tag 闭集缺失）

若本 reminder 末尾未附"合法 tag 闭集"（hook tags CLI 失败降级），主 agent 退回原版手动流程：按名义语义自行调 `resolve`（可不带 tag），由 server 端 classifier 兜底分类。降级分支会在 reminder 内附 ⚠️ 提示。

## 4. 规范要求

- **必须带 tag**：正常路径下调 resolve 必须带 `tech_stack` / `language` / `capability`（至少一个非空）
- **tag 来自闭集**：值不得自造
- **禁止 list_skills**：不得调用 `mcp__skill-catalog__list_skills` 获取全量清单
- **筛选优化**：根据描述筛选相关 skill，避免无差别 get_skill
- **无匹配明示**：若跳过 resolve，必须在输出中明示"本次任务不涉及框架或组件知识"

---

**规范结束**。合法 tag 闭集见本 reminder 下方由 hook 注入的小节。
