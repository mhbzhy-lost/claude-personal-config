---
name: redis-cluster
description: "Redis Cluster 架构、Sentinel 哨兵、主从复制、持久化策略与内存管理"
tech_stack: [redis]
---

# Redis 高可用与运维

> 来源：https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/ / https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/
> 版本基准：Redis 7.x

## 用途
掌握 Redis 的生产级部署架构：Cluster 分片、Sentinel 哨兵、主从复制、持久化策略（RDB/AOF/混合）和内存淘汰策略，覆盖从单机到分布式集群的运维需求。

## 何时使用
- 单机 Redis 内存不够或需要水平扩展：Cluster
- 需要自动故障转移的高可用方案：Sentinel 或 Cluster
- 需要读写分离降低主节点压力：主从复制
- 需要数据持久化防止重启丢失：RDB / AOF
- 需要精细控制内存使用和淘汰策略

## 主从复制（Replication）

### 核心概念

- **异步复制**：主节点写入后立即返回客户端，异步同步到从节点
- **一主多从**：一个 Master 可挂多个 Replica，Replica 也可级联（链式复制）
- **全量同步 + 增量同步**：首次连接做 RDB 全量同步，之后通过 replication backlog 增量同步
- **Replica 默认只读**：`replica-read-only yes`（默认）

### 配置

```bash
# 方式一：redis.conf
replicaof 192.168.1.100 6379
masterauth "your_password"       # 主节点有密码时需配置

# 方式二：运行时配置
REPLICAOF 192.168.1.100 6379

# 取消复制（提升为独立主节点）
REPLICAOF NO ONE
```

### 关键参数

```ini
# === 主节点配置 ===
repl-backlog-size 64mb           # 复制积压缓冲区大小
repl-backlog-ttl 3600            # 无从节点时保留积压缓冲的秒数
min-replicas-to-write 1          # 至少 N 个从节点在线才接受写入
min-replicas-max-lag 10          # 从节点最大延迟秒数

# === 从节点配置 ===
replica-read-only yes            # 从节点只读（推荐）
replica-serve-stale-data yes     # 同步中断时是否继续响应读请求
replica-priority 100             # Sentinel 选举优先级（0=永不提升）
```

### Python 读写分离

```python
import redis

# 写操作发往主节点
master = redis.Redis(host="redis-master", port=6379, decode_responses=True)

# 读操作发往从节点（可配多个从节点做负载均衡）
replica = redis.Redis(host="redis-replica", port=6379, decode_responses=True)

master.set("key", "value")
value = replica.get("key")  # 注意：存在短暂延迟

# 通过 Sentinel 自动发现主从（推荐）
sentinel = redis.Sentinel(
    [("sentinel1", 26379), ("sentinel2", 26379), ("sentinel3", 26379)],
    socket_timeout=0.5,
)
master = sentinel.master_for("mymaster", decode_responses=True)
replica = sentinel.slave_for("mymaster", decode_responses=True)
```

### 监控复制状态

```bash
# 在主节点查看
INFO replication
# role:master
# connected_slaves:2
# slave0:ip=192.168.1.101,port=6379,state=online,offset=12345,lag=0
# slave1:ip=192.168.1.102,port=6379,state=online,offset=12345,lag=1

# 在从节点查看
INFO replication
# role:slave
# master_host:192.168.1.100
# master_port:6379
# master_link_status:up
# master_last_io_seconds_ago:1
# slave_repl_offset:12345
```

## Sentinel（哨兵模式）

### 核心功能

1. **监控**：持续检查主从节点是否正常工作
2. **通知**：通过 Pub/Sub 或 API 通知管理员或应用
3. **自动故障转移**：主节点故障时自动将从节点提升为新主节点
4. **配置提供者**：客户端通过 Sentinel 发现当前主节点地址

### 部署架构（推荐 3 节点）

```
+----+         +----+         +----+
| M1 |----+----| R2 |----+----| R3 |
| S1 |    |    | S2 |    |    | S3 |
+----+    |    +----+    |    +----+
          |              |
     Sentinel 1     Sentinel 2    Sentinel 3

M = Master, R = Replica, S = Sentinel
quorum = 2（至少 2 个 Sentinel 同意才触发故障转移）
```

### 配置

```ini
# sentinel.conf
port 26379

# 监控主节点，quorum=2
sentinel monitor mymaster 192.168.1.100 6379 2

# 主节点无响应超过 5 秒判定为主观下线（SDOWN）
sentinel down-after-milliseconds mymaster 5000

# 故障转移超时
sentinel failover-timeout mymaster 180000

# 同时同步的从节点数量（控制故障转移期间的负载）
sentinel parallel-syncs mymaster 1

# 主节点密码
sentinel auth-pass mymaster "your_password"

# Redis 6+ ACL
sentinel auth-user mymaster sentinel-user
sentinel auth-pass mymaster sentinel-password
```

