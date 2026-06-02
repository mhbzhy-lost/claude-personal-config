# Bug: OpenCode 全局 AGENTS 不展开 @Superpowers.md

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
   该文件顶部的 `@Superpowers.md` 是 Claude Code 风格导入，OpenCode 没有证据会
   展开这个引用。
4. **关键假设失效**：实现假设 OpenCode 对 `AGENTS.md` 支持与 Claude Code 相同的
   `@file` 导入语义；实际 OpenCode 的补充规则文件应通过原生 `instructions`
   配置声明。
5. **旁证**：
   - 当前软链与文件内容存在，说明不是路径缺失。
   - 旧 OpenCode 日志里“Using-Superpowers 已内联注入”来自移除前的
     `vendor/superpowers` plugin，而不是 `@Superpowers.md`。
   - 移除 plugin 后，若 OpenCode 不展开 `@file`，上下文只会看到字面量
     `@Superpowers.md`。
6. **实现偏差**：OpenCode init 把 Claude 全局规则原样软链给 OpenCode，但没有通过
   `opencode.json.instructions` 注册 `Superpowers.md`；`@Superpowers.md` 只适合
   Claude Code。

## 影响范围

- OpenCode 默认上下文缺少选择性 Superpowers 使用指南。
- 用户仍能通过 native skill 列表看到具体 skills，但缺少“只用软链 skills、不要加载整包
  plugin”的元规则。
- 重新启用 `vendor/superpowers` plugin 会恢复全文注入，但会再次暴露未软链的全部 skills，
  不符合当前策略。

## 修复原则

- 不恢复 `vendor/superpowers` plugin。
- 保留 `claude/CLAUDE.md` 的 `@Superpowers.md`，供 Claude Code 使用。
- OpenCode 侧保留 `~/.config/opencode/AGENTS.md -> claude/CLAUDE.md` 软链。
- `~/.config/opencode/Superpowers.md` 继续软链到 `claude/Superpowers.md`。
- `init_opencode.sh` 在 `opencode.json.instructions` 中追加 `Superpowers.md`，并保留
  用户已有 instruction 条目。
- 补测试覆盖 init 后 `instructions` 包含 `Superpowers.md`，且不破坏用户自定义
  instruction。
