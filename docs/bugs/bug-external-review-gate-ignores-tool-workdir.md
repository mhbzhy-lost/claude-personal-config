# Bug: external-review-gate 忽略 Bash tool workdir 导致跨仓 review 预算串用

## 现象

在一次同时涉及主仓 `claude-config` 和子仓 `vendor/opencode-cache-proxy` 的工作中，
external-review-gate 对 `git push` 拦截超过预期的两轮。用户预期最多两次 review
阻断，但实际多次触发新的异源 review，并不断把新的 Critical/Important 建议作为
blocking 输出。

本次过程里，子仓 push 已成功，主仓 push 仍被拦截。主仓 marker 显示：

```json
{
  "round": 1,
  "diff_hash": "3b5cb7439d651672",
  "head_sha": "ad8f3db0dd53a99e309a677c57aa9e95514f30e2"
}
```

这说明 review gate 在多次 push 尝试中重新进入了 Round 1，而不是稳定地按同一
目标仓库消费两轮预算后放行。

## 根因 (6 要素)

1. **触发条件**：Codex Bash tool 以 `workdir=/Users/leshi.zhy/claude-config/vendor/opencode-cache-proxy`
   执行裸命令 `git push origin main`，随后又在主仓执行裸 `git push origin main`。
2. **期望链路**：hook 应识别 Bash tool 的实际工作目录；子仓 push 使用子仓
   `.git/review-markers` 和子仓 ahead/diff，主仓 push 使用主仓 marker 和主仓
   ahead/diff，两者互不消费对方 review 预算。
3. **实际链路**：`shared/hooks/external-review-gate.sh` 只从命令文本解析
   `cd <path> && git push` 和 `git -C <path> push`，没有读取 `tool_input.parameters.workdir`
   或 `tool_input.workdir`。裸 `git push` 时，hook 进程以当前 hook CWD 推断目标仓库，
   容易落回主仓。
4. **关键假设失效**：hook 假定“命令文本能表达 git push 的实际目录”。这对
   Claude/Codex 的持久 shell 或带 `workdir` 参数的 exec 工具不成立；实际目录是
   tool 参数或宿主维护的执行上下文，不一定出现在命令字符串中。
5. **旁证**：`external-review-gate.sh` 当前仅读取 `params.command/cmd`，见
   `tool_input = payload.get("tool_input")` 与 `cmd = params.get("command") or params.get("cmd")`；
   后续有效仓库推断只看命令中的 `cd` / `git -C`，以及“主仓 ahead=0 时扫描有 pending
   commits 的 submodule”。当主仓也 ahead 时，子仓裸 push 不会进入 submodule 检测。
6. **影响范围**：所有通过 Codex/Claude 工具参数切换工作目录、但命令文本是裸
   `git push` 的场景。特别是“主仓和子仓都 ahead”时，子仓 push 可能误用主仓 marker；
   主仓 review round 可能被子仓 push 消费或覆盖，导致超过两轮的实际阻断体验。

## 非主因说明

`external-review-gate` 的“Round 2 后删除 marker，后续新 push 可重新进入 Round 1”
本身不是这次最主要问题。单仓场景下，这个行为最多意味着新的逻辑 push 会重新 review；
本次异常主要来自目标仓库识别错误，导致不同仓库的 push 混用同一 review 状态。

## 影响

- 子仓 push 和主仓 push 的 review 预算不隔离，用户看到的“最多两轮”约束失真。
- hook 可能对错误 diff 运行外源 review，提出与当前 push 目标不完全一致的问题。
- 子仓 push 成功后，主仓 marker 仍可能被改写为 Round 1，后续主仓 push 继续被阻断。
- agent 会被迫不断按新 review 建议修改，形成不必要的 review/fix 循环。

## 修复方案草案

优先修正有效仓库推断，而不是调整两轮预算规则：

1. 从 payload 中读取候选工作目录：
   - `tool_input.parameters.workdir`
   - `tool_input.workdir`
   - 必要时兼容 `cwd`
2. 当命令文本没有显式 `cd` / `git -C` 时，优先用 tool workdir 作为 `_effective`。
3. 使用 `_git_prefix = ["git", "-C", _effective]` 计算 ahead、diff、marker dir 和 remote
   slug，确保 marker 存在实际目标仓库。
4. 保留现有 submodule pending 扫描作为兜底，但它不应覆盖显式 workdir。
5. 增加回归测试：
   - 主仓和子仓都 ahead；
   - payload 为 `functions.exec_command` / `Bash`，命令为裸 `git push origin main`；
   - `tool_input.parameters.workdir` 指向子仓；
   - hook 必须使用子仓 marker，不得读写主仓 marker；
   - 子仓 Round 2 放行不能删除或覆盖主仓 marker。

## 验证方式

- 新增 hook 单测覆盖带 `workdir` 的裸 `git push`。
- 运行 `python3 codex/hooks/tests/test_codex_hooks.py`。
- 手工验证：
  - 在子仓 ahead、主仓 ahead 的状态下，对子仓执行裸 `git push` payload；
  - 检查 marker 写入 `vendor/opencode-cache-proxy/.git/review-markers/`；
  - 主仓 `.git/review-markers/` 不被改写。

## 修复记录

- `external-review-gate.sh` 在命令文本没有显式 `cd` / `git -C` 时，优先读取
  `tool_input.parameters.workdir`、`tool_input.workdir` 或 `cwd` 作为 effective repo。
- `cd` / `git -C` 仍保持更高优先级，避免命令文本显式指定目录时被 tool workdir 覆盖。
- 新增回归测试：
  - 主仓和嵌套子仓都 ahead；
  - payload 为 `functions.exec_command`，命令是裸 `git push origin main`；
  - `tool_input.parameters.workdir` 指向子仓；
  - marker 必须写入子仓 `.git/review-markers`，且不能消费主仓 marker。
- 顺手修正既有两轮预算测试的固定时间戳，避免 `2026-05-28T00:00:00Z` 超过
  24 小时 TTL 后导致测试随日期失效。