### 故障转移流程

1. **SDOWN**（主观下线）：单个 Sentinel 检测到主节点无响应
2. **ODOWN**（客观下线）：quorum 个 Sentinel 同意主节点已下线
3. **选举 Leader**：Sentinel 之间选举一个执行故障转移
4. **选择新主节点**：根据 `replica-priority`（低优先）-> 复制偏移量（高优先）-> Run ID（字典序）
5. **执行切换**：提升从节点为主节点，重新配置其他从节点

### Sentinel 常用命令

```bash
# 查看主节点信息
redis-cli -p 26379 SENTINEL master mymaster

# 获取当前主节点地址
redis-cli -p 26379 SENTINEL get-master-addr-by-name mymaster

# 列出从节点
redis-cli -p 26379 SENTINEL replicas mymaster

# 列出其他 Sentinel
redis-cli -p 26379 SENTINEL sentinels mymaster

# 手动触发故障转移
redis-cli -p 26379 SENTINEL failover mymaster
```

### Python Sentinel 客户端

```python
import redis

sentinel = redis.Sentinel(
    [
        ("sentinel-1.example.com", 26379),
        ("sentinel-2.example.com", 26379),
        ("sentinel-3.example.com", 26379),
    ],
    socket_timeout=0.5,
    password="sentinel_password",     # Sentinel 自身的密码
)

# 获取主节点客户端（自动故障转移后切换到新主）
master = sentinel.master_for(
    "mymaster",
    password="redis_password",       # Redis 数据节点密码
    decode_responses=True,
    socket_timeout=5,
)

# 获取从节点客户端（自动负载均衡到可用从节点）
replica = sentinel.slave_for(
    "mymaster",
    password="redis_password",
    decode_responses=True,
)

master.set("key", "value")
value = replica.get("key")
```

## Redis Cluster（集群分片）

### 核心概念

- **16384 个 Hash Slot**：每个键通过 `CRC16(key) % 16384` 映射到一个槽
- **数据自动分片**：每个主节点负责一部分槽
- **无中心架构**：节点之间通过 Gossip 协议通信
- **最少 3 主 3 从**：推荐 6 节点起步

### Hash Slot 计算

```bash
# 查看键所在的槽
CLUSTER KEYSLOT mykey        # => 14687

# Hash Tag：强制多个键落在同一个槽
# 只对 {} 内的部分计算 hash
SET {user:1001}.profile "data"
SET {user:1001}.settings "data"
# 两个键都落在 CLUSTER KEYSLOT "user:1001" 对应的槽
```

### 部署

```bash
# 创建集群（3 主 3 从）
redis-cli --cluster create \
  192.168.1.1:6379 192.168.1.2:6379 192.168.1.3:6379 \
  192.168.1.4:6379 192.168.1.5:6379 192.168.1.6:6379 \
  --cluster-replicas 1

# 检查集群状态
redis-cli --cluster check 192.168.1.1:6379

# 添加节点
redis-cli --cluster add-node 192.168.1.7:6379 192.168.1.1:6379

# 重新分配槽
redis-cli --cluster reshard 192.168.1.1:6379

# 节点配置
cluster-enabled yes
cluster-config-file nodes.conf
cluster-node-timeout 5000
```

### MOVED 与 ASK 重定向

```bash
# MOVED：键永久属于另一个节点
> GET key
(error) MOVED 14687 192.168.1.2:6379
# 客户端应更新路由表，后续同槽请求直接发往新节点

# ASK：槽正在迁移中，临时重定向
> GET key
(error) ASK 14687 192.168.1.3:6379
# 客户端仅对本次请求先发 ASKING 再发命令到目标节点
```

### Python Cluster 客户端

```python
from redis.cluster import RedisCluster

rc = RedisCluster(
    host="192.168.1.1",
    port=6379,
    password="password",
    decode_responses=True,
)

rc.set("key", "value")
value = rc.get("key")

# Cluster Pipeline（自动按槽分组）
with rc.pipeline() as pipe:
    pipe.set("k1", "v1")
    pipe.set("k2", "v2")
    pipe.get("k1")
    results = pipe.execute()
# 注意：跨槽命令不保证原子性
```

### Cluster 限制

