---
name: subagent-dispatch
description: Use when dispatching subagent tasks, choosing between Terra and Spark models for subagents, deciding which subagent type to use (executor, explore, general), or determining whether a task should be delegated to a subagent vs handled inline.
---

# Subagent Dispatch

主 agent 派发 subagent 时的决策框架：何时派发、用什么类型、选什么模型、
如何检查输出。

## 何时使用 Subagent

**subagent 优先**：用并发数量决定编排方式。

| 使用 subagent | 不使用 subagent |
|---|---|
| 串行多步操作（节省主对话上下文） | 单步简单操作 |
| 编码任务（推荐 `executor`） | 纯信息查询（用 Grep/Glob） |
| 自主长运行任务 | 需要用户交互确认的任务 |
| 可并行的独立工作单元 | 强依赖前一步输出的下一步 |

派发规则：
- 任何 subagent 必须后台模式（background: true）
- 编码任务推荐使用 `executor`，但不作为派发门禁

禁止：前台模式派发 subagent

## Subagent 类型

| 类型 | 模型 | 适用场景 |
|---|---|---|
| `executor` | Terra（reasoning: low） | 确定性代码执行，temperature 0，精确 tool call，最小 diff |
| `spark` | Spark（1000+ tok/s） | 单文件定向编辑、快速原型、人在循环的即时迭代 |
| `explore` | — | 快速代码库探索，文件搜索，关键词定位 |
| `general` | — | 通用多步任务，需要并行执行独立工作单元 |

选择原则：编码任务优先 `executor`；速度敏感或单文件编辑用 `spark`；纯搜索用 `explore`；其他用 `general`。

## 模型路由：Terra vs Spark

`executor` 使用 Terra，`spark` 使用 Spark。主 agent 按以下规则选择派发哪个。

### 模型差异

| | **Terra** (GPT-5.6) | **Spark** (GPT-5.3-Codex) |
|---|---|---|
| 上下文 | 1.05M | 128K |
| 最大输出 | 128K | 32K |
| 速度 | 常规 | 15x（1000+ tok/s） |
| 质量 | 超过 GPT-5.5 | 低于 GPT-5.3-Codex 基线 |
| 多模态 | 文本 + 图像 | 仅文本 |
| 安全评级 | High | 未达 High |

### 分发规则

按顺序检查，命中即停。均未命中 → **默认 Terra**。

**派给 Terra：**

| # | 条件 |
|---|---|
| T1 | 涉及 **3 个以上文件** 的协调修改 |
| T2 | 上下文 **预估超过 100K tokens** |
| T3 | 涉及 **安全敏感代码**（认证、加密、权限、密钥、网络协议） |
| T4 | **自主长运行**（无人干预，预期 > 5 分钟） |
| T5 | 输出 **直接进入生产** 且无后续人工审查 |
| T6 | 需要 **图像输入** |
| T7 | 需要 **深度推理**（复杂算法、架构决策、性能根因分析） |
| T8 | **plan-runner** 派发的 executor 子任务 |

**派给 Spark：**

| # | 条件 |
|---|---|
| S1 | 用户明确要求 **实时/快速/即时** 响应 |
| S2 | **单文件定向编辑**（改签名、调参数、加 import） |
| S3 | **探索性原型**（"先试试看"、"quick hack"、"draft"） |
| S4 | **人在循环的快速迭代**（用户连续对话，每轮审查调整） |

**为什么默认 Terra**：Spark 质量低于 GPT-5.3-Codex 基线，不确定复杂度时
优先保证输出质量。

### 速查表

| 任务 | 路由 | 条件 |
|---|---|---|
| 跨模块重构 | Terra | T1 |
| 单函数修改 | Spark | S2 |
| 安全审计 | Terra | T3 |
| "改一下这个变量名" | Spark | S2 |
| 大型代码库搜索分析 | Terra | T2 |
| "先写个 demo 看看" | Spark | S3 |
| 复杂逻辑测试生成 | Terra | T5 + T7 |
| 简单 CRUD 测试 | Spark | S2 + S4 |
| plan-runner executor | Terra | T8 |
| UI 截图 → 代码 | Terra | T6 |
| 连续对话逐行调整 | Spark | S4 |
| 无人值守批量生成 | Terra | T4 |
| CI 配置修改 | Terra | T5 |
| 改 README 几行 | Spark | S2 |

## 派发格式

派发时在 prompt 头部附加路由标记：

```
[route: executor | reason: T1 - 涉及 5 个文件的协调修改]
```

或

```
[route: spark | reason: S2 - 单文件定向编辑]
```

用途：事后审计路由决策、升级时传递上下文。

## 输出检查

无系统级门禁，主 agent 自行检查：

**Terra 输出**（质量预期高）：
- 跑编译/测试确认无回归
- 扫 diff 范围确认无意外改动
- 多文件任务检查跨文件引用

**Spark 输出**（质量预期较低）：
- 确认语法正确、文件内部一致
- 最终由用户确认（人在循环）

## 升级处理

- **spark 语法错误**：回传重试 1 次，仍失败换 executor
- **executor 编译/测试失败**：回传重试 2 次，仍失败主 agent 介入或换 Sol
- **spark 用户不满意**：继续迭代或用户要求换 executor
- **spark 中途发现任务复杂**（如需连带改多文件）：升级到 executor

## 禁止

- 前台模式派发 subagent
- 编码任务使用前台模式
- 不确定时默认 spark（应默认 executor）
