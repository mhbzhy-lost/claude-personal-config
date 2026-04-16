---
name: django-views
description: "Django FBV 与 CBV、通用视图、Mixin 组合与视图装饰器"
tech_stack: [django]
language: [python]
---

# Django Views（视图层）

> 来源：https://docs.djangoproject.com/en/5.1/topics/class-based-views/
> 版本基准：Django 5.1+

## 用途
处理 HTTP 请求，执行业务逻辑，返回 HTTP 响应。Django 提供函数视图（FBV）和类视图（CBV）两种范式。

## 何时使用
- 处理页面请求与表单提交
- CRUD 操作（使用通用视图减少样板代码）
- 需要复用视图逻辑（Mixin 组合）
- API 端点（简单场景；复杂 API 建议用 DRF）

## 函数视图（FBV）

```python
from django.http import HttpResponse, JsonResponse, Http404
from django.shortcuts import render, get_object_or_404, redirect

def article_list(request):
    articles = Article.objects.filter(published=True)
    return render(request, "articles/list.html", {"articles": articles})

def article_detail(request, slug):
    article = get_object_or_404(Article, slug=slug, published=True)
    return render(request, "articles/detail.html", {"article": article})

def article_create(request):
    if request.method == "POST":
        form = ArticleForm(request.POST)
        if form.is_valid():
            article = form.save(commit=False)
            article.author = request.user
            article.save()
            return redirect("article-detail", slug=article.slug)
    else:
        form = ArticleForm()
    return render(request, "articles/form.html", {"form": form})
```

### 常用快捷函数

```python
from django.shortcuts import render, redirect, get_object_or_404, get_list_or_404

render(request, template_name, context=None, status=200)
redirect(to, permanent=False)       # to: URL 字符串、视图名、模型实例
get_object_or_404(Model, **kwargs)  # 不存在则 404
get_list_or_404(Model, **kwargs)    # 空列表则 404
```

## 类视图（CBV）基础

### View 基类

```python
from django.views import View
from django.http import JsonResponse

class ArticleApiView(View):
    def get(self, request, *args, **kwargs):
        articles = Article.objects.values("id", "title")
        return JsonResponse(list(articles), safe=False)

    def post(self, request, *args, **kwargs):
        # 处理 POST 请求
        return JsonResponse({"status": "created"}, status=201)
```

URL 注册：`path("api/articles/", ArticleApiView.as_view())`

### TemplateView

```python
from django.views.generic import TemplateView

class HomeView(TemplateView):
    template_name = "home.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["featured"] = Article.published.all()[:5]
        return context
```

## 通用视图（Generic Views）

### ListView

```python
from django.views.generic import ListView

class ArticleListView(ListView):
    model = Article
    template_name = "articles/list.html"    # 默认：article_list.html
    context_object_name = "articles"         # 默认：object_list
    paginate_by = 20
    ordering = ["-created_at"]

    def get_queryset(self):
        qs = super().get_queryset().filter(published=True)
        tag = self.kwargs.get("tag")
        if tag:
            qs = qs.filter(tags__slug=tag)
        return qs

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["tags"] = Tag.objects.all()
        return context
```

ListView 分页模板：
```html
{% for article in articles %}
    <h2>{{ article.title }}</h2>
{% endfor %}

{% if page_obj.has_previous %}
    <a href="{% querystring page=page_obj.previous_page_number %}">上一页</a>
{% endif %}
<span>{{ page_obj.number }} / {{ paginator.num_pages }}</span>
{% if page_obj.has_next %}
    <a href="{% querystring page=page_obj.next_page_number %}">下一页</a>
{% endif %}
```

> `{% querystring %}` 是 Django 5.1 新增模板标签，自动保留当前 URL 查询参数。

### DetailView

```python
from django.views.generic import DetailView

class ArticleDetailView(DetailView):
    model = Article
    template_name = "articles/detail.html"
    context_object_name = "article"
    slug_field = "slug"          # 模型字段名（默认 slug）
    slug_url_kwarg = "slug"      # URL 参数名（默认 slug）

    def get_queryset(self):
        return super().get_queryset().filter(published=True)

    def get_object(self, queryset=None):
        obj = super().get_object(queryset)
        # 记录访问（副作用）
        Article.objects.filter(pk=obj.pk).update(views=F("views") + 1)
        return obj
```

### CreateView

```python
from django.contrib.auth.mixins import LoginRequiredMixin
from django.views.generic.edit import CreateView
from django.urls import reverse_lazy

class ArticleCreateView(LoginRequiredMixin, CreateView):
    model = Article
    fields = ["title", "content", "tags"]
    template_name = "articles/form.html"
    success_url = reverse_lazy("article-list")

    def form_valid(self, form):
        form.instance.author = self.request.user
        return super().form_valid(form)
```

### UpdateView

