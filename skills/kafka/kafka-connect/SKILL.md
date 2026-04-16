---
name: kafka-connect
description: "Kafka Connect 架构、Source/Sink Connector、Standalone/Distributed 模式、SMT 与常用 Connector 配置"
tech_stack: [kafka]
---

# Kafka Connect

> 来源：https://kafka.apache.org/documentation/#connect , https://docs.confluent.io/platform/current/connect/index.html
> 版本基准：Apache Kafka 3.7+ / Confluent Platform 7.x

## 用途

Kafka Connect 是 Kafka 内置的数据集成框架，用于在 Kafka 与外部系统（数据库、搜索引擎、对象存储等）之间可靠地流式传输数据，无需编写自定义代码。

## 何时使用

- 将数据库变更实时同步到 Kafka（CDC）
- 将 Kafka 数据写入 Elasticsearch / S3 / 数据仓库
- 需要可扩展、容错的数据管道（非一次性脚本）
- 希望通过声明式配置（JSON）而非编码实现数据集成

## 架构概览

```
外部系统 (MySQL/PG/...)
        │
        ▼
┌─────────────────────┐
│  Source Connector    │  ← 从外部系统读取，写入 Kafka Topic
│  (Debezium CDC)     │
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│   Kafka Cluster     │
│   (Topic: cdc.*)    │
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│  Sink Connector      │  ← 从 Kafka Topic 读取，写入外部系统
│  (ES/S3/JDBC)        │
└─────────────────────┘
        │
        ▼
外部系统 (ES/S3/PG/...)
```

### 核心组件

| 组件 | 说明 |
|------|------|
| **Worker** | 运行 Connector 和 Task 的 JVM 进程 |
| **Connector** | 定义数据流向（Source / Sink）和配置 |
| **Task** | Connector 的并行执行单元，实际搬运数据 |
| **Converter** | 序列化/反序列化格式（JSON / Avro / Protobuf） |
| **Transform (SMT)** | 消息级轻量转换 |

## 部署模式

### Standalone 模式

单进程运行，适合开发测试。

**worker 配置（connect-standalone.properties）**：

```properties
bootstrap.servers=localhost:9092
key.converter=org.apache.kafka.connect.json.JsonConverter
value.converter=org.apache.kafka.connect.json.JsonConverter
key.converter.schemas.enable=false
value.converter.schemas.enable=false

# Offset 存储（Standalone 模式使用文件）
offset.storage.file.filename=/tmp/connect.offsets
offset.flush.interval.ms=10000
```

**启动命令**：

```bash
bin/connect-standalone.sh \
  config/connect-standalone.properties \
  config/my-source-connector.properties \
  config/my-sink-connector.properties
```

### Distributed 模式（生产推荐）

多 Worker 组成集群，自动负载均衡和故障转移。

**worker 配置（connect-distributed.properties）**：

```properties
bootstrap.servers=kafka1:9092,kafka2:9092,kafka3:9092
group.id=connect-cluster

key.converter=io.confluent.connect.avro.AvroConverter
key.converter.schema.registry.url=http://schema-registry:8081
value.converter=io.confluent.connect.avro.AvroConverter
value.converter.schema.registry.url=http://schema-registry:8081

# 内部 Topic（自动创建）
config.storage.topic=connect-configs
config.storage.replication.factor=3
offset.storage.topic=connect-offsets
offset.storage.replication.factor=3
offset.storage.partitions=25
status.storage.topic=connect-status
status.storage.replication.factor=3
status.storage.partitions=5

# REST API 端口
rest.port=8083
rest.advertised.host.name=connect-worker-1

# 插件路径
plugin.path=/usr/share/java,/opt/connectors
```

**启动命令**：

```bash
bin/connect-distributed.sh config/connect-distributed.properties
```

## REST API

Distributed 模式通过 REST API 管理 Connector（默认端口 8083）。

