---
name: kafka-python
description: "confluent-kafka-python 客户端：Producer/Consumer/AdminClient/序列化与 Schema Registry"
tech_stack: [kafka, backend]
language: [python]
capability: [message-queue]
---

# Kafka Python 客户端

> 来源：https://docs.confluent.io/platform/current/clients/confluent-kafka-python/html/index.html
> 版本基准：confluent-kafka 2.x（基于 librdkafka）

## 用途

使用 Python 与 Kafka 集群交互：生产消息、消费消息、管理 Topic，以及通过 Schema Registry 实现结构化序列化。

## 何时使用

- Python 服务需要向 Kafka 发送或消费事件
- 需要通过代码管理 Topic（创建、删除、查询）
- 需要 Avro/JSON Schema/Protobuf 序列化 + Schema Registry
- 构建 consume-transform-produce 数据管道

## 安装

```bash
pip install confluent-kafka
# 含 Avro/JSON/Protobuf 序列化支持
pip install confluent-kafka[avro,json,protobuf]
# Schema Registry 客户端
pip install confluent-kafka[schemaregistry]
```

## Producer（生产者）

### 基础用法

```python
from confluent_kafka import Producer

conf = {
    'bootstrap.servers': 'localhost:9092',
    'client.id': 'order-producer',
}

producer = Producer(conf)


def delivery_callback(err, msg):
    """每条消息投递后的回调（成功或失败）"""
    if err is not None:
        print(f'投递失败: {err}')
    else:
        print(f'投递成功: {msg.topic()}[{msg.partition()}] @ offset {msg.offset()}')


# 异步发送（默认模式，高吞吐）
producer.produce(
    topic='orders',
    key='user-123',           # 字符串会自动编码为 bytes
    value='{"orderId": "001", "amount": 99.9}',
    headers={'trace-id': 'abc-123'},  # 可选 Headers
    callback=delivery_callback,
)

# poll() 触发回调，参数为最大等待秒数
producer.poll(0)

# 同步等待所有消息发送完成
producer.flush(timeout=10)
```

### 幂等 Producer

```python
idempotent_conf = {
    'bootstrap.servers': 'localhost:9092',
    'enable.idempotence': True,  # 自动设置 acks=all, retries=MAX
    # 以下参数自动调整，无需手动设置：
    # 'acks': 'all',
    # 'max.in.flight.requests.per.connection': 5,
    # 'retries': 2147483647,
}
producer = Producer(idempotent_conf)
```

### 关键配置

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `acks` | `all` | `0`=不等待, `1`=Leader 确认, `all`=ISR 全部确认 |
| `retries` | `2147483647` | 重试次数 |
| `linger.ms` | `5` | 批量等待时间（ms） |
| `batch.size` | `1000000` | 批量大小（bytes） |
| `compression.type` | `none` | `gzip` / `snappy` / `lz4` / `zstd` |
| `enable.idempotence` | `true` | 幂等投递（去重） |

## Consumer（消费者）

### 基础用法

```python
from confluent_kafka import Consumer, KafkaError

conf = {
    'bootstrap.servers': 'localhost:9092',
    'group.id': 'order-service',
    'auto.offset.reset': 'earliest',     # 新 Group 从头消费
    'enable.auto.commit': False,          # 手动提交 Offset
}

consumer = Consumer(conf)
consumer.subscribe(['orders'])

try:
    while True:
        msg = consumer.poll(timeout=1.0)  # 阻塞等待消息

        if msg is None:
            continue  # 超时无消息
        if msg.error():
            if msg.error().code() == KafkaError._PARTITION_EOF:
                print(f'到达分区末尾: {msg.topic()}[{msg.partition()}]')
                continue
            raise Exception(msg.error())

        # 处理消息
        print(f'Key: {msg.key()}, Value: {msg.value().decode("utf-8")}')
        print(f'Topic: {msg.topic()}, Partition: {msg.partition()}, Offset: {msg.offset()}')
        print(f'Timestamp: {msg.timestamp()}, Headers: {msg.headers()}')

        # 手动同步提交
        consumer.commit(asynchronous=False)
finally:
    consumer.close()  # 优雅关闭，触发 Rebalance
```

