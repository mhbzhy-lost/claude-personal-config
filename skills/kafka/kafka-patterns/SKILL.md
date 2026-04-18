---
name: kafka-patterns
description: "Kafka 生产者/消费者模式、投递语义、再平衡策略、事务性消息与死信队列"
tech_stack: [kafka, backend]
capability: [message-queue, stream-processing]
---

# Kafka 消息模式

> 来源：https://kafka.apache.org/documentation/ , https://developer.confluent.io/learn/kafka-transactions-and-guarantees/
> 版本基准：Apache Kafka 3.7+

## 用途

指导在不同业务场景下选择正确的生产/消费模式，实现期望的投递语义保证（at-most-once / at-least-once / exactly-once）。

## 何时使用

- 设计消息生产策略（同步/异步/批量/压缩）
- 选择合适的投递语义保证级别
- 实现消费者组的优雅再平衡
- 处理消费失败的消息（死信队列）
- 需要跨 Topic 的原子写入（事务）

## 生产者模式

### 同步发送

逐条发送并等待确认，延迟高但可靠性强。适合关键业务消息（如支付）。

```python
from confluent_kafka import Producer

producer = Producer({
    'bootstrap.servers': 'localhost:9092',
    'acks': 'all',
})

def sync_send(topic: str, key: str, value: str):
    """同步发送：阻塞直到 Broker 确认"""
    result = {}

    def on_delivery(err, msg):
        result['err'] = err
        result['msg'] = msg

    producer.produce(topic, key=key, value=value, callback=on_delivery)
    producer.flush(timeout=10)  # 阻塞等待

    if result.get('err'):
        raise Exception(f"发送失败: {result['err']}")
    return result['msg'].offset()
```

### 异步发送（推荐默认模式）

高吞吐，通过回调处理结果。适合大部分场景。

```python
import sys
from confluent_kafka import Producer

producer = Producer({
    'bootstrap.servers': 'localhost:9092',
    'acks': 'all',
    'linger.ms': 5,          # 等待 5ms 积攒批量
    'batch.size': 262144,    # 256KB 批量
})

failed_count = 0

def delivery_callback(err, msg):
    global failed_count
    if err:
        failed_count += 1
        # 记录失败消息，后续重试或写入 DLQ
        print(f'投递失败: {err}, topic={msg.topic()}, key={msg.key()}',
              file=sys.stderr)

for i in range(10000):
    producer.produce('events', key=f'key-{i}', value=f'value-{i}',
                     callback=delivery_callback)
    # 每迭代 poll 一次，处理回调 + 释放缓冲区
    producer.poll(0)

# 确保所有消息发送完成
producer.flush()
print(f'发送完成，失败 {failed_count} 条')
```

### 批量 + 压缩

适合日志采集、埋点数据等高吞吐场景。

```python
producer = Producer({
    'bootstrap.servers': 'localhost:9092',
    'acks': '1',              # Leader 确认即可（权衡持久性）
    'linger.ms': 100,         # 等待 100ms 积攒更大批量
    'batch.size': 1048576,    # 1MB 批量
    'compression.type': 'zstd',  # 最佳压缩比
    'buffer.memory': 67108864,   # 64MB 发送缓冲区
})
```

**压缩算法对比**：

| 算法 | 压缩比 | CPU 开销 | 适用场景 |
|------|--------|---------|---------|
| `none` | 1:1 | 无 | 低延迟优先 |
| `gzip` | 最高 | 高 | 带宽受限 |
| `snappy` | 中等 | 低 | 平衡选择 |
| `lz4` | 中等 | 最低 | CPU 敏感 |
| `zstd` | 高 | 中 | **推荐默认** |

## 消费者投递语义

### At-Most-Once（最多一次）

先提交 Offset，再处理消息。处理失败时消息丢失。

```python
from confluent_kafka import Consumer

consumer = Consumer({
    'bootstrap.servers': 'localhost:9092',
    'group.id': 'at-most-once-group',
    'enable.auto.commit': True,         # 自动提交
    'auto.commit.interval.ms': 1000,    # 1 秒提交一次
    'auto.offset.reset': 'latest',
})
consumer.subscribe(['events'])

while True:
    msg = consumer.poll(1.0)
    if msg is None or msg.error():
        continue
    # Offset 已被自动提交，处理失败不会重试
    try:
        process(msg)
    except Exception:
        pass  # 消息丢失
```

### At-Least-Once（至少一次，推荐默认模式）

