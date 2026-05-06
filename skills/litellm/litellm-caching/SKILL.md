---
name: litellm-caching
description: Response caching for litellm with 8 backends (in-memory, Redis, Disk, S3, GCS, Azure Blob, Redis Semantic, Qdrant Semantic) and per-request cache controls.
tech_stack: [litellm]
language: [python]
capability: [key-value-store, data-fetching, llm-client]
version: "litellm unversioned"
collected_at: 2025-07-16
---

# LiteLLM Caching

> Source: https://docs.litellm.ai/docs/caching/all_caches, https://docs.litellm.ai/docs/proxy/caching

## Purpose

LiteLLM caches LLM responses to save costs and reduce latency. Identical requests return the cached `ModelResponse` instead of calling the LLM API. The default cache key is computed from `model` + `messages` + `temperature` + `logit_bias`. Semantic caching (Redis/Qdrant) uses embedding similarity for cache hits on semantically similar queries.

## When to Use

- Repeated identical requests that shouldn't hit the LLM each time
- Cost reduction in agent loops where the same tool call repeats
- Multi-instance deployments needing shared cache (Redis, S3, GCS)
- Semantic caching for "similar enough" queries
- Persisting cache across restarts (Disk cache)

## Basic Usage

### Quick Start — In-Memory (SDK)

```python
import litellm
from litellm.caching.caching import Cache

litellm.cache = Cache()  # type="local" in-memory, no dependencies

response1 = litellm.completion(
    model="gpt-3.5-turbo",
    messages=[{"role": "user", "content": "Tell me a joke."}],
    caching=True,          # required for SDK; proxy auto-caches
)
response2 = litellm.completion(
    model="gpt-3.5-turbo",
    messages=[{"role": "user", "content": "Tell me a joke."}],
    caching=True,
)
# response1 == response2 — second call returns cached result
```

### Cache Backend Quick Reference

| Backend | `type` | Shared? | Persists? | Key Dependency |
|---------|--------|---------|-----------|----------------|
| In-Memory | `"local"` | No | No | None |
| Redis | `"redis"` | Yes | Yes | `redis` |
| Disk | `"disk"` | No | Yes | `litellm[caching]` |
| S3 | `"s3"` | Yes | Yes | `boto3` |
| GCS | `"gcs"` | Yes | Yes | env vars |
| Azure Blob | `"azure-blob"` | Yes | Yes | `azure-storage-blob` |
| Redis Semantic | `"redis-semantic"` | Yes | Yes | `redisvl==0.4.1` |
| Qdrant Semantic | `"qdrant-semantic"` | Yes | Yes | env vars |

### Redis Cache (Most Common Production Choice)

```python
# From env vars:
# export REDIS_HOST=...
# export REDIS_PORT=6379
# export REDIS_PASSWORD=...

litellm.cache = Cache(
    type="redis",
    host=os.environ["REDIS_HOST"],
    port=os.environ["REDIS_PORT"],
    password=os.environ["REDIS_PASSWORD"],
    ttl=600,                                     # optional global TTL
    namespace="myapp",                            # optional key prefix
)
```

**Redis Cluster**:
```python
from litellm.caching.redis_cluster_cache import RedisClusterCache
litellm.cache = RedisClusterCache(
    startup_nodes=[{"host": "10.128.0.2", "port": 6379}, {"host": "10.128.0.2", "port": 11008}],
)
```

**Redis Sentinel**:
```python
from litellm.caching.redis_sentinel_cache import RedisSentinelCache
litellm.cache = RedisSentinelCache(
    service_name="mymaster",
    sentinel_nodes=[["localhost", 26379]],
)
```

### Disk Cache

```python
litellm.cache = Cache(type="disk")  # defaults to ./.litellm_cache
```

### S3 / GCS

```python
# S3
litellm.cache = Cache(type="s3", s3_bucket_name="my-bucket", s3_region_name="us-west-2")
# GCS
litellm.cache = Cache(type="gcs", gcs_bucket_name="my-bucket", gcs_path_service_account="/path/to/sa.json")
```

### Semantic Caching (Similarity-Based)

