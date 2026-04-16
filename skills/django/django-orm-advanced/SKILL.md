---
name: django-orm-advanced
description: "Django ORM 高级查询：select_related/prefetch_related、F/Q 表达式、Subquery、聚合与数据库函数"
tech_stack: [django]
---

# Django ORM Advanced（高级查询优化）

> 来源：https://docs.djangoproject.com/en/5.1/topics/db/queries/
> 版本基准：Django 5.1+

## 用途
编写高效的数据库查询，避免 N+1 问题，利用数据库层面计算减少 Python 端处理。

## 何时使用
- 优化查询性能（减少 SQL 数量）
- 复杂条件过滤（OR/NOT/嵌套条件）
- 数据库层面统计与计算
- 子查询和关联聚合
- 需要原始 SQL 的特殊场景

## 查询优化

### select_related（JOIN 预加载）

用于 ForeignKey 和 OneToOneField，通过 SQL JOIN 在一次查询中获取关联对象。

```python
# 未优化：N+1 问题（1 + N 条 SQL）
articles = Article.objects.all()
for article in articles:
    print(article.author.name)     # 每次循环额外查询

# 优化后：1 条 SQL（JOIN）
articles = Article.objects.select_related("author")
for article in articles:
    print(article.author.name)     # 无额外查询

# 多级关联
articles = Article.objects.select_related("author", "category")
articles = Article.objects.select_related("author__profile")  # 深层关联
```

### prefetch_related（分离查询预加载）

用于 ManyToManyField 和反向 ForeignKey，发起额外查询后在 Python 中合并。

```python
# 未优化：N+1
articles = Article.objects.all()
for article in articles:
    print(article.tags.all())       # 每次循环额外查询

# 优化后：2 条 SQL
articles = Article.objects.prefetch_related("tags")

# 反向关联
authors = Author.objects.prefetch_related("article_set")
```

### Prefetch 对象（精细控制）

```python
from django.db.models import Prefetch

# 自定义预加载查询
articles = Article.objects.prefetch_related(
    Prefetch(
        "comments",
        queryset=Comment.objects.filter(approved=True).select_related("author"),
        to_attr="approved_comments",   # 存储为列表属性（非 QuerySet）
    )
)

for article in articles:
    for comment in article.approved_comments:  # 列表，非 QuerySet
        print(comment.author.name)
```

### 组合 select_related 与 prefetch_related

```python
# 最佳实践：FK 用 select_related，M2M/反向FK 用 prefetch_related
articles = (
    Article.objects
    .select_related("author", "category")             # JOIN
    .prefetch_related(                                  # 分离查询
        "tags",
        Prefetch(
            "comments",
            queryset=Comment.objects.select_related("author"),
        ),
    )
)
# 总共 3 条 SQL（articles+author+category、tags、comments+comment_author）
```

## F 表达式

引用模型字段值，在数据库层面进行比较和运算。

```python
from django.db.models import F

# 字段间比较
Entry.objects.filter(number_of_comments__gt=F("number_of_pingbacks"))

# 字段运算
Entry.objects.filter(rating__lt=F("number_of_comments") + F("number_of_pingbacks"))

# 更新时避免竞态条件
Article.objects.filter(pk=article_id).update(views=F("views") + 1)

# 跨关联字段
Entry.objects.filter(authors__name=F("blog__name"))

# 日期运算
from datetime import timedelta
Entry.objects.filter(mod_date__gt=F("pub_date") + timedelta(days=3))

# Django 5.1: F() 和 OuterRef() 支持切片（text/array 字段）
Entry.objects.annotate(first_author=F("authors__name")[:1])
```

## Q 对象

构建复杂查询条件（OR/NOT/XOR）。

