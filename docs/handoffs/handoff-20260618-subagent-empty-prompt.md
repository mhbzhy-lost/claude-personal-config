# Handoff：opencode-dynamic-workflow 子代理空 prompt 修复 & e2e dashboard 治理

**日期**：2026-06-18
**范围**：父仓 `claude-config` 的 `vendor/opencode-dynamic-workflow` submodule
**当前状态**：修复完成、测试全绿、尚未 commit

---

## 一、原始问题

通过 opencode-dynamic-workflow 的 DAG / phase 编排调用 `wf.agent("coder" | "general" | "explore", prompt)` 时，
**子代理 session 在 DB 中被创建，但从未真正执行**：

- `session.prompt()` 瞬间返回 `output: ""`、`durationMs ~= 2700ms`
- DB：该 session `time_created == time_updated`，`message` 表 0 行、`part` 表 0 行
- worktree 上的所有 commit 的 git tree hash 全是空值，agent 声称写出的文件 hash 在 git 中不存在
- 文件实际被写到脚本的 CWD 而非 worktree，agent 根本没收到 `directory` 覆盖

**最早表现**：主 agent 通过 workflow 跑多 agent 协作时，phase 1 / 2 / 3 表面上"全部 completed"，但 worktree 上没有任何产物，导致后续 `autoMerge` 合并空 commit、`consolidatePhase` 失败。

---

## 二、根因（两轮挖掘）

### 第一轮：workflow 框架本身的 4 个 bug（已修，160/160 测试通过）

1. **Layer 继承 bug**（`lib/runner.mjs:686-691`）：layer N+1 的 worktree 从 `${baseBranch}-acc` 创建，应直接从 `baseBranch` 创建 + 把 N 层的累积 commit cherry-pick 到新的 accumulator。
2. **空 staging 提交失败**（`lib/worktree.mjs:106`）：`consolidatePhase` 的 `git commit -m ...` 在 staging 区为空时报错，已加 `--allow-empty`。
3. **merge-gate 缺 import**（`lib/merge-gate.mjs:48`）：`exec` 被引用但从未 import，加了 `defaultExec = promisify(execFile)` fallback。
4. **SKILL.md 类型混乱**：文档里的 agent type 表同时写 `"general"/"explore"/"coder"` 与 opencode 的内置 agent，已统一。

→ 推过一次 submodule commit `1ab987e`，父仓 bump 到 `8467511`。

### 第二轮：真正的空 prompt bug（本轮主修）

**最小可复现**：
```js
const wf = await createWorkflow({})
const r = await wf.agent("coder", "Create a file called t.txt")
// status: "completed", output: "", durationMs: 2762
// DB 0 messages，没有任何文件创建
```

但同一段 SDK 调用换成 `agent: undefined` 或 `agent: "build"` 就正常工作（20s、4 messages、文件落地）。

**诊断路径**（systematic-debugging 严格走，关键证据如下）：

| 假设 | 证据 | 结论 |
|---|---|---|
| Server 不可达 | health = 200、URL 一致 | ✗ |
| HTTP body 损坏 | interceptor 抓到 `{"parts":[...]}` 正确发出 | ✗ |
| MCP / 全局配置太慢导致 server 不响应 prompt | `http-test.mjs` 用同一 server 直接调能跑通 | ✗ |
| **`agent:` 字段值被 server 拒绝** | `agent: "coder"` → 55ms 返回 `UnknownError`；`agent: "build"` → ~20s 跑通 | **✓** |

**根因双杀**：

1. **`runAgent` 把 workflow 的"角色标签"当 opencode agent 名透传**。
   opencode 内置只有 `build` / `plan` 两个 agent；`coder` / `explore` / `general` 是
   workflow 侧为 status.json、dashboard、session 标题设计的元数据标签，server 不认识就直接
   抛 `UnknownError`，导致 prompt 瞬间返回。
2. **SDK error 被静默吞掉**。hey-api SDK 在非 2xx 时返回 `{ error: {...}, request, response }`，
   没有 `data` 字段；`runAgent` 用 `result.data?.parts || []` 直接得到 `[]`，函数返回
   `status: "completed"`——失败伪装成成功。

> 为什么没被早期单元测试挡住：所有 runner 单元测试用 `_mockClient`，mock 永远返回
> 成功响应 `{ data: { parts: [...] } }`，永远走不到 SDK 真实 error 路径。

---

## 三、修复

### 3.1 Runner 侧（`lib/runner.mjs`）

```js
function resolveAgent(specType) {
  // opencode 内置只认 build / plan；其余都是 workflow 元数据标签，剥离
  if (specType === "build" || specType === "plan") return specType
  return undefined
}
```

- `runAgent` 不再透传 `spec.type`，改用 `resolveAgent()` 的返回值。
- 调用完 `session.prompt` 后**先检查 `result.error`**，存在就抛 synthetic error，让
  现有 `catch` 块记录 `status: "failed"`。

### 3.2 SKILL.md

显式声明两层语义的分离：

- **workflow agent type**：`coder` / `explore` / `general`，仅元数据，引擎剥离后使用
  opencode 默认的 `build` agent 执行。
- **opencode 内置 agent**：`build`（默认，通用编码）/ `plan`（只读规划）。
- 明确告诫用户**不要自定义新 agent 名字**（如 `researcher` / `reviewer`）并期望
  opencode 解析；自定义语义用 prompt 表达即可。

### 3.3 文档

新增 `docs/bugs/bug-subagent-empty-prompt.md`，覆盖 systematic-debugging 的 6 要素
（Symptom / Hypothesis space / Root cause / Why not caught earlier / Fix / Prevention）。

