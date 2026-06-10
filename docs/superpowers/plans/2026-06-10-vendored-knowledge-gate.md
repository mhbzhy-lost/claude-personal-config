# Vendored Knowledge Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提供一个可复制到目标项目内运行的知识库硬门禁 checker，让路径规则随项目交付，而不是依赖全局 `claude-config`。

**Architecture:** `claude-config` 只维护模板、安装器和测试；目标项目运行时使用复制过去的 `.agent/hooks/knowledge-gate.py` 与 `.agent/knowledge-gate.json`。全局 git commit 提醒仍保留软提醒，不内置项目路径规则。

**Tech Stack:** Bash installer、Python stdlib checker、`unittest` 回归测试、Git staged diff (`git diff --cached --name-only`)。

---

## 外部约束确认

- Git 官方说明：`pre-commit` 可用于检查即将提交的 snapshot，非零退出会中止提交；这支持项目内 `.githooks/pre-commit` 作为便携硬门禁入口。来源：https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks
- OpenCode 官方插件文档：插件可挂接事件并扩展行为；这支持后续把同一个 vendored checker 包一层项目内 OpenCode plugin，但本计划先实现 Git-native 与通用 CLI。来源：https://open-code.ai/en/docs/plugins
- `pre-commit` 项目文档也把 hook 定位为提交前自动检查简单问题的机制；本计划不引入该框架，只参考“项目内可安装检查”的分发模型。来源：https://pre-commit.com/

## 当前工作区前置处理

上轮中断前，`codex/hooks/tests/test_codex_hooks.py` 里已出现部分“把硬门禁塞进全局 git commit hook”的 WIP 测试。这与最新决策冲突：路径规则必须项目化、checker 必须 vendored 到目标项目。

执行本计划前先清理这部分 WIP，保留已经完成且验证过的两类改动：

- 保留 Superpowers 导入旧表述清理。
- 保留 `init_codex.sh` 合并渲染 hooks 的修复。
- 移除 `test_codex_git_commit_hook_blocks_skip_when_knowledge_gate_requires_update` 及相关 helper/Opencode 全局 hook 硬门禁测试。

## 文件结构

- Create: `templates/knowledge-gate/.agent/hooks/knowledge-gate.py`
  - 目标项目内自包含 checker；只依赖 Python 标准库和 `git`。
- Create: `templates/knowledge-gate/.agent/knowledge-gate.json`
  - 示例规则文件；默认只包含示例，安装后由项目维护者改成项目规则。
- Create: `templates/knowledge-gate/.githooks/pre-commit`
  - Git-native wrapper，调用 `.agent/hooks/knowledge-gate.py --mode pre-commit`。
- Create: `templates/knowledge-gate/README.md`
  - 说明 schema、安装方式、no-op 行为和粒度选择。
- Create: `scripts/install-knowledge-gate.sh`
  - 从模板复制到目标项目；默认不覆盖已有文件。
- Modify: `codex/hooks/tests/test_codex_hooks.py`
  - 增加 checker 与 installer 测试，移除上轮全局 hook WIP 测试。
- Modify: `shared/policies/git-commit-hint.json`
  - 只更新软提醒文案：说明项目若 vendored 了 knowledge gate，会由项目内脚本硬拦截；未配置时仍需人工判断。
- Modify: `shared/policies/README.md`
  - 说明 git commit hint 不包含项目路径规则。
- Create: `docs/knowledge/vendored-knowledge-gate.md`
  - 沉淀本仓关于“机制可复用，规则项目化并 vendored”的长期约定。

## 决策报告

- **[门禁分发方式]**：checker 复制进目标项目运行。
- **推荐**：vendored checker，因为项目交付给别人后不应依赖维护者的全局 `claude-config`。
- **不选原因**：全局 hook 自动读取项目规则会形成隐藏运行时依赖。
- **选错代价**：别人 clone 项目但无全局配置时门禁失效，修复代价中。

- **[默认启用策略]**：无规则文件时 no-op。
- **推荐**：no-op，因为不配置固定路径检查的项目不应被误伤。
- **不选原因**：默认阻断会让所有未初始化项目无法提交。
- **选错代价**：大面积误阻断提交，修复代价中。

