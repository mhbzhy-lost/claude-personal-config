---
name: payment-gateway
description: "支付网关架构：订单状态机、幂等性设计、订单号分配策略、超时处理、统一下单抽象层。"
tech_stack: [payment, backend]
---

# 支付网关核心架构

> 版本基准：基于支付宝 Open API v3、微信支付 APIv3、银联无跳转接口 2024+ 的通用架构总结
> 适用于自建支付网关（非聚合支付 SaaS），日均交易量 1K-1000K 笔级别

## 用途

支付网关是连接业务系统与第三方支付渠道的核心中间层。它负责统一下单接口、管理订单全生命周期（创建→支付→退款→关闭）、保证交易幂等性和数据一致性。本 skill 覆盖支付网关最核心的五个架构设计点，帮助开发者构建可靠的支付系统。

## 何时使用

- 从零搭建自有支付网关，需要确定订单表结构和状态机设计
- 对接多个支付渠道（支付宝、微信、银联），需要统一抽象层
- 遇到重复支付、订单号冲突、金额精度丢失等线上事故，需要排查和修复
- 设计订单超时关闭机制，需要选择延迟队列方案
- 进行支付系统 Code Review，需要检查幂等性和并发安全

## 订单状态机

### 状态定义

| 状态 | 值 | 说明 |
|------|-----|------|
| 待支付 | `CREATED` | 订单已创建，等待用户发起支付 |
| 支付中 | `PAYING` | 已调用渠道下单接口，等待用户完成支付 |
| 已支付 | `PAID` | 渠道回调确认支付成功 |
| 退款中 | `REFUNDING` | 已提交退款请求，等待渠道处理 |
| 已退款 | `REFUNDED` | 渠道确认退款成功（全额退款） |
| 部分退款 | `PARTIAL_REFUNDED` | 渠道确认退款成功（部分退款） |
| 已关闭 | `CLOSED` | 超时关闭或手动取消 |
| 支付失败 | `PAY_FAILED` | 渠道明确返回支付失败 |

### 状态转移规则

| 当前状态 | 目标状态 | 触发事件 | 副作用 |
|----------|----------|----------|--------|
| `CREATED` | `PAYING` | 调用渠道下单成功 | 记录渠道交易号（trade_no） |
| `CREATED` | `CLOSED` | 超时未支付 / 用户取消 | 释放库存、优惠券 |
| `PAYING` | `PAID` | 收到支付成功回调 | 触发发货/履约通知 |
| `PAYING` | `PAY_FAILED` | 收到支付失败回调 | 记录失败原因 |
| `PAYING` | `CLOSED` | 超时未回调 + 主动查单确认未支付 | 调渠道关单 API → 释放资源 |
| `PAID` | `REFUNDING` | 发起退款请求 | 调渠道退款 API |
| `PAID` | `PARTIAL_REFUNDED` | 部分退款成功回调 | 更新已退金额 |
| `REFUNDING` | `REFUNDED` | 全额退款成功回调 | 触发退款到账通知 |
| `REFUNDING` | `PARTIAL_REFUNDED` | 部分退款成功回调 | 更新已退金额 |
| `REFUNDING` | `PAID` | 退款失败回调 | 记录失败原因，恢复原状态 |
| `PARTIAL_REFUNDED` | `REFUNDING` | 再次发起退款 | 校验剩余可退金额 |

### 乐观锁状态转移 SQL

```sql
-- 核心状态转移：通过 version 乐观锁 + status 前置条件保证并发安全
UPDATE payment_order
SET    status     = 'PAID',
       version    = version + 1,
       channel_trade_no = '2024061222001400001234567890',
       paid_at    = NOW(),
       updated_at = NOW()
WHERE  order_no   = 'P20240612001234567890'
  AND  status     = 'PAYING'
  AND  version    = 3;

-- 检查 affected rows：
-- = 1 → 转移成功
-- = 0 → 状态已被其他线程变更（回调重复 / 并发关单），需查询最新状态决策
```

### 订单表核心 DDL（PostgreSQL）

