# Bug: Codex push review gate 未生效

## 现象

在 Codex 中执行 `git push` 后，远端 `main` 成功更新：

```text
6445c5c..14c8ec1  main -> main
```

预期中的 `external-review-gate` 没有输出 statusMessage、stderr 日志、deny 文案，
也没有生成或复用 review marker。push 未经过异源 review gate。

## 根因 (6 要素)

1. **触发条件**：仓内已提交 `codex/hooks.json` 和 `init_codex.sh` 中的
   `shared/hooks/external-review-gate.sh` 注册，但当前 Codex session 直接执行
   `git push`。
2. **期望链路**：Codex PreToolUse 读取 `~/.codex/hooks.json` →
   matcher `Bash` 命中 shell 命令 → 调用
   `shared/hooks/external-review-gate.sh` → 检测 `git push` → 执行/复用异源
   review marker。
3. **实际链路**：当前 `~/.codex/hooks.json` 仍是 2026-05-23 旧配置，只包含
   `skill-resolve-preflight`、`git-commit-hint`、`.r2c` shell hook 和
   `external-llm-review-permission`，没有 `external-review-gate` 条目。
4. **关键假设失效**：提交仓内 `codex/hooks.json` 只更新模板；Codex 运行时实际读取
   `~/.codex/hooks.json`，必须通过 `init_codex.sh` 渲染/同步后才会生效。
5. **旁证**：执行包含 `git commit` 文本的无害命令仍被当前 git-commit hook 阻断，
   证明 Codex hook 系统在工作；只是 active 配置没有新 push gate。
6. **潜在二次失效点**：即使同步了新配置，`external-review-gate.sh` 当前只接受
   `tool_name in ("Bash", "run_shell_command")`。手动传入 `functions.exec_command`
   或 `exec_command` payload 会静默返回空输出；而 Codex API 工具面可能使用这些
   tool_name。

## 证据

排查时 active 配置：

```text
~/.codex/hooks.json: May 23 16:38:20 2026
PreToolUse Bash -> codex/hooks/git-commit-hint.sh
PreToolUse Bash -> ~/.r2c/scripts/codex-shell-hook.sh
```

仓内模板：

```text
codex/hooks.json: May 28 14:32:49 2026
PreToolUse Bash -> shared/hooks/external-review-gate.sh
Stop -> codex/hooks/stop-verification.sh
```

手动 payload 验证：

```text
Bash: allow + "[external-review-gate] no .env configured, degraded allow"
run_shell_command: allow + "[external-review-gate] no .env configured, degraded allow"
functions.exec_command: stdout=''
exec_command: stdout=''
```

## 影响范围

- 当前 Codex session 的 `git push` 不会触发异源 review gate。
- 任何只改仓内 `codex/hooks.json` 但未同步到 `~/.codex/hooks.json` 的 hook 变更都
  不会在 Codex 运行时生效。
- 同步后仍需确认 Codex 实际传给 hook 的 `tool_name`，否则 push gate 可能继续因
  白名单不匹配而静默放行。

## 待确认修复方向

1. 先让 `init_codex.sh` 重新渲染 `~/.codex/hooks.json`，并确认 Codex 是否需要重启
   session 才重新加载 hooks。
2. 扩展 `external-review-gate.sh` 的 tool_name 白名单，至少与
   `codex/hooks/git-commit-hint.sh` 对齐：`Bash`、`exec_command`、
   `functions.exec_command`。
3. 增加离线回归测试：同一 `git push` payload 分别用 `Bash`、`run_shell_command`、
   `exec_command`、`functions.exec_command`，都不能静默跳过命令检测。

## 修复记录

- 已将当前 `~/.codex/hooks.json` 与仓内 `codex/hooks.json` 合并同步，保留既有
  `.r2c` hooks，并补入 `shared/hooks/external-review-gate.sh`。
- `shared/hooks/external-review-gate.sh` 已兼容 Codex API 侧可能出现的
  `exec_command`、`functions.exec_command` 工具名。
- 命令字段同时兼容 `command` 与 `cmd`，覆盖 `functions.exec_command` payload。
- 已新增回归测试覆盖 `Bash`、`run_shell_command`、`exec_command`、
  `functions.exec_command` 四类工具名。
- push gate 现在在检测到待 push commit 且 tracked 工作区仍有未提交变更时阻断，
  提示先运行验证并提交/处理本地变更；untracked-only 本地草稿不阻断，Stop hook 因
  过于频繁改为静默。
