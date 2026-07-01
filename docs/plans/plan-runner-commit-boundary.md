# Plan Runner Commit Boundary 改造计划

## 背景

当前 `plan-runner` harness 在派发时记录 `git_base = HEAD`，但 external review 仍使用
`git_base..WORKTREE` 的 dirty diff 作为评审输入。只要 repo 在派发前已经存在未提交改动，
external review 就会审到本次 plan-runner 之外的变更。

本轮改造要把 plan-runner 的天然边界收敛为 Git commit range：一次 plan-runner run
对应 `base_commit..HEAD`。harness 不再尝试通过独立快照、文件列表或自建 patch 机制定义
external review 范围。

## 目标

- plan-runner 只能从主工作区启动，不能在 `git worktree add` 创建的 linked worktree 中启动。
- plan-runner 启动时目标 repo 必须 clean；如果不 clean，harness 直接阻止派发，把处理权交回主 agent/用户。
- harness 只记录起始 commit，并用 Git commit range 表达本次 plan-runner 的改动范围。
- external review 必须审 `base_commit..HEAD`，禁止审 `WORKTREE` dirty diff。
- `finish_plan` 前要求 plan-runner 已把本次改动落入本地 commit，且 repo 重新回到 clean 状态。

## 非目标

- 不自动提交派发前已有 dirty changes。
- 不让 harness 自建 task-scoped snapshot、task patch 或文件内容缓存。
- 不让 external review 依赖 harness 的 `modified_files` / `evidence` 来判定评审范围。
- 不在 plan-runner 内 push；只允许生成本地 commit。
- 不在本轮重写 todo/evidence/audit 的基础能力；它们继续服务 deterministic check 和 audit review，但不定义 external review 范围。

## 术语

- 主工作区：普通 repo checkout，是允许启动 plan-runner 的位置。
- linked worktree：通过 `git worktree add` 创建的额外工作区，plan-runner 禁止在这里启动。
- `base_commit`：plan-runner 派发前记录的 `HEAD`。
- plan range：`base_commit..HEAD`，external review 的唯一范围来源。

## 目标流程

1. 主 agent 调用 `task(background=true, subagent_type=plan-runner)`。
2. harness 在 `tool.execute.before(task)` 做 dispatch preflight。
3. preflight 检查当前目录位于 Git repo 内，并识别 repo root / git dir / common dir。
4. 如果当前 repo 是 linked worktree，harness 阻止派发并返回结构化错误。
5. 如果当前 repo 不 clean，harness 阻止派发并返回结构化错误。
6. preflight 通过后，harness 记录 `base_commit = HEAD` 并创建 task-state。
7. plan-runner 正常 `write_plan`、同步 todo、执行任务、运行本地验证。
8. plan-runner 在调用 `finish_plan` 前创建本地 commit；repair 阶段可追加 commit 或 amend，但最终范围始终是 `base_commit..HEAD`。
9. `finish_plan` deterministic check 要求当前 repo clean、`HEAD != base_commit`、`base_commit..HEAD` 有 diff。
10. audit review 继续检查 plan/todo/evidence/modified files 是否满足 contract。
11. external review 调用 reviewer 时使用 `base_commit HEAD --worktree <repo>`。
12. `finish_plan` 只有在 deterministic、audit、external review 都通过后才返回 `validated`。

## Harness 报错语义

dispatch preflight 失败时，harness 应阻止 task 派发，而不是让 plan-runner 自己运行后再发现。

linked worktree 阻断：

```json
{
  "code": "plan_runner_disallowed_linked_worktree",
  "message": "plan-runner must start from the primary repo checkout, not a linked git worktree",
  "repo_root": "...",
  "git_dir": "...",
  "git_common_dir": "..."
}
```

dirty repo 阻断：

```json
{
  "code": "plan_runner_requires_clean_repo",
  "message": "plan-runner requires a clean repo at dispatch; commit or clear existing changes first",
  "repo_root": "...",
  "status_porcelain": "..."
}
```

