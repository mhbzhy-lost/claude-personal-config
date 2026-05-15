# 知识检索流程规范

**本规范描述 agent 在处理用户任务时应遵循的知识检索流程**

---

## 1. 知识检索流程概述

agent 在处理用户任务时必须遵循以下知识检索流程：

1. **执行技能检索**：首先调用 `mcp__skill-catalog__resolve` 方法获取与任务相关的技能列表
2. **分析技能候选**：通过每个技能的名称和描述判断哪些技能与任务相关
3. **获取技能详情**：对筛选出的技能调用 `mcp__skill-catalog__get_skill` 获取完整内容

## 2. 详细步骤

### 步骤 1：技能检索（mcp__skill-catalog__resolve）

调用 `mcp__skill-catalog__resolve` 方法，参数如下：

```json
{
  "user_prompt": "<用户任务核心描述>",
  "cwd": "<当前工作目录>",
  "tech_stack": ["<意图识别出的技术栈标签>"],
  "language": ["<意图识别出的编程语言标签，可选>"],
  "capability": ["<意图识别出的能力标签>"]
}
```

**输入要求**：
- `user_prompt`：传入用户任务的核心描述（若内容很长，取能代表意图的一两句即可）
- `cwd`：传入当前工作目录，用于更好地识别项目上下文
- `tech_stack` / `language` / `capability`：**三者至少一个必须为非空字符串数组**。subagent 需要在调用前自行基于 user_prompt 与 workspace 背景做一次意图识别，分别判断涉及的技术栈、编程语言（混编要多选）、能力域，挑若干标签填入。`language` 对 skill 的 `language` 字段做硬过滤（language-agnostic skill 会被排除），只在有强语言约束时填。

> **硬约束（PreToolUse hook 强制）**：若 `tech_stack` / `language` / `capability` 三者同时留空或缺失，本次 `resolve` 调用会被 hook block（返回 `permissionDecision: deny`），必须重新发起。意图识别由 subagent 自己完成——合法 tag 闭集以当前 catalog 的 `available_tags()` 为准（在 SubagentStart 注入环节已下发三维度闭集）。当前暂无闭集注入时，调 `mcp__skill-catalog__available_tags`（无参数）获取三维度闭集，再从中选取标签。严禁通过 `mcp__skill-catalog__list_skills` 反查闭集（见本规范第 4 节）。

**返回格式**：
```json
{
  "skills": [
    {
      "name": "<技能名称>",
      "description": "<技能功能描述>"
    },
    ...
  ]
}
```

### 步骤 2：技能筛选

对返回的技能列表进行分析，重点关注以下信息：
- **技能名称**：判断是否与任务领域相关
- **技能描述**：查看是否包含任务所需的功能或技术点

**筛选原则**：
- 只选择与任务直接相关的技能
- 不要无差别地获取所有返回的技能内容
- 列表顺序仅作参考，重点看描述是否匹配

### 步骤 3：获取技能详情（mcp__skill-catalog__get_skill）

对筛选出的技能调用 `mcp__skill-catalog__get_skill` 方法，参数如下：

```json
{
  "name": "<选中的技能名称>"
}
```

该方法将返回技能的完整内容，包括：
- 技能的功能介绍
- 使用示例
- 最佳实践
- 相关限制和注意事项

## 3. 特殊情况处理

### 3.1 没有匹配的技能

`resolve` 返回中包含一个 `match_quality` 字段（取值 `"high"` / `"low"` / `"empty"`），用于指示候选集与任务的匹配质量。当 `match_quality` 为 `low` 或 `empty` 时，响应会附带一个 `hint` 字段说明原因；`high` 时不出现 `hint`。agent 应据此决定是否继续 `get_skill`：

- **`empty`**（结果列表为空，例如纯逻辑、纯文档或纯配置任务）：可以直接动手，**无需调用 `get_skill`**，但需要在首次输出中明确说明：

  ```
  本次任务不涉及框架或组件知识，无需检索技能库。
  ```

- **`low`**（有候选但 top-1 分数低于置信阈值）：仍需扫一眼候选的 name + description；如果判断都不真正相关，**允许在解释理由后跳过 `get_skill`**；如果有看起来相关的候选，按正常流程获取详情。

- **`high`**（top-1 分数达到置信阈值）：必须按步骤 2、3 继续筛选并 `get_skill`，不得跳过。

> 该字段只影响"是否继续 `get_skill`"，不影响"是否调 `resolve`"——第 4 节"必须执行检索"的规则继续生效。

### 3.2 技能信息不完整

如果通过 `get_skill` 获取的技能内容不够详细，无法满足任务需求，agent 可以：
1. 再次分析 resolve 返回的其他技能描述
2. 尝试使用其他相关技能名称进行检索
3. 结合任务上下文和现有知识进行判断

## 4. 规范要求

- **必须执行检索**：任何涉及框架、组件或特定技术领域的任务都必须先进行技能检索
- **禁止直接访问全量列表**：不得调用 `mcp__skill-catalog__list_skills` 方法获取全量技能清单
- **筛选优化**：必须根据技能描述筛选相关内容，避免无差别获取所有技能
- **明确说明**：如果没有匹配到相关技能，必须在输出中明确说明

---

> 注：本规范由 SubagentStart hook 注入时，末尾会同时附上 skill-catalog 当前的合法 tag 闭集（`tech_stack` / `language` / `capability` 三维度），subagent 从该闭集中挑至少一项非空值再调 resolve。若未见闭集（hook 拉取失败），调 `mcp__skill-catalog__available_tags` 获取。

**规范结束**。agent 应根据上述流程进行知识检索，确保任务符合项目规范。
