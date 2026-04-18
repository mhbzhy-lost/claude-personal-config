---
name: kafka-schema-registry
description: Confluent Schema Registry 管理 Avro/JSON/Protobuf schema 注册、演进与兼容性校验
tech_stack: [kafka, confluent]
capability: [message-queue]
version: "Confluent Schema Registry unversioned"
collected_at: 2026-04-18
---

# Kafka Schema Registry（模式注册中心）

> 来源：https://docs.confluent.io/platform/current/schema-registry/

## 用途
为 Kafka 生产/消费端提供集中式 schema 存储、版本化与兼容性检查，支持 Avro、JSON Schema、Protobuf 三种格式的 SerDes。

## 何时使用
- 需要生产者/消费者解耦升级，且不破坏下游解析
- 跨团队共享消息契约，强制兼容性策略
- 用 Avro/Protobuf 压缩二进制，而非在消息里塞完整 schema
- 做 schema 演进审计与 Schema Linking（跨集群同步）

## 基础用法

**生产者配置（Java，Avro）**：
```properties
key.serializer=io.confluent.kafka.serializers.KafkaAvroSerializer
value.serializer=io.confluent.kafka.serializers.KafkaAvroSerializer
schema.registry.url=http://sr:8081
normalize.schemas=true   # 强烈建议开启
auto.register.schemas=true   # 生产环境常设为 false，用 CI 预注册
```

**消费者配置**：
```properties
key.deserializer=io.confluent.kafka.serializers.KafkaAvroDeserializer
value.deserializer=io.confluent.kafka.serializers.KafkaAvroDeserializer
schema.registry.url=http://sr:8081
specific.avro.reader=true
```

**REST API**：
```bash
# 注册 schema
curl -X POST -H "Content-Type: application/vnd.schemaregistry.v1+json" \
  --data '{"schema":"..."}' \
  http://sr:8081/subjects/orders-value/versions

# 兼容性测试
curl -X POST http://sr:8081/compatibility/subjects/orders-value/versions/latest?normalize=true&verbose=true
```

## 关键 API（摘要）

| 项 | 说明 |
|---|---|
| SerDes | `KafkaAvroSerializer/Deserializer`、`KafkaProtobufSerializer/Deserializer`、`KafkaJsonSchemaSerializer/Deserializer` |
| Subject 策略 | `TopicNameStrategy`（默认 `<topic>-key/-value`）、`RecordNameStrategy`、`TopicRecordNameStrategy` |
| 兼容模式 | `BACKWARD`（默认）、`BACKWARD_TRANSITIVE`、`FORWARD`、`FORWARD_TRANSITIVE`、`FULL`、`FULL_TRANSITIVE`、`NONE` |
| `GET/PUT /config[/{subject}]` | 读/设全局或 subject 级兼容策略 |
| `POST /compatibility/subjects/{s}/versions/{v}` | 校验候选 schema |
| 存储后端 | 紧凑 topic `_schemas` 作为 WAL |
| Content-Type | `application/vnd.schemaregistry.v1+json` |
| CLI | `kafka-avro-console-producer/consumer` 等 |

## 升级顺序（按兼容模式）
- `BACKWARD`：**先升 consumer**，再升 producer
- `FORWARD`：**先升 producer**，再升 consumer
- `FULL`：可独立升级
- Kafka Streams：**仅支持 BACKWARD**

## 注意事项
- **schema 归一化默认关闭**：务必打开 `normalize.schemas=true`，否则语义相同但格式不同会被视为新版本
- Avro 新增可选字段**必须给默认值**，否则破坏 backward 兼容
- Protobuf 推荐 `BACKWARD_TRANSITIVE`；JSON Schema 有 lenient/strict 两种策略，兼容规则不同
- `auto.register.schemas=true` 方便开发但生产易失控，建议 CI 预注册 + 关闭自动注册
- Protobuf serializer 会**递归注册所有 import** 的 schema
- Subject Aliases 仅 Confluent Platform **7.4.1+** 支持
- Transitive 模式会校验**所有历史版本**，不止最新一版

## 组合提示
- 与 Kafka Connect、ksqlDB、Kafka Streams 共享同一 registry
- 跨环境/集群迁移用 Schema Linking（exporters/importers + contexts）
- 和 `kafka-security` 组合：Schema Registry 自身也可配置 SSL/SASL