先处理消息，再提交 Offset。处理失败时消息会重新投递。

```python
consumer = Consumer({
    'bootstrap.servers': 'localhost:9092',
    'group.id': 'at-least-once-group',
    'enable.auto.commit': False,        # 手动提交
    'auto.offset.reset': 'earliest',
})
consumer.subscribe(['orders'])

try:
    while True:
        msg = consumer.poll(1.0)
        if msg is None or msg.error():
            continue

        try:
            process(msg)  # 先处理
            consumer.commit(message=msg, asynchronous=False)  # 再提交
        except Exception as e:
            # 不提交，下次 poll 会重新获取该消息
            print(f'处理失败，将重试: {e}')
finally:
    consumer.close()
```

**关键要求**：下游处理逻辑必须**幂等**（相同消息处理多次结果不变）。

### Exactly-Once（精确一次）

通过事务 API 实现 consume-transform-produce 的原子性。

```python
from confluent_kafka import Consumer, Producer

# 事务 Producer
tx_producer = Producer({
    'bootstrap.servers': 'localhost:9092',
    'transactional.id': 'etl-transformer-001',  # 必须全局唯一
    'enable.idempotence': True,
})
tx_producer.init_transactions()

consumer = Consumer({
    'bootstrap.servers': 'localhost:9092',
    'group.id': 'exactly-once-group',
    'enable.auto.commit': False,
    'isolation.level': 'read_committed',  # 只读已提交的事务消息
})
consumer.subscribe(['raw-events'])

try:
    while True:
        msg = consumer.poll(1.0)
        if msg is None or msg.error():
            continue

        try:
            tx_producer.begin_transaction()

            # 转换并生产到目标 Topic
            transformed = transform(msg.value())
            tx_producer.produce('processed-events', value=transformed)

            # 将消费者 Offset 纳入事务
            tx_producer.send_offsets_to_transaction(
                consumer.position(consumer.assignment()),
                consumer.consumer_group_metadata(),
            )

            tx_producer.commit_transaction()
        except Exception as e:
            tx_producer.abort_transaction()
            print(f'事务回滚: {e}')
finally:
    consumer.close()
```

**投递语义对比**：

| 语义 | Offset 提交时机 | 消息丢失 | 消息重复 | 性能 | 适用场景 |
|------|----------------|---------|---------|------|---------|
| At-Most-Once | 处理前 | 可能 | 不会 | 最高 | 日志、指标 |
| At-Least-Once | 处理后 | 不会 | 可能 | 高 | **大部分场景** |
| Exactly-Once | 事务内 | 不会 | 不会 | 较低 | 金融、计费 |

## 分区分配策略

Consumer Group 内 Partition 的分配由 `partition.assignment.strategy` 控制：

| 策略 | 行为 | 优缺点 |
|------|------|--------|
| `RangeAssignor` | 按 Topic 维度范围分配 | 简单但可能不均匀 |
| `RoundRobinAssignor` | 跨 Topic 轮询分配 | 较均匀 |
| `StickyAssignor` | 尽量保持已有分配 | 减少 Rebalance 开销 |
| `CooperativeStickyAssignor` | **增量式 Rebalance** | **推荐**，避免 stop-the-world |

### 配置示例

```python
consumer = Consumer({
    'bootstrap.servers': 'localhost:9092',
    'group.id': 'my-group',
    'partition.assignment.strategy': 'cooperative-sticky',  # 推荐
})
```

### Rebalance 回调

```python
from confluent_kafka import Consumer, TopicPartition

def on_assign(consumer, partitions):
    """分区分配回调"""
    print(f'分配到分区: {[p.partition for p in partitions]}')

def on_revoke(consumer, partitions):
    """分区回收回调 — 在此提交已处理的 Offset"""
    print(f'回收分区: {[p.partition for p in partitions]}')
    consumer.commit(asynchronous=False)

def on_lost(consumer, partitions):
    """分区丢失回调（非正常回收，如 session 超时）"""
    print(f'丢失分区: {[p.partition for p in partitions]}')

consumer = Consumer({
    'bootstrap.servers': 'localhost:9092',
    'group.id': 'my-group',
    'partition.assignment.strategy': 'cooperative-sticky',
})

consumer.subscribe(
    ['orders'],
    on_assign=on_assign,
    on_revoke=on_revoke,
    on_lost=on_lost,
)
```

### 避免不必要的 Rebalance

