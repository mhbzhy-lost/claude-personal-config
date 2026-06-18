# Harness 不是写规则：从 AGENTS.md 幻觉到门禁与固化工作流

> 好的 AI 编码 harness 从来不在于写得天花乱坠的指令文档，
> 而是良好设计的门禁和脚本固化的工作流。

## 一、AGENTS.md 的幻觉

打开任何一个 AI 编码工具的配置仓库，大概率会找到一个 AGENTS.md（或 CLAUDE.md、.cursorrules、system prompt）：几百行精心措辞的自然语言规则，告诉 agent "你应该怎么做"。

**TDD 是绝对红线**。**禁止前台模式派发 subagent**。**Bug 修复必须先写根因分析文档**。

文字写得越详细，维护者越容易产生一种安全感："我已经把事情说清楚了，agent 应该知道了。"

但 LLM 对自然语言指令的遵从是**概率性的**。同一个 prompt 跑十次，可能八次乖乖先写测试，两次直接跳过写了实现——尤其是当任务看起来"很简单"的时候，agent 内部的 rationalization 会压倒 AGENTS.md 里的任何措辞。

这不是 AGENTS.md 写得不够好。这是**用散文做安全边界**的固有缺陷：

- 没有 enforcement 机制的规则等于没有规则
- 措辞越"绝对"，下次 context window 压缩后越可能被丢失
- Agent 的 system prompt 越堆越长，后面的规则会稀释前面的规则

真正的 harness 设计，应该回答的不是"我告诉 agent 了什么"，而是"当 agent 试图做错误的事时，**会发生什么**"。

## 二、重新定义 Harness

Harness — 马具、挽具 — 在 AI 编码语境下，是 agent 与外部世界之间的那层控制机构。

一个有效的 harness 由三个层次构成，按可靠性递减排序：

| 层 | 机制 | 特性 | 示例 |
|---|---|---|---|
| **L2: 运行时插件** | `tool.execute.before` 钩子 | 确定性拦截，agent 无法绕过 | 解析 `rm` 命令的目标路径并校验工作区边界 |
| **L1: 静态权限模板** | 声明式 glob/command gate | 低成本高频覆盖，无运行时计算 | `"rm *": "deny"`、`"$REPO/**": "allow"` |
| **L3: AGENTS.md 约束** | 自然语言行为规范 | 概率性遵从，可被忽略 | "并发 < 3 用 subagent，≥ 3 用 Dynamic Workflow" |

注意排序：**L2 插件是核心，L1 权限是基础，AGENTS.md 是 UX 层**。

很多团队把 90% 的精力花在 L3。实际上应该反过来：高频、高风险的行为用 L2 做硬拦截；低频、低风险的用 L1 做声明式防线；只有那些"做错了也不致命，下次改就行"的行为才交给 L3。

## 三、Hook 的工程学：为什么正则匹配不够

opencode 的插件模型很简单：一个 JS 函数，导出 `tool.execute.before` 或 `tool.execute.after` 钩子，在 agent 调用工具前后拦截。`before` 钩子可以 `throw new Error()` 阻断执行，`after` 钩子可以修改工具输出。

听起来简单。但"拦截 bash 工具中的 `rm` 命令"这个需求，从"能用"到"可靠"之间有巨大的工程鸿沟。

### 3.1 命令拆分：不是 split(" ")

一个 agent 发来的 bash 命令可能长这样：

```bash
cd /src && rm -rf "old build" ; sudo rm /etc/config
```

如果你用正则 `/rm\s/` 去匹配，会漏掉 `sudo rm`。如果用 `/.*rm.*/` 去匹配，会误杀 `echo "rm -rf /"`。

正确的做法是**手写一个命令解析器**，按 shell 语义拆分命令段：

```js
// 追踪引号状态，只在引号外分割
const splitSegments = (command) => {
  const segments = []
  let current = ""
  let quote = null

  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i]
    const next = command[i + 1]

    if (quote) {
      current += ch
      if (ch === quote) quote = null
      continue
    }

    if (ch === "'" || ch === '"') {
      quote = ch
      current += ch
      continue
    }

    // 只在引号外分割 ; && ||
    if (ch === ";" || (ch === "&" && next === "&") || (ch === "|" && next === "|")) {
      if (current.trim()) segments.push(current.trim())
      current = ""
      if (ch !== ";") i += 1  // 跳过双字符的第二个
      continue
    }

    current += ch
  }
  if (current.trim()) segments.push(current.trim())
  return segments
}
```

