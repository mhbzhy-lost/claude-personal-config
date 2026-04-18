# Capability Taxonomy

给 SKILL.md 打 `capability` 标签时的**闭集枚举**。与 `tech_stack`（技术栈）、`language`（编程语言）正交——描述"能做什么"，不描述"用什么做"。

## 使用规范

- `capability` 字段值**必须**来自本文件枚举；未覆盖的能力域先在本文件新增枚举再打标
- 单个 skill 通常标 1–3 个 capability；跨域综合组件可到 5 个
- 相关 agent：`skill-marker`（打标）、`skill-matcher`（用户意图→capability 筛选）

---

## UI 呈现（frontend presentation）

- **ui-layout**：布局骨架、分栏、容器、栅格。｜不含：内容数据展示｜示例：Grid、Layout、Space、Divider
- **ui-display**：静态数据展示。｜不含：录入、交互触发｜示例：Table、List、Card、Tag、Badge、Descriptions、Statistic
- **ui-feedback**：临时反馈信息。｜不含：持久化状态提示｜示例：Message、Notification、Progress、Spin、Result、Alert
- **ui-navigation**：结构化导航控件。｜不含：路由系统本身｜示例：Menu、Breadcrumb、Tabs、Pagination、Anchor、Steps
- **ui-overlay**：浮层类 UI。｜不含：Toast 类轻提示（归 ui-feedback）｜示例：Modal、Drawer、Popover、Tooltip、Dropdown

## UI 交互（frontend interaction）

- **ui-form**：表单容器、表单项编排、提交流程。｜不含：具体录入控件｜示例：Form、FormItem、FormList
- **ui-input**：录入控件。｜不含：表单容器本身｜示例：Input、Select、DatePicker、Upload、Switch、Slider、Cascader
- **ui-action**：操作触发器。｜不含：导航链接（归 ui-navigation）｜示例：Button、FloatButton、Dropdown.Button

## 数据与状态（data & state）

- **state-management**：跨组件状态共享、全局 store、上下文。｜示例：Redux、Zustand、Pinia、React Context
- **form-validation**：校验规则、异步校验、错误提示策略。｜不含：单个输入控件｜示例：rules、Yup、Zod
- **data-fetching**：远程数据获取与缓存编排。｜不含：底层 HTTP 客户端｜示例：SWR、TanStack Query、RTK Query
- **local-storage**：客户端持久化。｜示例：localStorage、IndexedDB、小程序 storage

## 网络通信（network）

- **http-client**：HTTP/REST 调用。｜示例：axios、fetch 封装、requests
- **websocket**：双向长连接。｜示例：socket.io、ws
- **rpc**：RPC 调用。｜示例：gRPC、tRPC

## 认证与安全（auth & security）

- **auth**：身份认证、登录态、Token 管理、SSO。｜不含：权限粒度控制｜示例：JWT、OAuth、session
- **permission**：授权、RBAC、资源访问控制。｜不含：身份识别本身
- **encryption**：加解密、签名、哈希。｜示例：AES、RSA、HMAC

## 平台能力（platform）

- **routing**：页面路由、路由守卫、深链接。｜不含：UI 层的菜单/面包屑
- **i18n**：国际化、多语言、时区。
- **theming**：主题切换、样式变量、暗黑模式。
- **file-upload**：文件上传、分片、断点续传。｜不含：图片处理
- **media-processing**：图片/音视频处理、播放、编解码。｜示例：video-player、ffmpeg
- **push-notification**：推送通知、系统通知。｜不含：站内消息（归 realtime-messaging）

## 原生/设备（mobile & native）

- **native-device**：摄像头、麦克风、传感器、蓝牙、位置等硬件能力。
- **native-lifecycle**：应用生命周期、前后台切换、页面栈管理。
- **native-navigation**：原生路由、TabBar、导航栏。｜不含：Web 路由（归 routing）

## 后端应用层（backend application）

- **web-framework**：路由、中间件、请求/响应处理。｜示例：Django views、FastAPI routes
- **orm**：对象关系映射、迁移、Session。｜示例：SQLAlchemy、Django ORM
- **api-design**：REST/GraphQL 接口设计、序列化、版本控制。｜示例：DRF、Pydantic、GraphQL schema

## 数据存储（data store）

- **relational-db**：关系型数据库使用、SQL、事务。｜示例：PostgreSQL、MySQL
- **key-value-store**：KV/缓存存储。｜示例：Redis、Memcached
- **search-engine**：全文检索、分词、聚合。｜示例：Elasticsearch
- **object-storage**：对象存储。｜示例：S3、OSS

## 消息与任务（messaging & task）

- **message-queue**：消息队列、发布订阅。｜示例：Kafka、RabbitMQ、Redis Stream
- **task-scheduler**：异步任务、定时任务、延迟任务。｜示例：Celery、APScheduler、cron
- **realtime-messaging**：IM、聊天、在线协作。｜不含：推送通知
- **stream-processing**：流处理、窗口计算。｜示例：Kafka Streams、Flink

## 基础设施（infrastructure）

- **container**：容器镜像、Dockerfile、容器运行时。｜示例：Docker
- **orchestration**：容器编排、多服务部署。｜示例：Kubernetes、Docker Compose
- **reverse-proxy**：反向代理、负载均衡、边缘路由。｜示例：Nginx、Traefik
- **ci-cd**：持续集成/交付流水线。｜示例：GitLab CI、GitHub Actions
- **observability**：日志、监控、指标、链路追踪。

## AI 能力（ai）

- **llm-client**：大语言模型 API 调用与管控。｜示例：Anthropic SDK、OpenAI SDK
- **agent-orchestration**：多 Agent/工作流编排、状态机。｜示例：LangGraph、Claude Agent SDK
- **prompt-engineering**：提示词设计、模板、上下文管理。
- **rag**：检索增强生成、向量检索、知识库。
- **tool-calling**：函数/工具调用、schema 设计。

## Claude Code 平台（claude-code）

- **cc-hook**：Claude Code hook 配置与开发。
- **cc-slash-command**：slash command 开发。
- **cc-mcp**：MCP 服务集成与开发。
- **cc-plugin**：plugin 市场、分发、安装。
- **cc-subagent**：sub-agent 设计与调用。
- **cc-settings**：settings.json 配置、权限、环境变量。

## 测试（testing）

- **e2e-testing**：端到端测试、浏览器自动化。｜示例：Playwright、Cypress
- **unit-testing**：单元测试。
- **integration-testing**：集成测试。

## 游戏（game）

- **game-rendering**：2D/3D 渲染、场景、精灵。｜示例：Phaser
- **game-physics**：物理引擎、碰撞。
- **game-input**：输入控制、手势、手柄。

## 支付（payment）

- **payment-gateway**：支付下单、回调、退款。｜示例：微信支付、支付宝
- **payment-reconcile**：对账、结算、账单。

---

## 变更规则

1. 新增枚举前，先确认现有项确实不能覆盖（避免近义项爆炸）
2. 新增时必须写"包含/不包含"说明与 1–2 个归属示例
3. 删除/合并枚举时，需同步批量重新打标受影响的 skill
4. 命名规范：全小写、短横线分隔、语义层级用前缀（如 `ui-*`、`cc-*`、`native-*`）
