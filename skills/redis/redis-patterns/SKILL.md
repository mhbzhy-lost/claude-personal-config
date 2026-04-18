---
name: redis-patterns
description: "Redis 常见设计模式：缓存策略、分布式锁、限流、排行榜、计数器与会话存储"
tech_stack: [redis, backend]
capability: [key-value-store, task-scheduler]
---

# Redis 设计模式

> 来源：https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/ / https://redis.io/tutorials/howtos/ratelimiting/
> 版本基准：Redis 7.x

## 用途
掌握 Redis 在实际业务中的六种核心设计模式，每种模式给出 redis-cli + Python redis-py 双版本实现，覆盖缓存、并发控制、限流、排行榜等高频场景。

## 何时使用
- 数据库查询慢，需要缓存层加速
- 分布式系统中需要互斥锁
- API 需要限流防止滥用
- 需要实时排行榜或计分系统
- 需要原子计数器（PV/UV、库存扣减）
- Web 应用需要分布式会话存储

## 模式一：缓存策略

### Cache-Aside（旁路缓存）

最常用的缓存模式：先查缓存，未命中时查数据库并回填缓存。

```python
import json
import redis

r = redis.Redis(host="localhost", decode_responses=True)

def get_user(user_id: int) -> dict:
    cache_key = f"user:{user_id}"

    # 1. 查缓存
    cached = r.get(cache_key)
    if cached:
        return json.loads(cached)

    # 2. 缓存未命中，查数据库
    user = db.query_user(user_id)
    if user is None:
        # 缓存空值防止缓存穿透（短 TTL）
        r.set(cache_key, json.dumps(None), ex=60)
        return None

    # 3. 回填缓存
    r.set(cache_key, json.dumps(user), ex=3600)
    return user

def update_user(user_id: int, data: dict):
    # 先更新数据库，再删除缓存（非更新缓存）
    db.update_user(user_id, data)
    r.delete(f"user:{user_id}")
```

### Write-Through（直写缓存）

写入时同时更新缓存和数据库，读取总是命中缓存。

```python
def write_through_set(key: str, value: dict, ttl: int = 3600):
    """写入数据库和缓存（同步）"""
    db.save(key, value)
    r.set(key, json.dumps(value), ex=ttl)

def write_through_get(key: str) -> dict:
    """读取时始终从缓存获取"""
    cached = r.get(key)
    if cached:
        return json.loads(cached)
    # 缓存未命中（理论上不应发生，但需兜底）
    value = db.load(key)
    if value:
        r.set(key, json.dumps(value), ex=3600)
    return value
```

### Write-Behind（异步写回）

写入只更新缓存，异步批量写回数据库，适合高写入场景。

```python
def write_behind_set(key: str, value: dict):
    """只写缓存 + 加入待同步队列"""
    r.set(key, json.dumps(value), ex=3600)
    r.rpush("sync:queue", json.dumps({"key": key, "value": value}))

def sync_worker():
    """后台 Worker：批量写回数据库"""
    while True:
        # 阻塞等待，每次取一批
        _, item = r.blpop("sync:queue", timeout=5)
        if item:
            batch = [json.loads(item)]
            # 一次性取出队列中剩余的（最多 100 个）
            while len(batch) < 100:
                more = r.lpop("sync:queue")
                if not more:
                    break
                batch.append(json.loads(more))
            db.batch_save(batch)
```

### 缓存防护策略

```python
import random
import threading

# 1. 缓存穿透防护：布隆过滤器 + 空值缓存
def get_with_null_cache(key: str):
    cached = r.get(key)
    if cached == "NULL":
        return None
    if cached:
        return json.loads(cached)
    value = db.load(key)
    if value is None:
        r.set(key, "NULL", ex=60)  # 空值短 TTL
        return None
    r.set(key, json.dumps(value), ex=3600)
    return value

# 2. 缓存雪崩防护：TTL 加随机偏移
def set_with_jitter(key: str, value, base_ttl: int = 3600):
    jitter = random.randint(0, 300)  # 0-5 分钟随机偏移
    r.set(key, json.dumps(value), ex=base_ttl + jitter)

# 3. 缓存击穿防护：互斥锁重建
def get_with_mutex(key: str):
    cached = r.get(key)
    if cached:
        return json.loads(cached)

    lock_key = f"lock:rebuild:{key}"
    if r.set(lock_key, "1", nx=True, ex=10):  # 获取重建锁
        try:
            value = db.load(key)
            r.set(key, json.dumps(value), ex=3600)
            return value
        finally:
            r.delete(lock_key)
    else:
        # 等待重建完成后重试
        import time
        time.sleep(0.1)
        return get_with_mutex(key)
```

