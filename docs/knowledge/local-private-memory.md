---
title: 本机私有记忆隔离
kind: convention
status: active
applies_to:
  - memory.md
  - ~/.agents/memory.md
last_verified: 2026-06-10
source: local business memory cleanup
---

# 内部业务记忆不进入本仓

本仓 `memory.md` 只保存可共享、低敏、跨项目复用的配置和工具经验。内部业务项目、
内部工具链、业务构建排障、环境标识、集成区、流水线实例、应用名等只应写入本机
私有 `~/.agents/memory.md`。

## 适用场景

新增或迁移长期记忆、提交 `memory.md`、清理历史敏感内容时，必须检查本文。

## 项目事实 / 约定

- `memory.md` 属于仓库同步内容，会进入远端历史。
- `~/.agents/memory.md` 属于本机私有内容，不纳入本仓提交。
- 如果发现内部业务记忆误入本仓，只改 HEAD 不够；必须同时清洗历史 commit。
- 仓库内 bug/knowledge 文档可记录通用治理原则，但不要写入具体内部项目或工具名。

## 验证方式

```bash
git grep -n -E '<内部关键词正则>' -- '*.md'
git grep -l -E '<内部关键词正则>' $(git rev-list --all) -- memory.md
```

第二条在历史清洗后应无输出。
