---
name: claude-code-slash-commands
description: "Claude Code 斜杠命令与 Skill 定义系统：SKILL.md frontmatter、参数占位符、动态注入、作用域加载"
tech_stack: [claude-code]
capability: [cc-slash-command]
version: "claude-code-cli 2.1.111"
collected_at: 2026-04-17
---

# Claude Code Slash Commands & Skills（命令/技能定义系统）

> 来源：https://code.claude.com/docs/en/slash-commands
> 配套：https://code.claude.com/docs/en/common-workflows
> 标准：Claude Code 兼容 [Agent Skills](https://agentskills.io) 开放标准并扩展

## 用途

定义可被 Claude Code 自动或手动触发的"命令/技能"，以此扩展模型能力：
- 用 YAML frontmatter + Markdown 写一份"说明书" Claude 会按需加载
- `.claude/skills/<name>/SKILL.md` 是推荐形式，`.claude/commands/<name>.md` 是旧形式（仍兼容）
- 同一份文件同时支持"用户手动 `/name` 触发"和"模型在合适场景自动触发"

## 何时使用

- 反复往聊天里粘贴同一份多步流程（部署、发版、PR 审查、commit）
- CLAUDE.md 中某块已经从"事实"演变成"操作程序"——应该拆出来做成按需加载的 skill
- 需要携带上下文的通用模板（带命令参数、带 shell 注入的实时数据、带子代理隔离执行）
- 监控/领域知识类内容——写成 `user-invocable: false` 的隐藏 skill，让 Claude 需要时自己 pick

## 内置 Slash Commands（Bundled）

每个会话默认可用，详见 `/en/commands` 完整参考。常用：

| 命令 | 作用 |
|------|------|
| `/help` | 列出所有可用命令与技能 |
| `/clear` | 清空当前对话上下文 |
| `/compact` | 手动触发上下文压缩（保留关键信息） |
| `/init` | 在当前仓库初始化 CLAUDE.md |
| `/memory` | 查看/编辑长期记忆内容 |
| `/plugin` | 管理已安装插件 |
| `/agents` | 查看/切换可用 subagent 类型 |
| `/simplify` | **Bundled skill**：简化当前代码 |
| `/debug` | **Bundled skill**：引导式 debug 流程 |
| `/batch` | **Bundled skill**：批量处理任务 |
| `/loop` | **Bundled skill**：循环执行直到条件满足 |
| `/claude-api` | **Bundled skill**：操作 Claude API |

> Bundled skill 是 prompt 驱动（给 Claude 一份 playbook），内置命令是代码驱动（固定逻辑）；两者调用方式一致，均以 `/` 开头。

## 目录与加载作用域

```
<location>/.claude/skills/<skill-name>/SKILL.md
```

| 作用域 | 路径 | 生效范围 |
|--------|------|----------|
| Enterprise | managed settings 指定 | 组织内所有用户 |
| Personal | `~/.claude/skills/<name>/SKILL.md` | 当前用户所有项目 |
| Project | `.claude/skills/<name>/SKILL.md` | 当前项目 |
| Plugin | `<plugin>/skills/<name>/SKILL.md` | 启用该插件的地方 |

**同名冲突优先级**：Enterprise > Personal > Project。Plugin 使用 `plugin-name:skill-name` 命名空间，不会冲突。
**Skill 与旧 command 同名**：Skill 优先。

**热更新**：`~/.claude/skills/`、项目 `.claude/skills/`、`--add-dir` 目录下的 `.claude/skills/` 的文件增删改在当前会话内即时生效。**但如果顶层 skills 目录会话启动时不存在，新建后必须重启 Claude Code**。

**Monorepo 自动发现**：编辑 `packages/frontend/**` 时，Claude Code 会同时扫描 `packages/frontend/.claude/skills/`。

**`--add-dir` 特例**：该目录下的 `.claude/skills/` 会加载；其他 `.claude/` 配置（subagents/commands/output-styles）不加载；CLAUDE.md 需设置 `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` 才加载。

## 目录结构

```
my-skill/
├── SKILL.md           # 必需：主入口
├── reference.md       # 可选：详细参考文档（按需加载）
├── examples/          # 可选：示例输出
│   └── sample.md
└── scripts/           # 可选：可执行脚本（执行而非载入上下文）
    └── helper.py
```

**关键原则**：`SKILL.md` 保持 **<500 行**；详细资料放到支持文件并在正文用 `[reference.md](reference.md)` 引用，Claude 才知道何时加载。

## 最小可运行示例

`~/.claude/skills/explain-code/SKILL.md`：

```yaml
---
name: explain-code
description: Explains code with visual diagrams and analogies. Use when explaining how code works or when the user asks "how does this work?"
---

When explaining code:
1. Start with an analogy from everyday life
2. Draw an ASCII diagram of flow/structure
3. Walk through the code step-by-step
4. Highlight a common gotcha
```

触发方式：
- 自动：用户问"How does this code work?"（description 匹配）
- 手动：`/explain-code src/auth/login.ts`

## Frontmatter 字段（核心摘要）

```yaml
---
name: my-skill              # 不写则用目录名；仅小写字母/数字/连字符，max 64 字符
description: ...            # 强烈建议；Claude 依据此判断是否自动触发
when_to_use: ...            # 补充触发描述（trigger phrases / 例句）
argument-hint: "[issue]"    # /menu 自动补全提示
disable-model-invocation: true   # 仅用户能调，Claude 不会自动拉
user-invocable: false       # 仅 Claude 能拉，不出现在 / 菜单
allowed-tools: Bash(git *)  # 该 skill 激活时免审批的工具（空格分隔或 YAML 列表）
model: claude-opus-4-x      # 该 skill 激活时的模型
effort: high                # low / medium / high / xhigh / max
context: fork               # 在子代理隔离上下文执行
agent: Explore              # context: fork 时选用的子代理类型（Explore/Plan/general-purpose 等）
hooks: ...                  # 作用于该 skill 生命周期的 hooks
paths: ["src/**/*.ts"]      # glob；仅当工作文件匹配时 Claude 才自动加载
shell: bash                 # 内联命令使用的 shell，另可选 powershell
---
```

> 所有字段可选，只有 `description` 强烈建议。完整字段表见 `references/frontmatter.md`。

### `disable-model-invocation` vs `user-invocable: false`

| 组合 | 用户可调 | Claude 可调 | description 是否常驻 context | 典型场景 |
|------|----------|-------------|------------------------------|----------|
| 默认 | yes | yes | 是 | 大部分 skill |
| `disable-model-invocation: true` | yes | no | **否** | 有副作用：`/deploy`、`/commit`、`/send-slack-message` |
| `user-invocable: false` | no | yes | 是 | 背景知识：`legacy-system-context`、`api-conventions` |

**两者选择逻辑**：关心"谁能触发"用 `disable-model-invocation`（防止 Claude 误判时刻自行部署）；关心"作为菜单项是否有意义"用 `user-invocable`（背景知识不是动作）。

## 参数占位符

| 占位符 | 含义 |
|--------|------|
| `$ARGUMENTS` | 传入的所有参数（单个字符串）。若 SKILL.md 未出现此变量，参数会自动以 `ARGUMENTS: <value>` 附加 |
| `$ARGUMENTS[N]` | 第 N 个参数（0-based） |
| `$N` | `$ARGUMENTS[N]` 的简写，如 `$0` / `$1` |
| `${CLAUDE_SESSION_ID}` | 当前会话 ID |
| `${CLAUDE_SKILL_DIR}` | 本 skill 所在目录的绝对路径（用于引用同目录脚本） |

**引用规则**：索引参数按 shell 风格解析，多词参数必须加引号。
`/my-skill "hello world" second` → `$0` = `hello world`，`$1` = `second`。

```yaml
---
name: migrate-component
---
Migrate the $ARGUMENTS[0] component from $ARGUMENTS[1] to $ARGUMENTS[2].
```

## 动态上下文注入

### 内联 shell 命令 `` !`cmd` ``

在 skill 内容送到 Claude 之前先执行，输出原地替换：

```yaml
---
name: pr-summary
description: Summarize changes in a pull request
context: fork
agent: Explore
allowed-tools: Bash(gh *)
---

## PR 上下文
- PR diff: !`gh pr diff`
- PR comments: !`gh pr view --comments`
- Changed files: !`gh pr diff --name-only`

## 你的任务
总结这个 PR...
```

### 多行 shell 块

用 ` ```! ` 开启 fenced 代码块（注意开标记必须是三反引号紧跟 `!`）：

````markdown
## Environment
```!
node --version
npm --version
git status --short
```
````

### 文件引用 `@path`

在正文中以 `@` 前缀引用仓库内文件，Claude 会把文件内容加入上下文。

### MCP 资源 `@server:resource`

引用 MCP server 提供的资源。

### 禁用 shell 执行

`settings.json` 设置 `"disableSkillShellExecution": true`，所有 skill 与 custom command 的 `` !`cmd` `` 与 ` ```! ` 块都不会执行。

## 子代理隔离（`context: fork`）

加上此字段后，skill 内容作为一个**独立子代理**的任务 prompt 执行，**不继承主会话历史**：

```yaml
---
name: deep-analyze
description: 在隔离上下文中做深度分析
context: fork
agent: Explore
---

分析当前代码库：
1. 找性能瓶颈
2. 识别安全问题
3. 给出重构建议
```

| 方式 | system prompt | task | 额外加载 |
|------|---------------|------|----------|
| **Skill + `context: fork`** | 来自 `agent` 字段指定的代理类型 | SKILL.md 内容 | CLAUDE.md |
| **Subagent + `skills:` 字段** | Subagent 的 markdown 正文 | Claude 的委派消息 | 预加载的 skills + CLAUDE.md |

## 工具预授权（`allowed-tools`）

`allowed-tools` **只放行**，不限制；其他工具仍可用但走正常审批：

```yaml
---
name: commit
description: Stage and commit the current changes
disable-model-invocation: true
allowed-tools: Bash(git add *) Bash(git commit *) Bash(git status *)
---
```

> 支持空格分隔字符串或 YAML 列表。语法与全局 permission 规则一致（如 `Bash(git *)`、`Read`、`Grep`）。

## 生命周期与上下文预算

- **首次调用**：渲染后的 SKILL.md 内容作为**一条消息**注入当前对话，**整会话保留**
- **不重读**：后续轮次 Claude Code 不再读取磁盘文件，所以要把"整任务应遵循的指令"写成常驻规则，而不是一次性步骤
- **Auto-compaction**：压缩时为最近调用的每个 skill 保留前 **5000 tokens**；所有 re-attached skills 共享 **25000 tokens** 总预算
- **Description 预算**：skill 多时 description 会被截断以放入字符预算；可通过环境变量 `SLASH_COMMAND_TOOL_CHAR_BUDGET` 抬高上限，或自行缩短 `description` + `when_to_use`

## 常用实战示例

### `/commit`（含预授权）

```yaml
---
name: commit
description: Stage and commit current changes following repo conventions
disable-model-invocation: true
allowed-tools: Bash(git add *) Bash(git commit *) Bash(git status *) Bash(git diff *)
---

## 现状
- status: !`git status --short`
- staged diff: !`git diff --cached`

1. 检查 staged 变更
2. 按 Conventional Commits 格式生成 subject
3. 创建 commit（不要 --amend）
```

### `/deploy`（手动触发、子代理）

```yaml
---
name: deploy
description: Deploy the application to production
context: fork
disable-model-invocation: true
---

Deploy $ARGUMENTS to production:
1. 运行测试套件
2. 构建产物
3. 推送到部署目标
4. 验证部署成功
```

### `/review-pr`（动态注入）

```yaml
---
name: review-pr
description: Review the current pull request
allowed-tools: Bash(gh *)
---

## PR
!`gh pr view --json title,body,files`

## 任务
审查这个 PR，指出潜在问题与改进建议。
```

### `fix-issue`（带参数）

```yaml
---
name: fix-issue
description: Fix a GitHub issue by number
argument-hint: "[issue-number]"
disable-model-invocation: true
---

修复 GitHub issue $ARGUMENTS：
1. 读取 issue 描述
2. 理解需求
3. 实现并加测试
4. 创建 commit
```

### 背景知识 skill（仅 Claude 可调）

```yaml
---
name: legacy-billing-context
description: Billing 旧系统的约束与陷阱，写新代码触及 billing 时加载
user-invocable: false
paths: ["packages/billing/**"]
---

Billing 模块历史：
- 2018 年从 PHP 迁移，sql schema 仍保留 snake_case
- 金额单位统一用 cents (int64)，禁止 float
- ...
```

## 注意事项

- **命名**：`name` 仅允许小写字母/数字/连字符，最长 64 字符；未填则用目录名
- **副作用动作必须 `disable-model-invocation: true`**：否则 Claude 可能误判"代码看起来准备好了"自动部署
- **SKILL.md 内容在会话内不会重载**：修改磁盘文件只对**新调用**生效，已注入的旧内容仍在上下文里
- **`paths` 对手动触发无影响**：仅用于控制 Claude 自动加载的条件；用户 `/name` 永远能调
- **`allowed-tools` 不是白名单**：它只是免审批列表；`Bash(git *)` 不会阻止 Claude 调 `Read`
- **顶层 skills 目录不存在时新建不热更**：必须重启 CC 才能开始监听
- **`$ARGUMENTS` 走 shell 风格引号**：`/cmd "a b" c` 会得到两个参数而不是三个
- **旧版 `.claude/commands/*.md` 仍工作**：frontmatter 字段一致，但不支持 supporting files；建议逐步迁移

## 组合提示

- 与 **Subagents**（`~/.claude/agents/*.md`）搭配：subagent 的 frontmatter 里可写 `skills: [skill-a, skill-b]` 在启动时**全量预注入**这些 skill（与 `context: fork` 方向相反）
- 与 **Hooks** 搭配：skill frontmatter 里的 `hooks` 字段只对本 skill 生命周期生效
- 与 **MCP** 搭配：`@server:resource` 在 skill 正文里引用外部资源
- 与 **CLAUDE.md** 搭配：CLAUDE.md 写事实型长期规则；skill 写按需加载的流程/知识

## 排错清单

| 症状 | 排查 |
|------|------|
| Claude 不触发 skill | `description` 缺关键词；在会话里问 "What skills are available?" 确认是否加载；换说法更贴近 description；用 `/name` 手动触发 |
| 触发过于频繁 | `description` 收窄；改 `disable-model-invocation: true` |
| description 被截断 | 调高 `SLASH_COMMAND_TOOL_CHAR_BUDGET`，或精简 `description` / `when_to_use` |
| 新建 skill 不生效 | 顶层 `.claude/skills/` 会话启动时不存在 → 重启 CC |
| `--add-dir` 目录 skill 不加载 | 确认目录内存在 `.claude/skills/`（该目录下其他 `.claude/` 配置不会被加载） |

## 更多资料

- 完整 frontmatter 字段表与取值：`references/frontmatter.md`
- 内置命令与 bundled skills 完整清单：`references/builtin-commands.md`
