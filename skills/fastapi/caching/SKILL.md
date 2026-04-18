---
name: fastapi-caching
description: FastAPI 端点缓存方案——fastapi-cache2 装饰器模式与手动 Redis 缓存模式
tech_stack: [fastapi, redis, fastapi-cache2]
language: [python]
capability: [key-value-store]
version: "fastapi-cache2 0.2.2"
collected_at: 2026-04-18
---

# FastAPI 缓存（fastapi-cache2 / 手动 Redis）

> 来源：https://github.com/long2ice/fastapi-cache 、https://redis.io/tutorials/develop/python/fastapi/

## 用途
缓存 FastAPI 端点或函数的返回值，支持 Redis、Memcached、DynamoDB、内存后端。fastapi-cache2 提供装饰器一键接入；需要精细控制（后台写缓存、时序数据、复杂序列化）时走手动 Redis。

## 何时使用
- 只想给端点加 TTL 缓存 → fastapi-cache2 `@cache(expire=60)`
- 需要后台 prime 缓存 / Redis TimeSeries / 自定义 key schema → 手动 `redis.asyncio`
- 幂等 GET、热点查询、LLM 结果缓存

## 基础用法

### fastapi-cache2
```bash
pip install "fastapi-cache2[redis]"
```

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi_cache import FastAPICache
from fastapi_cache.backends.redis import RedisBackend
from fastapi_cache.decorator import cache
from redis import asyncio as aioredis

@asynccontextmanager
async def lifespan(_: FastAPI):
    redis = aioredis.from_url("redis://localhost")
    FastAPICache.init(RedisBackend(redis), prefix="fastapi-cache")
    yield

app = FastAPI(lifespan=lifespan)

@app.get("/")
@cache(expire=60)
async def index():
    return {"hello": "world"}
```

### 手动 Redis + 后台写缓存
```python
import redis.asyncio, json
from fastapi import BackgroundTasks

@app.on_event("startup")
async def init():
    app.redis_client = redis.asyncio.from_url("redis://localhost")

async def set_cache(summary):
    await app.redis_client.set("summary", json.dumps(summary, default=str), ex=120)

@app.get("/data")
async def get_data(background_tasks: BackgroundTasks):
    data = await app.redis_client.get("summary")
    if data:
        return json.loads(data)
    summary = await compute()
    background_tasks.add_task(set_cache, summary)
    return summary
```

## 关键 API（`@cache` 参数）
| 参数 | 说明 |
|---|---|
| `expire` | TTL 秒数 |
| `namespace` | 缓存命名空间 |
| `coder` | 编解码器（默认 `JsonCoder`，可换 `PickleCoder` / 自定义 `ORJsonCoder`） |
| `key_builder` | 自定义 key 生成函数，签名 `(func, namespace, *, request, response, *args, **kwargs)` |
| `cache_status_header` | 响应头名（默认 `X-FastAPI-Cache`，值 HIT/MISS） |

后端：`RedisBackend(redis)`、`InMemoryBackend()`、`MemcacheBackend`、`DynamoBackend`。

## 注意事项
- **RedisBackend 必须 `decode_responses=False`**（默认即如此），否则二进制缓存被错误解码
- **InMemoryBackend 过期键只在访问时清理**，不主动淘汰，注意内存
- **aioredis 已废弃**：使用 `from redis import asyncio as aioredis`，redis-py 内置 async
- **复杂类型需自定义 coder**：datetime、Pydantic 嵌套等可用 orjson + `jsonable_encoder`
- **写缓存用 BackgroundTasks**：避免阻塞响应
- **装饰器顺序**：`@app.get` 必须在 `@cache` 之上

## 组合提示
配合 `slowapi` 做限流、OpenTelemetry 追踪缓存命中率；Redis TimeSeries（`TS.CREATE`/`TS.MADD`/`TS.RANGE`）可通过 `execute_command` 直接调用。
