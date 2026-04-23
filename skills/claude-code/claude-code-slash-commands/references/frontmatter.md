# SKILL.md Frontmatter 完整字段参考

> 来源：https://code.claude.com/docs/en/slash-commands

所有字段都可选，只有 `description` 强烈建议填写。

## 基本字段

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `name` | string | 目录名 | 展示名与 `/slash` 触发名。仅小写字母、数字、连字符，最长 64 字符 |
| `description` | string | markdown 正文第一段 | **Claude 依据此判断是否自动触发**。关键词密度直接影响召回 |
| `when_to_use` | string | — | 补充触发描述，可写 trigger phrases 或示例请求 |
| `argument-hint` | string | — | `/menu` 自动补全时显示的参数提示，如 `[issue-number]`、`[filename] [format]` |

## 调用控制

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `disable-model-invocation` | bool | `false` | `true` → Claude 不会自动拉，description 也不进 context；仅用户 `/name` 可触发 |
| `user-invocable` | bool | `true` | `false` → 从 `/` 菜单隐藏，仅 Claude 可自动加载 |
| `paths` | glob 列表 | — | 仅当前工作文件匹配时 Claude 才自动加载（手动 `/name` 不受限） |

**组合效果矩阵**：

| 配置 | 用户可调 | Claude 可调 | description 常驻 context |
|------|----------|-------------|--------------------------|
| （默认） | yes | yes | yes |
| `disable-model-invocation: true` | yes | no | **no** |
| `user-invocable: false` | no | yes | yes |
| 两者都 true/false | 相互独立，可叠加 | 相互独立，可叠加 | 按上述规则 |

## 工具与执行环境

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `allowed-tools` | string \| list | — | 该 skill 激活期间免审批的工具；语法：`Bash(git *)` / `Read` / `Grep`；空格分隔或 YAML 列表 |
| `shell` | `bash` \| `powershell` | `bash` | 内联命令 `` !`cmd` `` 与 ```! ``` 代码块使用的 shell |
| `model` | string | 继承会话 | 该 skill 激活时使用的模型 ID |
| `effort` | `low`\|`medium`\|`high`\|`xhigh`\|`max` | 继承会话 | 推理深度 |

## 子代理执行

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `context` | `fork` | — | 在隔离的子代理上下文执行；不继承主会话历史 |
| `agent` | string | — | `context: fork` 时使用的子代理类型；可选 `Explore`、`Plan`、`general-purpose` 等 |

## 生命周期

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `hooks` | object | — | 作用于该 skill 生命周期的 hooks 配置 |

## 命名规则

- 仅限小写字母（`a-z`）、数字（`0-9`）、连字符（`-`）
- 最长 64 字符
- 冲突优先级：Enterprise > Personal > Project（Plugin 用 `plugin-name:skill-name` namespace 独立）
- 同名 skill 与旧版 command：**Skill 优先**

## 字符串替换（正文内可用）

| 变量 | 含义 |
|------|------|
| `$ARGUMENTS` | 全部参数（单字符串）。如果正文没出现，参数会以 `ARGUMENTS: <value>` 形式自动追加 |
| `$ARGUMENTS[N]` | 第 N 个参数（0-based） |
| `$N` | `$ARGUMENTS[N]` 的简写 |
| `${CLAUDE_SESSION_ID}` | 当前会话 ID |
| `${CLAUDE_SKILL_DIR}` | 本 skill 所在目录的绝对路径 |

**引号规则**：shell 风格。`/cmd "a b" c` → `$0="a b"`，`$1="c"`。

## 动态注入语法（正文）

| 语法 | 作用 |
|------|------|
| `` !`cmd` `` | 单行 shell 命令，输出原地替换到内容中 |
| ```` ```! `` ...  ``` ```` | 多行 shell 代码块（fence 开标记为三反引号紧跟 `!`） |
| `@path/to/file` | 引用文件内容并注入 |
| `@server:resource` | 引用 MCP server 资源 |

**全局关闭动态 shell**：`settings.json` 中 `"disableSkillShellExecution": true`。

## 完整示例（所有字段）

```yaml
---
name: analyze-perf
description: Analyze performance bottlenecks in the current module
when_to_use: When user asks about slow endpoints, CPU profiling, or request latency
argument-hint: "[module-name]"
disable-model-invocation: false
user-invocable: true
allowed-tools:
  - Bash(go test -bench *)
  - Bash(pprof *)
  - Read
  - Grep
model: claude-opus-4-x
effort: high
context: fork
agent: Explore
shell: bash
paths:
  - "internal/**/*.go"
  - "cmd/**/*.go"
hooks:
  pre: scripts/warmup.sh
---

## 环境
- Go 版本: !`go version`
- 当前模块: $ARGUMENTS[0]

分析 $ARGUMENTS[0] 的性能瓶颈...
```

## 常见陷阱

- **空 `name`**：若目录名含大写/下划线/空格，必须显式写 `name` 或改目录名，否则 skill 不加载
- **`allowed-tools` 误解**：不是白名单，不会阻止其他工具调用，只是免审批
- **`paths` 误解**：不影响手动 `/name`，只控制自动加载条件
- **`description` 漏关键词**：Claude 在语义匹配时主要看 description；"when to use" 关键词放这里比放正文更有效
- **`context: fork` 无 `agent`**：不填时用默认子代理；需要探索/规划类任务时显式选 `Explore`/`Plan` 效果更好
