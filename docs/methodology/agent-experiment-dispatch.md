# Agent 实验派发模板与方法学

## 0. 为什么需要这套东西

主对话上下文是实验最大的污染源。同一个主 agent 既设计实验又执行实施，
就会无意识地把"已知答案"灌进去——比如它已经踩过的坑、已经收敛的 API
选型、已经写好的共享文件。即便是看似合理的提示词，也会被"答案"反向
塑造。

要做可信的对照实验，必须：
1. 用 subagent 隔离上下文（每个变体独立 cold context）
2. 用文件路径白名单替代 mcp 检索（让 subagent 真正"看不到"其他 skill）
3. 用合规自审报告做事后审计（信任但验证）
4. 用封闭验收清单防 Parkinson（agent 不会"提早收工"，会装饰边角）

本文档是这套方法的**可重复模板**——下次做下个业务模式 block（订单详
情 / 商品瀑布流 / 通话面板等）时直接照抄填空。

---

## 1. 已知坑（实施前必读）

### 1.1 AI Parkinson 定律
> 给 agent 一个高层组件，它不会"提早收工"——它会用省下来的注意力额
> 度去装饰项目边角。

**实证**：把仅 antd 原子 vs 加 ProList 两组让 cold-context subagent 实施，
列表渲染层减少 −55.9%（强成立 H1），但总 LOC 仅降 −1.7%——差额被 agent
自动加上的 DetailPane / IdentityGate / 复杂 App.tsx 抹平。

**对策**：验收清单**严格封闭**。明确列出"禁止追加未要求特性"，并在自
审报告里要求列出每个超出验收范围的模块。

### 1.2 LOC 总数是不合适的单一指标
应该按职责分桶，至少分：
- `list_render` —— 任务核心，主要受 UI 抽象层级影响
- `infra` —— types / api / ws / state / util，业务专属逻辑
- `app_layout` —— App / 布局 / identity 等，最容易 Parkinson 化
- `css` —— 样式
- `config` —— 工程配置

**报告时优先看分桶 Δ%，而不是 TOTAL Δ%**。

### 1.3 主对话上下文必污染
不要让主 agent 自己写变体——必须派发 subagent。共享文件（types/client/
ws/util）也不要 cp，让每个 subagent 自己根据契约重新写，这才是真正的
变量。

### 1.4 mcp 检索通道污染白名单
`/knowledge-retrieval` 与 `mcp__skill-catalog__*` 让 subagent 看到全集，
等于白名单失效。**必须在 prompt 里显式禁掉**，并显式覆盖 CLAUDE.md
"反幻觉强制检索"那条规则。

### 1.5 项目根 CLAUDE.md 优先级高于 prompt
按 superpowers 优先级链：用户 CLAUDE.md > skill > 默认。所以本文档的
模板里有一段"实验授权覆盖"必须保留，把 CLAUDE.md 的相关条款显式
override 掉。

### 1.6 prompt 缝隙：顶层文件常被忘
两次实验里，subagent 都读了 `blocks/<name>/README.md` 和 `Makefile`
（不在禁令显式列表内），属于 prompt 漏洞。模板已修复——禁令补上整个
`blocks/<scenario>/`，只留 protocol 三件套作为白名单。

---

## 2. 派发流程（Recipe）

### 2.1 实施前准备
1. 启动 block 的后端服务，确认 `/healthz` 200
2. seed 用 **固定的 primary user_id**（用 `--primary-user-id` 锁），保证多变体起点完全一致
3. 创建空的 `experiments/<scenario>-<date>/<variant>/` 输出目录
4. 复制下方模板，替换 `{{...}}` 占位符

### 2.2 派发
- **串行**而非并行：避免后端状态互污；前一个变体跑完后 reset DB 再派发下一个
- foreground subagent（你需要它的产物来 audit + 跑下一个）
- subagent_type 用 `general-purpose`（足够，不需要专门 agent 类型）

### 2.3 中间清理
变体 N 跑完之后，下变体 N+1 之前：
1. `pkill -f uvicorn` 关掉旧后端
2. `imcl-seed reset && imcl-seed demo --primary-user-id <fixed>` 重置数据
3. 重启后端
4. 清空 N+1 的输出目录（如果不是首次跑）

### 2.4 事后审计
对每个 subagent 的回复做：
1. **合规审计**：核对自审报告，特别看
   - 是否调用过 `/knowledge-retrieval` / `mcp__skill-catalog__*`（必须 0）
   - 是否读过禁令路径下的文件（必须 0）
   - 是否使用过白名单外的库（必须 0）
   - 是否派发过 subagent（必须 0）
2. **产物审计**：
   - `pnpm build` / `pytest` 等是否实际通过（不能只信 subagent 自报）
   - 验收清单的"禁止追加项"是否真的没出现