## 模式二：分布式锁

### 单实例锁（SET NX EX）

适用于单个 Redis 实例或对锁精度要求不高的场景。

```bash
# 获取锁：NX=不存在才创建，EX=自动过期防死锁
SET lock:order:1001 "client-uuid-abc" NX EX 30

# 释放锁（Lua 脚本保证原子性）
EVAL "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end" 1 lock:order:1001 "client-uuid-abc"
```

```python
import uuid
import time
import redis

r = redis.Redis(host="localhost", decode_responses=True)

class RedisLock:
    def __init__(self, r, name, ttl=30):
        self.r = r
        self.name = f"lock:{name}"
        self.ttl = ttl
        self.token = str(uuid.uuid4())

    def acquire(self, retry=3, retry_delay=0.2):
        for _ in range(retry):
            if self.r.set(self.name, self.token, nx=True, ex=self.ttl):
                return True
            time.sleep(retry_delay)
        return False

    def release(self):
        # Lua 脚本：仅释放自己持有的锁
        script = """
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        else
            return 0
        end
        """
        return self.r.eval(script, 1, self.name, self.token)

    def extend(self, additional_time):
        """续期锁（仅持有者可操作）"""
        script = """
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("pexpire", KEYS[1], ARGV[2])
        else
            return 0
        end
        """
        return self.r.eval(script, 1, self.name, self.token, additional_time * 1000)

    def __enter__(self):
        if not self.acquire():
            raise TimeoutError(f"Failed to acquire lock: {self.name}")
        return self

    def __exit__(self, *args):
        self.release()

# 使用
with RedisLock(r, "order:1001", ttl=30):
    process_order(1001)
```

### Redlock（多实例分布式锁）

当 Redis 有主从复制时，单实例锁可能因主从切换导致锁丢失。Redlock 要求在 N 个独立 Redis 实例中获取多数派锁。

**核心流程：**
1. 获取当前时间 T1
2. 依次向 N 个独立 Redis 实例请求锁（SET NX EX），每个请求设短超时
3. 若在 N/2+1 个实例上获锁成功，且总耗时 < TTL，则认为获锁成功
4. 锁的有效期 = TTL - (T2 - T1) - 时钟漂移
5. 获锁失败则向所有实例释放锁

```bash
# 推荐使用现有库
pip install redis-lock  # 或 pottery
```

```python
from pottery import Redlock

# 初始化（连接 3-5 个独立 Redis 实例）
masters = [
    redis.Redis(host="redis1"),
    redis.Redis(host="redis2"),
    redis.Redis(host="redis3"),
]

lock = Redlock(key="lock:critical", masters=masters, auto_release_time=30)
with lock:
    do_critical_work()
```

## 模式三：限流

### 固定窗口计数器

```bash
# 每分钟最多 100 次请求
INCR rate:user:1001:202604161030
EXPIRE rate:user:1001:202604161030 60
```

```python
import time

def is_rate_limited(user_id: str, limit: int = 100, window: int = 60) -> bool:
    key = f"rate:{user_id}:{int(time.time()) // window}"
    count = r.incr(key)
    if count == 1:
        r.expire(key, window)
    return count > limit
```

### 滑动窗口（Sorted Set）

精确滑动窗口，避免固定窗口边界突发问题。

```python
def sliding_window_rate_limit(
    user_id: str, limit: int = 100, window: int = 60
) -> bool:
    key = f"rate:sliding:{user_id}"
    now = time.time()
    window_start = now - window

    pipe = r.pipeline()
    pipe.zremrangebyscore(key, 0, window_start)  # 移除窗口外的记录
    pipe.zadd(key, {f"{now}:{uuid.uuid4().hex[:8]}": now})  # 添加当前请求
    pipe.zcard(key)                                # 统计窗口内请求数
    pipe.expire(key, window)                       # 设置过期防止内存泄漏
    _, _, count, _ = pipe.execute()

    return count > limit
```

