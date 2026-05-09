# 实验 + 库种子：会话列表业务模式

## 文档信息
- **创建时间**: 2026-05-09
- **更新时间**: 2026-05-09（双重定位升级：实验 + agent-native 业务组件库的第一颗种子）
- **状态**: 待执行
- **关联**:
  - 主问题：`skill-organization-grouping.md` 推迟实施，但「组件层级太低」的根因更紧迫
  - 上游讨论：是否需要为 agent 自研 business-pattern 组件库

## 0. 双重定位（关键升级）

本任务**不是一次性实验**。产出物按**生产级标准**建设，直接作为 agent-native
业务组件库的**第一个 block**。即：

- **实验目标**（可证伪）：验证 H1 / H2，决定是否长期投入业务组件库
- **建设目标**（无论实验结论）：产出一个**端到端、生产级**的「会话列表」block，
  作为后续库化的种子和样板

两个目标互不冲突——实验只在 UI 层做变体（A/B/C），后端/协议/数据层只做一次，
按生产级建设。Variant C 若被触发，其输出（带强指令的 SKILL.md + 业务组件源码）
直接成为 block 的最终形态。

### 业务模式 = 端到端 atomic unit
"会话列表"不是一个 UI 组件，而是一组配对资产：

| 层 | 产物 | 复用价值 |
|---|---|---|
| 前端 | `<ConversationList>` 组件 + 状态管理 + 实时同步 | UI 直接落地 |
| 协议 | OpenAPI 接口契约 + WebSocket 事件 schema | 前后端解耦的边界 |
| 后端 | 会话/消息存储、未读维护、推送、置顶/免打扰 API | 后端服务直接落地 |
| 数据 | seed 数据、性能基准用大数据集生成器 | 演示与压测复用 |
| 测试 | E2E 用例、单元测试、性能基准 | 质量基线与回归保障 |

库的"原子单元"是这一整组资产，而不是单独的 `<ConversationList>`。
这才是 agent-native 业务组件库相对于 ProComponents/refine 的真正差异点：
**前后端配对、开箱即用、不需要 agent 自己拼协议**。

## 1. 背景与假设

### 假设 H1
> 把 skill 抽象层级从"UI 原子"提升到"UI 模式"（如 ProComponents），
> 能显著减少 agent 在固定业务场景下的自写代码量与决策次数。

### 假设 H2
> 仅 H1 不够；只有把 skill 进一步绑定到具体业务域（business-pattern），
> agent 才会真正放弃自写、走"组装"路线。

H1 是已有 skill 能验证的；H2 需要一次 skill 蒸馏增量才能验证。
两者构成阶梯式实验。

## 2. 场景定义：微信风格会话列表

选择此场景的理由：
- 高频，几乎所有移动/PC IM 都需要
- 有明确的边界（不会无限扩展）
- 包含足够多 agent 通常会自己实现的细节（实时更新、未读、置顶、空态、骨架屏、搜索）
- 现有 antd Pro + im skill 组合可以覆盖大部分能力

### 验收清单（受控需求）
功能项是否实现按以下清单逐项打勾：

- [ ] 列表项：头像、名称、最后消息预览（含 emoji/媒体占位）、时间戳（智能格式：今天 HH:mm / 昨天 / 周几 / yyyy-mm-dd）、未读 badge、置顶标记、消息状态（已读/未读/发送中）
- [ ] 实时更新：新消息到达 bump 到顶部、未读数 +1、当前打开的会话不 bump 且不增加未读
- [ ] 置顶逻辑：置顶项始终保持在最上方，置顶组内仍按消息时间排序
- [ ] 交互：点击进入会话、右键/长按菜单（删除 / 置顶 / 标记已读 / 免打扰）
- [ ] 数据加载：首屏骨架屏、下拉刷新、上拉加载更多、空态、错误态 + 重试
- [ ] 搜索：顶部搜索框，按昵称/最后消息内容过滤，不影响全量缓存
- [ ] 性能：列表 ≥ 1000 条时滚动顺滑（虚拟滚动或等价方案）
- [ ] a11y：键盘导航 + 屏幕阅读器可识别未读数