```python
consumer = Consumer({
    'bootstrap.servers': 'localhost:9092',
    'group.id': 'my-group',
    'session.timeout.ms': 45000,        # 默认 45s
    'heartbeat.interval.ms': 3000,      # session.timeout 的 1/3
    'max.poll.interval.ms': 300000,     # 两次 poll 最大间隔
    'partition.assignment.strategy': 'cooperative-sticky',
    # 静态成员：重启不触发 Rebalance
    'group.instance.id': 'consumer-host-1',
})
```

## 死信队列（DLQ）

Kafka 没有原生 DLQ，需要应用层实现。

```python
from confluent_kafka import Consumer, Producer

MAX_RETRIES = 3

consumer = Consumer({
    'bootstrap.servers': 'localhost:9092',
    'group.id': 'order-processor',
    'enable.auto.commit': False,
})
consumer.subscribe(['orders'])

dlq_producer = Producer({'bootstrap.servers': 'localhost:9092'})

try:
    while True:
        msg = consumer.poll(1.0)
        if msg is None or msg.error():
            continue

        retry_count = 0
        headers = dict(msg.headers() or [])
        if b'retry-count' in headers:
            retry_count = int(headers[b'retry-count'])

        try:
            process_order(msg.value())
            consumer.commit(message=msg, asynchronous=False)
        except Exception as e:
            if retry_count < MAX_RETRIES:
                # 发送到重试 Topic（可配合延迟队列）
                dlq_producer.produce(
                    'orders.retry',
                    key=msg.key(),
                    value=msg.value(),
                    headers={'retry-count': str(retry_count + 1),
                             'error': str(e)},
                )
            else:
                # 超过重试次数，发送到死信队列
                dlq_producer.produce(
                    'orders.dlq',
                    key=msg.key(),
                    value=msg.value(),
                    headers={'original-topic': msg.topic(),
                             'error': str(e),
                             'retry-count': str(retry_count)},
                )
            dlq_producer.flush()
            consumer.commit(message=msg, asynchronous=False)
finally:
    consumer.close()
```

## 事务性消息（Transactional API）

### 核心概念

事务允许 Producer 将一组消息原子地写入多个 Topic/Partition，要么全部成功，要么全部回滚。

### 关键配置

**Producer 端**：
```python
{
    'bootstrap.servers': 'localhost:9092',
    'transactional.id': 'my-tx-app-001',   # 全局唯一，标识事务身份
    'enable.idempotence': True,             # 事务要求幂等
    'transaction.timeout.ms': 60000,        # 事务超时（默认 60s）
}
```

**Consumer 端**（读取事务消息）：
```python
{
    'bootstrap.servers': 'localhost:9092',
    'group.id': 'tx-reader',
    'isolation.level': 'read_committed',    # 只读已提交事务的消息
}
```

### 事务生命周期

```
init_transactions()        # 初始化（仅调用一次）
    ↓
begin_transaction()        # 开始事务
    ↓
produce() × N             # 发送消息（可跨多个 Topic）
    ↓
send_offsets_to_transaction()  # 将消费 Offset 纳入事务
    ↓
commit_transaction()       # 提交 —— 或 abort_transaction() 回滚
```

## 常见陷阱

- **幂等 Producer 不等于 Exactly-Once**：幂等只保证单分区内去重，跨分区需要事务
- **事务 ID 重复**：多个 Producer 使用相同 `transactional.id` 会导致旧实例被 Fence 掉
- **`isolation.level` 未设置**：默认 `read_uncommitted`，消费者能看到未提交的事务消息
- **Rebalance 期间丢消息**：使用 eager 策略时，`on_revoke` 中未及时提交 Offset 导致消息重复或丢失
- **`max.poll.interval.ms` 过短**：处理耗时超过此值会导致 Consumer 被踢出 Group 触发 Rebalance
- **DLQ 消息无上下文**：发送到 DLQ 时务必携带原始 Topic、Partition、Offset、错误原因等元数据
- **压缩类型不一致**：Producer 使用 zstd 但 Broker 版本 < 2.1 不支持，会导致消息无法写入

## 组合提示

- 与 **kafka-core** 搭配：理解 Partition/ISR/Offset 等底层概念
- 与 **kafka-python** 搭配：使用 confluent-kafka-python 实现各种模式
- 与 **kafka-operations** 搭配：调优生产者/消费者性能参数
- 与 **kafka-connect** 搭配：Connect 框架内置 DLQ 机制（`errors.deadletterqueue.topic.name`）
