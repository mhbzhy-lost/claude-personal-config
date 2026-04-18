---
name: payment-resilience
description: "支付容错：弱网/断网处理、订单补单机制、幂等重试策略、离线缓存、支付结果最终一致性。"
tech_stack: [payment, backend]
capability: [payment-gateway]
---

# 支付容错与弱网处理

> 来源：支付宝/微信支付官方文档最佳实践、线上支付系统故障复盘经验

## 用途

系统性解决支付链路中因网络不稳定、服务故障、异步延迟等因素导致的订单状态不一致问题，保证支付结果的最终正确性。

## 何时使用

- 设计支付系统的容错架构（弱网、超时、重试、补单）
- 排查线上支付结果不一致的问题
- 实现支付订单的补单/对账机制
- 客户端处理支付过程中的网络中断与恢复
- 评估支付链路中各环节的故障模式与应对策略

## 支付结果确认的三条路径

支付结果的确认不能依赖单一通道，任何单一路径都有失败可能，必须多路径互为兜底。

| 路径 | 机制 | 适用场景 | 失败可能 |
|------|------|----------|----------|
| 路径一：同步响应 | 用户扫码 -> 服务端调渠道 -> 渠道同步返回 | 仅当面付条码支付（付款码被扫） | 网络超时拿不到结果 |
| 路径二：异步通知 | 渠道通过 notify_url 主动推送支付结果 | 几乎所有线上支付（最常见） | 服务端宕机、网络丢包、渠道漏推 |
| 路径三：主动查询 | 服务端定时轮询渠道订单状态接口 | 回调丢失/延迟时的兜底确认 | 渠道限流、查询间隔内状态未更新 |

**渠道是唯一的 Source of Truth。** 结果确认优先级：通知 > 查询 > 同步。无论通过哪条路径拿到结果，都以渠道返回的实际状态为准。客户端展示的状态仅作为用户提示，不作为业务判定依据。

## 弱网/断网支付处理

### 客户端场景

**场景一：下单请求超时（未到达服务端）** -- 客户端使用预生成的幂等键重试，服务端根据幂等键返回已有订单而非创建新订单。重试上限 3 次，超过后查询订单列表。

```
伪代码 - 客户端下单重试：

function createOrder(params):
    idempotency_key = generateUUID()  // 预生成，重试时复用
    for attempt in 1..MAX_RETRY:
        try:
            return http.post("/api/orders", params,
                headers: {"Idempotency-Key": idempotency_key}, timeout: 10s)
        catch TimeoutError:
            if attempt == MAX_RETRY:
                return queryOrderByIdempotencyKey(idempotency_key)
            sleep(exponentialBackoff(attempt))
```

**场景二：下单成功但响应丢失** -- 客户端用同一幂等键重试即可，服务端返回已有订单。

**场景三：支付过程中断网** -- 支付行为发生在渠道侧，断网不影响已发起的支付。网络恢复后客户端查询服务端订单状态，服务端若未收到回调则由补单任务查询渠道。

**场景四：回调页面加载失败** -- 前端在支付结果页启动轮询（2s -> 3s -> 5s -> 10s），最长 2 分钟。超时后展示"支付处理中，请稍后查看订单"。

### 服务端场景

**调渠道下单超时** -- 不能假设下单失败（渠道可能已受理）。先查询渠道订单是否已创建；已创建则正常返回；未创建则用相同商户订单号重新下单（渠道做幂等处理）。

**收不到回调通知** -- 补单任务定时扫描"支付中"状态的订单，主动查询渠道。渠道侧也会重试通知（支付宝最多 24 小时内重试若干次）。

**数据库写入失败** -- 将支付结果写入消息队列异步重试；向渠道返回失败响应触发渠道重新通知；补单任务兜底。

### 移动端特殊处理

- **网络监听**：iOS 用 `NWPathMonitor`，Android 用 `ConnectivityManager` + `NetworkCallback`，网络恢复时自动查询待处理订单
- **APP 被杀**：iOS 在 `sceneDidBecomeActive`、Android 在 `onResume` 中检查本地持久化的"进行中订单 ID"并查询服务端
- **从支付渠道 APP 返回**：**绝对不能信任客户端回调结果**，客户端回调仅表示"用户完成了操作"。必须查询服务端，服务端以渠道查询结果为准

## 订单补单机制

补单是支付系统的最后一道防线，确保所有"支付中"的订单最终都能得到明确结果。

### 定时补单任务设计

```
伪代码 - 补单任务核心逻辑：

function compensationJob():
    pendingOrders = db.query(COMPENSATION_SQL)  // 见下方 SQL
    for order in pendingOrders:
        result = channel.queryOrder(order.channel_order_no)
        switch result.status:
            'SUCCESS'   -> updateOrderStatus(order.id, 'PAID', result)
                           triggerDownstreamBusiness(order)
            'CLOSED'    -> updateOrderStatus(order.id, 'CLOSED')
            'PAYING'    -> incrementCompensationCount(order.id)
            'NOT_FOUND' -> updateOrderStatus(order.id, 'CLOSED')
```

