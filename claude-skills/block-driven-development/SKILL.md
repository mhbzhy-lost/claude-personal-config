---
name: block-driven-development
description: 从 0 到 1 启新项目 或 给现有项目加新业务需求时使用;调 block-catalog MCP 检索 + 整组件拷贝到 workspace,含需求→检索→定制→单测→e2e→一键部署完整流程。bugfix / 重构 / 调参不调本 skill。
---

# What

block 作为 SDK 整目录拷贝到目标 workspace,理解 README 即可用;遇到模板
不满足在 workspace 内分叉定制,**不回写上游 block 仓**。

本 skill **与具体语言 / 框架 / 包管理器无关**——所有"跑什么命令、装什么
依赖、跑什么测试"都以**每个 block 的 README 与 `block.json` 元信息为准**,
agent 不应硬编码"用 pytest""用 pnpm""用 docker-compose"等假设。

# Mode Contract（与 Superpowers 流程互斥）

用户明确触发本 skill 时,以本 skill 8 阶段流程为准,**不再触发** Superpowers
工作流(brainstorming / writing-plans / subagent-driven-development)。

## 进入条件（满足任一即触发）

- **从 0 到 1**:用户提"做一个 X 应用 / 项目 / 系统"且 X 含可识别业务模式
  (IM / 列表 / 详情 / 评论 / 通知 / 订单 / 商品…)
- **新增需求**:已有项目要新加一块业务且形态与已有 block 重合
- 用户明确要"用 block 拼" / "复用 block" / "从 block 起步"
- agent 识别出 ≥1 个用户需求与已有 block 形态高度重合

## 不触发的场景

- **Bugfix / 回归 / 故障定位**——走 Superpowers 流程
- **重构 / 性能优化 / 调参**——不改业务面,不引入新形态
- **仅扩展某个 block 内部**——直接改 `blocks/<slug>/` 即可,与本 skill 方向相反
- **需求与全部 block 都不沾**——按常规流程开发,不强行套
- **一次性脚本 / demo / 玩具**——性价比低

## 边界模糊

任务介于两者之间或无法判断走哪条流程时,用 `AskUserQuestion` 列出
"走 block-driven 独立模式 / 走 Superpowers 流程"两个选项,附简短判据,
由用户拍板,**不擅自代选**。

## 自治契约（进入后）

进入本 skill 后,agent 端到端跑完整条流水线,**中途不主动追问需求**:

- 必须澄清的事项记入 `<workspace>/open-questions.md` 并选最合理默认推进
- 主 agent 仅在 **Phase 7 e2e 全绿 + Phase 8 一键脚本就绪** 后向用户汇报终态
- 终态汇报时连同 `open-questions.md` 的所有 deferred 决策一并呈交

# How

下面 8 步**按序执行**,跳步会在后置阶段反咬。每一步都给出 *agent 必须输出的产物*,完成才能进入下一步。

## Phase 1: 需求拆解 → 用户故事清单

`AskUserQuestion` 或在对话里**穷尽用户故事**——每条形如:
> "作为 <角色>,我能 <动作>,从而 <目的/可观察结果>。"

把它们写到 `<workspace>/user-stories.md`,**这是 Phase 7 e2e 测试的 SoT**——后续每条都要对得上一个 e2e 用例。

产物:
- ✅ `<workspace>/user-stories.md` 列出 ≥3 条原子用户故事
- ✅ 推导出"涉及的业务模式"清单(e.g. "双人聊天" / "商品列表" / "下单")

## Phase 2: block 检索(block-catalog MCP)

对每个业务模式各调一次:
```
mcp__block-catalog__search_blocks(intent="<自然语言描述>", top_k=5)
```
再视情况:
- `list_blocks(kind="ui-chrome")` 找壳子(navbar / tabbar 等无业务态壳)
- `get_block(slug)` 拿完整 `block.json`(关键字段:**`tech_stack`、端口、env 前缀、`related_blocks`、`anti_use_cases`**)

判定:
- 完全匹配 → 进 Phase 4 拷贝
- 部分匹配(70%+ 形态相似)→ 进 Phase 4 拷贝 + Phase 5 定制
- 完全不匹配 → 不强行套用,这部分用普通开发;或者评估是否值得通过 `new-block` 沉淀

产物:
- ✅ block 选型表:`业务模式 → block slug → tech_stack → 匹配度 → 是否需定制`
- ✅ 端口/前缀冲突预演:每个 block 的对外端口(HTTP / 数据库 / 其它)都填进 `<workspace>/ports.md`,**冲突立即换端口**(改 env)

## Phase 3: 知识检索(knowledge-retrieval)

block 给的是**业务模式**;具体技术域(host 项目的框架、测试工具、部署工具)走 `knowledge-retrieval` skill 取。判断维度:
- block 的 `tech_stack` 与 host 项目栈是否一致——若一致直接消费,若不一致需要桥接 / 替代
- 测试工具(无论该语言下的单测 / 集成测 / e2e)的最新接入方式
- 部署 / 容器编排 / 进程管理工具

