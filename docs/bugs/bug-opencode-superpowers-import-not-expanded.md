# Bug: OpenCode 全局 AGENTS 未加载 Superpowers.md

## 现象

`init_opencode.sh` 已创建：

```text
~/.config/opencode/AGENTS.md -> claude/CLAUDE.md
~/.config/opencode/Superpowers.md -> claude/Superpowers.md
```

但用户在 OpenCode 中观察到 `claude/Superpowers.md` 没有默认注入。

## 根因 (6 要素)

1. **触发条件**：OpenCode 禁用 Claude Code 兼容加载
   `OPENCODE_DISABLE_CLAUDE_CODE=1` 后，只读取自身全局 `AGENTS.md`。
2. **期望链路**：OpenCode 读取全局规则时，通过 `opencode.json.instructions`
   同时加载 `Superpowers.md`，让选择性 Superpowers 使用指南默认进入上下文。
3. **实际链路**：`~/.config/opencode/AGENTS.md` 只是软链到 `claude/CLAUDE.md`；
   选择性 Superpowers 规则不在该正文内，必须走 OpenCode 原生 `instructions`
   配置声明。
4. **关键假设失效**：实现曾假设全局 AGENTS 入口会顺带带入补充规则文件；实际
   OpenCode 的补充规则文件应通过原生 `instructions` 配置声明。
5. **旁证**：
   - 当前软链与文件内容存在，说明不是路径缺失。
   - 旧 OpenCode 日志里“Using-Superpowers 已内联注入”来自移除前的
     `vendor/superpowers` plugin，而不是当前的选择性软链规则入口。
   - 移除 plugin 后，若不显式配置 `instructions`，上下文不会加载
     `Superpowers.md`。
6. **实现偏差**：OpenCode init 把 Claude 全局规则原样软链给 OpenCode，但没有通过
   `opencode.json.instructions` 注册 `Superpowers.md`。

## 影响范围

- OpenCode 默认上下文缺少选择性 Superpowers 使用指南。
- 用户仍能通过 native skill 列表看到具体 skills，但缺少“只用软链 skills、不要加载整包
  plugin”的元规则。
- 重新启用 `vendor/superpowers` plugin 会恢复全文注入，但会再次暴露未软链的全部 skills，
  不符合当前策略。

## 修复原则

- 不恢复 `vendor/superpowers` plugin。
- `claude/CLAUDE.md` 保持宪法级规则正文，不内联选择性 Superpowers 规则。
- OpenCode 侧保留 `~/.config/opencode/AGENTS.md -> claude/CLAUDE.md` 软链。
- `~/.config/opencode/Superpowers.md` 继续软链到 `claude/Superpowers.md`。
- `init_opencode.sh` 在 `opencode.json.instructions` 中追加 `Superpowers.md`，并保留
  用户已有 instruction 条目。
- 补测试覆盖 init 后 `instructions` 包含 `Superpowers.md`，且不破坏用户自定义
  instruction。
