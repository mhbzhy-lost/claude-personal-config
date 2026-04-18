---
name: kafka-security
description: Apache Kafka 认证（SASL/SSL）、加密（TLS）、授权（ACL）配置指南
tech_stack: [kafka]
capability: [auth, encryption]
version: "Apache Kafka 4.1"
collected_at: 2026-04-18
---

# Kafka Security（认证 / 加密 / 授权）

> 来源：https://kafka.apache.org/41/security/

## 用途
为 Kafka 集群提供传输加密、客户端/broker 间身份认证、以及基于 ACL 的细粒度授权；支持非安全、部分安全、全安全混合部署。

## 何时使用
- 跨网络暴露 broker，需要 TLS 加密
- 多租户集群，按用户/服务隔离 topic 访问
- 对接 Kerberos、OAuth2 等企业身份系统
- 需要可审计的 read/write 操作权限控制

## 三大能力

### 1. 传输加密（SSL/TLS）

**Broker 最小配置**：
```properties
listeners=PLAINTEXT://h:9092,SSL://h:9093
ssl.keystore.location=/var/ssl/server.keystore.jks
ssl.keystore.password=...
ssl.key.password=...
ssl.truststore.location=/var/ssl/server.truststore.jks
ssl.truststore.password=...
security.inter.broker.protocol=SSL
```

**Client 最小配置**（仅加密，不做客户端认证）：
```properties
security.protocol=SSL
ssl.truststore.location=/var/ssl/client.truststore.jks
ssl.truststore.password=...
```

**证书生成**：
```bash
keytool -keystore server.keystore.jks -alias localhost -validity 365 \
  -genkey -keyalg RSA -destkeystoretype pkcs12 \
  -ext SAN=DNS:broker1.example.com,IP:10.0.0.1
```

### 2. 认证（SASL）

支持 5 种机制：`GSSAPI`（Kerberos）、`PLAIN`、`SCRAM-SHA-256`、`SCRAM-SHA-512`、`OAUTHBEARER`。

**JAAS 配置优先级**（高→低）：
1. `listener.name.{listener}.{mechanism}.sasl.jaas.config`（broker 配置属性）
2. 静态 JAAS 文件 `{listenerName}.KafkaServer` 段
3. 静态 JAAS 文件 `KafkaServer` 段

客户端使用 `KafkaClient` 段，或 `sasl.jaas.config` 属性。

**传输层选择**：`SASL_PLAINTEXT`（明文）或 `SASL_SSL`（TLS 之上）。`PLAIN` 与 `SCRAM` **必须**配合 TLS。

**Delegation Tokens**：由 `delegation.token.secret.key` 配置密钥，默认有效期 24h，最大生命期 7d，通过 `kafka-delegation-tokens.sh` 或 Admin API 管理，适合分发到 Spark/Flink 等 worker。

### 3. 授权（ACL）

**KRaft 推荐**：
```properties
authorizer.class.name=org.apache.kafka.metadata.authorizer.StandardAuthorizer
super.users=User:Bob;User:Alice
allow.everyone.if.no.acl.found=false
```

注意 `super.users` 使用**分号**分隔。

**ACL 语义**：`Principal P is [Allow|Deny] Operation O From Host H on Resource R`。

**常用命令**：
```bash
# 授权 Bob 读写 Test-topic
bin/kafka-acls.sh --bootstrap-server localhost:9092 --add \
  --allow-principal User:Bob --operation Read --operation Write --topic Test-topic

# Producer 角色快捷授权
bin/kafka-acls.sh --bootstrap-server localhost:9092 --add \
  --allow-principal User:Bob --producer --topic Test-topic

# Consumer 角色（需指定 group）
bin/kafka-acls.sh --bootstrap-server localhost:9092 --add \
  --allow-principal User:Alice --consumer --topic Test-topic --group Group-1

# 按 pattern 列出
bin/kafka-acls.sh --bootstrap-server localhost:9092 --list \
  --topic Test-topic --resource-pattern-type match
```

**Principal 映射**：
- SSL：`ssl.principal.mapping.rules=RULE:^CN=(.*?),OU=ServiceUsers.*$/$1/,DEFAULT`
- Kerberos：`sasl.kerberos.principal.to.local.rules=RULE:[1:$1@$0](.*@MYDOMAIN.COM)s/@.*//,DEFAULT`

**操作/资源集**：
- Operations：Read, Write, Create, Delete, Alter, Describe, ClusterAction, DescribeConfigs, AlterConfigs, IdempotentWrite, CreateTokens, DescribeTokens, All
- Resources：Topic, Group, Cluster, TransactionalId, DelegationToken, User

## 注意事项
- **SASL/PLAIN 与 SCRAM 必须叠加 TLS**，否则凭据裸奔
- **SCRAM** 最低迭代次数 4096；凭据存于 metadata log
- **OAUTHBEARER 默认实现**生成**不安全的 JWT**，仅限非生产
- **Hostname verification** 从 Kafka 2.0 起默认开启；关闭方法是 `ssl.endpoint.identification.algorithm=""`（**不建议**）
- 证书首选 **SAN** 而非 CN（CN 验证自 2000 年已弃用）
- 生产证书 Extended Key Usage 需同时含 **Client + Server authentication**；完整证书链必须导入
- SSL 会带来 **CPU/JVM 相关性能开销**，吞吐敏感场景需压测
- KRaft 自定义 Principal 必须实现 `org.apache.kafka.common.security.auth.KafkaPrincipalSerde`
- 滚动切换 SASL 机制：先在 `sasl.enabled.mechanisms` 加新机制，双写 JAAS，逐个重启，客户端切换完成后再摘除旧机制

## 组合提示
- 和 `kafka-schema-registry` 一同启用 TLS，避免 schema 注册链路被中间人
- 与 Kafka Connect / MirrorMaker 结合时注意传播 JAAS 配置
- 多租户配额（quotas）按 principal 生效，依赖本 skill 的认证结果
