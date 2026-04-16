---
name: django-models
description: "Django 模型定义、字段类型、Meta 选项、Manager、信号与数据库迁移"
tech_stack: [django]
language: [python]
---

# Django Models（模型与数据库）

> 来源：https://docs.djangoproject.com/en/5.1/topics/db/models/
> 版本基准：Django 5.1+

## 用途
定义数据模型（ORM 映射），管理数据库 schema，通过迁移系统维护数据库结构演进。

## 何时使用
- 定义业务实体及其关系
- 需要数据库字段级验证
- 自定义查询接口（Manager）
- 模型生命周期钩子（信号）
- 数据库 schema 变更管理

## 模型定义基础

```python
from django.db import models

class Article(models.Model):
    title = models.CharField("标题", max_length=200)
    slug = models.SlugField(unique=True)
    content = models.TextField(blank=True)
    published = models.BooleanField(default=False)
    views = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "文章"
        verbose_name_plural = "文章"

    def __str__(self):
        return self.title

    def get_absolute_url(self):
        return f"/articles/{self.slug}/"
```

## 常用字段类型

| 字段类型 | 用途 | 关键参数 |
|----------|------|----------|
| `CharField` | 短文本 | `max_length`（必须） |
| `TextField` | 长文本 | — |
| `IntegerField` | 整数 | — |
| `FloatField` | 浮点数 | — |
| `DecimalField` | 精确小数 | `max_digits`, `decimal_places` |
| `BooleanField` | 布尔值 | — |
| `DateField` | 日期 | `auto_now`, `auto_now_add` |
| `DateTimeField` | 日期时间 | `auto_now`, `auto_now_add` |
| `EmailField` | 邮箱（带验证） | — |
| `URLField` | URL | — |
| `FileField` | 文件上传 | `upload_to` |
| `ImageField` | 图片上传 | `upload_to`，需 Pillow |
| `JSONField` | JSON 数据 | — |
| `UUIDField` | UUID | — |
| `SlugField` | URL 友好短文本 | — |
| `GenericIPAddressField` | IP 地址 | `protocol` |

### 通用字段参数

```python
field = models.CharField(
    max_length=100,
    null=False,          # 数据库允许 NULL（默认 False）
    blank=False,         # 表单允许空值（默认 False）
    default="",          # 默认值（可以是 callable）
    db_default=Value("untitled"),  # 数据库级默认值（Django 5.0+）
    unique=True,         # 唯一约束
    db_index=True,       # 创建索引
    choices={"D": "Draft", "P": "Published"},  # Django 5.0+ 支持字典
    help_text="帮助文本",
    verbose_name="显示名称",
    validators=[],       # 验证器列表
    editable=True,       # 是否在表单中可编辑
)
```

### TextChoices / IntegerChoices（枚举字段）

```python
class Article(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DF", "草稿"
        PUBLISHED = "PB", "已发布"
        ARCHIVED = "AR", "已归档"

    status = models.CharField(
        max_length=2,
        choices=Status,
        default=Status.DRAFT,
    )

# 使用
article.status                  # "DF"
article.get_status_display()    # "草稿"
Article.Status.DRAFT.label      # "草稿"
```

## 关系字段

### ForeignKey（多对一）

```python
class Comment(models.Model):
    article = models.ForeignKey(
        Article,
        on_delete=models.CASCADE,       # 级联删除
        related_name="comments",         # 反向查询名
        related_query_name="comment",    # filter 中使用
    )
```

`on_delete` 选项：
- `CASCADE` — 级联删除
- `PROTECT` — 阻止删除（抛出 ProtectedError）
- `SET_NULL` — 设为 NULL（需 `null=True`）
- `SET_DEFAULT` — 设为默认值
- `DO_NOTHING` — 不做处理（依赖数据库约束）

### ManyToManyField

```python
class Tag(models.Model):
    name = models.CharField(max_length=50, unique=True)

class Article(models.Model):
    tags = models.ManyToManyField(Tag, related_name="articles", blank=True)
```

### 带额外字段的多对多（through）

```python
class Membership(models.Model):
    person = models.ForeignKey("Person", on_delete=models.CASCADE)
    group = models.ForeignKey("Group", on_delete=models.CASCADE)
    date_joined = models.DateField()
    role = models.CharField(max_length=50)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["person", "group"], name="unique_membership"),
        ]

class Group(models.Model):
    members = models.ManyToManyField("Person", through=Membership)
```

### OneToOneField

```python
class Profile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    bio = models.TextField(blank=True)
```

## Meta 选项

