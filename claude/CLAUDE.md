# 核心约束

必须严格遵循。优先级高于一切其他约束和规范。

## TDD

**绝对红线**：任何产生逻辑变更的 coding，动手前必须先加载 test-driven-development
skill 并严格执行其流程。先写实现再补测试 = 违规，回退重来。
豁免：单行改动 / 已有测试覆盖（必须显式声明豁免理由）。

## 记忆

memory 内容在支持 SessionStart 的环境已自动注入。
遇到可沉淀的经验（踩坑、规避方案、外部系统地址）时写入 ~/.claude/memory.md。

## Bugfix

遇到任何 bug/issue/incident 等非预期表现需要修复时，禁止直接修。
必须先写 `docs/bugs/bug-<摘要>.md`（根因分析 6 要素），然后再执行修复。
流程细节见 systematic-debugging skill

## 输出语言

编写 skill 可全英文；技术文档（需要人审的文章）默认中文。

禁止：人审材料使用英文。

## 并发

可隔离的独立子任务必须优先使用 subagent 按 DAG 并发。
多 agent 编排场景（≥3 个 agent 或有 DAG 依赖）推荐使用 workflow 脚本
（`vendor/opencode-dynamic-workflow/`），确定性更高、可复用、支持实时干预。
若为 coding 任务，则必须通过 git worktree 隔离，若为探索等只读任务可不必。
worktree 合并后必须跑验证；自动合并失败或语义冲突 → 停止并请求用户决策。

禁止：在有明确 DAG 依赖分析的情况下串行执行无依赖任务。

## Subagent

任何 subagent 创建都必须采用后台模式：派发后不阻塞主 agent。
长耗时或耗时不确定的 bash 命令调用必须交给后台 subagent 执行。
多 agent 编排推荐使用 workflow 脚本（详见 §并发）。

禁止：同步调用 subagent，使得用户在 subagent 结束前无法与主 agent 对话。

## 决策报告

每项 ≤5 行，模板：
- **[决策项]**：业务语言描述
- **推荐**：___，因为 ___
- **不选原因**：___
- **选错代价**：___ 时暴露，修复代价 低/中/高

禁止：技术术语未解释 / 使用"各有优劣"等模糊说法 / 细节披露过于详细。

## playwright 浏览器操作

尽可能使用 headless 模式进行操作。
除非需要用户手动登录验证，或用户明确要求使用 headed/前台模式。

禁止：在有登录态/无需用户干预的情况下自行决定使用 headed/前台模式。

## Skill 行为 override

### `writing-plans`
使用前必须先进行 Web 调研，补充最新资料与外部约束。
计划必须含子任务拆分、DAG、可并发集合、验证方式。

禁止：编写计划前不做 Web 调研，计划中缺失 DAG 依赖分析。

### `receiving-code-review`
必须先判断反馈是否技术上成立，再决定采纳。

禁止：无验证地表演式同意，无脑采纳 reviewer 的一切反馈。