---

## 四、测试

| 项 | 结果 |
|---|---|
| 单元测试（41 suites，runner/ipc/dag/merge-gate/worktree/events/dashboard/...） | **156/156 pass** |
| e2e 测试（auto-serve / baseUrl / parallel / parallel-research.mjs 真实脚本） | **4/4 pass** |
| 全流程 `minimal-test.mjs`（`wf.agent("coder", "Create minimal-output.txt")`） | **status: completed，文件落地** |
| `agent-test.mjs` 对比（no-agent / coder / build 三种 spec.type） | **全部成功产出文件** |
| e2e 中 dashboard 自动 `open ` 次数 | **0**（见下） |

---

## 五、Dashboard 治理（e2e 漏网之鱼）

e2e 跑完后发现仍有 dashboard 被 `open` 拉起。排查路径：

- 第一轮只在 3 处 `createWorkflow({...})` 加了 `openDashboard: false`——治标但没堵住 `runner.mjs`
  的默认行为。
- `runner.mjs` 老逻辑是 `config.openDashboard !== false`，即 `undefined` 等同于"开启浏览器"。
- 第三个 e2e 用例 spawn `parallel-research.mjs` 子进程，脚本默认 `openDashboard = true`，
  测试没传 `--no-dashboard`，**而且断言里反而要求 stderr 出现 `open ` 字样**（断言本身就错了）。

**彻底修法**：

- `runner.mjs` 把"已就绪 HTML"和"启动浏览器"拆成两个独立 `if`：
  - 就绪通知：只要非 mock 就打印，纯信息无害。
  - `execFile("open", ...)`：改成 `config.openDashboard === true`——**必须显式开启**，
    `undefined` 不再触发。
- `e2e.test.mjs`：所有 3 处 `createWorkflow` 加 `openDashboard: false`；spawn 子进程
  加 `--no-dashboard`。
- 把错误的"断言 stderr 包含 `open `"改为"断言 stderr 不 包含 `open `"。
- JSDoc 同步更新：`@param {boolean} [config.openDashboard]` → "default: false; must be explicitly `true`"。

验证：`node --test "tests/*.test.mjs"` 全流程结束，`grep -c "\[workflow\] open " log = 0`。

---

## 六、当前未提交变更

submodule `vendor/opencode-dynamic-workflow` 工作树：

| 文件 | 改动 |
|---|---|
| `lib/runner.mjs` | `resolveAgent()` + `result.error` 检测 + dashboard 逻辑拆分 |
| `skills/workflow-usage/SKILL.md` | agent type 语义澄清 + 透传矩阵文档 |
| `tests/e2e.test.mjs` | 3 处 `createWorkflow` 加 `openDashboard: false`；spawn 加 `--no-dashboard`；修正断言方向 |

父仓 `claude-config`：

| 文件 | 改动 |
|---|---|
| `docs/bugs/bug-subagent-empty-prompt.md` | systematic-debugging 6 要素文档 |
| `vendor/opencode-dynamic-workflow` | 子模块指针待 bump |

---

## 七、待办（下一步）

**按用户指令触发时执行**（本次未 commit）：

1. 在 submodule 里：
   - `git add` 三个文件 + commit，message 走 `feat(runner): ...` 中文祈使句，禁止 AI 署名，body 解释 why。
   - `EXTERNAL_REVIEW_SKIP=1 git push`（submodule 推远端需要）。
2. 在父仓 `claude-config`：
   - `git add docs/bugs/bug-subagent-empty-prompt.md vendor/opencode-dynamic-workflow`
   - commit message：`fix(workflow): ...`，bump submodule 指针。
   - 直接 push 到 `opencode`（`AGENTS.md` 豁免本仓可走主线，无需分支）。
3. **建议追加（未列入本次 handoff）**：
   - 给 integration / e2e 测试加"真实 SDK + 失败 agent 名 → `status: failed`"负向用例，
     防止 `result.error` 静默吞掉的回归。
   - 评估 `coding-workflow.mjs` 默认 `openDashboard: false` 是否需要同步到其他 workflow
     脚本（目前只有 `parallel-research.mjs` 默认 `true`，CLI 有 `--no-dashboard`）。

---

## 八、关键文件 / 命令速查

```bash
# submodule 测试入口
cd vendor/opencode-dynamic-workflow
node --test tests/*.test.mjs      # 全 160 用例
node --test tests/e2e.test.mjs    # 4 个 e2e（耗时 ~90s）

# 复现原 bug（修之前 vs 修之后）
cd /tmp/workflow-test-*/ && node minimal-test.mjs

# DB 检查
sqlite3 ~/.local/share/opencode/opencode.db \
  "SELECT id, title, time_created, time_updated FROM session ORDER BY time_created DESC LIMIT 5"
sqlite3 ~/.local/share/opencode/opencode.db \
  "SELECT COUNT(*) FROM message WHERE session_id = '<sid>'"

# 看 opencode server 日志
tail -f ~/.local/share/opencode/log/opencode.log
```

---

## 九、关键引用

- bug 文档：`docs/bugs/bug-subagent-empty-prompt.md`
- systematic-debugging skill：`~/.agents/skills/systematic-debugging/SKILL.md`
- opencode SDK（`@opencode-ai/sdk@1.17.7`）runtime 与 `.d.ts` 签名不一致，**以
  `{ path:, body:, query: }` 包装形式为准**（hey-api `client.post` 会展开），不要
  看 `.d.ts` 的扁平签名。
- opencode 内置 agent 名只有 `build` / `plan`（`strings $(which opencode)` 验证）。
