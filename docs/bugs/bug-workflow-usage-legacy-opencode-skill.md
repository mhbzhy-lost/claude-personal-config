# bug: workflow-usage 仍安装到 ~/.config/opencode/skills

## 症状

`workflow-usage` skill 当前软链位于 `~/.config/opencode/skills/workflow-usage`，没有统一到共享 external skill 入口 `~/.agents/skills/workflow-usage`。

## 影响

共享 skill 入口被拆成两套：OpenCode 专属目录保留 workflow skill，而其他客户端看不到同一份 skill；OpenCode 也可能同时扫描旧路径和共享路径产生重复或陈旧内容。

## 期望行为

`workflow-usage` 作为共享 skill，应该由 `agents/skills.list` 管理并软链到 `~/.agents/skills/workflow-usage`。旧的 `~/.config/opencode/skills/workflow-usage` 本仓管理软链应被清理。

## 实际行为

父仓 `sync_shared_skills` 不搜索 `vendor/opencode-dynamic-workflow/skills`，`agents/skills.list` 也未列出 `workflow-usage`；dynamic-workflow 子模块安装脚本仍直接写 `$OPENCODE_CONFIG_DIR/skills`。

## 根因 (6 要素)

1. **触发条件**：运行 `init_opencode.sh` 或 dynamic-workflow 子模块安装脚本后检查 `workflow-usage` skill 位置。
2. **期望链路**：主仓 `agents/skills.list` 作为唯一共享白名单，白名单包含 `workflow-usage` 时同步到 `~/.agents/skills/workflow-usage`；未包含时主仓不执行子模块初始化。
3. **实际链路**：主仓白名单缺少 `workflow-usage` 且不搜索 dynamic-workflow skill 源；子模块安装脚本直接写 `~/.config/opencode/skills/workflow-usage`。
4. **关键假设失效**：早期实现假设 workflow skill 是 OpenCode 专属能力，可以由子模块独立注册到 OpenCode 配置目录。
5. **旁证**：当前机器存在 `~/.config/opencode/skills/workflow-usage` 旧软链，而 `~/.agents/skills/workflow-usage` 缺失。
6. **实现偏差**：共享 skill 暴露边界应由主仓白名单控制；子模块脚本不应绕过主仓白名单创建 OpenCode 专属 skill 链接。

## 修复方案

将 `workflow-usage` 加入共享 skill 白名单，`shared_skill_source` 增加 dynamic-workflow 源目录，并清理 legacy OpenCode skill 软链；同步修改子模块安装脚本使用 `AGENTS_SKILLS_DIR`。

## 验证

父仓单测覆盖共享同步与 legacy 清理；子模块 install 测试覆盖 `AGENTS_SKILLS_DIR` 目标和旧 OpenCode skill 目录不再生成。
