---
name: new-block
description: 创建一个新的"业务模式 block"——端到端预制件（protocol + backend + frontend + 强指令型 SKILL.md），含全栈脚手架。用于：用户提"我要做一个新的业务场景（IM、电商、订单、通知等）的可复用 block / agent-native 组件"时。
---

# new-block —— 业务模式 block 的脚手架与规范

本 skill 把"造一个新 block"封装成一个 ~1 分钟的命令。脚手架替换 10 个
占位符，输出三层完整工程：protocol（OpenAPI + 双流水线 codegen）+ backend
（FastAPI + alembic + 2 个开箱测试）+ frontend（Vite lib + 通用 BlockClient
+ SKILL.md 模板）。

## 何时调用

- 用户提"做一个 X 业务的 block"，X 是新的业务模式（不在 `blocks/` 已有列表里）
- 用户正在规划"将常见业务模式做成预制件库"
- 你（agent）发现某个业务模式被反复实现且具备 atomic unit 特征（前端 + 协议 +
  后端是配对资产），值得 block 化

## 何时**不**调用

- 仅扩展已有 block（直接改对应 `blocks/<slug>/` 即可，不需要新 block）
- 写一次性应用代码（不打算复用）
- 业务模式与已有 block 高度重叠（先评估能否参数化）

## 用法

```bash
./.claude/skills/new-block/scripts/new-block.py \
  --slug <kebab-case> \
  --env-prefix <UPPERCASE> \
  --pkg-ns <lowercase-npm-ns> \
  --backend-port <port> \
  --postgres-port <port> \
  --title-en "<English Title>" \
  --title-cn "<中文标题>"
```

完成后 `blocks/<slug>/` 含约 60 个文件，按新三层布局（component/ + dev/ +
examples/ + block.json + README.md），立即可跑：

```bash
# 启动 postgres（用脚本里输出的端口）
docker run -d --name <env-prefix-lower>-pg \
  -e POSTGRES_USER=<env-prefix-lower> \
  -e POSTGRES_PASSWORD=<env-prefix-lower> \
  -e POSTGRES_DB=<env-prefix-lower> \
  -p <postgres-port>:5432 postgres:17-alpine

cd blocks/<slug>/dev/backend
make install && make migrate
make test                   # 2 个 baseline 测试应一次过

cd ../protocol && make install && make gen && make lint
cd ../frontend && pnpm install && pnpm build  # 可选；agent 直接消费源码不需要
```

## 占位符与设计约束

| Key | 例子 | 约束 |
|---|---|---|
| `--slug` | `order-detail` | kebab-case，作 block 目录名 |
| `--env-prefix` | `OD` | UPPERCASE 1-4 字符，作 env var 前缀（`OD_DATABASE_URL`） |
| `--pkg-ns` | `od` | 小写，作 npm scope（`@od/order-detail`），默认 = env-prefix lowercase |
| `--backend-port` | `8082` | 不与已有 block 冲突（IM 8080 / commerce 8081 / order 8082） |
| `--postgres-port` | `5546` | 同上（IM 5544 / commerce 5545 / order 5546） |
| `--title-en` | `Order Detail` | block 英文标题 |
| `--title-cn` | `订单详情` | 默认 = title-en |

执行 `new-block.py --help` 看完整 flag。**端口必须递增**避免本地冲突。

## 脚手架完成后开发者要做的事

脚手架只搭骨架；业务建模必须人工：

1. **protocol**：在 `protocol/openapi.yaml` 定义业务实体 + 端点；运行 `make gen` 生成类型
2. **backend models**：在 `app/models/` 定义业务实体（学 `im-conversation-list` 或 `commerce-product-list` 的模式）
3. **alembic migration**：`alembic revision --autogenerate -m 'add domain'`
4. **schemas**：在 `app/schemas/` 写 pydantic 镜像
5. **services**：在 `app/services/` 写业务逻辑（注意：状态机校验、per-user 状态等业务专属规则放这里）
6. **api routes**：在 `app/api/v1/` 写路由，include 到 `app/api/v1/__init__.py`
7. **seed**：扩展 `app/scripts/seed.py` 加业务数据生成
8. **tests/conftest.py**：把新表名加到 `TRUNCATE_TABLES`
9. **business tests**：在 `tests/` 写关键路径测试（参考 `im` 或 `commerce` 的覆盖深度）
10. **frontend types**：在 `src/types.ts` 添加业务实体类型
11. **frontend client**：扩展 `src/api/client.ts` 的 `BlockClient` 加业务方法
12. **frontend hook**：在 `src/hooks/` 写 `use<Entity>` 主 hook
13. **frontend components**：在 `src/components/` 写组件
14. **frontend index**：在 `src/index.ts` export 公共 API
15. **frontend SKILL.md**：替换占位符 TODO，写**强指令型**说明
16. **block-level README**：替换占位符，写**消费者向导**
17. **a11y 静态检查**：开发期持续跑 `cd dev/frontend && pnpm lint:a11y`，
    提交前 0 warning + 0 error（`eslint-plugin-jsx-a11y` 已在脚手架默认开启）
