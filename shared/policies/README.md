# shared/policies/

跨场景的 wrapper hook / plugin 复用同一份业务规则与文案，存放在此目录。
**不**是把所有 hook 都"统一"过来——仅限于各场景确实都支持同一语义的场景。
harness 能力差异（例如某场景没有对应 hook 类型）时尊重差异，不强行统一。

## 当前 SSOT 文件

| 文件 | 各场景 wrapper | 何以共用 |
|---|---|---|
| `skill-resolve-preflight.json` | `opencode/plugins/skill-resolve-preflight.js` | OpenCode 需要在 `skill-catalog.resolve` 调用前强制 agent 先做意图识别；deny reason 文案完全共用 |
| `subagent-dispatch-hint.json` | `opencode/plugins/dag-dispatch-hint.js` | 各端都要对齐 `userconf/AGENTS.md` 的 `## 并发` 与 `## Subagent` 规则 |
| `git-commit-hint.json` | `templates/knowledge-gate/.opencode/plugins/git-commit-hint.js`（源模板）→ 安装时渲染到目标项目 `.opencode/plugins/git-commit-hint.js`（vendored 副本） | knowledge-gate 项目级 plugin 的文案 SSOT；install-knowledge-gate.sh 把 JSON 中的 template 渲染进 JS 文件的 `HINT_TEXT` 占位符并写入目标 workspace |
| `todo-scan-policy.md` | `scripts/workflow/code-health-review.mjs`（scan-todos prompt） | TODO/FIXME 扫描白名单的 SSOT；workflow prompt 中的排除路径与本文件保持同步 |

## 各端工具名映射

共享 hook 脚本（如 `shared/hooks/external-review-gate.sh`）需要兼容不同场景的工具名：

| 概念 | OpenCode |
|---|---|
| Shell 执行 | `bash` |
| 文件编辑 | `edit` |
| 文件写入 | `write` |
| 文件读取 | `read` |
| MCP 工具 | `<srv>_<tool>` |

PreToolUse 的放行路径必须保持透明：**stdout 为空且 exit 0**。不要输出
`permissionDecision: "allow"`；某些 harness 不支持这个值。只有阻断路径输出结构化
`permissionDecision: "deny"`。

## 引用约定

### OpenCode plugin (cp 副本场景)

```js
const pluginDir = dirname(fileURLToPath(import.meta.url))
// CLAUDE_CONFIG_HOME 是首选；fallback 是 cp-copy 布局
// (init_opencode.sh 把 ~/.config/opencode/shared 软链到 repo/shared)
const repoRoot = process.env.CLAUDE_CONFIG_HOME || join(pluginDir, "..")
const policyPath = join(repoRoot, "shared/policies/<file>.json")
```

仓内 plugin 场景（unit test 或开发态）必须显式 set `CLAUDE_CONFIG_HOME`，
fallback 一层上对仓内布局解析无效。

## 添加新 SSOT 文件的检查清单

1. 各场景**确实**都有对应 hook 类型可拦截同一场景
2. 业务规则 / 文案内容各场景能用同一份（host-specific 字段如 tool 名通过 JSON
   的 `tool_names.<host>` 区分即可）
3. 各场景 wrapper 都更新引用，不留 inline 文案副本