拆完之后，每个segment再 tokenize、剥离 wrapper 命令（`sudo`、`command`、`env`），定位真正的可执行命令和它的参数：

```js
const WRAPPER_COMMANDS = new Set(["sudo", "command"])

const commandStartIndex = (tokens) => {
  let index = 0
  if (tokens[index] === "env") index += 1           // 跳过 env
  while (isAssignment(tokens[index])) index += 1     // 跳过 FOO=bar
  while (WRAPPER_COMMANDS.has(tokens[index])) index += 1  // 跳过 sudo/command
  return index
}
```

这段代码处理了五种常见绕过手法：`sudo rm`、`command rm`、`env FOO=1 rm`、嵌套引号中的路径、`cd` 后相对路径的 `rm`。

### 3.2 符号链接：攻击面的收口

拆完命令拿到路径后，直接 `startsWith(workspaceRoot)` 判断就完了？不够。

macOS 上 `/var` 是 `/private/var` 的符号链接。agent 执行 `rm /var/tmp/xxx`，你的 workspace root 是 `/private/var/tmp/myproject`——字符串匹配会漏掉。

恶意场景下更严重：如果攻击者在工作区内放一个指向 `/etc` 的符号链接 `danger -> /etc`，然后让 agent 执行 `rm ./danger/passwd`，纯路径匹配的插件会放行。

防御方式是**对已知存在的路径做 realpath 解析**：

```js
const normalizeExistingOrLexical = (path) => {
  try {
    return existsSync(path) ? realpathSync(path) : resolve(path)
  } catch {
    return resolve(path)
  }
}
```

对于临时目录白名单，更要强制解析符号链接：

```js
const TEMP_DIRS = Array.from(new Set([
  tmpdir(),
  realpathSync(tmpdir()),    // macOS: /var/folders/... -> /private/var/folders/...
  "/tmp",
  realpathSync("/tmp"),      // macOS: /tmp -> /private/tmp
  "/private/tmp",
]))
```

这不是过度防御。符号链接绕过是 harness 最常见的漏洞之一，`realpath` 解析是零成本修复。

### 3.3 cd 追踪：跨段状态

更难的场景是 `cd` 链：

```bash
cd /outside && rm -rf important_data
```

第一段 `cd` 合法，第二段 `rm` 的相对路径需要基于新的 cwd 解析。插件必须**维护一个跨段的 cwd 追踪器**：

```js
let cwd = initialCwd

for (const segment of splitSegments(command)) {
  const tokens = tokenize(segment)
  const start = commandStartIndex(tokens)

  if (tokens[start] === "cd" && tokens[start + 1]) {
    cwd = normalizeExistingOrLexical(resolve(cwd, tokens[start + 1]))
    continue
  }

  if (!isRmCommand(tokens[start])) continue

  for (const target of rmTargets(tokens, start)) {
    const absoluteTarget = normalizeExistingOrLexical(resolve(cwd, target))
    if (!isInside(absoluteTarget, workspaceRoot) && !isSafeTempDir(absoluteTarget)) {
      blocked.push({ target, absoluteTarget })
    }
  }
}
```

这是从"检测 `rm` 关键词"到"理解 shell 命令语义"的跨越。前者 5 行代码能写完，后者 250 行。区别在于：前者会被任何稍微复杂的命令绕过，后者不会。

### 3.4 逃逸口分级

不是所有钩子都需要逃逸口。关键设计原则是**按风险分级**：

