# Scenario: Code Health Review (Workflow 全能力真实场景测试)

> **用途**：主 agent 直接执行本场景，端到端验证 `opencode-dynamic-workflow`
> 提供的 6 项核心能力（见 §3）。测试规范与数据均落在本仓，可被任意
> opencode session 反复重跑。

---

## 1. 目标

主 agent 亲自启动 workflow 脚本，完成一个**真实可读**的仓内代码健康度评审
（针对 `claude-config` 自身）；过程中必须触发：

1. **并发**（≥3 agent 同层）
2. **Phase 顺序编排**（parallel + agent 串联）
3. **DAG 拓扑编排**（多层依赖 + 自动分层 + 层内并发）
4. **`{{id.output}}` / `{{id.error}}` / `{{id.status}}` 插值**
5. **双向通信** `needPrompt`（DAG 节点暂停 → 主 agent 注入 prompt）→ 触发
   `[workflow:need_agent]` 信号
6. **IPC 事件流**（`phase_start` / `phase_end` / `need_agent` / 最终
   `result.json` 全链路落盘）

**禁止**用 mock / 单元测试绕开；**必须**由主 agent 通过 Bash 真实启动
workflow 进程，并完成信号监听 + 写 prompt 文件的人工干预步骤。

## 2. 场景设定

### 2.1 目标仓

`claude-config` 自身（`$REPO = /Users/leshi.zhy/claude-config`）。

原因：
- 是主 agent 当前的工作目录，权限/路径零摩擦
- 仓内结构复杂：`userconf/`、`shared/`、`templates/`、`docs/`、`vendor/`
  子模块，扫描面广
- 评审结果可被主仓文档直接消费（产物回写 `docs/workflow/artifacts/`）

### 2.2 DAG 设计

```
Layer 1 (并发)   : scan-dead-refs    scan-todos    scan-perm
                       │                │             │
                       └────────────────┼─────────────┘
                                        ▼
Layer 2 (顺序)   :              synthesis
                                        │
                                        ▼
                                        ◆   ← needPrompt: priority-decision
                                        │
                       ┌────────────────┴────────────────┐
                       ▼                                   ▼
Layer 3 (并发)   : recommend-quickfix              recommend-sop
                       │                                   │
                       └────────────────┬──────────────────┘
                                        ▼
Layer 4 (顺序)   :             final-report
```

**7 节点 / 4 层 / 1 处 needPrompt / 2 处 `{{…}}` 插值**。

| # | id | type | 任务 |
|---|---|---|---|
| 1 | `scan-dead-refs` | `general` | 枚举 `userconf/` `shared/` `templates/` `docs/` 下所有软链 + 交叉校验目标是否存在，输出死链清单 |
| 2 | `scan-todos` | `general` | grep `TODO`/`FIXME`/`XXX` 并附文件路径、行号 |
| 3 | `scan-perm` | `general` | 读 `opencode/permission.allow`/`deny` 列表，标注每条规则的"覆盖范围"（宽/中/窄） |
| 4 | `synthesis` | `general` | 综合 3 份扫描报告，输出分类风险矩阵（**P0/P1/P2** + 条目计数） |
| 5 | `priority-decision` | `general` | **`needsPrompt: true`** — 主 agent 根据 synthesis 写入 `{quickfix_targets:[…], sop_topics:[…]}` |
| 6 | `recommend-quickfix` | `general` | 用 `{{synthesis.output}}` + `{{priority-decision.output}}` 生成 5 条可立刻执行的修复命令 |
| 7 | `recommend-sop` | `general` | 用 `{{synthesis.output}}` + `{{priority-decision.output}}` 生成 3 个需文档化的 SOP 主题 |
| 8 | `final-report` | `general` | 用 `{{synthesis.output}}` + `{{recommend-quickfix.output}}` + `{{recommend-sop.output}}` 生成结构化 Markdown 报告，**写入** `$REPO/docs/workflow/artifacts/code-health-<ts>.md` |

### 2.3 能力覆盖矩阵

