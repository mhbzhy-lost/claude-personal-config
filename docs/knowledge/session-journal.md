---
title: Session Journal 反模式检测插件
kind: convention
status: active
applies_to:
  - userconf/plugins/session-journal.js
  - userconf/plugins/test/session-journal.test.mjs
last_verified: 2026-06-23
---

# Session Journal — 零人工反模式检测与上下文注入

## 适用场景

- 修改 session-journal.js（核心逻辑）
- 调整反模式检测规则（阈值、正则）
- 排查"agent 未看到反模式提醒"问题
- 理解 compact 与 distill 的协作关系

## 架构

三层自动循环，workspace 维度（per repo），全程零 LLM 调用、零人工干预：

1. **记录**：`tool.execute.after` 每次触发写入一行 JSONL
2. **蒸馏**：每 10 条 entry 触发规则蒸馏，写入 summary.json + summary.md
3. **注入**：下次 `edit`/`write` 的 after hook 读取 summary 拼入 output

## 文件布局

```
<repo-root>/.opencode/session/       # workspace 维度，gitignored
├── journal.jsonl                     # 当前 session checkpoint 流
├── summary.json                      # 蒸馏结果（机器读）
├── summary.md                        # 蒸馏结果（人读 + compact hook 读）
└── archive/                          # 旧 session 归档
```

## 反模式检测规则

| 规则 | 检测方法 | 阈值 |
|------|---------|------|
| 重复编辑同一文件 | edit/write 计数 | ≥3 次 |
| 测试连续失败 | bash exit code 序列 | fail ≥2 次才 pass |
| 门禁绕过 | SKIP env / --no-verify 正则 | 任意匹配 |

## 与 opencode compact 的协作

`experimental.session.compacting` hook 在 compact 生成摘要前触发：
- 读取 `summary.md` 的反模式内容
- 注入到 `output.context` 数组
- compact 的 LLM 生成继续摘要时会包含反模式信息

这解决了 compact 自身会丢弃"已修复 bug 的历史细节"的问题——
compact 看到的是注入的结构化反模式，不是原始对话文本。

## 与 plan-tracker 的关系

| | session-journal | plan-tracker |
|---|---|---|
| 触发时机 | 每次 tool.execute.after | 仅 git push 前 |
| 检测目标 | 反模式 / 修复循环 | 未完成的 TODO |
| 作用方式 | 软提醒（注入 output） | 硬拦截（throw error） |
| 数据位置 | `.opencode/session/` | `docs/plans/` |

两者不冲突。plan-tracker 拦截"计划未完成就 push"，session-journal
提醒"你在修复循环中"。

## 修改时注意

- `DISTILL_INTERVAL` 控制蒸馏频率（默认 10 条 entry 触发一次）
- 所有 I/O 用 fail-open：任何 journal 读取/写入失败不应影响 agent
- `TEST_CMD_RE` 正则定义了哪些 bash 命令被视为测试命令
- `BYPASS_ENV_RE` 正则定义了哪些 env 变量被视为门禁绕过
- archive 文件用 ISO timestamp 命名，无上限（暂不自动清理）

## 验证方式

```bash
node --test userconf/plugins/test/session-journal.test.mjs
```
