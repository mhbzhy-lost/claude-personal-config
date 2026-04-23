---
name: claude-code-plugins
description: "Claude Code 插件与 Marketplace 体系：plugin.json / marketplace.json 清单、目录结构、/plugin 与 CLI 命令、安装作用域、缓存与企业管控。"
tech_stack: [claude-code]
capability: [cc-plugin]
version: "claude-code-cli 2.1.111"
collected_at: 2026-04-17
---

# Claude Code 插件与 Marketplace 系统

> 来源：
> - https://code.claude.com/docs/en/plugins
> - https://code.claude.com/docs/en/plugin-marketplaces
> - https://code.claude.com/docs/en/plugins-reference

## 用途

把 Claude Code 的自定义能力（skills、agents、hooks、MCP/LSP servers、background monitors、bin 工具）打包成**可版本化、可分发、可企业管控**的 plugin，并通过 marketplace 在团队或社区内共享。

## 何时使用

- 把原本在项目 `.claude/` 里的 skills/hooks 抽出来跨项目复用
- 发布内部工具链（如公司的部署 plugin、数据库 MCP server）给团队
- 维护一个 marketplace，集中管理多个 plugin 的版本与分发
- 企业环境下通过 managed settings 强制启用/禁用特定 plugin
- 本地开发调试 plugin（`--plugin-dir`）

> 单项目个人用的自定义，直接放 `.claude/` 即可，不必做成 plugin（skill 名字不会带命名空间前缀）。

---

## 1. Plugin 目录结构

Plugin 根目录布局（除 `.claude-plugin/plugin.json` 其他都可选）：

```
my-plugin/
├── .claude-plugin/
│   └── plugin.json          # 清单（manifest），可选但强烈推荐
├── skills/                  # 子目录每个是 <name>/SKILL.md
│   └── code-reviewer/
│       └── SKILL.md
├── commands/                # 扁平 .md 文件形式的 skill（老式）
├── agents/                  # 子 agent 定义（.md + YAML frontmatter）
├── hooks/
│   └── hooks.json           # 事件钩子配置
├── monitors/
│   └── monitors.json        # 后台监控任务
├── .mcp.json                # MCP server 定义
├── .lsp.json                # LSP server 定义
├── bin/                     # 启用时自动加入 Bash PATH 的可执行文件
├── settings.json            # plugin 启用时应用的默认 settings
├── LICENSE
└── CHANGELOG.md
```

**关键约束**：
- `skills/`、`commands/`、`agents/` 必须在 plugin 根，**不能**放进 `.claude-plugin/`（常见坑）
- 新 plugin 优先用 `skills/<name>/SKILL.md`；`commands/` 是兼容老写法的扁平 md
- 安装后插件被复制到 `~/.claude/plugins/cache/`，**无法引用目录外的文件**——必要时用 `ln -s` 软链

---

## 2. `plugin.json` Manifest

最小化示例：

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "Short one-liner about what this plugin does",
  "author": { "name": "Your Name" }
}
```

完整字段表见 `references/plugin-manifest.md`。核心字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string（必填） | kebab-case，不含空格。skill 会被命名空间化成 `/my-plugin:hello` |
| `version` | string | Semver（`MAJOR.MINOR.PATCH`）。**分发前务必更新**，Claude Code 根据版本号决定是否更新 |
| `description` | string | 市场列表展示 |
| `author` | object | `{ name, email, url }` |
| `homepage` / `repository` / `license` / `keywords` | - | 元数据 |
| `skills` / `commands` / `agents` / `hooks` / `mcpServers` / `lspServers` / `monitors` | string\|array | **自定义路径**覆盖默认位置 |

**自定义路径行为**：一旦指定 `"skills": "./custom/skills/"`，**默认的 `skills/` 目录就不再被扫描**。数组形式可指定多个路径。

### 环境变量（hook / MCP / LSP 脚本里引用路径必用）

| 变量 | 指向 | 生命周期 |
|------|------|----------|
| `${CLAUDE_PLUGIN_ROOT}` | 当前安装版本的根目录 | **随 plugin 升级变化**（版本隔离） |
| `${CLAUDE_PLUGIN_DATA}` | `~/.claude/plugins/data/{id}/` | **跨版本持久**，存缓存/DB/node_modules 等 |

示例：

```json
{
  "mcpServers": {
    "db": {
      "command": "${CLAUDE_PLUGIN_ROOT}/servers/db-server",
      "env": { "DATA_PATH": "${CLAUDE_PLUGIN_DATA}" }
    }
  }
}
```

典型用法：在 `SessionStart` hook 里比对 `package.json`，变化时把依赖装到 `${CLAUDE_PLUGIN_DATA}` 下，避免每次升级都重装。

---

## 3. Marketplace（`marketplace.json`）

仓库根的 `.claude-plugin/marketplace.json`：

```json
{
  "name": "company-tools",
  "owner": { "name": "DevTools Team", "email": "devtools@example.com" },
  "plugins": [
    { "name": "code-formatter", "source": "./plugins/formatter", "version": "2.1.0" },
    { "name": "deployment-tools", "source": { "source": "github", "repo": "company/deploy-plugin" } }
  ]
}
```

必填字段：`name`（kebab-case）、`owner.name`、`plugins` 数组。

### 5 种 plugin source

```jsonc
// 1) 相对路径（monorepo 内）
{ "source": "./plugins/my-plugin" }