- **`rm-outside-workspace-guard`**：**无 agent 可见逃逸口**。如果 agent 需要删除工作区外的文件，它必须把命令打印给用户，由用户手动执行。这是最硬的门禁——agent 物理上无法绕过。
- **`git-commit-gate`**：**有逃逸口**（`GIT_COMMIT_HOOK_SKIP=1`），但 agent 可以看到它。用于 commit 格式校验——这是规范问题而非安全问题，agent 有时确实需要绕过（比如 cherry-pick 产生的非标准 message）。
- **`external-review-gate`**：**有逃逸口**（`EXTERNAL_REVIEW_SKIP=1`），用于跨模型 review 门禁——review 系统本身可能故障，不能因为 review 挂了阻断所有 push。

逃逸口越容易获取，门禁越软。这不是 bug，而是有意的设计梯度。

## 四、门禁设计：一个 624 行的状态机

如果 hook 是基础设施，gate（门禁）就是架在基础设施上的业务逻辑。最复杂的例子是 `git push` 前的异源 review gate — 用不同 LLM 家族交叉审查代码。

### 4.1 为什么需要异源 review

同模型 self-review 有系统性盲区：Qwen review Qwen 的代码会漏掉 Qwen 训练偏好导致的问题（生态版本兼容、库 API 名混淆），Claude review Claude 同理。用不同家族的模型交叉审查，能暴露同族盲区。

但这不是一行 "请 review 一下" 这么简单。Review gate 需要处理：provider 超时怎么办？review 结果如何缓存？agent 修了代码再 push 要不要重审？

### 4.2 状态机与两轮预算

624 行代码的核心是一个 5 状态的状态机：

```
┌─────────────┐    diff 无变化     ┌───────────────┐
│  无 marker   │ ──────────────→  │  deny_fix_first │
│  (第一次push) │                  │  (发现了问题)   │
└──────┬───────┘                  └─────────────────┘
       │ diff 存在
       ▼
┌─────────────┐    修复后push      ┌──────────────┐
│  run round 1 │ ──────────────→  │  run round 2   │
│  (全量扫描)   │                  │  (验证+新风险)  │
└─────────────┘                  └──────┬─────────┘
                                        │ round 2 仍有问题
                                        ▼
                               ┌──────────────────┐
                               │ budget exhausted  │
                               │ (强制释放，放行)   │
                               └──────────────────┘
```

两个关键设计：

**Diff-hash 缓存**：每次 review 计算 diff 的 SHA256 前 16 位作为 marker key。如果 agent push 被 deny、修改代码后再次 push，diff hash 变了才会重审；如果 agent 什么都没改就再次 push，直接 deny 并提示"先修问题"。

**两轮后强制释放**：review 预算固定为两轮。Round 1 全量扫描发现问题，agent 修复后 Round 2 验证修复 + 检测新风险。Round 2 结束无论结论如何，marker 被清除。这防止了无限 review 循环——如果两轮过后还有问题，说明 reviewer 和 agent 之间存在认知鸿沟，再跑下去只是浪费 token。

### 4.3 多 Provider 降级链

```python
_PROVIDER_CHAIN = ["idealab-anthropic", "bailian", "idealab-openai"]
```

按顺序尝试，任何一个超时/崩溃/空响应，自动切换下一个。所有 provider 都失败时 **fail-open**（放行），不阻断 push。

这里的设计哲学是：**门禁不能因为自身故障而阻断正常开发流**。review 是增强，不是阻塞。如果 review 系统挂了，开发者应该能正常 push，事后补审。

### 4.4 豁免与边界

不是每次 push 都需要 review：

- diff < 10 行总变更：豁免
- 全是非代码文件（`.md`、`.json`、`.yml`）：豁免
- 纯文件删除和重命名：排除出 diff 统计

这些豁免规则是经验驱动的。10 行以内的改动（改个 typo、更新版本号）不值得消耗一个完整 review 周期的成本和延迟。

### 4.5 Deny 时回填综合判断指引

当 review 发现 Critical 或 Important 问题需要 deny 时，不只是返回原始 review 文本。gate 会注入一段 **4 步综合判断指引**：

1. 逐条比对：外源抓到 vs 同族抓到的问题
2. 对外源做 threat-model 校验：外源 common false positives（本机 CLI 输入当不可信、单 task 阻塞标 Critical）
3. 对同族做盲点反思：是否涉及训练偏好
4. 综合产出 fix dispatch：双方都有 evidence 的项打包修复

