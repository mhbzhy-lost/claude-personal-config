# bug-push-hook-silent-failures.md

## 1. 症状
`git push` 通过 opencode 执行时，异源评审 (`external-review-gate.sh`) 从未触发。
实际评审在跑（anthropic→bailian 链），但失败后静默放行，用户看不到任何反馈。

## 2. 影响
外源评审事实上形同虚设 — 每次 push 都 degraded allow，reviewer 报错被吞。
无法排查 hook 脚本为什么跑崩，也无从观测 push 路径上的 gate 行为。

## 3. 根因（3 处）
1. **Plugin 静默吞错误**：`external-review-gate.js` 里 `catch { return }` 把任何 execFileSync
   抛错（包括 stderr 日志）一律丢弃，没有任何输出到用户或日志文件。
2. **MARKER_DIR 在子模块路径上崩溃**：`Path(_eff_top) / ".git" / "review-markers"` 假设
   `.git` 是目录，但 git submodule 里的 `.git` 是 gitlink 文件（一行 `gitdir: ...`），
   导致 `mkdir` 抛 NotADirectoryError 然后被 hook 脚本的 try/except 捕获但没显式处理。
3. **Reviewer.py 调用使用旧参数名**：hook 脚本里仍是 `--backend anthropic/api`，但
   reviewer.py 已迁移到 `--provider`，且缺 `--with pyyaml` 导致 `ModuleNotFoundError`。

## 4. 修复
1. Plugin：捕获 stderr，写 `${CLAUDE_CONFIG_HOME}/logs/external-review-gate.log`（1MB 自动轮转）
2. Hook script：用 `git rev-parse --git-dir` 拿真实 git 目录（submodule 兼容）
3. Hook script：`--backend` → `--provider`，fallback chain 改为
   `idealab-anthropic → bailian → idealab-openai`，补 `--with pyyaml`
4. `.gitignore`：加入 `logs/`

## 5. 验证
- 手动喂 stdin 给 hook 脚本模拟 push，确认 marker 写入和日志输出
- opencode 下执行真 push，观察 `logs/external-review-gate.log` 有无记录
- 故意制造 `git push` 失败场景，确认日志有 FAIL 标记

## 6. 后续
（无）