**不要重复 block 已经盖好的领域**(协议、状态机、per-user 状态)——那些 block 内部已经定型。

产物:
- ✅ 对每个 host 侧技术域至少调一次 `mcp__skill-catalog__resolve`,并记录命中的 skill 名

## Phase 4: 整组件拷贝到 workspace

```
mcp__block-catalog__copy_block_to(slug="<x>", dest_path="<workspace>/sdk/<x>")
```

典型落地结构(具体子目录由 block 决定——可能含 frontend / backend / protocol / 任意子集):
```
<workspace>/
├── sdk/                       ← block 拷过来,逐字保留
│   └── <slug>/<block 自定义子目录>
├── app/                       ← host 项目(你写的胶水)
│   └── <host 自身代码结构>
├── ops/                       ← Phase 8 一键脚本
└── user-stories.md
```

关键纪律:
- ❌ **不修改 `sdk/<slug>/` 下任何文件**(除 Phase 5 显式定制);保持可重新 `copy_block_to --overwrite` 升级的能力
- ✅ host 通过该语言生态的**本地依赖机制**消费 SDK(具体语法读 block README,**不臆测**:可能是文件路径依赖、本地包链接、源码路径 include、子模块等)
- ✅ 拷贝完立刻读 `sdk/<slug>/README.md` 与 block 暴露的**入口文件**(由 README 指出),把公共 API 写进自己的工作笔记;**不读组件实现**

## Phase 5: 定制(发现模板不满足)

当 block 模板不能直接用,**只能在 host 侧**做以下三类定制——按侵入度递增:

### 5.1 通过 Config / Props 配置(零侵入)
绝大多数差异(API base、auth、主题、locale、分页大小…)都该走 block 暴露的配置接口(读 `block.json` 与 README 找配置 schema);**先查 SKILL.md / README 的配置表**,不要直接改源码。

### 5.2 在 host 包一层适配器(低侵入)
样式覆盖、行为补丁:在 `app/<host 约定路径>/adapters/<slug>Adapter.<ext>` 包一层,**SDK 仍逐字保留**。
- 思想:host 模块 import block 公共 API,导出一个加了 host 侧 wiring 的新模块
- 实现细节随 block 的语言/框架而定,例如 UI 组件包一层渲染 wrapper、服务端中间件包一层鉴权代理

### 5.3 fork 到 host(高侵入,**记账**)
仅当 5.1 / 5.2 都不行时:把 `sdk/<slug>/<file>` 复制到 `app/<host 约定路径>/forked/<slug>/<file>`,改完用 host 路径 import。**必须**:
- 在 `<workspace>/FORKS.md` 记一条:`<slug>/<path> — 改了什么 — 为什么不能走 Adapter — block 端是否值得回灌`
- 后续把这条作为给 block 维护者的反馈

**反模式**: 直接编辑 `sdk/<slug>/` 内的文件——这破坏了"sdk 是只读 SDK"的契约,下次 `copy_block_to --overwrite` 升级时改动全没。

## Phase 6: 单测覆盖率门槛

block 自带的单测(若有,见 block README)与 host 写的胶水代码分别度量:

| 层 | 工具 | 覆盖率要求 |
|---|---|---|
| SDK 自带测(逐字拷的) | block 自己声明的测试入口 | 拷贝后立刻跑一遍,**100% 通过**才往下走;失败 = block 端 bug 优先报上来 |
| host 业务胶水(任意语言) | host 栈对应的单测框架 | 行覆盖 ≥80%,所有 service / 业务函数 ≥1 用例 |
| host UI / 适配层(若有) | host 栈对应的组件测 / 单测 | 行覆盖 ≥70%,所有 adapter 与路由 / 编排逻辑 ≥1 用例 |

跑测命令一律读 block README 与 host 项目自身约定,**不臆测**。

**a11y 静态检查(host UI 必跑)**:本阶段同步跑 WCAG 静态层(见
`wcag-check` skill 的"静态层"段),0 warning + 0 error 才能进入 Phase 7。

产物:
- ✅ `<workspace>/coverage-report.md` 记录每个目标的实际覆盖率与缺测函数列表
- ✅ a11y lint 全绿(无 host UI 的不适用)

## Phase 7: e2e 测试穷尽用户故事

**user-stories.md 的每一条都对应至少一个 e2e 用例**。e2e 工具按 host 形态选(浏览器流 / API 流 / CLI 流…),具体工具走 Phase 3 的 `knowledge-retrieval` 检索。

要点:
- **打真后端,绝不 mock**——block 已经给了真服务端,e2e 用 mock 失去验证 block-host 契约的意义
- 断言:**可观察的用户结果**(看到某文本 / 列表新增一行 / 跳转到 X 页 / API 返回特定状态码),不是内部 state
- 每条用例对应 `user-stories.md` 的一条,**故事行号 / id 写进测试 docstring**
- 失败的用例**先修代码**,不允许 `xfail` / `skip` 绕过