这不只是"告诉你有问题"，而是**教你怎么判断问题是否真的存在**。agent 拿到这个指引后，不会盲目地按 review 意见逐条修复，而是先做一轮独立判断。

## 五、工作流固化：从散文到 DAG

AGENTS.md 里写"并发 ≥ 3 时用 Dynamic Workflow"，agent 大概率会无视，自己用 subagent 串行跑完。不是 agent 不听话，而是**自然语言描述的并行指令对 LLM 来说太难执行**——它需要同时维护多个异步状态，跟踪依赖关系，在正确的时机调度下一个任务。

正确的做法是**把工作流从散文变成可执行脚本**。

### 5.1 Dynamic Workflow 引擎

Dynamic Workflow 是一个完整的 DAG 编排运行时：

```js
const wf = createWorkflow({ ... })

wf.dag([
  // Layer 1: 三个并发扫描
  wf.parallel([
    wf.agent("dead-ref-scan", { prompt: "扫描已废弃引用..." }),
    wf.agent("todo-scan",     { prompt: "扫描活跃 TODO/FIXME..." }),
    wf.agent("perm-scan",     { prompt: "检查权限配置一致性..." }),
  ]),
  // Layer 2: 综合分析（依赖 Layer 1 所有结果）
  wf.agent("synthesis", { prompt: "汇总三个扫描结果..." }),
])
```

`wf.dag()` 做拓扑排序，识别出 Layer 1 的三个节点没有互相依赖，可以全量并发起；Layer 2 依赖 Layer 1 全部完成才开始。

这不是"指导 agent 如何编排"，这是**agent 调用一个编排框架，框架负责调度**。agent 只关心每个节点的 prompt，框架关心依赖关系、并发控制、错误恢复。

### 5.2 文件系统 IPC

每个子 agent 运行在独立的 opencode server session 中，通过 `.workflow/` 目录进行文件系统 IPC：

```
.workflow/
├── commands/          # 主 agent → 子 agent 的指令
├── snapshots/         # 子 agent → 主 agent 的状态快照
├── events/            # 双向事件流
└── status/            # 各节点执行状态
```

子 agent 完成后在 status 目录写一个 `done.json`，框架检测到所有 Layer 1 节点的 `done.json` 后，将结果聚合注入 Layer 2 节点的 prompt。

这种 IPC 方式的优势是**不依赖任何网络通信**，纯文件系统，可审计、可回溯、可断点续传。

### 5.3 Git Worktree 隔离

coding 类工作流的一个硬性要求是**不能多个 agent 同时改同一个 checkout**。Dynamic Workflow 的 `worktree.mjs` 模块为 DAG 中的每个编码节点自动创建独立的 git worktree：

```
.worktrees/
├── node-1-fix-auth/    # agent 1 的隔离工作区
├── node-2-fix-cache/   # agent 2 的隔离工作区
└── node-3-fix-logging/ # agent 3 的隔离工作区
```

每层完成后，`merge-gate.mjs` 把同层所有 worktree 的改动合并到一个 accumulator 分支。整个 DAG 运行完毕后，由主 agent（而非框架）执行最终的合并和清理——因为**冲突解决需要 LLM 判断**，框架不该替 agent 做这个决策。

### 5.4 Human-in-the-Loop

DAG 执行中如果需要人做决策（比如"这三个修复方案哪个优先级最高？"），通过 `wf.needPrompt()` 机制暂停当前节点，把问题推送到主对话，等待人工响应后继续：

```js
const decision = await wf.needPrompt({
  question: "权限配置不一致：自动修复（可能误伤）还是人工确认？",
  options: ["自动修复", "人工确认"],
})
```

框架负责暂停、队列化后续节点、超时处理；主 agent 负责向用户展示问题、收集回答、写回 IPC。

这比"在 AGENTS.md 里写'遇到需要人确认的情况时，先问用户'"可靠一万倍。

## 六、从踩坑到防御

这些设计不是从白纸开始的，每一个都是从真实的事故或近失误中提炼出来的。仓库里 `docs/bugs/` 目录有 56 份结构化根因分析文档，记录了所有踩过的坑。几个典型案例：

