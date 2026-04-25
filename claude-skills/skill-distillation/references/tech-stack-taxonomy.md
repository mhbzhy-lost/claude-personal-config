# Tech Stack Taxonomy

给 SKILL.md 打 `tech_stack` 标签时的**规范名闭集**。与 `capability`（能做什么）、`language`（用什么语言）正交——描述"用什么技术栈/框架/平台"。

## 使用规范

- `tech_stack` 字段值**必须**来自本文件枚举；新出现的技术栈先在本文件新增条目再打标
- 单个 skill 通常标 1–3 个 tech_stack；跨栈综合 skill 可到 5 个
- 相关组件：`skill-builder` agent（蒸馏产出 frontmatter）、`skill-marker` agent（打标校验）、`mcp__skill-catalog__resolve`（classifier 按本闭集做意图分类）

## 合并原则

| 情形 | 处置 |
|---|---|
| 同一产品的不同别名 | 合并为 canonical（`wechat-open-platform` / `wechat-official-account` / `wechat-cloud` → `wechat`） |
| 框架的插件 / 扩展 / 子项目 | 归入骨干（`starlette` / `slowapi` / `fastapi-cache2` → `fastapi`；`django-storages` → `django`） |
| 厂商品牌更名 | 用新名（`azure-ad` → `microsoft-entra`） |
| 同源工具链 | 合并（`gitlab-ci` / `gitlab-runner` → `gitlab`；`docker-scout` / `buildkit` → `docker`） |
| 同 org 的语言绑定 | 合并（`python-socketio` → `socketio`；`confluent` → `kafka`） |
| 不同厂商竞品 | **保留**（`kingfisher` vs `sdwebimage`；`fluxcd` vs `argocd`；OAuth provider 各家独立） |
| 不同代际的独立技术 | **保留**（`coredata` vs `swiftdata`） |

命名约定：全小写，短横线分隔；版本号仅在有强代际差异时带（如 `unreal5` / `godot4`）；不出现复合标签（如 `typescript-react`——分别用 `typescript` + `react`）。

---

## 前端通用（frontend general）

- **frontend**：前端综合伞标签，面向与具体框架无关的前端能力综述。示例：frontend-basics、前端架构类 skill
- **web**：通用 Web 标准 / 浏览器平台能力（非框架）。示例：html5-api、browser-storage
- **html5-video**：HTML5 视频 / 多媒体播放栈。示例：video-player

## 前端框架与组件库（frontend framework & UI kit）

- **react**：React 核心生态。合并别名：`reactjs`、`react.js`。示例：react-hooks、react-router
- **nextjs**：Next.js。合并别名：`next`、`next.js`。示例：nextjs-routing、nextjs-data-fetching
- **antd**：Ant Design 组件库。合并别名：`ant-design`、`ant-design-vue`（若同仓）。示例：ant-form、ant-upload、ant-table
- **tailwindcss**：Tailwind CSS 工具类。示例：tailwind-config、tailwind-dark-mode
- **shadcn-ui**：shadcn/ui 组件集合。示例：shadcn-ui
- **daisyui**：daisyUI on Tailwind。示例：daisyui
- **headlessui**：Headless UI。示例：headlessui

## 后端框架（backend framework）

- **backend**：后端综合伞标签，无特定框架归属的通用后端主题。示例：backend-architecture
- **fastapi**：FastAPI。合并别名：`starlette`（底层框架）、`slowapi`（限流扩展）、`fastapi-cache2`（缓存扩展）、`fastapi-users`。示例：fastapi-core、fastapi-deps
- **django**：Django。合并别名：`django-storages`、`django-rest-framework`（DRF 扩展）、`django-channels`（若同仓）。示例：django-orm、django-views
- **sqlalchemy**：SQLAlchemy ORM / Core。示例：sqlalchemy-session、sqlalchemy-query
- **sqlmodel**：SQLModel（FastAPI 作者的 SA 上层封装）。示例：sqlmodel
- **prisma**：Prisma ORM（TypeScript）。示例：prisma
- **celery**：Celery 分布式任务。示例：celery-tasks、celery-beat

## 移动端平台（mobile platform）

- **mobile-native**：跨端原生综合伞标签（含 iOS/Android/鸿蒙多端同主题 skill）。示例：mobile-permissions、mobile-push
- **ios**：iOS 平台通用（非特定框架）。示例：ios-lifecycle、ios-sandbox
- **android**：Android 平台通用（非特定框架）。示例：android-intent、android-permissions
- **harmonyos**：鸿蒙 HarmonyOS / ArkTS 平台。合并别名：`hmos`、`arkts-platform`。示例：harmonyos-ability、arkts-ui
- **hms-core**：华为 HMS Core 服务（与平台 `harmonyos` 区分，HMS 是服务侧）。示例：hms-account

## iOS 技术栈（iOS SDK）

