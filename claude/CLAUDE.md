# 核心约束（宪法级）

## 记忆

memory 内容在支持 SessionStart 的环境已自动注入。
遇到可沉淀的经验（踩坑、规避方案、外部系统地址）时写入 ~/.claude/memory.md。

## Bug

bug 禁止直接修。必须先写 `docs/bugs/bug-<摘要>.md`（根因分析 6 要素），
用户确认后才执行修复。流程细节见 systematic-debugging skill。

## TDD

coding 必须 TDD（RED→GREEN→REFACTOR）。
豁免：单行改动 / 已有测试覆盖。豁免优先于 skill 判定。
分层测试策略与 e2e 准入见 test-driven-development skill。

## 输出语言

编写 skill 可全英文；技术文档（需要人审的文章）默认中文。

## 并发

可隔离的独立子任务必须优先使用 subagent 按 DAG 并发（worktree 隔离）。

- worktree 目录优先级：`.worktrees/` > `worktrees/` > 默认新建 `.worktrees/`
- submodule 内先切 superproject root 再建 worktree；sandbox 拒绝时整批降级串行
- 合并后必须跑验证；自动合并失败或语义冲突 → 停止并请求用户决策

## Subagent

任何 subagent 创建都必须采用后台模式：派发后不阻塞主对话，主对话继续推进
可并行的分析、实现、验证或协调工作。

主对话负责记录 subagent 任务边界、依赖关系和回收点；只有遇到语义冲突、
合并冲突或必须用户决策的问题时才暂停等待。

## 决策报告

每项 ≤5 行，模板：
- **[决策项]**：业务语言描述
- **推荐**：___，因为 ___
- **不选原因**：___
- **选错代价**：___ 时暴露，修复代价 低/中/高

禁止：技术术语未解释 / 对比表（移附录）/ >2 备选并列 / "各有优劣"。

## Skill 行为 override

### `writing-plans`
使用前必须先进行 Web 调研，补充最新资料与外部约束。
计划必须含子任务拆分、DAG、可并发集合、验证方式。

### `receiving-code-review`
必须先判断反馈是否技术上成立，再决定采纳；禁止无验证地表演式同意。

## 修复卡壳熔断

同一问题连续 3 次无进展 → 停止硬试，先进行 Web 调研，
重做根因分析后再继续。