- **[规则粒度]**：先支持 any/topic，不做一源文件一 doc 强绑定。
- **推荐**：`satisfy_by` 支持任意知识文档或指定主题文档，因为多数项目不需要细到文件级 doc。
- **不选原因**：文件级映射维护成本高，容易逼出无价值碎文档。
- **选错代价**：知识库膨胀、误伤多，修复代价中。

## DAG 与并发集合

```text
A 清理上轮 WIP
  -> B checker schema + RED tests
  -> C checker implementation
  -> D installer + template docs
  -> E shared hint 文案更新
  -> F 知识文档
  -> G 全量验证

B 和 D 不并发：installer 需要 checker 文件路径和模板结构稳定。
D、E、F 可并发：它们读 C 的接口契约，但写入路径不同。
G 等待所有任务完成。
```

可并发集合：

- 第一阶段：只有 `A`，避免在错误 WIP 上继续叠加。
- 第二阶段：`B -> C` 串行，严格 TDD。
- 第三阶段：`D`、`E`、`F` 可并发，写入范围分别是 `scripts/templates`、`shared/policies`、`docs/knowledge`。
- 第四阶段：`G` 串行验证。

## Task 1: 清理中断 WIP

**Files:**
- Modify: `codex/hooks/tests/test_codex_hooks.py`

- [ ] **Step 1: 查看当前 WIP 测试**

Run:

```bash
rg -n "knowledge_gate|脚本判定本次 staged diff|allows_skip_when_knowledge_gate|blocks_skip_when_knowledge_gate" codex/hooks/tests/test_codex_hooks.py
```

Expected: 输出上轮中断留下的全局 git commit hook 硬门禁测试。

- [ ] **Step 2: 移除错误方向的全局 hook 测试**

Edit `codex/hooks/tests/test_codex_hooks.py`:

- 删除 `_setup_repo_with_initial_commit` helper，如果只被这些 WIP 测试使用。
- 删除以下测试：
  - `test_codex_git_commit_hook_blocks_skip_when_knowledge_gate_requires_update`
  - `test_codex_git_commit_hook_allows_skip_when_knowledge_gate_is_satisfied`
  - `test_codex_git_commit_hook_allows_skip_when_knowledge_gate_does_not_match`
  - `test_opencode_git_commit_plugin_blocks_skip_when_knowledge_gate_requires_update`
- 保留 Superpowers 导入旧表述清理相关测试。
- 保留 `init_codex_preserves_unmanaged_hooks_when_rendering` 测试。

- [ ] **Step 3: 跑局部回归**

Run:

```bash
python3 -m unittest \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_codex_git_commit_hook_allows_env_assignment_prefix \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_opencode_git_commit_plugin_uses_env_escape
```

Expected: `OK`。

## Task 2: 定义 checker schema 并写 RED tests

**Files:**
- Create: `templates/knowledge-gate/.agent/hooks/knowledge-gate.py`
- Create: `templates/knowledge-gate/.agent/knowledge-gate.json`
- Modify: `codex/hooks/tests/test_codex_hooks.py`

- [ ] **Step 1: 增加测试常量**

Add near other constants in `codex/hooks/tests/test_codex_hooks.py`:

```python
KNOWLEDGE_GATE = REPO_ROOT / "templates" / "knowledge-gate" / ".agent" / "hooks" / "knowledge-gate.py"
```

- [ ] **Step 2: 写 no-op RED test**

Add test:

```python
def test_knowledge_gate_noops_when_config_is_missing(self) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        repo = self._setup_repo_with_initial_commit(Path(tmp))
        (repo / "init_codex.sh").write_text("#!/usr/bin/env bash\n")
        subprocess.run(["git", "-C", str(repo), "add", "init_codex.sh"], check=True)

        proc = subprocess.run(
            ["python3", str(KNOWLEDGE_GATE), "--repo", str(repo)],
            text=True,
            capture_output=True,
        )

    self.assertEqual(proc.returncode, 0, proc.stderr)
    self.assertIn("knowledge-gate: no config", proc.stderr)
```

Expected RED before implementation: fails because `knowledge-gate.py` does not exist.

