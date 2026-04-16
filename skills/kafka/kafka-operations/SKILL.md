---
name: kafka-operations
description: "Kafka 集群部署配置、分区副本规划、消费 Lag 监控、性能调优与容量规划"
tech_stack: [kafka]
---

# Kafka 运维与调优

> 来源：https://kafka.apache.org/documentation/#operations , https://docs.confluent.io/platform/current/installation/configuration/broker-configs.html
> 版本基准：Apache Kafka 3.7+（KRaft 模式）

## 用途

指导 Kafka 集群的生产部署、关键参数配置、性能调优、监控告警和容量规划。

## 何时使用

- 部署新集群或扩容现有集群
- 配置 server.properties 关键参数
- 排查消费延迟（Consumer Lag）
- 优化吞吐量或降低延迟
- 进行容量评估和资源规划

## server.properties 关键参数

### Broker 核心配置

```properties
# === 基础 ===
node.id=1                                    # 节点 ID（KRaft 模式）
process.roles=broker,controller              # 角色：broker / controller / 两者
log.dirs=/data/kafka-logs                    # 日志存储目录（建议独立磁盘）

# === 网络 ===
listeners=PLAINTEXT://:9092,CONTROLLER://:9093
advertised.listeners=PLAINTEXT://kafka1.example.com:9092
num.network.threads=8                        # 网络线程数（默认 3）
num.io.threads=16                            # IO 线程数（默认 8）
socket.send.buffer.bytes=102400              # 发送缓冲区（默认 100KB）
socket.receive.buffer.bytes=102400           # 接收缓冲区
socket.request.max.bytes=104857600           # 单请求最大 100MB

# === Topic 默认值 ===
num.partitions=6                             # 默认分区数（默认 1）
default.replication.factor=3                 # 默认副本因子（默认 1）
min.insync.replicas=2                        # 最小同步副本数

# === 日志存储 ===
log.retention.hours=168                      # 保留时间 7 天（默认）
log.retention.bytes=-1                       # 按大小保留（-1 = 无限）
log.segment.bytes=1073741824                 # 日志段大小 1GB（默认）
log.cleanup.policy=delete                    # delete / compact / delete,compact

# === 副本 ===
replica.lag.time.max.ms=30000                # ISR 落后容忍时间（默认 30s）
unclean.leader.election.enable=false         # 禁止非 ISR 副本当选 Leader

# === KRaft ===
controller.quorum.voters=1@kafka1:9093,2@kafka2:9093,3@kafka3:9093
controller.listener.names=CONTROLLER
```

### 生产者关键参数

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `acks` | `all` | 生产环境必须 `all`（等价于 `-1`） |
| `enable.idempotence` | `true` | 幂等写入，防止网络重试导致重复 |
| `batch.size` | `262144` (256KB) | 批量大小，增大可提高吞吐 |
| `linger.ms` | `5-20` | 批量等待时间，0=立即发送 |
| `compression.type` | `zstd` | 压缩算法，zstd 压缩比最优 |
| `buffer.memory` | `67108864` (64MB) | Producer 缓冲区总大小 |
| `max.in.flight.requests.per.connection` | `5` | 幂等模式下最大值 5 |
| `retries` | `2147483647` | 最大重试次数 |
| `delivery.timeout.ms` | `120000` | 投递超时（含重试） |

### 消费者关键参数

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `fetch.min.bytes` | `1` | 最小拉取字节数（增大可提高吞吐） |
| `fetch.max.wait.ms` | `500` | 拉取最大等待时间 |
| `fetch.max.bytes` | `52428800` (50MB) | 单次拉取最大字节数 |
| `max.partition.fetch.bytes` | `1048576` (1MB) | 每分区拉取上限 |
| `max.poll.records` | `500` | 单次 poll 最大记录数 |
| `max.poll.interval.ms` | `300000` | 两次 poll 最大间隔 |
| `session.timeout.ms` | `45000` | 会话超时 |
| `heartbeat.interval.ms` | `3000` | 心跳间隔（session.timeout 的 1/3） |

## 分区数与副本数规划

### 分区数计算

```
目标分区数 = max(生产者目标吞吐 / 单分区写入吞吐, 消费者目标吞吐 / 单消费者处理吞吐)
```

| 场景 | 推荐分区数 | 说明 |
|------|-----------|------|
| 低流量服务间通信 | 3-6 | 预留扩展空间 |
| 中等流量业务 | 6-12 | Consumer 数不超过分区数 |
| 高吞吐日志/埋点 | 12-64 | 更多分区 = 更多并行度 |
| 超高吞吐（>1GB/s） | 64-256 | 需配合足够 Broker |

### 副本数选择

| 副本因子 | min.insync.replicas | 容忍故障数 | 适用场景 |
|----------|--------------------:|----------:|---------|
| 1 | 1 | 0 | 仅开发测试 |
| 2 | 1 | 1 | 非关键数据 |
| **3** | **2** | **1** | **生产标配** |
| 5 | 3 | 2 | 金融级高可靠 |