### PostgreSQL 补单 SQL

```sql
-- 补单扫描
SELECT id, order_no, channel, channel_order_no, amount,
       created_at, compensation_count
FROM payment_orders
WHERE status = 'PAYING'
  AND created_at < now() - interval '5 minutes'
  AND created_at > now() - interval '24 hours'  -- 超 24h 走人工
  AND compensation_count < 10
ORDER BY created_at ASC
LIMIT 100
FOR UPDATE SKIP LOCKED;  -- 跳过已被其他实例锁定的行

-- 更新订单状态（带状态前置条件防并发覆盖）
UPDATE payment_orders
SET status = 'PAID', channel_status = 'SUCCESS',
    paid_at = :channel_paid_at, updated_at = now(),
    compensation_count = compensation_count + 1
WHERE id = :order_id AND status = 'PAYING';
```

### 调度频率与升级策略

| 补单阶段 | 时间范围 | 扫描频率 |
|----------|----------|----------|
| 第一阶段 | 5 分钟 ~ 30 分钟 | 每 1 分钟 |
| 第二阶段 | 30 分钟 ~ 2 小时 | 每 5 分钟 |
| 第三阶段 | 2 小时 ~ 24 小时 | 每 30 分钟 |
| 超过 24 小时 | > 24 小时 | 停止自动补单，告警 + 人工介入 |

补单次数达上限（如 10 次）仍无明确结果：告警 -> 标记 `COMPENSATION_FAILED` -> 人工处理队列。

### 补单与关单的竞态处理

竞态场景：T1 补单查渠道返回 PAYING -> T2 用户完成支付 -> T3 补单基于 T1 结果关单 -> 已支付订单被错误关闭。

解决方案：**关单前再查一次渠道**，且用数据库状态条件保证原子性：

```
伪代码 - 安全关单：

function safeCloseOrder(order):
    latestResult = channel.queryOrder(order.channel_order_no)
    if latestResult.status == 'SUCCESS':
        updateOrderStatus(order.id, 'PAID', latestResult)
        return
    // 状态条件防止并发覆盖
    affected = db.execute("UPDATE payment_orders SET status='CLOSED'
                           WHERE id=:id AND status='PAYING'")
    if affected == 0:
        log.warn("关单失败，订单状态已被其他线程变更: " + order.id)
```

## 幂等重试策略

### 指数退避 + 随机抖动

避免大量客户端在同一时刻集中重试（惊群效应）：

```
伪代码 - 指数退避重试：

function retryWithBackoff(operation, config):
    base_delay = config.base_delay      // 如 1s
    max_delay  = config.max_delay       // 如 60s
    start_time = now()

    for attempt in 0..config.max_attempts-1:
        try:
            return operation()
        catch error:
            if not isRetryable(error):
                throw error
            if now() - start_time > config.max_total_time:
                throw TimeoutError("重试总时间超限")
            delay = min(base_delay * (2 ^ attempt), max_delay)
            jitter = random(0, base_delay)
            sleep(delay + jitter)

    throw MaxRetryError("超过最大重试次数")
```

退避序列示例（base_delay = 1s）：1~2s -> 2~3s -> 4~5s -> 8~9s -> 16~17s

重试预算（双重限制，任一达到即停止）：次数上限（如 5 次）+ 时间上限（如 120 秒）。

### 可重试 vs 不可重试错误

| 类别 | 错误示例 | 处理方式 |
|------|----------|----------|
| **可重试** | 网络超时、TCP 连接失败、HTTP 5xx/408/429、SYSTEM_ERROR | 指数退避重试 |
| **不可重试** | HTTP 4xx、SIGN_ERROR、INVALID_PARAM、INSUFFICIENT_FUND、ORDER_CLOSED | 立即失败 |
| **需确认** | 调用超时（不确定渠道是否已处理） | 先查询渠道再决定 |

关键判断逻辑：

```
伪代码 - 错误分类：

function isRetryable(error):
    if error is NetworkTimeout or ConnectionRefused or DNSError:
        return true
    if error.httpStatus >= 500 or error.httpStatus in [408, 429]:
        return true
    if error.httpStatus >= 400 and error.httpStatus < 500:
        return false
    if error.code in ['SYSTEM_ERROR', 'SERVICE_UNAVAILABLE']:
        return true
    if error.code in ['SIGN_ERROR', 'INVALID_PARAM', 'INSUFFICIENT_FUND',
                       'ORDER_CLOSED', 'ORDER_PAID']:
        return false
    return false  // 未知错误默认不重试（保守策略）
```

