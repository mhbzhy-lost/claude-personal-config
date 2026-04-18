# statusLine 与 outputStyle

## statusLine（底部状态栏）

> 来源：https://code.claude.com/docs/en/statusline

### 约定

- `statusLine` 字段指向一个可执行脚本（`chmod +x`）
- 路径支持绝对 / `~/` / 相对工作目录
- 每次 session 状态变化时运行一次（注意性能）
- 脚本 stdin 收到一行 JSON，读完一次（不要循环 read）
- stdout 打印即展示，支持多行、ANSI 颜色

### stdin JSON 字段

```json
{
  "model": "claude-opus-4-1",
  "workingDir": "/Users/u/proj",
  "contextUsed": 8500,
  "contextAvailable": 100000,
  "costThisSession": 0.52,
  "branch": "main",
  "isDirty": false,
  "timestamp": "2024-01-15T14:23:45Z",
  "messageCount": 5,
  "effort": "medium"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `model` | string | 当前模型 |
| `workingDir` | string | 工作目录绝对路径 |
| `contextUsed` | number | 已用 token 估计 |
| `contextAvailable` | number | 上下文窗口总 token |
| `costThisSession` | number | 本 session 累计花费（USD） |
| `branch` | string | git 分支，仓库外为空串 |
| `isDirty` | boolean | 工作树是否有变更 |
| `timestamp` | string | ISO 8601 时间戳 |
| `messageCount` | number | 对话轮数 |
| `effort` | string | `low` / `medium` / `high` / `xhigh` / `max` |

### 性能建议

- 尽量减少外部进程调用（每次 `jq` 都有延迟）
- **不要**再跑 `git status`——用传入的 `branch` / `isDirty`
- 复杂逻辑改用 Python / Go

### 示例：git + 上下文进度条

```bash
#!/bin/bash
read -r json
branch=$(jq -r '.branch' <<< "$json")
isDirty=$(jq -r '.isDirty' <<< "$json")
used=$(jq -r '.contextUsed' <<< "$json")
total=$(jq -r '.contextAvailable' <<< "$json")

st="[$branch$([ "$isDirty" = true ] && echo '*' || echo '')]"
pct=$((used * 100 / total))
bar_w=30; filled=$((pct * bar_w / 100)); empty=$((bar_w - filled))
bar="["; for ((i=0;i<filled;i++)); do bar+="="; done
for ((i=0;i<empty;i++)); do bar+="-"; done; bar+="] ${pct}%"

echo "$st"; echo "$bar"
```

### 示例：颜色编码的上下文占比

```bash
#!/bin/bash
read -r json
used=$(jq -r '.contextUsed' <<< "$json")
total=$(jq -r '.contextAvailable' <<< "$json")
pct=$((used * 100 / total))
if   [ $pct -lt 50 ]; then c="\033[32m"
elif [ $pct -lt 75 ]; then c="\033[33m"
else                       c="\033[31m"; fi
printf "%bContext: %d/%d (%d%%)\033[0m" "$c" "$used" "$total" "$pct"
```

---

## outputStyle（输出样式）

> 来源：https://code.claude.com/docs/en/output-styles

### 内置样式

- **Default**：默认，软件工程任务优化
- **Explanatory**：在完成任务之间穿插 "Insights" 解释实现选择
- **Learning**：协作式学习，会留 `TODO(human)` 让你补代码

### 设置方式

```json
{ "outputStyle": "Explanatory" }
```

或 `/config` 里选择。**改动需要新 session 才生效**（为 prompt caching 稳定）。

### 自定义样式文件

保存到 `~/.claude/output-styles/*.md` 或 `.claude/output-styles/*.md`（plugins 目录下也可）：

```markdown
---
name: Technical Writer
description: Write clear, concise technical documentation
keep-coding-instructions: true
---

# Technical Writer Instructions
You are a technical writer...
```

### Frontmatter

| 字段 | 默认 | 说明 |
|---|---|---|
| `name` | 文件名 | 在 `/config` 菜单中显示 |
| `description` | 无 | 菜单描述 |
| `keep-coding-instructions` | `false` | 是否保留 coding 相关的默认系统提示 |

### 与相邻概念对比

| 特性 | 作用 |
|---|---|
| **outputStyle** | 直接改 Claude Code 的系统提示；自定义样式默认会**去掉**编码相关部分（除非 `keep-coding-instructions: true`） |
| **CLAUDE.md** | 作为 user message 跟在系统提示后，不改系统提示 |
| **`--append-system-prompt`** | 把内容追加到系统提示 |
| **Agents** | 被调用处理特定任务，可带独立模型/工具/触发条件 |
| **Skills** | 任务级可复用 prompt，显式 `/skill-name` 或 Claude 自动加载 |

规则：
- 统一「语气 / 格式 / 角色」→ outputStyle
- 项目上下文 / 规范 → CLAUDE.md
- 可复用工作流 → Skills
- 专职子任务 → Agents
