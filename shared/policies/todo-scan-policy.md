---
title: TODO/FIXME 扫描排除规则治理
kind: convention
status: active
applies_to:
  - shared/hooks/plan-tracker.py
  - userconf/plugins/plan-tracker.js
  - scripts/workflow/code-health-review.mjs
  - shared/policies/todo-scan-policy.md
last_verified: 2026-06-17
source: code-health-review synthesis
---

# TODO/FIXME 扫描排除规则：业务关键词误报的长期治理

code-health-review 的 `scan-todos` 节点 grep `TODO/FIXME/XXX` 时，
部分文件因业务需要合理包含这些关键词（如正则匹配模板、测试 fixture、错误提示文案），
必须通过白名单排除以避免伪阳性噪声。

## 适用场景

- 新增或修改 code-health-review workflow 的 scan-todos 节点
- 新增包含 TODO 字面量的模块（如新的 plan 解析工具）
- 排查 "scan-todos 报告大量伪阳性" 问题
- 审核 TODO 扫描结果时判断哪些是真实待办、哪些是业务噪音

## 项目事实 / 约定

**白名单文件格式：** 本文件维护排除路径清单，workflow prompt 和静态分析工具
引用此清单。

**当前白名单（2026-06）：**

| 路径 | 排除原因 |
|---|---|
| `shared/hooks/plan-tracker.py` | 正则中合理包含 `TODO:` / `DONE:` 字面量，用于匹配 plan 文件 |
| `userconf/plugins/plan-tracker.js` | 错误提示模板嵌入 `TODO` 关键词 |
| `shared/hooks/test_plan_tracker.py` | 测试 fixture 数据包含 `TODO:` / `DONE:` 样本 |
| `userconf/plugins/test/plan-tracker.test.mjs` | 测试 fixture 数据包含 `TODO` 关键词 |
| `shared/policies/todo-scan-policy.md` | 本文档自身包含 TODO 关键词（不可避免） |

**添加白名单条目的检查清单：**

1. 文件是否**因业务逻辑需要**包含 TODO 字面量（非真实待办）
2. 排除后是否会遗漏该文件中的真实 TODO（若可能，只排除特定行/区域）
3. 在白名单中标注具体排除原因（一句话）

**治理流程：**

1. **发现伪阳性** → 在 scan-todos 报告中标记
2. **评估** → 确认是业务关键词还是真实待办遗漏
3. **添加白名单** → 更新本文件的白名单表 + 同步 workflow prompt
4. **验证** → 重跑 scan-todos 确认伪阳性消除且无遗漏

## 原因

- plan-tracker 系统的核心功能就是解析 `TODO:` / `DONE:` 标记，其代码和测试中
  必然大量出现这些关键词
- 不做排除会导致 scan-todos 每次报告都包含这些伪阳性，淹没真实的待办遗漏
- 白名单集中管理（本文件）比散落在各处更容易维护
- 排除规则有明确的添加检查清单，避免"为了消除噪音而遗漏真实问题"

## 修改时注意

- 白名单变更需同步更新 `code-health-review.mjs` 中 `scan-todos` 节点的 prompt
- 新增白名单条目需说明排除原因
- 定期检查白名单是否过期（被排除的文件被删除后，条目应清理）
- 若排除粒度从"整个文件"细化为"特定行号范围"，需同步更新 prompt 表达方式

## 验证方式

```bash
# 验证白名单中的文件仍然存在
for f in shared/hooks/plan-tracker.py userconf/plugins/plan-tracker.js \
         shared/hooks/test_plan_tracker.py userconf/plugins/test/plan-tracker.test.mjs; do
  [ -f "$f" ] && echo "OK: $f" || echo "MISSING: $f"
done

# 跑 code-health-review 验证 scan-todos 不再报告白名单文件
node scripts/workflow/code-health-review.mjs --no-dashboard
```

## 相关资料

- scan-todos 节点：`scripts/workflow/code-health-review.mjs` 第 58-66 行
- plan-tracker 知识：`docs/knowledge/plan-tracker.md`
- plan-tracker 实现：`shared/hooks/plan-tracker.py`
- 权限分层：`docs/knowledge/permission-layers.md`
