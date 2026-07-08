---
title: OpenCode 共享 Skills 同步
kind: convention
status: active
applies_to:
  - init_opencode.sh
  - agents/skills.list
  - .agents/skills/
  - userconf/skills/
last_verified: 2026-07-08
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
- `userconf/AGENTS.md` 不再硬编码“当前 linked skills”清单；运行时可用 linked skill 以 `agents/skills.list` 和实际初始化出的 `~/.agents/skills/` 为准，避免规则文档与软链结果漂移。

- `.agents/skills/<name>/SKILL.md` 用于本仓局部 project skill，例如 `plan-runner-troubleshooting`；它不加入 `agents/skills.list`，也不由 `init_opencode.sh` 同步到全局目录。

- 白名单只在主仓初始化脚本中生效；子模块安装脚本不读取该列表。主仓未列入某个子模块 skill 时，不执行对应子模块初始化入口。
- 源路径解析顺序：先 `userconf/skills/<name>`，再 `vendor/superpowers/skills/<name>`，最后 `vendor/opencode-dynamic-workflow/skills/<name>`。
- `<name>` 只允许字母、数字、下划线和连字符；空值或包含路径分隔符的条目会被初始化脚本拒绝。
- `workflow-usage` 统一暴露在 `~/.agents/skills/workflow-usage`；旧的 `~/.config/opencode/skills/workflow-usage` 本仓软链会被初始化脚本清理，避免 OpenCode 专属目录和共享目录重复。
- `plan-runner-dispatch` 是给 OpenCode 主 agent 的召回 shim：触发词命中后只负责要求主 agent 后台派发 `plan-runner` subagent，不替代 `plan-runner` 本身。派发前必须先跑 `git status --short`；只在 clean worktree 时 dispatch，dirty 时报告文件并要求用户 commit、stash 或 clean。
- `plan-runner-troubleshooting` 是本仓 project skill，用于其他会话排查 plan-runner 的 task-state、events、child worktree、`finish_plan` preflight、audit/external review 停点。

## 原因

OpenCode 不会把 `~/.agents/AGENTS.md` 当全局指令，但会扫描 `~/.agents/skills/`。把共享 skill 统一放在 `~/.agents/skills/` 可以避免 `~/.config/opencode/skills/` 与其他客户端目录重复维护，同时仍保留 OpenCode 专属配置在 `~/.config/opencode/`。

## 修改时注意

- 新增共享 skill 时，把源目录放到 `userconf/skills/<name>`，并把 `<name>` 加入 `agents/skills.list`。
- 新增只服务本仓维护工作的 project skill 时，放到 `.agents/skills/<name>/SKILL.md`，不要加入 `agents/skills.list`，除非希望所有 install 点都通过 `~/.agents/skills` 暴露。
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
