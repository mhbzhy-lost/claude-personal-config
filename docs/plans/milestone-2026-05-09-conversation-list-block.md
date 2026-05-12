# Milestone：会话列表 Block + 抽象层级实验（2026-05-09）

## 1. 这段工作要回答的命题

> 怎样让 agent 自主完成大型软件需求？

经过对话推进，命题被拆为两条相互独立的轴：

1. **领域知识**：skills/ 提供"在该技术栈里怎么做"的指导，对抗预训练知识滞后
2. **预制件**：blocks/ 提供"该业务模式直接组装"的工件，对抗 agent 注意力被细节耗尽

这次的具体动作是验证第二轴：**对一个高频业务场景（微信风格会话列表）做端到端的 block 建设 + 用受控实验验证抽象层级对 agent 自写代码量的真实影响**。

## 2. 已落地的产出

### 2.1 `blocks/im-conversation-list/` —— 第一个生产级业务模式 block

| 层 | 路径 | 状态 | 关键数据 |
|---|---|---|---|
| protocol | `protocol/openapi.yaml` `asyncapi.yaml` `types.md` | v0.2 | spectral lint 0 errors |
| protocol（codegen） | `protocol/generated/openapi.ts` `zodios.ts` | v0.2 | TS 类型 + zod schemas + Zodios 类型化客户端 |
| backend | `backend/app/**` (FastAPI + SQLAlchemy + asyncpg) | v0.2 | 11 endpoints / 21 tests pass / **74% coverage** |
| seed | `backend/app/scripts/seed.py` | v0.1 | demo (~100 conv/~3k msg) + bench (~1k conv/~150k msg) |
| WS hub | `backend/app/ws/hub.py` | v0.1 | 内存 fan-out，多实例需换 Redis adapter |
| frontend (block) | `frontend/` | **未做** | 按实验结论待定 Variant C |

后端已被两次受控派发的 subagent 当作真实接口打通，证明**协议契约够明确、API 表面适合 agent 直接消费**。

### 2.2 `docs/plans/`（计划与方法学沉淀）

| 文档 | 内容 |
|---|---|
| `skill-abstraction-experiment-conversation-list.md` | 实验方案 + §7.1 第一轮（biased，作废）+ §7.2 第二轮（受控派发） |
| `skill-organization-grouping.md` | skill 分组策略推迟决策（等可量化失败案例触发） |
| `skill-retrieval-optimization.md` | 检索引擎优化方案（独立主题，未实施） |
| `milestone-2026-05-09-conversation-list-block.md` | 本文档 |

### 2.3 `experiments/im-conversation-list-2026-05-09-v2/`

两个 subagent 在受控环境（白名单 SKILL.md + 禁 mcp 检索 + 禁兄弟变体）下产出的对照样本：
- `variant-a/`：仅 antd 原子组件（13 份 SKILL.md + 3 份 IM skill）
- `variant-b/`：A 全部 + ProComponents（ant-pro-list / ant-pro-layout）

第一轮的 `experiments/im-conversation-list-2026-05-09/` 被判作废（主对话上下文污染），保留作工程参考但不作实验证据。

## 3. 三个关键发现

### 3.1 受控实验的派发方法学（首次跑通）

**不需要新写 harness**——直接用 `Agent` 工具派发 subagent，关键在 prompt 控制：
- **必须显式禁掉** `mcp__skill-catalog__*` 和 `/knowledge-retrieval`，否则等于让 subagent 看到全集 skill 索引
- **必须用文件路径白名单**列出允许读取的 SKILL.md，名单外的 `skills/**` 全禁
- **必须显式覆盖** CLAUDE.md "强制 /knowledge-retrieval"那条规则（项目 CLAUDE.md 优先级高于 prompt）
- **必须要求合规自审报告**：subagent 列出所有 Read / Bash / Skill 调用，主对话事后审计
- **串行派发**，中间 reset DB，避免数据互污

合规审计结果证明这套方法是有效的：两个 subagent 全程 0 次 mcp 检索、0 次禁路径越界、诚实报告了被 sandbox 拦截的边界尝试。

唯一缝隙：白名单未覆盖 `blocks/<name>/README.md` 和 `Makefile` 这种顶层文件（两个 subagent 都读了）。下次 prompt 应补禁。

### 3.2 AI Parkinson 定律

**给 agent 一个高层组件，它不会"提早收工"——它会用省下的注意力额度去装饰项目边角。**

冷启动派发的实验数据（按职责分桶）：