| 能力 | 触发点 |
|---|---|
| `wf.parallel` | Layer 1 / Layer 3 隐式由 DAG 同层驱动 |
| `wf.agent` 单 agent | Layer 2 `synthesis` / Layer 4 `final-report` |
| `wf.dag` | 整体 7 节点拓扑 |
| `{{id.output}}` | `synthesis` (× 3) / `recommend-*` (× 2) / `final-report` (× 3) |
| `{{id.error}}` | `final-report` prompt 显式要求：若某个 recommend 节点 error，也要出现在报告里 |
| `{{id.status}}` | `final-report` prompt 要求打印节点状态摘要 |
| `needPrompt` | `priority-decision` 节点 emit `[workflow:need_agent]`，由主 agent 写 `agent_prompt_priority-decision.json` |
| IPC 事件 | `events/*.jsonl` + `.workflow/result.json` + `.workflow/commands/agent_prompt_*.json` |

## 3. 文件清单

| 路径 | 角色 |
|---|---|
| `docs/workflow/real-scenario-code-health-review.md` | **本文档**（可复用测试规范） |
| `scripts/workflow/code-health-review.mjs` | workflow 脚本（`$REPO/scripts/workflow/`） |
| `docs/workflow/artifacts/code-health-<ts>.md` | 最终报告产物（workflow 自动写） |

## 4. 执行步骤

### 4.1 主 agent 侧

1. `cd $REPO`（或通过 `workdir` 参数）。
2. 在 Bash 中启动 workflow，**stdout 重定向到文件**（方便监听信号）：

   ```bash
   node "$REPO/scripts/workflow/code-health-review.mjs" \
        --no-dashboard --skip-permissions \
        > "$REPO/.workflow/main-stdout.log" 2>&1 &
   WORKFLOW_PID=$!
   echo "WF_PID=$WORKFLOW_PID"
   ```

3. 用 Grep 监听 `.workflow/main-stdout.log`，等待
   `[workflow:need_agent]` 出现：

   ```bash
   until grep -q "need_agent" "$REPO/.workflow/main-stdout.log" 2>/dev/null; do sleep 1; done
   ```

4. 读 synthesis 输出，构造 priority-decision prompt（JSON object, 必填字段
   `prompt`），写入 `.workflow/commands/agent_prompt_priority-decision.json`：

   ```bash
   cat > "$REPO/.workflow/commands/agent_prompt_priority-decision.json" <<'EOF'
   {"prompt": "..."}
   EOF
   ```

5. `wait $WORKFLOW_PID`（或 `tail -f` 直到 `shutdown` 事件出现）。
6. 退出后校验（见 §5）。

### 4.2 脚本侧（`code-health-review.mjs`）

```js
import { createWorkflow } from "../../vendor/opencode-dynamic-workflow/lib/runner.mjs"
import { fileURLToPath } from "node:url"
import { dirname, join, resolve } from "node:path"

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..")

const wf = await createWorkflow({
  // model 省略，使用 opencode 默认模型配置
  workdir: join(REPO, ".workflow"),
  maxConcurrent: 4,
  openDashboard: false,
  dangerouslySkipPermissions: true,
})

await wf.dag([
  { id: "scan-dead-refs", type: "general", deps: [],
    prompt: "在 $REPO/{userconf,shared,templates,docs} 下，列出所有软链并" +
            "验证其目标是否存在。仅输出死链清单（无死链输出 'OK'）。" },
  { id: "scan-todos", type: "general", deps: [],
    prompt: "grep $REPO/userconf/ 与 $REPO/shared/ 下所有 TODO/FIXME/XXX " +
            "注释，附文件相对路径 + 行号。" },
  { id: "scan-perm", type: "general", deps: [],
    prompt: "解析 $REPO/userconf/opencode.json 中的 permission.allow / " +
            "permission.deny，逐条标注'覆盖范围'（宽/中/窄）。" },
  { id: "synthesis", type: "general",
    deps: ["scan-dead-refs", "scan-todos", "scan-perm"],
    prompt: "综合以下 3 份扫描报告，输出分类风险矩阵，" +
            "每条标 P0 / P1 / P2 并附条目计数：\n" +
            "### dead-refs\n{{scan-dead-refs.output}}\n" +
            "### todos\n{{scan-todos.output}}\n" +
            "### perm\n{{scan-perm.output}}\n" +
            "若某节点 status !== 'ok'，使用 {{scan-*.error}} 说明失败原因。" },
  { id: "priority-decision", type: "general", deps: ["synthesis"],
    needsPrompt: true },
  { id: "recommend-quickfix", type: "general",
    deps: ["synthesis", "priority-decision"],
    prompt: "基于 synthesis：{{synthesis.output}}\n" +
            "和主 agent 优先决策：{{priority-decision.output}}\n\n" +
            "输出 5 条可立刻执行的 Bash/Node 修复命令（P0 优先）。" },
  { id: "recommend-sop", type: "general",
    deps: ["synthesis", "priority-decision"],
    prompt: "基于 synthesis：{{synthesis.output}}\n" +
            "和主 agent 优先决策：{{priority-decision.output}}\n\n" +
            "输出 3 个需要沉淀为 SOP 的主题（每条含 why / 建议落文档路径）。" },
  { id: "final-report", type: "general",
    deps: ["synthesis", "recommend-quickfix", "recommend-sop"],
    prompt: "将本次评审整理为结构化 Markdown 报告，写入 " +
            "$REPO/docs/workflow/artifacts/code-health-<ISO-ts>.md。" +
            "报告结构：Executive Summary / 扫描发现 / 修复命令 / SOP 议题 / " +
            "错误回顾（{{recommend-quickfix.error}} / " +
            "{{recommend-sop.error}}）/ 节点状态（status 摘要）。" }
])

wf.shutdown()
console.log(JSON.stringify({ ok: true, reportDir: join(REPO, "docs/workflow/artifacts") }, null, 2))
```

