---
name: django-middleware
description: "Django 中间件编写、内置中间件详解、缓存框架与 Session 配置"
tech_stack: [django, backend]
language: [python]
---

# Django Middleware（中间件、缓存与 Session）

> 来源：https://docs.djangoproject.com/en/5.1/topics/http/middleware/
> 版本基准：Django 5.1+

## 用途
在请求/响应处理链中插入全局逻辑（认证、日志、缓存、CORS 等），以及配置缓存框架和 Session 存储。

## 何时使用
- 全局请求/响应预处理（日志、计时、Header 注入）
- 自定义异常处理
- 请求频率限制
- 缓存策略（视图缓存、模板片段缓存、低级缓存 API）
- Session 存储配置

## 编写自定义中间件

### 函数形式

```python
import time
import logging

logger = logging.getLogger(__name__)

def timing_middleware(get_response):
    """记录每个请求的处理时间"""
    def middleware(request):
        start = time.monotonic()
        response = get_response(request)
        duration = time.monotonic() - start
        logger.info(f"{request.method} {request.path} - {duration:.3f}s")
        response["X-Response-Time"] = f"{duration:.3f}s"
        return response
    return middleware
```

### 类形式（推荐）

```python
class TimingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        # 一次性初始化（服务器启动时执行）

    def __call__(self, request):
        # 请求阶段（视图之前）
        request.start_time = time.monotonic()

        response = self.get_response(request)

        # 响应阶段（视图之后）
        duration = time.monotonic() - request.start_time
        response["X-Response-Time"] = f"{duration:.3f}s"
        return response
```

### 特殊钩子方法

```python
class AdvancedMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        return response

    def process_view(self, request, view_func, view_args, view_kwargs):
        """在视图函数调用前执行
        返回 None 继续处理，返回 HttpResponse 跳过视图"""
        if hasattr(view_func, "admin_only") and not request.user.is_staff:
            return HttpResponseForbidden("权限不足")
        return None

    def process_exception(self, request, exception):
        """视图抛出异常时执行
        返回 None 使用默认异常处理，返回 HttpResponse 替代响应"""
        if isinstance(exception, BusinessError):
            return JsonResponse(
                {"error": str(exception)},
                status=400,
            )
        return None

    def process_template_response(self, request, response):
        """视图返回 TemplateResponse 时执行（render() 之前）
        可修改 template_name 和 context_data"""
        response.context_data["site_name"] = "My Site"
        return response
```

### 条件禁用中间件

```python
from django.core.exceptions import MiddlewareNotUsed

class ConditionalMiddleware:
    def __init__(self, get_response):
        if not settings.ENABLE_MY_FEATURE:
            raise MiddlewareNotUsed("Feature disabled")
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)
```

### 异步中间件

```python
from asgiref.sync import iscoroutinefunction, markcoroutinefunction
from django.utils.decorators import sync_and_async_middleware

@sync_and_async_middleware
def simple_async_middleware(get_response):
    if iscoroutinefunction(get_response):
        async def middleware(request):
            response = await get_response(request)
            return response
    else:
        def middleware(request):
            response = get_response(request)
            return response
    return middleware

# 纯异步中间件
class AsyncOnlyMiddleware:
    async_capable = True
    sync_capable = False

    def __init__(self, get_response):
        self.get_response = get_response
        if iscoroutinefunction(self.get_response):
            markcoroutinefunction(self)

    async def __call__(self, request):
        response = await self.get_response(request)
        return response
```

## 内置中间件详解

### MIDDLEWARE 推荐顺序

```python
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",        # 1. 安全（HTTPS/HSTS）
    "django.contrib.sessions.middleware.SessionMiddleware", # 2. Session
    "django.middleware.common.CommonMiddleware",            # 3. 通用（APPEND_SLASH/PREPEND_WWW）
    "django.middleware.csrf.CsrfViewMiddleware",            # 4. CSRF 保护
    "django.contrib.auth.middleware.AuthenticationMiddleware", # 5. 认证（依赖 Session）
    "django.contrib.auth.middleware.LoginRequiredMiddleware",  # 6. 全局登录要求（5.1 新增）
    "django.contrib.messages.middleware.MessageMiddleware", # 7. 消息框架
    "django.middleware.clickjacking.XFrameOptionsMiddleware", # 8. 防点击劫持
]
```

### 执行顺序

```
请求阶段：从上到下（SecurityMiddleware -> ... -> XFrameOptionsMiddleware）
视图调用
响应阶段：从下到上（XFrameOptionsMiddleware -> ... -> SecurityMiddleware）
```

### 各中间件职责

| 中间件 | 职责 |
|--------|------|
| `SecurityMiddleware` | HTTPS 重定向、HSTS、X-Content-Type-Options |
| `SessionMiddleware` | 启用 Session 支持 |
| `CommonMiddleware` | URL 末尾斜杠处理、禁止 User-Agent |
| `CsrfViewMiddleware` | CSRF 令牌验证 |
| `AuthenticationMiddleware` | `request.user` 注入 |
| `LoginRequiredMiddleware` | 全局要求登录（Django 5.1） |
| `MessageMiddleware` | 一次性消息（flash messages） |
| `XFrameOptionsMiddleware` | 防止页面被 iframe 嵌入 |
| `GZipMiddleware` | Gzip 压缩（放在最外层） |
| `LocaleMiddleware` | 国际化语言检测（放在 Session 之后） |

## 缓存框架

### 缓存后端配置