**a11y 运行时检查(host UI 必跑)**:e2e 通过后追加一组 WCAG 扫描
(见 `wcag-check` skill 的"运行时层"段)。专用 `a11y.spec.ts` 覆盖
全部关键路由,0 critical / 0 serious 违规为拦截级。host 是纯后端 /
CLI(无渲染面)时不适用。

产物:
- ✅ `<workspace>/e2e/` 下每条 user-story 一个 spec 文件
- ✅ 全绿 + 一份 `e2e-report.md` 列出"story → spec → status"
- ✅ a11y 扫描 0 critical / 0 serious(host 有 UI 时)
- ✅ 若 e2e 工具产物含可视证据(截图 / 录制 / trace),归档到 `<workspace>/evidence/`

## Phase 8: 一键部署本地脚本

最终交付物里必须有一个 host-agnostic 的入口,让用户**一条命令**就能跑起来。形式按 host 栈选:`up.sh` / `Makefile` / `docker-compose.yml` / 任务编排器(tilt / overmind…)/ 单一 entry-point 脚本均可。

最小骨架(伪流程,具体命令查每个 block README):
```
1. 启依赖服务(各 block 声明的数据库 / 队列 / 对象存储)
2. 对每个 block 执行其 README 列出的:
   - 装依赖
   - 跑迁移 / 初始化
   - seed 演示数据(用 host 注入的统一标识——见 Constraints #2)
   - 启服务进程到 ports.md 锁定的端口
3. 启 host 应用
```

要求:
- ✅ **幂等**:跑两次第二次必须不爆(已存在的服务 / 已装的依赖跳过,不重建)
- ✅ **背景进程留 PID / 日志路径**,提供配套的"一键停"
- ✅ 在 README 写"运行前置"(需要的工具及最低版本——由 block.json 与 host 栈共同决定)、"启动一条命令"、"清理一条命令"

产物:
- ✅ `<workspace>/up.<ext>` + `<workspace>/down.<ext>`(或同等编排器配置)
- ✅ `<workspace>/README.md` 写明启动 / 验证 / 清理三条命令

# Constraints

强约束,违反任意一条视为未完成:

1. **SDK 只读**:`sdk/<slug>/` 不改一行(除 Phase 5.3 + `FORKS.md` 记账);
   将 block 当样例局部抄录、裁剪拷贝视同违反本约束
2. **跨 block 共享身份/会话需 host 统一注入**:多数业务 block 会要求
   "当前用户/会话/租户"等上下文。host 必须在所有 block 的 seed / 鉴权层
   注入**同一份**标识。不同 block 的领域实体表 ID 不通用,跨 block 跳转
   前必须通过 host 同步或一个上游目录 block 拉平,demo 阶段如有 hardcode
   必须在 `user-stories.md` 标注 demo-only
3. **端口前置规划**:启任何服务前在 `ports.md` 锁端口,**不允许跑起来再改**
4. **block 默认配置不可信**:CORS 白名单、绑定 host、调试开关等默认值多按
   "开发者本机最简场景"设计,host 接入时**显式覆盖**(env / config 文件),
   不依赖默认
5. **user-stories.md 是 SoT**:e2e 缺哪条等于产品没交付,不允许"先发后补"
6. **覆盖率不达标 = 未完成**:Phase 6 的数字硬约束,不达标不能交付
7. **先读 README / `block.json` 再动手**:`tech_stack`、入口文件、配置 schema、
   `anti_use_cases` 必须先识别;跳过这步直接编码视为违反契约
8. **不臆测栈与命令**:语言、测试工具、包管理器、依赖管理机制一律以
   `block.json.tech_stack` + 该 block README 为准
9. **Phase 5.3 fork 必须记账**:每条 fork 写入 `<workspace>/FORKS.md`
   (slug / path / 改了什么 / 为什么不能走 Adapter / block 端是否值得回灌)
10. **e2e 必须打真后端**:`block` 已经给了真服务端,e2e 用 mock 失去验证
    block-host 契约的意义
11. **Phase 8 一键脚本是强制收口**:`up.<ext>` + `down.<ext>` + README 的
    "启动 / 验证 / 清理" 三条命令缺一不可,agent 自己跑通 ≠ 用户能跑通

# Reference

- **block-catalog MCP 工具**:`mcp__block-catalog__{list,search,get,copy_to,reindex}_block(s)`
- **block 索引**:实时通过 `list_blocks()` 查询,不要依赖任何静态列表(随仓内 block 增删而变)
- **配套 skill**:[[knowledge-retrieval]](技术域知识)、[[wcag-check]](Phase 6/7 a11y 检查)、[[git-commit]](提交规范)
- **新 block 沉淀**:用户场景反复出现且不在已有 block 库里时,走 `new-block` skill 把它沉淀
