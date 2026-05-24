# OpenCode cache proxy 插件拆分边界失效

## 现象

真实运行 `bash init_opencode.sh` 两次后，第二次快照内容保持不变，说明配置结果本身可重复。但第一遍运行会在主仓重新生成未跟踪文件：

```text
?? opencode/plugins/bailian-cache-proxy.js
```

现场路径显示：

```text
~/.config/opencode/plugins -> /Users/mhbzhy/claude-config/opencode/plugins
~/.config/opencode/plugins/bailian-cache-proxy.js -> /Users/mhbzhy/claude-config/vendor/opencode-cache-proxy/plugins/bailian-cache-proxy.js
```

这违反了当前拆分目标：cache proxy 插件应由 `vendor/opencode-cache-proxy` 子仓提供并配置，主仓不应重新承载该插件入口文件。

## 调用链

1. `init_opencode.sh` 调用 `configure_opencode_cache_proxy`。
2. `configure_opencode_cache_proxy` 将 `--opencode-plugin-dir "$OPENCODE_CONFIG_DIR/plugins"` 传给子仓配置入口。
3. 子仓 `bailian-cache-proxy-configure.mjs opencode` 在 plugin dir 下创建 `bailian-cache-proxy.js` 软链。
4. 当前机器的历史状态中，`$OPENCODE_CONFIG_DIR/plugins` 是整目录软链，指向主仓 `opencode/plugins`。
5. 因此子仓以为写入的是用户 OpenCode 配置目录，实际文件落在主仓 `opencode/plugins/bailian-cache-proxy.js`。

## 根因假设

1. 子仓配置入口没有处理 plugin dir 是 symlink-to-main-repo 的历史状态。
2. 主仓 `init_opencode.sh` 仍先保留整目录 plugin 同步策略，和新拆分策略冲突。
3. `sync_opencode_plugins` 在子仓配置之后执行，重新覆盖了子仓创建的用户目录结构。

## 验证方式

- 真实运行两遍 `init_opencode.sh` / `init_qwen.sh`，对比第一遍后与第二遍后的内容快照。
- 检查 `~/.config/opencode/plugins`、`~/.config/opencode/plugins/bailian-cache-proxy.js`、`opencode/plugins/bailian-cache-proxy.js` 的 symlink 目标。
- 检查 `git status --short opencode/plugins` 是否出现主仓未跟踪插件入口。

## 根因确认

根因是主仓历史配置把 `~/.config/opencode/plugins` 整目录软链到主仓 `opencode/plugins`，导致子仓配置入口写入用户 plugin dir 时实际写回主仓目录；这是主仓 OpenCode plugin 同步策略和新 cache proxy 子仓化策略之间的边界冲突。

## 影响范围

- 已经存在整目录软链 `~/.config/opencode/plugins -> <repo>/opencode/plugins` 的机器都会复现。
- 新机器如果 `sync_opencode_plugins` 仍创建整目录软链，也会复现。
- Qwen Code 不受这个具体路径影响，因为它通过 `~/.qwen/settings.json` hooks/provider 配置，不经过 OpenCode plugin dir。
- OpenCode 其他主仓自有 plugin 的同步策略也受影响：如果直接删除整目录软链，需要确保这些 plugin 仍能通过逐文件软链或其他方式保留。

## 修复方案

- `sync_opencode_plugins` 不再创建整目录软链；目标不存在时创建真实目录，并为主仓自有 plugin 建逐文件软链。
- 发现历史整目录软链 `~/.config/opencode/plugins -> <repo>/opencode/plugins` 或旧路径 `<repo>/opencode-plugins` 时，迁移为真实目录再进入逐文件软链模式。
- `init_opencode.sh` 先同步 / 迁移主仓自有 plugin，再调用子仓 cache proxy 配置入口，确保子仓写入的 `bailian-cache-proxy.js` 留在用户配置目录。

此修复不覆盖用户自管 plugin：如果 `~/.config/opencode/plugins` 是真实目录，原有非本仓文件保留；如果它是指向其他位置的软链，只报警并跳过。

## 修复后验证

- 新增集成测试覆盖历史整目录软链迁移场景，RED 阶段确认旧实现会把 `bailian-cache-proxy.js` 写回主仓。
- `bash scripts/test-init-opencode-cache-proxy.sh` 通过，包含常规 cache proxy 配置和 legacy plugin dir migration 两个场景。
- 真实运行两遍 `bash init_opencode.sh` 与 `bash init_qwen.sh` 后，第一遍迁移真实 OpenCode plugin 目录，第二遍快照无差异。
- 真实环境断言通过：
  - `~/.config/opencode/plugins` 是真实目录，不是软链；
  - `~/.config/opencode/plugins/bailian-cache-proxy.js` 指向子仓插件；
  - 主仓 `opencode/plugins/bailian-cache-proxy.js` 不存在。