```sql
CREATE TABLE payment_order (
    id               BIGSERIAL PRIMARY KEY,
    order_no         VARCHAR(32) NOT NULL,              -- 商户订单号（全局唯一）
    biz_order_no     VARCHAR(64),                       -- 业务订单号（关联上游业务系统）
    channel          VARCHAR(16) NOT NULL,              -- 支付渠道：ALIPAY / WECHAT / UNIONPAY
    pay_method       VARCHAR(16) NOT NULL,              -- 支付方式：APP / JSAPI / H5 / NATIVE / PC
    amount_cents     BIGINT      NOT NULL CHECK (amount_cents > 0), -- 订单金额（分）
    currency         VARCHAR(3)  NOT NULL DEFAULT 'CNY',-- 币种 ISO 4217
    status           VARCHAR(20) NOT NULL DEFAULT 'CREATED',
    version          INTEGER     NOT NULL DEFAULT 0,    -- 乐观锁版本号
    channel_trade_no VARCHAR(64),                       -- 渠道交易号
    channel_extra    JSONB,                             -- 渠道返回的额外信息
    refunded_cents   BIGINT      NOT NULL DEFAULT 0,    -- 已退款金额（分）
    subject          VARCHAR(128) NOT NULL,             -- 商品摘要
    client_ip        INET,                              -- 下单客户端 IP
    notify_url       VARCHAR(256),                      -- 异步回调地址
    expire_at        TIMESTAMPTZ NOT NULL,              -- 订单过期时间
    paid_at          TIMESTAMPTZ,                       -- 支付成功时间
    closed_at        TIMESTAMPTZ,                       -- 关闭时间
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uk_order_no UNIQUE (order_no),
    CONSTRAINT ck_status CHECK (status IN (
        'CREATED','PAYING','PAID','PAY_FAILED',
        'REFUNDING','REFUNDED','PARTIAL_REFUNDED','CLOSED'
    ))
);

-- 高频查询索引
CREATE INDEX idx_order_biz ON payment_order (biz_order_no);
CREATE INDEX idx_order_channel_trade ON payment_order (channel_trade_no) WHERE channel_trade_no IS NOT NULL;
CREATE INDEX idx_order_status_expire ON payment_order (status, expire_at) WHERE status IN ('CREATED', 'PAYING');
CREATE INDEX idx_order_created ON payment_order (created_at);
```

### 为什么 status 用 VARCHAR 而非 ENUM

1. **变更成本**：PostgreSQL 的 `ALTER TYPE ... ADD VALUE` 不支持事务回滚，加新状态有风险；VARCHAR + CHECK 约束可以在事务内安全修改
2. **跨服务兼容**：状态值需要在多个微服务间传递（JSON/MQ），ENUM 类型在 ORM 映射和序列化时容易出错
3. **运维友好**：直接查表就能看到可读的状态字符串，无需查 ENUM 定义
4. **性能差异可忽略**：状态字段离散度低，索引效率与 ENUM 几乎无差别
5. **代价可控**：用 CHECK 约束替代 ENUM 的类型安全，非法值同样会被拒绝

## 幂等性设计

支付场景中，网络超时、用户重复点击、渠道回调重试都会导致同一请求被重复发送。幂等性保证同一请求无论执行多少次，结果与执行一次完全相同。

### 幂等键生成策略

| 策略 | 幂等键构成 | 适用场景 | 优缺点 |
|------|-----------|----------|--------|
| 客户端生成 UUID | 客户端生成 `idempotency_key` 放 Header | 通用 API 幂等 | 简单，但客户端不可信需校验格式 |
| order_no + action | `{order_no}:{action}`（如 `P2024...:PAY`） | 支付/退款操作 | 自然唯一，推荐用于支付网关内部 |
| biz_order_no + channel | `{biz_order_no}:{channel}` | 统一下单接口 | 防止同一业务单重复创建支付单 |

**推荐**：统一下单接口使用 `biz_order_no + channel` 作为幂等键，支付/退款操作使用 `order_no + action`。

### 三层防护架构

