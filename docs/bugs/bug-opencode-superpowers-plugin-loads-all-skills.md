# Bug: OpenCode 通过 vendor/superpowers plugin 加载全部 Superpowers skills

## 现象

OpenCode 启动时会加载 `file:///Users/leshi.zhy/claude-config/vendor/superpowers`
plugin。该 plugin 会让 OpenCode 发现并加载整包 Superpowers skills，日志里出现
`vendor/superpowers/skills/*` 与 `~/.agents/skills/*` 的 duplicate skill warning。

这不符合当前策略：Codex / OpenCode 中只应通过 `~/.agents/skills` 暴露经过选择的
native skill fallback，而不是把 `vendor/superpowers` 整包作为 OpenCode plugin 暴露。

## 根因 (6 要素)

1. **触发条件**：执行 `init_opencode.sh`，脚本合并 `~/.config/opencode/opencode.json`。
2. **期望链路**：OpenCode 只加载本仓自有 OpenCode plugins、cache proxy plugin、
   MCP 配置，以及 `~/.agents/skills` 中显式链接的 skills。
3. **实际链路**：`init_opencode.sh` 把 `config["plugin"]` 强制写成
   `[f"{src}/vendor/superpowers"]`，导致 OpenCode 每次启动都加载整包 Superpowers plugin。
4. **关键假设失效**：早期假设 OpenCode 需要通过 Superpowers plugin 才能获得 skills；
   现在本仓已经采用 native skill fallback，只链接部分 skills 到 `~/.agents/skills`。
5. **旁证**：
   - OpenCode 日志显示 `service=plugin path=file:///.../vendor/superpowers loading plugin`。
   - 同一日志出现多条 duplicate skill warning，重复来源包含
     `~/.agents/skills/*` 与 `vendor/superpowers/skills/*`。
   - `init_opencode.sh` 中存在 `desired_plugins = [f"{src}/vendor/superpowers"]`。
6. **实现偏差**：OpenCode init 把 Superpowers 整包 plugin 作为强制配置项，而不是移除
   该旧配置并保留用户自管 plugin。

## 影响范围

- OpenCode 首轮上下文膨胀，skill 清单重复。
- 用户只想启用部分 Superpowers fallback skill 时，实际暴露了整包 skill。
- `OPENCODE_DISABLE_CLAUDE_CODE=1` 能关闭 Claude Code 兼容加载，但不能删除
  `opencode.json.plugin` 中显式配置的 `vendor/superpowers` plugin。

## 修复原则

- `init_opencode.sh` 不再把 `vendor/superpowers` 写入 `opencode.json.plugin`。
- 如果历史配置已有该 plugin，init 应删除这一项。
- 如果用户还有其他自管 plugin 项，必须保留。
- OpenCode 自有 JS plugins 仍通过 `~/.config/opencode/plugins` per-file symlink 管理。

## 验证

- 补测试：运行 init 后，`opencode.json.plugin` 不包含 `vendor/superpowers`。
- 补测试：历史配置中同时存在 `vendor/superpowers` 和用户自管 plugin 时，只删除前者。
- 跑 `bash scripts/test-init-opencode-cache-proxy.sh`。
- 跑 `bash -n init_opencode.sh`。
