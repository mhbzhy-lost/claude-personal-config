---
name: redis-pubsub
description: "Redis Pub/Sub 发布订阅、Streams 消费者组与消息队列选型对比"
tech_stack: [redis, backend]
---

# Redis 消息模型：Pub/Sub 与 Streams

> 来源：https://redis.io/docs/latest/develop/data-types/streams/ / https://redis.io/docs/latest/commands/xreadgroup/
> 版本基准：Redis 7.x

## 用途
掌握 Redis 的两种消息模型——轻量级 Pub/Sub 和持久化 Streams，理解消费者组、消息确认、背压处理，以及与 Celery/RabbitMQ/Kafka 的选型对比。

## 何时使用
- 实时事件广播（通知、聊天、在线状态）：Pub/Sub
- 可靠消息队列（任务分发、事件溯源）：Streams
- 多消费者组独立消费同一消息流：Streams
- 轻量级异步解耦，不想引入独立消息中间件
- 需要消息持久化和历史回放

## Pub/Sub（发布订阅）

### 核心概念

- **发布者**发送消息到 **Channel**（频道）
- **订阅者**监听一个或多个 Channel
- **即发即弃**：消息不持久化，订阅者断线期间的消息永久丢失
- 消息扇出（fan-out）：一条消息发送给所有订阅者

### redis-cli 示例

```bash
# 终端 1：订阅频道
SUBSCRIBE chat:room:1
# 等待消息...

# 终端 2：发布消息
PUBLISH chat:room:1 "Hello, World!"
# => (integer) 1  （表示 1 个订阅者收到）

# 模式订阅（通配符）
PSUBSCRIBE chat:room:*
# 匹配 chat:room:1、chat:room:2 等所有频道
```

### Python redis-py 示例

```python
import redis
import threading

r = redis.Redis(host="localhost", decode_responses=True)

# === 订阅者 ===
def subscriber():
    pubsub = r.pubsub()
    pubsub.subscribe("chat:room:1")
    # 也支持模式订阅
    # pubsub.psubscribe("chat:room:*")

    for message in pubsub.listen():
        if message["type"] == "message":
            print(f"[{message['channel']}] {message['data']}")
        # type 还可能是 subscribe/unsubscribe/pmessage 等

# 回调模式（更简洁）
def message_handler(message):
    print(f"Received: {message['data']}")

pubsub = r.pubsub()
pubsub.subscribe(**{"chat:room:1": message_handler})
thread = pubsub.run_in_thread(sleep_time=0.001)
# thread.stop()  # 停止订阅

# === 发布者 ===
num_received = r.publish("chat:room:1", "Hello!")
print(f"Message delivered to {num_received} subscribers")
```

### 异步 Pub/Sub

```python
import redis.asyncio as aioredis
import asyncio

async def async_subscriber():
    r = aioredis.from_url("redis://localhost", decode_responses=True)
    pubsub = r.pubsub()
    await pubsub.subscribe("events")

    async for message in pubsub.listen():
        if message["type"] == "message":
            print(f"Event: {message['data']}")
            if message["data"] == "SHUTDOWN":
                break

    await pubsub.aclose()
    await r.aclose()

async def async_publisher():
    r = aioredis.from_url("redis://localhost", decode_responses=True)
    await r.publish("events", "user_login")
    await r.publish("events", "order_created")
    await r.aclose()
```

### Pub/Sub 命令速查

| 命令 | 说明 |
|------|------|
| `SUBSCRIBE ch1 [ch2 ...]` | 订阅频道 |
| `UNSUBSCRIBE [ch1 ...]` | 取消订阅 |
| `PSUBSCRIBE pattern [...]` | 模式订阅 |
| `PUNSUBSCRIBE [pattern ...]` | 取消模式订阅 |
| `PUBLISH channel message` | 发布消息 |
| `PUBSUB CHANNELS [pattern]` | 列出活跃频道 |
| `PUBSUB NUMSUB [ch1 ...]` | 各频道订阅者数量 |

## Redis Streams

### 核心概念

- **持久化的追加日志**：消息写入后一直保留（直到显式删除或 MAXLEN 裁剪）
- **消息 ID**：`<毫秒时间戳>-<序列号>`，如 `1704067200000-0`，用 `*` 自动生成
- **消费者组**：多个消费者分摊消息处理，每条消息只被组内一个消费者处理
- **ACK 机制**：消费者处理完成后确认消息，未确认的消息可被重新投递
- **PEL（Pending Entries List）**：已投递但未确认的消息列表

### 基本操作

#### 写入消息（XADD）

```bash
# 自动生成 ID
XADD stream:orders * product "laptop" quantity 1 price 999.99
# => "1704067200000-0"

# 限制 Stream 长度（近似裁剪）
XADD stream:orders MAXLEN ~ 10000 * product "phone" quantity 2
# ~ 表示近似裁剪（性能更好），精确裁剪去掉 ~

# 指定 ID（一般不推荐）
XADD stream:orders 1704067200001-0 product "tablet" quantity 1
```

