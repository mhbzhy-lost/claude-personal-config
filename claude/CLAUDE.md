# 核心约束（宪法级）

## 记忆

memory 内容在支持 SessionStart 的环境已自动注入。
遇错先查已注入的 memory 条目（无自动注入时 `cat ~/.claude/memory.md`）。
遇到可沉淀的经验（踩坑、规避方案、外部系统地址）时写入 ~/.claude/memory.md。

## Bug

bug 禁止直接修。必须先写 `docs/bugs/bug-<摘要>.md`（根因分析 6 要素），
用户确认后才执行修复。流程细节见 systematic-debugging skill。

## TDD

coding 必须 TDD（RED→GREEN→REFACTOR）。
豁免：单行改动 / 已有测试覆盖。豁免优先于 skill 判定。
分层测试策略与 e2e 准入见 test-driven-development skill。

## 输出语言

skill 可全英文；技术文档/计划/review/bug-analysis 默认中文。

## 异源复审

bugfix 后强制跑 external-llm-review skill；feature 仅高风险时触发。
豁免：diff<10行单函数 / 纯文档配置 / 未配凭据 / 合规禁止出域。

## 并发

可隔离的独立子任务按 DAG 并发（worktree 隔离）。
详见 subagent-driven-development / writing-plans skill。

- worktree 目录优先级：`.worktrees/` > `worktrees/` > 默认新建 `.worktrees/`
- submodule 内先切 superproject root 再建 worktree；sandbox 拒绝时整批降级串行
- 实现型 subagent 默认走 `opencode-deepseek-worker` skill；reviewer 不走 worker
- 合并后必须跑验证；自动合并失败或语义冲突 → 停止并请求用户决策

## 决策报告

每项 ≤5 行，模板：
- **[决策项]**：业务语言描述
- **推荐**：___，因为 ___
- **不选原因**：___
- **选错代价**：___ 时暴露，修复代价 低/中/高

禁止：技术术语未解释 / 对比表（移附录）/ >2 备选并列 / "各有优劣"。

## Skill 行为 override

### `writing-plans`
使用前必须先跑 `knowledge-retrieval`（侧重落地模式 + 已知陷阱）。
之后若涉及第三方 SDK 版本/CVE/< 1 年迭代的协议/本地未覆盖的外部 API，
必须再 Web 搜索补充最新资料。计划必须含子任务拆分、DAG、可并发集合、验证方式。

### `receiving-code-review`
必须先判断反馈是否技术上成立，再决定采纳；禁止无验证地表演式同意。

## 修复卡壳熔断

同一问题连续 3 次无进展 → 停止硬试，先跑 knowledge-retrieval + Web 调研，
重做根因分析后再继续。
