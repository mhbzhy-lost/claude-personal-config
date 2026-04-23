# Claude Code 内置命令与 Bundled Skills 参考

> 完整清单见官方 `/en/commands`。本文档整理常用项供速查。

## 内置命令（Built-in Commands，代码驱动）

每会话可用，执行固定逻辑，不可通过 SKILL.md 替换。

| 命令 | 作用 | 常见用法 |
|------|------|----------|
| `/help` | 列出可用命令/技能/能力 | 忘记命令名时 |
| `/clear` | 清空对话上下文 | 开启新任务前 |
| `/compact` | 手动触发对话压缩 | 上下文接近上限时 |
| `/init` | 在当前仓库创建 CLAUDE.md | 新接入项目 |
| `/memory` | 查看/编辑长期记忆 | 管理跨会话偏好 |
| `/plugin` | 管理插件（安装、启用、禁用） | 插件化扩展 |
| `/agents` | 列出/切换 subagent 类型 | 需要探索或规划模式时 |

## Bundled Skills（prompt 驱动）

虽挂 `/` 前缀，实则是内置 skill：给 Claude 一份 playbook，由它用现有工具编排。列在官方 commands reference 的 Purpose 列会标 **Skill**。

| 命令 | 用途 | 适用场景 |
|------|------|----------|
| `/simplify` | 简化代码（可读性、结构、命名） | 代码 review 前收敛复杂度 |
| `/debug` | 引导式 debug：重现 → 隔离 → 假设 → 验证 | 面对陌生 bug、信息不完整时 |
| `/batch` | 批量执行同类任务 | 对多个文件/模块做同一种变更 |
| `/loop` | 循环执行直到条件满足 | 迭代修复测试直到全绿 |
| `/claude-api` | 操作 Claude API 的助手 | 写 Anthropic SDK 调用代码 |

调用方式和自定义 skill 完全一致：`/simplify src/foo.ts`。

## 内置命令 vs Bundled Skill vs Custom Skill

| 维度 | 内置命令 | Bundled Skill | Custom Skill |
|------|----------|---------------|--------------|
| 实现 | 客户端代码 | 内置 SKILL.md | 用户写的 SKILL.md |
| 可自动触发 | 否 | 是（除非 disable） | 是（除非 disable） |
| 可覆盖 | 否 | 同名自定义 skill 优先 | 按作用域优先级 |
| 可传参 | 因命令而异 | 支持 `$ARGUMENTS` | 支持 `$ARGUMENTS` |

## Custom Commands 旧形态

`.claude/commands/<name>.md` 仍工作，支持与 skill 相同的 frontmatter，但：

- 不支持 supporting files（只能单文件）
- 与同名 skill 冲突时 skill 优先
- 官方推荐迁移到 `.claude/skills/<name>/SKILL.md`

迁移步骤：
1. 创建目录 `.claude/skills/<name>/`
2. 把原 `.claude/commands/<name>.md` 移动为 `.claude/skills/<name>/SKILL.md`
3. 需要时拆分支持文件（reference.md / examples/ / scripts/）

## 环境变量

| 变量 | 作用 |
|------|------|
| `SLASH_COMMAND_TOOL_CHAR_BUDGET` | 提高 skill description 在 context 中的字符预算（skill 很多时避免被截断） |
| `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD` | 设为 `1` 时从 `--add-dir` 目录加载 CLAUDE.md（默认不加载） |

## Settings 相关字段

| 字段 | 作用 |
|------|------|
| `"disableSkillShellExecution": true` | 关闭所有 skill/custom command 的 `` !`cmd` `` 与 ```! ``` 动态 shell 注入 |

## 发现问题时的调试指令

在会话中直接问：

- `What skills are available?` —— 列出已加载的 skill
- `Why didn't skill X trigger?` —— 诊断未触发原因
- `/help` —— 查看当前可用命令

## 官方参考

- Skills 完整指南：https://code.claude.com/docs/en/slash-commands
- Commands 参考：https://code.claude.com/docs/en/commands
- Common workflows：https://code.claude.com/docs/en/common-workflows
- Agent Skills 开放标准：https://agentskills.io
