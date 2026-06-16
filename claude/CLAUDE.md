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

## 并发与 Subagent

**subagent 优先**：用并发数量决定编排方式。
- 并发 < 3 → 用 subagent
- 并发 ≥ 3 → 用 Dynamic Workflow
- 串行多步操作也用 subagent，节省主对话上下文，避免 tool call 堆积

派发规则：
- 任何 subagent 必须后台模式（background: true）
- 使用 Dynamic Workflow 前必须加载 `workflow-usage` skill
- coding 类 Dynamic Workflow 必须启用 `worktree.enable: true`，脚本自动创建 git worktree；workflow 结束后由主 agent 执行合并与清理

禁止：前台模式派发 subagent

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
