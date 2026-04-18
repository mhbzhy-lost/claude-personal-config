---
name: redis-core
description: "Redis 五种基本数据结构、命令速查、过期策略、键空间通知与关键配置"
tech_stack: [redis, backend]
capability: [key-value-store]
---

# Redis 核心数据结构与基础操作

> 来源：https://redis.io/docs/latest/develop/data-types/
> 版本基准：Redis 7.x

## 用途
掌握 Redis 五种基本数据结构（String/List/Set/Sorted Set/Hash）的命令、过期策略、键空间通知及 redis.conf 核心配置，覆盖日常开发 80% 场景。

## 何时使用
- 需要快速 K-V 存取（缓存、会话、配置）
- 需要原子计数器、分布式 ID
- 需要队列、栈、排行榜等数据结构
- 需要对键的生命周期做精细控制
- 需要监听键变更事件驱动业务逻辑

## String（字符串）

最基础的数据类型，本质是二进制安全的字节序列，最大 512 MB。

### 常用命令速查

| 命令 | 说明 | 时间复杂度 |
|------|------|-----------|
| `SET key value [EX s] [PX ms] [NX\|XX]` | 设置值，可附带过期和条件 | O(1) |
| `GET key` | 获取值 | O(1) |
| `MSET k1 v1 k2 v2 ...` | 批量设置 | O(N) |
| `MGET k1 k2 ...` | 批量获取 | O(N) |
| `INCR key` / `INCRBY key n` | 原子自增 | O(1) |
| `DECR key` / `DECRBY key n` | 原子自减 | O(1) |
| `INCRBYFLOAT key n` | 浮点自增 | O(1) |
| `APPEND key value` | 追加字符串 | O(1) |
| `STRLEN key` | 获取长度 | O(1) |
| `SETNX key value` | 仅键不存在时设置（已被 SET NX 取代） | O(1) |
| `GETSET key value` | 设置新值并返回旧值（已被 GETDEL/SET GET 取代） | O(1) |
| `SETRANGE key offset value` | 覆盖指定偏移量 | O(1) |
| `GETRANGE key start end` | 获取子串 | O(N) |

### redis-cli 示例

```bash
# 基本存取
SET user:1001:name "Alice" EX 3600    # 设置并 1 小时过期
GET user:1001:name                     # => "Alice"

# 原子计数器
SET page:views 0
INCR page:views                        # => 1
INCRBY page:views 10                   # => 11

# 条件设置（分布式锁基础）
SET lock:order NX EX 30               # 仅不存在时设置，30 秒过期
```

### Python redis-py 示例

```python
import redis

r = redis.Redis(host="localhost", port=6379, decode_responses=True)

# 基本存取
r.set("user:1001:name", "Alice", ex=3600)
name = r.get("user:1001:name")  # => "Alice"

# 原子计数
r.set("page:views", 0)
r.incr("page:views")        # => 1
r.incrby("page:views", 10)  # => 11

# 批量操作（减少网络往返）
r.mset({"k1": "v1", "k2": "v2", "k3": "v3"})
values = r.mget("k1", "k2", "k3")  # => ["v1", "v2", "v3"]
```

## List（列表）

双向链表，支持头尾 O(1) 插入/弹出，适合队列、栈、最近操作记录。

### 常用命令速查

| 命令 | 说明 | 时间复杂度 |
|------|------|-----------|
| `LPUSH key v1 [v2 ...]` | 左端插入 | O(N) |
| `RPUSH key v1 [v2 ...]` | 右端插入 | O(N) |
| `LPOP key [count]` | 左端弹出 | O(N) |
| `RPOP key [count]` | 右端弹出 | O(N) |
| `LRANGE key start stop` | 获取范围（0-based，-1 表示末尾） | O(S+N) |
| `LLEN key` | 获取长度 | O(1) |
| `LINDEX key index` | 按索引获取 | O(N) |
| `LSET key index value` | 按索引设置 | O(N) |
| `LREM key count value` | 移除匹配元素 | O(N+M) |
| `LTRIM key start stop` | 只保留指定范围 | O(N) |
| `BLPOP key [key ...] timeout` | 阻塞左弹出 | O(N) |
| `BRPOP key [key ...] timeout` | 阻塞右弹出 | O(N) |
| `LMOVE src dst LEFT\|RIGHT LEFT\|RIGHT` | 原子移动（替代 RPOPLPUSH） | O(1) |

