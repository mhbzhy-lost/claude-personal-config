# bug: plan-tracker.py 误报文档示例中的 TODO

## 症状

git push 被 plan-tracker.py 拦截，报告 9 个 pending TODO items：

```
.claude/skills/new-block/templates/component/frontend/SKILL.md: TODO: 列出主 Props + Config 接口的完整字段表
.claude/skills/new-block/templates/component/frontend/SKILL.md: TODO: 列出 block 帮你处理的 N 件事
.claude/skills/new-block/templates/component/frontend/SKILL.md: TODO: 列出 `❌` 项
.agents/skills/plan-tracker-config/SKILL.md: TODO: 未完成任务 1
.agents/skills/plan-tracker-config/SKILL.md: TODO: 未完成任务 3
docs/knowledge/plan-tracker.md: TODO: 未完成任务 1
docs/knowledge/plan-tracker.md: TODO: 未完成任务 3
userconf/AGENTS.md: TODO: 编写单元测试
userconf/AGENTS.md: TODO: 添加错误处理
```

但这些 TODO 都是**文档示例**（展示 plan 文件格式），不是真正的待完成任务。

## 用户影响

- 合法的 commit 无法 push
- 开发者被迫选择：
  - 用环境变量跳过检查（绕过门禁）
  - 临时修改代码提交后再改回（增加工作量）
  - 把文档示例改成 DONE（误导读者）

## 猜测

plan-tracker.py 最初设计只扫描 `docs/plans/` 下的文件，但当前版本扫描整个仓库的所有 `.md` 文件，导致文档示例被误报。

## 证据

检查 `shared/hooks/plan-tracker.py`：

```python
def scan_plan(repo_root: Path) -> list[Path]:
    plans_dir = repo_root / "docs" / "plans"  # ❌ 这个变量定义了但没使用
    pending = []
    for md_file in repo_root.rglob("*.md"):  # ⚠️ 扫描整个仓库
        todos = []
        for i, line in enumerate(md_file.read_text().splitlines(), 1):
            if line.strip().startswith("TODO:"):
                todos.append((i, line.strip()))
        if todos:
            pending.append((md_file, todos))
    return pending
```

- `plans_dir` 变量定义了但从未使用
- 实际扫描的是 `repo_root.rglob("*.md")`，即整个仓库

**状态**：✅ 确认为 bug

## 根因

`plan-tracker.py` 有两个代码路径，但只执行了其中一个：

1. **预期路径**：只扫描 `docs/plans/` 目录
2. **实际路径**：扫描整个仓库的所有 `.md` 文件

代码中定义了 `plans_dir = repo_root / "docs" / "plans"`，但后面的逻辑用了 `repo_root.rglob("*.md")`，导致扫描范围过大。

## 修复方案

**方案 1**：修改 plan-tracker.py，只扫描 `docs/plans/` 目录

```python
def scan_plan(repo_root: Path) -> list[Path]:
    plans_dir = repo_root / "docs" / "plans"
    if not plans_dir.exists():
        return []
    pending = []
    for md_file in plans_dir.rglob("*.md"):  # ✅ 只扫描 plans 目录
        todos = []
        for i, line in enumerate(md_file.read_text().splitlines(), 1):
            if line.strip().startswith("TODO:"):
                todos.append((i, line.strip()))
        if todos:
            pending.append((md_file, todos))
    return pending
```

**方案 2**：排除文档目录（`.claude/`, `.agents/`, `docs/knowledge/`, `userconf/`）

```python
def scan_plan(repo_root: Path) -> list[Path]:
    pending = []
    exclude_dirs = {".claude", ".agents", "docs/knowledge", "userconf"}
    for md_file in repo_root.rglob("*.md"):
        if any(excl in str(md_file) for excl in exclude_dirs):
            continue
        # ... 扫描逻辑
```

**推荐**：方案 1（更符合设计意图）

## 验证步骤

修改 plan-tracker.py 后：

1. 在 `docs/plans/` 下创建一个带 TODO 的测试 plan
2. 运行 `python shared/hooks/plan-tracker.py $(pwd)`
   - 预期：只报告 `docs/plans/` 下的 TODO
   - 验证：不报告 `.claude/`, `.agents/`, `docs/knowledge/` 下的 TODO
3. git push
   - 预期：成功推送
   - 验证：commit 出现在 origin/opencode

## 关联

- Commit: `3b19a3e3` - docs(AGENTS.reason)
- Commit: `a3f56a08` - chore(vendor)
- 文档: `docs/knowledge/plan-tracker.md`（包含被误报的示例 TODO）

## Lessons Learned

1. **变量定义 ≠ 逻辑实现**：代码中定义了 `plans_dir` 但没用，导致扫描范围偏离预期
2. **门禁应精准匹配目标**：plan-tracker 的目的是检查 active plans，不应扫描文档示例
3. **先查根因再绕过**：用户倾向于修而不是绕过，所以应该直接修复扫描逻辑