```python
from django.db.models import Q

# OR 查询
Article.objects.filter(
    Q(title__icontains="django") | Q(content__icontains="django")
)

# NOT 查询
Article.objects.filter(~Q(status="DF"))

# 组合条件
Article.objects.filter(
    Q(status="PB"),                                           # AND
    Q(author__is_staff=True) | Q(category__name="教程"),      # OR
    ~Q(tags__name="已废弃"),                                   # NOT
)

# 动态构建查询
conditions = Q()
if search_term:
    conditions &= Q(title__icontains=search_term)
if author_id:
    conditions &= Q(author_id=author_id)
if tag_slugs:
    conditions &= Q(tags__slug__in=tag_slugs)
articles = Article.objects.filter(conditions).distinct()
```

## Subquery 与 OuterRef

在查询中嵌入子查询。

```python
from django.db.models import Subquery, OuterRef, Exists

# 子查询作为注解
newest_comment = (
    Comment.objects
    .filter(article=OuterRef("pk"))
    .order_by("-created_at")
)
articles = Article.objects.annotate(
    latest_comment_text=Subquery(newest_comment.values("text")[:1]),
    latest_comment_date=Subquery(newest_comment.values("created_at")[:1]),
)

# Exists 子查询（性能优于 __in）
has_comments = Comment.objects.filter(article=OuterRef("pk"))
articles = Article.objects.annotate(has_comments=Exists(has_comments))
articles_with_comments = articles.filter(has_comments=True)

# 子查询用于过滤
active_authors = Author.objects.filter(is_active=True).values("pk")
articles = Article.objects.filter(author__in=Subquery(active_authors))
```

## annotate 与 aggregate

### aggregate — 全局聚合（返回字典）

```python
from django.db.models import Avg, Count, Max, Min, Sum

Article.objects.aggregate(
    total=Count("id"),
    avg_views=Avg("views"),
    max_views=Max("views"),
)
# {"total": 150, "avg_views": 342.5, "max_views": 15000}

# 空集合使用 default 避免 None
Article.objects.filter(status="XX").aggregate(
    total_views=Sum("views", default=0)
)
# {"total_views": 0}（而非 {"total_views": None}）
```

### annotate — 逐对象注解（返回 QuerySet）

```python
# 每个作者的文章数
authors = Author.objects.annotate(
    article_count=Count("article"),
    total_views=Sum("article__views"),
).order_by("-article_count")

for author in authors:
    print(f"{author.name}: {author.article_count} 篇, {author.total_views} 次浏览")

# 条件聚合
from django.db.models import Q

authors = Author.objects.annotate(
    published_count=Count("article", filter=Q(article__status="PB")),
    draft_count=Count("article", filter=Q(article__status="DF")),
)
```

### values + annotate = GROUP BY

```python
# 按状态分组统计
Article.objects.values("status").annotate(
    count=Count("id"),
    avg_views=Avg("views"),
).order_by("status")
# [{"status": "DF", "count": 30, "avg_views": 100},
#  {"status": "PB", "count": 120, "avg_views": 500}]

# 按月分组
from django.db.models.functions import TruncMonth

Article.objects.annotate(
    month=TruncMonth("created_at")
).values("month").annotate(
    count=Count("id")
).order_by("month")
```

### annotate + aggregate 组合

```python
# 先注解每本书的作者数，再求平均
Book.objects.annotate(
    num_authors=Count("authors")
).aggregate(
    avg_authors=Avg("num_authors")
)
```

## 数据库函数

```python
from django.db.models.functions import (
    Lower, Upper, Length, Trim,         # 字符串
    Concat,                              # 拼接
    Coalesce,                            # 空值替换
    TruncDate, TruncMonth, TruncYear,   # 日期截断
    ExtractYear, ExtractMonth,           # 日期提取
    Now,                                  # 当前时间
    Cast,                                 # 类型转换
)
from django.db.models import Value, CharField

# 字符串拼接
authors = Author.objects.annotate(
    full_name=Concat("first_name", Value(" "), "last_name", output_field=CharField())
)

# 空值替换
articles = Article.objects.annotate(
    display_title=Coalesce("custom_title", "title")
)

# 日期处理
articles = Article.objects.annotate(
    pub_year=ExtractYear("created_at"),
    pub_month=TruncMonth("created_at"),
)

# 类型转换
from django.db.models import FloatField
articles = Article.objects.annotate(
    views_float=Cast("views", output_field=FloatField())
)
```

