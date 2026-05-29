# Bug: Codex PreToolUse hook 不支持显式 allow

## 现象

`git push` 第三轮 review 已经通过时，Codex 侧仍报告 hook 失败：

```text
PreToolUse hook (failed)
error: PreToolUse hook returned unsupported permissionDecision:allow
```

## 根因 (6 要素)

1. **触发条件**：PreToolUse hook 判断应放行工具调用，并向 stdout 输出
   `{"permissionDecision":"allow"}`。
2. **期望链路**：放行路径应对调用方透明。对 Codex hook runtime 来说，透明放行应是
   空 stdout + exit 0。
3. **实际链路**：`shared/hooks/external-review-gate.sh` 与
   `codex/hooks/skill-resolve-preflight.sh` / `claude/hooks/skill-resolve-preflight.sh`
   在 allow 分支输出了 Claude Code 风格的结构化 allow。
4. **关键假设失效**：早期认为所有 PreToolUse 宿主都接受
   `permissionDecision=allow`。实测 Codex 不支持该值，只接受 deny 等阻断结果；
   allow 必须静默通过。
5. **旁证**：
   - review gate 前两轮返回 `deny` 时可正常展示 review 内容；
   - 第三轮 review 通过才首次走 allow 分支，随即报 unsupported
     `permissionDecision:allow`；
   - 仓内 `codex/hooks/git-commit-hint.sh` 的 escape hatch 已使用空输出放行。
6. **影响范围**：所有 Codex PreToolUse hook 的显式 allow 分支都可能导致 hook
   runtime 报错；push review gate 与 skill resolve preflight 均受影响。

## 修复方向

清理实际 hook 脚本中的显式 `permissionDecision=allow`：

- 外部 review gate 的 `allow()` 改为静默通过；
- Codex / Claude skill preflight 的有 tag 分支改为空输出；
- 测试锁定“allow 分支 stdout 为空”，避免回退。

OpenCode 权限配置中的 `"allow"` 是另一个系统的静态权限规则，不属于本 bug。