### 受控接口（生产级，非 mock）
原方案用 mock 服务消除变量，现升级为**真实后端实现**——它本身就是 block 的后端层产物。

**协议层**（先于前后端落地）：
- OpenAPI 3.x 完整契约（含错误码、分页、过滤、排序）
- WebSocket 事件 schema（新消息、已读回执、置顶变更、对方在线状态）
- 用 [zod / pydantic] 双端校验，protocol 包导出共享类型

**后端层**：
- FastAPI（已在 skills 库中有 fastapi、fastapi-users 蒸馏）
- 表设计：conversations、messages、user_conversation_state（未读/置顶/免打扰）
- 推送通道：WebSocket + offline 落库回放
- 索引设计：按用户分区，置顶分组排序
- 接口完整：列表分页、置顶、免打扰、删除、标记已读、搜索（昵称 + 最后消息内容 LIKE/全文）
- 性能基线：1k 会话、100k 消息、平均 P99 < 100ms

**数据层**：
- 演示种子：50 个用户、200 个会话、10k 消息（用真实分布生成）
- 压测种子：1k 会话、100k 消息（用于性能基准与虚拟滚动验证）
- 生成脚本可复用，作为后续其他 block 实验的基础设施

## 3. 实验变体

每个变体使用同一份 prompt（含验收清单），区别只在允许使用的 skill 集合。

### Variant A：低层抽象（基线）
**允许 skill**：`ant-list`、`ant-avatar`、`ant-badge`、`ant-input`、`ant-dropdown`、
`ant-skeleton`、`ant-empty`、`ant-result`、`ant-typography`、
`react-im-client`、`im-protocol-core`、`offline-sync`、`react-useState/useEffect/useMemo/useCallback`

**预期**：agent 自己写大量布局/样式/状态管理代码

### Variant B：中层抽象（ProComponents）
**允许 skill**：A 的全部 + `ant-pro-list`、`ant-pro-layout`

**验证 H1**：相比 A 是否显著降低自写代码？

### Variant C（条件触发）：业务模式绑定
**前置条件**：B 相比 A 改善有限（< 30% 自写代码减少），或 B 仍出现大段定制化代码

**动作**：蒸馏一份 `im-conversation-list` skill：
- 强指令型描述（"凡是 IM 会话列表场景禁止用 ant-list/ant-pro-list 自行拼装"）
- 声明式 schema：`<ConversationList resource={...} renderItem={...} />`
- 自带：虚拟滚动、置顶分组、未读分组、骨架屏、空态、搜索、长按菜单
- 逃生口：`renderItem` slot、`onItemAction` 回调

**验证 H2**：相比 B 是否再次显著下降自写代码？

## 4. 评估指标

每个变体跑 ≥ 3 次（不同对话上下文起点），取均值。

### 4.1 量化指标
| 指标 | 测量方式 | 解释 |
|---|---|---|
| 自写代码行数 | git diff stat 对最终产物计数，去掉 import 与类型声明 | 越低越好 |
| skill 组件调用次数 | grep `<Pro` / `<Conversation` / `<List>` 等 | 越高越好 |
| 自写：组件调用比 | 上两项的比值 | 核心指标 |
| 决策点数量 | 翻 transcript，统计 agent "decide / consider / 选择" 类语句 | 反映认知负荷 |
| 总 token 消耗 | session 结束统计 | 反映上下文压力 |
| 完成迭代次数 | 修改文件的 Edit/Write 次数 | 越少越好 |
| 验收清单完成率 | 人工核对 | 必须 ≥ 80% 才能纳入比较 |

### 4.2 质性观察
- agent 是否在某些功能上"绕过 skill 自己写"？记录具体场景
- agent 是否误用 skill（API 错配）？记录具体错误
- agent 是否对 skill 边界混淆（不知道该用 A 还是 B）？

## 5. 决策树

```
Variant A vs B 自写代码差异
├── 减少 ≥ 50% → H1 强成立。ProComponents 已足够，不必自研业务组件库
│   止步：把"强指令型 skill 写法"复制到其他技术栈
│
├── 减少 30%-50% → H1 弱成立。ProComponents 有用但不彻底
│   触发 Variant C 实验
│
└── 减少 < 30% → H1 不成立。问题不在抽象层级
    排查根因：skill 写法（指令性不足）？检索召回？prompt？
```