## RawSQL 与原始查询

### RawSQL 表达式

```python
from django.db.models.expressions import RawSQL

articles = Article.objects.annotate(
    val=RawSQL("select count(*) from comments where article_id = %s", (F("id"),))
)
```

### raw() 原始查询

```python
# 返回 RawQuerySet，映射到模型实例
articles = Article.objects.raw("SELECT * FROM myapp_article WHERE views > %s", [1000])
for article in articles:
    print(article.title)  # 正常的模型实例

# 注意：raw() 不支持 filter()、exclude() 等链式操作
```

### 完全原始 SQL

```python
from django.db import connection

with connection.cursor() as cursor:
    cursor.execute("SELECT title, views FROM myapp_article WHERE views > %s", [1000])
    rows = cursor.fetchall()
    # rows = [("Title 1", 1500), ("Title 2", 2000)]

    # 使用 dictfetchall
    columns = [col[0] for col in cursor.description]
    results = [dict(zip(columns, row)) for row in cursor.fetchall()]
```

## QuerySet 特性

### 惰性求值

```python
# 这三行不执行任何 SQL
qs = Article.objects.all()
qs = qs.filter(status="PB")
qs = qs.order_by("-created_at")

# 以下操作才触发 SQL
list(qs)              # 转换为列表
for a in qs: ...      # 迭代
qs[0]                 # 索引
len(qs)               # 计数（推荐用 qs.count()）
bool(qs)              # 布尔判断（推荐用 qs.exists()）
```

### 常用 QuerySet 方法

```python
qs.filter(**kwargs)           # 过滤
qs.exclude(**kwargs)          # 排除
qs.order_by("field")          # 排序
qs.distinct()                 # 去重
qs.values("field1", "field2") # 返回字典列表
qs.values_list("field", flat=True)  # 返回扁平列表
qs.only("field1")             # 延迟加载（只加载指定字段）
qs.defer("large_field")       # 延迟加载（排除指定字段）
qs.count()                    # COUNT（比 len() 高效）
qs.exists()                   # EXISTS（比 bool() 高效）
qs.first() / qs.last()        # 第一/最后一条
qs.get(**kwargs)              # 获取单条（不存在或多条抛异常）
qs.get_or_create(**kwargs)    # 获取或创建
qs.update_or_create(**kwargs) # 更新或创建
qs.bulk_create(objs)          # 批量创建
qs.bulk_update(objs, fields)  # 批量更新
qs.in_bulk(id_list)           # 批量获取（返回字典）
qs.delete()                   # 批量删除
qs.update(**kwargs)           # 批量更新
```

## 常见陷阱

- **多聚合组合产生错误结果**：`annotate(Count("a"), Count("b"))` 因 JOIN 导致重复，必须加 `distinct=True`
- **select_related 不适用于 M2M**：M2M 和反向 FK 必须用 `prefetch_related`
- **prefetch_related 后 filter 失效**：对预加载的关联对象 `filter()` 会生成新查询，绕过缓存
- **Prefetch to_attr 返回列表**：使用 `to_attr` 时结果是 Python 列表，不是 QuerySet
- **F() 更新不触发信号**：`qs.update(views=F("views")+1)` 不触发 `pre_save`/`post_save`
- **aggregate 空集返回 None**：使用 `default` 参数避免（`Sum("views", default=0)`）
- **raw() 不可链式调用**：返回 `RawQuerySet`，不支持 `filter()`/`exclude()`
- **values().annotate() 的 GROUP BY 顺序**：`values()` 中的字段决定分组维度，顺序影响结果

## 组合提示

- 配合 **django-models** 理解字段定义和关系
- 配合 **django-drf** 在 ViewSet 中优化 queryset
- 配合 **django-testing** 使用 `assertNumQueries` 验证查询数量
- 配合 **django-middleware** 使用 Debug Toolbar 分析 SQL