```bash
# 查看已安装的 Connector 插件
curl -s http://localhost:8083/connector-plugins | jq .

# 列出所有 Connector
curl -s http://localhost:8083/connectors | jq .

# 创建 Connector
curl -X POST http://localhost:8083/connectors \
  -H "Content-Type: application/json" \
  -d @connector-config.json

# 查看 Connector 状态
curl -s http://localhost:8083/connectors/my-connector/status | jq .

# 暂停 / 恢复 / 重启 Connector
curl -X PUT http://localhost:8083/connectors/my-connector/pause
curl -X PUT http://localhost:8083/connectors/my-connector/resume
curl -X POST http://localhost:8083/connectors/my-connector/restart

# 重启单个 Task
curl -X POST http://localhost:8083/connectors/my-connector/tasks/0/restart

# 更新 Connector 配置
curl -X PUT http://localhost:8083/connectors/my-connector/config \
  -H "Content-Type: application/json" \
  -d @updated-config.json

# 删除 Connector
curl -X DELETE http://localhost:8083/connectors/my-connector
```

## 常用 Connector 配置

### Debezium MySQL CDC（Source）

```json
{
  "name": "mysql-cdc-source",
  "config": {
    "connector.class": "io.debezium.connector.mysql.MySqlConnector",
    "tasks.max": "1",
    "database.hostname": "mysql-host",
    "database.port": "3306",
    "database.user": "debezium",
    "database.password": "dbz-password",
    "database.server.id": "184054",
    "topic.prefix": "cdc",
    "database.include.list": "mydb",
    "table.include.list": "mydb.orders,mydb.users",
    "schema.history.internal.kafka.bootstrap.servers": "localhost:9092",
    "schema.history.internal.kafka.topic": "schema-changes.mydb",
    "include.schema.changes": "true",
    "snapshot.mode": "initial",
    "transforms": "unwrap",
    "transforms.unwrap.type": "io.debezium.transforms.ExtractNewRecordState",
    "transforms.unwrap.drop.tombstones": "false",
    "transforms.unwrap.delete.handling.mode": "rewrite"
  }
}
```

### JDBC Source Connector

```json
{
  "name": "jdbc-source",
  "config": {
    "connector.class": "io.confluent.connect.jdbc.JdbcSourceConnector",
    "tasks.max": "1",
    "connection.url": "jdbc:postgresql://pg-host:5432/mydb",
    "connection.user": "kafka_connect",
    "connection.password": "secret",
    "table.whitelist": "orders,products",
    "mode": "timestamp+incrementing",
    "timestamp.column.name": "updated_at",
    "incrementing.column.name": "id",
    "topic.prefix": "jdbc.",
    "poll.interval.ms": "5000",
    "batch.max.rows": "1000"
  }
}
```

### Elasticsearch Sink Connector

```json
{
  "name": "es-sink",
  "config": {
    "connector.class": "io.confluent.connect.elasticsearch.ElasticsearchSinkConnector",
    "tasks.max": "3",
    "topics": "cdc.mydb.orders",
    "connection.url": "http://elasticsearch:9200",
    "type.name": "_doc",
    "key.ignore": "false",
    "schema.ignore": "true",
    "behavior.on.null.values": "delete",
    "write.method": "upsert",
    "transforms": "extractKey",
    "transforms.extractKey.type": "org.apache.kafka.connect.transforms.ExtractField$Key",
    "transforms.extractKey.field": "id"
  }
}
```

### S3 Sink Connector

```json
{
  "name": "s3-sink",
  "config": {
    "connector.class": "io.confluent.connect.s3.S3SinkConnector",
    "tasks.max": "6",
    "topics": "events",
    "s3.region": "us-east-1",
    "s3.bucket.name": "my-kafka-archive",
    "s3.part.size": "52428800",
    "flush.size": "10000",
    "rotate.interval.ms": "3600000",
    "storage.class": "io.confluent.connect.s3.storage.S3Storage",
    "format.class": "io.confluent.connect.s3.format.parquet.ParquetFormat",
    "parquet.codec": "snappy",
    "partitioner.class": "io.confluent.connect.storage.partitioner.TimeBasedPartitioner",
    "path.format": "'year'=YYYY/'month'=MM/'day'=dd/'hour'=HH",
    "partition.duration.ms": "3600000",
    "locale": "en-US",
    "timezone": "UTC",
    "timestamp.extractor": "RecordField",
    "timestamp.field": "created_at"
  }
}
```

## SMT（Single Message Transform）

SMT 在 Connector 内部对每条消息做轻量级转换，无需额外的流处理应用。

### 常用 SMT

