# Bug: Codex Stop hook 普通文本输出导致失败

## 现象

Codex turn 结束时，Stop hook 再次显示失败/异常反馈。当前 active 配置中 Stop hook
指向：

```text
bash "/Users/leshi.zhy/claude-config/codex/hooks/stop-verification.sh"
```

手动运行脚本可复现其输出：

```text
⚠️ 停止前确认：(1) 已运行验证命令并确认输出？(2) 有未提交变更？
exit=0
```

## 根因 (6 要素)

1. **触发条件**：Codex turn 结束，触发 `~/.codex/hooks.json` 里的 Stop hook。
2. **期望链路**：Stop hook 读取 Stop 事件 payload；无阻断时静默退出，或按 Codex
   支持的 Stop hook JSON 协议输出结构化结果。
3. **实际链路**：`codex/hooks/stop-verification.sh` 不读取 payload，也不输出 JSON，
   而是每次无条件向 stdout 输出一行普通中文提醒。
4. **关键假设失效**：脚本沿用了 Claude Code 风格“stdout 文本提醒”的写法；但 Codex
   hooks 对 Stop 事件 stdout 更严格，普通文本会被当作无效 hook 输出或异常反馈。
5. **旁证**：Codex 自带 `~/.codex/hooks/check-stop.sh` 明确只做审计并 `exit 0`，
   不向 stdout 输出；`~/.codex/hooks/audit-session.sh` 也注明非空 stdout 会被注入
   context，必须静默。
6. **实现偏差**：仓内 `claude/hooks/stop-verification.sh` 是条件输出；但
   `codex/hooks/stop-verification.sh` 被简化成无条件 `echo`，比 Claude 端更容易在
   每次 Stop 都触发宿主侧异常。

## 证据

- `bash -n codex/hooks/stop-verification.sh` 通过，说明不是 shell 语法错误。
- `printf ... | bash codex/hooks/stop-verification.sh` 返回 exit 0，但 stdout 非空。
- Codex 二进制字符串中存在：

```text
expected stop hook event, got
hook returned invalid ... hook JSON output
Stop hook requested continuation without a prompt; ignoring the block
```

这说明 Stop hook 输出会被宿主按事件/JSON 协议解析，而不是纯文本提示通道。

## 影响范围

- 每次 Codex turn 结束都可能显示 Stop hook 失败/异常反馈。
- 这不代表本轮命令或 push hook 失败；它发生在 turn 收尾阶段。
- 因为脚本每次都输出普通文本，重启 Codex 后仍会复现。

## 待确认修复方向

1. Codex 端 Stop hook 改为默认静默。
2. 如需提醒未验证/未提交变更，改成 Codex 支持的结构化 JSON 输出；如果协议不确定，
   先只记录到 stderr 或日志，不写 stdout。
3. 增加测试：Codex Stop hook 在无问题场景 stdout 必须为空、exit 0。

## 修复记录

- `codex/hooks/stop-verification.sh` 已改为消费 stdin 后静默退出，不再输出普通文本。
- Stop hook 不再承担频繁提示职责；“验证完成、未提交变更已处理”这类确认迁移到
  `shared/hooks/external-review-gate.sh`，只在 `git push` 前触发。
- 新增回归测试覆盖合法 Stop 事件 stdout 为空。
- 后续确认 Codex 侧 Stop hook 已无业务价值，已从 `codex/hooks.json` 与
  `init_codex.sh` required hook 列表移除，并删除
  `codex/hooks/stop-verification.sh`。
