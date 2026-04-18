---
name: redis-python
description: "redis-py 客户端连接管理、Pipeline、事务、异步客户端与序列化策略"
tech_stack: [redis, backend]
language: [python]
capability: [key-value-store]
---

# Redis Python 客户端（redis-py）

> 来源：https://redis.io/docs/latest/develop/clients/redis-py/ / https://redis.readthedocs.io/en/stable/
> 版本基准：redis-py 5.x+ (支持 Redis 7.x)

## 用途
使用 Python 连接和操作 Redis，掌握连接池、Pipeline 批量命令、事务、异步客户端及序列化策略，覆盖 Python 后端开发的 Redis 集成需求。

## 何时使用
- Python Web 应用需要 Redis 缓存/会话存储
- 需要批量执行 Redis 命令以减少网络往返
- 需要乐观锁事务保证数据一致性
- 异步框架（FastAPI/aiohttp）中集成 Redis
- 需要在 Redis 中存取复杂 Python 对象

## 安装

```bash
# 基础安装
pip install redis

# 推荐：带 hiredis C 解析器（性能提升 10x）
pip install redis[hiredis]
```

## 连接管理

### 基本连接

```python
import redis

# 方式一：参数连接
r = redis.Redis(
    host="localhost",
    port=6379,
    db=0,
    password="yourpassword",    # 可选
    decode_responses=True,       # 返回 str 而非 bytes
    socket_timeout=5,            # 命令超时（秒）
    socket_connect_timeout=5,    # 连接超时（秒）
)

# 方式二：URL 连接
r = redis.from_url(
    "redis://:password@localhost:6379/0",
    decode_responses=True,
)

# 方式三：Unix Socket
r = redis.Redis(unix_socket_path="/var/run/redis/redis.sock")

# 验证连接
r.ping()  # => True
```

### ConnectionPool（连接池）

redis-py 默认为每个 `Redis()` 实例创建独立连接池。需要跨模块共享连接时，显式创建连接池。

```python
import redis

# 创建共享连接池
pool = redis.ConnectionPool(
    host="localhost",
    port=6379,
    db=0,
    max_connections=50,          # 最大连接数（默认 2**31）
    decode_responses=True,
    socket_timeout=5,
    retry_on_timeout=True,       # 超时自动重试
    health_check_interval=30,    # 每 30 秒检查连接健康
)

# 多个客户端共享同一连接池
client1 = redis.Redis(connection_pool=pool)
client2 = redis.Redis(connection_pool=pool)

# URL 方式创建连接池
pool = redis.ConnectionPool.from_url(
    "redis://localhost:6379/0",
    max_connections=50,
    decode_responses=True,
)

# 关闭连接池（应用退出时）
pool.disconnect()
```

### SSL/TLS 连接

```python
r = redis.Redis(
    host="redis.example.com",
    port=6380,
    ssl=True,
    ssl_certfile="/path/to/client.crt",
    ssl_keyfile="/path/to/client.key",
    ssl_ca_certs="/path/to/ca.crt",
)
```

## Pipeline（批量命令）

Pipeline 将多个命令打包为一次网络请求发送，显著降低延迟。

### 基本用法

```python
# 不使用 Pipeline：N 条命令 = N 次网络往返
for i in range(1000):
    r.set(f"key:{i}", f"value:{i}")  # 1000 次往返

# 使用 Pipeline：N 条命令 = 1 次网络往返
pipe = r.pipeline(transaction=False)  # 非事务模式
for i in range(1000):
    pipe.set(f"key:{i}", f"value:{i}")
results = pipe.execute()  # 一次性发送，返回所有结果列表
# results: [True, True, True, ...]
```

### 链式调用

```python
pipe = r.pipeline(transaction=False)
results = (
    pipe
    .set("name", "Alice")
    .set("age", 30)
    .get("name")
    .get("age")
    .execute()
)
# results: [True, True, "Alice", "30"]
```

### 上下文管理器

```python
with r.pipeline(transaction=False) as pipe:
    pipe.set("k1", "v1")
    pipe.set("k2", "v2")
    pipe.get("k1")
    results = pipe.execute()
    # 离开 with 块时自动 reset pipeline
```

### 分批执行（大量命令）