3. **量化分析**：按桶统计 LOC，对比变体间 Δ

### 2.5 写结论
- 数据写到对应 plan 的 §7.x（按变体批次）
- 决策落点必须基于**分桶 Δ**，不是 TOTAL Δ
- 任何"超出验收范围"的产出都要在结论里点名（Parkinson 的具体表现）

---

## 3. Subagent Prompt 模板

直接复制下方代码块到 `Agent` 工具的 `prompt` 字段，替换所有
`{{占位符}}`。**不要删除任何 `【...】` 段**——它们是经过实验验证
的最小合规结构。

````markdown
你是一个实施 subagent，被派发到一个【受控的科学实验】中。你的任务是从零构建 {{scenario_description}}。

【⚠️ 实验授权 ⚠️】
用户已显式授权本次任务**覆盖** `/Users/mhbzhy/.claude/CLAUDE.md` "反幻觉：每阶段强制知识检索"那一条。本任务下：
- 禁止调用 `/knowledge-retrieval` skill
- 禁止调用任何 `mcp__skill-catalog__*` 工具（list_skills / resolve / get_skill / available_tags）
- 你可参考的 skill 知识只能来自下方"允许 skill 文件路径"白名单（用 Read 工具读取）

理由：本次是测量"agent 在不同 skill 抽象层级下的自写代码量"的对照实验，mcp 检索通道会让你看到全集，污染受控变量。