### redis-cli 示例

```bash
# 消息队列模式（FIFO）
RPUSH queue:tasks "task1" "task2" "task3"
LPOP queue:tasks           # => "task1"

# 阻塞弹出（消费者等待）
BLPOP queue:tasks 30       # 等待最多 30 秒

# 最近操作记录（保留最近 100 条）
LPUSH recent:user:1001 "action_data"
LTRIM recent:user:1001 0 99
LRANGE recent:user:1001 0 9   # 最近 10 条
```

### Python redis-py 示例

```python
# 简单任务队列
r.rpush("queue:tasks", "task1", "task2", "task3")
task = r.lpop("queue:tasks")  # => "task1"

# 阻塞消费
result = r.blpop("queue:tasks", timeout=30)  # => ("queue:tasks", "task2")

# 保留最近 N 条记录
r.lpush("recent:user:1001", "login_event")
r.ltrim("recent:user:1001", 0, 99)
```

## Hash（哈希）

字段-值映射表，适合存储对象，单个 Hash 最多 2^32 - 1 个字段。

### 常用命令速查

| 命令 | 说明 | 时间复杂度 |
|------|------|-----------|
| `HSET key field value [f v ...]` | 设置一个或多个字段 | O(N) |
| `HGET key field` | 获取字段值 | O(1) |
| `HMGET key f1 f2 ...` | 批量获取 | O(N) |
| `HGETALL key` | 获取所有字段和值 | O(N) |
| `HDEL key f1 [f2 ...]` | 删除字段 | O(N) |
| `HEXISTS key field` | 字段是否存在 | O(1) |
| `HLEN key` | 字段数量 | O(1) |
| `HKEYS key` / `HVALS key` | 所有字段名/值 | O(N) |
| `HINCRBY key field n` | 字段原子自增 | O(1) |
| `HSCAN key cursor [MATCH pattern] [COUNT n]` | 增量遍历 | O(1)/调用 |

### redis-cli 示例

```bash
# 存储用户对象
HSET user:1001 name "Alice" age 30 email "alice@example.com"
HGET user:1001 name            # => "Alice"
HGETALL user:1001              # => name Alice age 30 email alice@example.com

# 部分更新
HSET user:1001 age 31
HINCRBY user:1001 login_count 1
```

### Python redis-py 示例

```python
# 存储结构化数据
r.hset("user:1001", mapping={
    "name": "Alice",
    "age": 30,
    "email": "alice@example.com"
})
user = r.hgetall("user:1001")
# => {"name": "Alice", "age": "30", "email": "alice@example.com"}

# 注意：所有值返回为字符串，需自行转换类型
age = int(r.hget("user:1001", "age"))
```

## Set（集合）

无序去重集合，支持交/并/差集运算。

### 常用命令速查

| 命令 | 说明 | 时间复杂度 |
|------|------|-----------|
| `SADD key m1 [m2 ...]` | 添加成员 | O(N) |
| `SREM key m1 [m2 ...]` | 移除成员 | O(N) |
| `SISMEMBER key member` | 是否为成员 | O(1) |
| `SMISMEMBER key m1 m2 ...` | 批量检查成员 | O(N) |
| `SMEMBERS key` | 所有成员 | O(N) |
| `SCARD key` | 成员数量 | O(1) |
| `SRANDMEMBER key [count]` | 随机获取 | O(N) |
| `SPOP key [count]` | 随机弹出 | O(N) |
| `SINTER k1 k2 ...` | 交集 | O(N*M) |
| `SUNION k1 k2 ...` | 并集 | O(N) |
| `SDIFF k1 k2 ...` | 差集 | O(N) |