```
Variant B vs C 自写代码差异（仅在触发 C 时）
├── 再减少 ≥ 40% → H2 成立。值得长期投入 agent-native 业务组件库
│   下一步：用同样方法做 2-3 个其他高频场景（订单详情页、商品瀑布流、
│   音视频通话面板），验证是否可推广
│
└── 再减少 < 40% → H2 不成立。问题在更上游（skill 指令性、prompt 控制）
    放弃 agent-native 业务组件库路线
```

## 6. 实施步骤

### 6.1 协议 + 后端 + 数据（生产级，3-4 天）
1. 设计 OpenAPI 契约 + WS 事件 schema（先与"未来 agent 怎么调用"对齐）
2. FastAPI 后端实现，含完整测试（单元 + 集成）
3. 数据生成脚本（演示 + 压测两档）
4. 自带 dev server 启动脚本（一行 `make dev` 拉起）
5. README：架构图、API 速查、扩展点说明

### 6.2 跑 Variant A、B（每变体 0.5 天）
1. 起干净的 agent 会话
2. 喂入统一 prompt + 限定 skill 列表 + 真实后端 endpoint
3. 让 agent 一次性完成（中途不干预）
4. 抓 transcript、最终代码、token 计数
5. 这两版前端代码归档到 `experiments/` 作对照参考，**不进入** block

### 6.3 评估（0.5 天）
1. 量化指标自动统计（写一个简单脚本）
2. 质性观察手工记录
3. 输出对比表 + 决策树落点

### 6.4 Variant C / 前端组件正式版（条件性 + 必要，3-4 天）
即便决策树指向"H1 已经够用"，仍需要把**生产级前端组件**作为 block 的前端层产出。
区别只在 SKILL.md 的指令强度：
- H1 强成立 → 蒸馏一份"基于 ant-pro-list 的会话列表用法 skill"
- H1 弱成立 / 不成立 → 自研 `<ConversationList>` 组件 + 强指令型 skill

无论哪条路径，前端组件都要按生产级标准建设（见第 8 节质量基线）。

### 6.5 结论沉淀 + block 库化
- 把对比结果回写到本文档第 7 节
- 根据落点更新 `skill-organization-grouping.md` 的等待条件
- 把 block 落到正式目录（见第 9 节仓库布局）
- 写 SKILL.md 指向 block 资源，进入 skills 检索池

## 7. 实验结果

### 7.1 第一轮：Variant A vs Variant B（2026-05-09）

#### 7.1.1 LOC 对比

| 文件 | Variant A | Variant B | 备注 |
|---|---:|---:|---|
| `api/types.ts`（手写协议镜像） | 112 | 112 | 共享，两边都没用 codegen |
| `api/client.ts`（HTTP 客户端） | 93 | 93 | 共享 |
| `hooks/useWebSocket.ts` | 41 | 41 | 共享 |
| `utils/time.ts`（智能时间格式化） | 44 | 44 | 共享 |
| `main.tsx` | 14 | 14 | 共享 |
| `vite-env.d.ts` | 6 | 6 | 共享 |
| **小计：基础设施（无 skill 抽象差异）** | **310** | **310** | — |
| `App.tsx` | 16 | 14 | — |
| `hooks/useConversations[Pro].ts` | 150 | 105 | reducer 简化 |
| `components/ConversationList[Pro].tsx` | 120 | 129 | 行渲染换 metas，但 ProList 配置开销不低 |
| `components/ConversationItem.tsx` | 68 | 0 | ProList metas 替代 |
| `components/SearchBar.tsx` | 21 | 0 | ProList toolBarRender 替代 |
| `components/ContextMenu.tsx` | 43 | 0 | 改为 ProList actions 槽（"..." 按钮） |
| **小计：UI 与状态（受 skill 抽象影响）** | **418** | **248** | **−170 LoC = −40.7%** |
| **总自写 LOC** | **728** | **558** | −170 LoC = −23.4% |

#### 7.1.2 落点判定

按决策树（§5）：