finish_plan 阶段 dirty repo 阻断：

```json
{
  "code": "plan_runner_requires_clean_repo_before_review",
  "message": "plan-runner must commit all scoped changes and leave the repo clean before finish_plan can run review",
  "repo_root": "...",
  "status_porcelain": "..."
}
```

finish_plan 阶段无 commit 阻断：

```json
{
  "code": "plan_runner_requires_commit_range",
  "message": "plan-runner must create at least one local commit before external review",
  "base_commit": "...",
  "head": "..."
}
```

## 实施清单

- DONE: 增加 Git preflight helper：解析 repo root、git dir、common dir、HEAD、porcelain status。
- DONE: 增加 linked worktree 判定；在 linked worktree 中派发 plan-runner 时阻断并记录 `dispatch_blocked` event。
- DONE: 增加 dispatch clean check；repo dirty 时阻断派发，并把 `status_porcelain` 返回给主 agent。
- DONE: 将 task-state 字段从 `git_base` 语义收敛为 `base_commit`，兼容读取旧 state 但新 state 用 commit boundary 命名。
- DONE: 更新 `plan-runner` agent 指令：执行完成和验证通过后必须创建本地 commit，再调用 `finish_plan`；禁止 push。
- DONE: 更新 phase gate 或权限说明，允许 plan-runner 执行必要的 `git status`、`git diff`、`git add`、`git commit`，但仍禁止 push。
- DONE: 在 `finish_plan` deterministic check 中要求 repo clean、`HEAD != base_commit`、`base_commit..HEAD` 有 diff。
- DONE: 将 external review 调用从 `base WORKTREE --worktree <repo>` 改为 `base_commit HEAD --worktree <repo>`。
- DONE: 确认 repair loop 策略：repair 后允许追加 commit 或 amend，external review 始终审 `base_commit..HEAD`。
- DONE: 更新 audit prompt / runbook / knowledge 文档，明确 evidence 不定义 external review 范围。
- DONE: 增加单测覆盖 clean repo 派发、dirty repo 阻断、linked worktree 阻断、finish_plan 未提交阻断、finish_plan dirty 阻断、external review commit range 参数。
- DONE: 增加 live smoke：从 clean 主工作区启动 plan-runner，生成本地 commit，验证 `task_validated` 且 external review 输入为 commit range。

## 验证计划

- DONE: RED：先写 dispatch dirty repo 阻断测试，确认当前实现会错误允许派发。
- DONE: RED：先写 linked worktree 阻断测试，确认当前实现会错误允许派发。
- DONE: RED：先写 external review 参数测试，确认当前实现仍传 `WORKTREE`。
- DONE: GREEN：实现最小 harness 改动让上述测试通过。
- DONE: 运行 `node --test "userconf/plugins/test"/*.mjs "scripts/test/opencode-subagent-event-probe.test.mjs"`。
- DONE: 运行 `node --check "userconf/plugins/plan-runner-harness.js"`。
- DONE: 运行 `node --check "scripts/opencode-subagent-event-probe.mjs"`。
- DONE: 运行 `git diff --check`。
- DONE: 重启 OpenCode 后跑 commit-boundary live smoke，并核验 task-state/events/DB。

## 完成判定

- DONE: dirty 主工作区中派发 plan-runner 会被 harness 阻断，主 agent 能看到明确错误。
- DONE: linked worktree 中派发 plan-runner 会被 harness 阻断，错误包含判定依据。
- DONE: clean 主工作区中 plan-runner 能完成本地 commit 并调用 `finish_plan`。
- DONE: external review 的输入范围只来自 `base_commit..HEAD`。
- DONE: `finish_plan` 返回 `validated` 后，最终报告晚于 `task_validated`。
- DONE: 文档同步说明 commit boundary 是唯一 external review 范围来源。