- [ ] **Step 3: 写命中路径但未满足知识文档的 RED test**

Add test:

```python
def test_knowledge_gate_blocks_matching_paths_without_knowledge_update(self) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        repo = self._setup_repo_with_initial_commit(Path(tmp))
        config = repo / ".agent" / "knowledge-gate.json"
        config.parent.mkdir()
        config.write_text(json.dumps({
            "version": 1,
            "rules": [{
                "id": "agent-runtime",
                "paths": ["init_*.sh", "shared/policies/**"],
                "satisfy_by": ["docs/knowledge/**"],
                "reason": "agent runtime behavior changed"
            }]
        }))
        (repo / "init_codex.sh").write_text("#!/usr/bin/env bash\n")
        subprocess.run(["git", "-C", str(repo), "add", ".agent/knowledge-gate.json", "init_codex.sh"], check=True)

        proc = subprocess.run(
            ["python3", str(KNOWLEDGE_GATE), "--repo", str(repo)],
            text=True,
            capture_output=True,
        )

    self.assertEqual(proc.returncode, 2)
    self.assertIn("agent-runtime", proc.stdout)
    self.assertIn("init_codex.sh", proc.stdout)
    self.assertIn("docs/knowledge/**", proc.stdout)
```

Expected RED before implementation: fails because script does not exist.

- [ ] **Step 4: 写 satisfy_by 放行 RED test**

Add test:

```python
def test_knowledge_gate_allows_when_matching_knowledge_file_is_staged(self) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        repo = self._setup_repo_with_initial_commit(Path(tmp))
        config = repo / ".agent" / "knowledge-gate.json"
        config.parent.mkdir()
        config.write_text(json.dumps({
            "version": 1,
            "rules": [{
                "id": "agent-runtime",
                "paths": ["init_*.sh"],
                "satisfy_by": ["docs/knowledge/**"]
            }]
        }))
        (repo / "init_codex.sh").write_text("#!/usr/bin/env bash\n")
        knowledge = repo / "docs" / "knowledge" / "runtime.md"
        knowledge.parent.mkdir(parents=True)
        knowledge.write_text("# Runtime\n")
        subprocess.run(
            ["git", "-C", str(repo), "add", ".agent/knowledge-gate.json", "init_codex.sh", "docs/knowledge/runtime.md"],
            check=True,
        )

        proc = subprocess.run(
            ["python3", str(KNOWLEDGE_GATE), "--repo", str(repo)],
            text=True,
            capture_output=True,
        )

    self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
```

Expected RED before implementation: fails because script does not exist.

## Task 3: 实现 standalone checker

**Files:**
- Create: `templates/knowledge-gate/.agent/hooks/knowledge-gate.py`
- Create: `templates/knowledge-gate/.agent/knowledge-gate.json`

- [ ] **Step 1: 创建示例配置**

Create `templates/knowledge-gate/.agent/knowledge-gate.json`:

```json
{
  "version": 1,
  "rules": [
    {
      "id": "example-agent-runtime",
      "paths": [
        "init_*.sh",
        "shared/policies/**"
      ],
      "satisfy_by": [
        "docs/knowledge/**"
      ],
      "reason": "这些路径通常改变 agent 运行时、初始化流程或配置契约"
    }
  ]
}
```

- [ ] **Step 2: 创建 checker 最小实现**

Create `templates/knowledge-gate/.agent/hooks/knowledge-gate.py` with these behaviors:

- CLI args: `--repo <path>` optional, default current git root.
- Config discovery: `<repo>/.agent/knowledge-gate.json`.
- Missing config: exit `0`, stderr `knowledge-gate: no config at ...`.
- Staged files: `git -C <repo> diff --cached --name-only --diff-filter=ACMRT`.
- Pattern matching: use `fnmatch.fnmatchcase(path, pattern)`.
- A rule matches if any staged file matches `paths`.
- A rule is satisfied if any staged file matches `satisfy_by`.
- If any matched rule is unsatisfied: print a concise report to stdout and exit `2`.
- Invalid config: print the error and exit `2`.

- [ ] **Step 3: Run RED tests again**

Run:

```bash
python3 -m unittest \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_knowledge_gate_noops_when_config_is_missing \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_knowledge_gate_blocks_matching_paths_without_knowledge_update \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_knowledge_gate_allows_when_matching_knowledge_file_is_staged
```

Expected: `OK`.

## Task 4: Add Git-native wrapper and installer

**Files:**
- Create: `templates/knowledge-gate/.githooks/pre-commit`
- Create: `scripts/install-knowledge-gate.sh`
- Modify: `codex/hooks/tests/test_codex_hooks.py`

- [ ] **Step 1: Write installer RED test**

Add test:

```python
def test_install_knowledge_gate_copies_template_without_overwrite(self) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        repo = Path(tmp) / "repo"
        repo.mkdir()
        script = REPO_ROOT / "scripts" / "install-knowledge-gate.sh"

        first = subprocess.run(
            ["bash", str(script), str(repo)],
            text=True,
            capture_output=True,
        )
        second = subprocess.run(
            ["bash", str(script), str(repo)],
            text=True,
            capture_output=True,
        )

    self.assertEqual(first.returncode, 0, first.stderr)
    self.assertEqual(second.returncode, 0, second.stderr)
    self.assertIn("exists, keeping", second.stdout)
    self.assertTrue((repo / ".agent" / "hooks" / "knowledge-gate.py").is_file())
    self.assertTrue((repo / ".agent" / "knowledge-gate.json").is_file())
    self.assertTrue((repo / ".githooks" / "pre-commit").is_file())
```

Expected RED: script does not exist.

- [ ] **Step 2: Create Git wrapper**

Create `templates/knowledge-gate/.githooks/pre-commit`:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
exec python3 "$ROOT/.agent/hooks/knowledge-gate.py" --repo "$ROOT" --mode pre-commit
```

- [ ] **Step 3: Create installer**

Create `scripts/install-knowledge-gate.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  echo "usage: bash scripts/install-knowledge-gate.sh /path/to/repo" >&2
  exit 2
fi

SRC_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="$SRC_ROOT/templates/knowledge-gate"
TARGET="$(cd "$TARGET" && pwd)"

copy_one() {
  local rel="$1"
  local src="$TEMPLATE/$rel"
  local dst="$TARGET/$rel"
  mkdir -p "$(dirname "$dst")"
  if [ -e "$dst" ]; then
    echo "[knowledge-gate] $rel exists, keeping"
    return
  fi
  cp "$src" "$dst"
  echo "[knowledge-gate] installed $rel"
}

copy_one ".agent/hooks/knowledge-gate.py"
copy_one ".agent/knowledge-gate.json"
copy_one ".githooks/pre-commit"
chmod +x "$TARGET/.agent/hooks/knowledge-gate.py" "$TARGET/.githooks/pre-commit"

echo "[knowledge-gate] optional enable: git -C \"$TARGET\" config core.hooksPath .githooks"
```

- [ ] **Step 4: Run installer test**

Run:

```bash
python3 -m unittest \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_install_knowledge_gate_copies_template_without_overwrite
```

Expected: `OK`.

## Task 5: Update shared hint text without adding global hard gate

**Files:**
- Modify: `shared/policies/git-commit-hint.json`
- Modify: `shared/policies/README.md`

- [ ] **Step 1: Update shared hint wording**

Change the knowledge line in `shared/policies/git-commit-hint.json` to:

```json
"3) 知识文档：若项目内安装了 vendored knowledge gate，请先满足该项目脚本的硬门禁；未安装或未命中时，仍需按 `{knowledge_readme}` 判断本次 staged diff 是否需要新增/更新目标仓 `docs/knowledge/`。需要则先创建或更新并接入项目入口；不需要则 commit message 注明原因。"
```

- [ ] **Step 2: Update tests for hint wording**

In `test_codex_hooks.py`, make assertions look for:

```python
self.assertIn("vendored knowledge gate", reason)
self.assertIn("未安装或未命中时", reason)
self.assertIn("commit message 注明原因", reason)
```

- [ ] **Step 3: Update shared policy README**

In `shared/policies/README.md`, update the git commit row to clarify:

```markdown
全局 git commit hint 只做通用流程提醒；项目路径硬门禁由 vendored knowledge gate 模板复制到目标项目后执行。
```

## Task 6: Add knowledge documentation

**Files:**
- Create: `docs/knowledge/vendored-knowledge-gate.md`
- Modify: `docs/knowledge/README.md` only if an index section for current knowledge docs is added later. Do not add an index in this task unless the repo already has one.

- [ ] **Step 1: Create knowledge doc**

Create `docs/knowledge/vendored-knowledge-gate.md`:

```markdown
---
title: Vendored knowledge gate
kind: convention
status: active
applies_to:
  - templates/knowledge-gate/
  - scripts/install-knowledge-gate.sh
  - shared/policies/git-commit-hint.json