**符号链接绕过 rm 防护**：macOS 的 `/var` → `/private/var` 导致路径匹配失败。修复：所有路径校验前做 `realpath`。

**Review gate 无限循环**：agent 修了代码但 reviewer 认为没修好，再次 deny；agent 再修，reviewer 又发现新问题。修复：两轮预算上限，到期强制释放 marker。

**`cd && git push` 漏审**：agent 用 `cd /other-repo && git push` 绕过 review gate（gate 只看当前 repo）。修复：解析 `cd` 前缀和 `git -C` 参数，动态切换审查目标。

**`split("&&")` 引号内误分割**：`echo "run a && b"` 被错误地在引号内分割。修复：手写引号追踪的词法分析器。

**Plan 文件扫描误报**：`plan-tracker.py` 扫描到自身代码中的 `TODO:` 字符串。修复：维护 `todo-scan-policy.md` 白名单，排除计划系统自身的代码。

每一个 fix 都沉淀为一篇 knowledge document（`docs/knowledge/`），配合 `AGENTS.md` 中"先写 bug 分析文档再修 bug"的规则，形成了**知识复用的正反馈循环**。

## 七、设计原则总结

从这套实践中可以提炼出几条通用的 harness 设计原则：

**1. 确定性 > 概率性**

能用代码拦截的不用文字约定。`throw new Error()` 的执行概率是 100%，AGENTS.md 里"绝对禁止"的执行概率是不可预测的。

**2. 分层而非全能**

L1 静态权限覆盖 90% 的低成本场景，L2 插件兜底 10% 的高风险场景，L3 文档做行为引导。每层有明确的"该做什么"和"不该做什么"。安全规则必须 L1+L2 双层——单层权限在符号链接和 shell 展开面前不堪一击。

**3. 命令解析而非正则匹配**

Agent 生成的 bash 命令不是规范文本。引号追踪、转义处理、cd 状态追踪、wrapper 命令剥离——这些都是从"能用"到"可靠"的距离。写一个 250 行的命令解析器，比堆正则 pattern 更可靠、更可维护。

**4. Fail-open 于非关键路径**

门禁的故障不能阻断正常开发。Review gate 超时、Plan tracker 崩溃、Provider 全部挂掉——这些情况下应该放行并记录，而非阻断。只有"agent 确实要做危险操作"时才阻断。

**5. 逃逸口按风险分级**

安全类规则（rm 外删）：无 agent 可见逃逸口。规范类规则（commit 格式）：有逃逸口，agent 可绕过。基础设施类规则（review gate）：有逃逸口 + fail-open。逃逸口越难获取，门禁越硬。

**6. 状态机管控多轮交互**

任何需要"agent 做事 → 检查 → agent 修改 → 再检查"的模式，都应该建模为状态机，而不是在 AGENTS.md 里写"请循环直到通过"。状态机有明确的转移条件、预算上限、超时处理。

**7. 脚本固化并行编排**

LLM 不擅长管理多个异步任务。任何涉及并发的编排都应该交给脚本框架（DAG 拓扑排序 + 层执行），agent 只负责定义每个节点做什么。

**8. Reason 伴文防止规则腐化**

每条规则配一条"为什么"的伴文，且强制同步维护。改规则不改 reason = 合规审查不通过。这防止了规则随时间失去上下文后变成不可理解的遗训。

## 八、结语

回到开头：AGENTS.md 是 harness 的用户界面。它定义了 agent 的行为边界，告诉 agent 什么是可以做的、什么是不应该做的。它是必要的。

但它不是 harness 本身。

真正的 harness 是当 agent 无视 AGENTS.md、试图做危险操作时，那层确保事情不会变糟的控制机构。是 250 行的命令解析器、624 行的 review 状态机、DAG 拓扑排序器、git worktree 隔离层。是那些不依赖于 agent "自觉"就能工作的代码。

写 AGENTS.md 是告诉 agent 该做什么。写 hook 是确保 agent 做不到不该做的事。

前者是 UX 设计，后者是基础设施工程。

好的 harness 设计，从来都是后者决定上限。
