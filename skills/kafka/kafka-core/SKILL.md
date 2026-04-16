---
name: kafka-core
description: "Kafka 核心架构概念、消息模型、日志存储、Consumer Group、KRaft 模式与 CLI 工具"
tech_stack: [kafka]
---

# Kafka 核心架构

> 来源：https://kafka.apache.org/documentation/
> 版本基准：Apache Kafka 3.7+（KRaft GA，ZooKeeper 已弃用）

## 用途

Apache Kafka 是一个分布式事件流平台，用于构建高吞吐、低延迟的实时数据管道和流处理应用。理解其核心架构是正确使用 Kafka 的基础。

## 何时使用

- 需要理解 Kafka 集群组成与数据流向
- 规划 Topic/Partition/Replica 拓扑
- 部署新集群（KRaft 模式）
- 使用 CLI 工具进行日常运维
- 排查消费延迟、数据丢失等问题

## 核心概念

### Broker

Kafka 集群由多个 Broker（服务器节点）组成，每个 Broker 负责存储部分 Partition 数据并处理客户端请求。

```
Cluster
├── Broker 0 (Controller)   -- 负责集群元数据管理
├── Broker 1
└── Broker 2
```

### Topic 与 Partition

- **Topic**：逻辑上的消息分类，类似数据库中的表
- **Partition**：Topic 的物理分片，是并行度和顺序保证的基本单位
- 同一 Partition 内消息严格有序；跨 Partition 无序保证

```
Topic: orders (3 partitions)
├── Partition 0: [msg0, msg1, msg4, msg7, ...]
├── Partition 1: [msg2, msg3, msg6, msg9, ...]
└── Partition 2: [msg5, msg8, msg10, ...]
```

### Replica 与 ISR

- 每个 Partition 有 N 个副本（Replica），分布在不同 Broker 上
- **Leader Replica**：处理所有读写请求
- **Follower Replica**：被动从 Leader 拉取数据
- **ISR（In-Sync Replicas）**：与 Leader 保持同步的副本集合，由 `replica.lag.time.max.ms`（默认 30s）控制

```
Partition 0 (replication-factor=3)
├── Broker 0: Leader    ← Producer/Consumer 读写
├── Broker 1: Follower (ISR)  ← 同步复制
└── Broker 2: Follower (ISR)  ← 同步复制
```

当 Leader 宕机时，从 ISR 中选举新 Leader；若 ISR 为空且 `unclean.leader.election.enable=true`，允许从非同步副本选举（可能丢数据）。

### 消息模型

每条 Kafka 消息（ProducerRecord / ConsumerRecord）包含：

| 字段 | 说明 |
|------|------|
| **Key** | 消息键（可选），用于分区路由。相同 Key 路由到同一 Partition |
| **Value** | 消息体，字节数组 |
| **Headers** | KV 键值对列表，用于传递元数据（trace-id 等），不影响路由 |
| **Timestamp** | 消息时间戳，由 `message.timestamp.type` 控制（CreateTime / LogAppendTime） |
| **Offset** | 消息在 Partition 内的唯一递增序号，由 Broker 分配 |
| **Partition** | 消息所属分区编号 |

### 日志存储机制

```
/kafka-logs/
└── orders-0/                    # Topic=orders, Partition=0
    ├── 00000000000000000000.log  # 日志段文件（默认 1GB）
    ├── 00000000000000000000.index  # 偏移量索引
    ├── 00000000000000000000.timeindex  # 时间戳索引
    └── 00000000000065536000.log  # 下一个日志段
```

- 日志段按 `log.segment.bytes`（默认 1GB）或 `log.roll.ms` 滚动
- 过期策略由 `log.retention.hours`（默认 168h=7d）或 `log.retention.bytes` 控制
- 压缩策略 `log.cleanup.policy=compact` 保留每个 Key 的最新值

### Consumer Group 与 Offset 管理

```
Consumer Group: order-service
├── Consumer A → Partition 0, Partition 1
└── Consumer B → Partition 2

内部 Topic: __consumer_offsets (50 partitions)
└── 存储每个 group 对每个 partition 的已提交 offset
```

- 同一 Group 内，每个 Partition 只分配给一个 Consumer
- Consumer 数 > Partition 数时，多余 Consumer 闲置
- `auto.offset.reset`：`earliest`（从头消费）/ `latest`（从最新消费）
- 自动提交：`enable.auto.commit=true` + `auto.commit.interval.ms`（默认 5000ms）
- 手动提交：`commitSync()` / `commitAsync()`

### KRaft 模式（无 ZooKeeper）

Kafka 3.3+ 引入 KRaft（Kafka Raft），3.5 GA，4.0 起移除 ZooKeeper 支持。

**核心配置（server.properties）**：