### 批量消费 + 批量提交

```python
from confluent_kafka import Consumer

consumer = Consumer({
    'bootstrap.servers': 'localhost:9092',
    'group.id': 'batch-processor',
    'auto.offset.reset': 'earliest',
    'enable.auto.commit': False,
})
consumer.subscribe(['events'])

try:
    while True:
        messages = consumer.consume(num_messages=100, timeout=5.0)
        if not messages:
            continue

        batch = []
        for msg in messages:
            if msg.error():
                print(f'Error: {msg.error()}')
                continue
            batch.append(msg.value().decode('utf-8'))

        # 批量处理
        process_batch(batch)

        # 提交整批最后一条消息的 Offset
        consumer.commit(asynchronous=False)
finally:
    consumer.close()
```

### 关键配置

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `group.id` | 必填 | Consumer Group 标识 |
| `auto.offset.reset` | `latest` | 无已提交 Offset 时从何处开始 |
| `enable.auto.commit` | `true` | 自动提交 Offset |
| `auto.commit.interval.ms` | `5000` | 自动提交间隔 |
| `session.timeout.ms` | `45000` | 会话超时（超时触发 Rebalance） |
| `max.poll.interval.ms` | `300000` | 两次 poll 最大间隔 |
| `fetch.max.bytes` | `52428800` | 单次 Fetch 最大字节数 |

## AdminClient（管理客户端）

```python
from confluent_kafka.admin import AdminClient, NewTopic

admin = AdminClient({'bootstrap.servers': 'localhost:9092'})

# 创建 Topic
new_topics = [
    NewTopic('orders', num_partitions=6, replication_factor=3),
    NewTopic('events', num_partitions=12, replication_factor=3,
             config={'retention.ms': '604800000'}),  # 7 天保留
]
futures = admin.create_topics(new_topics)
for topic, future in futures.items():
    try:
        future.result()  # 阻塞等待结果
        print(f'Topic {topic} 创建成功')
    except Exception as e:
        print(f'Topic {topic} 创建失败: {e}')

# 列出 Topic
metadata = admin.list_topics(timeout=10)
for topic in metadata.topics.values():
    print(f'{topic.topic}: {len(topic.partitions)} partitions')

# 删除 Topic
futures = admin.delete_topics(['orders'])
for topic, future in futures.items():
    try:
        future.result()
        print(f'Topic {topic} 删除成功')
    except Exception as e:
        print(f'Topic {topic} 删除失败: {e}')

# 查看 Topic 配置
from confluent_kafka.admin import ConfigResource
resource = ConfigResource('TOPIC', 'orders')
futures = admin.describe_configs([resource])
for res, future in futures.items():
    configs = future.result()
    for key, config in configs.items():
        print(f'{key} = {config.value}')
```

## 序列化与 Schema Registry

### JSON 序列化

```python
from confluent_kafka import SerializingProducer, DeserializingConsumer
from confluent_kafka.serialization import StringSerializer
from confluent_kafka.schema_registry import SchemaRegistryClient
from confluent_kafka.schema_registry.json_schema import JSONSerializer, JSONDeserializer

# Schema 定义
schema_str = """{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Order",
  "type": "object",
  "properties": {
    "order_id": {"type": "string"},
    "user_id": {"type": "string"},
    "amount": {"type": "number"}
  },
  "required": ["order_id", "user_id", "amount"]
}"""

schema_registry_conf = {'url': 'http://localhost:8081'}
schema_registry_client = SchemaRegistryClient(schema_registry_conf)

# --- Producer ---
json_serializer = JSONSerializer(schema_str, schema_registry_client)

producer = SerializingProducer({
    'bootstrap.servers': 'localhost:9092',
    'key.serializer': StringSerializer('utf_8'),
    'value.serializer': json_serializer,
})

order = {'order_id': 'ORD-001', 'user_id': 'USR-123', 'amount': 99.9}
producer.produce(topic='orders', key='USR-123', value=order)
producer.flush()

# --- Consumer ---
json_deserializer = JSONDeserializer(schema_str)

consumer = DeserializingConsumer({
    'bootstrap.servers': 'localhost:9092',
    'group.id': 'order-reader',
    'key.deserializer': StringDeserializer('utf_8'),
    'value.deserializer': json_deserializer,
    'auto.offset.reset': 'earliest',
})
consumer.subscribe(['orders'])

msg = consumer.poll(timeout=5.0)
if msg and not msg.error():
    order = msg.value()  # dict 类型
    print(f"Order: {order['order_id']}, Amount: {order['amount']}")
consumer.close()
```

