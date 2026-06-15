# OpenCode Dynamic Workflow 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 OpenCode 上实现类似 Claude Code dynamic workflows 的编排能力，用 JS 脚本替代逐轮 prompt 决策，提高 subagent 编排的确定性、可复用性和细粒度控制能力。

**Architecture:** 独立子模块 `vendor/opencode-dynamic-workflow`，拥有自己的 `install-opencode.sh` 配置脚本，也可被主仓 `init_opencode.sh` 一键配置。workflow 脚本作为后台常驻进程运行，通过 OpenCode SDK 派发和管理 subagent session，通过文件系统（项目目录下 `.workflow/`）与主 agent 实现双向通信。

**Tech Stack:** Node.js ESM 脚本、OpenCode JS SDK (`@opencode-ai/sdk`)、文件系统 IPC（JSON 文件 + 目录监听）。

---

## 外部约束确认

- OpenCode SDK 提供完整的 session 管理 API：`session.create()`、`session.prompt()`、`session.abort()`、`event.subscribe()`。来源：https://opencode.ai/docs/sdk/
- OpenCode `opencode run` CLI 支持非交互模式执行 prompt。来源：https://opencode.ai/docs/cli/
- OpenCode 后台 subagent 仍是 experimental 特性，需要 `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true`。来源：v1.17.7 二进制代码验证。
- Claude Code dynamic workflows 使用 JS 脚本 + 独立 runtime 架构，并发上限 16，总 agent 上限 1000，支持断点续跑。来源：https://docs.anthropic.com/en/docs/claude-code/workflows
- 当前 DAG 插件 (`opencode/plugins/dag-dispatch-hint.js`) 读取 `shared/policies/subagent-dispatch-hint.json` 作为四端共享的单一来源。改动需同步四端。来源：`docs/knowledge/subagent-dispatch-hook.md`

## 背景与动机

### 当前方案的问题

1. **确定性不足**：模型逐轮决策容易忘记并发规则，DAG 插件作为补丁拦截不合规派发，但本质是"用自然语言约束自然语言"，执行确定性天然弱一档。
2. **DAG 插件粒度过粗**：无条件拦截所有 `task` 调用，只读探索也需手动加 `skip-dag-hint` 标记才能放行，增加交互摩擦和 token 消耗。
3. **编排不可复用**：同类任务每次都要模型重新决策编排路径，无法保存和重复执行。
4. **无法实时干预**：后台 subagent 派发后，主 agent 只能等待结果，不能对单个 agent 进行停止、重启或追加操作。

### 目标

- 把编排逻辑从 prompt 提升为代码，提高确定性
- 支持对单个 subagent 粒度的实时管理（停止、追加、替换）
- 可复用的编排模式（保存为 workflow 脚本反复运行）
- 主 agent 不被阻塞，可在 workflow 执行中查看状态和发送指令
- 完全替换 DAG 插件拦截机制

### 非目标

- 1000 agent 规模（实际场景 2-10 个，并发上限设为 10）
- 独立的 workflow runtime 进程管理（如 Claude Code 的 supervisor）
- 内置 workflow（如 `/deep-research`）

## 核心架构

### 总体流程

```
用户提出任务
    │
    ▼
主 agent 判断：是否需要 workflow？
    │
    ├─ 简单任务 / 单个只读 subagent → 直接派发（现有行为）
    │
    └─ 复杂多 agent 编排 → 生成 JS workflow 脚本
                               │
                               ▼
                    主 agent 通过 bash 后台启动脚本
                    node workflow.mjs &
                               │
                               ▼
                    脚本作为常驻进程运行：
                    - 通过 OpenCode SDK 创建 session、派发 agent
                    - 实时写入 .workflow/status.json 和 events/
                    - 轮询 .workflow/commands/ 接收主 agent 指令
                               │
                               ▼
                    主 agent 通过 bash 与 workflow 交互：
                    - cat .workflow/status.json     ← 查状态
                    - 写 .workflow/commands/NNN.json ← 发指令
                    - cat .workflow/result.json     ← 读最终结果
```

### 文件系统 IPC 协议

`.workflow/` 生成在当前工作项目根目录下（`process.cwd()`），不放用户 home 目录。
`ipc.mjs` 初始化时自动将 `.workflow` 追加到项目 `.gitignore`（如已存在则跳过）。

```
.workflow/                          ← 项目根目录下的临时通信目录（gitignored）
├── pid                             ← workflow 进程 PID
├── status.json                     ← 实时状态（进程每次 agent 状态变化时更新）
├── dashboard.html                  ← 自包含静态 HTML（status.json 变化时自动重新生成）
├── result.json                     ← 最终结果（所有阶段完成后写入）
├── snapshot.json                   ← 断点快照（暂停时或每阶段完成后写入，用于续跑）
├── script.mjs                      ← 本次运行的脚本副本（可审计）
├── events/                         ← 事件流（追加写入，按序号排列）
│   ├── 001.json                    ← { type: "agent_completed", agent: "A", result: "..." }
│   ├── 002.json                    ← { type: "agent_failed", agent: "B", error: "..." }
│   └── ...
└── commands/                       ← 指令队列（主 agent 写入，workflow 进程消费）
    ├── 001.json                    ← { action: "stop", agent: "agent-id" }
    ├── 002.json                    ← { action: "spawn", type: "explore", prompt: "..." }
    └── ...
```

### status.json 结构

```json
{
  "state": "running",
  "phase": 1,
  "totalPhases": 3,
  "startedAt": "2026-06-15T10:00:00Z",
  "agents": {
    "agent-1": {
      "type": "explore",
      "status": "completed",
      "prompt": "搜索 auth 模块依赖",
      "sessionId": "ses_xxx",
      "startedAt": "...",
      "completedAt": "...",
      "resultSummary": "找到 3 个依赖..."
    },
    "agent-2": {
      "type": "general",
      "status": "running",
      "prompt": "分析 session 模块",
      "sessionId": "ses_yyy",
      "startedAt": "...",
      "lastActivityAt": "..."
    }
  }
}
```

`state` 字段取值：`running` | `paused` | `completed` | `aborted`。

### 指令类型

| action | 参数 | 行为 |
|---|---|---|
| `stop` | `{ agent: "agent-id" }` | 停止指定 agent（调用 `session.abort()`） |
| `spawn` | `{ type, prompt, phase? }` | 追加一个新 agent 到当前或指定阶段 |
| `abort` | 无 | 终止整个 workflow，停止所有运行中的 agent |
| `pause` | 无 | 暂停 workflow：等待运行中的 agent 完成当前轮次后挂起，不再派发新 agent，写入 `snapshot.json` |
| `resume` | 无 | 恢复已暂停的 workflow，从 snapshot 继续执行剩余阶段和 agent |
| `update_phase` | `{ phase, agents: [...] }` | 修改尚未开始的阶段的 agent 列表 |
| `skip_phase` | `{ phase }` | 跳过指定的后续阶段 |

### 暂停/恢复与断点续跑

**暂停**（`pause` 指令）：
- workflow 进程收到 `pause` 后，将 `status.json` 的 `state` 设为 `paused`
- 等待所有 `running` 状态的 agent 完成当前轮次（不强制 abort）
- 不再从队列中取出新 agent 派发
- 将当前完整状态写入 `snapshot.json`：已完成 agent 的结果、待执行的阶段和 agent 定义、脚本路径
- 进程进入 sleep 循环，仅继续轮询 `commands/` 等待 `resume` 或 `abort`

**恢复**（`resume` 指令）：
- 从 `snapshot.json` 恢复状态，将 `state` 设为 `running`
- 已完成的 agent 直接使用缓存结果，不重跑
- 继续派发剩余 agent

**断点续跑**（进程重启场景）：
- workflow 进程每完成一个阶段自动写入 `snapshot.json`
- 若进程异常退出，主 agent 可检测到 `pid` 文件对应的进程不存在
- 主 agent 重新启动脚本时传入 `--resume` 参数：`node workflow.mjs --resume`
- 脚本检测到 `.workflow/snapshot.json` 存在，从断点恢复而非从头开始

**snapshot.json 结构**：

```json
{
  "snapshotAt": "2026-06-15T10:05:00Z",
  "completedPhases": [1],
  "currentPhase": 2,
  "completedAgents": {
    "agent-1": { "output": "...", "status": "completed" },
    "agent-3": { "output": "...", "status": "completed" }
  },
  "pendingSpecs": [
    { "type": "general", "prompt": "...", "phase": 2 },
    { "type": "explore", "prompt": "...", "phase": 3 }
  ],
  "scriptPath": ".workflow/script.mjs"
}
```

