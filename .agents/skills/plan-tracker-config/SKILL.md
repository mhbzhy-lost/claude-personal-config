---
name: plan-tracker-config
description: "Use when creating plans, troubleshooting git push rejections, or configuring plan file format and TODO/DONE task tracking"
---

# Plan Tracker 配置与 git push gate

## 前提条件

- plan 文件位于 `docs/plans/` 或 `plans/` 目录下
- Python 3 可用

## Plan 文件格式要求

```markdown
# 计划正文

- TODO: 未完成任务 1
- DONE: 已完成任务 2
- TODO: 未完成任务 3
```

约束：
- TODO/DONE 标记必须大写
- 支持可选的 `-` 前缀

## git push 拦截行为

push 时 `shared/hooks/plan-tracker.py` 扫描仓库内所有 `.md` 文件，
存在 `TODO:` 则拦截并列出未完成任务：

```
Plan has pending TODO items:
  docs/plans/my-plan.md: TODO: 未完成任务 1
  docs/plans/my-plan.md: TODO: 未完成任务 3
```

拦截不依赖 frontmatter 或 status 字段——任何 `.md` 文件含 TODO 即触发。

## 禁止的命令组合

- **cd + git**：`cd /repo && git push` ❌ — 用 `workdir` 参数
- **git -C**：`git -C /path push` ❌ — 用 `workdir` 参数
- **混合 git + 非 git**：`npm test && git push` ❌ — 分两次调用
- **多 git 命令链**：`git add && git commit && git push` ✅ — 允许（全是 git）

## 验证方式

```bash
# plan-tracker.py 核心逻辑
python3 -m unittest shared.hooks.test_plan_tracker

# OpenCode plugin（33 tests）
node --test userconf/plugins/test/plan-tracker.test.mjs
```

## 常见失败处理

- **push 被拦但不应该**：把对应步骤的 `TODO:` 改为 `DONE:`
- **Python 环境缺失**：plugin 会 fail-open 并记录 warning，不会 block 所有 push
- **`git push-url` 被误拦截**：plugin regex 已排除 `push-*` 形式；如仍触发则为 plugin bug

## 相关资料

- 行为定义 SSOT：`userconf/plugins/test/plan-tracker.test.mjs`
- 设计细节：`docs/knowledge/plan-tracker.md`
- 实现：`userconf/plugins/plan-tracker.js`、`shared/hooks/plan-tracker.py`
