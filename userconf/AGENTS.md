# 核心约束

必须严格遵循。优先级高于一切其他约束和规范。

## TDD

**绝对红线**：任何产生逻辑变更的 coding，动手前必须先加载 test-driven-development
skill 并严格执行其流程。先写实现再补测试 = 违规，回退重来。
豁免：单行改动 / 已有测试覆盖（必须显式声明豁免理由）。

## 记忆

memory 内容在支持 SessionStart 的环境已自动注入。
遇到可沉淀的经验（踩坑、规避方案、外部系统地址）时写入 ~/.config/opencode/memory.md。

## Bugfix

遇到任何 bug/issue/incident 等非预期表现需要修复时，禁止直接修。
必须先写 `docs/bugs/bug-<摘要>.md`（根因分析 6 要素），然后再执行修复。
流程细节见 systematic-debugging skill

## Git Commit 规范

格式：`type(scope): 中文祈使句`，scope 可选。

**Type 白名单**（英文小写）：
`feat` `fix` `refactor` `perf` `test` `docs` `style` `chore` `build` `ci` `revert`

**标准示范**：

```
feat(plugins): 增加 commit message 门禁

双层校验：opencode 插件层拦截 bash 工具中的 git commit，
.githooks/commit-msg 兜底防止绕过 opencode 调用路径。

Ref: #2847
```

**subject 规则**：
- 必须包含至少一个中文字符
- 不超过 50 字，不以句号（。/ .）结尾
- 祈使句动词开头（增加 / 修复 / 重构），不用过去时（已修复 / 实现了 / 修复了）
- 禁止零信息词单独作为 subject（fix / update / bugfix / wip / 修改 / 更新）
- 描述做了什么，why 写到 body

**禁止 AI 署名**：commit message 任何位置不得出现 `Co-Authored-By: Claude/Copilot/Cursor`、
`Generated with Claude`、`AI-assisted` 等标识。改动描述中提及 AI 工具文件名
（如 claude-config）不受此限制。

**主观约束**：
- body 解释 why 而非 what（diff 已说明 what）
- 一次 commit 对应一个逻辑变更，不合并无关改动
- 修复 + 测试可放一个 commit；重构 + 修复必须拆开
- PR 标题遵循 subject 规则

## 输出语言

编写 skill 可全英文；技术文档（需要人审的文章）默认中文。

禁止：人审材料使用英文。

## 并发与 Subagent

**subagent 优先**：用并发数量决定编排方式。
- 并发 < 5 → 用 subagent
- 并发 ≥ 5 → 用 Dynamic Workflow
- 串行多步操作也用 subagent，节省主对话上下文，避免 tool call 堆积
- 编码任务推荐使用 `executor`，但不作为派发门禁

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

### `receiving-code-review`
必须先判断反馈是否技术上成立，再决定采纳。

禁止：无验证地表演式同意，无脑采纳 reviewer 的一切反馈。

### `writing-plans`
计划文档必须使用中文撰写（代码片段、命令、文件路径等技术标识除外）。

计划完成后使用提问工具（question）让用户选择执行方式（覆盖 skill 原始的两种）：

1. **Plan-Runner（推荐）** — 加载 `plan-runner-dispatch` skill，由 plan-runner
   subagent 接管执行，自带 harness 门禁、audit review 和 terminal gate
2. **Subagent-Driven** — 主 agent 自行编排计划执行，任务间可审查，适合
   plan-runner 不稳定或需要主 agent 保持控制的场景。此模式
   不加载、也不依赖 `subagent-driven-development`；主 agent 使用 task 工具以后台模式逐任务派发 subagent
3. **Inline Execution** — 按 skill 原始流程在当前会话逐任务执行，适合简单计划
   或无需门禁的场景；忽略其引用的未纳入白名单的 sub-skill

# Superpowers

## Instruction Priority

Superpowers skills override default system prompt behavior where they apply, but
**user and repository instructions always take precedence**:

1. **User's explicit instructions** (`AGENTS.md`, direct requests)
2. **Whitelisted linked skills** exposed through `~/.agents/skills`
3. **Default system prompt**