```python
# 写入消息
msg_id = r.xadd("stream:orders", {
    "product": "laptop",
    "quantity": 1,
    "price": 999.99,
})
# => "1704067200000-0"

# 带长度限制
msg_id = r.xadd("stream:orders", {"product": "phone"}, maxlen=10000, approximate=True)
```

#### 读取消息（XREAD / XRANGE）

```bash
# 从头读取（最多 10 条）
XRANGE stream:orders - + COUNT 10

# 从指定 ID 之后读取
XRANGE stream:orders 1704067200000-0 +

# 阻塞读取新消息（类似 BLPOP）
XREAD COUNT 10 BLOCK 5000 STREAMS stream:orders $
# $ 表示只读取新产生的消息，BLOCK 5000 阻塞最多 5 秒
```

```python
# 范围读取
messages = r.xrange("stream:orders", min="-", max="+", count=10)
# => [("1704067200000-0", {"product": "laptop", "quantity": "1", "price": "999.99"}), ...]

# 阻塞读取
messages = r.xread({"stream:orders": "$"}, count=10, block=5000)
# 返回 [["stream:orders", [("id", {"field": "value"})]]]
```

### 消费者组（Consumer Group）

消费者组是 Streams 的核心特性，实现了消息的负载均衡分发。

#### 创建消费者组

```bash
# 从头开始消费所有消息
XGROUP CREATE stream:orders group:processors 0

# 只消费新消息
XGROUP CREATE stream:orders group:processors $ MKSTREAM
# MKSTREAM：如果 Stream 不存在则自动创建
```

```python
# 创建消费者组
r.xgroup_create("stream:orders", "group:processors", id="0", mkstream=True)
```

#### 消费者读取（XREADGROUP）

```bash
# consumer-1 读取新消息
XREADGROUP GROUP group:processors consumer-1 COUNT 5 BLOCK 2000 STREAMS stream:orders >
# > 表示只获取从未投递给本消费者的新消息

# 读取之前投递但未 ACK 的消息（用于故障恢复）
XREADGROUP GROUP group:processors consumer-1 COUNT 5 STREAMS stream:orders 0
# 0 表示从 PEL 中获取未确认的消息
```

```python
# 读取新消息
messages = r.xreadgroup(
    groupname="group:processors",
    consumername="consumer-1",
    streams={"stream:orders": ">"},
    count=5,
    block=2000,
)

# 读取未确认的消息（PEL）
pending = r.xreadgroup(
    groupname="group:processors",
    consumername="consumer-1",
    streams={"stream:orders": "0"},
    count=10,
)
```

#### 确认消息（XACK）

```bash
XACK stream:orders group:processors 1704067200000-0
```

```python
r.xack("stream:orders", "group:processors", "1704067200000-0")
```

#### 完整消费者示例

```python
import redis
import signal
import time

r = redis.Redis(host="localhost", decode_responses=True)

# 确保消费者组存在
try:
    r.xgroup_create("stream:orders", "order_processors", id="0", mkstream=True)
except redis.ResponseError as e:
    if "BUSYGROUP" not in str(e):  # 组已存在不算错误
        raise

def consumer_loop(consumer_name: str):
    """消费者主循环"""
    running = True

    def stop(signum, frame):
        nonlocal running
        running = False
    signal.signal(signal.SIGTERM, stop)

    while running:
        try:
            # 1. 先处理 PEL 中未确认的消息（故障恢复）
            pending = r.xreadgroup(
                "order_processors", consumer_name,
                {"stream:orders": "0"}, count=10
            )
            if pending and pending[0][1]:
                for msg_id, fields in pending[0][1]:
                    process_order(msg_id, fields)
                    r.xack("stream:orders", "order_processors", msg_id)

            # 2. 读取新消息
            messages = r.xreadgroup(
                "order_processors", consumer_name,
                {"stream:orders": ">"}, count=10, block=2000
            )
            if messages:
                for msg_id, fields in messages[0][1]:
                    process_order(msg_id, fields)
                    r.xack("stream:orders", "order_processors", msg_id)

        except redis.ConnectionError:
            time.sleep(1)  # 连接断开，等待重连

def process_order(msg_id, fields):
    print(f"Processing {msg_id}: {fields}")
```

### 消息管理命令

| 命令 | 说明 |
|------|------|
| `XADD key [MAXLEN\|MINID] * field value ...` | 追加消息 |
| `XREAD [COUNT n] [BLOCK ms] STREAMS key ... id ...` | 独立读取 |
| `XRANGE key start end [COUNT n]` | 正序范围查询 |
| `XREVRANGE key end start [COUNT n]` | 逆序范围查询 |
| `XLEN key` | Stream 消息总数 |
| `XINFO STREAM key` | Stream 详细信息 |
| `XINFO GROUPS key` | 消费者组信息 |
| `XINFO CONSUMERS key group` | 消费者详情 |
| `XGROUP CREATE key group id [MKSTREAM]` | 创建消费者组 |
| `XREADGROUP GROUP group consumer ...` | 组内消费 |
| `XACK key group id [id ...]` | 确认消息 |
| `XPENDING key group [start end count]` | 查看未确认消息 |
| `XCLAIM key group consumer min-idle id ...` | 转移消息所有权 |
| `XAUTOCLAIM key group consumer min-idle start [COUNT n]` | 自动认领超时消息 |
| `XDEL key id [id ...]` | 删除消息 |
| `XTRIM key MAXLEN\|MINID [~] threshold` | 裁剪 Stream |