### redis-cli 示例

```bash
# 标签系统
SADD article:1001:tags "python" "redis" "backend"
SISMEMBER article:1001:tags "redis"    # => 1

# 共同关注
SADD user:1:follows "alice" "bob" "carol"
SADD user:2:follows "bob" "carol" "dave"
SINTER user:1:follows user:2:follows   # => bob carol
```

## Sorted Set（有序集合）

按 score 排序的去重集合，排行榜首选。

### 常用命令速查

| 命令 | 说明 | 时间复杂度 |
|------|------|-----------|
| `ZADD key score member [s m ...]` | 添加/更新成员 | O(log N) |
| `ZSCORE key member` | 获取分数 | O(1) |
| `ZRANK key member` | 获取排名（升序，0-based） | O(log N) |
| `ZREVRANK key member` | 获取排名（降序） | O(log N) |
| `ZRANGE key start stop [BYSCORE\|BYLEX] [REV] [LIMIT]` | 范围查询 | O(log N + M) |
| `ZRANGEBYSCORE key min max [LIMIT]` | 按分数范围（旧版） | O(log N + M) |
| `ZINCRBY key increment member` | 分数自增 | O(log N) |
| `ZREM key m1 [m2 ...]` | 移除成员 | O(M*log N) |
| `ZCARD key` | 成员数量 | O(1) |
| `ZCOUNT key min max` | 分数范围内的数量 | O(log N) |
| `ZPOPMIN key [count]` / `ZPOPMAX key [count]` | 弹出最小/最大 | O(M*log N) |

### redis-cli 示例

```bash
# 排行榜
ZADD leaderboard 1000 "player:alice" 850 "player:bob" 1200 "player:carol"
ZREVRANGE leaderboard 0 2 WITHSCORES   # Top 3（降序）
ZINCRBY leaderboard 50 "player:bob"     # Bob 加 50 分
ZREVRANK leaderboard "player:bob"       # Bob 的排名
```

### Python redis-py 示例

```python
# 排行榜
r.zadd("leaderboard", {"player:alice": 1000, "player:bob": 850, "player:carol": 1200})
top3 = r.zrevrange("leaderboard", 0, 2, withscores=True)
# => [("player:carol", 1200.0), ("player:alice", 1000.0), ("player:bob", 850.0)]

r.zincrby("leaderboard", 50, "player:bob")
rank = r.zrevrank("leaderboard", "player:bob")  # 0-based
```

## 过期策略（TTL/EXPIRE）

### 命令

| 命令 | 说明 |
|------|------|
| `EXPIRE key seconds` | 设置秒级过期 |
| `PEXPIRE key milliseconds` | 设置毫秒级过期 |
| `EXPIREAT key unix-timestamp` | 设置绝对过期时间（秒） |
| `PEXPIREAT key unix-ms-timestamp` | 设置绝对过期时间（毫秒） |
| `TTL key` | 剩余秒数（-1 永不过期，-2 不存在） |
| `PTTL key` | 剩余毫秒数 |
| `PERSIST key` | 移除过期时间 |
| `EXPIRETIME key` | 返回绝对过期时间戳（Redis 7.0+） |

### 过期机制原理

Redis 采用**惰性删除 + 定期采样删除**双策略：
- **惰性删除**：访问键时检查是否过期，过期则删除
- **定期删除**：每秒 10 次（可配置 `hz`），随机采样 20 个带过期的键，删除已过期的；若过期比例 > 25%，重复此过程

```bash
# redis.conf 配置采样频率
hz 10              # 默认 10，范围 1-500

# 设置过期
SET session:abc "data" EX 1800    # 30 分钟
EXPIRE session:abc 1800           # 等效

# 检查剩余时间
TTL session:abc                   # => 1798
```

```python
r.set("session:abc", "data", ex=1800)
r.expire("session:abc", 1800)     # 也可单独设置
ttl = r.ttl("session:abc")        # => 1798
r.persist("session:abc")          # 移除过期
```

## 键空间通知（Keyspace Notifications）

