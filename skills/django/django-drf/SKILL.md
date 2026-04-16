---
name: django-drf
description: "Django REST Framework：Serializer、ViewSet、Router、权限、分页、过滤与限流"
tech_stack: [django]
---

# Django DRF（REST Framework）

> 来源：https://www.django-rest-framework.org/
> 版本基准：DRF 3.15+ / Django 5.1+

## 用途
构建 RESTful API，提供序列化、视图集、路由、认证授权、分页、过滤和限流等完整 API 开发工具链。

## 何时使用
- 构建前后端分离的 REST API
- 移动端 / 小程序 API 后端
- 第三方 API 接口开发
- 需要 Browsable API 调试界面

## 安装与配置

```python
# pip install djangorestframework

# settings.py
INSTALLED_APPS = [
    ...
    "rest_framework",
]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework.authentication.TokenAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "100/hour",
        "user": "1000/hour",
    },
}
```

## Serializer

### 基础 Serializer

```python
from rest_framework import serializers

class ArticleSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    title = serializers.CharField(max_length=200)
    content = serializers.CharField()
    published = serializers.BooleanField(default=False)
    created_at = serializers.DateTimeField(read_only=True)

    def create(self, validated_data):
        return Article.objects.create(**validated_data)

    def update(self, instance, validated_data):
        instance.title = validated_data.get("title", instance.title)
        instance.content = validated_data.get("content", instance.content)
        instance.published = validated_data.get("published", instance.published)
        instance.save()
        return instance
```

### ModelSerializer（推荐）

```python
class ArticleSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.get_full_name", read_only=True)
    tag_count = serializers.SerializerMethodField()

    class Meta:
        model = Article
        fields = ["id", "title", "content", "slug", "author", "author_name",
                  "tags", "tag_count", "status", "created_at", "updated_at"]
        read_only_fields = ["slug", "created_at", "updated_at"]
        extra_kwargs = {
            "author": {"write_only": True},
            "content": {"min_length": 10},
        }

    def get_tag_count(self, obj):
        return obj.tags.count()
```

### 嵌套 Serializer

```python
class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ["id", "name", "slug"]

class ArticleDetailSerializer(serializers.ModelSerializer):
    tags = TagSerializer(many=True, read_only=True)
    author = UserSerializer(read_only=True)

    class Meta:
        model = Article
        fields = ["id", "title", "content", "tags", "author", "created_at"]
```

### 字段级验证与跨字段验证

```python
class ArticleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Article
        fields = ["title", "content", "published_at"]

    def validate_title(self, value):
        """单字段验证"""
        if "django" not in value.lower():
            raise serializers.ValidationError("标题必须包含 Django")
        return value

    def validate(self, data):
        """跨字段验证"""
        if data.get("published") and not data.get("published_at"):
            raise serializers.ValidationError("已发布文章必须设置发布时间")
        return data
```

### 可写嵌套 Serializer

```python
class ArticleCreateSerializer(serializers.ModelSerializer):
    tags = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Tag.objects.all(),
    )

    class Meta:
        model = Article
        fields = ["title", "content", "tags"]

    def create(self, validated_data):
        tags = validated_data.pop("tags")
        article = Article.objects.create(**validated_data)
        article.tags.set(tags)
        return article
```

## ViewSet 与 Router

### ModelViewSet（完整 CRUD）

```python
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

class ArticleViewSet(viewsets.ModelViewSet):
    queryset = Article.objects.select_related("author").prefetch_related("tags")
    serializer_class = ArticleSerializer
    lookup_field = "slug"

    def get_serializer_class(self):
        if self.action == "list":
            return ArticleListSerializer
        if self.action in ["create", "update", "partial_update"]:
            return ArticleCreateSerializer
        return ArticleDetailSerializer

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)

    def get_queryset(self):
        qs = super().get_queryset()
        if not self.request.user.is_staff:
            qs = qs.filter(status="PB")
        return qs

    @action(detail=True, methods=["post"])
    def publish(self, request, slug=None):
        """自定义操作：发布文章"""
        article = self.get_object()
        article.status = "PB"
        article.save()
        return Response({"status": "published"})

    @action(detail=False, methods=["get"])
    def recent(self, request):
        """自定义操作：最近文章"""
        recent = self.get_queryset().order_by("-created_at")[:10]
        serializer = self.get_serializer(recent, many=True)
        return Response(serializer.data)
```

### ReadOnlyModelViewSet

```python
class TagViewSet(viewsets.ReadOnlyModelViewSet):
    """只提供 list 和 retrieve"""
    queryset = Tag.objects.all()
    serializer_class = TagSerializer
    lookup_field = "slug"
```

### Router 注册