### 死信与超时认领

```python
def claim_stale_messages(group, consumer, stream, min_idle_ms=60000):
    """认领超时未确认的消息（死信处理）"""
    # XAUTOCLAIM：自动认领空闲超过 min_idle_ms 的消息
    result = r.xautoclaim(
        stream, group, consumer,
        min_idle_time=min_idle_ms,
        start_id="0",
        count=10,
    )
    # result: (next_start_id, [(msg_id, fields), ...], [deleted_ids])
    next_id, messages, deleted = result
    for msg_id, fields in messages:
        print(f"Claimed stale message: {msg_id}")
        process_order(msg_id, fields)
        r.xack(stream, group, msg_id)
```

## Pub/Sub vs Streams 选型

| 特性 | Pub/Sub | Streams |
|------|---------|---------|
| 消息持久化 | 否 | 是 |
| 消费者离线后获取消息 | 不可能 | 可以（从指定 ID 继续） |
| 消费者负载均衡 | 不支持（广播） | 消费者组自动分发 |
| 消息确认 | 无 | XACK 确认机制 |
| 消息回放/历史 | 不支持 | XRANGE 范围查询 |
| 背压控制 | 无（可能 OOM） | MAXLEN 裁剪 |
| 适用场景 | 实时通知、聊天 | 任务队列、事件溯源 |
| 性能 | 极高（fire-and-forget） | 高（略低于 Pub/Sub） |

## 与 Celery / RabbitMQ / Kafka 对比

| 特性 | Redis Streams | Celery (Redis Backend) | RabbitMQ | Kafka |
|------|--------------|----------------------|----------|-------|
| 部署复杂度 | 低（Redis 内置） | 中 | 高 | 高 |
| 消息持久化 | RDB/AOF | 依赖 Backend | 磁盘 | 磁盘 |
| 吞吐量 | 高（10 万+/秒） | 中 | 高 | 极高（百万/秒） |
| 消费者组 | 原生支持 | Worker 模式 | 原生 | 原生 |
| 消息顺序保证 | 单 Stream 严格有序 | 不保证 | 队列内有序 | 分区内有序 |
| 延迟任务 | 不原生支持 | 原生支持 | 插件支持 | 不原生 |
| 死信队列 | 手动实现（XCLAIM） | 内置重试 | 原生 DLX | 原生 DLT |
| 适用规模 | 中小规模 | 中小规模 | 中大规模 | 大规模 |

**选型建议：**
- **已有 Redis 且消息量不大**：直接用 Streams，避免引入新组件
- **需要定时/延迟任务**：Celery（以 Redis 为 broker/backend）
- **需要复杂路由和 DLX**：RabbitMQ
- **海量日志/事件流（>10 万/秒持续）**：Kafka

## 常见陷阱

- **Pub/Sub 消息丢失**：客户端断线重连期间的所有消息永久丢失，不适合需要可靠投递的场景
- **Pub/Sub 输出缓冲区溢出**：慢消费者会导致 Redis 的 client output buffer 增长，可能触发断开连接；需配置 `client-output-buffer-limit pubsub 256mb 128mb 60`
- **Streams MAXLEN 必须设置**：不设限的 Stream 会无限增长消耗内存，生产环境必须设置 `MAXLEN ~ N` 或 `MINID`
- **XREADGROUP BLOCK 0 导致连接独占**：阻塞读取会占用连接直到有消息，务必使用独立连接或设置合理超时
- **消费者组不会自动删除消费者**：离线消费者永远留在组内，它们的 PEL 不会自动清理，需要定期用 `XINFO CONSUMERS` 检查并用 `XGROUP DELCONSUMER` 清理
- **ACK 遗漏导致 PEL 膨胀**：消费者处理消息后忘记 XACK，PEL 会持续增长消耗内存
- **XAUTOCLAIM 的 min-idle 不宜太短**：设太短（如 1 秒）会导致正在处理中的消息被其他消费者抢走，引发重复处理

## 组合提示

- 搭配 **redis-core** skill 了解键空间通知（另一种事件机制）
- 搭配 **redis-python** skill 了解异步客户端的 Pub/Sub 和 Streams 用法
- 搭配 **redis-patterns** skill 了解缓存失效事件广播模式
- 搭配 **redis-cluster** skill 了解 Pub/Sub 在 Cluster 模式下的行为（消息广播到所有节点）
