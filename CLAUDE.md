# claude-config 仓库覆盖

> 本仓特殊性：自身就是全局 Claude 配置的源仓库。`claude/CLAUDE.md` 是
> 全局规则（被 `~/.claude/CLAUDE.md` 软链引用）；本文件是**仅本仓**生效的
> 局部覆盖，Claude Code 按 cwd 自动加载。

## Git 工作流豁免

本仓允许直接在 `main` 上 commit & push，**无需建分支**。

理由：单人维护、无 PR 流程、提交后立即 push 同步到所有 install 点
（其他机器通过软链拉取规则）。

git-commit skill 默认要求"主分支先建分支"——本仓覆盖：跳过该步骤。

## CLAUDE.md 规则修改注意

修改 `claude/CLAUDE.md`（全局规则）后影响所有项目下的 Claude 行为。
**修改前先在主对话里说明改动意图 + 等用户确认**，不要静默改。

修改 `CLAUDE.md`（本文件，repo-only）随便改，只影响本仓。

**`claude/CLAUDE.md` 与 `claude/CLAUDE.reason.md` 必须同步维护**：reason.md
是 CLAUDE.md 每条规则的"why"伴文（节标题一一对应），改 CLAUDE.md 时必须同步
更新或新增 reason.md 对应节。两文件不同步视为规则失约束，回退重做。

## 其他仓内子模块的常用入口

| 子目录 | 用途 | 入口 |
|---|---|---|
| `distill/` | skill 蒸馏管线（OpenAI SDK） | `cd distill && uv run skill-distill` |
| `claude-skills/` | Claude Code 用的 helper skill | `~/.claude/skills/` 软链至此 |
| `skills/` | 技术知识包（mcp/skill-catalog 索引） | `mcp__skill-catalog__resolve` |
| `blocks/` | 业务 block 仓库（前端 + miniprogram + 后端 spec） | `~/blocks-demo/` 验证 |
| `init_claude.sh` | Claude 全局软链初始化 | `bash init_claude.sh` |
| `init_opencode.sh` | opencode 全局软链初始化 | `bash init_opencode.sh` |