- **swiftui**：SwiftUI 声明式 UI。示例：swiftui-layout、swiftui-state
- **foundation**：Apple Foundation / NSObject 运行时。示例：foundation-kvo
- **coredata**：Core Data 持久化（**保留**，不合并 swiftdata）。示例：coredata-migration
- **swiftdata**：SwiftData 新一代持久化（**保留**，不合并 coredata）。示例：swiftdata
- **kingfisher**：Kingfisher 图片加载库（**保留**，不合并 sdwebimage）。示例：kingfisher
- **sdwebimage**：SDWebImage（**保留**，不合并 kingfisher）。示例：sdwebimage

## Android 技术栈（Android SDK）

- **compose**：Jetpack Compose（**Android Compose**，不是 iOS SwiftUI）。示例：compose-layout、compose-state
- **room**：Room 持久化。示例：room
- **datastore**：Jetpack DataStore。示例：datastore
- **coil**：Coil 图片加载。示例：coil
- **retrofit**：Retrofit HTTP 客户端。示例：retrofit

## 小程序（mini-program）

- **wechat-miniprogram**：微信小程序。合并别名：`wechat-mp`、`wx-miniprogram`。示例：wechat-miniprogram-api、wechat-miniprogram-login
- **alipay-miniprogram**：支付宝小程序。合并别名：`alipay-mp`。示例：alipay-miniprogram-api
- **douyin-miniprogram**：抖音小程序。合并别名：`douyin-mp`、`tt-miniprogram`。示例：douyin-miniprogram-api
- **jd-miniprogram**：京东小程序。合并别名：`jd-mp`。示例：jd-miniprogram-api
- **taro**：Taro 多端框架。示例：taro-core、taro-routing
- **uni-app**：uni-app 多端框架。示例：uni-app-core、uni-app-api

## 数据库 / 缓存 / 检索（data store）

- **postgresql**：PostgreSQL。合并别名：`pg`、`postgres`。示例：postgresql-tuning、postgresql-index
- **redis**：Redis。合并别名：`redis-cluster`、`redis-stack`（非独立技术栈）。示例：redis-cache、redis-pubsub
- **elasticsearch**：Elasticsearch。合并别名：`elastic`、`opensearch`（若同主题；否则独立处理）。示例：elasticsearch-query、elasticsearch-ilm
- **s3**：S3 / 对象存储协议族。示例：s3-upload
- **boto3**：AWS Python SDK（区别于 S3 协议本身）。示例：boto3

## 云与基础设施（cloud & infra）

- **kubernetes**：Kubernetes 编排。合并别名：`k8s`。示例：kubernetes-deploy、kubernetes-rbac
- **docker**：Docker 容器。合并别名：`docker-scout`（扫描工具）、`buildkit`（构建引擎）、`docker-compose`（编排子工具）。示例：docker-build、dockerfile-patterns
- **nginx**：Nginx 反向代理 / 负载均衡。示例：nginx-config、nginx-stream
- **calico**：Calico CNI（**保留**，不合并 cilium）。示例：calico
- **cilium**：Cilium CNI（**保留**，不合并 calico）。示例：cilium
- **argocd**：Argo CD GitOps（**保留**，不合并 fluxcd）。示例：argocd
- **fluxcd**：Flux CD GitOps（**保留**，不合并 argocd）。示例：fluxcd
- **trivy**：Trivy 镜像扫描。示例：trivy

## CI/CD 与版本控制（ci & vcs）

- **gitlab**：GitLab 平台。合并别名：`gitlab-ci`、`gitlab-runner`、`gitlab-pages`。示例：gitlab-pipeline、gitlab-runner-cfg
- **github**：GitHub 平台（作为 OAuth provider 与开发者平台）。示例：github-app-auth
- **github-actions**：GitHub Actions 工作流。示例：github-actions-workflow

## 监控与日志（observability）

- **prometheus**：Prometheus 监控。示例：prometheus-rules
- **opentelemetry**：OpenTelemetry 链路。合并别名：`otel`。示例：opentelemetry-trace
- **grafana-loki**：Grafana Loki 日志聚合。示例：grafana-loki
- **structlog**：Python structlog 结构化日志。示例：structlog

## 消息与实时通信（messaging & realtime）

- **kafka**：Apache Kafka。合并别名：`confluent`（Confluent 平台作为 Kafka 发行版）。示例：kafka-producer、kafka-consumer
- **socketio**：Socket.IO。合并别名：`python-socketio`、`socketio-client`。示例：socketio-server
- **im**：即时通讯 / 聊天综合伞标签（无特定厂商 SDK）。示例：im-message、im-presence
- **xmpp**：XMPP 协议栈。示例：xmpp-core
- **signal**：Signal 协议 / libsignal。示例：signal-protocol

## 认证与社交登录（auth & social login）

OAuth provider 各家保留独立（他们本就是不同 provider，不能合并）。

- **oauth2**：OAuth 2.0 协议通用实现。示例：oauth2-flow
- **oidc**：OpenID Connect 协议。示例：oidc-flow
- **oauth-social-login**：社交登录综合伞标签（跨厂商 flow 综述）。示例：oauth-social-login
- **http**：裸 HTTP 协议实现（认证 skill 里的基础协议基底）。示例：http-basic-auth

