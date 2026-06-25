# bug: external-llm-review 全局 skill 软链指向废弃 claude-skills

## 症状

OpenCode 可用 skill 列表中没有 `external-llm-review`。本机检查发现：

```text
~/.agents/skills/external-llm-review -> /Users/leshi.zhy/claude-config/claude-skills/external-llm-review
```

该目标路径不存在，`test -e ~/.agents/skills/external-llm-review` 返回失败。

## 影响

- `external-llm-review` 不会作为 external skill 被 OpenCode 扫描。
- 需要外部模型评审时，agent 只能依赖记忆或手写命令，容易漏掉 provider 选择规则和 reviewer 参数约束。

## 期望行为

`agents/skills.list` 中列出的共享 skills 应稳定软链到 `~/.agents/skills/<name>`。其中仓内自维护 skill 应指向：

```text
/Users/leshi.zhy/claude-config/userconf/skills/<name>
```

## 实际行为

`external-llm-review` 仍指向迁移前的 `claude-skills/` 路径；同时 `init_opencode.sh` 只同步 OpenCode plugins/agents/AGENTS/docs/themes/tui，没有维护 `~/.agents/skills`，重跑 init 也不会修复该断链。

## 根因

统一配置迁移后，skill 本体从 `claude-skills/external-llm-review` 移到 `userconf/skills/external-llm-review`，但共享 skill 软链和文档没有同步更新：

- `~/.agents/skills/external-llm-review` 仍是旧软链。
- `agents/skills.list` 注释仍写候选源为 `claude-skills/<name>`。
- `userconf/skills/external-llm-review/SKILL.md` 中仍残留多处 `${CLAUDE_CONFIG_HOME}/claude-skills/...` 示例。
- `init_opencode.sh` 没有共享 skill 同步函数，无法自动纠偏旧软链。

## 修复方案

- 给 `init_opencode.sh` 增加共享 skill 同步：按 `agents/skills.list` 解析列表，源路径优先 `userconf/skills/<name>`，再 fallback 到 `vendor/superpowers/skills/<name>`。
- 对列表内 skill 的旧软链执行幂等更新，保留非本仓自管的真实目录或未知软链并告警。
- 更新 `external-llm-review` skill 文档，统一引用 `userconf/skills/external-llm-review`。
- 修复当前本机 `~/.agents/skills/external-llm-review` 断链。

## 验证

- 单测覆盖：旧 `claude-skills` 断链可被同步函数改为 `userconf/skills`。
- 单测覆盖：Superpowers skill 可 fallback 到 `vendor/superpowers/skills`。
- 本机验证：`readlink ~/.agents/skills/external-llm-review` 指向 `userconf/skills/external-llm-review`，且 `SKILL.md` 可读。
