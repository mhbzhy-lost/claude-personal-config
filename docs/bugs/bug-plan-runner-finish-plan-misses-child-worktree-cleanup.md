# bug: finish_plan 未检测残留 child worktree

## 现象

plan-runner 可以派发 harness-managed child subagent，child 在独立 git worktree 中完成工作后，如果 root plan-runner 没有把 child worktree 的改动合并回主工作区并清理 worktree，`finish_plan` 目前只检查主工作区 commit 边界，缺少残留 child worktree 检测。

## 根因 (6 要素)

1. **触发条件**：plan-runner 派发普通 executor child，child session 已完成，`child_sessions[]` 仍记录 `worktree` 路径。
2. **期望链路**：root plan-runner 在调用 `finish_plan` 前必须完成三件事：合并 child worktree 产物、创建 root commit、清理 child worktree。
3. **实际链路**：`gitCommitBoundaryFailures()` 只检查 root repo 是否 clean、HEAD 是否相对 base 有 diff，以及当前是否 linked worktree。
4. **关键假设失效**：实现假设 child worktree 只是执行隔离，不是 terminal gate 的必须清理资源；实际 child 的真实产物可能只留在 child worktree。
5. **旁证**：live smoke 已证明 child idle 回流能把 child 标为 completed，但 terminal gate 只因 root dirty/未 commit 失败；若 root 恰好 clean 且已有 commit，残留 child worktree 会被漏过。
6. **影响范围**：任何使用 child worktree 的 plan-runner 任务都可能在没有合并 child 产物、也没有清理 worktree 的情况下进入 review loop，导致子任务白做或证据与最终提交不一致。

## 修复方向

把 child worktree 清理纳入 `finish_plan` 的 deterministic commit boundary：只要 `child_sessions[]` 中普通 child 仍有存在于磁盘或仍被 `git worktree list` 注册的 `worktree`，就返回 `plan_runner_requires_child_worktree_cleanup`，阻止进入 audit/external review。

## 验证

- RED：构造 root repo 已提交且 clean、child session completed 但 child worktree 仍存在，`finish_plan` 应返回 cleanup failure；当前实现会进入 audit review。
- GREEN：增加 child worktree residual 检测后，focused test、plan-runner harness 全量测试和全量 node 测试通过。