- **跨槽命令受限**：`MGET`/`MSET`/事务等多键命令要求所有键在同一槽，否则返回 `CROSSSLOT` 错误
- **解决方案**：使用 Hash Tag `{tag}` 强制同槽；或应用层拆分请求
- **Pub/Sub 全节点广播**：Cluster 模式下 `PUBLISH` 会广播到所有节点，增加带宽开销
- **Lua 脚本**：脚本中访问的所有 key 必须在同一个槽
- **数据库只有 db0**：Cluster 模式下不支持多数据库

## 持久化策略

### RDB（快照）

定时将内存数据集写入磁盘的二进制快照文件。

```ini
# redis.conf
save 3600 1        # 3600 秒内至少 1 个键变更则快照
save 300 100       # 300 秒内至少 100 个键变更
save 60 10000      # 60 秒内至少 10000 个键变更

dbfilename dump.rdb
dir /var/lib/redis/

# 快照失败时停止写入（安全保障）
stop-writes-on-bgsave-error yes

# RDB 压缩（推荐开启）
rdbcompression yes
rdbchecksum yes
```

```bash
# 手动触发快照
BGSAVE          # 后台异步（推荐）
SAVE            # 前台阻塞（仅调试用）

# 查看最后一次快照时间
LASTSAVE
```

**优点**：文件紧凑、恢复速度快、对性能影响小（fork 子进程）
**缺点**：可能丢失最后一次快照后的数据；大数据集 fork 可能导致短暂延迟

### AOF（追加日志）

记录每个写操作命令，重启时重放恢复数据。

```ini
# redis.conf
appendonly yes
appendfilename "appendonly.aof"
appenddirname "appendonlydir"     # Redis 7.0+ 多文件 AOF 目录

# fsync 策略
appendfsync everysec              # 推荐：每秒刷盘（最多丢 1 秒数据）
# appendfsync always              # 每条命令刷盘（最安全，性能差）
# appendfsync no                  # 操作系统决定（性能最好，可能丢 30 秒数据）

# 自动 AOF 重写
auto-aof-rewrite-percentage 100   # AOF 比上次重写后增长 100% 时触发
auto-aof-rewrite-min-size 64mb    # AOF 至少达到 64MB 才触发重写
```

```bash
# 手动触发 AOF 重写
BGREWRITEAOF

# 检查/修复 AOF 文件
redis-check-aof --fix appendonly.aof
```

**Redis 7.0+ 多文件 AOF**：
- 基础文件（base）：RDB 或 AOF 格式快照
- 增量文件（incremental）：自基础文件后的变更
- 清单文件（manifest）：跟踪所有文件

### fsync 策略对比

| 策略 | 安全性 | 性能 | 最大数据丢失 |
|------|--------|------|-------------|
| `always` | 最高 | 最低 | 0（理论上） |
| `everysec` | 高 | 高 | ~1 秒 |
| `no` | 低 | 最高 | 取决于 OS（通常 ~30 秒） |

### 混合持久化（推荐生产环境）

同时开启 RDB + AOF，兼得快速恢复和数据安全。

```ini
# 推荐生产配置
save 3600 1 300 100 60 10000
appendonly yes
appendfsync everysec
aof-use-rdb-preamble yes         # AOF 重写时基础部分用 RDB 格式（加速加载）
```

**重启时数据加载优先级**：AOF 优先于 RDB（AOF 数据更完整）。

### 备份策略

```bash
# RDB 备份（安全：RDB 文件不会被就地修改）
cp /var/lib/redis/dump.rdb /backup/redis/dump-$(date +%Y%m%d-%H%M%S).rdb

# AOF 备份（Redis 7.0+）
# 1. 暂时关闭自动重写
redis-cli CONFIG SET auto-aof-rewrite-percentage 0
# 2. 确认没有重写进行中
redis-cli INFO persistence | grep aof_rewrite_in_progress
# 3. 复制整个 AOF 目录
cp -r /var/lib/redis/appendonlydir/ /backup/redis/aof-$(date +%Y%m%d)/
# 4. 恢复自动重写
redis-cli CONFIG SET auto-aof-rewrite-percentage 100
```

## 内存管理

### maxmemory 配置

```ini
# 设置内存上限
maxmemory 4gb

# 运行时修改
# CONFIG SET maxmemory 4gb
```

### 淘汰策略（maxmemory-policy）