// 2) GitHub（可 pin ref + sha 双重保障）
{ "source": { "source": "github", "repo": "owner/repo",
              "ref": "v2.0.0", "sha": "a1b2c3..." } }

// 3) 任意 Git URL
{ "source": { "source": "url", "url": "https://gitlab.com/team/plugin.git" } }

// 4) Git 子目录（monorepo 稀疏克隆）
{ "source": { "source": "git-subdir",
              "url": "https://github.com/acme/monorepo.git",
              "path": "tools/claude-plugin" } }

// 5) npm 包
{ "source": { "source": "npm", "package": "@acme/claude-plugin", "version": "2.1.0" } }
```

详细 source 字段见 `references/marketplace-sources.md`。

### `strict` 字段（控制 plugin.json 与 marketplace 条目的权威）

| 值 | 行为 |
|----|------|
| `true`（默认） | `plugin.json` 是组件权威，marketplace 条目可补充元数据 |
| `false` | marketplace 条目是全部定义，plugin 不能自带组件声明 |

`strict: false` 适用于 marketplace 运营方想完全接管组件暴露的场景。

### 预留名称（不得用作 marketplace name）

`claude-code-marketplace`、`claude-code-plugins`、`claude-plugins-official`、`anthropic-marketplace`、`anthropic-plugins`、`agent-skills`、`knowledge-work-plugins`、`life-sciences`。

### 私有仓库鉴权

```bash
export GITHUB_TOKEN=ghp_xxx
export GITLAB_TOKEN=glpat-xxx
export BITBUCKET_TOKEN=xxx
```

---

## 4. `/plugin` Slash 命令（交互式 UI）

```
/plugin install <name>@<marketplace>    # 安装
/plugin enable <name>                   # 启用已安装
/plugin disable <name>                  # 禁用但不卸载
/plugin marketplace add <source>        # 添加 marketplace
/plugin validate .                      # 校验当前目录 plugin 结构
/reload-plugins                         # 热重载，无需重启
```

`/plugin marketplace add` 的 `<source>` 可以是 `owner/repo`（默认 GitHub）、完整 git URL、或本地路径。

## 5. CLI 命令（脚本化管理）

```bash
# plugin 生命周期
claude plugin install <plugin> [-s user|project|local]
claude plugin uninstall <plugin> [-s ...] [--keep-data]
claude plugin enable  <plugin> [-s ...]
claude plugin disable <plugin> [-s ...]
claude plugin update  <plugin>
claude plugin list [--json] [--available]

# marketplace 管理
claude plugin marketplace add acme-corp/claude-plugins
claude plugin marketplace add https://gitlab.example.com/team/plugins.git
claude plugin marketplace add ./my-local-marketplace
claude plugin marketplace list
claude plugin marketplace remove <name>
claude plugin marketplace update [<name>]

# 校验
claude plugin validate .
```

`--keep-data` 卸载时保留 `${CLAUDE_PLUGIN_DATA}`，升级/重装能无缝延续状态。

---

## 6. 安装作用域

| Scope | Settings 文件 | 场景 |
|-------|---------------|------|
| `user` | `~/.claude/settings.json` | 个人全局插件 |
| `project` | `.claude/settings.json` | 团队共用，**入版本控制** |
| `local` | `.claude/settings.local.json` | 项目私有，**git 忽略** |
| `managed` | Managed settings（只读） | 企业下发，用户不可改 |

安装时用 `-s` 指定；同名 plugin 可在不同 scope 共存，**优先级 `managed > local > project > user`**。

---

## 7. 缓存与状态文件

```
~/.claude/plugins/
├── known_marketplaces.json       # 已注册的 marketplace（用户级，跨项目共享）
├── marketplaces/
│   └── <marketplace-name>/...    # 拉取的 marketplace 仓库
├── cache/
│   └── <marketplace>/<plugin>/<version>/...   # 每版本独立目录
└── data/
    └── {id}/...                  # ${CLAUDE_PLUGIN_DATA}，跨版本持久