```
请求进入
  │
  ▼
┌─────────────────────────────┐
│ 第 1 层：Redis SET NX 快速拦截  │  ← 99% 重复请求在此挡住
│ Key: idempotent:{key}       │
│ Value: PROCESSING / result  │
│ TTL: 24h                    │
└──────────────┬──────────────┘
               │ 首次请求（SET NX 成功）
               ▼
┌─────────────────────────────┐
│ 第 2 层：DB UNIQUE 约束兜底    │  ← 防 Redis 故障时的极端并发
│ payment_order.order_no UK   │
└──────────────┬──────────────┘
               │ INSERT 成功
               ▼
┌─────────────────────────────┐
│ 第 3 层：状态机前置条件         │  ← 防已完成订单被重复操作
│ WHERE status = ? AND ver = ?│
└─────────────────────────────┘
```

### Redis 幂等拦截伪代码

```
FUNCTION check_idempotent(key, ttl=86400):
    -- 尝试占位
    result = REDIS.SET("idempotent:{key}", "PROCESSING", NX=true, EX=ttl)

    IF result == true:
        -- 首次请求，继续执行业务逻辑
        RETURN {is_duplicate: false}

    -- 占位失败，读取已有值
    cached = REDIS.GET("idempotent:{key}")

    IF cached == "PROCESSING":
        -- 前一个请求还在处理中（并发重复提交）
        RETURN {is_duplicate: true, status: "PROCESSING", hint: "请稍后查询结果"}

    -- 前一个请求已完成，直接返回缓存结果
    RETURN {is_duplicate: true, status: "COMPLETED", result: JSON.parse(cached)}


FUNCTION save_idempotent_result(key, result, ttl=86400):
    -- 业务逻辑执行完毕后，将结果写回 Redis
    REDIS.SET("idempotent:{key}", JSON.stringify(result), EX=ttl)
```

### 并发场景 double-check 流程

当两个相同请求几乎同时到达，Redis SET NX 只有一个能成功。但在极端情况下（Redis 主从切换），两个请求都可能通过第一层。此时需要：

1. **DB INSERT with ON CONFLICT**：利用唯一约束确保只有一行被插入
2. **INSERT 失败方**：查询已有记录，判断状态后直接返回

```sql
-- PostgreSQL：INSERT ... ON CONFLICT 实现原子幂等写入
INSERT INTO payment_order (order_no, biz_order_no, channel, pay_method, amount_cents, subject, expire_at)
VALUES ('P20240612001234567890', 'BIZ_001', 'ALIPAY', 'APP', 9900, '测试商品', NOW() + INTERVAL '30 minutes')
ON CONFLICT (order_no) DO NOTHING
RETURNING id;

-- RETURNING 返回空 → 说明是重复插入，查询已有记录
-- RETURNING 返回 id → 说明是首次插入，继续后续流程
```

## 订单号分配策略

### 方案对比

| 方案 | 格式示例 | 全局唯一 | 趋势递增 | 可读性 | QPS 上限 | 外部依赖 |
|------|----------|---------|---------|--------|---------|---------|
| Snowflake | `6849735872495616001` | 是 | 是（毫秒级） | 差（纯数字无语义） | ~409.6K/节点 | 无（本地时钟） |
| 日期前缀+序列 | `P20240612A100001234` | 是（含机器标识） | 是 | 好（含日期） | 取决于序列生成器 | 视实现而定 |
| Leaf-segment（号段） | `100001234` | 是 | 是 | 中 | ~数百K | 数据库 |
| Redis INCR | `P20240612000012345` | 是 | 是 | 好 | ~100K+ | Redis |

### 订单号设计原则

1. **全局唯一**：跨数据库、跨机房不冲突
2. **趋势递增**：利于 B+ 树索引写入性能（避免页分裂）
3. **可读性**：包含日期信息，运维排查可直接从订单号看出创建时间
4. **无信息泄漏**：不能通过相邻订单号推算出日交易量（禁止纯自增）
5. **长度可控**：需适配各渠道的商户订单号长度限制

### 推荐方案：日期+机器+序列+随机尾数

```
P 20240612 01 123456 78
│ │        │  │      │
│ 日期(8)   │  序列(6) 随机(2)
│          机器标识(2)
前缀(1)

总长度：1 + 8 + 2 + 6 + 2 = 19 字符（满足所有渠道长度限制）
```

**各部分说明**：
- **前缀(1)**：`P`=支付单、`R`=退款单，方便日志检索
- **日期(8)**：`yyyyMMdd`，可读且天然分区键
- **机器标识(2)**：00-99，支持 100 个节点
- **毫秒序列(6)**：每毫秒内自增，单节点支持 1000/ms = 100 万/秒
- **随机尾数(2)**：00-99 随机数，防止通过相邻订单号推算交易量

