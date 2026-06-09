# Bug: SubagentStart 仍注入已移除的知识检索规则

## 现象

全局规则 `claude/CLAUDE.md` 已不再包含知识检索强制流程，但 Qwen 端
`SubagentStart` 仍注册 `coding-expert-rules-inject.sh`，该 hook 会把
`knowledge-retrieval-process.md` 注入 subagent 上下文，并追加“必须首先执行知识检索流程”。

## 根因 (6 要素)

1. **触发条件**：Qwen Code 派发 `coding-expert*` subagent 时触发
   `SubagentStart`。
2. **期望链路**：四端 subagent 派发/启动提示应只对齐当前全局规则中的
   DAG 并发、worktree 隔离、合并验证、冲突停下、后台模式。
3. **实际链路**：Qwen 仍通过 `claude/hooks/coding-expert-rules-inject.sh`
   注入旧知识检索流程；OpenCode 则单独维护一份 DAG 提示文案。
4. **关键假设失效**：历史实现把 knowledge retrieval 当成 subagent 启动强制规则；
   全局规则移除后没有同步淘汰 hook 内容。
5. **旁证**：`rg` 命中 `init_qwen.sh`、`claude/settings/settings-*.json`、
   `coding-expert-rules-inject.sh` 中仍有旧注入器与 `skill-catalog` 文案。
6. **潜在二次失效点**：如果四端继续各自内联提示，后续修改全局并发/Subagent规则
   仍会导致 OpenCode/Qwen/Claude/Codex 再次 drift。

## 影响范围

- Qwen subagent 会收到已经不属于全局规则的知识检索强制要求。
- 四端对 subagent 派发/启动的约束来源不统一。
- OpenCode 提示已经修过一次，但仍是内联文案，后续容易再次漂移。

## 修复原则

- 新增 `shared/policies/subagent-dispatch-hint.json` 作为四端共享提示内容单源。
- Claude / Qwen / Codex 的 `SubagentStart` 使用同一个 shared shell hook 注入该内容。
- OpenCode `task` 派发前插件读取同一个 shared policy。
- 删除旧 `coding-expert-rules-inject.sh` 知识检索注入器，并移除相关注册。

## 修复记录

- 已新增 `shared/policies/subagent-dispatch-hint.json`，保存四端共享的 DAG / 后台 /
  worktree 派发提示。
- 已新增 `shared/hooks/subagent-dispatch-hint.sh`，输出
  `SubagentStart.additionalContext`。
- Claude / Qwen / Codex 的 `SubagentStart` 注册已改为 shared hook。
- OpenCode `dag-dispatch-hint.js` 已改为读取同一 shared policy。
- 已删除 `claude/hooks/coding-expert-rules-inject.sh`，并移除 Qwen / Codex / settings
  中旧知识检索注入器引用。
- `skill-resolve-preflight` deny 文案已移除对 SubagentStart 知识检索注入的引用。