18. **examples/basic + a11y 运行时检查**：建好 demo 后参照 `wcag-check`
    skill 在 `examples/basic/` 加 `a11y.spec.ts`（`@axe-core/playwright`
    扫 WCAG 2.1 AA，0 critical + 0 serious 为发布门槛）
19. **blocks-demo 集成验证（强制,见下方 §集成验证）**：把 block 接入
    `~/blocks-demo` 长期 demo,补 demo page + 路由 + 回归截图,在该仓
    单独 commit。这是 block 真正"发布"的最后一公里——只有它能验证
    block 在真实组合场景里能渲染、能交互、与其它 block 不打架。

## 重要规范（违反会导致 block 不可复用）

### Protocol 层
- ✅ 所有 ID 用 ULID（26 字符）
- ✅ 时间戳 ISO 8601 UTC `Z`
- ✅ 错误用 RFC 7807 Problem Details
- ✅ 分页用 cursor（高 churn）或 offset（稳定排序），不混用
- ❌ 不在 OpenAPI 里嵌入业务专属 auth 流程（auth 由 host app 提供）

### Backend 层
- ✅ pluggable auth backend（dev/JWT），不绑死任何认证方案
- ✅ 服务端独裁排序，client 不重排
- ✅ per-user 状态分表（避免群聊语义里"我置顶"影响他人）
- ✅ soft-delete-per-user（如果是用户视角资源）
- ❌ 不在业务 service 层调外部第三方服务（解耦留给 host app）

### Frontend 层
- ✅ Vite lib 模式（不发 npm 也要可 import）
- ✅ peerDependencies `react ^18` + `antd ^5`，CSS auto-inject
- ✅ `BlockConfig` 含 `apiBaseUrl` + `auth?` (pluggable)
- ✅ 受控状态用 `selectedId` + `onSelect`，不内部管理
- ✅ **a11y WCAG 2.1 AA**（block 维护者职责，门槛见 §a11y 测试要求）
- ❌ 不在 block 内部硬编码主题色（业务方应可覆盖）
- ❌ 不依赖 react-router / next.js 等具体路由方案

### a11y 测试要求（block 维护者职责）

block 的 frontend 是消费者直接渲染的 UI，**a11y 缺陷会跨所有 host
项目放大**——比 host 端单点修复成本高得多，故由 block 维护者**先**保证。

两层检查，门槛同 `wcag-check` skill：

| 层 | 工具 | 时机 | 门槛 |
|---|---|---|---|
| 静态 | `eslint-plugin-jsx-a11y`（recommended） | 写代码 / 提交前 | 0 warning + 0 error |
| 运行时 | `@axe-core/playwright`（WCAG 2.1 AA 全 tag） | `examples/basic/` 建好后；发布前 | 0 critical + 0 serious |

落点：
- 静态层已在脚手架 `dev/frontend/` 内置（`pnpm lint:a11y` 跑
  `eslint-plugin-jsx-a11y` recommended，扫 `component/frontend/src/**`）
- 运行时层在 `examples/basic/` 内挂 `a11y.spec.ts`，对 demo 路由跑
  axe；具体接入命令见 `wcag-check` skill 的"运行时层"段

豁免必须记在 `<block>/a11y-exceptions.md`（规则 id / 路由 / 原因 /
回填日期）；`critical` 级别不许豁免。

### 集成验证(blocks-demo)——前端 block 必跑

`~/blocks-demo` 是长期维护的"前端 block 联合验证 demo"仓(独立 git
repo,与 `~/claude-config` 解耦)。**任何 frontend / miniprogram block
的新建或修改,完成本仓 commit 后必须立即在 blocks-demo 验证再 commit**。

**为什么必须做**:typecheck + lint:a11y 是机械门槛(静态可验证);**真实
渲染、与其它 block 同屏交互、CSS 互不打架**只有跑起来才知道。block
代码 commit 但 demo 没验证 = block 不算真正完成。

#### 强制链路(5 步)