### 超时策略

- **总超时**：不设置
- **chunk 超时**：单个 agent 超过 120s 没有新的流式输出事件 → 判定超时
- **超时处理**：标记该 agent 为 `timed_out`，写入事件，不影响其他 agent
- **实现**：workflow 进程通过 `event.subscribe()` 监听 session 事件流，记录每个 agent 的 `lastActivityAt`，定时检查

## 文件结构

### 子模块 `vendor/opencode-dynamic-workflow/`（独立 git 仓库）

```
vendor/opencode-dynamic-workflow/
├── lib/
│   ├── runner.mjs              ← 核心库：SDK session 管理、并发控制、超时检测
│   ├── ipc.mjs                 ← IPC 模块：status / events / commands / snapshot
│   └── dashboard.mjs           ← dashboard 渲染：status.json → 静态 HTML
├── workflows/                  ← 预定义 workflow 模板
│   ├── codebase-audit.mjs
│   └── parallel-research.mjs
├── plugins/                    ← OpenCode 插件（替代 dag-dispatch-hint）
│   └── workflow-hint.js        ← 多 agent 编排场景时提示使用 workflow
├── install-opencode.sh         ← 独立配置脚本
├── package.json                ← 声明 @opencode-ai/sdk 依赖
├── .gitignore
└── README.md
```

### 主仓 `claude-config/` 中的改动

- Modify: `init_opencode.sh`
  - 新增 `vendor/opencode-dynamic-workflow` 配置调用（同 opencode-cache-proxy 模式）。
- Modify: `opencode/plugins/dag-dispatch-hint.js`
  - 移除或标记废弃，由子模块 `plugins/workflow-hint.js` 替代。
- Modify: `shared/policies/subagent-dispatch-hint.json`
  - 更新 policy 文本：反映 workflow 优先的编排策略。
- Modify: `shared/hooks/subagent-dispatch-hint.sh`
  - 跟随 policy 更新（仅读取 JSON，不含逻辑变化）。
- Modify: `claude/CLAUDE.md` §并发、§Subagent
  - 规则切换为 workflow 优先策略。
- Modify: `claude/CLAUDE.reason.md` §并发、§Subagent
  - 同步更新 why 伴文。
- Modify: `codex/hooks/tests/test_codex_hooks.py`
  - 更新回归测试以匹配新 policy。
- Modify: `docs/knowledge/subagent-dispatch-hook.md`
  - 更新项目知识文档。
- Create: `docs/knowledge/opencode-dynamic-workflow.md`
  - 新增项目知识：workflow 架构、IPC 协议、使用约定。

### 安装路径

`install-opencode.sh` 执行后的效果：
- `~/.config/opencode/plugins/workflow-hint.js` → 软链到子模块 `plugins/workflow-hint.js`
- `workflows/` 模板目录路径注入 OpenCode 配置（供 skill 或主 agent 引用）
- `npm install` 安装 `@opencode-ai/sdk` 依赖

`init_opencode.sh` 中的集成方式（同 opencode-cache-proxy）：
```bash
# vendor/opencode-dynamic-workflow
local workflow_install="$SRC/vendor/opencode-dynamic-workflow/install-opencode.sh"
if [ -f "$workflow_install" ]; then
  bash "$workflow_install" --no-interactive
fi
```

## 决策报告

### 1. 编排执行方式

- **推荐**：主 agent 内通过 bash 后台启动 JS 脚本，因为复用现有工具链，不需要 OpenCode 新功能支持
- **不选 OpenCode 插件执行**：插件 API 没有长时运行进程管理能力
- **不选独立进程 + API 方案**：开发量最大，且需要独立的进程管理
- **选错代价**：开发阶段暴露，修复代价 中

### 2. 主 agent 与 workflow 的通信方式

- **推荐**：文件系统 IPC（`.workflow/` 目录 + JSON 文件），因为 bash 工具天然支持文件读写，无需新基础设施
- **不选 stdin/stdout 双向流**：bash 工具不支持交互式管道
- **不选 HTTP API**：需要额外的 server，增加复杂度
- **选错代价**：开发阶段暴露，修复代价 低（IPC 协议可以替换，核心逻辑不变）

### 3. DAG 插件改造策略

- **推荐**：完全替换为 workflow 模式提示（用户已确认）
- **不选分级放行 + 保留拦截**：与 workflow 架构定位重复，长期维护两套机制成本高
- **不选两者并存过渡**：增加理解成本，且目标明确不需要过渡期
- **选错代价**：第二期上线时暴露，修复代价 中（需回退 policy + 插件 + 规则三处）

### 4. SDK 连接方式

- **推荐**：workflow 脚本直接连接已运行的 OpenCode server（TUI 启动时自动有 server），因为零额外配置
- **不选脚本自行启动 server**：复杂度高，端口冲突风险
- **选错代价**：运行时暴露（server 未运行时脚本报错），修复代价 低（加启动检测 + 提示）

## 任务分解与 DAG

```
T1: workflow-runner 核心库        ─┐
T2: IPC 通信模块                   ─┤── 可并发（T2 依赖 T1 的接口定义，但可先定接口后并行实现）
T3: workflow 示例脚本              ─┘
         │
         ▼
T4: 端到端集成验证                  ← 依赖 T1, T2, T3
         │
         ▼
T5: DAG 插件改造                   ─┐
T6: 四端共享 policy + 规则更新      ─┤── 可并发（但需原子提交）
T7: 回归测试更新                    ─┘
         │
         ▼
T8: 项目知识沉淀 + 最终验证         ← 依赖 T5, T6, T7
```

### 分期

- **第一期**（T1-T4）：核心能力 + 验证。不改规则和插件，先验证 workflow runner 在实际场景中好用。
- **第二期**（T5-T8）：规则切换 + 插件替换 + 四端同步。在第一期验证通过后执行。

---

## 第一期任务

### Task 1: 子模块初始化 + workflow-runner 核心库

**Files:**
- Create: `vendor/opencode-dynamic-workflow/` （独立 git 仓库）
- Create: `vendor/opencode-dynamic-workflow/lib/runner.mjs`
- Create: `vendor/opencode-dynamic-workflow/package.json`（声明 `@opencode-ai/sdk` 依赖）

- [ ] **Step 1: 定义 runner 公开 API 的类型签名和 JSDoc**

```javascript
// vendor/opencode-dynamic-workflow/lib/runner.mjs

/**
 * @typedef {Object} WorkflowConfig
 * @property {string} [baseUrl="http://127.0.0.1:4096"] - OpenCode server URL
 * @property {string} [workdir=".workflow"] - IPC 通信目录路径
 * @property {number} [maxConcurrent=10] - 最大并发 agent 数
 * @property {number} [chunkTimeoutMs=120000] - 流式输出无活动超时（ms）
 */

/**
 * @typedef {Object} AgentSpec
 * @property {string} type - subagent 类型（explore / general / scout）
 * @property {string} prompt - agent 任务 prompt
 * @property {string} [id] - 自定义 agent ID（默认自动生成）
 * @property {string} [model] - 覆盖默认模型（provider/model 格式）
 */

/**
 * @typedef {Object} AgentResult
 * @property {string} id - agent ID
 * @property {"completed"|"failed"|"timed_out"|"stopped"} status
 * @property {string} [output] - agent 输出文本
 * @property {string} [error] - 错误信息
 * @property {number} durationMs - 执行耗时
 */

/**
 * 创建 workflow 实例。
 * @param {WorkflowConfig} [config]
 * @returns {Promise<Workflow>}
 */
export async function createWorkflow(config) { /* ... */ }
```

- [ ] **Step 2: 实现 SDK 连接和 server 健康检查**

```javascript
import { createOpencodeClient } from "@opencode-ai/sdk"

async function connectToServer(baseUrl) {
  const client = createOpencodeClient({ baseUrl })
  const health = await client.global.health()
  if (!health.data?.healthy) {
    throw new Error(
      `OpenCode server at ${baseUrl} is not healthy. ` +
      `Ensure 'opencode' TUI is running or start 'opencode serve'.`
    )
  }
  return client
}
```

- [ ] **Step 3: 实现 `wf.agent()` — 单 agent 派发**