| 策略 | 范围 | 算法 | 适用场景 |
|------|------|------|---------|
| `noeviction` | - | 不淘汰，拒绝写入 | 不允许数据丢失 |
| `allkeys-lru` | 所有键 | 近似 LRU | **默认推荐**，Pareto 访问模式 |
| `allkeys-lfu` | 所有键 | 近似 LFU | 热点数据明显 |
| `allkeys-random` | 所有键 | 随机 | 均匀访问模式 |
| `volatile-lru` | 有 TTL 的键 | 近似 LRU | 只淘汰可过期数据 |
| `volatile-lfu` | 有 TTL 的键 | 近似 LFU | 只淘汰可过期的冷数据 |
| `volatile-ttl` | 有 TTL 的键 | TTL 最短优先 | 按预期寿命淘汰 |
| `volatile-random` | 有 TTL 的键 | 随机 | 有 TTL 的均匀场景 |

```ini
# 推荐配置
maxmemory-policy allkeys-lru
maxmemory-samples 5              # LRU/LFU 采样数（越大越精确，默认 5）

# LFU 调优（Redis 4.0+）
lfu-log-factor 10                # Morris 计数器对数因子（默认 10）
lfu-decay-time 1                 # 频率衰减间隔（分钟，默认 1）
```

### 内存监控

```bash
# 内存概览
INFO memory
# used_memory:2048000000          # 已用内存（字节）
# used_memory_human:1.91G
# used_memory_rss:2200000000      # 操作系统分配的物理内存
# used_memory_peak:3000000000     # 历史峰值
# maxmemory:4294967296            # 配置的上限
# maxmemory_policy:allkeys-lru
# mem_fragmentation_ratio:1.07    # 碎片率（>1.5 需关注）

# 内存分析
MEMORY USAGE key                  # 单个键的内存占用
MEMORY DOCTOR                     # 内存问题诊断

# 缓存命中率
INFO stats
# keyspace_hits:1000000
# keyspace_misses:50000
# 命中率 = hits / (hits + misses) = 95.2%
```

### 内存优化建议

```ini
# 1. 开启惰性释放（避免大键删除阻塞主线程）
lazyfree-lazy-eviction yes
lazyfree-lazy-expire yes
lazyfree-lazy-server-del yes

# 2. 小数据优化编码（自动）
# Hash/List/Set/ZSet 在元素少时使用紧凑编码
hash-max-listpack-entries 128     # Hash <= 128 个字段时用 listpack
hash-max-listpack-value 64        # Hash 字段值 <= 64 字节时用 listpack
list-max-listpack-size -2         # List 节点最大 8KB
set-max-listpack-entries 128      # Set <= 128 个元素时用 listpack
zset-max-listpack-entries 128     # ZSet <= 128 个元素时用 listpack
zset-max-listpack-value 64        # ZSet 成员 <= 64 字节时用 listpack

# 3. 主动碎片整理（Redis 4.0+）
activedefrag yes
active-defrag-ignore-bytes 100mb  # 碎片量超过 100MB 才触发
active-defrag-threshold-lower 10  # 碎片率超过 10% 才触发
active-defrag-threshold-upper 100 # 碎片率超过 100% 全力整理
```

## 常见陷阱

- **异步复制可能丢数据**：主节点写入成功后崩溃，尚未同步到从节点的数据会丢失；`min-replicas-to-write` 可降低风险但不能完全消除
- **Sentinel quorum 计算错误**：3 个 Sentinel 设置 quorum=3 会导致任何一个 Sentinel 故障就无法进行故障转移，推荐 quorum=2
- **Cluster 模式下的 Pub/Sub**：消息会广播到所有节点，大量频繁的 Pub/Sub 消息会浪费集群内网带宽
- **fork 导致的内存翻倍**：RDB 快照和 AOF 重写都要 fork 子进程，极端情况下内存会短暂翻倍（Copy-On-Write）；`maxmemory` 应留足余量
- **BGSAVE 和 BGREWRITEAOF 不会同时运行**：第二个会排队等待
- **volatile-* 策略的陷阱**：如果没有键设置了 TTL，这些策略等同于 `noeviction`，可能导致意外的写入拒绝
- **Cluster 扩缩容期间的性能下降**：槽迁移涉及数据复制，建议在低峰期进行
- **maxmemory 未计入复制缓冲区**：`used_memory` 不包含复制输出缓冲区和 AOF 缓冲区，实际内存占用可能高于 `maxmemory`
- **大键（Big Key）危害**：单个键存储数 MB 数据会导致删除阻塞、迁移超时、复制延迟；应拆分大键或使用 `UNLINK`（异步删除）

## 组合提示

- 搭配 **redis-core** skill 了解各数据结构命令和过期策略细节
- 搭配 **redis-python** skill 了解 Sentinel/Cluster 的 Python 客户端配置
- 搭配 **redis-patterns** skill 了解分布式锁在主从切换场景下的安全性问题（Redlock）
- 搭配 **redis-pubsub** skill 了解 Streams 在 Cluster 模式下的使用限制