| 桶 | A（仅原子） | B（A+Pro） | Δ |
|---|---:|---:|---:|
| **list_render** | **632** | **279** | **−55.9%** |
| infra（types/http/ws/state/util） | 676 | 659 | −2.5% |
| app_layout | 238 | 515 | **+116.4%** |
| css | 192 | 260 | +35.4% |
| **TOTAL** | **1841** | **1810** | **−1.7%** |

ProList 在它覆盖的列表渲染域内确实砍掉一半代码（强成立 H1），但 agent 没把省下来的精力变成"更短总代码"——反手在 app_layout 桶里加了 DetailPane、IdentityGate、更复杂的 App.tsx 等**不在验收清单里**的特性。

**这反过来强化了预制件策略的价值**：
- agent 注意力是有限资源
- 预制件不是"让 agent 写更少代码"，而是"让 agent 把注意力分配到真正需要它的地方"
- LOC 不是合适的单一指标——total 会被 Parkinson 抹平；分桶才看得到真实价值

### 3.3 真正的天花板是 infra 桶（不是 list_render）

A 和 B 在 infra 桶（types / api / ws / format / state）上几乎一样多（676 vs 659），因为这层完全是**业务专属逻辑**，UI 组件库（不论 ProList 还是裸 List）都帮不上忙：

- types 手写（A 134 / B 145）—— **codegen 已就位但实验为公平禁用了**
- HTTP client（A 118 / B 104）—— 业务 block 应当 export
- WS reconnect + event router（A 95 / B 70）—— 业务 block 应当 export
- 状态合并 reducer（A 219 / B 235）—— IM 业务专属，必须由业务 block 提供
- 智能时间格式化（A 110 / B 105）—— util 类，可单独提取

Variant C（业务模式 block 的 frontend 层）的目标就是把这 660+ LoC 变成 import。

## 4. 未完事项

### 4.1 短期（下一轮实验）

- **Variant C**：实施 `blocks/im-conversation-list/frontend/` 的生产级实现 + 强指令型 SKILL.md
  - 直接 export `<ConversationList>` 组件 + `useConversations` hook
  - 配合 protocol/generated/ 让 agent 直接 import 类型
  - SKILL.md 写"凡 IM 列表场景禁止自行手写 list / item / WS 状态机"
- **派发 Variant C 的 prompt 强化**：
  - 验收清单严格封闭（禁追加未要求特性，避免 Parkinson 继续污染对比）
  - 白名单补禁 `blocks/<name>/README.md` `Makefile` 顶层文件
- **预期**：list_render + infra 合并降至 ≤ 200 LoC（vs A 的 1308）

### 4.2 中期（实验复用）

- **方法学固化**：把"subagent + 路径白名单 + 合规自审"做成可重复模板（不需要 harness 代码，用一份模板 prompt 就够），下个业务模式（订单详情 / 商品瀑布流 / 通话面板）直接套
- **量化指标二维化**：分桶 LOC + 验收完成率，不再用单一 LOC 总数
- **强封闭验收清单**：把"禁追加未要求特性"作为方法学固定项

### 4.3 长期（产品方向）

- 复制 block 模式到其他高频业务场景，构建 agent-native 业务组件库
- 协议层 codegen 流水线（已为 IM block 跑通）作为通用模板
- 后端层是否也做生产级预制（现在每个 block 都自带 FastAPI 服务，是否要抽出 platform 层）—— 待真实复用 ≥3 个 block 后再回头评估

## 5. 后端服务的当前状态（手册）

```bash
# 启动 postgres
docker run -d --name imcl-pg \
  -e POSTGRES_USER=imcl -e POSTGRES_PASSWORD=imcl -e POSTGRES_DB=imcl \
  -p 5544:5432 postgres:17-alpine
docker exec imcl-pg psql -U imcl -d imcl -c "CREATE DATABASE imcl_test OWNER imcl;"

# 起后端
cd /Users/mhbzhy/claude-config/blocks/im-conversation-list/backend
make install     # uv venv + 安装
make migrate     # alembic upgrade head
make seed-demo   # ~100 conv / ~3k msg
make dev         # uvicorn :8080

# 起前端实验产出（任一变体）
cd /Users/mhbzhy/claude-config/experiments/im-conversation-list-2026-05-09-v2/variant-a
echo "VITE_DEV_USER_ID=01KR5Y935AR1JJT0RJ31ABG5YD" > .env.local
pnpm install && pnpm dev    # http://localhost:5173

# 协议层 codegen
cd /Users/mhbzhy/claude-config/blocks/im-conversation-list/protocol
make install
make gen     # → generated/openapi.ts + zodios.ts
make lint    # spectral
```