```python
# settings.py

# Redis（生产推荐）
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": "redis://127.0.0.1:6379/1",
        "OPTIONS": {
            "db": 1,
        },
        "KEY_PREFIX": "myproject",
        "TIMEOUT": 300,      # 默认缓存时间（秒）
    }
}

# Memcached
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.memcached.PyMemcacheCache",
        "LOCATION": "127.0.0.1:11211",
    }
}

# 本地内存（开发用）
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
    }
}

# 数据库（无 Redis/Memcached 时的备选）
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.db.DatabaseCache",
        "LOCATION": "cache_table",
    }
}
# 需运行：python manage.py createcachetable
```

### 视图缓存（cache_page）

```python
from django.views.decorators.cache import cache_page

@cache_page(60 * 15)  # 缓存 15 分钟
def article_list(request):
    articles = Article.objects.filter(published=True)
    return render(request, "articles/list.html", {"articles": articles})

# CBV
from django.utils.decorators import method_decorator

@method_decorator(cache_page(60 * 15), name="dispatch")
class ArticleListView(ListView):
    model = Article

# URL 级别缓存
urlpatterns = [
    path("articles/", cache_page(60 * 15)(views.article_list)),
]
```

### 模板片段缓存

```html
{% load cache %}

{% cache 600 sidebar request.user.id %}
    {# 缓存 10 分钟，按用户区分 #}
    <div class="sidebar">
        {% for tag in popular_tags %}
            <a href="{{ tag.get_absolute_url }}">{{ tag.name }}</a>
        {% endfor %}
    </div>
{% endcache %}
```

### 低级缓存 API

```python
from django.core.cache import cache

# 基本操作
cache.set("my_key", "my_value", timeout=300)  # 设置（300秒过期）
value = cache.get("my_key")                     # 获取（不存在返回 None）
value = cache.get("my_key", "default_value")    # 带默认值

# 原子操作
cache.get_or_set("my_key", "default", timeout=300)  # 获取或设置

# 批量操作
cache.set_many({"key1": "val1", "key2": "val2"}, timeout=300)
values = cache.get_many(["key1", "key2"])  # {"key1": "val1", "key2": "val2"}

# 删除
cache.delete("my_key")
cache.delete_many(["key1", "key2"])
cache.clear()  # 清空所有缓存（谨慎使用）

# 自增/自减
cache.set("visits", 0)
cache.incr("visits")      # 1
cache.incr("visits", 10)  # 11
cache.decr("visits")      # 10

# 缓存版本控制
cache.set("key", "v1", version=1)
cache.set("key", "v2", version=2)
cache.get("key", version=1)  # "v1"
cache.incr_version("key")    # 版本号 +1
```

### 实际缓存模式

```python
def get_article_stats(article_id):
    cache_key = f"article_stats_{article_id}"
    stats = cache.get(cache_key)
    if stats is None:
        # 缓存未命中，计算并存储
        stats = {
            "views": Article.objects.get(pk=article_id).views,
            "comments": Comment.objects.filter(article_id=article_id).count(),
        }
        cache.set(cache_key, stats, timeout=60 * 5)
    return stats

# 缓存失效
def on_article_updated(article_id):
    cache.delete(f"article_stats_{article_id}")
```

## Session 配置

```python
# Session 后端
SESSION_ENGINE = "django.contrib.sessions.backends.db"       # 数据库（默认）
SESSION_ENGINE = "django.contrib.sessions.backends.cache"    # 缓存（推荐，配合 Redis）
SESSION_ENGINE = "django.contrib.sessions.backends.cached_db" # 缓存 + 数据库（持久化）
SESSION_ENGINE = "django.contrib.sessions.backends.signed_cookies" # 签名 Cookie

# 使用缓存后端时指定缓存别名
SESSION_CACHE_ALIAS = "default"

# Session 参数
SESSION_COOKIE_AGE = 1209600        # 过期时间（秒，默认 2 周）
SESSION_COOKIE_NAME = "sessionid"   # Cookie 名称
SESSION_COOKIE_SECURE = True        # 仅 HTTPS
SESSION_COOKIE_HTTPONLY = True       # 禁止 JS 访问（默认 True）
SESSION_EXPIRE_AT_BROWSER_CLOSE = False  # 关闭浏览器过期
SESSION_SAVE_EVERY_REQUEST = False  # 每次请求都保存（默认仅修改时保存）
```

### Session 使用

```python
def my_view(request):
    # 读写 session（类似字典）
    visits = request.session.get("visits", 0)
    request.session["visits"] = visits + 1

    # 删除
    del request.session["key"]

    # 刷新（更换 session key，防止 fixation 攻击）
    request.session.cycle_key()

    # 清空
    request.session.flush()  # 删除 session 数据和 cookie

    # 设置过期
    request.session.set_expiry(300)  # 300 秒后过期
    request.session.set_expiry(0)    # 关闭浏览器过期
```

## 常见陷阱

- **中间件顺序**：`AuthenticationMiddleware` 依赖 `SessionMiddleware`，必须在其后面
- **process_view 中访问 request.POST**：可能干扰文件上传处理
- **process_exception 不处理中间件异常**：只处理视图层抛出的异常
- **缓存 key 冲突**：多项目共用 Redis 时必须设置 `KEY_PREFIX`
- **cache_page 缓存整个响应**：包含 CSRF token，不适用于含表单的页面
- **session cache 后端无持久化**：缓存重启后 session 丢失，生产环境推荐 `cached_db`
- **GZipMiddleware 安全风险**：可能被 BREACH 攻击利用，避免在含敏感数据的响应上使用
- **流式响应特殊处理**：中间件修改 `response.content` 对 `StreamingHttpResponse` 无效

## 组合提示

- 配合 **django-core** 配置 MIDDLEWARE 和 CACHES 设置
- 配合 **django-auth** 理解 AuthenticationMiddleware 和 LoginRequiredMiddleware
- 配合 **django-views** 使用 cache_page 装饰器
- 配合 **django-drf** 处理 API 缓存和 CORS（django-cors-headers）
