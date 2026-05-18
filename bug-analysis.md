# Codex git commit hook 兼容性问题根因分析

## 现象

在 Codex 中执行 `git commit` 时，`hooks/git-commit-hint.sh` 会正确拦截并提示
需要完成 `git-commit` 与 `external-llm-review` 流程；但提示中的放行方式要求：

> 在本次 Bash 工具的 description 字段中包含 `skip-git-commit-hint`

Codex 的 `exec_command` 工具没有 `description` 字段，实际可传字段是 `cmd` /
`workdir` / `yield_time_ms` 等。因此即使流程已完成，也无法按提示放行，只能绕过
`git commit` 子命令匹配。

## 调用链

1. `init_codex.sh` 读取 `HOOKS_TEMPLATE="$SRC/codex/hooks.json"`。
2. `render_hooks_json()` 将 `__CLAUDE_CONFIG_HOME__` 替换为本仓路径，写入
   `~/.codex/hooks.json`。
3. 当前 `codex/hooks.json` 在 `PreToolUse` 的 `Bash` matcher 下调用：
   `bash "__CLAUDE_CONFIG_HOME__/hooks/git-commit-hint.sh"`。
4. `hooks/git-commit-hint.sh` 解析 hook stdin JSON，读取
   `payload.tool_name == "Bash"`、`tool_input.command` 和
   `tool_input.description`。
5. 当 `tool_input.command` 匹配 `git commit`，且 `tool_input.description`
   不含 `skip-git-commit-hint` 时，hook 返回 deny。
6. Codex 的工具调用无法提供该 `description` 字段，导致完成流程后仍无法使用
   官方提示中的方式放行。

## 根因假设

1. **Claude Code 与 Codex hook payload / tool schema 不一致**：Claude Code Bash
   有 `description` 字段，Codex `exec_command` 没有对应字段。
2. **Codex hook 模板复用了 Claude Code 专用脚本**：`codex/hooks.json` 直接指向
   `hooks/git-commit-hint.sh`，没有 Codex 专用放行协议。
3. **hook 提示文本没有按宿主区分**：Codex 中仍提示 “description 字段”，造成
   不可执行的修复指令。

## 验证方式

- 读取 `hooks/git-commit-hint.sh`：确认只从 `tool_input.description` 读取放行标记。
- 读取 `codex/hooks.json` 与 `~/.codex/hooks.json`：确认 Codex 侧仍使用
  `hooks/git-commit-hint.sh`。
- 实际复现：在 Codex 中带命令注释 `# skip-git-commit-hint` 执行 `git commit`
  仍被拦截，证明当前 hook 不检查命令文本中的放行标记。

## 根因确认

根因是 Codex 侧复用了 Claude Code 专用 git commit hook；该 hook 的放行协议依赖
`tool_input.description`，而 Codex 的命令工具没有这个可写字段。

## 影响范围

- 所有通过 `init_codex.sh` 渲染 `~/.codex/hooks.json` 的 Codex 环境。
- 所有需要在 Codex 中执行 `git commit` 的工作流，尤其是已完成 review / 豁免后
  需要合法提交的场景。
- 未来其他复用 Claude Code hook、且依赖 Claude Code 特有 tool input 字段的
  Codex hook。

## 修复方向

新增 Codex 专用 hook，例如 `codex/hooks/git-commit-hint.sh`，并将 Claude Code
专用 hook 迁移到 `claude/hooks/`：

- 兼容 Codex hook payload：从 `tool_input.command` 或 `tool_input.cmd` 读取命令。
- 放行协议改为 Codex 可表达的方式：命令文本中包含
  `skip-git-commit-hint` 即放行。
- deny 文案明确说明 Codex 中应把标记放在命令文本里，而不是 description 字段。
- 更新 `codex/hooks.json` 指向 Codex 专用 hook。
- 更新 `init_codex.sh`，明确 Codex hook 使用专用入口，并在渲染前校验该 hook 存在。
- 更新 `init_claude.sh` 与 Claude settings 模板，引用 `claude/hooks/`。

此修复改变 hook 文件布局，但保留 Claude Code hook 的现有行为。