### 令牌桶（Lua 脚本原子实现）

允许突发流量，同时控制平均速率。

```python
TOKEN_BUCKET_SCRIPT = """
local key = KEYS[1]
local max_tokens = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])  -- tokens per second
local now = tonumber(ARGV[3])

local bucket = redis.call("hmget", key, "tokens", "last_refill")
local tokens = tonumber(bucket[1]) or max_tokens
local last_refill = tonumber(bucket[2]) or now

-- 补充令牌
local elapsed = now - last_refill
local new_tokens = math.min(max_tokens, tokens + elapsed * refill_rate)

if new_tokens >= 1 then
    -- 消费一个令牌
    new_tokens = new_tokens - 1
    redis.call("hmset", key, "tokens", new_tokens, "last_refill", now)
    redis.call("expire", key, math.ceil(max_tokens / refill_rate) * 2)
    return 1  -- allowed
else
    redis.call("hmset", key, "tokens", new_tokens, "last_refill", now)
    redis.call("expire", key, math.ceil(max_tokens / refill_rate) * 2)
    return 0  -- rejected
end
"""

# 注册脚本（只传输一次，后续用 SHA 调用）
token_bucket = r.register_script(TOKEN_BUCKET_SCRIPT)

def check_rate_limit(user_id: str, max_tokens=100, refill_rate=10):
    """max_tokens=100 桶容量, refill_rate=10 每秒补充 10 个"""
    result = token_bucket(
        keys=[f"bucket:{user_id}"],
        args=[max_tokens, refill_rate, time.time()],
    )
    return result == 1  # True = allowed
```

## 模式四：排行榜

Sorted Set 天然适合排行榜：score 为分数，member 为用户标识。

```bash
# 初始化排行榜
ZADD leaderboard 1500 "player:alice" 1200 "player:bob" 1800 "player:carol"

# 加分
ZINCRBY leaderboard 100 "player:bob"

# Top 10（降序）
ZREVRANGE leaderboard 0 9 WITHSCORES

# 查看某玩家排名（0-based）
ZREVRANK leaderboard "player:bob"

# 查看某玩家分数
ZSCORE leaderboard "player:bob"

# 查看特定分数区间的玩家
ZRANGEBYSCORE leaderboard 1000 2000 WITHSCORES
```

```python
class Leaderboard:
    def __init__(self, r, name):
        self.r = r
        self.key = f"leaderboard:{name}"

    def add_score(self, user_id: str, score: float):
        self.r.zadd(self.key, {user_id: score})

    def increment_score(self, user_id: str, delta: float):
        return self.r.zincrby(self.key, delta, user_id)

    def get_rank(self, user_id: str) -> int | None:
        """返回排名（1-based），不存在返回 None"""
        rank = self.r.zrevrank(self.key, user_id)
        return rank + 1 if rank is not None else None

    def get_score(self, user_id: str) -> float | None:
        return self.r.zscore(self.key, user_id)

    def top_n(self, n: int = 10) -> list[tuple[str, float]]:
        return self.r.zrevrange(self.key, 0, n - 1, withscores=True)

    def get_around(self, user_id: str, count: int = 5) -> list:
        """获取某用户附近的排名"""
        rank = self.r.zrevrank(self.key, user_id)
        if rank is None:
            return []
        start = max(0, rank - count)
        end = rank + count
        return self.r.zrevrange(self.key, start, end, withscores=True)

    def total_players(self) -> int:
        return self.r.zcard(self.key)

# 使用
board = Leaderboard(r, "weekly")
board.add_score("player:alice", 1500)
board.increment_score("player:alice", 100)
print(board.top_n(10))
print(board.get_rank("player:alice"))
```

## 模式五：原子计数器

### 简单计数器

```bash
INCR page:views:home            # 页面 PV
PFADD page:visitors:home "user:1001"  # UV（HyperLogLog 近似）
PFCOUNT page:visitors:home      # 获取 UV 近似值
```

