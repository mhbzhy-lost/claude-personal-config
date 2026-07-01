# plan-runner external review dirty worktree scope

## 现象

plan-runner 在 dirty 主工作区中启动时，external review 会审到派发前已经存在的未提交改动。
此前 live smoke 中，external review 返回了与 smoke 任务无关的 findings，导致 `finish_plan`
进入 `repair_required`，而不是只针对本次 plan-runner 的改动给出结论。

## 影响

- 主工作区已有未提交改动时，plan-runner 的 review 结果会被非本次任务变更污染。
- plan-runner 可能被要求修复不属于当前 plan 的文件，扩大 scope 并破坏人审边界。
- 在 `git worktree add` 创建的 linked worktree 中启动 plan-runner 时，当前 harness 也不会阻断，容易把用于并发 subagent 的隔离工作区误当成新的 plan-runner 主工作区。
- external review 的范围语义依赖 dirty diff，而不是清晰的 commit range，难以长期维护。

## 复现

1. 在主工作区保留任意未提交改动。
2. 从该主工作区派发 `plan-runner`。
3. plan-runner 修改一个很小的文件并调用 `finish_plan`。
4. 当前 harness 调用 reviewer 时使用 `git_base WORKTREE --worktree <repo>`。
5. reviewer 看到的是 `git_base..WORKTREE` 的全部 dirty diff，其中包含派发前已有改动。

## 根因

- harness 只在派发时记录 `git_base = HEAD`，没有要求启动时 repo clean。
- external review 使用 `WORKTREE` 作为目标，天然包含所有未提交变更。
- harness 没有区分普通主工作区和 `git worktree add` 创建的 linked worktree。
- `modified_files` / `evidence` 记录的是 harness 观察到的执行事实，但 external review 没有、也不应该用这些自建记录来定义评审范围。

## 修复方案

- 将一次 plan-runner run 的边界定义为 Git commit range：`base_commit..HEAD`。
- dispatch preflight 阶段阻断 linked worktree 中的 plan-runner 派发。
- dispatch preflight 阶段要求 repo clean；dirty 时阻断并把处理权交回主 agent/用户。
- `finish_plan` deterministic check 要求 repo clean、`HEAD != base_commit`、`base_commit..HEAD` 有 diff。
- external review 调用改为 `reviewer.py <base_commit> HEAD --worktree <repo>`，禁止使用 `WORKTREE` dirty diff。
- 不新增 task-scoped snapshot、task patch 或独立文件内容缓存机制。

## 验证

- 先写 RED 测试覆盖 dirty repo dispatch 阻断。
- 先写 RED 测试覆盖 linked worktree dispatch 阻断。
- 先写 RED 测试覆盖 `finish_plan` 在未提交或 dirty 状态下返回 deterministic failure。
- 先写 RED 测试覆盖 external review 参数为 `base_commit HEAD` 而不是 `WORKTREE`。
- GREEN 后运行完整 node test、syntax check、`git diff --check`。
- 重启 OpenCode 后跑 commit-boundary live smoke，核验 `task_validated` 和 external review commit range。

## 预防

- plan-runner 的 external review 范围只允许由 Git commit range 定义。
- harness 的 evidence/todo/audit 可用于完成度检查，但不能定义 external review 范围。
- 任何试图新增独立 snapshot/patch 机制的改动都应视为 scope drift。