- **UI/状态层** 减少 40.7% → **H1 弱成立**（在 30%–50% 区间）
- **总 LOC** 减少 23.4% → 看上去像 H1 不成立，但因为基础设施 310 LoC 是固定成本（types/http/ws/util，两端都得写），用总 LOC 衡量 H1 不公平

**采纳 UI/状态层口径，落点为"H1 弱成立"——触发 Variant C 实验**。

#### 7.1.3 质性观察

- ProList 的 `metas` 模型对"avatar/title/description/extra/actions"五槽布局贴合度高，本场景几乎零失配
- 但 `actions` 槽是 hover/点击触发，**不直接支持右键菜单**——A 的"右键弹菜单"交互在 B 里被迫降级为"… 按钮+点击"。这是 ProList 抽象边界外的细节，agent 必须妥协交互或自己 onContextMenu 包一层
- ProList 的 `request` API 假设 offset 分页，**与 cursor 分页不兼容**——B 实际用的是外部 state + `dataSource`，等于 ProList 的 push/pull 一半都没用上
- 真正"ProList 帮上忙"的部分：行渲染（−68 LoC）+ 搜索栏（−21 LoC）+ 加载/空态（约 −10 LoC，分布在 ConversationList 中）
- 真正"ProList 帮不上忙"的部分：WS 状态合并、cursor 分页、右键交互——这些都是 IM 业务模式专属逻辑，**无关 UI 抽象层级**

#### 7.1.4 对 Variant C 的设计指引

H1 弱成立 + 上面的质性观察，提示 Variant C 应当攻击的真正瓶颈：

1. **基础设施 310 LoC 是真大头**——types/http/ws/util 是每个 IM 前端都要写的板砖
   → Variant C 的 `im-conversation-list` block 应当**直接 export 一个 `<ConversationList>` 组件 + `useConversations` hook**，把这 310 LoC 做成预制件
2. **WS 状态合并是 IM 专属逻辑，与 UI 抽象正交**
   → 业务模式绑定的 hook（不是泛化 ProComponents）才能消化这部分
3. **cursor 分页 + 右键菜单 + 智能时间** 是 IM 列表场景的"细节包"
   → 业务模式 skill 应自带这些

预期 Variant C 相比 B 应在 UI/状态层再减少 40%+（从 248 → ≤150），且 SKILL.md 强指令型的存在会让 agent 直接放弃自写。

### 7.2 第二轮：受控派发的 A vs B（2026-05-09 v2）

#### 7.2.1 实验改进

第一轮（§7.1）数据**判作废**——主对话上下文严重污染了 Variant B 的实施过程：
- B 的共享文件（types/client/ws/time）是从 A 直接 cp 过来的，跳过了"agent 看 OpenAPI 自己手写"的真正变量
- 主 agent 已知 A 的所有踩坑修复（tsc emit、WS 鉴权、peer 过滤），B 完全不需要重踩
- 主 agent 已知 ProList 的 cursor/offset 不兼容、API 选型路径已收敛，B 没有任何试错成本
- 哪怕 prompt 本身也被"已知答案"反向塑造

第二轮设计：
- 派发独立 subagent（cold context）给 A 和 B，**每个 subagent 自己从 OpenAPI 写起**
- 禁用 `mcp__skill-catalog__*` 与 `/knowledge-retrieval`——这两条等于让 subagent 看到全集 skill 索引，污染受控变量
- skill 知识只通过显式白名单文件路径用 Read 工具读取（A: 16 份 SKILL.md，B: 18 份）
- 协议 codegen 产物（`protocol/generated/`）禁读——强制双方手写 types 镜像
- 串行派发（中间 reset DB）避免数据互污
- 每个 subagent 提交 **合规自审报告**：列出所有 Read / Bash / Skill 调用，主 agent 事后审计

#### 7.2.2 合规审计结果

两个 subagent 全程：
- 0 次 `/knowledge-retrieval` / `mcp__skill-catalog__*` 调用
- 0 次读取兄弟变体 / backend / frontend / codegen / 实验文档
- 0 次派发递归 subagent
- 0 次使用白名单外的 npm 库
- 各 1 次"诚实尝试越界"：A 试 `psql` 直连 postgres 查种子用户名；B 试 `find -name "*.db"`——均被 sandbox 拦截，subagent 主动停止并在自审报告里如实记录
- 一处 prompt 缝隙：两个 subagent 都读取了 `blocks/im-conversation-list/README.md` 和 `Makefile`（不在显式禁令列表内）。**对 A/B 等价开放**，不影响对照公平性，但下次 prompt 应补禁