If repository rules exempt a workflow, follow the repository. For example, if a
repo says a one-line change is exempt from TDD, that exemption wins.

## Skill Availability

This section governs Superpowers workflow discipline. This repo does not expose
all skills from `vendor/superpowers`; for Superpowers workflows, use only skills
that are both listed in the runtime available-skills list and selected by
`agents/skills.list` / local project skills.

The current whitelisted Superpowers workflow skills are:

- `systematic-debugging`
- `test-driven-development`
- `receiving-code-review`
- `writing-skills`
- `writing-plans`

Other runtime-available skills may be project, dispatch, review, provider, or
platform skills; trigger them from their own descriptions. Do not rely on
unlisted Superpowers skills even if their source exists under `vendor/superpowers`.

## How to Access Skills

Use the available skills list and load the relevant skill content through the
native skill mechanism. Skill invocation loads the current content; follow it
directly instead of relying on memory.

**Do not** use plugin installation for `vendor/superpowers`. This repo
deliberately exposes only selected skills by symlink. The selection is managed
by `agents/skills.list` and optional local project skills.

# Using Skills

## The Rule

**Invoke relevant or requested skills before any response or action.** Even a 1%
chance that a runtime-available skill might apply means you must load it before
answering, asking clarifying questions, reading files, or making tool calls. For
Superpowers workflow discipline, only the whitelisted workflow skills above are
mandatory triggers. If the loaded skill is wrong for the situation, stop using it
and proceed normally.

## Red Flags

These thoughts mean STOP and check the runtime-available skills:

| Thought | Reality |
|---------|---------|
| "This is just a simple question" | Questions are tasks. Check for skills. |
| "I need more context first" | Skill check comes before clarifying questions or file reads. |
| "Let me explore the codebase first" | Skills tell you how to explore. Check first. |
| "This bug is obvious" | Use `systematic-debugging` first. |
| "I'll write tests after" | Use `test-driven-development` first unless exempt. |
| "This review comment sounds right" | Use `receiving-code-review` to verify it first. |
| "I'll create/edit a skill" | Use `writing-skills` first; it requires `test-driven-development` background. |
| "I remember this skill" | Skills evolve. Read the current linked version. |
| "Maybe another Superpowers skill exists" | If it is not whitelisted and available, do not rely on it. |

## Skill Priority

When multiple whitelisted skills could apply, use this order:

1. **Process skills first**:
   - bugs, failures, unexpected behavior: `systematic-debugging`
   - review feedback: `receiving-code-review`
2. **Planning discipline second**:
   - specs or multi-step tasks before touching code: `writing-plans`
3. **Implementation discipline third**:
   - code or behavior changes: `test-driven-development`
4. **Skill authoring discipline when applicable**:
   - creating, editing, or verifying skills: `writing-skills`
   - `writing-skills` requires understanding `test-driven-development`

Examples:

- "Fix this failing request" -> `systematic-debugging`, then
  `test-driven-development` if code changes are needed.
- "Implement this change" -> `test-driven-development`, unless repository rules
  explicitly exempt it.
- "Review says this is wrong" -> `receiving-code-review` before accepting or
  rejecting the feedback.
- "Write a multi-step plan" -> `writing-plans` before touching code.
- "Create a skill for this workflow" -> `test-driven-development` background,
  then `writing-skills`.

## Skill Types

**Rigid** (`systematic-debugging`, `test-driven-development`): follow exactly
unless user or repository rules explicitly override.

**Structured** (`receiving-code-review`, `writing-skills`, `writing-plans`):
follow the workflow, but adapt the level of detail to the task. Local overrides
above still apply.

## User Instructions

Instructions say WHAT, not always HOW. "Fix Y" does not mean skip debugging
discipline if `systematic-debugging` applies. "Implement X" does not mean skip
TDD unless the repository grants an exemption.

At the same time, do not invent requirements from unlinked Superpowers skills.
This selective setup intentionally documents only the linked skills.