| SMT 类型 | 功能 | 场景 |
|----------|------|------|
| `InsertField` | 插入静态值或元数据字段 | 添加集群标识、处理时间 |
| `ReplaceField` | 重命名/过滤字段 | 字段映射 |
| `ExtractField` | 提取单个字段作为新 Value/Key | 从结构体提取 ID |
| `MaskField` | 脱敏字段值 | PII 数据保护 |
| `ValueToKey` | 从 Value 提取字段设为 Key | 构建 Key |
| `TimestampConverter` | 转换时间戳格式 | Unix 时间戳 ↔ 字符串 |
| `HoistField` | 将整个消息包装到指定字段 | 结构标准化 |
| `Flatten` | 展平嵌套结构 | 写入不支持嵌套的 Sink |
| `ExtractNewRecordState` | 提取 Debezium 的 after 字段 | CDC 数据扁平化 |

### 配置示例

```json
{
  "name": "my-connector",
  "config": {
    "connector.class": "...",
    "topics": "orders",
    "transforms": "insertCluster,renameFields,maskPII",

    "transforms.insertCluster.type": "org.apache.kafka.connect.transforms.InsertField$Value",
    "transforms.insertCluster.static.field": "cluster_id",
    "transforms.insertCluster.static.value": "prod-east-1",

    "transforms.renameFields.type": "org.apache.kafka.connect.transforms.ReplaceField$Value",
    "transforms.renameFields.renames": "user_name:username,order_id:id",
    "transforms.renameFields.exclude": "internal_field",

    "transforms.maskPII.type": "org.apache.kafka.connect.transforms.MaskField$Value",
    "transforms.maskPII.fields": "email,phone",
    "transforms.maskPII.replacement": "***"
  }
}
```

## 错误处理与 DLQ

Kafka Connect 内置 Dead Letter Queue 支持：

```json
{
  "name": "es-sink-with-dlq",
  "config": {
    "connector.class": "io.confluent.connect.elasticsearch.ElasticsearchSinkConnector",
    "topics": "orders",
    "connection.url": "http://elasticsearch:9200",

    "errors.tolerance": "all",
    "errors.deadletterqueue.topic.name": "orders.dlq",
    "errors.deadletterqueue.topic.replication.factor": 3,
    "errors.deadletterqueue.context.headers.enable": true,
    "errors.log.enable": true,
    "errors.log.include.messages": true,
    "errors.retry.delay.max.ms": 60000,
    "errors.retry.timeout": 300000
  }
}
```

| 参数 | 说明 |
|------|------|
| `errors.tolerance` | `none`=失败即停止（默认），`all`=跳过错误消息 |
| `errors.deadletterqueue.topic.name` | DLQ Topic 名称 |
| `errors.deadletterqueue.context.headers.enable` | 在 DLQ 消息 Headers 中附带错误上下文 |
| `errors.retry.timeout` | 重试总超时时间（ms） |

## 常见陷阱

- **Converter 不匹配**：Worker 级别的 Converter 与 Connector 级别不一致导致反序列化失败。Connector 配置可覆盖 Worker 级别的 `key.converter` 和 `value.converter`
- **Schema Registry URL 漏配**：使用 AvroConverter 但未配置 `schema.registry.url` 导致启动失败
- **Distributed 模式内部 Topic 副本数为 1**：`config.storage.replication.factor` 默认 3，单节点测试环境需显式设为 1
- **`tasks.max` 设置过高**：Source Connector 的实际并行度受数据源限制（如 Debezium MySQL 只能 1 个 Task），设再高也无用
- **Debezium Snapshot 阻塞**：`snapshot.mode=initial` 在大表上可能耗时数小时，首次部署需评估
- **SMT 顺序敏感**：`transforms` 列表按声明顺序执行，调整顺序可能导致不同结果
- **plugin.path 未包含 Connector JAR**：自定义 Connector 必须放在 `plugin.path` 指定的目录下，且每个 Connector 需在独立子目录中

## 组合提示

- 与 **kafka-core** 搭配：理解 Topic/Partition 有助于合理配置 Connector 的 `tasks.max` 和目标 Topic
- 与 **kafka-patterns** 搭配：Connect 框架的 DLQ 对应应用层 DLQ 模式
- 与 **kafka-operations** 搭配：监控 Connector 状态、排查 Lag、调优性能
- 与 **kafka-python** 搭配：AdminClient 可用于预创建 Connect 所需的 Topic