### 熔断器模式

状态机：`CLOSED（正常）--连续失败 N 次--> OPEN（熔断）--冷却期后--> HALF_OPEN（探测）--成功--> CLOSED / --失败--> OPEN`

核心参数：failure_threshold = 5（连续失败 5 次触发）、cooldown_period = 30s、HALF_OPEN 仅允许少量探测请求。

```
伪代码 - 熔断器核心逻辑：

class CircuitBreaker:
    state = CLOSED, failure_count = 0, last_failure_time = null

    function execute(operation):
        if state == OPEN:
            if now() - last_failure_time > cooldown_period:
                state = HALF_OPEN
            else:
                throw CircuitOpenError("渠道熔断中")
        try:
            result = operation()
            failure_count = 0; state = CLOSED
            return result
        catch error:
            failure_count += 1; last_failure_time = now()
            if failure_count >= failure_threshold:
                state = OPEN
            throw error
```

**渠道级别熔断**：每个支付渠道独立熔断器。主渠道 OPEN 时自动路由到备用渠道；所有渠道都 OPEN 时进入降级策略（排队/稍后重试/人工）。

### 幂等键在重试中的作用

幂等键保证同一笔支付请求无论重试多少次，渠道只会创建一笔订单：
- 支付宝/微信支付：`out_trade_no`（商户订单号）天然幂等，相同订单号重复下单返回已有订单
- 服务端：使用 `Idempotency-Key` 请求头或数据库唯一约束

## 离线缓存与消息队列

### 客户端离线缓存

弱网时将支付请求存入本地（SQLite / MMKV），网络恢复后按创建时间顺序自动提交，复用预生成的幂等键。

```
伪代码 - 客户端离线队列：

class OfflinePaymentQueue:
    function submitPayment(params):
        if networkAvailable():
            return sendToServer(params)
        queueId = storage.insert({
            params: params, idempotency_key: generateUUID(),
            created_at: now(), status: 'PENDING'
        })
        registerNetworkRecoveryCallback()
        return { status: 'QUEUED', queueId: queueId }

    function onNetworkRecovered():
        pendingItems = storage.query("status='PENDING' ORDER BY created_at")
        for item in pendingItems:
            if now() - item.created_at > 30min:
                storage.update(item.id, status: 'EXPIRED')  // 过期作废
                continue
            try:
                sendToServer(item.params, item.idempotency_key)
                storage.update(item.id, status: 'SUBMITTED')
            catch:
                break  // 保持顺序性，前一个失败则后续暂不提交
```

**必须设过期时间**（如 30 分钟），避免用户意图已变仍自动提交。

### 服务端消息队列

支付结果处理涉及多个下游系统（订单、库存、积分、通知），使用 MQ 解耦：

```
渠道回调 -> 支付服务（更新订单状态）-> MQ -> 订单服务 / 库存服务 / 通知服务
```

**At-least-once + 消费端幂等**：消息可能被重复投递，消费端必须做幂等处理：

```
伪代码 - 幂等消费：

function handlePaymentMessage(message):
    payment_id = message.payment_id
    if redis.setnx("processed:" + payment_id, "1", expire=24h):
        processBusinessLogic(message)  // 首次处理
    else:
        log.info("重复消息，跳过: " + payment_id)
    ackMessage(message)
```

**死信队列（DLQ）**：消费失败的消息进入重试队列（最多 3 次），仍失败则转入死信队列，告警 + 人工处理。死信消息需记录完整上下文（原始消息体、失败原因、重试次数）。

**事务性发件箱（Transactional Outbox）**：将消息写入同一数据库事务的 outbox 表，由独立进程投递到 MQ，避免"数据库已更新但消息发送失败"的不一致。

## 最终一致性保证

### 三方状态一致性模型

```
客户端状态              服务端状态              渠道状态
（展示给用户看）        （业务判断依据）        （Source of Truth）

可能的不一致：
  客户端"支付成功" + 服务端"PAYING" + 渠道"SUCCESS"  -> 服务端未同步
  客户端"支付失败" + 服务端"PAYING" + 渠道"SUCCESS"  -> 客户端超时误判
```

核心原则：**渠道是 Source of Truth**，所有业务判定以查询渠道的实际状态为准。

### 最终一致性的三重保障

| 保障层级 | 机制 | 时效 | 覆盖率 |
|----------|------|------|--------|
| 第一重 | 异步通知（渠道主动推送） | 秒级 | 95%+ |
| 第二重 | 补单任务（服务端主动查询） | 分钟级 | 通知遗漏的订单 |
| 第三重 | 日终对账（全量核对） | 天级 | 所有异常（最终防线） |

### 补偿事务（Saga 模式）

支付成功但后续业务步骤失败时，逆序执行补偿：