允许客户端订阅键变更事件。默认关闭，需显式开启。

### 配置

```bash
# redis.conf
notify-keyspace-events "KEA"

# 运行时设置
CONFIG SET notify-keyspace-events KEA
```

事件标志位：

| 标志 | 说明 |
|------|------|
| `K` | Keyspace 事件（`__keyspace@<db>__:<key>`） |
| `E` | Keyevent 事件（`__keyevent@<db>__:<event>`） |
| `g` | 通用命令（DEL, EXPIRE, RENAME...） |
| `$` | String 命令 |
| `l` | List 命令 |
| `s` | Set 命令 |
| `h` | Hash 命令 |
| `z` | Sorted Set 命令 |
| `x` | 过期事件 |
| `e` | 驱逐事件 |
| `A` | `g$lshzxe` 的别名（所有事件） |

### 监听过期事件示例

```bash
# 终端 1：订阅所有过期事件
SUBSCRIBE __keyevent@0__:expired

# 终端 2：设置一个 5 秒过期的键
SET temp:data "hello" EX 5
# 5 秒后终端 1 收到: message __keyevent@0__:expired temp:data
```

```python
import redis

r = redis.Redis(decode_responses=True)
pubsub = r.pubsub()
pubsub.subscribe("__keyevent@0__:expired")

for message in pubsub.listen():
    if message["type"] == "message":
        expired_key = message["data"]
        print(f"Key expired: {expired_key}")
```

## redis.conf 关键配置

```ini
# === 网络 ===
bind 127.0.0.1 -::1         # 绑定地址，生产环境按需配置
port 6379                    # 监听端口
timeout 0                    # 客户端空闲超时（0=不超时）
tcp-keepalive 300            # TCP keepalive 间隔（秒）

# === 内存 ===
maxmemory 256mb              # 最大内存限制（64位默认无限制）
maxmemory-policy allkeys-lru # 内存满时的淘汰策略
maxmemory-samples 5          # LRU/LFU 采样数量

# === 持久化（详见 redis-cluster skill） ===
save 3600 1 300 100 60 10000 # RDB 快照触发条件
appendonly yes               # 开启 AOF
appendfsync everysec         # AOF fsync 策略

# === 安全 ===
requirepass yourpassword     # 连接密码
# ACL（Redis 6+）
# user default on >password ~* +@all

# === 性能 ===
hz 10                        # 后台任务频率
databases 16                 # 数据库数量（默认 16）
lazyfree-lazy-eviction yes   # 异步释放驱逐键的内存
lazyfree-lazy-expire yes     # 异步释放过期键的内存
```

## 常见陷阱

- **KEYS 命令禁止在生产使用**：`KEYS *` 会阻塞 Redis 遍历所有键，应使用 `SCAN` 增量迭代
- **HGETALL/SMEMBERS 大集合风险**：元素过多时阻塞主线程，优先用 `HSCAN`/`SSCAN`
- **过期只能设在键级别**：Hash 的单个 field 不能独立设置过期，需要应用层管理或拆分为独立键
- **EXPIRE 会被 SET 重置**：`SET key value` 不带 EX/PX 会清除已有 TTL，需使用 `SET key value KEEPTTL`（Redis 6.0+）
- **整数值范围**：INCR/DECR 操作的值范围是 64 位有符号整数（-2^63 ~ 2^63-1），超出报错
- **键空间通知不保证送达**：基于 Pub/Sub，客户端断线期间的事件会丢失，不可用于关键业务流程
- **volatile 淘汰策略陷阱**：如果没有键设置过期时间，`volatile-*` 策略等同于 `noeviction`

## 组合提示

- 搭配 **redis-python** skill 了解 Python 客户端连接管理与 Pipeline 批量操作
- 搭配 **redis-patterns** skill 了解基于这些数据结构的常见设计模式（缓存、锁、限流）
- 搭配 **redis-cluster** skill 了解持久化、内存管理与高可用部署
- 搭配 **redis-pubsub** skill 了解 Pub/Sub 与 Streams 的消息模型