#### 7.2.3 LOC 对比（按职责分桶，统一基线）

| 桶 | Variant A | Variant B | Δ | Δ% |
|---|---:|---:|---:|---:|
| **list_render**（List + Item + SearchBar） | **632** | **279** | **−353** | **−55.9%** |
| infra（types / api / ws / format / state） | 676 | 659 | −17 | −2.5% |
| app_layout（App / Detail / Identity / main） | 238 | 515 | **+277** | **+116.4%** |
| css | 192 | 260 | +68 | +35.4% |
| config（package / vite / tsconfig） | 103 | 97 | −6 | −5.8% |
| **TOTAL** | **1841** | **1810** | **−31** | **−1.7%** |

#### 7.2.4 决策树落点（按桶判定）

按 §5 决策树：
- **list_render 桶 −55.9% ≥ 50%** → H1 在其覆盖域内**强成立**
- **TOTAL −1.7%** → 看上去 H1 完全不成立

两个结论矛盾，**说明 LOC 总数不是合适的单一指标**。真正发生的是：

#### 7.2.5 关键发现：Parkinson 定律的 AI 版本

ProList 把列表渲染代码砍掉一半（-353 LoC），**但 agent 没把省下来的精力变成"更短的总代码"**——
而是反手在 app_layout 桶里加了 +277 LoC：DetailPane（109）、IdentityGate（73）、更复杂的 App.tsx（309 vs 137）等
**本不在验收清单里**的特性。

也就是说：
> 给 agent 一个高层组件，它不会"提早收工"——它会用省下的注意力额度去"装饰"项目边角。

这个现象**对实验方法学的启示**：
1. 验收清单必须**严格封闭**：禁止 agent 追加未要求的特性，否则 LOC 比较被污染
2. 应分桶看，而不是看 TOTAL：ProList 在它的覆盖域内的价值（−55.9%）才是真实数据点
3. 也提示一种产品工程现象：高层组件释放的认知预算**不会自动变成节省**，需要纪律约束

#### 7.2.6 对 Variant C 设计的指引（更新）

H1 在 list_render 桶内强成立，但 **真正的天花板是 infra 桶 660+ LoC**：
- types 手写（A 134 / B 145）—— codegen 可直接归零
- HTTP client（A 118 / B 104）—— 业务 block 可预制
- WS reconnect + event router（A 95 / B 70）—— 业务 block 可预制
- 状态合并 reducer（A 219 / B 235）—— **业务专属逻辑**，业务 block 应当 export 为 hook
- 智能时间格式化（A 110 / B 105）—— util 类，可单独提取

Variant C 的 `im-conversation-list` block 应当：
1. **直接 export `<ConversationList>` 组件 + `useConversations` hook**，把 infra 的 660+ LoC 变成 import
2. 提供 codegen-friendly 的 `protocol/generated/` 类型，省掉 types 那 ~140 LoC
3. SKILL.md **强指令型**："凡 IM 列表场景禁止自行手写 list / item / WS 状态机"
4. 配合验收清单的"严格封闭"约束（不让 agent 加 DetailPane 等装饰特性）

预期 Variant C 在 list_render + infra 两个桶内合并降至 ≤ 200 LoC（vs A 的 1308），并把 app_layout 控制在 130 LoC 以内（与 A 持平）。

### 7.3 后续

- Variant C：触发，按 §6.4 流程蒸馏 `im-conversation-list` skill + 写生产级前端组件，进 `blocks/im-conversation-list/frontend/`
- 验收清单需要做封闭性强化（禁止可选特性追加），否则 Parkinson 现象会继续污染 C 的对比
- 实验方法学补充：分桶 LOC 是更稳健的指标；TOTAL 仅做参考

## 8. 产物质量基线

每一层产物都必须达到这条基线才能纳入库（不达标则继续打磨，不进库）。

