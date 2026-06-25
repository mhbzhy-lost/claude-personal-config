---
title: OpenCode 共享 Skills 同步
kind: convention
status: active
applies_to:
  - init_opencode.sh
  - agents/skills.list
  - userconf/skills/
last_verified: 2026-06-25
source: docs/bugs/bug-external-llm-review-stale-symlink.md
---

# 共享 skill 统一暴露到 ~/.agents/skills

## 适用场景

修改 OpenCode 可用 skills、`agents/skills.list`、`userconf/skills/` 或排查 skill 没有被 OpenCode 发现时，先看这条知识。

## 项目事实 / 约定

- `~/.agents/skills/<name>/SKILL.md` 是共享 external skill 入口，OpenCode 会扫描，其他 agent 也可复用。
- `~/.config/opencode/skills/` 只保留 OpenCode 专属技能或子模块安装入口，不作为本仓共享 skill 的主同步目标。
- 本仓自维护 skill 源目录是 `userconf/skills/<name>`，不要再使用废弃的 `claude-skills/<name>`。
- `agents/skills.list` 是共享 skill 白名单；`init_opencode.sh` 按该列表逐项软链到 `~/.agents/skills/`。
- 源路径解析顺序：先 `userconf/skills/<name>`，再 `vendor/superpowers/skills/<name>`。
- `<name>` 只允许字母、数字、下划线和连字符；空值或包含路径分隔符的条目会被初始化脚本拒绝。

## 原因

OpenCode 不会把 `~/.agents/AGENTS.md` 当全局指令，但会扫描 `~/.agents/skills/`。把共享 skill 统一放在 `~/.agents/skills/` 可以避免 `~/.config/opencode/skills/` 与其他客户端目录重复维护，同时仍保留 OpenCode 专属配置在 `~/.config/opencode/`。

## 修改时注意

- 新增共享 skill 时，把源目录放到 `userconf/skills/<name>`，并把 `<name>` 加入 `agents/skills.list`。
- 引入 Superpowers skill 时，只把白名单名加入 `agents/skills.list`，源目录来自 `vendor/superpowers/skills/<name>`。
- 修改 `agents/skills.list` 时不要加入路径片段、相对路径或注释后的空名称；非法名称会让同步失败。
- `init_opencode.sh` 只会自动替换本仓自管路径下的旧软链；如果目标是未知路径或真实目录，会保留并告警，避免覆盖用户本地内容。
- `SKILL.md` 示例命令必须引用 `userconf/skills/<name>`，不要写 `claude-skills/<name>`。

## 验证方式

```bash
node --test "userconf/plugins/test/init-opencode-agents.test.mjs"
bash -n "init_opencode.sh"
readlink "$HOME/.agents/skills/external-llm-review"
test -f "$HOME/.agents/skills/external-llm-review/SKILL.md"
```

## 相关资料

- `docs/bugs/bug-external-llm-review-stale-symlink.md`
- `init_opencode.sh`
- `agents/skills.list`
- `userconf/skills/external-llm-review/SKILL.md`
