---
name: django-urls
description: "Django URLconf 配置、path/re_path、命名路由、namespace 与 URL 参数转换器"
tech_stack: [django]
---

# Django URLs（URL 路由配置）

> 来源：https://docs.djangoproject.com/en/5.1/topics/http/urls/
> 版本基准：Django 5.1+

## 用途
将 URL 路径映射到视图函数或类，支持参数捕获、命名路由、反向解析和模块化组织。

## 何时使用
- 为视图定义访问路径
- 从 URL 中提取参数传给视图
- 模块化组织多应用路由
- 模板和代码中反向生成 URL

## 基础配置

### 项目根 URLconf

```python
# myproject/urls.py
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),
    path("articles/", include("articles.urls")),
    path("api/", include("api.urls", namespace="api")),
    path("", include("pages.urls")),
]
```

### 应用 URLconf

```python
# articles/urls.py
from django.urls import path
from . import views

app_name = "articles"  # 应用命名空间

urlpatterns = [
    path("", views.ArticleListView.as_view(), name="list"),
    path("create/", views.ArticleCreateView.as_view(), name="create"),
    path("<slug:slug>/", views.ArticleDetailView.as_view(), name="detail"),
    path("<slug:slug>/edit/", views.ArticleUpdateView.as_view(), name="edit"),
    path("<slug:slug>/delete/", views.ArticleDeleteView.as_view(), name="delete"),
]
```

## path() 函数

```python
from django.urls import path

path(route, view, kwargs=None, name=None)
```

- `route`：URL 模式字符串，不含域名和查询参数
- `view`：视图函数或 `View.as_view()`
- `kwargs`：额外参数字典，传给视图
- `name`：路由名称，用于反向解析

## URL 参数转换器

### 内置转换器

```python
urlpatterns = [
    path("articles/<int:year>/", views.year_archive),           # int：正整数
    path("articles/<str:category>/", views.category_archive),   # str：非空非 / 字符串（默认）
    path("articles/<slug:slug>/", views.article_detail),        # slug：字母数字加 -_
    path("articles/<uuid:pk>/", views.article_by_uuid),         # uuid：格式化 UUID
    path("files/<path:file_path>/", views.serve_file),          # path：含 / 的路径
]
```

| 转换器 | 匹配规则 | 示例 |
|--------|----------|------|
| `str` | 非空字符串（不含 `/`），默认 | `hello-world` |
| `int` | 零或正整数 | `2024` |
| `slug` | ASCII 字母、数字、`-`、`_` | `my-first-post` |
| `uuid` | UUID（小写带连字符） | `075194d3-6885-417e-a8a8-6c931e272f00` |
| `path` | 非空字符串（含 `/`） | `docs/2024/intro.pdf` |

### 自定义转换器

```python
# converters.py
class FourDigitYearConverter:
    regex = r"[0-9]{4}"

    def to_python(self, value: str) -> int:
        return int(value)

    def to_url(self, value: int) -> str:
        return "%04d" % value

# urls.py
from django.urls import path, register_converter
from . import converters, views

register_converter(converters.FourDigitYearConverter, "yyyy")

urlpatterns = [
    path("articles/<yyyy:year>/", views.year_archive, name="year-archive"),
]
```

## re_path()（正则路由）

```python
from django.urls import re_path

urlpatterns = [
    re_path(r"^articles/(?P<year>[0-9]{4})/$", views.year_archive),
    re_path(
        r"^articles/(?P<year>[0-9]{4})/(?P<month>[0-9]{2})/$",
        views.month_archive,
    ),
]
```

**命名捕获组**：`(?P<name>pattern)` 将捕获值作为关键字参数传给视图。
推荐：**优先用 `path()`**，仅在 `path()` 无法满足时才用 `re_path()`。

## include() 模块化

```python
from django.urls import include, path

# 方式一：引用模块路径
path("blog/", include("blog.urls"))

# 方式二：引用 URL 列表
extra = [
    path("reports/", views.report),
    path("reports/<int:pk>/", views.report_detail),
]
path("analytics/", include(extra))

# 方式三：带命名空间的元组
path("polls/", include(([
    path("", views.index, name="index"),
    path("<int:pk>/", views.detail, name="detail"),
], "polls")))
```

## 命名路由与反向解析

### 模板中反向解析