### 4.3 主 agent 写 priority-decision prompt 模板

```json
{
  "prompt": "根据 synthesis 报告（见上下文）：\n" +
            "- quickfix_targets: 选出 ≤ 5 条可立即通过命令修复的 P0 项；\n" +
            "- sop_topics: 选出 ≤ 3 个需沉淀为长期 SOP 的 P1/P2 主题。\n" +
            "输出 JSON，字段 quickfix_targets (list[str]) + sop_topics (list[str])。"
}
```

## 5. 验收清单

| # | 检查项 | 命令 / 路径 |
|---|---|---|
| 1 | workflow 进程退出码 0 | `echo $?` |
| 2 | `result.json` 7 个节点全为 `ok` | `jq '.agents \| length' .workflow/result.json` |
| 3 | 每个节点 `output` 非空 | `jq '.agents[] \| .output \| length' .workflow/result.json` |
| 4 | `need_agent` 事件落盘至少 1 次 | `grep -c need_agent .workflow/main-stdout.log` |
| 5 | `agent_prompt_priority-decision.json` 存在 | `ls .workflow/commands/` |
| 6 | `phase_start` / `phase_end` 事件成对（共 4 层 → 8 条） | `grep -E 'phase_start\|phase_end' .workflow/events/*.jsonl` |
| 7 | 最终报告文件 `docs/workflow/artifacts/code-health-<ts>.md` 被写入且非空 | `ls -la docs/workflow/artifacts/` |
| 8 | 报告包含"错误回顾"与"节点状态"小节（验证 `{{*.error}}` / `{{*.status}}` 插值成功） | 阅读报告尾部 |

## 6. 可复用执行

每次重跑前先清理：

```bash
rm -rf $REPO/.workflow
rm -f $REPO/docs/workflow/artifacts/code-health-*.md
```

然后按 §4 重新执行即可。

## 7. 已知限制

- 主 agent 必须在 60s 内响应 `need_agent` 信号，否则 `needPrompt` 触发
  `pollTimeoutMs` 超时，workflow 整体失败。
- `priority-decision` 节点的 prompt 由主 agent 手工构造，
  质量直接影响最终报告。
- 测试不校验"报告内容是否合理"——只校验工程行为（事件 + 插值 + 输出文件）。
  内容质量属于评审本身，不在本测试范围。

## 8. 首次执行结果（2026-06-17）

### 8.1 执行概况

| 维度 | 值 |
|---|---|
| 日期 | 2026-06-17 |
| 主 agent 模型 | `openai-bailiab-api/qwen-latest-series-invite-beta-v34-256k` |
| workflow 默认模型 | 同上（opencode 配置默认） |
| 总耗时（workflow 自身） | 约 4 分 53 秒 |
| 总耗时（含人工决策） | 约 5 分钟 |
| 退出码 | 0 |
| 触发 agent 数 | 8 |

### 8.2 验收清单