【硬性禁令】
- 禁止读取以下路径任意文件：
  · /Users/mhbzhy/claude-config/experiments/{{exclude_other_variants}}
  · /Users/mhbzhy/claude-config/blocks/{{scenario_slug}}/backend/**
  · /Users/mhbzhy/claude-config/blocks/{{scenario_slug}}/frontend/**
  · /Users/mhbzhy/claude-config/blocks/{{scenario_slug}}/protocol/generated/**
  · /Users/mhbzhy/claude-config/blocks/{{scenario_slug}}/README.md
  · /Users/mhbzhy/claude-config/blocks/{{scenario_slug}}/Makefile
  · /Users/mhbzhy/claude-config/docs/plans/skill-abstraction-experiment*
  · /Users/mhbzhy/claude-config/docs/methodology/**
  · /Users/mhbzhy/claude-config/skills/**（除"允许 skill 路径"白名单外）
- 禁止使用 {{stack_constraint}} 之外的核心栈
- 禁止使用任何业务模式绑定的同类组件库（{{forbidden_competing_libs}}）
- 禁止派发其他 subagent（不得使用 Agent / Task 工具递归）
{{# 变体特定的额外禁令，如 "禁止使用 ant-pro-*" }}
{{extra_forbidden}}

【🚨 验收清单严格封闭 🚨】
**严禁追加任何未在验收清单中列出的特性**。这条禁令对应 AI Parkinson 定律——agent 拿到高层组件后倾向于"用省下的精力装饰边角"。本实验要测的是"完成同一组验收所需的代码量"，所以**多写一个未要求的 DetailPane / IdentityGate / 多 Tab / 自定义主题切换器都算违规**。

如果你认为某项功能"显然应该有"但不在清单里，把它**写到自审报告的"建议追加"里**，**不要写到代码里**。

【允许的 skill 文件路径（白名单——只能读这些 SKILL.md）】
{{allowed_skill_paths_list}}

加上 React / 框架的内置能力。名单外的 skill / 库 / 路径不得使用。

【受控接口】
- 后端已启动：{{backend_url}}
- OpenAPI 契约：{{openapi_path}}
- AsyncAPI（WS 事件）：{{asyncapi_path}}
- 协议人类可读说明：{{types_md_path}}
- 鉴权（dev 模式）：{{auth_instructions}}
- 系统有 HTTP 代理设置 `http_proxy=http://127.0.0.1:7897`；用 curl 时记得加 `--noproxy '*'` 才能打到 localhost

【输出目录】
所有代码写到（已创建）：
{{output_dir}}

完成后该目录下需要包含：
- 完整可运行的项目（{{build_commands}} 都要通）
- README.md：说明做了什么、做了哪些权衡、踩了哪些坑、哪些验收项未达成
- self-loc.txt：按文件分项 + 总计的自写 LOC（去除空行和纯注释行）

【任务（封闭验收清单——只做这些，不要多）】

{{closed_acceptance_clipboard}}

时间格式 / 颜色 / 微动效等无关紧要的细节由你决定。

【自检】
完成后必须自验证：
1. 构建命令必须通过
2. 启动 dev server 后能渲染、调通 API、看到种子数据
3. WebSocket 连接 + 事件接收要能实际测到
4. README 里诚实记录哪些验收项未达成

【最终回复格式】

## 实施摘要
- 构建状态
- 验收项完成数（按上述清单逐条勾选）
- 自写 LOC 总数 + 各文件分项（按 list_render / infra / app_layout / css / config 五桶分别加和）
- 主要权衡 / 妥协点
- 最耗时的 3 个问题

## 建议追加（不要写到代码里）
列出你认为"应该有但不在验收清单里"的特性。这些**写在这里**，不要追加到代码——否则违反封闭性。

## 合规自审报告
- **Read 工具调用过的所有文件路径列表**（一行一个绝对路径）
- **Skill 工具调用过的所有 skill 名**（应为空；如非空必须说明）
- **Bash 工具运行过的所有命令**（一行一条；可分组归纳）
- **是否触碰白名单/禁令**：列出任何疑似违规调用，或确认 0 违规
- **是否追加了验收清单外的功能**：必须诚实承认；这条违规会直接判变体作废

诚实报告，即便有违规也要列——主对话会做事后审计，能查出来的。
````

---

## 4. 占位符填法说明

| 占位符 | 例子 | 备注 |
|---|---|---|
| `{{scenario_description}}` | "微信风格的会话列表前端页面" | 一句话描述，不要泄漏实现路径 |
| `{{scenario_slug}}` | `im-conversation-list` | block 目录名 |
| `{{exclude_other_variants}}` | `im-conversation-list-2026-05-09-v2/variant-b/**` | 兄弟变体的精确路径 |
| `{{stack_constraint}}` | `React 18 + Vite + TypeScript + antd 5` | 锁死栈以隔离变量 |
| `{{forbidden_competing_libs}}` | `refine / retool / ant-design-x 等` | 同类业务组件库 |
| `{{extra_forbidden}}` | 仅 Variant A：`禁止使用 @ant-design/pro-components 中的任何组件` | 变体专属 |
| `{{allowed_skill_paths_list}}` | 见示例 | 一行一个绝对路径 |
| `{{backend_url}}` | `http://localhost:8080` | block 后端 |
| `{{openapi_path}}` 等 | `/Users/mhbzhy/claude-config/blocks/<slug>/protocol/openapi.yaml` | 协议三件套 |
| `{{auth_instructions}}` | 见示例 | dev 头 + WS query |
| `{{output_dir}}` | `/Users/mhbzhy/claude-config/experiments/<slug>-<date>/variant-<x>/` | 已创建好的空目录 |
| `{{build_commands}}` | `pnpm install / pnpm dev / pnpm build` | 各栈不同 |
| `{{closed_acceptance_clipboard}}` | 验收项 markdown 列表 | 每条要明确，不要"等等"/"诸如" |

---

## 5. 自审报告审计 Checklist

收到 subagent 回复后，逐项对照：

### 必查（违规即作废）
- [ ] `/knowledge-retrieval` 调用次数 == 0
- [ ] `mcp__skill-catalog__*` 调用次数 == 0
- [ ] Read 路径全部在白名单内（grep 一遍报告）
- [ ] 派发其他 subagent 次数 == 0
- [ ] 引入的库全部在允许范围内（看 `package.json` 或 `pyproject.toml`）
- [ ] 实际产物里没出现验收清单外的模块

### 必查（不达标重跑该变体）
- [ ] 构建命令真的通过（自己跑一遍验证，不能只信 subagent 自报）
- [ ] 验收清单完成度 ≥ 80%
- [ ] LOC 报告各桶加和 == 总数

### 软查（写进结论的质性观察）
- [ ] sandbox 拦截记录：subagent 是否诚实报告了被拦截的尝试
- [ ] "建议追加"列表：agent 觉得"应该有"的额外特性是什么——这是产品需求线索

---

## 6. 复用本模板做下一个业务 block 的步骤

假设要做 `commerce-product-list`（商品瀑布流）：

1. 确保 `blocks/commerce-product-list/{protocol,backend,seed}` 已经做好（用 IM block 的工程模板）
2. `cp docs/methodology/agent-experiment-dispatch.md docs/plans/experiment-commerce-product-list.md` 当起点
3. 在 `experiments/commerce-product-list-<YYYY-MM-DD>/` 下建好 `variant-{a,b,c}/` 空目录
4. 用本文档第 3 节的模板，把所有 `{{占位符}}` 换成商品流场景的内容
5. 选定两个变体的"允许 skill 列表"作为唯一变量（其余完全相同）
6. 按第 2 节的 Recipe 跑实验
7. 数据按桶分析后，写到对应实验文档的 §7

---

## 7. 当前已用此模板验证的场景

| 场景 | 日期 | 变体 | 数据点 |
|---|---|---|---|
| im-conversation-list | 2026-05-09 v2 | A（仅原子）vs B（A + ProList） | list_render −55.9% / total −1.7%（Parkinson 暴露） |

后续每跑一个实验，回填一行。这张表是方法学的演化日志。
