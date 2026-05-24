# shared/policies/

跨 host 的 wrapper hook / plugin 复用同一份业务规则与文案，存放在此目录。
**不**是把所有 hook 都"统一"过来——仅限于各端确实都支持同一语义的场景。
harness 能力差异（例如某 host 没有对应 hook 类型）时尊重差异，不强行统一。

## 当前 SSOT 文件

| 文件 | 各端 wrapper | 何以共用 |
|---|---|---|
| `git-commit-hint.json` | `claude/hooks/git-commit-hint.sh`、`codex/hooks/git-commit-hint.sh`、`qwen/hooks/git-commit-hint.sh`、`opencode/plugins/git-commit-hint.js` | 各端都通过 PreToolUse / `tool.execute.before` 拦截 `git commit`，业务流程（commit-message skill + external-llm-review + 知识文档检查）相同 |
| `skill-resolve-preflight.json` | `claude/hooks/skill-resolve-preflight.sh`、`codex/hooks/skill-resolve-preflight.sh`、`qwen/hooks/skill-resolve-preflight.sh`、`opencode/plugins/skill-resolve-preflight.js` | 各端都需要在 `skill-catalog.resolve` 调用前强制 agent 先做意图识别。tool 名按 host 区分（OpenCode `skill-catalog_resolve` 单下划线 vs claude/codex/qwen 的 `mcp__*` 双下划线）；deny reason 文案完全共用 |

## 故意**不**进 SSOT 的本仓 hook

| Hook | 在 | 为什么不抽 |
|---|---|---|
| `dag-dispatch-hint.js` | OpenCode only | Claude / Codex 当前没有对应的 task 派发拦截 hook，"为统一而统一"会引入两份新 hook 代码却没有实际行为收益 |
| `coding-expert-rules-inject.sh` | Claude / Qwen（SubagentStart） | Codex / OpenCode 没有 SubagentStart 这种"sub-agent 启动时注入 context"的 hook 类型；Qwen Code 复用 claude 端脚本 |
| `external-llm-review-permission.{py,sh}` | Codex only | Codex 自己的 PermissionRequest hook 用于自动授权 review 子进程命令；其他 host 没有这种"命令准入"机制 |

## 引用约定

### Shell 端 (Claude / Codex / Qwen Code)

```bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POLICY_PATH="${SCRIPT_DIR}/../../shared/policies/<file>.json"
```

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

1. 各端**确实**都有对应 hook 类型可拦截同一场景
2. 业务规则 / 文案内容各端能用同一份（host-specific 字段如 tool 名通过 JSON
   的 `tool_names.<host>` 区分即可）
3. 各端 wrapper 都更新引用，不留 inline 文案副本
4. 在 `codex/hooks/tests/test_codex_hooks.py` 加 SSOT 一致性测试，确保未来
   不会有人把文案 inline 回去
