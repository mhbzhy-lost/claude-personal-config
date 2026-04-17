# Git Commit Message 规范

## 总览

采用 [Conventional Commits](https://www.conventionalcommits.org/) 风格的 **轻量化中文版**。
type / scope 用英文（机器可解析），subject / body 用中文（人类可读）。

```
<type>(<scope>): <中文简述，祈使句，不超过 50 字>

<可选 body：解释 why，不解释 what。换行宽度 72 字符>

<可选 footer：关联 plan / issue / breaking change>
```

## 字段约束

### type（必填，英文小写）

| type | 含义 |
|---|---|
| `feat` | 新功能 |
| `fix` | bug 修复 |
| `refactor` | 重构（不改变外部行为） |
| `perf` | 性能优化 |
| `test` | 测试相关（仅添加/修改测试） |
| `docs` | 文档（不改代码） |
| `style` | 格式（空格/缩进/分号，不改逻辑） |
| `chore` | 构建/工具/依赖 |
| `build` | 构建系统/外部依赖变更 |
| `ci` | CI 配置 |
| `revert` | 回滚某次 commit |

### scope（建议填，英文小写）

模块/子系统名，限定改动范围。按项目实际结构选取，复合 scope 用 `/` 分隔：`fix(recovery/picker): ...`。各项目可在其项目级 `CLAUDE.md` 中列出常用 scope 清单。

### subject（必填，中文）

- **祈使句**：动词开头（"增加"、"修复"、"重构"、"删除"），不要"已增加"/"实现了"
- **不超过 50 字**，不以句号结尾
- 描述**做了什么**而不是**为什么做**（why 写到 body）
- 不要写文件路径或函数名（写到 body 里）

### body（可选，但推荐）

- 与 subject 之间空一行
- 每行宽度 ≤ 72 字符（中文按 2 字符算）
- 重点说**为什么**：背景、动机、权衡、风险
- 多个改动用列表（`-` 开头）

### footer（可选）

- 关联文档：`Plan: docs/plans/26-recovery-robustness.md`
- 关联 issue：`Refs: #123` / `Fixes: #456`
- 破坏性变更：`BREAKING CHANGE: <说明>`
- Co-author：`Co-Authored-By: Name <email>`

> ⚠️ **禁止事项**：commit message（subject / body / footer）中不得出现 "Claude"、"Anthropic"、"Claude Code"、"Generated with ..." 等 AI 工具相关标识，也不要添加 `Co-Authored-By: Claude ...` 之类的署名。提交一律以人类作者身份书写。

## 示例

### 1. 简单 bug 修复

```
fix(recovery): 修复 hitl_loop_exceeded abort 后未真正退出

abort 路径错误地路由到 hitl_error_review，导致进程进入又一个 HITL
等待，看似假死。统一改为 __end__，并写入 status="aborted"。

Plan: docs/plans/26-recovery-robustness.md
```

### 2. 功能开发

```
feat(picker): 增加节点级别恢复 picker

当 .status 与 sqlite checkpoint 不一致时，自动 fallback 到 picker
让用户从产物完整的节点中选择恢复点，而不是静默尝试不可信的状态。

- StateInferrer 暴露 completed_nodes_chain
- 主菜单加 [4] 自定义恢复点入口
- CheckpointMismatchError 触发 picker 自动展示

Plan: docs/plans/26-recovery-robustness.md
```

### 3. 重构（无行为变更）

```
refactor(status): .status 写盘加 checksum 与双副本

write-tmp + fsync(file) + copy 备份到 .prev + os.replace + fsync(parent)。
任意时刻 primary 都是某个完整节点的状态。读取时校验 sha256，损坏自动
fallback 到 .status.prev。

无行为变更（对外 API 不变），但旧 .status 文件需要重新生成（向后兼容
的 v1 加载路径已实现）。
```

### 4. 测试

```
test(recovery): 补充 sigint storm 端到端回归

模拟用户在写盘临界区连按 10 次 ctrl-c，验证：
- 信号被完全吞掉，stderr 显示进度
- .status 文件完整可读
- abort_requested 不被误置
```

### 5. 文档

```
docs: 拆分 CLAUDE.md 为子文档并增加 git commit 规范

CLAUDE.md 改为索引，详细约束移到 .claude/guidelines/。新增
git-commit.md 规范本项目的 commit message 格式。
```

### 6. 破坏性变更

```
refactor(orchestrator)!: 重命名 developer_node → coding_node

BREAKING CHANGE: state["current_node"] 中的 "developer_node" 改名为
"coding_node"。已存在的 .status 文件需要手动迁移（提供
scripts/migrate_status_v2.py）。
```

## 反例（不要这样写）

### 信息量为零

```
bugfix
fix
update
add
wip
```

### 描述什么而不是为什么

```
fix(recovery): 把 if 改成 elif

# 应该：
fix(recovery): 修复 abort 与 force_proceed 同时为真时被错误路由
```

### subject 写成长篇

```
fix: plan22 23 24 完成，解决无法抵达 devops 问题，优化 devops 定位，实现 tester 的产品验收能力

# 应该拆成多个 commit，或：
feat(devops): 完成 plan22-24，打通 devops 路径

详细见 body...
```

### 用过去时

```
fix(cli): 已修复了 ctrl-c 不退出的问题

# 应该：
fix(cli): 修复 ctrl-c 无法终止 pipeline
```

## 多 commit 拆分原则

一次工作可能涉及多个改动，**优先拆成多个 commit** 而不是一个大 commit：

- 一个 commit 只做一件事
- 每个 commit 单独通过测试
- 每个 commit 都能独立 revert 而不破坏构建
- 修复 + 测试可以放一个 commit；重构 + 修复**必须**拆开

## 何时可以打破规则

- **WIP / 临时检查点**：在个人分支上可以用 `wip:` 前缀，但合并到 main 前必须 squash 重写
- **revert**：用 `revert: <原 commit subject>` 即可，body 说明 revert 原因
- **merge commit**：直接用 git 默认格式
