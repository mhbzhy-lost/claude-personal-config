# Bug: Review Gate 被子仓 git push 绕过

## 现象

在子仓 `vendor/opencode-cache-proxy` 中执行 `git push`，external-review-gate
hook 未拦截，push 直接成功。3002 行 .mjs 代码变更未经 review。

## 根因 (6 要素)

1. **触发条件**: Bash tool CWD 在子仓目录，执行裸 `git push`（无 cd 前缀）
2. **机制**: Claude Code 的 PreToolUse hook 作为独立进程 spawn，CWD = 项目根目录
   (`/Users/leshi.zhy/claude-config`)，而非 Bash tool 维护的虚拟 CWD
3. **链条**: hook 中 `git rev-parse --show-toplevel` → 主仓 → `git rev-list
   origin/main..HEAD` → 0 commits → `silent()` 放行
4. **关键假设失效**: hook 假定自身 CWD = git push 实际执行目录，但 Claude Code
   Bash tool 的 CWD 是内部追踪的（persistent shell session），hook 进程不继承
5. **payload 限制**: PreToolUse stdin payload 只有 `{tool_name, tool_input:{command,
   description}, session_id, tool_use_id}`，**无 cwd 字段**
6. **影响范围**: 所有通过 Bash tool CWD 切换（非 cd 前缀）进入子仓的 git push

## 修复方案

**从命令文本中提取目标仓库**：

1. 解析 `cd /path && git push` / `cd /path; git push` 中的 cd 目标
2. 解析 `git -C /path push` 中的 -C 参数
3. 若上述都没有（裸 `git push`），检查主仓是否有 submodule，且 submodule 有
   pending commits → 对那些 submodule 执行 review
4. 最终兜底：裸 push + 主仓 0 commits + 无可检测 submodule → 记录 warning 但放行

**不可完美修复的场景**：裸 `git push` 且 CWD 不在任何已注册 submodule 中（如手动
clone 的仓库放在 vendor/ 但未作为 git submodule 注册）。该场景只能通过
Claude Code 在 hook payload 中传递 Bash tool CWD 来根治。
