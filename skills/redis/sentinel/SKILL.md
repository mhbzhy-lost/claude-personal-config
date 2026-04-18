---
name: redis-sentinel
description: Redis Sentinel 高可用（监控、自动故障转移、仲裁与客户端服务发现）
tech_stack: [redis]
capability: [key-value-store]
version: "redis unversioned"
collected_at: 2026-04-18
---

# Redis Sentinel

> 来源：https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/

## 用途
在**不使用 Redis Cluster** 的单主多副本部署中提供高可用：监控主从、自动故障转移、通过 Pub/Sub 通知、为客户端提供当前 master 地址。

## 何时使用
- 单主 Redis + 多 replica 的生产 HA
- 需要自动 failover 而非手动介入
- 客户端需要通过 Sentinel API 动态发现 master
- **不适合**：需要水平分片 → 选 Redis Cluster

## 基础用法

### Sentinel 配置 sentinel.conf
```conf
port 26379
sentinel monitor mymaster 127.0.0.1 6379 2
sentinel down-after-milliseconds mymaster 5000
sentinel failover-timeout mymaster 10000
sentinel parallel-syncs mymaster 1
sentinel auth-pass mymaster your_password
```

### 启动
```bash
redis-sentinel /etc/redis/sentinel.conf
# 或
redis-server /etc/redis/sentinel.conf --sentinel
```

### 最小部署拓扑
```
  M1/S1
   │
R2/S2 — R3/S3        quorum = 2
```
**至少 3 个 Sentinel，分布在独立故障域的不同物理机/VM。**

### 客户端查询 master
```bash
redis-cli -p 26379 SENTINEL get-master-addr-by-name mymaster
```

## 关键 API（摘要）

### 核心配置指令
- `sentinel monitor <name> <ip> <port> <quorum>`：quorum = 判定 ODOWN 所需 Sentinel 数
- `sentinel down-after-milliseconds`：PING 无响应判为 SDOWN 的超时
- `sentinel failover-timeout`：同一 master 两次 failover 尝试的间隔
- `sentinel parallel-syncs`：failover 后同时重配置多少个 replica
- `sentinel auth-user` / `sentinel auth-pass`：连接 Redis 的凭证
- `sentinel announce-ip` / `announce-port`：Docker/NAT 场景必备
- `sentinel resolve-hostnames yes` / `announce-hostnames yes`（Redis 6.2+）

### Sentinel 命令
- 查询：`SENTINEL MASTER <name>`、`SENTINEL MASTERS`、`SENTINEL REPLICAS <name>`、`SENTINEL SENTINELS <name>`
- 发现：`SENTINEL GET-MASTER-ADDR-BY-NAME <name>`
- 运维：`SENTINEL FAILOVER <name>`（强制 failover）、`SENTINEL CKQUORUM <name>`、`SENTINEL RESET <pattern>`
- 动态配置：`SENTINEL MONITOR` / `SENTINEL REMOVE` / `SENTINEL SET <name> <key> <value>`
- 全局（6.2+）：`SENTINEL CONFIG GET|SET`

### Pub/Sub 事件
```bash
redis-cli -p 26379 PSUBSCRIBE '*'
```
关键频道：`+sdown`/`-sdown`、`+odown`/`-odown`、`+failover-detected`、`+elected-leader`、`+switch-master`（master 切换）、`+sentinel`（新 Sentinel 加入）、`+slave`（新 replica）

### 故障判定
- **SDOWN**（主观下线）：单个 Sentinel 在 `down-after-milliseconds` 内无有效 PING 响应（有效：`+PONG` / `-LOADING` / `-MASTERDOWN`）
- **ODOWN**（客观下线）：≥ `quorum` 个 Sentinel 共识；**仅对 master 适用**，replica 不走 ODOWN
- Failover 实施：需 Sentinel **多数派**（majority，不是 quorum）同意并选出 leader

### Replica 选举优先级
1. `replica-priority` 低者优先（**0 = 永不提升**）
2. 复制 offset 大者优先
3. run ID 字典序小者胜
4. 掉线超 `(down-after-ms * 10) + SDOWN 以来时间` 的 replica 跳过

### 配置纪元（config epoch）
每次 failover 分配唯一递增 epoch，防脑裂；configuration 传播时高 epoch 覆盖低 epoch。

### 数据安全配置
```conf
# 主库侧：无可用 replica 时拒写
min-replicas-to-write 1
min-replicas-max-lag 10

# 客户端侧：同步等待复制
WAIT 2 100    # 等待至少 2 个 replica 确认，最多 100ms
```

### 认证
```conf
# Sentinel 连 Redis（ACL, Redis 6+）
sentinel auth-user mymaster sentinel-user
sentinel auth-pass mymaster user-password

# 保护 Sentinel 自身（6.2+）
requirepass your_password
# 或 ACL
ACL SETUSER default off
ACL SETUSER admin ON >admin-password allchannels +@all
```

## 注意事项
- **至少 3 个 Sentinel**，分布在独立故障域；2 个无法形成多数派
- **配置文件必须可写**：Sentinel 运行时会回写发现的 replica/sentinel 列表
- **异步复制 ⇒ 不保证零数据丢失**；failover 时已确认但未复制的写会丢
- **少数派分区**的客户端可能继续写入老 master，合并时丢失 → 用 `min-replicas-to-write` 限制分叉窗口（换可用性）
- **多数派不可达 = 永不 failover**
- **Docker/NAT** 会破坏 Sentinel 的 hello 自动发现 → host 网络、1:1 端口映射、或 `announce-ip/port`
- **TILT 模式**：系统时间突变或进程长时间阻塞触发，Sentinel 只监控不行动，30 秒正常后退出
- **Redis+Sentinel 是最终一致**、last-failover-wins 语义，不适合强一致场景
- 客户端必须**支持 Sentinel 协议**（大多数主流客户端已支持）
- 添加/删除 Sentinel 需间隔 30s，配合 `SENTINEL RESET *` 让集群重新发现
- `replica-priority=0` 的 replica 永远不会被提升
- DNS hostname 支持并非所有客户端都兼容，启用前测试

## 组合提示
与 `redis-persistence`（replica 初次同步用 RDB）、客户端连接池（Jedis Sentinel / lettuce / ioredis Sentinel mode）、监控（订阅 `+switch-master` 触发告警）常搭配使用。
