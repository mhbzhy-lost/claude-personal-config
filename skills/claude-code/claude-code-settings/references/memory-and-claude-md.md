# CLAUDE.md 与 auto memory

> 来源：https://code.claude.com/docs/en/memory

## 两种记忆机制

|  | CLAUDE.md | auto memory |
|---|---|---|
| 谁写 | 你 | Claude |
| 存什么 | 规则、约定、架构 | Claude 学到的命令、偏好 |
| 作用域 | project / user / org | 每个 working tree |
| 加载时机 | 每次 session 全部加载 | 每次 session 前 200 行 / 25KB |

## CLAUDE.md 位置与优先级（具体 > 宽泛）

| Scope | 路径 |
|---|---|
| Managed | macOS `/Library/Application Support/ClaudeCode/CLAUDE.md` · Linux/WSL `/etc/claude-code/CLAUDE.md` · Windows `C:\Program Files\ClaudeCode\CLAUDE.md` |
| Project | `./CLAUDE.md` 或 `./.claude/CLAUDE.md` |
| User | `~/.claude/CLAUDE.md` |
| Local | `./CLAUDE.local.md`（加到 `.gitignore`） |

工作目录**以上**层级的 CLAUDE.md 全量加载；子目录里的按需加载（Claude 读那个目录的文件时）。

## 编写建议

- 目标 < 200 行/文件；过长降低遵循率
- 用 markdown 标题 + 列表结构化
- 具体化：`"Use 2-space indentation"` 好于 `"Format code properly"`
- 大型项目用 `.claude/rules/*.md` 拆分；支持 frontmatter `paths:` 只对匹配文件生效

```markdown
---
paths:
  - "src/api/**/*.ts"
---
# API 规则
- 所有端点必须输入校验
- 错误返回统一格式
```

## `@path` 导入

```markdown
See @README for overview and @package.json for commands.
# More
- git @docs/git-instructions.md
```

相对路径相对当前 CLAUDE.md；最多 5 层嵌套。

## Auto memory

- 默认开启；`autoMemoryEnabled: false` 或 `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` 关闭
- 存储：`~/.claude/projects/<project>/memory/`（项目路径基于 git 仓库，worktree 共享同一目录）
- 机器本地，不跨机同步
- `MEMORY.md` 前 200 行 / 25KB 在 session 启动加载；topic 文件按需加载
- `claudeMdExcludes` 可排除指定 CLAUDE.md glob，避免噪声

## `/memory` 命令

- 列出当前 session 加载的全部 CLAUDE.md / CLAUDE.local.md / rules
- 切换 auto memory 开关
- 提供 auto memory 目录入口
- 选择文件在编辑器中打开

## 排错

Claude 不按 CLAUDE.md 执行：

1. `/memory` 确认文件确实被加载
2. 检查作用域：本次 session 工作目录是否在该 CLAUDE.md 的覆盖范围
3. 指令具体化（见前）
4. 检查多个 CLAUDE.md 是否冲突；Claude 会随机挑一条遵循

> 原理：CLAUDE.md 内容作为 user message 跟在 system prompt 后，并非系统提示本身；不保证严格遵守。
