# claude-config 仓库（opencode 分支）

> 本仓特殊性：自身就是全局 opencode 配置的源仓库。`userconf/AGENTS.md` 是
> 全局规则（被 `~/.config/opencode/AGENTS.md` 软链引用）；本文件是**仅本仓**生效的
> 局部覆盖，opencode 按 cwd 自动加载。

> **维护分支**：本分支为 `opencode`，仅维护 opencode 相关基础设施。
> 其他工具（Claude Code、Codex、Qwen Code）的兼容配置请在 `main` 分支维护。

## Git 工作流豁免

本仓允许直接在 `opencode` 上 commit & push，**无需建分支**。

理由：单人维护、无 PR 流程、提交后立即 push 同步到所有 install 点
（其他机器通过软链拉取规则）。

git-commit skill 默认要求"主分支先建分支"——本仓覆盖：跳过该步骤。

## Commit Message 门禁

`userconf/plugins/git-commit-gate.js`（opencode 插件）校验 commit message 格式，规范来自
`userconf/AGENTS.md` 中 `Git Commit 规范` 一节。

- 插件层：在 bash 工具执行 `git commit` 时拦截，agent 看到即时反馈
- 逃逸：`GIT_COMMIT_HOOK_SKIP=1 git commit ...`
- 详见：`docs/knowledge/git-commit-gate.md`

## AGENTS.md 规则修改注意

修改 `userconf/AGENTS.md`（全局规则）后影响所有项目下的 opencode 行为。
**修改前先在主对话里说明改动意图 + 等用户确认**，不要静默改。

修改根目录 `AGENTS.md`（本文件，repo-only）随便改，只影响本仓。

**`userconf/AGENTS.md` 与 `userconf/AGENTS.reason.md` 必须同步维护**：reason.md
是 AGENTS.md 每条规则的"why"伴文（节标题一一对应），改 AGENTS.md 时必须同步
更新或新增 reason.md 对应节。两文件不同步视为规则失约束，回退重做。

## opencode 环境初始化

`init_opencode.sh` **不具备自动清理旧配置的功能**，仅负责按当前路径建立软链
和合并 `opencode.json`。在用户要求"初始化 opencode 环境"或重跑 init 脚本前，
agent 必须先手动检查并清理残留旧配置，再执行脚本。

常见需要手动清理的项目（不限于此列表，按实际环境判断）：

- `~/.config/opencode/AGENTS.md`：旧版指向 `claude/CLAUDE.md` 的死链
- `~/.config/opencode/plugins/*.js`：旧版指向 `opencode/plugins/*.js` 的死链
  （现应指向 `userconf/plugins/*.js`）
- `~/.config/opencode/shared`、`~/.config/opencode/docs`：指向已迁移路径的死链
- `~/.config/opencode/opencode.json` 中的残留字段：`instructions`、
  `mcp["skill-catalog"]`、`mcp["block-catalog"]`、指向 `claude-skills/` 的路径、
  `plugin` 列表中已退役条目
- `~/.claude/CLAUDE.md` 软链（如存在但 target 已删除）
- 其他工具的残留配置目录（如 `.qwen/settings.json`、`.claude/settings.json`）

死链可用 `ls -la` 或 `find -L ... -xtype l` 识别；`opencode.json` 用
`python3 + json.load` 检查。清理完成后用 `bash init_opencode.sh` 重建。

## 仓内子模块的常用入口

| 子目录 | 用途 | 入口 |
|---|---|---|
| `userconf/skills/` | opencode 用的 helper skill | `~/.agents/skills/` 软链至此 |
| `userconf/` | 全局 opencode 配置（AGENTS.md、AGENTS.reason.md） | `init_opencode.sh` |
| `init_opencode.sh` | opencode 全局软链初始化 | `bash init_opencode.sh` |

## Project Knowledge

提交前判断本次变更是否影响长期项目事实、约定、流程、风险或验证方式。

- 知识指南：`docs/knowledge/README.md`
- 当前知识：`docs/knowledge/`

若变更影响架构、配置契约、初始化流程、hook 行为、验证策略或反复踩坑，必须先
更新 `docs/knowledge/`；若不需要更新，commit message 中写明原因。

## 仓内专项记录

- opencode 插件架构与 vendor 子模块：`docs/bugs/`、`docs/knowledge/`