**黄金法则**：`replication.factor = 3` + `min.insync.replicas = 2` + `acks = all`

## Consumer Lag 监控

### CLI 监控

```bash
# 查看指定 Group 的 Lag
bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group order-service --describe

# 输出示例：
# GROUP          TOPIC     PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
# order-service  orders    0          15234           15240           6
# order-service  orders    1          18912           18912           0
# order-service  orders    2          17650           19230           1580

# 查看所有 Group
bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --all-groups --describe
```

### Python 监控脚本

```python
from confluent_kafka.admin import AdminClient
from confluent_kafka import Consumer, TopicPartition

admin = AdminClient({'bootstrap.servers': 'localhost:9092'})

def get_consumer_lag(group_id: str, topic: str) -> dict:
    """获取指定 Consumer Group 在指定 Topic 上的 Lag"""
    consumer = Consumer({
        'bootstrap.servers': 'localhost:9092',
        'group.id': f'{group_id}-lag-checker',
        'enable.auto.commit': False,
    })

    # 获取 Topic 分区列表
    metadata = admin.list_topics(topic, timeout=10)
    partitions = [
        TopicPartition(topic, p)
        for p in metadata.topics[topic].partitions.keys()
    ]

    # 获取已提交 Offset
    committed = consumer.committed(partitions, timeout=10)

    # 获取 Log End Offset
    for tp in partitions:
        tp.offset = -1  # OFFSET_END
    end_offsets = consumer.get_watermark_offsets(partitions[0])

    lag_info = {}
    for tp in committed:
        low, high = consumer.get_watermark_offsets(tp, timeout=10)
        current = tp.offset if tp.offset >= 0 else 0
        lag_info[tp.partition] = {
            'current_offset': current,
            'log_end_offset': high,
            'lag': high - current,
        }

    consumer.close()
    return lag_info

# 使用
lag = get_consumer_lag('order-service', 'orders')
for partition, info in lag.items():
    print(f"Partition {partition}: lag={info['lag']}")
    if info['lag'] > 10000:
        print(f"  [ALERT] 分区 {partition} Lag 超过 10000!")
```

### 关键监控指标

| 指标 | 来源 | 告警阈值建议 |
|------|------|-------------|
| Consumer Lag | `kafka-consumer-groups.sh` / JMX | > 10000 条 |
| UnderReplicatedPartitions | Broker JMX | > 0 |
| OfflinePartitionsCount | Controller JMX | > 0（紧急） |
| ActiveControllerCount | Broker JMX | 非 1（异常） |
| RequestHandlerAvgIdlePercent | Broker JMX | < 0.3（过载） |
| NetworkProcessorAvgIdlePercent | Broker JMX | < 0.3 |
| LogFlushRateAndTimeMs | Broker JMX | p99 > 100ms |
| ProduceRequestsPerSec | Broker JMX | 基线对比 |

### JMX 指标获取

```bash
# 启动 Broker 时开启 JMX
KAFKA_JMX_OPTS="-Dcom.sun.management.jmxremote \
  -Dcom.sun.management.jmxremote.port=9999 \
  -Dcom.sun.management.jmxremote.authenticate=false \
  -Dcom.sun.management.jmxremote.ssl=false" \
bin/kafka-server-start.sh config/kraft/server.properties
```

## 性能调优

### Producer 吞吐优化

```properties
# 高吞吐配置
acks=1                               # 权衡持久性换取吞吐
batch.size=524288                    # 512KB
linger.ms=50                         # 50ms 等待
compression.type=zstd                # 压缩
buffer.memory=134217728              # 128MB 缓冲
max.in.flight.requests.per.connection=5
```

### Producer 低延迟配置

```properties
# 低延迟配置
acks=1
batch.size=16384                     # 16KB（小批量）
linger.ms=0                          # 立即发送
compression.type=none                # 不压缩
```

### Consumer 吞吐优化

```properties
# 高吞吐配置
fetch.min.bytes=65536                # 64KB 最小拉取
fetch.max.wait.ms=500                # 最多等 500ms
max.poll.records=1000                # 每次 poll 更多记录
max.partition.fetch.bytes=2097152    # 2MB 每分区
```

### Broker 调优

```properties
# 网络与 IO
num.network.threads=8                # CPU 核数
num.io.threads=16                    # CPU 核数 x 2
socket.send.buffer.bytes=1048576     # 1MB
socket.receive.buffer.bytes=1048576  # 1MB

# 日志
log.flush.interval.messages=10000    # 每 10000 条刷盘
log.flush.interval.ms=1000           # 每 1s 刷盘

# 副本
num.replica.fetchers=4               # 副本拉取线程数
replica.fetch.max.bytes=10485760     # 10MB
```

### 吞吐对比基准

