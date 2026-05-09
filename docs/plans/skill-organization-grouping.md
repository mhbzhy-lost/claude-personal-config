# Skills 分组与边界表达方案

## 文档信息
- **创建时间**: 2026-05-09
- **状态**: 暂不实施，等验证手段成熟后再评估
- **关联**: 与 `skill-retrieval-optimization.md` 不重叠（那篇讲检索引擎，本篇讲 skill 组织结构）

## 1. 问题陈述

当前 `skills/` 下所有 skill 通过 `mcp__skill-catalog` resolve 时是**拍平**返回的，
agent 看到的是一组候选 skill 列表，自己决定读取哪些 leaf。

随着技术栈 skill 增多（如 antd 这种内含数十个组件 skill 的库），
"拍平 + agent 自选"会暴露两个问题：

- **边界信息无处安放**：组件 A 和组件 B 功能临近时，
  "什么时候该选 A 不选 B"是关系性信息，写在任一方 skill 里都偏自己视角。
- **领域级评估能力没有归属**：选型哲学、版本策略、生态对比、反向选型
  （什么场景**不该用**这套技术栈）这些"元信息"，
  既不属于任何单个 leaf，也不该重复散布在每个 leaf 里。

## 2. 候选方案对比

### 方案 A：Index skill（罗列型）
每个技术栈目录放一个 `index.md`，集中描述所有 leaf 及其边界。

**问题**：
- 双 SoT。index 描述组件 A 那一段 + leaf A 自己的 description = 同一信息的两份副本，必然漂移。
- 维护负担。每加一个 leaf 都要改 index，agent 容易漏改。
- index 自身可能膨胀，反过来变成新的注意力负担。

### 方案 B：纯扁平 + 自描述
每个 leaf skill 自己写 description / when_to_use，靠 resolve 检索器选择。

**问题**：
- 边界信息无处安放（关系性 ≠ 自描述）。
- 领域元层信息散落或丢失。

### 方案 C（推荐）：领域元层 skill + leaf 关系字段

把"罗列"和"边界"两件事拆开：

1. **领域元层 skill**（如 `antd/_meta.md` 或 `antd/_design.md`）：
   - **不重复 leaf 内容**，只讲 leaf 没法讲的：设计哲学、版本策略、
     性能特征、与同类库（MUI/Arco/semi）的对比、**反向选型说明**
     （什么场景不适合用 antd）
   - 这一层恰好是"领域 skill 自带选型评估"的归宿
     （详见前期讨论：「领域知识」本应包含「在这个领域怎么选库」）

2. **leaf skill 加 `related` frontmatter 字段**：
   ```yaml
   ---
   name: antd-select
   description: ...
   related: [autocomplete, cascader, tree-select]
   ---
   ```
   description 里加一句"区别于 autocomplete 的临界点"。
   边界信息**就近写在最有动机维护它的人手里**。

3. **检索流程二阶段化**：
   - resolve → 拿候选
   - agent 扫候选的 `related` 字段
   - 必要时对 related 项再 resolve 做对比

### 核心原则
> 不要建立"列表型"的中间层（必然脱节台账）；
> 要建立"关系型"的边界字段（每个节点局部信息，整体由检索拼出来）。

## 3. 暂缓实施的理由

即便落地了上述方案，目前**缺乏量化验证其价值的手段**：

- 没有"agent 选错 leaf 频率"的基线数据
- 没有"边界信息缺失导致的二次检索"统计
- 没法对比有 / 无 `related` 字段时 agent 决策质量的差异
- 不清楚 leaf skill 增长到多少（单技术栈 > 30 个？）才会真正出现注意力问题

在没有度量之前贸然改造，等同于"凭直觉重构"，
和 superpowers 工作流里强调的"verification before completion"相悖。

## 4. 推迟期间的等待条件

满足以下任一条件再回头评估：

- [ ] 出现可量化的失败案例（agent 在某个领域反复 resolve 错误 leaf）
- [ ] 单技术栈 skill 数量超过经验阈值（暂定 ≥ 20 个 leaf）
- [ ] `mcp__skill-catalog` 增加了"召回率/精准率"类指标
- [ ] 有具体业务任务驱动（如做一个真实项目时发现选型时 skill 检索质量瓶颈）

## 5. 触发评估时的最小动作

- 选 1 个最大技术栈做对照实验：保留扁平 vs 加 `_meta` + `related`
- 在固定 prompt 下记录 agent 二次检索次数、最终选错率
- 数据支持时再推广到其他技术栈

---

**版本控制**:
- v1.0 (2026-05-09) - 记录方案与暂缓决策，等待验证条件