```javascript
async function runAgent(client, spec, ipc, config) {
  const agentId = spec.id || `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

  // 创建 session
  const session = await client.session.create({
    body: { title: `workflow: ${spec.prompt.slice(0, 60)}` }
  })

  ipc.updateAgentStatus(agentId, {
    type: spec.type,
    status: "running",
    prompt: spec.prompt,
    sessionId: session.data.id,
    startedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
  })

  // 发送 prompt 并等待完成
  const result = await client.session.prompt({
    path: { id: session.data.id },
    body: {
      ...(spec.model ? { model: parseModel(spec.model) } : {}),
      agent: spec.type,
      parts: [{ type: "text", text: spec.prompt }],
    },
  })

  // 提取最终文本
  const output = result.data?.parts
    ?.filter(p => p.type === "text")
    ?.map(p => p.text)
    ?.join("\n") || ""

  return { id: agentId, status: "completed", output, durationMs: /* ... */ }
}
```

- [ ] **Step 4: 实现 `wf.parallel()` — 并发派发 + 并发上限**

```javascript
async function runParallel(client, specs, ipc, config) {
  const results = []
  const running = new Set()
  const queue = [...specs]

  while (queue.length > 0 || running.size > 0) {
    // 填充到 maxConcurrent
    while (queue.length > 0 && running.size < config.maxConcurrent) {
      const spec = queue.shift()
      const promise = runAgent(client, spec, ipc, config)
        .catch(err => ({
          id: spec.id,
          status: "failed",
          error: err.message,
          durationMs: 0,
        }))
      running.add(promise)
      promise.then(result => {
        running.delete(promise)
        results.push(result)
        ipc.emitEvent({ type: `agent_${result.status}`, agent: result.id, ...result })
      })
    }

    // 等待任一完成
    if (running.size > 0) {
      await Promise.race(running)
    }
  }

  return results
}
```

- [ ] **Step 5: 实现 chunk 超时检测**

```javascript
// 在 runAgent 中包装超时逻辑
function withChunkTimeout(promise, agentId, ipc, timeoutMs) {
  return new Promise((resolve, reject) => {
    let lastActivity = Date.now()
    const timer = setInterval(() => {
      if (Date.now() - lastActivity > timeoutMs) {
        clearInterval(timer)
        ipc.emitEvent({
          type: "agent_timed_out",
          agent: agentId,
          reason: `No activity for ${timeoutMs}ms`,
        })
        // 尝试 abort session
        resolve({ id: agentId, status: "timed_out", error: "chunk timeout" })
      }
    }, 5000) // 每 5s 检查一次

    promise
      .then(result => { clearInterval(timer); resolve(result) })
      .catch(err => { clearInterval(timer); reject(err) })

    // lastActivity 由 event stream 回调更新
    // SDK event.subscribe() 每收到一个 event 就 touch
  })
}
```

- [ ] **Step 6: 实现指令队列消费（commands 轮询），含 pause/resume**

```javascript
// workflow 进程定期扫描 .workflow/commands/ 目录
async function processCommands(ipc, client, activeAgents, state) {
  const commands = ipc.consumeCommands()
  for (const cmd of commands) {
    switch (cmd.action) {
      case "stop":
        const session = activeAgents.get(cmd.agent)
        if (session) {
          await client.session.abort({ path: { id: session.sessionId } })
          ipc.updateAgentStatus(cmd.agent, { status: "stopped" })
          ipc.emitEvent({ type: "agent_stopped", agent: cmd.agent })
        }
        break
      case "spawn":
        if (state.paused) {
          // 暂停状态下收到 spawn，加入待执行队列但不立即派发
          state.pendingSpecs.push({ type: cmd.type, prompt: cmd.prompt, id: cmd.id })
          ipc.emitEvent({ type: "spawn_queued", agent: cmd.id, reason: "workflow paused" })
        } else {
          const spec = { type: cmd.type, prompt: cmd.prompt, id: cmd.id }
          runAgent(client, spec, ipc, config).then(/* ... */)
        }
        break
      case "pause":
        state.paused = true
        ipc.updateState("paused")
        ipc.emitEvent({ type: "workflow_paused" })
        // 写入断点快照（运行中的 agent 等它们自然完成，不强制 abort）
        ipc.writeSnapshot({
          snapshotAt: new Date().toISOString(),
          completedAgents: Object.fromEntries(
            [...activeAgents].filter(([, v]) => v.status === "completed")
          ),
          pendingSpecs: state.pendingSpecs,
          currentPhase: state.currentPhase,
          completedPhases: state.completedPhases,
          scriptPath: state.scriptPath,
        })
        break
      case "resume":
        if (!state.paused) break
        state.paused = false
        ipc.updateState("running")
        ipc.emitEvent({ type: "workflow_resumed" })
        // 从 pendingSpecs 继续派发
        break
      case "abort":
        for (const [id, info] of activeAgents) {
          if (info.status === "running") {
            await client.session.abort({ path: { id: info.sessionId } })
          }
        }
        ipc.updateState("aborted")
        ipc.writeSnapshot(/* ... */) // 即使 abort 也保留快照，允许未来手动续跑
        process.exit(0)
        break
    }
  }
}
```

- [ ] **Step 7: 实现断点续跑（--resume 模式）**

```javascript
async function restoreFromSnapshot(ipc) {
  const snapshot = ipc.readSnapshot()
  if (!snapshot) return null

  return {
    completedAgents: snapshot.completedAgents, // 已完成的 agent 结果直接复用
    pendingSpecs: snapshot.pendingSpecs,       // 剩余待执行的 agent
    currentPhase: snapshot.currentPhase,
    completedPhases: snapshot.completedPhases,
  }
}

// 在 runParallel 中集成 snapshot 恢复
async function runParallel(client, specs, ipc, config, snapshot) {
  const results = []

  // 如果有 snapshot，先注入已完成的结果
  if (snapshot?.completedAgents) {
    for (const [id, cached] of Object.entries(snapshot.completedAgents)) {
      results.push(cached)
      ipc.emitEvent({ type: "agent_restored", agent: id, reason: "from snapshot" })
    }
  }

  // 过滤掉已完成的 spec，只执行剩余的
  const remaining = snapshot
    ? specs.filter(s => !snapshot.completedAgents[s.id])
    : specs

  // ... 继续原有的并发派发逻辑，使用 remaining 而非 specs
}
```

- [ ] **Step 8: 实现 parallel 中的暂停感知**

```javascript
// runParallel 的主循环中检查暂停状态
while (queue.length > 0 || running.size > 0) {
  // 暂停状态下不取新任务，只等待运行中的完成
  if (!state.paused) {
    while (queue.length > 0 && running.size < config.maxConcurrent) {
      // ... 派发逻辑
    }
  }

  if (running.size > 0) {
    await Promise.race(running)
  } else if (state.paused) {
    // 所有运行中的 agent 已完成，暂停生效，等待 resume
    ipc.emitEvent({ type: "workflow_fully_paused", reason: "all running agents completed" })
    await waitForResume(state) // 阻塞直到 state.paused 变为 false
  }
}
```

- [ ] **Step 9: 组装完整的 createWorkflow() 入口**

```javascript
export async function createWorkflow(config = {}) {
  const cfg = {
    baseUrl: config.baseUrl || "http://127.0.0.1:4096",
    workdir: config.workdir || ".workflow",
    maxConcurrent: config.maxConcurrent || 10,
    chunkTimeoutMs: config.chunkTimeoutMs || 120000,
    ...config,
  }

  const client = await connectToServer(cfg.baseUrl)
  const ipc = createIpc(cfg.workdir)

  // 断点续跑：检查是否有 snapshot
  const snapshot = config.resume ? await restoreFromSnapshot(ipc) : null
  if (snapshot) {
    ipc.emitEvent({ type: "workflow_restored", completedAgents: Object.keys(snapshot.completedAgents).length })
  }

  const state = {
    paused: false,
    pendingSpecs: snapshot?.pendingSpecs || [],
    currentPhase: snapshot?.currentPhase || 1,
    completedPhases: snapshot?.completedPhases || [],
    scriptPath: cfg.workdir + "/script.mjs",
  }

  // 启动 commands 轮询
  const activeAgents = new Map()
  const cmdInterval = setInterval(
    () => processCommands(ipc, client, activeAgents, state), 1000
  )

  // 写入 PID
  ipc.writePid(process.pid)

  // 每阶段完成后自动写 snapshot（用于异常退出后续跑）
  function onPhaseComplete(phase) {
    state.completedPhases.push(phase)
    ipc.writeSnapshot({
      snapshotAt: new Date().toISOString(),
      completedAgents: Object.fromEntries(
        [...activeAgents].filter(([, v]) => v.status === "completed")
      ),
      pendingSpecs: state.pendingSpecs,
      currentPhase: state.currentPhase,
      completedPhases: state.completedPhases,
      scriptPath: state.scriptPath,
    })
  }

  const dashboardPath = resolve(cfg.workdir, "dashboard.html")

  return {
    agent: (type, prompt, opts) =>
      runAgent(client, { type, prompt, ...opts }, ipc, cfg),
    parallel: (specs, opts) =>
      runParallel(client, specs, ipc, { ...cfg, ...opts }, snapshot),
    status: () => ipc.readStatus(),
    dashboardPath,       // 绝对路径，脚本输出后主 agent 可转述给用户
    snapshot: snapshot,
    onPhaseComplete,
    shutdown: () => { clearInterval(cmdInterval); ipc.writeResult(/* ... */) },
  }
}
```

- [ ] **Step 10: 脚本侧 --resume 入口**

```javascript
// workflow 脚本的通用开头模式
import { createWorkflow } from "../lib/runner.mjs"

