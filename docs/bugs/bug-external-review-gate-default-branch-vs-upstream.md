# Bug: external-review-gate 用远端默认分支误判当前分支待 push

## 现象

`/Users/leshi.zhy/Documents/ding-doc-mcp` 在 `main` 分支执行 `git push` 时，
external-review-gate 仍持续触发外源 review。用户观察到已经四五轮 review，
不符合“最多两轮 review，之后放行”的设计。

当前仓库状态显示：

```text
## main...origin/main
```

也就是当前分支相对 upstream `origin/main` 没有待 push commit。但 hook 仍进入
review gate。

## 根因 (6 要素)

1. **触发条件**：目标仓库远端默认分支是 `origin/master`，当前工作分支是
   `main`，且 `main` 已与 `origin/main` 对齐。
2. **期望链路**：执行 `git push` 时，hook 应按当前分支的 upstream 判断是否有待
   push commit；`origin/main..HEAD == 0` 时应静默退出。
3. **实际链路**：`shared/hooks/external-review-gate.sh` 使用
   `git rev-parse --abbrev-ref origin/HEAD` 得到 `origin/master`，再用
   `origin/master..HEAD` 判断 ahead 和生成 diff。
4. **关键假设失效**：代码假设“远端默认分支”就是“当前 push 的比较基线”。在
   ding-doc-mcp 这种 `master` 和 `main` 同时存在、当前分支 upstream 是
   `origin/main` 的仓库中，这个假设不成立。
5. **旁证**：
   - `git rev-parse --abbrev-ref origin/HEAD` 输出 `origin/master`。
   - `git rev-list origin/main..HEAD --count` 输出 `0`。
   - `git rev-list origin/master..HEAD --count` 输出 `25`。
   - 用无 `.env` 的 hook 探针执行
     `git -C /Users/leshi.zhy/Documents/ding-doc-mcp push`，hook 没有静默退出，
     而是继续走到 `no .env configured, degraded allow`，证明它认为存在待 review
     diff。
6. **实现偏差**：review 预算状态机本身能处理 Round 2 后放行，但在“当前分支其实
   没有待 push”的场景中，前置 ahead 判断已经错了，导致 marker 删除后下一次 push
   又被当成新 review 周期。

## 影响范围

- 远端默认分支与当前分支 upstream 不一致的仓库。
- `main` / `master` 双分支并存，且 `origin/HEAD` 指向另一个分支的仓库。
- 已完成 push 后再次执行 `git push`，仍可能触发外源 review，造成看起来无限循环。

## 修复原则

hook 的比较基线应优先使用当前分支 upstream，而不是远端默认分支：

- 优先读取 `@{u}` 或 `git rev-parse --abbrev-ref --symbolic-full-name @{u}`。
- 如果当前分支没有 upstream，再回退到 `origin/HEAD`。
- ahead 判断、diff stat、diff hash、reviewer base ref 必须使用同一个 base ref。
- 增加回归测试：构造 `origin/master` 为默认分支、当前 `main` 跟踪
  `origin/main` 且 ahead 为 0 的仓库，hook 应静默退出，不调用 reviewer。

## 待确认

是否按上述原则修复 `shared/hooks/external-review-gate.sh`，并补充共享 hook 回归测试。

## 修复记录

- `shared/hooks/external-review-gate.sh` 的 base ref 选择改为优先读取当前分支
  upstream `@{u}`；读取失败时才回退到 `origin/HEAD`，最后回退 `origin/main`。
- ahead 判断、diff stat、diff hash、reviewer base ref、marker `base_ref` 已统一使用
  同一个 `base_ref`。
- 新增回归测试覆盖：`origin/HEAD` 指向 `master`，当前 `main` 跟踪 `origin/main`
  且 ahead 为 0 时，hook 不调用 reviewer。
