# Bug: external-review-gate 因无关 dirty tree 阻止已提交内容 push

## 现象

在 `vendor/opencode-cache-proxy` 子仓中已完成并提交：

```text
34d49cb feat(opencode): 增强缓存命中观测归因
```

该提交已经通过验证：

- `npm test -- test/cache-stats.test.mjs`: 5/5 pass
- `npm test`: 187/187 pass

但执行 `git push origin main` 时，`shared/hooks/external-review-gate.sh` 拦截：

```text
🚫 禁止 push。检测到工作区仍有未提交变更。
检测到：
  unstaged: 1 file changed, 22 insertions(+), 3 deletions(-).
```

被检测到的 dirty 内容是同一子仓里已有的无关本地改动：

```text
 M README.md
?? install-opencode.sh
?? proxy/test/install-opencode.test.mjs
```

这些文件不是本次待 push commit 的内容，也不应被本次 push 自动提交或回滚。

## 根因（6 要素）

1. **触发条件**：目标仓库已有一个或多个待 push commit，同时工作区存在与待 push
   commit 无关的 unstaged tracked diff。
2. **期望链路**：push gate 应审查“即将推送的提交范围”
   `upstream..HEAD`，并对该范围运行验证 / review；无关 unstaged 文件应保留在本地，
   不应阻止已提交内容 push。
3. **实际链路**：`external-review-gate.sh` 在确认 `ahead > 0` 后调用
   `_working_tree_summary()`，只要目标仓库存在 staged 或 unstaged diff 就直接 deny。
4. **关键假设失效**：hook 假定“push 前工作区必须干净”才能避免漏推未验证内容。
   但 git push 只推 commit，不推工作区；dirty tree 可能是预期保留的用户改动、
   其他任务草稿或未完成变更。
5. **旁证**：本次待 push commit 已独立提交并通过测试；dirty 文件未 staged，
   不在 `34d49cb` 的 diff 内。阻塞 push 不会提升该 commit 的安全性，只会迫使 agent
   处理无关本地状态。
6. **影响范围**：所有“已提交可推送内容 + 同仓存在无关 dirty 文件”的场景。
   在子模块和多任务工作区尤其常见；agent 不能提交或回滚用户改动时，会被卡在 push
   gate。

## 非主因说明

这次和 `bug-external-review-gate-ignores-tool-workdir.md` 相关但不是同一个问题：

- `ignores-tool-workdir` 关注的是 hook 推断错目标仓库。
- 本 bug 关注的是：即使目标仓库推断正确，dirty tree 检查也不应作为 push 的硬前置条件。

临时 clone 可以绕过 dirty tree，但那只是规避本地状态，不是正确的 hook 行为。

## 影响

- 已验证、已提交的改动无法 push。
- agent 可能被诱导提交或回滚无关 dirty 文件，违反“不处理用户改动”的约束。
- 多任务工作区中，push gate 从“保护待推送提交”变成“要求工作区全局干净”，范围过大。
- 子模块中更明显：外层或子仓里的草稿改动会阻塞另一个已经完成的提交同步。

## 修复方案草案

不要把 dirty tree 作为 `git push` 的硬拦截条件。可选方案：

1. **推荐**：删除 `_working_tree_summary()` 的 deny gate，仅对 `base_ref..HEAD`
   的提交 diff 运行 review。
2. 如果仍想提示 dirty tree，把它降级为 warning/log，不改变 push 放行决策。
3. 对 staged changes 可保留更强提示，但不应硬拦截 push；staged 未提交内容同样不会被
   push。
4. 增加测试覆盖：
   - repo ahead 1 commit；
   - 另有 unstaged tracked diff；
   - hook payload 为 `git push`；
   - 期望不会因 dirty tree deny，而是继续进入后续 review / marker 逻辑或放行。

## 验证方式

- 新增 `codex/hooks/tests/test_codex_hooks.py` 回归测试，构造 ahead commit +
  unstaged dirty tree。
- 运行：

```bash
python3 codex/hooks/tests/test_codex_hooks.py
```

- 手工验证：
  - 在任一测试 repo 中提交一个待 push commit；
  - 修改另一个 tracked 文件但不提交；
  - 触发 `external-review-gate.sh`；
  - 确认 hook 不再因为 dirty tree 本身 deny。

## 修复记录（2026-06-02）

- 删除 `external-review-gate.sh` 中 push 前的 dirty tree 硬拦截。
- 保留后续既有 gate：
  - 无待 push commit 时静默放行；
  - 最近测试失败 marker 仍阻断；
  - 无 reviewer `.env` 时按既有 degraded allow；
  - 有 reviewer 配置时继续对 `base_ref..HEAD` 的提交 diff 做异源 review。
- 更新回归测试：
  - 原 `blocks_tracked_dirty_tree_before_push` 改为
    `allows_tracked_dirty_tree_before_push_review`；
  - 构造 ahead commit + tracked unstaged diff；
  - 断言 hook 不再因为 dirty tree 输出 deny。

## 修复后验证

```bash
python3 -m unittest codex.hooks.tests.test_codex_hooks
```

结果：

```text
Ran 66 tests in 78.451s

OK
```