const resumeMode = process.argv.includes("--resume")
const wf = await createWorkflow({ resume: resumeMode })

// 如果有 snapshot，跳过已完成的阶段
if (wf.snapshot) {
  console.error(`Resuming from snapshot: ${wf.snapshot.completedPhases.length} phases completed`)
}
```

- [ ] **Step 8: 提交**

```bash
# 在子模块仓库内提交
cd vendor/opencode-dynamic-workflow
git add lib/runner.mjs package.json
git commit -m "feat: add workflow-runner core library"
```

---

### Task 2: IPC 通信模块 + Dashboard

**Files:**
- Create: `vendor/opencode-dynamic-workflow/lib/ipc.mjs`
- Create: `vendor/opencode-dynamic-workflow/lib/dashboard.mjs`

- [ ] **Step 1: 实现 IPC 目录初始化（含 gitignore）**

```javascript
// vendor/opencode-dynamic-workflow/lib/ipc.mjs
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync, appendFileSync } from "node:fs"
import { join, resolve, basename } from "node:path"

function ensureGitignore(workdir) {
  const dirName = basename(resolve(workdir))
  const gitignorePath = join(resolve(workdir, ".."), ".gitignore")
  const entry = `/${dirName}/`
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, "utf8")
    if (content.includes(entry) || content.includes(dirName)) return
  }
  appendFileSync(gitignorePath, `\n# workflow runtime files\n${entry}\n`)
}

export function createIpc(workdir) {
  const eventsDir = join(workdir, "events")
  const commandsDir = join(workdir, "commands")

  mkdirSync(eventsDir, { recursive: true })
  mkdirSync(commandsDir, { recursive: true })
  ensureGitignore(workdir)

  let eventSeq = 0
  let cmdSeq = 0

  // ... 返回 IPC 操作对象
}
```

- [ ] **Step 2: 实现 status.json 读写**

```javascript
function updateStatus(statusPath, agentId, agentInfo) {
  const status = existsSync(statusPath)
    ? JSON.parse(readFileSync(statusPath, "utf8"))
    : { phase: 1, totalPhases: 1, startedAt: new Date().toISOString(), agents: {} }

  status.agents[agentId] = { ...status.agents[agentId], ...agentInfo }
  writeFileSync(statusPath, JSON.stringify(status, null, 2))
}
```

- [ ] **Step 3: 实现事件追加写入**

```javascript
function emitEvent(eventsDir, seq, event) {
  const filename = String(++seq).padStart(3, "0") + ".json"
  writeFileSync(
    join(eventsDir, filename),
    JSON.stringify({ ...event, timestamp: new Date().toISOString() }, null, 2)
  )
  return seq
}
```

- [ ] **Step 4: 实现指令队列消费**

```javascript
function consumeCommands(commandsDir) {
  if (!existsSync(commandsDir)) return []
  const files = readdirSync(commandsDir).filter(f => f.endsWith(".json")).sort()
  const commands = []
  for (const file of files) {
    const path = join(commandsDir, file)
    commands.push(JSON.parse(readFileSync(path, "utf8")))
    unlinkSync(path) // 消费后删除
  }
  return commands
}
```

- [ ] **Step 5: 实现最终结果写入和 PID 管理**

```javascript
function writeResult(workdir, result) {
  writeFileSync(join(workdir, "result.json"), JSON.stringify(result, null, 2))
}

function writePid(workdir, pid) {
  writeFileSync(join(workdir, "pid"), String(pid))
}

function readPid(workdir) {
  const pidPath = join(workdir, "pid")
  return existsSync(pidPath) ? parseInt(readFileSync(pidPath, "utf8"), 10) : null
}
```

- [ ] **Step 6: 实现 snapshot 读写**

```javascript
function writeSnapshot(workdir, snapshot) {
  writeFileSync(join(workdir, "snapshot.json"), JSON.stringify(snapshot, null, 2))
}

function readSnapshot(workdir) {
  const path = join(workdir, "snapshot.json")
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null
}
```

- [ ] **Step 7: 实现 dashboard HTML 渲染**

每次 `updateStatus()` 被调用时，同步生成 `dashboard.html`。HTML 自包含全部 CSS/JS，
浏览器打开后通过 `<meta http-equiv="refresh" content="3">` 每 3 秒自动刷新。

```javascript
// vendor/opencode-dynamic-workflow/lib/dashboard.mjs