种子里 demo 用户 ID 固定为 `01KR5Y935AR1JJT0RJ31ABG5YD`（用 `--primary-user-id` 锁定），后续实验复跑保证起点一致。

---

## 6. 第二个 block：commerce-product-list（2026-05-12）

按 milestone §4.3 长期方向，建第二个业务 block 测**模板可复用性**。刻意
选了与 IM 差异最大的场景，以暴露模板的边界：

| 维度 | im-conversation-list | commerce-product-list |
|---|---|---|
| 实时 | WebSocket + 7 事件 | 无 WS |
| 分页 | cursor | offset + limit |
| 布局 | 垂直列表 | 响应式 grid |
| Item action | 右键菜单（4 项） | 收藏按钮 + 数量选择器 |
| 鉴权语义 | 必登录 | 匿名可读、写需登录 |
| 表数 | 6 | 3 |
| Endpoints | 11 | 5 |

### 6.1 构建耗时对比

| 阶段 | IM block 首次构建 | Commerce block 构建 | 加速比 |
|---|---|---|---|
| protocol（含 codegen） | ~20 min | ~5 min | **4×** |
| backend（含测试） | ~6–8 h（多轮调试） | ~30 min | **~12–16×** |
| frontend block | ~4 h | ~25 min | **~10×** |
| **合计** | **~2 天** | **~1 h** | **~16×** |

后端测试 **16/16 首次即过**——IM 当初要修 pytest-asyncio loop 跨测试漏池、
TRUNCATE 关键字、FK ordering 等坑，第二次完全没复发。

### 6.2 自实现 LoC 对比

| 角色 | LoC |
|---|---|
| IM consumer（example/basic） | 38 |
| Commerce consumer（example/basic） | **44** |
| IM block frontend 内部 | 888 |
| Commerce block frontend 内部 | **708**（无 WS hook，少 ~180 LoC） |

Consumer 38 vs 44 只差 6 行——两套 block 给消费者的认知负荷基本对等，
强指令型 SKILL.md 的"一次 import 全搞定"承诺**被验证可移植**。

### 6.3 摩擦点（候选 `blocks/_shared/` 抽出清单）

**强候选**（基本机械 cp + s/imcl/cpl/g 改动的文件）：

- `app/__init__.py` / `app/config.py`（仅 env_prefix 差异）
- `app/ulid_utils.py`（完全相同）
- `app/errors.py`（完全相同）
- `app/db.py`（完全相同）
- `app/auth.py`（一处差异：IM 强制 user_id；commerce 允许 None——可参数化）
- `app/models/base.py`（完全相同）
- `app/models/user.py`（IM 多 `online_status` 字段——可参数化）
- `alembic.ini` / `alembic/env.py` / `alembic/script.py.mako`（完全相同）
- 测试 `conftest.py`（仅 TRUNCATE 表名列表差异）
- 前端 `client.ts`（仅 URL prefix + auth 类型名差异，约 80% 重合）
- 前端 `vite.config.ts` / `tsconfig.json` / `tsconfig.build.json`（完全相同）

**业务专属（不该抽出）**：
- `app/models/{conversation,message,product,user_product_state}.py`
- `app/services/*.py`
- `app/api/v1/*.py`（除 `me.py` 完全相同）
- 前端 component / hook 业务逻辑

**抽的不是代码而是脚手架**：
- 后端的 dep + auth 抽象（pluggable auth backend 模式）
- 前端的 ConfigProvider + auth pluggable 模式
- pagination envelope 模式（cursor / offset 两种）

### 6.4 结论

**block 模板成立**，可复用价值约 **16× 时间节省 + 一次过测试**。
下一个 block 启动前抽共享层：

- `blocks/_shared/backend/` —— config / db / auth / deps / errors /
  ulid_utils / alembic 模板 / conftest 模板
- `blocks/_shared/frontend/` —— vite/tsconfig 模板 + client / auth
  pluggable 接口 + Vite lib 配置
- `scripts/new-block.py` 脚手架生成器：参数化场景名 + env_prefix + 表清单

预计第三个 block（如订单详情）总耗时降至 ~20 min。

### 6.5 commerce 数据手册