```bash
# 1. 同步 SDK(从上游 block 仓 rsync 到 demo 的 sdk/<slug>/)
cd ~/blocks-demo && ./update-sdk.sh <slug>

# 2. 加 / 改 demo page
#    app/src/pages/<Block>Page.tsx —— 消费 block,准备 mock 数据
#    app/src/App.tsx ROUTES        —— 接路由
#    app/src/data/mock.ts          —— 必要的 mock(避免连后端)

# 3. 安装新增 file: 链接 + 启 dev
cd ~/blocks-demo/app && pnpm install && pnpm dev

# 4. Playwright(或人工)切到对应路由截图,落 screenshots/<NN>-<slug>.png
#    硬约束:0 fatal console error(antd 5.x deprecation warn 不算)

# 5. blocks-demo commit + push(独立 git history)
cd ~/blocks-demo && git add -A && git commit -m "feat(demo): 接入 <slug>"
```

#### 何时**不**适用

- 后端 only 改动(API/models/seed 无 UI)→ 跳过 demo 步骤
- 协议层(openapi.yaml)改动 → 跳过(除非影响 frontend 类型)
- 文档/README only → 跳过

#### blocks-demo 链路自查清单

- [ ] `sdk/<slug>/` 与上游 `~/claude-config/blocks/<slug>/component/` 已同步
- [ ] `app/src/pages/<Block>Page.tsx` 存在并被路由引用
- [ ] `app/package.json` 含对应 `file:../sdk/<slug>/frontend` 链接(或 `miniprogram` 变体)
- [ ] `pnpm dev` 可启动,目标路由可点开并渲染正常
- [ ] 浏览器 Console 0 fatal error
- [ ] `screenshots/` 含本 block 至少 1 张回归基线
- [ ] blocks-demo 已独立 commit(不要并到 block 本体 commit)

### SKILL.md（强指令型）
**这是 agent 消费 block 时最重要的入口**，必须包含：

- "何时使用"段：能让 agent 自检"我的需求是否落在这个列表里"的硬条件
- "何时**不**使用"段：明确反向选型，避免误用
- "最小用法"段：5-10 行代码片段
- "完整 API"段：Props / Config 字段表
- "内部已经处理好的事项"段：减少 agent 自己重造的冲动
- "严格禁止的反模式"段：每条以 ❌ 开头，列出具体的不该做法

参考已就位的两个范例：
- `blocks/im-conversation-list/frontend/SKILL.md`（含 WebSocket + cursor 分页）
- `blocks/commerce-product-list/frontend/SKILL.md`（无 WS + offset 分页 + 匿名可读）

### Block-level README
**消费者入口**，不是开发者笔记。必须包含：

- 一句话说明业务模式
- "消费者要 import 什么 / 部署什么"清单（前端 pkg 路径、后端启动命令、协议引用方式）
- 最小代码示例
- 反向选型（什么场景该用别的 block）

不要写成"项目结构介绍"——那是 dev README 的事。

## 已有 block 索引（参考实现）

### Business-pattern blocks（有后端）

| Block | 形态 | 特征 |
|---|---|---|
| `blocks/im-conversation-list/` | 多对话列表 | WebSocket + cursor 分页 + 右键菜单 |
| `blocks/commerce-product-list/` | 商品 grid | 无 WS + offset 分页 + 匿名可读 + 收藏/加购 |
| `blocks/order-detail/` | 单实体 + 嵌套 | 状态机驱动 + Modal 操作 + 必登录 |
| `blocks/comment-thread/` | 嵌入式 widget | 树状 reply / 软指针 host / 混合鉴权 / 无 list+detail 双视图 |
| `blocks/im-chat-detail/` | 双人对话页 | WS 实时 + 气泡左右分发 + 已读 ✓✓ + cursor 分页 + 撤回 |

### UI chrome blocks（无后端，用 `--no-backend` 起）

| Block | 形态 |
|---|---|
| `blocks/top-navbar/` | 顶部导航条（返回/标题/右槽） |
| `blocks/mobile-tabbar/` | 底部 tabbar（keep-alive 切换 2-5 个 tab） |

新 block 建议在差异维度找新切片（如通知中心 / 通话面板 / 媒体画廊）。
重复造同形态的 block 不会带来额外验证价值。

## 端口/前缀分配台账

为避免本地多 block 并跑冲突，记录已用端口：

| Block | env-prefix | backend port | postgres port |
|---|---|---:|---:|
| im-conversation-list | IMCL | 8080 | 5544 |
| commerce-product-list | CPL | 8081 | 5545 |
| order-detail | OD | 8082 | 5546 |
| comment-thread | CT | 8083 | 5547 |
| im-chat-detail | CHAT | 8084 | 5548 |
| **下一个** | **?** | **8085** | **5549** |