| # | 检查项 | 期望 | 实际 | 结果 |
|---|---|---|---|---|
| 1 | 节点全部 `completed` | 8 | 8 | ✅ |
| 2 | 每个 `output` 非空 | 全部 > 0 | 28 ~ 3541 | ✅ |
| 3 | `need_agent` 事件落盘 ≥1 | ≥1 | 1 | ✅ |
| 4 | `agent_prompt_priority-decision.json` 写入 | 存在 | 1 个文件 | ✅ |
| 5 | `phase_start` / `phase_end` 成对 | 5/5 | 5/5 | ✅ |
| 6 | `final-report` 产物落地 | 存在于 `artifacts/` | `code-health-20260617T112437Z.md` (6.8 KB) | ✅ |
| 7 | 报告结构完整（6 章 + 错误回顾 + 节点状态） | 含 §1-§6 | 6 章全齐 | ✅ |
| 8 | 插值生效（synthesis/recommend-*/error/status 均在报告中出现） | 全部出现 | 全部出现 | ✅ |

### 8.3 能力覆盖验证

| 能力 | 触发点 | 验证 |
|---|---|---|
| `wf.parallel` | scan-* (3 路, layer 1) + recommend-* (2 路, layer 4) | ✅ phase_end 显示 3 + 2 同层并发 |
| `wf.agent` | synthesis (layer 2) + priority-decision (layer 3) + final-report (layer 5) | ✅ 各层单独 agent |
| `wf.dag` | 5 层拓扑（spec §2.2 设计为 4 层，引擎按 deps 自动拆 5 层） | ✅ |
| `{{id.output}}` | synthesis 接收 3 个上游 / recommend-* 各 2 个 / final-report 接收 3 个 | ✅ 报告 §2 含完整 synthesis，§3 §4 含 recommend |
| `{{id.error}}` | final-report 报告尾部含"错误回顾"表 | ✅（全部 completed 故为空） |
| `{{id.status}}` | final-report §6"节点状态"表 | ✅ 显示 completed |
| `needPrompt` | priority-decision 阻塞 → 主 agent 写 prompt | ✅ need_agent 事件 1 次 → 1 个 prompt 文件落盘 → 节点 unblock |
| IPC | `.workflow/` 完整生命周期 | ✅ status.json / result.json / commands/ / events/ 均有数据 |

### 8.4 关键产物

- **脚本**：`scripts/workflow/code-health-review.mjs`
- **stdout 日志**：`.workflow-stdout.log`
- **IPC 目录**：`.workflow/`（status.json / result.json / commands/ / events/）
- **最终报告**：`docs/workflow/artifacts/code-health-20260617T112437Z.md`

### 8.5 关键发现（关于 workflow 实现）

1. **实际分层 5 而非设计 4**：`wf.dag` 严格按依赖拓扑自动分层。设计图把
   `priority-decision` 看作 synthesis 的一部分，但引擎视其为独立节点层
   （仅 1 个节点）。这不影响正确性，但与 §2.2 的"7 节点 / 4 层"不符，
   建议阅读时以引擎输出为准。
2. **`needPrompt` idle-aware 超时（300 秒）**：超时仅在所有节点都空闲时计时。
   同层有其他 agent 运行时，即使当前节点等待很久也不超时。
   超时后 `wf.dag()` reject，进程非零退出（整体失败，不会部分完成）。
   本场景主节点 `priority-decision` 单独一层，无兄弟节点，
   故超时从 DAG 到达该层时开始计 300 秒。实测 15 秒内完成，余量充足。
3. **事件格式**：stdout 格式 `[workflow:<type>] <JSON>`，
   `need_agent`（非 `need_prompt`）是当前实现使用的 type 标识，与
   `workflow-usage` skill 描述有出入，以 `runner.mjs` 为准。
4. **插值容错**：`{{id.error}}` 在节点 `completed` 时展开为空字符串
   （非 `undefined`），报告结构不会因此破坏。

### 8.6 后续复用

- 重跑前先按 §6 清理
- 若需测 `{{id.error}}` 失败路径，可在脚本里故意给某节点写不可能任务
  （如"在 1 秒内解析 1 GB 日志"）触发 error
- 若需测 `--resume` 断点续跑，可在 phase 2 完成后手动 `kill` 进程，
  再用 `--resume` 重跑