```python
from django.views.generic.edit import UpdateView

class ArticleUpdateView(LoginRequiredMixin, UpdateView):
    model = Article
    fields = ["title", "content", "tags"]
    template_name = "articles/form.html"

    def get_queryset(self):
        # 只允许作者编辑自己的文章
        return super().get_queryset().filter(author=self.request.user)

    def get_success_url(self):
        return reverse("article-detail", kwargs={"slug": self.object.slug})
```

### DeleteView

```python
from django.views.generic.edit import DeleteView

class ArticleDeleteView(LoginRequiredMixin, DeleteView):
    model = Article
    template_name = "articles/confirm_delete.html"
    success_url = reverse_lazy("article-list")

    def get_queryset(self):
        return super().get_queryset().filter(author=self.request.user)
```

### FormView

```python
from django.views.generic.edit import FormView

class ContactView(FormView):
    template_name = "contact.html"
    form_class = ContactForm
    success_url = reverse_lazy("contact-success")

    def form_valid(self, form):
        form.send_email()
        return super().form_valid(form)
```

## Mixin 组合

### 常用内置 Mixin

```python
from django.contrib.auth.mixins import (
    LoginRequiredMixin,          # 要求登录
    PermissionRequiredMixin,     # 要求权限
    UserPassesTestMixin,         # 自定义条件
)

class AdminArticleView(PermissionRequiredMixin, UpdateView):
    permission_required = "myapp.change_article"
    model = Article
    fields = ["title", "content", "published"]

class AuthorOnlyView(UserPassesTestMixin, UpdateView):
    model = Article
    fields = ["title", "content"]

    def test_func(self):
        return self.get_object().author == self.request.user
```

### 自定义 Mixin

```python
class JsonResponseMixin:
    """支持 JSON 响应的 Mixin"""
    def form_invalid(self, form):
        if self.request.accepts("application/json"):
            return JsonResponse(form.errors, status=400)
        return super().form_invalid(form)

    def form_valid(self, form):
        response = super().form_valid(form)
        if self.request.accepts("application/json"):
            return JsonResponse({"pk": self.object.pk}, status=201)
        return response

class ArticleCreateView(LoginRequiredMixin, JsonResponseMixin, CreateView):
    model = Article
    fields = ["title", "content"]
```

**Mixin 顺序规则**：权限类 Mixin（LoginRequiredMixin）放最左，功能 Mixin 居中，基类放最右。

## 视图装饰器

### FBV 装饰器

```python
from django.contrib.auth.decorators import login_required, permission_required
from django.views.decorators.http import require_http_methods, require_POST
from django.views.decorators.cache import cache_page

@login_required(login_url="/accounts/login/")
@permission_required("myapp.add_article", raise_exception=True)
@require_http_methods(["GET", "POST"])
def article_create(request):
    ...

# Django 5.1 新增：login_not_required（配合 LoginRequiredMiddleware）
from django.contrib.auth.decorators import login_not_required

@login_not_required
def public_page(request):
    return render(request, "public.html")
```

### 在 CBV 上使用装饰器

```python
from django.utils.decorators import method_decorator

@method_decorator(cache_page(60 * 15), name="dispatch")
class ArticleListView(ListView):
    model = Article

# 或在 urls.py 中
from django.contrib.auth.decorators import login_required
path("create/", login_required(ArticleCreateView.as_view()))
```

## Django 5.1 新特性

### LoginRequiredMiddleware + login_not_required

```python
# settings.py
MIDDLEWARE = [
    ...
    "django.contrib.auth.middleware.LoginRequiredMiddleware",
]

# 默认所有视图需要登录，公开页面用 login_not_required 标记
from django.contrib.auth.decorators import login_not_required

@login_not_required
def home(request):
    ...

# CBV 使用
from django.utils.decorators import method_decorator

@method_decorator(login_not_required, name="dispatch")
class PublicView(TemplateView):
    template_name = "public.html"
```

### 异步视图装饰器支持

Django 5.1 中 `@login_required`、`@permission_required`、`@user_passes_test` 现在支持装饰 async 视图。

## 常见陷阱

- **reverse_lazy vs reverse**：类属性（如 `success_url`）必须用 `reverse_lazy()`，因为 URL 配置在类定义时尚未加载
- **fields 与 form_class 互斥**：CreateView/UpdateView 中不能同时指定 `fields` 和 `form_class`
- **Mixin 顺序**：Python MRO 是从左到右，权限检查 Mixin 必须在最左边
- **get_object() 重复查询**：`DetailView` 中 `get_object()` 会被调用多次，结果会缓存在 `self.object`
- **忘记 CSRF token**：POST 表单模板中必须包含 `{% csrf_token %}`
- **CBV as_view() 遗漏**：URL 配置中必须调用 `.as_view()`，不能直接传类

## 组合提示

- 配合 **django-urls** 配置 URL 路由
- 配合 **django-forms** 处理表单验证
- 配合 **django-auth** 使用权限装饰器和 Mixin
- 配合 **django-middleware** 理解请求处理流程
