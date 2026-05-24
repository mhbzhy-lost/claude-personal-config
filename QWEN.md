# Qwen Code 项目上下文

> 本仓全局规则见 `AGENTS.md`（Qwen Code 自动 fallback 加载）。
> `claude/CLAUDE.md` 是 Claude Code 全局规则，不适用于 Qwen Code。

## 本仓定位

claude-config 是 AI 编程助手的全局配置源仓库，统一管理 Claude Code、
OpenCode、Codex、Qwen Code 四端的规则、技能和初始化脚本。

## Qwen Code 专属

- 初始化：`bash init_qwen.sh`
- MCP / hooks / skills 与其他三端共享同一套外围服务
- 模型配置：`init_qwen.sh` 会 upsert 托管的 `qwen3.6-plus` / `qwen3.7-max`
  OpenAI provider，指向本地 Bailian cache proxy；其它 provider 与 `model`
  保留用户自管。
- `init_qwen.sh` 不碰 `env` / `model` / `providerMetadata`；会维护
  `modelProviders.openai` 中的托管 provider 和 `security.auth.selectedType`

## Git 工作流豁免

本仓允许直接在 `main` 上 commit & push，无需建分支。

## 子模块入口

| 子目录 | 用途 | 入口 |
|---|---|---|
| `claude-skills/` | helper skill（四端共用） | `~/.qwen/skills/` 软链至此 |
| `skills/` | 技术知识包（MCP skill-catalog 索引） | `mcp__skill-catalog__resolve` |
| `blocks/` | 业务 block 仓库 | MCP `block-catalog` |
| `init_qwen.sh` | Qwen Code 全局初始化 | `bash init_qwen.sh` |

## SSOT 策略

Hook 文案统一维护在 `shared/policies/`，各端 wrapper 引用同一份，不做 inline 副本。
详见 `shared/policies/README.md`。