### 8.1 通用要求（所有层）
- [ ] 类型完备：TS strict 模式 / Python type hints + mypy 严格通过
- [ ] 测试覆盖：unit ≥ 70%、关键路径必有 integration / E2E
- [ ] 错误处理覆盖：网络错误、超时、断连重连、并发冲突、空态、loading、权限错误
- [ ] 文档：README + API 速查 + 扩展点说明 + **不适用场景声明**（反向选型）
- [ ] 可独立运行：`make dev` 一行启动；自带 seed
- [ ] 无业务硬编码：所有"业务专属"参数走 props/config，不污染组件本体

### 8.2 前端层
- [ ] a11y：键盘导航、ARIA、屏幕阅读器读未读数
- [ ] 性能：1k 列表 60fps，首屏 < 300ms（含数据加载）
- [ ] Storybook 或等价演示页（覆盖空态、loading、错误、置顶、长列表）
- [ ] 可主题化（暗色 / 自定义品牌色不需要改组件源码）
- [ ] 逃生口：`renderItem` slot、`onItemAction` 回调、`itemKey` 自定义

### 8.3 后端层
- [ ] 性能基线：1k 会话 / 100k 消息下 P99 < 100ms
- [ ] 数据库迁移完整（alembic / 等价工具）
- [ ] 推送通道：断连重连、消息顺序保证、丢失补偿
- [ ] 鉴权钩子：可注入用户上下文，不绑死任何鉴权方案
- [ ] 可观测性：结构化日志 + 关键路径 metrics

### 8.4 协议层
- [ ] OpenAPI 通过 spectral lint
- [ ] 双端从协议生成类型（zod schema → TS / pydantic → Python）
- [ ] 版本字段预留（避免后续兼容性陷阱）

### 8.5 SKILL.md（agent 入口）
- [ ] **强指令型**：明确"何时必须用、何时禁止用"
- [ ] 给出最小用法 snippet（agent 可以一字不改地复制）
- [ ] 列出常见误用与对应正确写法
- [ ] 反向选型：什么场景不适合用这个 block

## 9. 仓库布局与命名

### 9.1 目录定位
新建 `blocks/` 与 `skills/` 平级，存放业务模式组件源码：

```
claude-config/
├── skills/                          # 已有：SKILL.md 与文档
│   └── im/
│       └── conversation-list/       # 新增：本 block 的 SKILL.md
│           └── SKILL.md             # 强指令型 + 用法 snippet + 反向选型
├── blocks/                          # 新增：业务模式组件源码
│   └── im-conversation-list/
│       ├── frontend/                # React 组件 + 测试 + Storybook
│       ├── backend/                 # FastAPI 服务 + 测试
│       ├── protocol/                # OpenAPI + WS schema + 共享类型
│       ├── seed/                    # 演示与压测数据生成
│       ├── examples/                # 端到端集成示例（next.js / vue 等）
│       ├── Makefile                 # make dev / test / bench
│       └── README.md
└── experiments/                     # 新增：变体对照存档（不进库）
    └── im-conversation-list-2026-05-09/
        ├── variant-a/
        ├── variant-b/
        └── results.md
```

### 9.2 命名约定
- block 名：`<domain>-<pattern-name>`，全小写连字符（如 `im-conversation-list`、
  `commerce-product-list`、`admin-resource-crud`）
- SKILL 名沿用现有规范（见 `skill-distill` 输出）
- 协议类型名加 `Block` 前缀避免和上游冲突（如 `BlockConversation`、`BlockMessage`）

### 9.3 后续 block 复用
本 block 建立的基础设施（数据生成脚本、Makefile 模板、Storybook 配置、
OpenAPI lint、双端类型生成）应**抽取成模板**，后续 block（订单详情、瀑布流、
通话面板等）从模板派生。这部分模板化工作在第 2 个 block 时再启动，不必在
第一个就过度抽象。

---

**版本**:
- v1.0 (2026-05-09) - 设计稿
- v1.1 (2026-05-09) - 升级双重定位：实验产物按生产级建设，作为业务组件库第一颗种子；
  原 mock 服务升级为生产级后端；新增质量基线与仓库布局章节
