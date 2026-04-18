---
name: django-cache
description: Django 缓存框架的 backend 选择、多层级缓存策略、低层 API 与 HTTP 缓存头控制
tech_stack: [django]
language: [python]
capability: [key-value-store]
version: "Django 5.0"
collected_at: 2026-04-18
---

# Django Cache Framework（Django 缓存框架）

> 来源：https://docs.djangoproject.com/en/stable/topics/cache/

## 用途
将昂贵计算（DB 查询、模板渲染）的结果缓存起来，减少响应时间。Django 提供 4 种粒度：全站、单视图、模板片段、低层 API。

## 何时使用
- 中高流量站点需要降低 DB / 渲染压力
- 单个视图结果稳定但生成成本高 → `cache_page`
- 页面局部片段（sidebar、导航）不常变 → `{% cache %}`
- 需要缓存任意对象（查询结果、计算值）→ 低层 `cache.set/get`
- 多语言 / 多用户场景需要 Vary 与 Cache-Control 控制下游缓存

## 基础用法

### backend 配置（settings.py）

```python
# Redis（推荐生产）
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": "redis://username:password@127.0.0.1:6379",
        "TIMEOUT": 300,
        "KEY_PREFIX": "myapp",
        "VERSION": 1,
    }
}

# Memcached（pymemcache 绑定）
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.memcached.PyMemcacheCache",
        "LOCATION": "127.0.0.1:11211",
    }
}

# 开发：本地内存（进程隔离，不要用于生产）
# "BACKEND": "django.core.cache.backends.locmem.LocMemCache"
# 测试：Dummy（无实际缓存）
# "BACKEND": "django.core.cache.backends.dummy.DummyCache"
```

数据库缓存需先 `python manage.py createcachetable`。

### 低层 API

```python
from django.core.cache import cache

cache.set("key", value, timeout=300)     # timeout=None 永不过期，0 立即过期
cache.get("key", default="fallback")
cache.add("key", value)                   # 仅当 key 不存在时写入
cache.get_or_set("key", callable_or_value, 300)
cache.set_many({"a": 1, "b": 2})
cache.get_many(["a", "b"])
cache.delete("key")
cache.delete_many(["a", "b"])
cache.touch("key", 60)                    # 续期
cache.incr("num"); cache.decr("num", 5)   # memcached 原子，其他后端非原子
cache.clear()                             # 清空整个 cache（含非本应用 key，慎用）

# async 变体：前缀 a
await cache.aset("k", 1); await cache.aget("k")
```

### 单视图缓存

```python
from django.views.decorators.cache import cache_page

@cache_page(60 * 15)                      # 15 分钟
def my_view(request): ...

@cache_page(60 * 15, cache="special", key_prefix="site1")
def other_view(request): ...
```

也可在 URLconf 解耦：`path("foo/", cache_page(900)(my_view))`。

### 模板片段缓存

```django
{% load cache %}
{% cache 500 sidebar request.user.username %}
    ... sidebar ...
{% endcache %}

{% cache 300 local-thing using="localcache" %}...{% endcache %}
```

失效：
```python
from django.core.cache.utils import make_template_fragment_key
cache.delete(make_template_fragment_key("sidebar", [username]))
```

### 全站中间件缓存

```python
MIDDLEWARE = [
    "django.middleware.cache.UpdateCacheMiddleware",   # 必须最前
    "django.middleware.common.CommonMiddleware",
    "django.middleware.cache.FetchFromCacheMiddleware", # 必须最后
]
CACHE_MIDDLEWARE_SECONDS = 600
CACHE_MIDDLEWARE_KEY_PREFIX = "site1"
```

### HTTP 缓存头

```python
from django.views.decorators.cache import cache_control, never_cache
from django.views.decorators.vary import vary_on_cookie, vary_on_headers

@cache_control(private=True, max_age=3600)
@vary_on_headers("User-Agent", "Accept-Language")
def view(request): ...

@never_cache
def sensitive(request): ...
```

## 关键 API（摘要）

- `CACHES` setting 参数：`BACKEND`、`LOCATION`、`TIMEOUT`（默认 300s，None=永不过期）、`KEY_PREFIX`、`VERSION`、`KEY_FUNCTION`
- `OPTIONS.MAX_ENTRIES`（默认 300）、`CULL_FREQUENCY`（默认 3，即满时剔除 1/3）仅对 locmem/filesystem/database 生效
- Redis 多实例 `LOCATION` 传 list：首个为 leader（写），其余为 replica（随机读）
- Memcached 多实例同理，共享缓存集群
- 版本化：`cache.set("k", v, version=2)`、`cache.incr_version("k")`
- `cache_page(timeout, cache=..., key_prefix=...)`：装饰视图，其 `max-age` 优先于 `Cache-Control`
- `patch_vary_headers(response, ["Cookie"])`、`patch_cache_control(response, public=True)`

## 注意事项

- **中间件顺序非笔误**：`UpdateCacheMiddleware` 在响应阶段逆序运行（放最前 = 最后执行），`FetchFromCacheMiddleware` 请求阶段正序（放最后 = 请求阶段最后）。它们必须分别位于所有修改 `Vary` 头中间件的两端。
- **Memcached key 约束**：不支持 >250 字符或含空白/控制字符的 key。其他 backend 会发 `CacheKeyWarning` 以保证可移植性。
- **`incr`/`decr` 原子性**：memcached 原生原子；其他 backend 用两步 get-set 实现，非原子。
- **LocMem 是进程私有**：多进程部署下各 worker 缓存不共享，不要用于生产。
- **FileBasedCache 安全警告**：`LOCATION` 不要放在 `MEDIA_ROOT`/`STATIC_ROOT` 下，因 pickle 反序列化可被利用执行代码。
- **DatabaseCache 无自动过期清理**：过期项仅在 `add/set/touch` 时被清理。
- **下游缓存泄露风险**：多用户站点必须用 `Vary` / `cache_control(private=True)` 避免私有数据被公共缓存收集。
- **Django 5.0**：`cache_control / never_cache / vary_on_*` 装饰器现在支持包装 async view；`BaseCache` 的 `a` 前缀 async 变体可用，但完整异步 backend 尚在开发中。
- **cache.clear() 会清空整个后端**，不仅是本应用的 key，共享 Redis 时慎用，建议用 `KEY_PREFIX` 隔离。

## 组合提示

- 与 `SessionMiddleware`（加 `Vary: Cookie`）、`LocaleMiddleware`（加 `Vary: Accept-Language`）、`GZipMiddleware`（加 `Vary: Accept-Encoding`）共存时，`UpdateCacheMiddleware` 必须在它们之前。
- 与 django-celery-results 联用：`CELERY_RESULT_BACKEND='django-cache'` 可复用 `CACHES` 中某个 alias。
- 多环境：开发用 `DummyCache` 或 `LocMemCache`，生产用 Redis/Memcached，避免改代码。
