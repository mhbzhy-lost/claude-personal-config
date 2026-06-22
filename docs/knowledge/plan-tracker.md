---
title: Plan tracker git push gate
kind: convention
status: planned
applies_to:
  - shared/hooks/plan-tracker.py
  - shared/hooks/test_plan_tracker.py
  - userconf/plugins/plan-tracker.js
  - userconf/plugins/test/plan-tracker.test.mjs
last_verified: 2026-06-16
source: plan-completeness-enforcement
---

# Plan completion 通过 plan-tracker.py + push gate 强制校验

写计划时必须包含 `TODO:` 标记，push 时 `plan-tracker.py` 扫仓库内所有 `.md`，
发现 `TODO:` 即拦截并列出待办项。不依赖 frontmatter 或 status 字段。

## 适用场景

- 修改 plan-tracker.py（核心逻辑）
- 修改 plan-tracker.js OpenCode plugin
- 调整 plan 文件格式要求（TODO/DONE 标记）
- 排查 "git push 被拦截" 问题时

## 项目事实 / 约定

**一层防线：push gate**

`shared/hooks/plan-tracker.py` 扫描仓库内所有 `.md` 文件，发现 `TODO:` 标记
即列出文件名和 TODO 内容，返回 exit code 1。OpenCode plugin `plan-tracker.js`
在 `git push` 前调用此脚本，exit code != 0 则 throw error 拦截 push。

**Plan 文件格式：**

```markdown
# 计划正文

- TODO: 未完成任务 1
- DONE: 已完成任务 2
- TODO: 未完成任务 3
```

**注意：**
- TODO/DONE 标记必须使用大写
- 支持可选的 `-` 前缀（如 `- TODO:` 或 `TODO:`）
- 不需要 frontmatter / status 字段

**拦截行为（exit code 1 时输出）：**

```
Plan has pending TODO items:
  docs/plans/my-plan.md: TODO: 未完成任务 1
  docs/plans/my-plan.md: TODO: 未完成任务 3
```

## 原因

- **AGENTS.md 约定不可靠**：纯靠文档约束写 plan 格式容易遗漏
- **push 前最终校验**：拦截未完成的 TODO plan，确保不会出现"计划写了但没做完就推了"的情况
- **不依赖 frontmatter**：降低写 plan 的认知负担——只要用 TODO/DONE 标记，门禁就能工作；不需要维护 status 字段

## 修改时注意

- `plan-tracker.py` 解析 TODO/DONE 行时使用正则表达式
- OpenCode plugin 在 `git push` 前触发，如果 script 执行失败（如 Python 环境缺失），
  plugin 应 fail-open 并记录 warning 日志，不能 block 所有 push
- **路径解析**：OpenCode plugin 使用 `findRepoRoot(__dirname)` 函数从
  `userconf/plugins/` 向上查找 `.git` 目录来定位仓库根目录，不使用硬编码路径或
  `__dirname` 相对路径（错误示例：`"/Users/<user>/claude-config"` 会在其他环境
  完全失效）
- **`git -C <path>` 支持**：命令中的 `-C <path>` 会被识别为 scan 目标（优先级：
  `workdir > git -C path > cwd`）。push 检测 regex 也兼容 `git ... push` 形式
  （中间可插 `-C`、`--no-verify` 等参数），但必须排除 `git push-url` 等
  `push-*` 子命令（`push\b` word boundary 会误匹配 `push-`，需用 `push(?=\s|$)`）

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

# 测试 OpenCode plugin（33 tests，含 && mixing + shell wrapper 规则）
node --test userconf/plugins/test/plan-tracker.test.mjs

# 测试 rm 临时目录白名单 + symlink 安全（9 tests）
node --test userconf/plugins/test/rm-outside-workspace-guard.test.mjs

# 端到端 harness：在 /tmp/plan-test-work 执行（验证 plugin + python 联动）
# 使用独立 .mjs 脚本调用 PlanTrackerGate，避免 opencode 内部 git-commit 插件触发
```

## 相关资料

- 实现文件：`shared/hooks/plan-tracker.py`、`userconf/plugins/plan-tracker.js`
- 测试文件：`shared/hooks/test_plan_tracker.py`、`userconf/plugins/test/plan-tracker.test.mjs`
- 相关讨论：计划完整性校验机制设计