last_verified: 2026-06-10
source: knowledge gate design decision
---

# 知识库硬门禁必须随项目交付

`claude-config` 可以维护 knowledge gate 的模板和安装器，但目标项目运行时不能依赖
本仓。需要硬门禁的项目必须把 checker、规则文件和可选 Git hook wrapper 复制进
项目内并提交。

## 适用场景

修改 knowledge gate 模板、安装器、git commit hint 文案，或给目标项目接入知识库
硬门禁时，必须检查本文。

## 项目事实 / 约定

全局 git commit hook 只做软提醒，不硬编码项目路径规则。项目路径语义只能由目标
项目自己的 `.agent/knowledge-gate.json` 表达。

模板 checker 支持两类粒度：

- any：`satisfy_by: ["docs/knowledge/**"]`，命中规则后任意知识文档更新即可满足。
- topic：`satisfy_by: ["docs/knowledge/runtime.md"]`，命中规则后必须更新指定主题文档。

默认不实现一源文件一 doc 的 mapped 模式；需要这种强约束的项目应在自己的 checker
副本上扩展，而不是把复杂映射推回全局模板。

## 修改时注意

- 安装器默认不覆盖目标项目已有文件。
- 无 `.agent/knowledge-gate.json` 时 checker 必须 no-op。
- checker 必须只依赖 Python 标准库和 Git。
- 不要让目标项目运行时 import `claude-config`。

## 验证方式

```bash
python3 -m unittest \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_knowledge_gate_noops_when_config_is_missing \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_knowledge_gate_blocks_matching_paths_without_knowledge_update \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_knowledge_gate_allows_when_matching_knowledge_file_is_staged \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_install_knowledge_gate_copies_template_without_overwrite
```
```

## Task 7: Full verification

**Files:**
- All touched files.

- [ ] **Step 1: Run focused tests**

```bash
python3 -m unittest \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_knowledge_gate_noops_when_config_is_missing \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_knowledge_gate_blocks_matching_paths_without_knowledge_update \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_knowledge_gate_allows_when_matching_knowledge_file_is_staged \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_install_knowledge_gate_copies_template_without_overwrite
```

Expected: `OK`.

- [ ] **Step 2: Run full hook suite**

```bash
python3 -m unittest codex/hooks/tests/test_codex_hooks.py
```

Expected: all tests `OK`.

- [ ] **Step 3: Run shell syntax and whitespace checks**

```bash
bash -n scripts/install-knowledge-gate.sh templates/knowledge-gate/.githooks/pre-commit
git diff --check
```

Expected: no output, exit `0`.

- [ ] **Step 4: Manual smoke copy**

```bash
tmp="$(mktemp -d)"
git init -b main "$tmp/repo"
bash scripts/install-knowledge-gate.sh "$tmp/repo"
test -f "$tmp/repo/.agent/hooks/knowledge-gate.py"
test -f "$tmp/repo/.agent/knowledge-gate.json"
test -f "$tmp/repo/.githooks/pre-commit"
rm -rf "$tmp"
```

Expected: all `test -f` commands pass.

## Self-Review

- Spec coverage: covers vendored checker, no global runtime dependency, no-op compatibility for projects without config, any/topic granularity, installer behavior, tests and docs.
- Placeholder scan: no TBD/TODO/later placeholders.
- Type consistency: schema consistently uses `version`, `rules`, `id`, `paths`, `satisfy_by`, `reason`.
