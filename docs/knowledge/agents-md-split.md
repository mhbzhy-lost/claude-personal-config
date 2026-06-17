# AGENTS.md 分层模型

`claude-config` 仓内 `AGENTS.md` 分两层维护：

| 层 | 文件 | 作用域 | 加载方式 |
|---|---|---|---|
| 全局 | `userconf/AGENTS.md` | 所有通过 `init_opencode.sh` 初始化的 opencode 项目 | 软链到 `~/.config/opencode/AGENTS.md` |
| 仓内 | 仓根 `AGENTS.md` | 仅 `claude-config` 仓自身 | opencode 按 cwd 自动加载 |

## 维护约定

- `userconf/AGENTS.md` 必须有伴生 `userconf/AGENTS.reason.md`：一一对应记录每条规则的 why
- 修改 `userconf/AGENTS.md` 前**必须**先在主对话说明改动意图 + 等用户确认
- 仓根 `AGENTS.md` 维护无需确认（仅影响本仓）
- 本仓允许直接在 `opencode` 分支 commit & push，无需分支

## 决策背景

原先单一仓根 `AGENTS.md` 既描述本仓约定又描述全局规则，导致：
- 其他项目加载时带入了 `claude-config` 特有的 Git 工作流豁免等约束
- 仓内特有的 vendor 子模块约定也被误当作通用规范

分层后，全局规则（TDD、commit 规范、subagent 约束）和仓内约定（vendor 处理、知识门禁）清晰隔离。

## 影响判断

修改 `userconf/AGENTS.md` 时需确认：这条规则是否对所有 opencode 用户适用。若只适用于特定仓，应放在仓根 `AGENTS.md`。
