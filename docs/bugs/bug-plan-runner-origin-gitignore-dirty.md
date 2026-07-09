# bug: plan-runner 启动后 origin 留下未跟踪 .gitignore

## 现象

自然 single-stage smoke 中，plan-runner 已 `validated`，parent 也执行了 fast-forward merge、`git worktree remove` 和临时 branch 删除；但 origin workspace 的 `git status --short` 仍显示 `?? .gitignore`。parent 最终报告把它解释为“非本次改动”，但 runbook 要求 parent merge-back 后 origin workspace 必须 clean。

## 根因 (6 要素)

1. **触发条件**：在没有 `.gitignore` 的 clean origin repo 中调用 `start_plan_runner`。
2. **期望链路**：harness 创建 `.plan-runner-worktrees/<task>` linked worktree，但不改变 origin working tree；merge-back/cleanup 后 origin `git status --short` 应为空。
3. **实际链路**：`ensurePlanRunnerWorktreeIgnored()` 向 origin workspace 的 `.gitignore` 追加 `.plan-runner-worktrees/`，如果 `.gitignore` 原本不存在，就留下未跟踪 `.gitignore`。
4. **关键假设失效**：实现把 `.gitignore` 当作无害忽略配置；但 `.gitignore` 是工作区文件，新增或修改会污染 origin，并影响 terminal gate / parent merge-back clean 判定。
5. **旁证**：证据目录 `/var/folders/27/6bnn8n7d4px6s33fvdpns89c0000gn/T/opencode/plan-runner-natural-permission-smoke5-kS6TiK` 中 parent 已执行 `git merge --ff-only`、`git worktree remove`、`git branch -d`，但最终 `git status --short` 输出 `?? .gitignore`。
6. **影响范围**：任何没有预置 `.gitignore` 或不希望 harness 修改 `.gitignore` 的 repo，都会在启动 plan-runner 后变 dirty，破坏“origin clean before/after merge-back”的契约。

## 修复方向

把 harness 自有 worktree ignore 写入本地 repo 的 `.git/info/exclude`，而不是工作区 `.gitignore`。`info/exclude` 不进入 worktree diff，能避免 `.plan-runner-worktrees/` 被 status 展示，同时不污染用户文件。

## 修复记录

- `userconf/plugins/plan-runner-harness.js`：`ensurePlanRunnerWorktreeIgnored()` 改为通过 `git rev-parse --path-format=absolute --git-path info/exclude` 定位本地 exclude 文件，并追加 `.plan-runner-worktrees/`；不再写 origin workspace 的 `.gitignore`。
- `userconf/plugins/test/plan-runner-harness.test.mjs`：更新 `start_plan_runner` harness-owned worktree 测试，断言 `.gitignore` 不被创建、`.git/info/exclude` 包含 ignore entry、`git status --porcelain` 不出现 `.gitignore` 或 `.plan-runner-worktrees/`。

## 验证

- RED：`node --test --test-name-pattern "start_plan_runner creates a harness-owned run worktree" "userconf/plugins/test/plan-runner-harness.test.mjs"` 失败，旧实现创建了 `.gitignore`。
- GREEN：同一命令通过。
- LIVE：`/var/folders/27/6bnn8n7d4px6s33fvdpns89c0000gn/T/opencode/plan-runner-dag-contract-smoke-K62R7J` 完成 parent merge-back 后，origin `git status --short` 为空，未残留未跟踪 `.gitignore`。
