# Bug: hook 日志重定向不可写导致准入输出丢失

## 现象

`python3 -m unittest codex.hooks.tests.test_codex_hooks` 中 skill preflight
相关用例拿到空 stdout，`json.loads(output)` 失败。手动运行 wrapper 时可复现：

```text
codex/hooks/skill-resolve-preflight.sh: line 20: /Users/leshi.zhy/.codex/logs/skill-resolve-preflight.log: Operation not permitted
```

## 根因 (6 要素)

1. **触发条件**：在沙箱或目标 HOME 日志目录不可写的环境里运行
   `codex/hooks/skill-resolve-preflight.sh` / `claude/hooks/skill-resolve-preflight.sh`。
2. **期望链路**：日志不可写只影响审计日志；hook 仍应读取 payload，按共享 policy
   输出 allow/deny JSON。
3. **实际链路**：脚本把 Python stderr 直接 `2>>"$LOG_FILE"`；打开日志文件失败时，
   shell 在执行 Python 前就失败，导致 `RESPONSE` 为空。
4. **关键假设失效**：脚本假定 `$HOME/.codex/logs` / `$HOME/.claude/logs` 总是可写。
   Codex 沙箱和单元测试环境不保证这一点。
5. **旁证**：旧日志里可看到正常 allow/deny 记录；当前沙箱下同一 wrapper 只输出
   `Operation not permitted`，没有 JSON。
6. **实现偏差**：日志是辅助路径，却被实现成了主判定链路的前置依赖。

## 影响范围

- Codex/Claude skill preflight 在日志不可写时失效，可能放行缺少 tag 的
  `mcp__skill-catalog__resolve` 调用。
- 单元测试在 workspace-write 沙箱下稳定失败。

## 修复方向

- 日志写入必须 best-effort：不可写时降级到 `/dev/null`。
- `log()` 自身也要吞掉重定向错误，不能向 stdout/stderr 泄漏。
- 保持共享 policy 与 allow/deny JSON 行为不变。

## 修复记录

- Codex/Claude skill preflight wrapper 在日志目录不可写时会把 `LOG_FILE` 降级为
  `/dev/null`。
- `log()` 写入使用 best-effort 重定向，不再让审计日志失败影响 hook 主判定。
