---
title: Plan tracker git push gate
kind: convention
status: planned
applies_to:
  - shared/hooks/plan-tracker.py
  - shared/hooks/test_plan_tracker.py
  - opencode/plugins/plan-tracker.js
  - opencode/plugins/test/plan-tracker.test.mjs
last_verified: 2026-06-16
source: plan-completeness-enforcement
---

# Plan completion 通过 plan-tracker.py + push gate 强制校验

写计划时必须包含 `TODO:` 标记，commit 时 `git-commit-hook.sh` 自动更新进度，
push 时 `plan-tracker.py` 检查是否存在未完成的 TODO，有则拦截并列出差额。

## 适用场景

- 修改 plan-tracker.py（核心逻辑）
- 修改 plan-tracker.js OpenCode plugin
- 修改 git-commit-hook.sh 的 plan 更新逻辑
- 调整 plan 文件格式要求（frontmatter、TODO/DONE 标记）
- 排查 "git push 被拦截" 问题时

## 项目事实 / 约定

**三层防线：**

1. **写 plan 时**：必须包含 frontmatter（`---` 包裹的 YAML 块，含 `status: active`）
   和 `TODO:` / `DONE:` 标记（格式约束，通过 AGENTS.md 约定）

2. **commit hook**：`shared/hooks/git-commit-hook.sh` 检查本次提交是否修改了
   `.md` 文件（在 `docs/` 或 `plans/` 目录下），如果是，自动扫描 `TODO:` 行
   并根据 commit message 中的关键词（如"完成"、"implement"）将 `TODO:` 转为 `DONE:`
   并更新 frontmatter 的 `completed_tasks` 计数

3. **push gate**：`shared/hooks/plan-tracker.py` 扫描所有 active plan，检查是否
   存在 `TODO:` 标记。如果有，列出文件名、行号、TODO 内容、frontmatter 完成度
   统计，并返回 exit code 1。OpenCode plugin `plan-tracker.js` 在 `git push` 前
   调用此脚本，exit code != 0 则 throw error 拦截 push。

**Plan 文件格式：**

```markdown
---
title: 计划标题
status: active
created: 2026-06-16
completed_tasks: 3
total_tasks: 5
---

# 计划正文

- TODO: 未完成任务 1
- DONE: 已完成任务 2
- TODO: 未完成任务 3
```

**注意：**
- `status` 字段支持带引号或不带引号的 YAML 格式（如 `status: "active"` 或 `status: active`）
- TODO/DONE 标记必须使用大写
- 支持可选的 `-` 前缀（如 `- TODO:` 或 `TODO:`）

**拦截行为（exit code 1 时输出）：**

```
Active plan has pending TODO items:
  docs/plans/my-plan.md: TODO: 未完成任务 1
  docs/plans/my-plan.md: TODO: 未完成任务 3
```

## 原因

- **AGENTS.md 约定不可靠**：纯靠文档约束写 plan 格式容易遗漏，agent 可能忘记
  frontmatter 或用错标记格式
- **commit 时自动更新**：减少手动维护进度的负担，commit message 暗示完成时
  自动转换 TODO → DONE
- **push 前最终校验**：即使 commit hook 漏了，push gate 仍能拦截未完成的 plan，
  确保不会出现"计划写了但没做完就推了"的情况

## 修改时注意

- `plan-tracker.py` 解析 frontmatter 和 TODO/DONE 行时使用正则表达式，修改 pattern
  时同步更新 `shared/hooks/git-commit-hook.sh` 中的对应 pattern
- OpenCode plugin 在 `git push` 前触发，如果 script 执行失败（如 Python 环境缺失），
  plugin 应 fail-open 并记录 warning 日志，不能 block 所有 push
- **路径解析**：OpenCode plugin 使用 `findRepoRoot(__dirname)` 函数从
  `opencode/plugins/` 向上查找 `.git` 目录来定位仓库根目录，不使用硬编码路径或
  `__dirname` 相对路径（错误示例：`"/Users/<user>/claude-config"` 会在其他环境
  完全失效）
- Plan 状态为 `completed` / `paused` / `archived` 时，`plan-tracker.py` 应跳过不拦截

## Symlink 安全

`rm-outside-workspace-guard.js` 的临时目录白名单使用 `realpathSync()` 解析
符号链接，防止攻击者在 `/tmp` 中创建指向敏感目录的 symlink 绕过检查。

白名单同时包含原始路径和 realpath 解析后的路径（如 `/tmp` 和 `/private/tmp`），
以处理 macOS 的 symlink 重定向。

## `&&` 命令组合限制

`plan-tracker.js` 除了 push gate，还禁止 `&&` 组合中混合 git 与非 git 命令。

**规则：**
- `&&` 组合内：若同时包含 git 和 non-git segment，throw error
- `;` 和 `|`（管道）不受此规则限制
- Env var 前缀（`VAR=val git ...`）仍被视为 git 命令
- 单个 git 命令（如 `git push`）直接用，不涉及此规则

**正确做法：**
- 切换目录：用 bash tool 的 `workdir` 参数，不要 `cd`
- 测试后再 push：分两次 bash 调用
- 多 git 命令链（如 `git add && git commit-a && git push`）：允许，全是 git

**错误示例：**
- `cd /some/repo && git push` ❌（跨仓库用 workdir）
- `npm test && git push` ❌（分两次调用）
- `GIT_DIR=/x git status && npm test` ❌（env 前缀 + git 仍计为 git，与非 git 组合违规）

**实现：**
- `splitCommands(command)`：按 `&&` 分割，尊重单双引号
- `isGitCommand(segment)`：忽略 `VAR=val` 前缀后判断第一个 token 是否为 `git`

## 验证方式

```bash
# 测试 plan-tracker.py 核心逻辑
cd shared/hooks && python3 test_plan_tracker.py

# 测试 OpenCode plugin（22 tests，含 && mixing 规则）
cd opencode/plugins && node --test test/plan-tracker.test.mjs

# 测试 rm 临时目录白名单 + symlink 安全（9 tests）
cd opencode/plugins && node --test test/rm-outside-workspace-guard.test.mjs

# 端到端 harness：在 /tmp/plan-test-work 执行（验证 plugin + python 联动）
# 使用独立 .mjs 脚本调用 PlanTrackerGate，避免 opencode 内部 git-commit 插件触发
```

## 相关资料

- 实现文件：`shared/hooks/plan-tracker.py`、`opencode/plugins/plan-tracker.js`
- 测试文件：`shared/hooks/test_plan_tracker.py`、`opencode/plugins/test/plan-tracker.test.mjs`
- Commit hook：`shared/hooks/git-commit-hook.sh`（自动更新 TODO → DONE）
- 相关讨论：计划完整性校验机制设计