### Avro 序列化

```python
from confluent_kafka.schema_registry.avro import AvroSerializer, AvroDeserializer

avro_schema_str = """{
  "type": "record",
  "name": "Order",
  "namespace": "com.example",
  "fields": [
    {"name": "order_id", "type": "string"},
    {"name": "user_id", "type": "string"},
    {"name": "amount", "type": "double"}
  ]
}"""

avro_serializer = AvroSerializer(schema_registry_client, avro_schema_str)
avro_deserializer = AvroDeserializer(schema_registry_client, avro_schema_str)

# 用法与 JSON 版相同，替换 serializer/deserializer 即可
```

### Protobuf 序列化

```python
from confluent_kafka.schema_registry.protobuf import ProtobufSerializer, ProtobufDeserializer
# 需要先用 protoc 编译 .proto 文件生成 Python 类
from order_pb2 import Order

protobuf_serializer = ProtobufSerializer(Order, schema_registry_client)
protobuf_deserializer = ProtobufDeserializer(Order)
```

## confluent-kafka vs kafka-python 对比

| 维度 | confluent-kafka | kafka-python |
|------|----------------|--------------|
| 底层实现 | librdkafka（C 库）封装 | 纯 Python |
| 性能 | 高吞吐、低延迟 | 较低（约 3-10x 差距） |
| 功能完整度 | 事务、AdminClient、Schema Registry | 基础生产消费 |
| 维护状态 | Confluent 官方活跃维护 | 2020-2024 长期停更后恢复 |
| 安装依赖 | 需要 librdkafka 二进制（pip 自动安装） | 纯 Python，无额外依赖 |
| AsyncIO | 支持（AIOProducer） | 不支持 |
| **推荐场景** | **生产环境首选** | 仅适合简单原型 |

## 常见陷阱

- **忘记调用 `flush()`**：Producer 是异步的，程序退出前必须 `flush()` 否则消息丢失
- **忘记调用 `poll()`**：不调用 `poll()` 则回调永远不会触发，内部缓冲区也无法释放，最终导致 `BufferError`
- **Consumer 不调 `close()`**：不优雅关闭会导致 Group 等到 `session.timeout.ms` 超时才触发 Rebalance
- **`msg.error()` 未检查**：`poll()` 返回的 msg 可能是错误事件（如 `_PARTITION_EOF`），不检查会导致 `msg.value()` 为 None
- **SerializingProducer 的 `produce()` 参数**：与 Producer 不同，不接受 `callback` 关键字参数，需用 `on_delivery` 参数
- **Schema 不兼容导致序列化失败**：Schema Registry 默认 `BACKWARD` 兼容性，新 Schema 必须能读取旧数据
- **`auto.offset.reset='latest'` 丢消息**：新 Group 默认从最新位置开始，启动前产生的消息不会被消费

## 组合提示

- 与 **kafka-core** 搭配：理解架构概念后使用客户端开发
- 与 **kafka-patterns** 搭配：选择合适的生产/消费模式并用 Python 实现
- 与 **kafka-operations** 搭配：通过 AdminClient 实现自动化运维
