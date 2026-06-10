# Bug: Codex hooks 渲染覆盖非托管配置

## 现象

`init_codex.sh` 渲染 `~/.codex/hooks.json` 时直接用仓内 `codex/hooks.json`
模板覆盖目标文件。用户或其他工具写入的非本仓 hook 会被删除。

## 根因 (6 要素)

1. **触发条件**：`~/.codex/hooks.json` 已存在第三方或用户自管 hook，随后执行
   `bash init_codex.sh`。
2. **期望链路**：脚本只更新本仓管理的 Codex hooks；未被本仓管理的事件和 hook
   条目原样保留。
3. **实际链路**：`render_hooks_json` 只做模板路径替换，然后 `write_text` 写入
   `HOOKS_OUTPUT`。
4. **关键假设失效**：实现假设 `~/.codex/hooks.json` 是本仓独占文件；实际 Codex
   hook 文件也可能由用户、桌面插件或其他工具共同维护。
5. **旁证**：本机 `~/.codex/hooks.json` 中存在 `.r2c` 的 `PreToolUse`、
   `PostToolUse` 和 `PostToolUseFailure` hook；仓内模板没有这些条目。
6. **实现偏差**：脚本没有给本仓托管 hook 建立可识别边界，也没有在渲染时区分
   managed 与 unmanaged 条目。

## 影响范围

- 重跑 `init_codex.sh` 可能删除其他工具的 hook。
- 仓内新增的 `SubagentStart` hook 可以通过重跑 init 恢复，但会以丢失第三方 hook
  为代价。
- 用户无法从脚本行为判断哪些配置会被替换、哪些会保留。

## 修复原则

- 仓内模板中的 hook 条目视为 `claude-config` 托管条目。
- 渲染时只替换同一事件下的本仓托管条目，保留非托管条目。
- 如果目标文件不存在或不是合法 JSON，允许从模板生成完整托管配置。
- 托管边界应由命令路径或显式标记稳定识别，不能依赖列表位置。