**序列生成伪代码**：

```
-- 进程级序列生成器（无外部依赖）
GLOBAL last_timestamp = 0
GLOBAL sequence = 0
GLOBAL machine_id = CONF.get("machine_id")  -- 部署时分配，00-99

FUNCTION next_order_no(prefix="P"):
    ts = current_time_millis()

    IF ts == last_timestamp:
        sequence = sequence + 1
        IF sequence > 999999:
            -- 当前毫秒序列耗尽，等待下一毫秒
            WAIT_UNTIL(current_time_millis() > ts)
            ts = current_time_millis()
            sequence = 0
    ELSE:
        sequence = 0
        last_timestamp = ts

    date_part = FORMAT(ts, "yyyyMMdd")          -- 8 位
    seq_part  = LPAD(sequence, 6, "0")          -- 6 位
    rand_part = LPAD(RANDOM(0, 99), 2, "0")     -- 2 位

    RETURN "{prefix}{date_part}{machine_id}{seq_part}{rand_part}"
```

### 各支付渠道商户订单号约束

| 渠道 | 字段名 | 最大长度 | 字符限制 | 其他约束 |
|------|--------|---------|---------|---------|
| 支付宝 | `out_trade_no` | 64 字符 | 字母、数字、下划线 | 同一商户号下唯一 |
| 微信支付 | `out_trade_no` | 32 字符 | 字母、数字、`-`、`_` | 同一商户号下唯一，6-32 字符 |
| 银联 | `orderId` | 40 字符 | 字母、数字 | 同一商户号同一日期下唯一 |

**注意**：微信支付的 32 字符限制是最紧的约束，订单号设计必须以此为上限。推荐方案的 19 字符满足所有渠道。

## 超时处理

### 超时关闭流程

```
订单创建（CREATED, expire_at = NOW() + 30min）
     │
     │  注册延迟任务
     ▼
[ 延迟队列 ] ──── expire_at 到期 ────▶ 超时处理器
                                          │
                                          ▼
                                    查询订单当前状态
                                          │
                           ┌──────────────┼──────────────┐
                           │              │              │
                      status=CREATED  status=PAYING   status=PAID
                           │              │              │
                           ▼              ▼              ▼
                       直接关单     调渠道查单 API      忽略（已完成）
                           │              │
                           │        ┌─────┴─────┐
                           │        │           │
                           │    渠道已支付    渠道未支付
                           │        │           │
                           │    标记 PAID    调渠道关单 API
                           │                    │
                           ▼                    ▼
                     释放库存/券          释放库存/券
                     标记 CLOSED          标记 CLOSED
```

### 延迟队列方案对比

| 方案 | 精度 | 可靠性 | 吞吐量 | 运维成本 | 适用场景 |
|------|------|--------|--------|---------|---------|
| Redis ZSET | 秒级 | 中（需处理 Redis 故障） | 高 | 低 | 中小规模，已有 Redis 集群 |
| RabbitMQ TTL + 死信队列 | 秒级 | 高（消息持久化） | 中高 | 中 | 已有 RabbitMQ 基础设施 |
| RocketMQ 延迟消息 | 固定等级 | 高 | 高 | 中 | 已有 RocketMQ，精度要求不高 |
| 数据库轮询 | 分钟级 | 高（数据在 DB） | 低 | 低 | 订单量小（<1K/天），不想引入中间件 |
| 时间轮（HashedWheelTimer） | 毫秒级 | 低（内存中，重启丢失） | 极高 | 低 | 单进程内辅助用，需配合持久化方案兜底 |

### Redis ZSET 延迟队列伪代码