| 配置 | 单 Broker 写入吞吐 | 延迟 (p99) |
|------|-------------------|-----------|
| acks=0, 无压缩 | ~800 MB/s | < 5ms |
| acks=1, snappy | ~500 MB/s | < 10ms |
| acks=all, zstd | ~300 MB/s | < 30ms |
| acks=all, zstd, 事务 | ~150 MB/s | < 50ms |

*基准：3 Broker，3 副本，SSD 磁盘，万兆网卡*

## 容量规划

### 存储计算

```
单日存储量 = 消息大小(avg) x 消息数/天 x 副本因子 x (1 + 压缩额外开销)
总存储量 = 单日存储量 x 保留天数 x 1.2（预留 20% 余量）
```

**示例**：

```
消息大小: 1KB
消息量: 1亿条/天
副本因子: 3
压缩比: 0.5 (zstd)
保留: 7 天

单日 = 1KB x 100M x 3 x 0.5 = 150 GB/天
7 天 = 150 x 7 x 1.2 = 1,260 GB ≈ 1.3 TB
```

### Broker 数量计算

```
Broker 数 = max(
    总吞吐 / 单 Broker 写入能力,
    总存储 / 单 Broker 磁盘容量,
    分区总数 / 单 Broker 建议分区上限(~4000)
)
```

### 磁盘选型

| 类型 | 顺序写性能 | 推荐场景 |
|------|-----------|---------|
| HDD (RAID 10) | ~200 MB/s | 大容量、低成本 |
| SSD (SATA) | ~500 MB/s | 平衡性能与成本 |
| NVMe SSD | ~2000 MB/s | 高吞吐、低延迟 |

**最佳实践**：Kafka 以顺序写为主，HDD 在容量型场景足够；延迟敏感型使用 SSD。

### 内存规划

```
Broker JVM Heap: 6-8 GB（不宜过大，Kafka 主要依赖 Page Cache）
Page Cache: 剩余内存尽量留给 OS
推荐: 32-64 GB 总内存，JVM 6GB，Page Cache 26-58 GB
```

## 日常运维命令

### 分区重分配

```bash
# 生成重分配计划
bin/kafka-reassign-partitions.sh --bootstrap-server localhost:9092 \
  --topics-to-move-json-file topics.json \
  --broker-list "1,2,3,4" \
  --generate

# topics.json 格式：
# {"topics": [{"topic": "orders"}], "version": 1}

# 执行重分配
bin/kafka-reassign-partitions.sh --bootstrap-server localhost:9092 \
  --reassignment-json-file plan.json \
  --execute

# 验证进度
bin/kafka-reassign-partitions.sh --bootstrap-server localhost:9092 \
  --reassignment-json-file plan.json \
  --verify
```

### 修改 Topic 配置

```bash
# 设置 Topic 保留时间为 3 天
bin/kafka-configs.sh --bootstrap-server localhost:9092 \
  --alter --entity-type topics --entity-name orders \
  --add-config retention.ms=259200000

# 查看 Topic 配置
bin/kafka-configs.sh --bootstrap-server localhost:9092 \
  --describe --entity-type topics --entity-name orders

# 设置 Broker 级别配置（动态，不需重启）
bin/kafka-configs.sh --bootstrap-server localhost:9092 \
  --alter --entity-type brokers --entity-default \
  --add-config log.retention.hours=72
```

### 日志目录管理

```bash
# 查看日志目录信息
bin/kafka-log-dirs.sh --bootstrap-server localhost:9092 \
  --describe --topic-list orders

# 查看 Broker 磁盘使用
bin/kafka-log-dirs.sh --bootstrap-server localhost:9092 \
  --describe --broker-list 1,2,3
```

## 常见陷阱

- **JVM Heap 过大**：Kafka 性能依赖 OS Page Cache 而非 JVM Heap，Heap 设 6-8GB 足够，更多内存留给 Page Cache
- **`min.insync.replicas` 等于 `replication.factor`**：任何一个副本不可用就无法写入，应比副本因子少 1
- **Broker 下线不优雅**：直接 `kill -9` 导致 Leader 切换和 ISR 重建。应使用 `kafka-server-stop.sh` 或先将分区迁移走
- **`unclean.leader.election.enable=true`**：允许非同步副本当选 Leader 会导致数据丢失，生产环境必须设为 `false`
- **分区重分配期间不限速**：大量数据迁移会占满网络带宽，应使用 `--throttle` 参数限速
- **日志目录满盘**：`log.dirs` 所在磁盘写满会导致 Broker 不可用，需监控磁盘使用率（告警线 75%）
- **动态配置与静态配置冲突**：`kafka-configs.sh` 设置的动态配置优先级高于 `server.properties`，排查问题时容易遗漏

## 组合提示

- 与 **kafka-core** 搭配：理解架构基础后进行运维配置
- 与 **kafka-patterns** 搭配：根据业务模式（exactly-once / 高吞吐）选择对应的调优策略
- 与 **kafka-connect** 搭配：监控 Connect Worker 和 Connector 状态
- 与 **kafka-python** 搭配：通过 AdminClient 实现自动化运维脚本
