---
name: git-commit
description: Git Commit Message 规范——Conventional Commits 轻量化中文版，含 type/scope 枚举、subject/body/footer 约束、完整示例、反例与多 commit 拆分原则
---

# Git Commit Message 规范

采用 [Conventional Commits](https://www.conventionalcommits.org/) 风格的 **轻量化中文版**。
type / scope 用英文（机器可解析），subject / body 用中文（人类可读）。

```
<type>(<scope>): <中文简述，祈使句，不超过 50 字>

<可选 body：解释 why，不解释 what。换行宽度 72 字符>

<可选 footer：关联 plan / issue / breaking change>
```

---

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

模块/子系统名，限定改动范围。按项目实际结构选取，复合 scope 用 `/` 分隔：`fix(recovery/picker): ...`。

### subject（必填，中文）

- **祈使句**：动词开头（"增加"、"修复"、"重构"、"删除"），不要"已增加"/"实现了"
- **不超过 50 字**，不以句号结尾
- 描述**做了什么**而不是**为什么做**（why 写到 body）

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

> ⚠️ **禁止事项**：commit message（subject / body / footer）中不得出现 "Claude"、"Anthropic"、"Claude Code" 等 AI 工具相关标识，也不要添加 `Co-Authored-By: Claude ...` 之类的署名。

---

## 示例

### 简单 bug 修复

```
fix(recovery): 修复 hitl_loop_exceeded abort 后未真正退出

abort 路径错误地路由到 hitl_error_review，导致进程进入又一个 HITL
等待，看似假死。统一改为 __end__，并写入 status="aborted"。
```

### 功能开发

```
feat(picker): 增加节点级别恢复 picker

当 .status 与 sqlite checkpoint 不一致时，自动 fallback 到 picker
让用户从产物完整的节点中选择恢复点。

- StateInferrer 暴露 completed_nodes_chain
- 主菜单加 [4] 自定义恢复点入口
- CheckpointMismatchError 触发 picker 自动展示
```

### 重构

```
refactor(status): .status 写盘加 checksum 与双副本

无行为变更（对外 API 不变），但旧 .status 文件需要重新生成。
```

### 破坏性变更

```
refactor(orchestrator)!: 重命名 developer_node → coding_node

BREAKING CHANGE: state["current_node"] 中的 "developer_node" 改名为
"coding_node"。已存在的 .status 文件需要手动迁移。
```

---

## 反例

- **信息量为零**：`bugfix`、`fix`、`update`、`wip`
- **描述 what 而非 why**：`fix(recovery): 把 if 改成 elif` → 应写"修复 abort 与 force_proceed 同时为真时被错误路由"
- **subject 过长**：把多个无关改动揉进一行 → 拆成多个 commit
- **用过去时**：`fix(cli): 已修复了 ctrl-c 不退出的问题` → 应写"修复 ctrl-c 无法终止 pipeline"

---

## 多 commit 拆分原则

- 一个 commit 只做一件事
- 每个 commit 单独通过测试
- 每个 commit 都能独立 revert 而不破坏构建
- 修复 + 测试可以放一个 commit；重构 + 修复**必须**拆开

## 何时可以打破规则

- **WIP / 临时检查点**：个人分支上可用 `wip:` 前缀，合并到 main 前必须 squash 重写
- **revert**：用 `revert: <原 commit subject>` 即可
- **merge commit**：直接用 git 默认格式

---

## 提交执行流程

写 commit message 之前先取齐 context，再单消息内 stage + commit，避免来回串行。

### 1. 取 context（提交前必跑）

```bash
git status            # 哪些文件待提交 / 已 stage
git diff HEAD         # 全部待提交内容（包括 unstaged）
git branch --show-current
git log --oneline -10 # 参考近期 commit 风格
```

四条命令可一次性并行跑（同一消息内多个 Bash 调用）。看完 diff 再决定：
- 是单 commit 还是要拆成多个（参考"多 commit 拆分原则"）
- type / scope 怎么选
- body 该写什么 why

### 2. 分支保护

如果 `git branch --show-current` 显示 `main` / `master`，**先建分支再提交**：

```bash
git checkout -b <type>/<scope>-<简短描述>
# 例：git checkout -b fix/recovery-hitl-abort
```

不要在 main 上直接 commit。

### 3. 单消息 stage + commit

确认好 message 后，同一条消息内并发执行 `git add` + `git commit`，不要分两轮串行。commit message 通过 heredoc 传入以保证换行格式：

```bash
git commit -m "$(cat <<'EOF'
<type>(<scope>): <中文 subject>

<可选 body>
EOF
)"
```

### 4. 配套清理

远端已删本地仍存在的分支（`git branch -v` 显示 `[gone]`），用 `/clean_gone` slash command 一键清理（含关联 worktree）。提交完成后顺手跑一次。

---

## 推送 / PR 流程（可选）

提交完成后如需推送并开 PR：

```bash
git push -u origin <branch>
gh pr create --fill   # 用最近 commit 自动填 title/body
```

或更结构化：

```bash
gh pr create --title "<type>(<scope>): <中文 subject>" --body "$(cat <<'EOF'
## 改动概要
- 要点 1
- 要点 2

## 验证
- [ ] 单测通过
- [ ] 手动验证 ...
EOF
)"
```

PR 标题沿用 commit subject 的格式约束（type/scope/中文祈使句），body 用中文。