```
-- 生产端：创建订单后注册延迟任务
FUNCTION schedule_order_close(order_no, expire_at):
    score = expire_at.to_unix_timestamp()
    REDIS.ZADD("payment:close_queue", score, order_no)


-- 消费端：定时轮询到期任务
FUNCTION poll_expired_orders():
    WHILE true:
        now = current_unix_timestamp()
        -- 取出所有已到期的订单号（score <= now）
        expired = REDIS.ZRANGEBYSCORE("payment:close_queue", 0, now, LIMIT=100)

        IF expired is empty:
            SLEEP(1 second)
            CONTINUE

        FOR order_no IN expired:
            -- 原子移除，防止多个消费者重复处理
            removed = REDIS.ZREM("payment:close_queue", order_no)
            IF removed == 1:
                -- 成功获取处理权
                handle_order_timeout(order_no)


FUNCTION handle_order_timeout(order_no):
    order = DB.SELECT("SELECT * FROM payment_order WHERE order_no = ?", order_no)

    IF order.status == 'PAID' OR order.status == 'CLOSED':
        RETURN  -- 已终态，跳过

    IF order.status == 'PAYING':
        -- 先向渠道查单确认
        channel_result = CHANNEL.query_order(order.channel, order.order_no)
        IF channel_result.status == 'SUCCESS':
            -- 渠道已支付但回调丢失，补偿标记为 PAID
            update_order_status(order_no, 'PAYING', 'PAID', order.version)
            RETURN

    -- 调用渠道关单（PAYING 状态下渠道可能已创建预支付单）
    IF order.status == 'PAYING':
        CHANNEL.close_order(order.channel, order.order_no)

    -- 本地关单
    affected = update_order_status(order_no, order.status, 'CLOSED', order.version)
    IF affected == 1:
        release_inventory(order.biz_order_no)
        release_coupon(order.biz_order_no)
```

### 超时时间设计

| 渠道 | 默认超时 | 可配范围 | 建议值 |
|------|---------|---------|--------|
| 支付宝 | 根据产品而定 | 1min ~ 6h | 30min |
| 微信支付 | 5min（JSAPI）/ 无（NATIVE） | 5min ~ 2h | 30min |
| 银联 | 无默认，商户自行控制 | - | 30min |
| 本地网关 | - | - | 取 MIN(渠道限制, 业务需求) |

**原则**：本地超时时间必须 **小于等于** 渠道超时时间，否则会出现「本地已关单但渠道仍可支付」的不一致情况。

### 关单与用户并发支付的竞态处理

这是支付系统中最经典的并发问题之一：超时处理器正在关单，用户同时完成了支付。

```
时间线：
T1  超时处理器：查询订单 → status = PAYING
T2  用户：完成支付 → 渠道回调到达
T3  回调处理器：UPDATE status = PAID WHERE status = PAYING → 成功（affected=1）
T4  超时处理器：UPDATE status = CLOSED WHERE status = PAYING → 失败（affected=0）

-- 乐观锁保证：T3 和 T4 只有一个能成功
-- T4 失败后，超时处理器应重新查询状态，发现已 PAID，放弃关单
```

**反向情况**（先关后付）：

```
T1  超时处理器：UPDATE status = CLOSED WHERE status = PAYING → 成功
T2  超时处理器：调渠道关单 API
T3  用户：在渠道侧完成支付（在关单 API 生效前的窗口期）
T4  渠道回调到达：UPDATE status = PAID WHERE status = PAYING → 失败（已 CLOSED）

-- 此时用户已扣款但本地已关单，形成不一致
-- 解决方案：收到回调但状态转移失败时，启动退款补偿
```

```
FUNCTION handle_payment_callback(order_no, channel_trade_no):
    order = DB.SELECT_FOR_UPDATE("SELECT * FROM payment_order WHERE order_no = ?", order_no)

    IF order.status == 'PAYING':
        -- 正常情况：标记支付成功
        update_order_status(order_no, 'PAYING', 'PAID', order.version)
        RETURN {success: true}

    IF order.status == 'CLOSED':
        -- 竞态情况：本地已关单但渠道扣款成功
        LOG.warn("订单已关闭但收到支付成功回调，触发自动退款: {order_no}")
        trigger_auto_refund(order_no, channel_trade_no, order.amount_cents)
        RETURN {success: true}  -- 仍需回复渠道成功，否则渠道会持续重试

    IF order.status == 'PAID':
        -- 重复回调，直接返回成功
        RETURN {success: true}

    LOG.error("非预期的回调状态: order={order_no}, status={order.status}")
    RETURN {success: false}
```

## 统一下单抽象层

### PaymentChannel 接口定义