```html
<!-- 无参数 -->
<a href="{% url 'articles:list' %}">文章列表</a>

<!-- 位置参数 -->
<a href="{% url 'articles:detail' article.slug %}">{{ article.title }}</a>

<!-- 关键字参数 -->
<a href="{% url 'articles:detail' slug=article.slug %}">{{ article.title }}</a>

<!-- Django 5.1 querystring 标签 -->
<a href="{% querystring page=2 %}">第 2 页</a>
<a href="{% querystring page=page_obj.next_page_number %}">下一页</a>
```

### Python 代码中反向解析

```python
from django.urls import reverse
from django.http import HttpResponseRedirect

# 基本用法
url = reverse("articles:detail", kwargs={"slug": "my-article"})
# => "/articles/my-article/"

# 带位置参数
url = reverse("year-archive", args=[2024])

# 在视图中重定向
def publish_article(request, slug):
    article = get_object_or_404(Article, slug=slug)
    article.published = True
    article.save()
    return HttpResponseRedirect(reverse("articles:detail", kwargs={"slug": slug}))

# 类视图中使用 reverse_lazy（类属性需延迟求值）
from django.urls import reverse_lazy

class ArticleDeleteView(DeleteView):
    success_url = reverse_lazy("articles:list")
```

## 命名空间（Namespace）

### 应用命名空间（app_name）

```python
# articles/urls.py
app_name = "articles"    # 必须设置，否则 include 时报错
urlpatterns = [...]
```

### 实例命名空间

```python
# 同一 app 的多个实例
urlpatterns = [
    path("author-polls/", include("polls.urls", namespace="author-polls")),
    path("publisher-polls/", include("polls.urls", namespace="publisher-polls")),
]
```

使用：
```python
reverse("author-polls:detail", kwargs={"pk": 1})
reverse("publisher-polls:detail", kwargs={"pk": 1})
```

## 传递额外参数

```python
# 通过 kwargs 传递额外参数
path("blog/<int:year>/", views.year_archive, {"format": "html"}, name="blog-year"),

# 视图签名
def year_archive(request, year, format):
    ...
```

## 默认参数

```python
urlpatterns = [
    path("blog/", views.page, name="blog-index"),
    path("blog/page<int:num>/", views.page, name="blog-page"),
]

def page(request, num=1):
    # /blog/ 时 num=1，/blog/page3/ 时 num=3
    ...
```

## 错误处理

```python
# 在根 URLconf 中定义
handler400 = "myapp.views.bad_request"
handler403 = "myapp.views.permission_denied"
handler404 = "myapp.views.page_not_found"
handler500 = "myapp.views.server_error"

# 视图实现
def page_not_found(request, exception):
    return render(request, "errors/404.html", status=404)
```

## URL 处理流程

1. Django 根据 `ROOT_URLCONF`（或 `request.urlconf`）确定根 URLconf
2. 加载 `urlpatterns` 列表
3. 按顺序匹配每个 URL 模式，遇到第一个匹配即停止
4. 导入并调用匹配的视图，传入 `HttpRequest` + 捕获的参数
5. 若无匹配，调用错误处理视图

## 开发环境媒体文件服务

```python
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    ...
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
```

## 常见陷阱

- **URL 模式顺序**：Django 按顺序匹配，将具体模式放在通用模式之前（如 `create/` 放在 `<slug>/` 之前）
- **缺少尾部斜杠**：Django 默认 `APPEND_SLASH=True`，路由应以 `/` 结尾
- **忘记 app_name**：使用 `include()` 时，被包含的 URLconf 必须设置 `app_name`
- **reverse vs reverse_lazy**：类属性中必须用 `reverse_lazy`，函数体内用 `reverse`
- **URLconf 只匹配路径**：不匹配域名、查询参数和 HTTP 方法
- **正则表达式未锚定**：`re_path` 中忘记 `^` 和 `$` 导致意外匹配
- **命名冲突**：不同 app 的 URL name 相同会导致反向解析错误，建议加 app 前缀或用 namespace

## 组合提示

- 配合 **django-views** 定义视图函数和类
- 配合 **django-core** 了解 ROOT_URLCONF 设置
- 配合 **django-drf** 使用 Router 自动生成 API URL
- 配合 **django-admin** 的 `admin.site.urls` 挂载后台路由