```python
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register(r"articles", ArticleViewSet, basename="article")
router.register(r"tags", TagViewSet, basename="tag")

# urls.py
from django.urls import path, include

urlpatterns = [
    path("api/v1/", include(router.urls)),
]
```

生成的 URL：
```
GET    /api/v1/articles/          -> list
POST   /api/v1/articles/          -> create
GET    /api/v1/articles/{slug}/   -> retrieve
PUT    /api/v1/articles/{slug}/   -> update
PATCH  /api/v1/articles/{slug}/   -> partial_update
DELETE /api/v1/articles/{slug}/   -> destroy
POST   /api/v1/articles/{slug}/publish/ -> publish (自定义)
GET    /api/v1/articles/recent/   -> recent (自定义)
```

## 权限（Permissions）

### 内置权限类

```python
from rest_framework.permissions import (
    AllowAny,                     # 任何人
    IsAuthenticated,              # 已认证用户
    IsAdminUser,                  # is_staff=True
    IsAuthenticatedOrReadOnly,    # 认证用户可写，匿名只读
    DjangoModelPermissions,       # 映射 Django 模型权限
    DjangoObjectPermissions,      # 对象级权限
)
```

### ViewSet 级别配置

```python
class ArticleViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [IsAuthenticated()]
        return [AllowAny()]
```

### 自定义权限

```python
from rest_framework.permissions import BasePermission

class IsAuthorOrReadOnly(BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        return obj.author == request.user
```

## 分页

```python
from rest_framework.pagination import (
    PageNumberPagination,
    LimitOffsetPagination,
    CursorPagination,
)

class StandardPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100

class ArticleViewSet(viewsets.ModelViewSet):
    pagination_class = StandardPagination
```

## 过滤与搜索

```python
# pip install django-filter

class ArticleViewSet(viewsets.ModelViewSet):
    filterset_fields = ["status", "author", "tags"]     # 精确过滤
    search_fields = ["title", "content"]                 # 搜索
    ordering_fields = ["created_at", "title", "views"]   # 排序
    ordering = ["-created_at"]                            # 默认排序
```

自定义 FilterSet：
```python
import django_filters

class ArticleFilter(django_filters.FilterSet):
    created_after = django_filters.DateFilter(field_name="created_at", lookup_expr="gte")
    created_before = django_filters.DateFilter(field_name="created_at", lookup_expr="lte")
    title = django_filters.CharFilter(lookup_expr="icontains")

    class Meta:
        model = Article
        fields = ["status", "author", "title", "created_after", "created_before"]

class ArticleViewSet(viewsets.ModelViewSet):
    filterset_class = ArticleFilter
```

## 限流（Throttling）

```python
from rest_framework.throttling import UserRateThrottle

class BurstRateThrottle(UserRateThrottle):
    scope = "burst"

class SustainedRateThrottle(UserRateThrottle):
    scope = "sustained"

# settings.py
REST_FRAMEWORK = {
    "DEFAULT_THROTTLE_CLASSES": [
        "myapp.throttles.BurstRateThrottle",
        "myapp.throttles.SustainedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "burst": "60/min",
        "sustained": "1000/day",
    },
}
```

## 认证

```python
# Token 认证
# pip install djangorestframework (已内置)

# settings.py
INSTALLED_APPS = [..., "rest_framework.authtoken"]
# 运行 migrate 创建 Token 表

# 获取 Token
from rest_framework.authtoken.views import obtain_auth_token

urlpatterns = [
    path("api/token/", obtain_auth_token, name="api-token"),
]

# 请求头：Authorization: Token 9944b09199c62bcf9418ad846dd0e4bbdfc6ee4b
```

## 常见陷阱

- **N+1 查询**：ViewSet 的 `queryset` 未使用 `select_related`/`prefetch_related` 导致大量 SQL
- **Serializer fields="\_\_all\_\_"**：暴露敏感字段，建议显式列出
- **perform_create 不传 user**：忘记在 `perform_create` 中传递 `request.user`
- **嵌套写入复杂**：DRF 不自动处理嵌套创建/更新，必须重写 `create()`/`update()`
- **分页与 list action**：自定义 `@action(detail=False)` 不会自动分页，需手动调用 `self.paginate_queryset()`
- **throttle scope 未定义**：自定义 Throttle 必须在 `DEFAULT_THROTTLE_RATES` 中注册 scope
- **DjangoFilterBackend 需要安装 django-filter**：不是 DRF 内置的

## 组合提示

- 配合 **django-models** 定义 API 数据模型
- 配合 **django-orm-advanced** 优化 ViewSet 查询性能
- 配合 **django-auth** 配置认证后端和权限
- 配合 **django-testing** 测试 API 端点
- 配合 **django-middleware** 处理 CORS（django-cors-headers）
