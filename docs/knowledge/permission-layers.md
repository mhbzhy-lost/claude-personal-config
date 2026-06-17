---
title: opencode 权限模型分层策略
kind: decision
status: active
applies_to:
  - userconf/permission.json
  - userconf/plugins/
  - init_opencode.sh
last_verified: 2026-06-17
source: code-health-review synthesis
---

# 权限分层策略：permission template + plugin hook + AGENTS.md 三层联动

opencode 权限由三层机制叠加，每层有明确的职责边界和适用场景。
新增安全规则时，先判断应落在哪一层，避免职责交叉或遗漏。

## 适用场景

- 新增安全检查规则时判断归属层
- 排查权限规则冲突或覆盖时理清链路
- 评审权限变更时验证分层一致性
- 设计新的 plugin 前确认 permission template 无法覆盖

## 项目事实 / 约定

### L1: Permission Template（静态 glob/command gate）

**位置：** `userconf/permission.json` → `opencode.json.permission`（init_opencode.sh 同步）

**特征：**
- 静态声明式，无运行时计算
- 按 insertion order 匹配，最后命中规则生效
- 覆盖粒度：工具级（`bash`、`read`）或命令/路径级（`"git *"`, `"$REPO/**"`）

**适用：**
- 工具启用/禁用（`"edit": "deny"`）
- 命令白名单/黑名单（`"rm *": "deny"`）
- 路径范围限制（`"$REPO/**": "allow"`）
- 低成本覆盖的高频场景

**不适用：**
- 需要运行时路径解析（realpath、symlink）
- 需要条件判断（如检查目标是否在工作区内）
- 需要输出结构化错误信息

### L2: Plugin Hook（运行时拦截）

**位置：** `userconf/plugins/*.js` → `~/.config/opencode/plugins/`（软链）

**特征：**
- `tool.execute.before` hook，可访问完整工具输入参数
- 可做运行时计算（路径解析、正则匹配、子进程调用）
- 阻断方式：`throw new Error()` + 可操作的错误信息

**适用：**
- 需要工作区根目录感知的路径校验（`rm-outside-workspace-guard.js`）
- 需要解析命令语义（区分 `git push` 和 `git status`）
- 需要调用外部程序（如 `plan-tracker.py`、`git-commit-gate.js`）
- 需要条件性阻断（如只在特定工具+特定命令组合时触发）

**不适用：**
- 纯工具启用/禁用（L1 更简单）
- 静态路径白名单（L1 glob 足够）

### L3: AGENTS.md 约定（文档约束）

**位置：** `userconf/AGENTS.md` → `~/.config/opencode/AGENTS.md`（软链）

**特征：**
- 软性规范，靠 agent 自觉遵循
- 不强制执行，可被绕过
- 面向 agent 的行为指南和决策框架

**适用：**
- 编排策略（"并发 < 3 用 subagent，≥ 3 用 workflow"）
- 流程约定（"先写测试再写实现"）
- 输出格式（"commit message 用中文祈使句"）

**不适用：**
- 安全阻断（agent 可能违反）
- 需要强制执行的规则

### 三层联动原则

| 原则 | 说明 |
|---|---|
| 安全规则必须 L1+L2 双层 | L1 作为声明式防线，L2 作为运行时兜底 |
| 能用 L1 就不用 L2 | 静态声明比运行时计算更简单、更快、更易审计 |
| L3 不做安全兜底 | 文档约定仅供行为引导，不作为防线 |
| 每层职责不重叠 | 同一规则不在多层重复定义（L1+L2 的 deny 是不同层次的防御，不算重叠） |

## 原因

- **单层权限无法满足所有安全需求**：静态 glob 无法处理符号链接解析、`cd` 链跟踪、
  shell 展开检测等动态场景
- **纯插件模式过重**：简单工具开关用 plugin 实现是过度工程
- **文档约定不可替代强制执行**：agent 可能幻觉或忽略约定，高风险操作必须代码阻断
- **分层降低维护复杂度**：每层有明确的"该做什么"和"不该做什么"

## 修改时注意

- 新增 L2 plugin 时，在 L1 `permission.json` 添加对应 deny 规则作为第二防线
- 修改 L1 规则后重跑 `init_opencode.sh` 并重启 opencode
- L3 约定变更需同步 `AGENTS.reason.md`（本仓强制要求）
- 不要在 L3 中引入"违反则阻断"的语言（这是 L1/L2 的职责）

## 验证方式

```bash
# 验证 L1 permission 与 SSOT 一致性
python3 -c "
import json
ssot = json.load(open('userconf/permission.json'))['template']
cfg = json.load(open('$HOME/.config/opencode/opencode.json'))['permission']
assert ssot == cfg, 'MISMATCH'
print('L1 OK')
"

# 验证 L2 plugins 软链完整性
ls -la ~/.config/opencode/plugins/ | grep '\->'

# 验证 L3 AGENTS.md 软链
readlink ~/.config/opencode/AGENTS.md
```

## 相关资料

- 权限模型概览：`docs/knowledge/permission-model.md`
- 工作区边界：`docs/knowledge/workspace-boundary.md`
- TODO 扫描排除：`shared/policies/todo-scan-policy.md`
- Plugin 测试：`userconf/plugins/test/`