```bash
docker run -d --name cpl-pg \
  -e POSTGRES_USER=cpl -e POSTGRES_PASSWORD=cpl -e POSTGRES_DB=cpl \
  -p 5545:5432 postgres:17-alpine
docker exec cpl-pg psql -U cpl -d cpl -c "CREATE DATABASE cpl_test OWNER cpl;"

cd blocks/commerce-product-list/backend
make install && make migrate
make seed-demo                  # 100 products
make dev                        # uvicorn :8081

cd ../frontend/examples/basic
pnpm install && pnpm dev        # :5176
```

固定 demo user_id：`01KR9D7VAY4FYDVK7C2DZH8KM0`

---

## 7. 第三个 block：order-detail（2026-05-12，scaffold 验证）

抽完 `blocks/_shared/` + `scripts/new-block.py` 后用它真起一个新 block，
测脚手架的实际加速效果。刻意选最不一样的场景：**单实体 + 嵌套子资源
+ 状态机驱动 UX + 必登录写**——和前两个 block 形态都不同。

### 7.1 加速数据

| 阶段 | IM 首次 | Commerce（手工 cp） | Order（脚手架） |
|---|---:|---:|---:|
| 工程骨架（pyproject / Makefile / docker / alembic / config / db / auth) | ~30 min | ~10 min | **0.08 s** |
| protocol（含 codegen） | ~20 min | ~5 min | ~10 min |
| backend domain（含测试） | ~6–8 h | ~30 min | ~30 min |
| frontend block | ~4 h | ~25 min | ~35 min |
| 合计 | ~2 天 | ~1 h | **~1.5 h**（含 ~30 min retry / 调试损耗） |

纯进度 ~60 min 与 commerce 持平。脚手架没让总时间变更短，因为：
- Commerce 当时手工 cp 也只占首次 ~10 min（10% 比重）
- 真正不可压缩的是业务建模（model / schema / service / route / 组件
  + SKILL.md），约占 80%

但脚手架带来其他价值：
- **零认知负担**：不需要回忆"还要复制 alembic.ini / 还要改 env_prefix /
  conftest 的 TRUNCATE 要扩 / Makefile 端口要换"——脚本一次替全
- **降低门槛**：新人/agent 起 block 不需要先把另一个 block 扫一遍
- **方差降低**：手工 cp 容易漏改一两处（docker volume 还叫 imcl-pg、
  port 还是 5544），脚本统一替换不会漏

### 7.2 业务模式变异空间被验证覆盖

| 维度 | IM | Commerce | Order |
|---|---|---|---|
| 形态 | 多对话列表 | 商品 grid | 单实体 + 嵌套 |
| 实时 | WebSocket + 7 事件 | 无 | 无 |
| 分页 | cursor | offset | offset |
| 鉴权 | 必登录 | 匿名可读 / 写需登录 | 必登录全部 |
| Item action | 右键菜单 | 收藏 + 数量选择 | 状态机驱动按钮 |
| 子资源 | 无 | 无 | 嵌套 items + status events |
| 状态机 | 无 | 无 | pending→paid→shipped→delivered + 分支 |

**共用同一份 `_shared/` 模板**，意味着模板对业务模式变异空间覆盖足够。

### 7.3 Consumer LoC 对比

| Block | Consumer LoC |
|---|---:|
| IM | 38 |
| Commerce | 44 |
| Order | **31** |

差异 ±15 行内，证明 `BlockConfig + ConfigProvider/AntdApp + Layout` 模式
对消费者认知负荷一致。

### 7.4 后续优化候选（不优先做）

- `scripts/new-block.py` 增量改进：端口冲突检测、`--with-websocket`
  flag scaffold WS 层、`--auth-required` flag
- `_shared` SKILL.md 占位符更结构化（固定的"何时使用 / 何时不使用 /
  内部已处理 / 严格禁止"四段框架）
- scaffold 时根据"主实体名"参数自动生成基础 happy path 测试

但 v0.1 不做——三个 block 验证脚手架成立已经够，过早抽象违反 Parkinson
教训。

### 7.5 order-detail 数据手册

```bash
docker run -d --name od-pg \
  -e POSTGRES_USER=od -e POSTGRES_PASSWORD=od -e POSTGRES_DB=od \
  -p 5546:5432 postgres:17-alpine
docker exec od-pg psql -U od -d od -c "CREATE DATABASE od_test OWNER od;"

cd blocks/order-detail/backend
make install && make migrate
make seed-demo                  # 20 orders, mixed statuses
make dev                        # uvicorn :8082

cd ../frontend/examples/basic
pnpm install && pnpm dev        # :5177
```

固定 demo user_id：`01KRD7H5SBR3PR8R4DTH7XZG3W`
