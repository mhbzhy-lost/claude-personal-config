---
name: knowledge-retrieval
description: skill-catalog 知识检索工作流——通过 mcp__skill-catalog__resolve → get_skill 两阶段渐进式获取技能知识，含意图识别、标签选取、候选筛选、特殊情况处理及约束规则
tech_stack: [claude-code]
language: []
collected_at: 2026-04-25
capability: [cc-mcp, prompt-engineering]
---

# 知识检索工作流

处理涉及特定框架、组件或技术域的任务时，通过 **resolve → get_skill** 两阶段渐进式获取技能知识，避免一次性加载全量内容。

---

## 1. 流程概述

1. **获取合法标签** — 若不确定当前库有哪些合法 tag，先调 `mcp__skill-catalog__available_tags`（无参数），返回三维度闭集 `tech_stack` / `language` / `capability`
2. **意图识别** — 从用户 prompt + 工作目录推断标签，从闭集中选取。宁缺毋滥，不确定就留空交给 server 端 classifier 兜底
3. **调 resolve** — 传入标签（至少一个维度非空），获取候选 skill 名称与描述（**不含正文**）
4. **筛选** — 根据描述筛选 1-3 条直接相关的 skill
5. **get_skill** — 获取选中 skill 的完整内容
6. **执行** — 带着 skill 知识完成用户任务

---

## 2. 详细步骤

### 步骤 1：获取合法标签（mcp__skill-catalog__available_tags）

```json
{}
```

返回 `tech_stack` / `language` / `capability` 三维度排序去重列表。只在不确定库里有那些合法 tag 时调用；已从 hook 注入获得闭集则可跳过。

### 步骤 2：意图识别

基于用户 prompt + 对话上下文 + 工作目录，判断：

- **tech_stack**：任务涉及哪些技术栈/框架/平台（如 `claude-code`、`react`、`harmonyos`）
- **language**：任务涉及哪些编程语言（如 `python`、`typescript`、`kotlin`）。混编场景必须多选
- **capability**：任务涉及哪些能力域（如 `cc-hook`、`cc-mcp`、`ui-form`、`auth`）

判断原则：
- 宁缺毋滥：只选明显相关的 tag
- 三者至少一个非空
- 值必须来自 tag 闭集，不得自造
- `language` 对 skill 做硬过滤（排除 language-agnostic skill），仅在上下文有强语言信号时填

### 步骤 3：调用 resolve（mcp__skill-catalog__resolve）

```json
{
  "user_prompt": "<用户任务核心描述>",
  "cwd": "<当前工作目录>",
  "tech_stack": ["<来自闭集>"],
  "language": ["<来自闭集，可选>"],
  "capability": ["<来自闭集>"]
}
```

**硬约束（PreToolUse hook 强制）**：`tech_stack` / `language` / `capability` 三者至少一个非空，否则 resolve 调用会被 hook block。若三者均无合法匹配，不要调 resolve（传空数组会被拒绝），直接走 3.1 跳过路径。

返回 `skills` 数组，每项仅含 `name` + `description`，按相关度排序。

### 步骤 4：筛选

- 根据名称和描述判断是否与任务直接相关
- 只选 1-3 条，不要无差别获取所有候选
- 列表顺序仅作参考，重点看描述

### 步骤 5：获取详情（mcp__skill-catalog__get_skill）

```json
{ "name": "<选中的技能名称>" }
```

返回完整 markdown 正文。

---

## 3. 特殊情况

### 3.1 跳过检索

若任务为纯逻辑、纯文档、纯配置工作，与任何 tech_stack / capability 均无合法匹配：

```
本次任务不涉及框架或组件知识，无需检索技能库。
```

**禁止**以传空数组方式调 resolve 作为跳过手段。

### 3.2 技能信息不完整

若 `get_skill` 返回内容不足：
1. 重新审视候选列表其他 skill 的描述，挑下一条 get
2. 以不同 tag 组合再调一次 resolve
3. 结合任务上下文与现有知识判断

### 3.3 无匹配结果

resolve 返回空或所有候选明显不相关 → 直接动手，首次输出中说明无需检索。

---

## 4. 约束

- `tech_stack` / `language` / `capability` 至少一个非空（PreToolUse hook 强制）
- 禁止调 `mcp__skill-catalog__list_skills` 获取全量清单
- `language` 对 skill 做硬过滤，仅在强语言信号时填
- 跳过检索时必须在输出中明示

---

## 5. 强制检索

用户 prompt 中附带 `%skill` 关键字时，**必须立即执行上述全部流程**，不得跳过。

> 注：本规范由 SubagentStart hook 注入 coding-expert 子 agent 时，末尾会附上当前合法 tag 闭集，此时步骤 1 可跳过。