```properties
# 节点角色：broker / controller / broker,controller
process.roles=broker,controller

# 节点 ID（集群内唯一）
node.id=1

# Controller 投票者列表：id@host:port
controller.quorum.voters=1@kafka1:9093,2@kafka2:9093,3@kafka3:9093

# Controller 监听器
controller.listener.names=CONTROLLER
listeners=PLAINTEXT://:9092,CONTROLLER://:9093
listener.security.protocol.map=CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT

# 元数据日志目录
log.dirs=/var/kafka-logs
```

**存储格式化**（首次启动前必须执行）：

```bash
# 生成集群 ID
KAFKA_CLUSTER_ID=$(bin/kafka-storage.sh random-uuid)

# 格式化存储目录
bin/kafka-storage.sh format \
  -t $KAFKA_CLUSTER_ID \
  -c config/kraft/server.properties
```

**KRaft vs ZooKeeper 对比**：

| 特性 | KRaft | ZooKeeper |
|------|-------|-----------|
| 元数据存储 | `__cluster_metadata` 内部 Topic | ZK znodes |
| Controller 选举 | Raft 共识协议 | ZK 临时节点 |
| 部署复杂度 | 单进程可同时充当 broker+controller | 需独立 ZK 集群 |
| Controller 容错 | 3 节点容忍 1 故障，5 节点容忍 2 | 同 |
| 分区上限 | 百万级 | 十万级（受 ZK 内存限制） |

## CLI 工具

### kafka-topics.sh — Topic 管理

```bash
# 创建 Topic
bin/kafka-topics.sh --bootstrap-server localhost:9092 \
  --create --topic orders \
  --partitions 6 --replication-factor 3

# 查看 Topic 列表
bin/kafka-topics.sh --bootstrap-server localhost:9092 --list

# 查看 Topic 详情（Partition 分布、ISR 状态）
bin/kafka-topics.sh --bootstrap-server localhost:9092 \
  --describe --topic orders

# 修改 Partition 数（只能增加，不能减少）
bin/kafka-topics.sh --bootstrap-server localhost:9092 \
  --alter --topic orders --partitions 12

# 删除 Topic
bin/kafka-topics.sh --bootstrap-server localhost:9092 \
  --delete --topic orders
```

### kafka-console-producer.sh — 生产消息

```bash
# 基本发送
bin/kafka-console-producer.sh --bootstrap-server localhost:9092 \
  --topic orders

# 带 Key 发送（key.separator 默认 \t）
bin/kafka-console-producer.sh --bootstrap-server localhost:9092 \
  --topic orders \
  --property parse.key=true \
  --property key.separator=:
# 输入: user123:{"orderId":"001","amount":99.9}
```

### kafka-console-consumer.sh — 消费消息

```bash
# 从头消费
bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 \
  --topic orders --from-beginning

# 指定 Consumer Group
bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 \
  --topic orders --group order-reader

# 显示 Key、Timestamp、Headers
bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 \
  --topic orders --from-beginning \
  --property print.key=true \
  --property print.timestamp=true \
  --property print.headers=true
```

### kafka-consumer-groups.sh — Consumer Group 管理

```bash
# 列出所有 Consumer Group
bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --list

# 查看 Group 详情（含 LAG）
bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group order-service --describe

# 输出列：GROUP, TOPIC, PARTITION, CURRENT-OFFSET, LOG-END-OFFSET, LAG

# 重置 Offset 到最早（需先停止消费者）
bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group order-service --reset-offsets \
  --to-earliest --topic orders --execute

# 重置 Offset 到指定时间点
bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group order-service --reset-offsets \
  --to-datetime 2024-01-15T00:00:00.000 \
  --topic orders --execute

# 按偏移量回退
bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group order-service --reset-offsets \
  --shift-by -100 --topic orders --execute

# 预览重置效果（不实际执行）
bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group order-service --reset-offsets \
  --to-earliest --topic orders --dry-run
```

## 常见陷阱

- **Partition 数只能增加不能减少**：带 Key 的消息在增加 Partition 后路由会变化，导致同一 Key 分散到不同 Partition
- **ISR 缩减未告警**：ISR 副本数降为 1 时集群仍能工作，但已丧失容灾能力，必须监控 `UnderReplicatedPartitions` 指标
- **auto.offset.reset 误用**：新 Group 默认 `latest`，意味着启动前的存量消息不会被消费
- **Consumer Group 重置 Offset 必须先停消费者**：否则命令报错或立即被覆盖
- **KRaft 存储未格式化**：首次启动前忘记执行 `kafka-storage.sh format` 会导致 Broker 启动失败
- **`message.max.bytes` 与 `max.message.bytes`**：前者是 Broker 级别，后者是 Topic 级别，两者需同时调整，且 Consumer 端的 `fetch.max.bytes` 也需配合

## 组合提示

- 与 **kafka-python** 搭配：理解架构后使用 Python 客户端进行开发
- 与 **kafka-patterns** 搭配：在架构基础上选择合适的生产/消费模式
- 与 **kafka-operations** 搭配：将架构知识应用于运维和调优
- 与 **kafka-connect** 搭配：理解 Topic/Partition 后配置数据集成管道