```
INTERFACE PaymentChannel:
    -- 渠道标识
    FUNCTION channel_code() -> STRING   -- "ALIPAY" / "WECHAT" / "UNIONPAY"

    -- 统一下单：向渠道发起预支付请求
    FUNCTION create_order(request: CreateOrderRequest) -> CreateOrderResponse

    -- 订单查询：主动向渠道查询订单状态
    FUNCTION query_order(order_no: STRING) -> QueryOrderResponse

    -- 关闭订单：通知渠道关闭未支付订单
    FUNCTION close_order(order_no: STRING) -> CloseOrderResponse

    -- 申请退款
    FUNCTION refund(request: RefundRequest) -> RefundResponse

    -- 退款查询
    FUNCTION query_refund(refund_no: STRING) -> QueryRefundResponse

    -- 验证回调签名并解析通知
    FUNCTION parse_notification(headers: MAP, body: STRING) -> NotificationResult
```

### 统一请求/响应模型

```
STRUCT CreateOrderRequest:
    order_no       STRING       -- 商户订单号
    amount_cents   INTEGER      -- 金额（分）
    currency       STRING       -- 币种，默认 "CNY"
    subject        STRING       -- 商品摘要
    pay_method     STRING       -- APP / JSAPI / H5 / NATIVE / PC
    expire_at      TIMESTAMP    -- 过期时间
    notify_url     STRING       -- 异步回调地址
    return_url     STRING       -- 同步跳转地址（H5/PC 场景）
    client_ip      STRING       -- 客户端 IP
    openid         STRING       -- 微信 JSAPI 必传
    extra          MAP          -- 渠道特有参数透传


STRUCT CreateOrderResponse:
    success        BOOLEAN
    channel_trade_no STRING     -- 渠道交易号（预支付ID等）
    pay_data       STRING       -- 客户端调起支付所需数据
                                --   APP: JSON (包含 sign, timestamp 等)
                                --   JSAPI: JSON (微信 prepay_id 等)
                                --   NATIVE: 二维码 URL
                                --   H5: 跳转 URL
                                --   PC: 表单 HTML 或跳转 URL
    raw_response   STRING       -- 渠道原始响应（调试用）
    error_code     STRING       -- 失败时的错误码
    error_msg      STRING       -- 失败时的错误信息
```

### ChannelRouter 路由逻辑

```
FUNCTION route_channel(pay_method, channel_hint, user_context) -> PaymentChannel:
    -- 第 1 步：显式指定渠道
    IF channel_hint is not empty:
        RETURN channel_registry.get(channel_hint)

    -- 第 2 步：根据支付方式推断
    IF pay_method == "JSAPI" AND user_context.platform == "WECHAT_MINI":
        RETURN WechatPayChannel
    IF pay_method == "JSAPI" AND user_context.platform == "ALIPAY_MINI":
        RETURN AlipayChannel

    -- 第 3 步：查渠道配置（可能涉及灰度、AB 测试、成本优选）
    config = DB.SELECT("SELECT * FROM channel_config WHERE pay_method = ? AND enabled = true
                        ORDER BY priority ASC LIMIT 1", pay_method)
    RETURN channel_registry.get(config.channel_code)
```

### 渠道配置化管理

```sql
CREATE TABLE channel_config (
    id             SERIAL PRIMARY KEY,
    channel_code   VARCHAR(16) NOT NULL,              -- ALIPAY / WECHAT / UNIONPAY
    pay_method     VARCHAR(16) NOT NULL,              -- APP / JSAPI / H5 / NATIVE / PC
    merchant_id    VARCHAR(32) NOT NULL,              -- 商户号
    app_id         VARCHAR(32),                       -- 渠道应用 ID
    enabled        BOOLEAN NOT NULL DEFAULT true,
    priority       INTEGER NOT NULL DEFAULT 0,        -- 优先级（越小越优先）
    rate_bps       INTEGER,                           -- 费率（基点，1bps=0.01%）
    config_json    JSONB NOT NULL,                    -- 证书路径、API 密钥等加密存储
    daily_limit_cents BIGINT,                         -- 单日限额（分）
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uk_channel_method UNIQUE (channel_code, pay_method, merchant_id)
);
```