海外 provider：
- **github** / **facebook** / **apple-auth** / **yahoo** / **instagram-platform** / **x-twitter** / **meta-graph-api** / **microsoft-entra**（原 azure-ad 更名）/ **amazon-lwa**（Amazon Login with Amazon）

国内 provider：
- **wechat**：微信登录 / 开放平台。合并别名：`wechat-open-platform`、`wechat-official-account`、`wechat-cloud`、`wechat-login`
- **qq-connect**：QQ 互联
- **baidu-oauth**：百度 OAuth
- **douyin-open-platform**：抖音开放平台
- **taobao-top**：淘宝开放平台 TOP
- **netease-urs**：网易通行证 URS
- **cn-platform-oauth-login**：国内平台 OAuth 综合（跨厂商综述）
- **honor-id** / **vivo-account** / **xiaomi-account**：国内手机厂商账号
- **cmcc-number-auth** 等运营商一键登录归入对应运营商（如无独立标签，暂以 skill 名承载，待出现第二个同品牌时入表）

## 支付（payment）

- **payment**：支付综合伞标签。示例：payment-gateway、payment-reconciliation
- **wechat-pay**：微信支付。示例：wechat-pay-jsapi
- **alipay**：支付宝支付。示例：alipay-app-pay
- **unionpay**：银联支付。示例：unionpay

## 游戏引擎（game engine）

竞品各家独立保留，不合并。

- **unreal5**：Unreal Engine 5。示例：unreal5-blueprint、unreal5-niagara
- **godot4**：Godot 4。示例：godot4-scene、godot4-gdscript
- **phaser**：Phaser 2D 游戏引擎。示例：phaser-sprite、phaser-tween

## 媒体与 DRM（media & drm）

- **hls**：HLS 流媒体协议。示例：hls-playback
- **mse**：Media Source Extensions。示例：mse
- **eme**：Encrypted Media Extensions。示例：eme
- **drm**：DRM 综合伞标签。示例：drm-overview
- **widevine** / **playready** / **fairplay**：三大 CDM（各自独立保留，它们是不同厂商竞品）
- **webvtt**：WebVTT 字幕。示例：webvtt

## AI / Agent

- **langchain**：LangChain。示例：langchain-chain、langchain-tool
- **langgraph**：LangGraph 状态图编排。示例：langgraph-node、langgraph-checkpoint
- **claude-code**：Claude Code 平台与 Agent SDK。合并别名：`claude-agent-sdk`。示例：claude-code-hook、claude-code-subagent
- **mcp**：Model Context Protocol。示例：mcp-server、mcp-client
- **agent**：Agent 综合伞标签（无特定框架归属）。示例：agent-patterns

## 测试与自动化（testing）

- **playwright**：Playwright 浏览器自动化 / E2E。示例：playwright-e2e

## 其他（misc）

- **crypto**：加解密 / 密码学综合。示例：crypto-aes
- **dash**：MPEG-DASH 流媒体。示例：dash

---

## 待合并 / 观察项

频次为 1 的孤立标签已在上面各分类中显式归属。未来新增 skill 时若引入下列情形，**优先合并**而非新建：

| 如果未来出现 | 应归入 |
|---|---|
| FastAPI 的任何第三方扩展（如 `fastapi-limiter`、`fastapi-cache`、`fastapi-pagination`） | `fastapi` |
| Django 的任何第三方扩展（如 `django-celery`、`django-redis`） | `django` + 对应骨干（`celery` / `redis`） |
| Redis 的客户端库（`redis-py`、`ioredis`、`lettuce`） | `redis` |
| Kafka 的客户端库（`kafka-python`、`aiokafka`） | `kafka` |
| Kubernetes 生态工具链（`helm`、`kustomize`、`kubectl`） | `kubernetes`（除非工具本身是独立产品如 `argocd`） |
| Docker 子工具（`compose`、`swarm`、`containerd`） | `docker`（`containerd` 若单独成篇可独立） |
| wechat 新子平台（`wechat-work`、`wechat-pay-sandbox`） | `wechat`（或已独立的 `wechat-pay` / `wechat-miniprogram`） |
| 新的 OAuth provider（如某新厂商登录） | **新建独立标签**（provider 本就各自独立） |
| 新的游戏引擎 / DRM CDM | **新建独立标签**（竞品不合并） |

## 变更规则

1. 新增枚举前，先确认现有项确实不能覆盖；"是 X 的扩展 / 插件 / 客户端"一律归 X
2. 新增独立枚举仅在"不同厂商竞品" / "不同代际独立技术" / "独立协议"三种情形
3. 删除 / 合并枚举时，需同步批量重新打标受影响的 skill，并在 commit 里列出规则表
4. 命名：全小写 + 短横线；避免复合（`typescript-react` → 拆成两个 tag）；版本号仅用于强代际差