```

要点：
- 缓存**按版本隔离**，升级不会覆盖旧版本
- 孤立版本（无活跃引用）约 **7 天后自动清理**
- `known_marketplaces.json` 每个用户只存一份（不是 per-project）
- Plugin 目录**禁止路径穿越**（读不到 plugin 目录外的文件），必须用 symlink 绕过

---

## 8. 企业管控（Managed Settings）

在 managed settings 中约束用户可添加的 marketplace 和启用的 plugin：

```json
{
  "strictKnownMarketplaces": ["company-tools", "^team-.*$"],
  "extraKnownMarketplaces": {
    "company-tools": {
      "source": { "source": "github", "repo": "your-org/claude-plugins" }
    }
  },
  "enabledPlugins": {
    "code-formatter@company-tools": true,
    "deployment-tools@company-tools": true
  }
}
```

字段含义：

- `strictKnownMarketplaces`：allowlist（含正则），**只允许**列出的 marketplace，其他全部被拒
- `extraKnownMarketplaces`：预置 marketplace，团队成员启动即可见
- `enabledPlugins`：以 `plugin@marketplace` 为 key，默认启用/禁用某插件

企业配置 + `project`/`managed` scope 组合，是标准化团队 Claude Code 环境的推荐路径。

---

## 9. 开发与调试

### 本地加载（不经 marketplace）

```bash
# 单个
claude --plugin-dir ./my-plugin

# 多个同时加载
claude --plugin-dir ./plugin-one --plugin-dir ./plugin-two
```

### 校验

```bash
claude plugin validate .      # CLI
# 或在会话内
/plugin validate .
```

会校验 `plugin.json`、skill/agent/command frontmatter、`hooks/hooks.json`。

### Debug

```bash
claude --debug                # 输出 plugin 加载细节
```

### 常见问题速查

| 症状 | 原因 | 解法 |
|------|------|------|
| Plugin 不加载 | `plugin.json` 格式错 | `/plugin validate .` |
| Skills 不出现 | 目录放到了 `.claude-plugin/` 里 | 把 `skills/` 挪到 plugin 根 |
| Hook 不触发 | 脚本无执行权限 | `chmod +x script.sh` |
| MCP 启动失败 | 路径没用 `${CLAUDE_PLUGIN_ROOT}` | 所有 plugin 内路径都用该变量 |
| LSP `Executable not found` | 缺本地 LSP 二进制 | 单独安装（如 `npm i -g typescript-language-server`） |
| 升级后数据丢失 | 状态存在了 `${CLAUDE_PLUGIN_ROOT}` | 改存到 `${CLAUDE_PLUGIN_DATA}` |

---

## 10. 版本管理与发布

- 严格遵循 Semver：**MAJOR**（破坏性）/ **MINOR**（新功能向后兼容）/ **PATCH**（bugfix）
- **每次分发前必须 bump `version`**：Claude Code 靠版本号决定是否触发 `plugin update`
- 维护 `CHANGELOG.md`，marketplace 条目的 `version` 与 `plugin.json` 的 `version` **保持一致**（`strict: true` 时以 plugin.json 为准）
- GitHub 发布推荐流程：更新 `plugin.json` → 更新 CHANGELOG → tag → push；`marketplace.json` 里用 `ref: "vX.Y.Z"` 锚定

---

## 关键 API（摘要）

| 对象 | 要点 |
|------|------|
| `plugin.json` | 必填 `name`；可选 `version / description / author / skills / commands / agents / hooks / mcpServers / lspServers / monitors / dependencies / channels / userConfig` |
| `marketplace.json` | 必填 `name / owner / plugins`；source 支持 相对路径 / github / url / git-subdir / npm |
| `${CLAUDE_PLUGIN_ROOT}` | 当前版本根目录（易变） |
| `${CLAUDE_PLUGIN_DATA}` | 用户级持久目录（跨版本） |
| `/plugin` | install / enable / disable / marketplace add / validate |
| `/reload-plugins` | 热重载 |
| `claude plugin ...` | CLI 等价命令 + `--scope` / `--keep-data` / `--json` 等开关 |
| 作用域 | user / project / local / managed（优先级递增） |

## 注意事项

- Plugin 启用后 skill 会被**命名空间化**成 `/<plugin-name>:<skill>`，接受这个心智再做分发
- **自定义路径字段会禁用默认位置扫描**——只加一条自定义 skills 路径就得把所有 skills 都纳入
- `bin/` 下的可执行文件会临时加到 Bash tool 的 PATH，注意不要覆盖系统命令名
- 路径穿越被禁止，外部共享代码用 symlink 或复制进插件目录
- `${CLAUDE_PLUGIN_DATA}` 才是状态持久化的正确位置；写到 `ROOT` 下的文件**升级即丢**
- `strictKnownMarketplaces` 一旦启用，预置在 `extraKnownMarketplaces` 的 marketplace 也必须通过 allowlist 校验
- 私有 Git 仓库走本地 `git` 凭据；CI 无人值守要设 `GITHUB_TOKEN` 等环境变量
- 发布前忘记 bump version 是最常见的"用户反映没更新"原因

## 组合提示

- **搭配 `claude-code-settings`**：用 managed settings 做企业下发（`enabledPlugins` / `strictKnownMarketplaces`）
- **搭配 `claude-code-slash-commands`**：plugin 内 `skills/` 本质是一组打包好的 slash command
- 开发 hook / MCP server 时搭配 Claude Code 的 hooks 与 MCP 文档使用（`${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_PLUGIN_DATA}` 是核心粘合点）