**config_json 内容示例**（实际应加密存储，此处为明文说明结构）：

```json
{
  "alipay": {
    "gateway_url": "https://openapi.alipay.com/gateway.do",
    "app_private_key_path": "/etc/secrets/alipay/app_private_key.pem",
    "alipay_public_key_path": "/etc/secrets/alipay/alipay_public_key.pem",
    "sign_type": "RSA2",
    "encrypt_key": "..."
  },
  "wechat": {
    "api_base_url": "https://api.mch.weixin.qq.com",
    "api_v3_key": "...",
    "cert_serial_no": "...",
    "private_key_path": "/etc/secrets/wechat/apiclient_key.pem",
    "platform_cert_path": "/etc/secrets/wechat/wechatpay_cert.pem"
  }
}
```

## 金额处理

### 核心规则

**永远使用整数（分）存储和传输金额，禁止使用浮点数。**

```
-- 错误示范
amount = 0.1 + 0.2          -- = 0.30000000000000004（IEEE 754 浮点误差）
total  = 19.9 * 100         -- = 1989.9999999999998（不等于 1990）

-- 正确做法
amount_cents = 10 + 20       -- = 30（分）
total_cents  = 1990          -- 前端传入已转为分的整数
```

### 数据库字段类型选择

| 方案 | 类型 | 存储值 | 优点 | 缺点 |
|------|------|--------|------|------|
| **推荐**：整数分 | `BIGINT` | `9900`（代表 99.00 元） | 无精度问题，运算快，存储小 | 展示时需除以 100 |
| 备选：精确小数 | `NUMERIC(12,2)` | `99.00` | 直观，SQL 聚合方便 | 运算稍慢，需注意中间结果精度 |
| **禁止**：浮点 | `FLOAT/DOUBLE` | - | - | 精度丢失，财务场景不可接受 |

### 各渠道金额单位差异

| 渠道 | 字段名 | 单位 | 类型 | 示例（99.00 元） | 转换公式 |
|------|--------|------|------|-----------------|---------|
| 支付宝 | `total_amount` | 元 | String | `"99.00"` | `FORMAT(amount_cents / 100.0, "0.00")` |
| 微信支付 | `total` (amount.total) | 分 | Integer | `9900` | 直接使用 `amount_cents` |
| 银联 | `txnAmt` | 分 | String | `"9900"` | `STRING(amount_cents)` |

**关键注意**：支付宝使用 **元为单位的字符串**，且要求保留两位小数。转换时必须注意：
- 用整数除法 + 格式化，不要用浮点除法
- `9900 / 100 = 99`，格式化为 `"99.00"`（不是 `"99"` 或 `"99.0"`）
- 退款金额同理

### 多币种处理

```sql
-- 订单表已包含 currency 字段（ISO 4217）
-- 不同币种的最小单位不同：
--   CNY: 1分 = 0.01元
--   JPY: 1日元（无小数位）
--   USD: 1美分 = 0.01美元
--   BHD: 1费尔 = 0.001第纳尔（三位小数）

-- 币种精度配置表
CREATE TABLE currency_config (
    currency_code  VARCHAR(3) PRIMARY KEY,  -- ISO 4217
    minor_unit     INTEGER NOT NULL,         -- 小数位数：CNY=2, JPY=0, BHD=3
    symbol         VARCHAR(8),               -- ¥, $, ¥ (日元)
    name_cn        VARCHAR(32)
);

INSERT INTO currency_config VALUES
('CNY', 2, '¥',  '人民币'),
('USD', 2, '$',  '美元'),
('EUR', 2, '€',  '欧元'),
('JPY', 0, '¥',  '日元'),
('GBP', 2, '£',  '英镑'),
('BHD', 3, 'BD', '巴林第纳尔');
```

## 常见陷阱

### 1. 浮点金额导致对账差异

**问题**：使用 `FLOAT` 存储金额或在转换时用浮点除法，导致 `19.9 * 100 = 1989.9999...`，截断后变成 1989 分，每笔少 1 分。日交易 10 万笔时每天差 1000 元。

**解决**：全链路使用整数分，前端传入分、存储用 BIGINT、渠道接口转换时用整数运算+字符串格式化。

### 2. 未处理回调与关单的竞态