```python
# PV 计数
r.incr("page:views:home")
pv = int(r.get("page:views:home"))

# 每日计数器（自动过期）
from datetime import date
today = date.today().isoformat()
key = f"counter:api_calls:{today}"
r.incr(key)
r.expire(key, 86400 * 7)  # 保留 7 天

# 库存扣减（原子操作）
def deduct_stock(product_id: str, quantity: int = 1) -> bool:
    key = f"stock:{product_id}"
    script = """
    local stock = tonumber(redis.call("get", KEYS[1]) or "0")
    if stock >= tonumber(ARGV[1]) then
        redis.call("decrby", KEYS[1], ARGV[1])
        return 1
    else
        return 0
    end
    """
    return r.eval(script, 1, key, quantity) == 1
```

## 模式六：会话存储

### Hash-Based 会话

```bash
# 创建会话
HSET session:abc123 user_id 1001 username "alice" role "admin" created_at "2024-01-01T00:00:00"
EXPIRE session:abc123 1800  # 30 分钟过期

# 读取
HGETALL session:abc123

# 续期（每次访问时）
EXPIRE session:abc123 1800

# 销毁
DEL session:abc123
```

```python
import json
import uuid
import time

class RedisSessionStore:
    def __init__(self, r, ttl=1800, prefix="session:"):
        self.r = r
        self.ttl = ttl
        self.prefix = prefix

    def create(self, data: dict) -> str:
        session_id = uuid.uuid4().hex
        key = f"{self.prefix}{session_id}"
        self.r.hset(key, mapping={
            k: json.dumps(v) if not isinstance(v, str) else v
            for k, v in data.items()
        })
        self.r.expire(key, self.ttl)
        return session_id

    def get(self, session_id: str) -> dict | None:
        key = f"{self.prefix}{session_id}"
        data = self.r.hgetall(key)
        if not data:
            return None
        self.r.expire(key, self.ttl)  # 续期
        return data

    def update(self, session_id: str, data: dict):
        key = f"{self.prefix}{session_id}"
        if self.r.exists(key):
            self.r.hset(key, mapping={
                k: json.dumps(v) if not isinstance(v, str) else v
                for k, v in data.items()
            })
            self.r.expire(key, self.ttl)

    def destroy(self, session_id: str):
        self.r.delete(f"{self.prefix}{session_id}")

# 使用
store = RedisSessionStore(r)
sid = store.create({"user_id": "1001", "username": "alice"})
session = store.get(sid)
store.destroy(sid)
```

## 常见陷阱

- **Cache-Aside 删缓存的时序**：先删缓存再更新数据库会导致脏数据（并发读），正确做法是先更新数据库再删缓存
- **分布式锁释放必须验证持有者**：不带 Lua 脚本的 `DEL` 可能删除其他客户端的锁（锁已过期被重新获取的情况）
- **锁续期不能无限续**：如果业务逻辑 bug 导致死循环，无限续期等于死锁；应设置最大续期次数
- **固定窗口限流的边界突发**：窗口切换瞬间可能允许 2 倍请求通过，滑动窗口更精确但内存开销更大
- **Lua 脚本性能**：Lua 执行期间 Redis 是阻塞的，脚本应尽可能简短；禁止在 Lua 中做网络请求或文件 I/O
- **排行榜分数精度**：Sorted Set 的 score 是 64 位浮点数，超大整数（>2^53）会丢失精度
- **会话续期风暴**：每次请求都 `EXPIRE` 续期会产生大量写操作，可以只在 TTL 剩余不足一半时续期
- **Redlock 不适用于要求强一致的场景**：存在时钟漂移导致安全性破坏的理论风险（见 Martin Kleppmann 的批评），关键业务应搭配 fencing token

## 组合提示

- 搭配 **redis-core** skill 了解各数据结构的底层命令和时间复杂度
- 搭配 **redis-python** skill 了解 Pipeline/事务的 Python 实现细节
- 搭配 **redis-pubsub** skill 将缓存失效事件通过 Pub/Sub 广播给其他节点
- 搭配 **redis-cluster** skill 了解分布式场景下这些模式的限制（如跨 slot 事务）