```python
def chunked_pipeline(r, commands, chunk_size=1000):
    """将大量命令分批执行，避免内存暴涨"""
    results = []
    pipe = r.pipeline(transaction=False)
    for i, (method, args, kwargs) in enumerate(commands):
        getattr(pipe, method)(*args, **kwargs)
        if (i + 1) % chunk_size == 0:
            results.extend(pipe.execute())
    if len(pipe):  # 处理剩余
        results.extend(pipe.execute())
    return results
```

## 事务（Transaction）

Pipeline 默认启用事务模式（`transaction=True`），用 MULTI/EXEC 包裹命令，保证原子执行。

### 基本事务

```python
# 事务模式（默认）：所有命令在 MULTI/EXEC 中原子执行
pipe = r.pipeline()  # transaction=True 是默认值
pipe.set("account:alice:balance", 100)
pipe.set("account:bob:balance", 200)
pipe.execute()  # 要么全部成功，要么全部不执行
```

### WATCH + 乐观锁

用于 check-and-set 场景：读取值、计算、写入，期间如果键被其他客户端修改则重试。

```python
# 场景：转账——从 Alice 转 50 到 Bob
def transfer(r, src, dst, amount):
    with r.pipeline() as pipe:
        while True:
            try:
                # 1. WATCH 源账户
                pipe.watch(src)

                # 2. 读取当前余额（WATCH 后的命令立即执行）
                balance = int(pipe.get(src))
                if balance < amount:
                    pipe.unwatch()
                    raise ValueError("Insufficient funds")

                # 3. 开始事务缓冲
                pipe.multi()
                pipe.decrby(src, amount)
                pipe.incrby(dst, amount)

                # 4. 执行：若 src 在此期间被修改，抛 WatchError
                pipe.execute()
                return True

            except redis.WatchError:
                # 被其他客户端修改，自动重试
                continue

transfer(r, "account:alice:balance", "account:bob:balance", 50)
```

### transaction() 便捷方法

```python
def transfer_fn(pipe):
    """传入的 pipe 已经 WATCH 了指定 key"""
    balance = int(pipe.get("account:alice:balance"))
    if balance < 50:
        raise ValueError("Insufficient funds")
    pipe.multi()
    pipe.decrby("account:alice:balance", 50)
    pipe.incrby("account:bob:balance", 50)

# 自动处理 WATCH、执行和 WatchError 重试
r.transaction(transfer_fn, "account:alice:balance")
```

## 异步客户端（redis.asyncio）

redis-py 4.2+ 内置异步支持（合并了原 aioredis 项目），无需额外安装。

### 基本异步连接

```python
import redis.asyncio as aioredis

async def main():
    # 创建异步客户端
    r = aioredis.from_url(
        "redis://localhost:6379",
        decode_responses=True,
        max_connections=50,
    )

    await r.set("key", "value")
    value = await r.get("key")  # => "value"

    # 关闭连接（重要！）
    await r.aclose()

import asyncio
asyncio.run(main())
```

### 异步连接池

```python
import redis.asyncio as aioredis

async def main():
    pool = aioredis.ConnectionPool.from_url(
        "redis://localhost:6379",
        max_connections=50,
        decode_responses=True,
    )
    r = aioredis.Redis(connection_pool=pool)

    await r.set("key", "value")
    value = await r.get("key")

    await r.aclose()
    await pool.aclose()  # 关闭连接池
```

### 异步 Pipeline

```python
async def batch_ops(r):
    async with r.pipeline(transaction=True) as pipe:
        results = await (
            pipe
            .set("k1", "v1")
            .set("k2", "v2")
            .get("k1")
            .get("k2")
            .execute()
        )
    return results
    # => [True, True, "v1", "v2"]
```

### 异步 Pub/Sub

```python
import redis.asyncio as aioredis
import asyncio

async def reader(pubsub):
    """异步消息读取协程"""
    async for message in pubsub.listen():
        if message["type"] == "message":
            print(f"Received: {message['data']}")
            if message["data"] == "quit":
                break

async def main():
    r = aioredis.from_url("redis://localhost", decode_responses=True)
    pubsub = r.pubsub()
    await pubsub.subscribe("channel:1")

    # 启动读取协程
    reader_task = asyncio.create_task(reader(pubsub))

    # 发布消息
    await r.publish("channel:1", "hello")
    await r.publish("channel:1", "quit")

    await reader_task
    await pubsub.aclose()
    await r.aclose()
```