```python
class Meta:
    ordering = ["-created_at", "title"]       # 默认排序
    verbose_name = "文章"
    verbose_name_plural = "文章"
    db_table = "blog_article"                 # 自定义表名
    unique_together = [["author", "slug"]]    # 联合唯一（推荐用 constraints）
    indexes = [
        models.Index(fields=["slug"]),
        models.Index(fields=["created_at", "status"]),
    ]
    constraints = [
        models.UniqueConstraint(fields=["author", "slug"], name="unique_author_slug"),
        models.CheckConstraint(
            condition=models.Q(views__gte=0),  # Django 5.1: 用 condition 替代 check
            name="views_non_negative",
        ),
    ]
    abstract = False          # True 表示抽象基类，不建表
    managed = True            # False 则 Django 不管理此表的迁移
    default_manager_name = "objects"
```

## 模型继承

### 抽象基类（推荐）

```python
class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True    # 不会创建数据库表

class Article(TimeStampedModel):
    title = models.CharField(max_length=200)
    # 自动拥有 created_at, updated_at
```

### 多表继承

```python
class Place(models.Model):
    name = models.CharField(max_length=50)

class Restaurant(Place):
    serves_pizza = models.BooleanField(default=False)
    # 隐式 OneToOneField(Place, parent_link=True)
```

### 代理模型

```python
class PublishedArticle(Article):
    class Meta:
        proxy = True
        ordering = ["-published_at"]

    objects = PublishedManager()
```

## 自定义 Manager

```python
class PublishedManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(status="PB")

class Article(models.Model):
    objects = models.Manager()             # 默认 manager
    published = PublishedManager()          # 自定义 manager

# 使用
Article.objects.all()       # 所有文章
Article.published.all()     # 仅已发布
```

## 重写 save() / delete()

```python
class Article(models.Model):
    title = models.CharField(max_length=200)
    slug = models.SlugField(unique=True)

    def save(self, *args, **kwargs):
        if not self.slug:
            from django.utils.text import slugify
            self.slug = slugify(self.title)
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        # 自定义删除逻辑（如软删除）
        self.is_deleted = True
        self.save(update_fields=["is_deleted"])
        # 如果真删除：super().delete(*args, **kwargs)
```

## 信号（Signals）

```python
from django.db.models.signals import pre_save, post_save, post_delete
from django.dispatch import receiver

@receiver(post_save, sender=Article)
def article_saved(sender, instance, created, **kwargs):
    if created:
        # 新建时的逻辑（如发送通知）
        notify_subscribers(instance)

@receiver(pre_save, sender=Article)
def article_pre_save(sender, instance, **kwargs):
    # 保存前的逻辑（如自动填充字段）
    if not instance.slug:
        instance.slug = slugify(instance.title)
```

推荐在 `apps.py` 的 `ready()` 中导入信号：

```python
# myapp/apps.py
class MyappConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "myapp"

    def ready(self):
        import myapp.signals  # noqa: F401
```

## 数据库迁移

```bash
# 生成迁移
python manage.py makemigrations myapp

# 执行迁移
python manage.py migrate

# 查看迁移 SQL（不执行）
python manage.py sqlmigrate myapp 0001

# 回滚到指定迁移
python manage.py migrate myapp 0002

# 查看状态
python manage.py showmigrations

# 合并冲突迁移
python manage.py makemigrations --merge
```

### 数据迁移（RunPython）

```python
from django.db import migrations

def populate_slugs(apps, schema_editor):
    Article = apps.get_model("myapp", "Article")
    for article in Article.objects.filter(slug=""):
        article.slug = slugify(article.title)
        article.save(update_fields=["slug"])

class Migration(migrations.Migration):
    dependencies = [("myapp", "0002_article_slug")]
    operations = [
        migrations.RunPython(populate_slugs, migrations.RunPython.noop),
    ]
```

## 常见陷阱

- **null vs blank**：`null=True` 是数据库层，`blank=True` 是表单验证层；CharField 避免 `null=True`（用 `blank=True, default=""`）
- **信号不触发于 bulk 操作**：`bulk_create()`、`QuerySet.update()`、级联删除不触发 `pre_save`/`post_save`
- **auto_now 字段不可手动赋值**：`auto_now=True` 的字段在 `save()` 时总会被覆盖，除非用 `update_fields` 排除
- **首次迁移前设置 AUTH_USER_MODEL**：项目初始化后再改用户模型需要重建所有迁移
- **related_name 冲突**：抽象基类中的 FK 必须用 `%(class)s` 占位符：`related_name="%(class)s_set"`
- **CheckConstraint.check 已废弃**：Django 5.1 必须使用 `condition` 参数

## 组合提示

- 配合 **django-orm-advanced** 学习复杂查询（F/Q/Subquery）
- 配合 **django-admin** 将模型注册到后台管理
- 配合 **django-forms** 使用 ModelForm 自动生成表单
- 配合 **django-drf** 使用 ModelSerializer 序列化模型
