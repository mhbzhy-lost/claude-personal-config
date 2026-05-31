# Qwen init 覆盖用户已有 SessionStart hook

**现象**：修复 `scripts/test-init-qwen-provider.sh` 的 `KeyError: 'name'` 后，脚本继续
失败在 `keep-session-start` 断言。手工复现发现执行 `init_qwen.sh` 后，临时
`settings.json` 中原本已有的 `SessionStart` hook `echo keep-session-start` 被删除。

**调用链**：测试脚本写入临时 `settings.json`，其中
`hooks.SessionStart[0].hooks[0].name=keep-session-start` → 执行 `init_qwen.sh` →
内嵌 Python 构造 `hooks` 字典，包含 `"SessionStart"` → 合并逻辑按 hook key
整体赋值：`existing_hooks[hook_key] = desired_hook_value` → 用户已有
`SessionStart` 被本仓 memory loader hook 覆盖 → cache proxy 配置入口再追加
`bailian-cache-proxy-start` → 最终配置只剩 memory loader 与 cache proxy start。

**根因假设**：

1. `init_qwen.sh` 注释写的是“本仓 hooks 完全覆盖，cache proxy provider /
   SessionStart / SessionEnd 交给 vendor 合并”，但实际把本仓 memory loader 也放进
   完全覆盖的 `hooks` 字典。
2. Qwen 的 `SessionStart` 常被多个系统共享，不能像 `PreToolUse` 那样作为本仓独占
   key 覆盖。
3. 测试脚本原本通过 `keep-session-start` 检查保留行为，但被无名 hook 的
   `KeyError` 提前遮蔽。

**验证方式**：

- 运行 `bash scripts/test-init-qwen-provider.sh`，修复 `hook["name"]` 后复现
  `AssertionError`。
- 使用临时目录手工执行 `init_qwen.sh` 并打印 `hooks.SessionStart`，结果只有
  memory loader 和 `bailian-cache-proxy-start`，没有 `keep-session-start`。
- 读取 `init_qwen.sh` 可见第 193 行附近把 `"SessionStart"` 放入完全覆盖 map。

**根因确认**：`init_qwen.sh` 对 `SessionStart` 使用了整体覆盖策略，误删用户或其它
系统管理的同事件 hook。

**影响范围**：所有已有自定义 `SessionStart` hook 的 Qwen Code 用户，重跑
`init_qwen.sh` 后会丢失这些 hook。cache proxy start hook 后续会被 vendor 重新加回，
但用户自定义 hook 不会恢复。

**修复方案要求**：

- 从完全覆盖的 `hooks` 字典中移除 `SessionStart`。
- 单独按 command upsert 本仓 memory loader hook，保留其它 `SessionStart` 条目。
- 继续清理旧的 `stop-verification.sh` Stop hook。
- 重新运行 `bash scripts/test-init-qwen-provider.sh`，确认 provider 与 hook 保留都通过。