**问题**：超时关单和支付回调同时到达，若不做乐观锁保护，可能出现：用户已付款但订单被关闭（扣了钱但没发货），或者订单已关闭但仍发了货。

**解决**：状态变更必须带乐观锁（`WHERE status = ? AND version = ?`），回调处理发现状态为 CLOSED 时触发自动退款补偿。

### 3. 订单号暴露交易量

**问题**：使用纯自增序列作为订单号（如 `10001, 10002, 10003`），竞品只需在不同时间各下一单，就能推算出日交易量。

**解决**：订单号中加入随机因子（推荐方案的 2 位随机尾数），或使用 Snowflake 类方案。

### 4. 幂等键缺失导致重复支付

**问题**：统一下单接口未做幂等，用户网络超时后重试，创建了两笔支付单，导致同一笔业务订单被扣款两次。

**解决**：以 `biz_order_no + channel` 为幂等键，Redis SET NX 拦截 + DB UNIQUE 约束兜底。

### 5. 本地超时大于渠道超时

**问题**：本地设置 2 小时超时，但微信 JSAPI 默认 5 分钟超时。5 分钟后微信侧已关闭预支付单，但本地仍显示「待支付」，用户看到倒计时还有 1 小时 55 分钟。用户无法再次支付（老单未关，新单创建被幂等拦截）。

**解决**：本地超时时间 = MIN(渠道超时, 业务需求)。建议统一设为 30 分钟，JSAPI 场景缩短到 5 分钟。

### 6. 退款金额校验缺失

**问题**：退款接口未校验「已退金额 + 本次退款金额 <= 订单金额」，导致超额退款。更严重的情况：并发退款请求，两个请求各退一半但总额超过订单金额。

**解决**：退款操作必须在数据库事务内完成，用乐观锁 + 金额校验：

```sql
UPDATE payment_order
SET    refunded_cents = refunded_cents + 5000,
       status = CASE
           WHEN refunded_cents + 5000 >= amount_cents THEN 'REFUNDED'
           ELSE 'PARTIAL_REFUNDED'
       END,
       version = version + 1,
       updated_at = NOW()
WHERE  order_no = 'P20240612001234567890'
  AND  status IN ('PAID', 'PARTIAL_REFUNDED')
  AND  version = 5
  AND  refunded_cents + 5000 <= amount_cents;  -- 关键：防超退
```

### 7. 渠道回调未验签就处理

**问题**：回调接口直接读取请求体中的 `trade_status` 和 `total_amount`，未验证签名。攻击者伪造回调请求，将订单标记为已支付，骗取发货。

**解决**：回调处理的第一步必须是签名验证，验证失败直接返回错误。详见 payment-security skill。

### 8. 渠道回调返回失败导致无限重试

**问题**：回调处理抛出异常，返回 HTTP 500。渠道认为通知失败，持续重试（支付宝最多重试 7 次，微信最多 15 次）。如果是代码 bug 导致的异常，每次重试都会失败，产生大量告警和无效流量。

**解决**：回调处理捕获所有异常，区分「可重试错误」和「不可重试错误」。对于不可重试错误（如签名验证失败、订单不存在），也返回成功响应，同时记录错误日志人工处理。

### 9. 分布式事务的错误实践

**问题**：试图在「创建支付订单」和「扣减库存」之间使用分布式事务（2PC/XA），导致性能极差且可靠性不如预期。

**解决**：支付场景推荐「最终一致性」方案：先创建订单预扣库存（本地事务），支付成功后确认扣减，支付失败/超时则释放库存。通过对账补偿处理不一致。

## 组合提示

- **payment-security**：回调签名验证、敏感参数加密、API 密钥管理，与本 skill 的回调处理流程紧密配合
- **payment-reconciliation**：每日对账流程、差异处理策略，是本 skill 中订单状态最终一致性的保障
- **payment-resilience**：渠道调用超时/熔断、重试策略、降级方案，补充本 skill 中「调渠道 API」步骤的容错设计
- **alipay-apis**：支付宝统一下单、查单、退款的具体 API 参数和签名方式
- **wechat-pay-apis**：微信支付 V3 接口的具体调用方式、证书管理
- **unionpay-apis**：银联无跳转接口对接细节
