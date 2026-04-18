---
name: kafka-exactly-once
description: Kafka 幂等生产者与事务实现 exactly-once 语义（EOS）的配置与使用
tech_stack: [kafka]
capability: [message-queue]
version: "Apache Kafka 4.1"
collected_at: 2026-04-18
---

# Kafka Exactly-Once Semantics（精确一次语义）

> 来源：https://kafka.apache.org/41/design/ 、https://developer.confluent.io/courses/architecture/transactions/

## 用途
通过**幂等 producer** + **事务 API** + **read_committed consumer**，在 Kafka 内部实现"读-处理-写"链路的 exactly-once 投递，避免故障重启造成的重复处理。

## 何时使用
- 消费后写回 Kafka 的流式处理（Kafka Streams / 自研 consume-process-produce 循环）
- 金融/账务等**禁止重复**的业务：如转账扣款+记账必须原子
- 多 partition / 多 topic 的原子写入
- 需要与 offset 提交一同原子完成的副作用

**不适用**：写出到外部 DB / 第三方 API——Kafka 事务**只覆盖 Kafka 内部**，外部系统需自己实现幂等。

## 三种投递语义对照
| 语义 | 位置更新时机 | 故障表现 |
|---|---|---|
| At most once | 处理前保存 offset | 可能丢消息 |
| At least once（默认） | 处理后保存 offset | 可能重复 |
| Exactly once | 事务内原子写 offset + 结果 | 不丢不重 |

## 基础用法

**幂等 Producer（0.11.0.0+，4.x 默认开启）**：
```properties
enable.idempotence=true
acks=all
retries=2147483647
max.in.flight.requests.per.connection=5
```

**事务 Producer**：
```properties
transactional.id=orders-tx-1          # 跨重启稳定标识
enable.idempotence=true
acks=all
transaction.timeout.ms=60000
```

```java
producer.initTransactions();
try {
    producer.beginTransaction();
    producer.send(new ProducerRecord<>("out", k, v));
    producer.sendOffsetsToTransaction(offsets, consumer.groupMetadata());
    producer.commitTransaction();
} catch (ProducerFencedException e) {
    producer.close();   // 新实例已接管
} catch (KafkaException e) {
    producer.abortTransaction();
}
```

**Consumer（读已提交）**：
```properties
isolation.level=read_committed
enable.auto.commit=false
```

**Kafka Streams 一键开启**：
```properties
processing.guarantee=exactly_once_v2
```

## 关键机制
| 组件 | 作用 |
|---|---|
| `transactional.id` | 跨重启稳定标识，用于 fencing |
| Transaction Coordinator | broker 内协调者，按 `hash(transactional.id)` 路由 |
| Producer ID (PID) + Epoch | 每次 `initTransactions` 提升 epoch，旧实例被 fenced |
| Control Markers | 提交/中止标记写入所有参与 partition |
| Last Stable Offset (LSO) | `read_committed` consumer 只能读到 LSO 之前 |
| 序列号 + PID | 幂等去重，broker 丢弃重复 |

## 关键 Producer 配置
| 配置 | 默认 | 说明 |
|---|---|---|
| `enable.idempotence` | true | 要求 `acks=all`、`retries>0`、`in.flight≤5` |
| `acks` | all | 事务必须 `all` |
| `retries` | MAX_INT | 幂等要求 > 0 |
| `max.in.flight.requests.per.connection` | 5 | 幂等要求 ≤ 5 |
| `transactional.id` | 无 | 设置即启用事务 |
| `transaction.timeout.ms` | 60000 | 超时自动 abort |
| `delivery.timeout.ms` | 120000 | send() 最终成功/失败上限 |
| `linger.ms` / `batch.size` | 5 / 16384 | 批量发送窗口 |
| `compression.type` | none | `gzip/snappy/lz4/zstd` |

## 注意事项
- **事务只覆盖 Kafka**：写外部存储需自行实现幂等（如按 key upsert）
- **默认仍是 at-least-once**：exactly-once 必须显式配置 `transactional.id` 或 Streams 的 `exactly_once_v2`
- `enable.idempotence=true` 的三件套约束冲突时 producer 启动直接失败
- **提交频率权衡**：过频增加开销；过疏增加下游可见延迟。Streams 默认 `commit.interval.ms=100`
- `ProducerFencedException` 表示旧实例已被新实例顶替，必须关闭 producer，不能重试
- Consumer 必须设 `isolation.level=read_committed`，否则能读到未提交数据
- **Unclean leader election** 默认关闭（`unclean.leader.election.enable=false`）以保证一致性；开启则可能丢已提交数据
- 已"committed"定义：**所有 ISR** 都已写入；只要有一个 ISR 存活，消息不丢

## 组合提示
- Kafka Streams 是最简单的 EOS 落地方式，无需手写事务代码
- 与 `kafka-schema-registry` 配合，保证事务内消息格式一致性
- Kafka Connect 提供自动 offset 管理，但对接外部系统仍需幂等 sink