export function renderDashboard(workdir, status) {
  const agentRows = Object.entries(status.agents || {}).map(([id, a]) => {
    const statusColor = {
      running: "#3b82f6", completed: "#22c55e",
      failed: "#ef4444", timed_out: "#f59e0b",
      stopped: "#6b7280", queued: "#a855f7",
    }[a.status] || "#9ca3af"

    const duration = a.completedAt && a.startedAt
      ? `${((new Date(a.completedAt) - new Date(a.startedAt)) / 1000).toFixed(1)}s`
      : a.startedAt
        ? `${((Date.now() - new Date(a.startedAt)) / 1000).toFixed(0)}s...`
        : "-"

    return `<tr>
      <td>${id}</td>
      <td>${a.type || "-"}</td>
      <td><span style="color:${statusColor};font-weight:bold">${a.status}</span></td>
      <td>${duration}</td>
      <td title="${(a.prompt || "").replace(/"/g, "&quot;")}">${(a.prompt || "").slice(0, 80)}</td>
      <td>${a.resultSummary || a.error || ""}</td>
    </tr>`
  }).join("\n")

  const stateColor = {
    running: "#22c55e", paused: "#f59e0b",
    completed: "#3b82f6", aborted: "#ef4444",
  }[status.state] || "#9ca3af"

  const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="3">
<title>Workflow Dashboard</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; margin: 2rem; background: #0f172a; color: #e2e8f0; }
  h1 { font-size: 1.4rem; }
  .meta { color: #94a3b8; margin-bottom: 1.5rem; }
  .state { font-size: 1.1rem; font-weight: bold; color: ${stateColor}; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid #1e293b; }
  th { color: #94a3b8; font-size: 0.85rem; text-transform: uppercase; }
  tr:hover { background: #1e293b; }
</style>
</head><body>
<h1>Workflow Dashboard</h1>
<div class="meta">
  <span class="state">${status.state || "running"}</span>
  &nbsp;·&nbsp; Phase ${status.phase || "?"}/${status.totalPhases || "?"}
  &nbsp;·&nbsp; Started ${status.startedAt || "-"}
  &nbsp;·&nbsp; <em>Auto-refreshes every 3s</em>
</div>
<table>
  <thead><tr><th>Agent</th><th>Type</th><th>Status</th><th>Duration</th><th>Prompt</th><th>Result</th></tr></thead>
  <tbody>${agentRows || "<tr><td colspan=6>No agents yet</td></tr>"}</tbody>
</table>
</body></html>`

  writeFileSync(join(workdir, "dashboard.html"), html)
}
```

在 `ipc.mjs` 中，`updateStatus()` 每次写完 `status.json` 后调用 `renderDashboard()`：

```javascript
import { renderDashboard } from "./dashboard.mjs"

function updateStatus(workdir, agentId, agentInfo) {
  // ... 更新 status.json ...
  renderDashboard(workdir, status)
}
```

- [ ] **Step 8: 组装 createIpc() 并导出**

- [ ] **Step 9: 提交**

```bash
cd vendor/opencode-dynamic-workflow
git add lib/ipc.mjs lib/dashboard.mjs
git commit -m "feat: add IPC module with dashboard rendering"
```

---

### Task 3: workflow 示例脚本 + install 脚本

**Files:**
- Create: `vendor/opencode-dynamic-workflow/workflows/codebase-audit.mjs`
- Create: `vendor/opencode-dynamic-workflow/workflows/parallel-research.mjs`
- Create: `vendor/opencode-dynamic-workflow/install-opencode.sh`

- [ ] **Step 1: 创建 codebase-audit workflow**

```javascript
// vendor/opencode-dynamic-workflow/workflows/codebase-audit.mjs
import { createWorkflow } from "../lib/runner.mjs"

const wf = await createWorkflow()
console.error(`[workflow] 实时进度面板已就绪，执行以下命令在浏览器中打开：`)
console.error(`  open ${wf.dashboardPath}`)
const target = process.argv[2] || "src/"

// 阶段 1：并发探索（3 个只读 agent）
const discoveries = await wf.parallel([
  { type: "explore", prompt: `列出 ${target} 下所有公开的 API 端点和导出函数` },
  { type: "explore", prompt: `列出 ${target} 下测试覆盖率低或无测试的文件` },
  { type: "explore", prompt: `搜索 ${target} 下的 TODO、FIXME、HACK 注释，按严重性排序` },
])

// 阶段 2：基于发现的深度分析
const analysis = await wf.agent("general",
  `基于以下三组探索结果，输出一份结构化的代码审计报告。` +
  `报告包含：关键发现、风险排序、改进建议。\n\n` +
  discoveries.map((d, i) => `### 探索 ${i + 1}\n${d.output}`).join("\n\n")
)

wf.shutdown()
console.log(JSON.stringify({
  type: "codebase-audit",
  target,
  phases: 2,
  totalAgents: discoveries.length + 1,
  report: analysis.output,
}))
```

- [ ] **Step 2: 创建 parallel-research workflow**

```javascript
// vendor/opencode-dynamic-workflow/workflows/parallel-research.mjs
import { createWorkflow } from "../lib/runner.mjs"

const wf = await createWorkflow()
console.error(`[workflow] 实时进度面板已就绪，执行以下命令在浏览器中打开：`)
console.error(`  open ${wf.dashboardPath}`)
const question = process.argv.slice(2).join(" ")

if (!question) {
  console.error("Usage: node parallel-research.mjs <question>")
  process.exit(1)
}

// 阶段 1：多角度调研
const researches = await wf.parallel([
  { type: "general", prompt: `从技术实现角度调研：${question}` },
  { type: "general", prompt: `从最佳实践和社区经验角度调研：${question}` },
  { type: "general", prompt: `从风险和局限性角度调研：${question}` },
])

// 阶段 2：交叉验证
const verification = await wf.agent("general",
  `以下是三个独立调研团队对同一问题的回答。请交叉验证，` +
  `标出三方一致的结论、存在分歧的点、以及可能的盲点。\n\n` +
  `问题：${question}\n\n` +
  researches.map((r, i) => `### 调研 ${i + 1}\n${r.output}`).join("\n\n")
)

wf.shutdown()
console.log(JSON.stringify({
  type: "parallel-research",
  question,
  phases: 2,
  totalAgents: researches.length + 1,
  report: verification.output,
}))
```

- [ ] **Step 3: 创建 install-opencode.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="${NODE_BIN:-node}"
OPENCODE_PLUGIN_DIR="${OPENCODE_PLUGIN_DIR:-$HOME/.config/opencode/plugins}"
INTERACTIVE=true

while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-interactive) INTERACTIVE=false; shift ;;
    --plugin-dir) OPENCODE_PLUGIN_DIR="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: bash install-opencode.sh [--no-interactive] [--plugin-dir <path>]"
      exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

# 1. 安装 npm 依赖
echo "[install] npm install in $ROOT"
(cd "$ROOT" && npm install --production)

# 2. 软链插件
mkdir -p "$OPENCODE_PLUGIN_DIR"
PLUGIN_SRC="$ROOT/plugins/workflow-hint.js"
PLUGIN_DST="$OPENCODE_PLUGIN_DIR/workflow-hint.js"
if [ -L "$PLUGIN_DST" ] || [ -f "$PLUGIN_DST" ]; then
  rm "$PLUGIN_DST"
fi
ln -s "$PLUGIN_SRC" "$PLUGIN_DST"
echo "[ok] plugin linked: $PLUGIN_DST -> $PLUGIN_SRC"

# 3. 输出 workflow 模板路径
echo "[ok] workflow templates: $ROOT/workflows/"
echo "[next] Restart OpenCode to load the workflow-hint plugin"
```

- [ ] **Step 4: 提交**

```bash
cd vendor/opencode-dynamic-workflow
git add workflows/ plugins/ install-opencode.sh README.md .gitignore
git commit -m "feat: add workflow templates, plugin, and install script"
```

---

### Task 4: 端到端集成验证

**Files:**
- 无新文件，使用已有 workflow 脚本验证

- [ ] **Step 1: 确认 OpenCode server 运行**

```bash
# 在 TUI 中执行，或
opencode serve &
```

- [ ] **Step 2: 运行 parallel-research workflow**

```bash
node vendor/opencode-dynamic-workflow/workflows/parallel-research.mjs \
  "OpenCode 和 Claude Code 的 subagent 架构对比"
```

预期：
- `.workflow/status.json` 实时更新
- `.workflow/events/` 目录产生事件文件
- stdout 输出最终 JSON 结果
- 并发 agent 数 ≤ 10
- 无 agent 因 chunk 超时而非正常退出

- [ ] **Step 3: 验证主 agent 干预能力**

在 workflow 运行过程中，从另一个终端：

```bash
# 查看状态
cat .workflow/status.json | jq .

# 追加一个 agent
echo '{"action":"spawn","type":"explore","prompt":"补充调研 OpenCode 插件生态"}' \
  > .workflow/commands/001.json

# 停止某个 agent
echo '{"action":"stop","agent":"agent-xxx"}' > .workflow/commands/002.json
```

预期：workflow 进程响应指令，状态文件更新。

- [ ] **Step 4: 验证从主 agent 对话中使用 workflow**

在 OpenCode TUI 中，主 agent 应能：

```
# 主 agent 生成并启动 workflow
bash: node vendor/opencode-dynamic-workflow/workflows/parallel-research.mjs "某个问题" &

# 查看状态
bash: cat .workflow/status.json

# 发送指令
bash: echo '{"action":"spawn",...}' > .workflow/commands/003.json

# 读取最终结果
bash: cat .workflow/result.json
```

- [ ] **Step 5: 记录验证结果，确认第一期完成**

---

## 第二期任务（第一期验证通过后执行）

> **DAG 依赖**：T5 → T6 → T7 → T8（严格串行，每个任务依赖前驱的文件变更）
>
> **回退预案**：`docs/knowledge/opencode-dynamic-workflow-rollback.md`

### Task 5: DAG 插件替换 + init 集成

**Goal:** 用子模块的 `workflow-hint.js` 替换主仓的 `dag-dispatch-hint.js`，
并在 `init_opencode.sh` 中注册子模块初始化调用。

**Files:**
- Deprecate: `opencode/plugins/dag-dispatch-hint.js`（文件顶部加废弃注释，不删除）
- Modify: `init_opencode.sh:81-88`（`ensure_opencode_required_submodules` 增加 workflow 子模块）
- Modify: `init_opencode.sh:159-294`（`sync_opencode_plugins` 退役列表增加 `dag-dispatch-hint.js`）
- Modify: `init_opencode.sh:452-457`（main flow 增加 workflow 子模块 install 调用）

- [ ] **Step 1: 在 `dag-dispatch-hint.js` 顶部加废弃标记**

在文件第 1 行前插入：

```javascript
/**
 * @deprecated 已被 vendor/opencode-dynamic-workflow/plugins/workflow-hint.js 替代。
 * 保留文件用于 git revert 回退。不要删除。
 * 退役日期：2026-06-15
 */
```

- [ ] **Step 2: 在 `ensure_opencode_required_submodules` 注册 workflow 子模块**

在 `init_opencode.sh` 的 `ensure_opencode_required_submodules` 函数末尾（第 88 行
`"$SRC/vendor/superpowers/skills"` 之后）追加：

```bash
  ensure_opencode_submodule_ready \
    "vendor/opencode-dynamic-workflow" \
    "$SRC/vendor/opencode-dynamic-workflow/lib/runner.mjs"
```

- [ ] **Step 3: 在 `sync_opencode_plugins` 退役列表中增加 `dag-dispatch-hint.js`**

在 `init_opencode.sh` 第 203 行，把退役列表从：

```bash
  for retired_plugin in "stop-verification.js"; do
```

改为：

```bash
  for retired_plugin in "stop-verification.js" "dag-dispatch-hint.js"; do
```

- [ ] **Step 4: 在 main flow 中调用子模块 install**

在 `init_opencode.sh` 第 457 行（`sync_opencode_docs` 之后）追加：

```bash

# ── Workflow 子模块配置 ─────────────────────────────────
local workflow_install="$SRC/vendor/opencode-dynamic-workflow/install-opencode.sh"
if [ -f "$workflow_install" ]; then
  bash "$workflow_install" --no-interactive --plugin-dir "$OPENCODE_CONFIG_DIR/plugins"
else
  echo "[skip]  vendor/opencode-dynamic-workflow 不存在，跳过 workflow 配置"
fi
```

- [ ] **Step 5: 验证 init 脚本语法和退役逻辑**

```bash
bash -n init_opencode.sh
```

- [ ] **Step 6: 提交**

```bash
git add opencode/plugins/dag-dispatch-hint.js init_opencode.sh
git commit -m "feat(workflow): 替换 DAG 插件为 workflow-hint，注册子模块到 init"
```

---

### Task 6: 四端共享 policy + 全局规则更新

**Goal:** 更新 shared policy 正文从 DAG 拦截语义切换到 workflow 建议语义；
同步更新 CLAUDE.md 和 CLAUDE.reason.md 的 §并发、§Subagent 两节。

**Files:**
- Modify: `shared/policies/subagent-dispatch-hint.json`
- Modify: `claude/CLAUDE.md`（§并发 lines 28-34、§Subagent lines 36-41）
- Modify: `claude/CLAUDE.reason.md`（§并发 lines 66-86、§Subagent lines 90-100）

- [ ] **Step 1: 替换 shared policy 正文**

将 `shared/policies/subagent-dispatch-hint.json` 全文替换为：

```json
{
  "template": [
    "[subagent-dispatch 提示] 准备派发 subagent，请先评估编排方式。",
    "",
    "1) 多 agent 编排场景（≥3 个 agent 或有 DAG 依赖）",
    "   推荐使用 workflow 脚本编排（确定性更高、可复用、支持实时干预）：",
    "     node vendor/opencode-dynamic-workflow/workflows/<name>.mjs",
    "   预定义模板：",
    "     - codebase-audit.mjs: 代码审计（并发探索 + 分析）",
    "     - parallel-research.mjs: 并行调研（多角度 + 交叉验证）",
    "   也可基于 lib/runner.mjs 编写自定义 workflow 脚本。",
    "",
    "2) 直接派发 subagent 允许的场景",
    "   a. 单个 subagent（无编排需求）",
    "   b. explore/scout 只读探索",
    "   c. 2 个以内独立 subagent，写入范围不重叠",
    "",
    "3) 通用约束（无论走 workflow 还是直接派发）",
    "   - 无相互依赖的 task 必须并行派发（同一 message 内多个 tool call）",
    "   - 任何 subagent 创建都必须采用后台模式，不阻塞主对话",
    "   - coding 任务必须通过 git worktree 隔离",
    "   - worktree 合并后必须跑验证",
    "   - 自动合并失败或语义冲突 → 停止并请求用户决策",
    "",
    "4) 逃生路径（满足任一时，在 description 或 prompt 中",
    "   加入字面值 \"skip-dag-hint\" 即可放行）：",
    "   a. 当前实际只有 1 个 task，无并发/编排空间",
    "   b. 已完成分析，本次是并发集合内全部 task 之一",
    "   c. 当前 task 依赖未完成的前驱，必须串行等待",
    "   d. 只读探索任务，无需 worktree",
    "",
    "不满足放行条件请重新组织派发方式后再次发起。"
  ]
}
```

- [ ] **Step 2: 更新 `claude/CLAUDE.md` §并发**

将 §并发 整节（lines 28-34）替换为：

```markdown
## 并发

可隔离的独立子任务必须优先使用 subagent 按 DAG 并发。
多 agent 编排场景（≥3 个 agent 或有 DAG 依赖）推荐使用 workflow 脚本
（`vendor/opencode-dynamic-workflow/`），确定性更高、可复用、支持实时干预。
若为 coding 任务，则必须通过 git worktree 隔离，若为探索等只读任务可不必。
worktree 合并后必须跑验证；自动合并失败或语义冲突 → 停止并请求用户决策。

禁止：在有明确 DAG 依赖分析的情况下串行执行无依赖任务。
```

- [ ] **Step 3: 更新 `claude/CLAUDE.md` §Subagent**

将 §Subagent 整节（lines 36-41）替换为：

```markdown
## Subagent

任何 subagent 创建都必须采用后台模式：派发后不阻塞主 agent。
长耗时或耗时不确定的 bash 命令调用必须交给后台 subagent 执行。
多 agent 编排推荐使用 workflow 脚本（详见 §并发）。

禁止：同步调用 subagent，使得用户在 subagent 结束前无法与主 agent 对话。
```

- [ ] **Step 4: 更新 `claude/CLAUDE.reason.md` §并发**

将 §并发 整节（lines 66-86）替换为：

```markdown
## 并发

> **原因**：串行浪费独立任务的并行潜力；DAG 显式声明依赖才能安全并发。
> subagent 让独立任务在隔离上下文中推进，避免主对话串行吞吐受限；
> worktree 隔离避免并发 subagent 的文件写入冲突。
> 多 agent 编排推荐 workflow 脚本而非裸 subagent 派发，因为 workflow 脚本
> 是确定性代码（可测试、可复用、可断点续跑），而裸派发依赖 LLM 记住
> DAG 拓扑和 worktree 策略，容易遗漏或重复派发。

详细的 worktree 安全契约（目录优先级、gitignore 校验、submodule guard、
sandbox 降级）已移入 writing-plans skill 的职责范围。原 reason 保留在下方备查：

<details>
<summary>并发策略原 reason（备查）</summary>

- **目录优先级 `.worktrees/`**：约定俗成的隐藏目录；已存在时复用避免目录爆炸。
- **`.gitignore` 校验**：worktree 目录未忽略会污染 working tree。
- **submodule guard**：子模块内 worktree add 会建到子模块独立 .git 里。
- **sandbox 降级**：权限受限时不应硬卡，降级到串行至少能跑完。
- **worker 策略**：实现型 subagent 默认交给 Codex 插件，是为了复用 Claude Code
  内的 `/codex:rescue`、后台 job、status/result/resume 等闭环；OpenCode DeepSeek
  worker 保留为显式 fallback，避免默认路径在多套 worker 间摇摆。

</details>
```

- [ ] **Step 5: 更新 `claude/CLAUDE.reason.md` §Subagent**

将 §Subagent 整节（lines 90-100）替换为：

```markdown
## Subagent

> **原因**：subagent 的价值在于把独立上下文并行推进；如果创建后同步等待，
> 主对话会退化成串行调度器，既浪费并发窗口，也更容易在长任务中丢失全局协调。
> 后台模式让主对话继续做 DAG 调度、风险收敛和验证准备，只在真实冲突或需要
> 用户决策时停下来。
>
> 多 agent 编排推荐 workflow 脚本而非裸 subagent 派发（详见 §并发 reason）。
>
> 长耗时 bash 命令同样会占住主对话的执行通道，尤其是构建、全量测试、日志跟踪、
> 扫描和远程诊断这类耗时不稳定的任务。强制转交后台 subagent 是为了保留主对话
> 的交互窗口，让主对话可以继续拆分任务、响应用户打断，并在回收点做独立校验。
```

- [ ] **Step 6: 验证 CLAUDE.md 和 CLAUDE.reason.md 节标题一一对应**

```bash
# 抽取两文件的二级标题，diff 应为空
diff <(grep '^## ' claude/CLAUDE.md | sort) <(grep '^## ' claude/CLAUDE.reason.md | sort)
```

- [ ] **Step 7: 提交**

```bash
git add shared/policies/subagent-dispatch-hint.json claude/CLAUDE.md claude/CLAUDE.reason.md
git commit -m "feat(workflow): 更新 shared policy 和全局规则，推荐 workflow 编排"
```

---

### Task 7: 回归测试更新

**Goal:** 更新测试断言以匹配新的 policy 正文和新的 CLAUDE.md 规则措辞；
新增 `workflow-hint.js` 插件的独立测试。

**Files:**
- Modify: `codex/hooks/tests/test_codex_hooks.py`（3 个测试方法 + 1 个新增）

- [ ] **Step 1: 添加 OPENCODE_WORKFLOW_HINT_PLUGIN 常量**

在 `test_codex_hooks.py` 的常量区（第 53 行 `INIT_OPENCODE` 之后）追加：

```python
OPENCODE_WORKFLOW_HINT_PLUGIN = (
    REPO_ROOT / "vendor" / "opencode-dynamic-workflow" / "plugins" / "workflow-hint.js"
)
```

- [ ] **Step 2: 更新 `test_opencode_dag_dispatch_hint_matches_global_concurrency_rules`**

将整个方法体替换为：

```python
    def test_opencode_dag_dispatch_hint_matches_global_concurrency_rules(self) -> None:
        """验证 CLAUDE.md §并发/§Subagent 包含 workflow 推荐和核心约束。"""
        claude_global = (REPO_ROOT / "claude" / "CLAUDE.md").read_text()
        for snippet in (
            "可隔离的独立子任务必须优先使用 subagent 按 DAG 并发",
            "workflow 脚本",
            "若为 coding 任务，则必须通过 git worktree 隔离",
            "worktree 合并后必须跑验证",
            "自动合并失败或语义冲突",
            "任何 subagent 创建都必须采用后台模式",
        ):
            self.assertIn(snippet, claude_global)

        # shared policy 包含 workflow 推荐和 DAG 通用约束
        policy = json.loads(SHARED_SUBAGENT_DISPATCH_HINT.read_text())
        rendered = "\n".join(policy["template"])
        for snippet in (
            "workflow 脚本编排",
            "git worktree 隔离",
            "worktree 合并后必须跑验证",
            "自动合并失败或语义冲突",
            "后台模式",
            "skip-dag-hint",
        ):
            self.assertIn(snippet, rendered)

        # workflow-hint 插件能加载并在关键词命中时抛出提示
        self.assertTrue(OPENCODE_WORKFLOW_HINT_PLUGIN.is_file())
        script = f"""
const mod = await import({json.dumps(OPENCODE_WORKFLOW_HINT_PLUGIN.as_uri())});
const plugin = await mod.WorkflowHintPlugin({{}});
const before = plugin["tool.execute.before"];
try {{
  await before({{tool: "task"}}, {{args: {{description: "并行实现三个模块", prompt: "同时做"}}}});
  console.log("NO_THROW");
}} catch (err) {{
  console.log(err.message);
}}
"""
        proc = subprocess.run(
            ["node", "--input-type=module", "-e", script],
            text=True,
            capture_output=True,
            check=True,
        )
        hint = proc.stdout
        self.assertIn("workflow", hint.lower())
        self.assertNotIn("NO_THROW", hint)
```

- [ ] **Step 3: 更新 `test_subagent_dispatch_hint_policy_is_four_host_single_source`**

将整个方法体替换为：

```python
    def test_subagent_dispatch_hint_policy_is_four_host_single_source(self) -> None:
        """验证四端共享 policy 包含 workflow 推荐，不含已退役的知识检索流程。"""
        policy = json.loads(SHARED_SUBAGENT_DISPATCH_HINT.read_text())
        rendered = "\n".join(policy["template"])
        self.assertIn("workflow 脚本编排", rendered)
        self.assertIn("git worktree 隔离", rendered)
        self.assertIn("后台模式", rendered)
        self.assertNotIn("知识检索", rendered)
        self.assertNotIn("skill-catalog", rendered)
        self.assertNotIn("mcp__skill-catalog", rendered)

        # 四端仍引用 subagent-dispatch-hint（Claude/Codex/Qwen hook + OpenCode plugin）
        # OpenCode 端现在由 workflow-hint.js 承载，但 init 脚本仍通过子模块
        # install-opencode.sh 间接引用
        for text in (
            INIT_CODEX.read_text(),
            (REPO_ROOT / "codex" / "hooks.json").read_text(),
            (REPO_ROOT / "init_claude.sh").read_text(),
            (REPO_ROOT / "init_qwen.sh").read_text(),
        ):
            self.assertIn("subagent-dispatch-hint", text)

        # workflow-hint 插件存在且可读
        self.assertTrue(OPENCODE_WORKFLOW_HINT_PLUGIN.is_file())

        self.assertNotIn("coding-expert-rules-inject", (REPO_ROOT / "init_qwen.sh").read_text())
        self.assertNotIn("coding-expert-rules-inject", (REPO_ROOT / "codex" / "hooks.json").read_text())
        self.assertFalse((REPO_ROOT / "claude" / "hooks" / "coding-expert-rules-inject.sh").exists())
```

- [ ] **Step 4: `test_shared_subagent_dispatch_hook_outputs_policy_as_additional_context` 无需修改**

该测试只验证 bash hook 输出 = policy template join，policy 正文变了但测试逻辑
不变（它用 `json.loads` + `"\n".join` 做等值比较）。无需改动。

- [ ] **Step 5: 运行回归测试**

```bash
python3 -m unittest \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_opencode_dag_dispatch_hint_matches_global_concurrency_rules \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_subagent_dispatch_hint_policy_is_four_host_single_source \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_shared_subagent_dispatch_hook_outputs_policy_as_additional_context

# 预期：3 tests, 0 failures
```

- [ ] **Step 6: 提交**

```bash
git add codex/hooks/tests/test_codex_hooks.py
git commit -m "test(workflow): 更新回归测试断言匹配 workflow policy"
```

---

### Task 8: 项目知识沉淀 + 最终验证

**Goal:** 更新知识文档反映从 DAG 拦截到 workflow 推荐的架构变化；
创建 workflow 系统知识文档；运行全量验证。

**Files:**
- Create: `docs/knowledge/opencode-dynamic-workflow.md`
- Modify: `docs/knowledge/subagent-dispatch-hook.md`

- [ ] **Step 1: 创建 workflow 项目知识文档**

创建 `docs/knowledge/opencode-dynamic-workflow.md`：

```markdown
---
title: OpenCode Dynamic Workflow 编排系统
kind: architecture
status: active
applies_to:
  - vendor/opencode-dynamic-workflow/
  - init_opencode.sh
  - shared/policies/subagent-dispatch-hint.json
last_verified: 2026-06-15
source: opencode-dynamic-workflow phase 1+2
---

# 多 agent 编排推荐使用 workflow 脚本

## 适用场景

需要 ≥3 个 agent 协作、有 DAG 依赖关系、或需要实时干预（暂停/恢复/追加）
的多 agent 编排场景。

## 项目事实 / 约定

`vendor/opencode-dynamic-workflow/` 是独立 git 子模块，提供：

- `lib/runner.mjs`：双后端（SDK + CLI）workflow 运行时，支持并发调度、
  暂停/恢复、快照断点续跑
- `lib/ipc.mjs`：文件系统 IPC（`.workflow/` 目录）
- `lib/dashboard.mjs`：静态 HTML 实时面板
- `plugins/workflow-hint.js`：OpenCode 插件，检测多 agent 编排意图时建议
  使用 workflow 脚本
- `workflows/*.mjs`：预定义 workflow 模板（codebase-audit、parallel-research）

`init_opencode.sh` 通过 `install-opencode.sh` 将 `workflow-hint.js` 软链到
`~/.config/opencode/plugins/`。

## 原因

裸 subagent 派发依赖 LLM 记住 DAG 拓扑和 worktree 策略，容易遗漏或重复
派发。workflow 脚本是确定性代码，可测试、可复用、可断点续跑。

## 修改时注意

- 修改 `workflow-hint.js` 时，确认它与 `shared/policies/subagent-dispatch-hint.json`
  的措辞一致（两处都提到 workflow 推荐）
- 修改 `install-opencode.sh` 时，确认 `init_opencode.sh` 的调用参数仍匹配
- 子模块有独立 git 仓库，修改后需要在子模块内 commit + push，然后在主仓
  更新子模块引用

## 验证方式

```bash
# 子模块单元测试（在子模块目录下）
cd vendor/opencode-dynamic-workflow && npm test

# 主仓回归测试
python3 -m unittest \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_opencode_dag_dispatch_hint_matches_global_concurrency_rules \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_subagent_dispatch_hint_policy_is_four_host_single_source

# init 脚本语法
bash -n init_opencode.sh
```

## 相关资料

- 实施计划：`docs/superpowers/plans/2026-06-15-opencode-dynamic-workflow.md`
- 回退预案：`docs/knowledge/opencode-dynamic-workflow-rollback.md`
- subagent 派发约定：`docs/knowledge/subagent-dispatch-hook.md`
```

- [ ] **Step 2: 更新 `subagent-dispatch-hook.md`**

将 `docs/knowledge/subagent-dispatch-hook.md` 整文件替换为：

```markdown
---
title: 四端 subagent 派发提示
kind: convention
status: active
applies_to:
  - shared/policies/subagent-dispatch-hint.json
  - shared/hooks/subagent-dispatch-hint.sh
  - vendor/opencode-dynamic-workflow/plugins/workflow-hint.js
  - init_claude.sh
  - init_codex.sh
  - init_qwen.sh
  - init_opencode.sh
last_verified: 2026-06-15
source: opencode-dynamic-workflow phase 2
---

# 四端 subagent 派发提示以 shared policy 为单一来源

Claude、Qwen、Codex 的 `SubagentStart` hook 与 OpenCode 的 `workflow-hint.js`
插件必须输出基于同一份 shared policy 的提示内容。提示正文只维护在
`shared/policies/subagent-dispatch-hint.json`。

## 适用场景

修改 subagent 派发规则、SubagentStart hook、OpenCode workflow 插件、四端 init
脚本或全局 `claude/CLAUDE.md` 的 `## 并发` / `## Subagent` 规则时，必须检查本文。

## 项目事实 / 约定

`shared/policies/subagent-dispatch-hint.json` 是四端共享提示正文的单一来源。

**Claude/Qwen/Codex 端**：`shared/hooks/subagent-dispatch-hint.sh` 把 policy
正文包装成 `hookSpecificOutput.additionalContext`，供 SubagentStart hook 使用。

**OpenCode 端**：`vendor/opencode-dynamic-workflow/plugins/workflow-hint.js`
在 `task` 工具执行前检测多 agent 编排意图，命中时抛出提示建议使用 workflow
脚本编排。旧的 `opencode/plugins/dag-dispatch-hint.js` 已废弃（保留用于回退）。

提示内容涵盖：
- 多 agent 编排推荐 workflow 脚本（确定性、可复用、实时干预）
- 直接派发 subagent 允许的场景（单个、只读探索、2 个以内独立）
- 通用约束（并行派发、后台模式、worktree 隔离、合并验证）
- 逃生路径（`skip-dag-hint` 字面值放行）

旧 `claude/hooks/coding-expert-rules-inject.sh` 已退役。不要重新按
`coding-expert` / `coding-expert-light` / `coding-expert-heavy` 三个 matcher 注入
知识检索规则；SubagentStart 应注册为无 matcher 的通用 hook。

## 原因

四端 hook 能力不同，但 subagent 派发约束来自同一份全局规则。如果每端各自维护提示
正文，OpenCode 插件、Claude/Qwen settings、Codex hooks 很容易与
`claude/CLAUDE.md` 分叉。

多 agent 编排从"DAG 拦截"升级为"workflow 建议"，是因为 DAG 拦截只能阻止错误
派发，不能引导 agent 使用更优的编排方式。workflow 脚本提供确定性执行路径。

## 修改时注意

- 改提示正文时只改 `shared/policies/subagent-dispatch-hint.json`，不要在各端脚本或
  plugin 中复制新正文。
- 改全局 `claude/CLAUDE.md` 的 `## 并发` / `## Subagent` 时，同步检查 shared
  policy 是否仍匹配；修改全局规则本身还必须同步维护 `claude/CLAUDE.reason.md`。
- 改 Claude/Qwen/Codex init 脚本时，确认 SubagentStart 仍指向
  `shared/hooks/subagent-dispatch-hint.sh`。
- 改 OpenCode workflow 插件时，确认它在
  `vendor/opencode-dynamic-workflow/plugins/workflow-hint.js`，且
  `init_opencode.sh` 通过子模块 `install-opencode.sh` 安装。
- `opencode/plugins/dag-dispatch-hint.js` 已废弃，保留用于 git revert 回退。
  不要修改、不要删除、不要恢复软链。
- 不要把 `knowledge-retrieval`、`skill-catalog`、`mcp__skill-catalog` 或 tag 闭集
  获取流程放回 SubagentStart hook。

## 验证方式

```bash
python3 -m unittest \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_opencode_dag_dispatch_hint_matches_global_concurrency_rules \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_subagent_dispatch_hint_policy_is_four_host_single_source \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_shared_subagent_dispatch_hook_outputs_policy_as_additional_context \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_skill_resolve_preflight_policy_is_single_source
```

```bash
bash -n shared/hooks/subagent-dispatch-hint.sh init_claude.sh init_codex.sh init_qwen.sh init_opencode.sh
git diff --check
```
```

- [ ] **Step 3: 全量回归验证**

```bash
# 四端 policy 回归测试
python3 -m unittest \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_opencode_dag_dispatch_hint_matches_global_concurrency_rules \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_subagent_dispatch_hint_policy_is_four_host_single_source \
  codex.hooks.tests.test_codex_hooks.CodexHooksTest.test_shared_subagent_dispatch_hook_outputs_policy_as_additional_context

# init 脚本语法
bash -n init_opencode.sh init_claude.sh init_codex.sh init_qwen.sh shared/hooks/subagent-dispatch-hint.sh

# CLAUDE.md 节标题同步
diff <(grep '^## ' claude/CLAUDE.md | sort) <(grep '^## ' claude/CLAUDE.reason.md | sort)

# 预期：全部通过，diff 无输出
```

- [ ] **Step 4: 提交**

```bash
git add docs/knowledge/opencode-dynamic-workflow.md docs/knowledge/subagent-dispatch-hook.md
git commit -m "docs(workflow): 知识文档沉淀 workflow 架构和更新派发约定"
```

---

## 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| OpenCode server 未运行时 workflow 脚本报错 | 中 | 低 | runner.mjs 启动时健康检查 + 明确报错信息 |
| SDK session.prompt() 等待时间过长阻塞整个 workflow | 低 | 中 | chunk 超时机制 + Promise.race 保护 |
| 文件系统 IPC 在高并发下丢指令 | 低 | 低 | commands 目录用原子写入（写临时文件后 rename） |
| 四端 policy 同步遗漏 | 中 | 中 | 回归测试强制检查四端一致性 |
| 模型生成的 workflow 脚本有 runtime 错误 | 中 | 低 | 预定义模板覆盖常见模式 + 脚本 try/catch 全局兜底 |
| 第二期 revert 时遗漏 CLAUDE.reason.md | 中 | 中 | 回退预案文档显式列出所有文件 |

## 验证清单

- [ ] `node vendor/opencode-dynamic-workflow/lib/runner.mjs` 可独立加载无报错
- [ ] `install-opencode.sh` 可独立完成配置（npm install + 插件软链）
- [ ] `init_opencode.sh` 可一键调用子模块配置
- [ ] 示例 workflow 可在 OpenCode TUI session 中通过 bash 工具启动和管理
- [ ] `.workflow/status.json` 实时反映 agent 状态
- [ ] `.workflow/dashboard.html` 随 status.json 同步更新，浏览器可打开查看
- [ ] 主 agent 可通过写入 commands 目录实现 stop/spawn/abort
- [ ] pause 指令后 workflow 停止派发新 agent，resume 后继续
- [ ] 进程异常退出后 `--resume` 可从 snapshot.json 断点续跑，已完成 agent 不重跑
- [ ] chunk 超时正确触发，不影响其他运行中 agent
- [ ] 并发 agent 数不超过 10
- [ ] 四端回归测试全部通过
- [ ] CLAUDE.md 与 CLAUDE.reason.md 同步更新
- [ ] `dag-dispatch-hint.js` 保留但标记废弃，软链已退役
- [ ] `workflow-hint.js` 软链到 `~/.config/opencode/plugins/` 且可加载