```python
# Redis Semantic — matches on embedding similarity
litellm.cache = Cache(
    type="redis-semantic",
    host=os.environ["REDIS_HOST"], port=os.environ["REDIS_PORT"],
    password=os.environ["REDIS_PASSWORD"],
    similarity_threshold=0.8,                       # 0=no similarity, 1=exact
    redis_semantic_cache_embedding_model="text-embedding-ada-002",
)

# Qdrant Semantic
litellm.cache = Cache(
    type="qdrant-semantic",
    qdrant_api_base=os.environ["QDRANT_API_BASE"],
    qdrant_api_key=os.environ["QDRANT_API_KEY"],
    qdrant_collection_name="litellm-cache",
    similarity_threshold=0.7,
    qdrant_semantic_cache_embedding_model="text-embedding-ada-002",
    qdrant_semantic_cache_vector_size=1536,
)
```

## Key APIs — Per-Request Cache Control

Pass a `cache` dict to any `completion()` call:

| Directive | Type | Effect |
|-----------|------|--------|
| `no-cache` | bool | Bypass cache — always call the LLM |
| `no-store` | bool | Don't save this response to cache |
| `ttl` | int | Cache for N seconds |
| `s-maxage` | int | Only use cached response if ≤ N seconds old |

```python
# Bypass cache
response = completion(model="gpt-4", messages=[...], cache={"no-cache": True})

# Cache for exactly 60 seconds
response = completion(model="gpt-4", messages=[...], cache={"ttl": 60})

# Only accept fresh cache
response = completion(model="gpt-4", messages=[...], cache={"s-maxage": 300})
```

## Key APIs — Runtime Control

```python
# Enable/disable/update caching at runtime
litellm.enable_cache(type="redis", host="...", port="...", password="...")
litellm.disable_cache()
litellm.update_cache(host="new-host", port="6380")
```

## Key APIs — Custom Cache Key

```python
def custom_get_cache_key(*args, **kwargs):
    return kwargs.get("model", "") + str(kwargs.get("messages", ""))

cache = Cache(type="redis", ...)
cache.get_cache_key = custom_get_cache_key
litellm.cache = cache
```

## Key APIs — Proxy Config (config.yaml)

### Basic Redis

```yaml
litellm_settings:
  cache: True
  cache_params:
    type: redis
    ttl: 600
```

Env vars: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`. General pattern: `REDIS_<redis-kwarg>` maps to any redis client param.

### Disable Caching on LLM Calls (keep for rate-limiting)

```yaml
cache_params:
  type: redis
  supported_call_types: []    # no actual LLM responses cached
```

### Control Which Call Types Are Cached

```yaml
cache_params:
  type: redis
  supported_call_types: ["acompletion", "aembedding"]   # async only
```

### Virtual Key Auth Cache (shared across proxy workers)

```yaml
litellm_settings:
  cache: True
  enable_redis_auth_cache: True
  cache_params:
    type: redis
general_settings:
  user_api_key_cache_ttl: 300
```

### Proxy Debugging

```bash
curl http://localhost:4000/cache/ping -H "Authorization: Bearer sk-1234"
# → {"status": "healthy", "cache_type": "redis", "ping_response": true, ...}
```

## Key APIs — Cache Hit Logging

```python
class MyHandler(CustomLogger):
    async def async_log_success_event(self, kwargs, response_obj, start_time, end_time):
        if kwargs.get("cache_hit"):
            print("Cache hit — no API cost!")
litellm.callbacks = [MyHandler()]
```

## Caveats

- **SDK requires `caching=True` per call** — the proxy auto-caches when `cache: True`.
- **Default cache key = model + messages + temperature + logit_bias.** If two requests have different `temperature` values, they won't share a cache entry.
- **In-memory cache is per-process.** Use Redis for multi-process/instance deployments.
- **`REDIS_URL` is not recommended for prod** — use `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`.
- **`REDIS_*` env vars auto-map to redis client kwargs** — but pass non-string types (ints, bools) directly to `Cache()`.
- **Semantic `similarity_threshold` tuning is critical**: 0.8 is a reasonable default; lower values risk false cache hits.
- **Semantic cache embedding model must be available** via `litellm.embedding()` or in the proxy's `model_list`.
- **Disk cache persists across restarts but is not shared** across instances.
- **Virtual key auth cache** needs `enable_redis_auth_cache: true` AND Redis configured — otherwise it's per-process in-memory.
- **`supported_call_types: []` disables response caching** but keeps Redis for rate-limiting/load-balancing state.

## Composition Hints

- **Pair with `litellm-completion`**: Caching is transparent — wrap your existing `completion()` calls with `caching=True`.
- **Pair with `litellm-routing-fallback`**: Router and cache share the same Redis instance — cooldown, usage tracking, and cache all live in one Redis cluster.
- **For proxy deployments**: Use `config.yaml` with `cache: True` — all routed requests are automatically cached. Clients can override via `extra_body={"cache": {...}}`.