## 序列化策略

Redis 只存储字节/字符串，复杂 Python 对象需要序列化。

### JSON（推荐：可读性好、跨语言兼容）

```python
import json
import redis

r = redis.Redis(host="localhost", decode_responses=True)

# 存储
user = {"name": "Alice", "age": 30, "tags": ["admin", "active"]}
r.set("user:1001", json.dumps(user))

# 读取
user = json.loads(r.get("user:1001"))

# 搭配 Hash
r.hset("user:1001", mapping={
    "profile": json.dumps({"name": "Alice", "age": 30}),
    "settings": json.dumps({"theme": "dark"}),
})
```

### msgpack（推荐：体积小、速度快）

```bash
pip install msgpack
```

```python
import msgpack
import redis

r = redis.Redis(host="localhost")  # 注意：不用 decode_responses

# 存储（二进制格式，比 JSON 小 30-50%）
data = {"name": "Alice", "scores": [95, 87, 92]}
r.set("user:1001:data", msgpack.packb(data))

# 读取
data = msgpack.unpackb(r.get("user:1001:data"), raw=False)
```

### 序列化选型对比

| 方案 | 体积 | 速度 | 可读性 | 跨语言 | 适用场景 |
|------|------|------|--------|--------|---------|
| JSON | 大 | 中 | 好 | 优 | 默认选择，调试友好 |
| msgpack | 小 | 快 | 无 | 优 | 高频读写、带宽敏感 |
| pickle | 中 | 快 | 无 | 仅 Python | 仅限纯 Python 环境 |
| orjson | 大 | 极快 | 好 | 优 | JSON 但需要极致性能 |

### 自定义序列化封装

```python
import json
from functools import wraps

class RedisJSON:
    """封装 JSON 序列化的 Redis 操作"""

    def __init__(self, redis_client):
        self.r = redis_client

    def set(self, key, value, **kwargs):
        return self.r.set(key, json.dumps(value, default=str), **kwargs)

    def get(self, key):
        data = self.r.get(key)
        return json.loads(data) if data else None

    def hset_json(self, name, key, value):
        return self.r.hset(name, key, json.dumps(value, default=str))

    def hget_json(self, name, key):
        data = self.r.hget(name, key)
        return json.loads(data) if data else None
```

## 常见陷阱

- **忘记 `decode_responses=True`**：默认返回 `bytes`（如 `b"value"`），在字符串比较时产生 Bug；但如果需要存取二进制数据（图片/msgpack），则不要设置此参数
- **连接池耗尽无提示**：默认 `max_connections` 极大，但实际受 OS fd 限制；生产环境务必设置合理上限并监控 `pool._in_use_connections`
- **Pipeline 错误处理**：`execute()` 返回列表，其中某条命令失败不会抛异常，而是在结果列表中对应位置放一个 `ResponseError` 对象，必须逐个检查
- **WATCH 后不能执行写命令**：`pipe.watch()` 后、`pipe.multi()` 前只能执行读命令；写命令会立即执行而非进入事务缓冲
- **异步客户端必须显式关闭**：不调用 `await r.aclose()` 会导致连接泄漏和 `RuntimeWarning`
- **pickle 安全风险**：反序列化不受信任的数据可导致任意代码执行，绝不要对外部输入使用 pickle
- **单个 Pipeline 命令过多**：一次性缓冲数十万条命令会占用大量内存，应分批执行（如每 1000 条一批）
- **Redis Cluster 中 Pipeline 限制**：跨 slot 的 key 不能在同一个事务 Pipeline 中，redis-py-cluster 会自动拆分但不保证原子性

## 组合提示

- 搭配 **redis-core** skill 查阅具体命令语法和数据结构特性
- 搭配 **redis-patterns** skill 了解 Python 实现的分布式锁、缓存模式和限流
- 搭配 **redis-pubsub** skill 了解异步 Pub/Sub 和 Streams 消费者组的 Python 实现
- 搭配 **redis-cluster** skill 了解 redis-py 连接 Sentinel/Cluster 的配置方式