```
正向：支付成功 -> 创建订单 -> 扣减库存 -> 发放权益
补偿：发放权益失败 -> 回滚库存 -> 取消订单 -> 发起退款
```

每个步骤注册 forward 和 compensate 操作。某步失败时逆序执行已完成步骤的 compensate。补偿也失败则告警 + 人工介入。

### 状态不一致排查 Checklist

1. **查渠道**：调渠道订单查询接口，确认渠道侧真实状态
2. **查回调**：检查服务端是否收到过渠道回调通知（查日志/消息记录）
3. **查补单**：检查补单任务是否扫描过该订单（查补单日志和 compensation_count）
4. **查时序**：对比渠道支付时间、回调时间、本地更新时间，找到断点
5. **查并发**：检查是否存在回调与补单的并发竞争（同时更新同一订单）
6. **查下游**：支付状态正确但业务异常时，检查 MQ 消费情况
7. **查对账**：查看最近一次对账结果，确认是否已标记为差异

## 支付结果轮询 vs 回调

### 对比表

| 维度 | 异步通知（回调） | 主动查询（轮询） |
|------|-----------------|-----------------|
| 时效性 | 秒级 | 取决于轮询间隔 |
| 可靠性 | 不保证 100%（网络问题、服务端宕机） | 可控（主动发起） |
| 资源消耗 | 低（被动接收） | 高（主动请求） |
| 实现复杂度 | 中（需验签、幂等处理） | 低（查询接口简单） |
| 对渠道压力 | 无（渠道主动推） | 有（频繁查询可能被限流） |
| 推荐用法 | **主路径** | **兜底路径** |

### 推荐混合方案

回调为主 + 轮询为辅。正常情况走异步通知；超过 N 秒未收到通知时启动轮询兜底；轮询也超时则由补单任务接管。

### 轮询策略：递增间隔

```
伪代码 - 前端支付结果轮询：

function pollPaymentResult(orderId):
    intervals = [5s, 10s, 30s, 60s, 300s]
    maxPollTime = orderTimeout  // 最长轮询 = 订单超时时间
    startTime = now()
    idx = 0

    while now() - startTime < maxPollTime:
        result = api.queryOrderStatus(orderId)
        if result.status in ['PAID', 'CLOSED', 'FAILED']:
            return result
        delay = intervals[min(idx, len(intervals) - 1)]
        sleep(delay)
        idx += 1

    showPending("支付处理中，请稍后在订单列表查看结果")
```

设计原理：大部分支付在 30 秒内完成，前期密集（5s, 10s）快速获取结果；长时间未完成的降低频率（60s, 300s）减少资源消耗。

## 常见陷阱

1. **信任客户端回调结果**：从支付渠道 APP 返回商户 APP 时，客户端回调参数（如 resultCode）仅表示用户操作完成，不代表支付成功。有用户利用伪造回调薅羊毛的线上案例。**必须查询服务端**，服务端以渠道查询结果为准。

2. **补单任务不做幂等处理**：补单任务和异步通知可能同时到达，导致重复更新状态、重复发货。所有状态更新必须带前置条件（`WHERE status = 'PAYING'`），所有下游触发必须做幂等校验。

3. **关单前不查渠道**：补单发现订单超时后直接关单，可能关掉用户已支付成功的订单。正确做法：关单前必须查询渠道确认未支付。

4. **重试不区分错误类型**：对所有错误统一重试，导致签名错误、参数错误等不可恢复错误被反复重试，浪费资源且可能触发渠道风控。

5. **熔断恢复后全量放行**：HALF_OPEN 时一次性放行所有积压请求，导致渠道再次过载。正确做法：HALF_OPEN 只允许少量探测请求，确认恢复后逐步放量。

6. **离线缓存无过期机制**：弱网时缓存的支付请求，数小时后网络恢复自动提交，但用户意图可能已变（商品下架、价格变更）。必须设合理过期时间（如 30 分钟）。

7. **消息队列消费失败无限重试**：消费端异常导致消息反复重投，形成"毒丸消息"阻塞队列。必须设最大重试次数，超过后转入死信队列。

8. **轮询间隔固定不变**：以固定间隔（如每 2 秒）轮询支付结果，长时间未完成的订单造成不必要的服务端压力。应使用递增间隔策略。

9. **忽略数据库与 MQ 的一致性**：先更新 DB 再发消息，发消息失败则 DB 已更新但下游未通知。应使用事务性发件箱（Transactional Outbox）模式。

## 组合提示

与 `payment-common`（支付基础概念与订单状态机）、`payment-security`（回调验签与防篡改）、`payment-reconciliation`（日终对账与差异处理）、`payment-gateway`（支付网关路由与渠道管理）搭配使用。补单机制依赖各渠道的订单查询 API，具体接口参考 `alipay-apis`、`wechat-pay-apis`、`unionpay-apis`。
