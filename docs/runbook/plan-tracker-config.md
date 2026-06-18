# Plan Tracker 配置与 git push gate

## 前提条件

- plan 文件位于 `docs/plans/` 或 `plans/` 目录下
- Python 3 可用

## Plan 文件格式要求

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

约束：
- `status` 字段支持带引号或不带引号（`status: "active"` 或 `status: active`）
- TODO/DONE 标记必须大写
- 支持可选的 `-` 前缀

## git push 拦截行为

push 时 `shared/hooks/plan-tracker.py` 扫描所有 `status: active` 的 plan，
存在 `TODO:` 则拦截并列出未完成任务：

```
Active plan has pending TODO items:
  docs/plans/my-plan.md: TODO: 未完成任务 1
  docs/plans/my-plan.md: TODO: 未完成任务 3
```

`status` 为 `completed` / `paused` / `archived` 的 plan 不拦截。

## commit hook 自动更新

`shared/hooks/git-commit-hook.sh` 在 commit 时自动将 commit message 暗示的
`TODO:` 转为 `DONE:`（匹配"完成"、"implement"等关键词）。

## 禁止的命令组合

- **cd + git**：`cd /repo && git push` ❌ — 用 `workdir` 参数
- **git -C**：`git -C /path push` ❌ — 用 `workdir` 参数
- **混合 git + 非 git**：`npm test && git push` ✅ — 允许

## 验证方式

```bash
# plan-tracker.py 核心逻辑
cd shared/hooks && python3 test_plan_tracker.py

# OpenCode plugin（24 tests）
cd opencode/plugins && node --test test/plan-tracker.test.mjs
```

## 常见失败处理

- **push 被拦但不应该**：检查 plan 的 `status` 字段是否为 `completed`/`paused`/`archived`
- **Python 环境缺失**：plugin 会 fail-open 并记录 warning，不会 block 所有 push
- **修改 plan-tracker.py pattern 后 commit hook 不同步**：必须同步更新 `shared/hooks/git-commit-hook.sh` 的对应 pattern

## 相关资料

- 行为定义 SSOT：`userconf/plugins/test/plan-tracker.test.mjs`
- 设计细节：`docs/knowledge/plan-tracker.md`
- 实现：`userconf/plugins/plan-tracker.js`
