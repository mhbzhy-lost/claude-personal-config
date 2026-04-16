---
name: django-admin
description: "Django Admin 注册与定制：ModelAdmin 选项、Inline、自定义 Action 与模板覆写"
tech_stack: [django, backend]
language: [python]
---

# Django Admin（后台管理）

> 来源：https://docs.djangoproject.com/en/5.1/ref/contrib/admin/
> 版本基准：Django 5.1+

## 用途
为 Django 模型提供开箱即用的 CRUD 后台管理界面，适用于内部管理和数据维护。

## 何时使用
- 快速搭建数据管理后台
- 内部运营人员管理内容
- 开发调试阶段查看和修改数据
- 不适合构建面向终端用户的前台界面

## 基础注册

### 使用装饰器（推荐）

```python
from django.contrib import admin
from .models import Article, Category, Tag

@admin.register(Article)
class ArticleAdmin(admin.ModelAdmin):
    pass

# 同时注册多个模型到同一个 Admin
@admin.register(Category, Tag)
class TaxonomyAdmin(admin.ModelAdmin):
    pass
```

### 传统注册

```python
admin.site.register(Article, ArticleAdmin)
```

## 核心 ModelAdmin 选项

### list_display — 列表页列

```python
@admin.register(Article)
class ArticleAdmin(admin.ModelAdmin):
    list_display = [
        "title",
        "author",
        "status",
        "created_at",
        "is_published",
        "author__email",          # Django 5.1: 支持 __ 关联字段查询
    ]

    @admin.display(
        description="已发布",
        boolean=True,              # 显示为绿勾/红叉图标
        ordering="published_at",   # 支持排序
    )
    def is_published(self, obj):
        return obj.status == "PB"
```

### list_filter — 侧边栏过滤器

```python
class ArticleAdmin(admin.ModelAdmin):
    list_filter = [
        "status",
        "created_at",
        "author",
        ("tags", admin.RelatedOnlyFieldListFilter),  # 只显示已关联的 tag
    ]
```

### search_fields — 搜索

```python
class ArticleAdmin(admin.ModelAdmin):
    search_fields = [
        "title",               # icontains（默认）
        "^author__username",   # ^ = istartswith
        "=slug",               # = = iexact
        "content",
    ]
```

### list_editable — 列表页直接编辑

```python
class ArticleAdmin(admin.ModelAdmin):
    list_display = ["title", "status", "published"]
    list_editable = ["status", "published"]  # 必须在 list_display 中且不在 list_display_links 中
```

### ordering / list_per_page / date_hierarchy

```python
class ArticleAdmin(admin.ModelAdmin):
    ordering = ["-created_at"]
    list_per_page = 50                # 默认 100
    date_hierarchy = "created_at"     # 日期层级导航
```

### fieldsets — 编辑页分组

```python
class ArticleAdmin(admin.ModelAdmin):
    fieldsets = [
        (None, {
            "fields": ["title", "slug", "author"],
        }),
        ("内容", {
            "fields": ["content", "excerpt"],
        }),
        ("发布设置", {
            "fields": ["status", "published_at", "tags"],
            "classes": ["collapse"],  # Django 5.1: 使用 <details> 元素
        }),
        ("SEO", {
            "fields": ["meta_title", "meta_description"],
            "classes": ["collapse"],
            "description": "搜索引擎优化设置",
        }),
    ]
```

### readonly_fields

```python
class ArticleAdmin(admin.ModelAdmin):
    readonly_fields = ["created_at", "updated_at", "word_count"]

    @admin.display(description="字数统计")
    def word_count(self, obj):
        return len(obj.content.split()) if obj.content else 0
```

### prepopulated_fields — 自动填充

```python
class ArticleAdmin(admin.ModelAdmin):
    prepopulated_fields = {"slug": ["title"]}  # 根据 title 自动生成 slug
```

### 关系字段优化

```python
class ArticleAdmin(admin.ModelAdmin):
    raw_id_fields = ["author"]             # FK：ID 输入框（大量数据时用）
    autocomplete_fields = ["tags"]          # Select2 自动补全（需要对方有 search_fields）
    filter_horizontal = ["categories"]      # M2M：水平双栏选择器
    # filter_vertical = ["categories"]      # M2M：垂直双栏选择器
```

## Inline 编辑

### TabularInline（表格形式）

```python
class ImageInline(admin.TabularInline):
    model = Image
    extra = 1               # 额外空白表单数
    min_num = 0
    max_num = 10
    fields = ["file", "caption", "order"]
    readonly_fields = ["preview"]

    @admin.display(description="预览")
    def preview(self, obj):
        if obj.file:
            return format_html('<img src="{}" width="100">', obj.file.url)
        return "-"

@admin.register(Article)
class ArticleAdmin(admin.ModelAdmin):
    inlines = [ImageInline]
```

### StackedInline（堆叠形式）

```python
class ProfileInline(admin.StackedInline):
    model = Profile
    can_delete = False
    verbose_name_plural = "个人资料"

@admin.register(User)
class CustomUserAdmin(UserAdmin):
    inlines = [ProfileInline]
```

## 自定义 Action

```python
@admin.register(Article)
class ArticleAdmin(admin.ModelAdmin):
    actions = ["make_published", "make_draft", "export_csv"]

    @admin.action(description="将选中文章标记为已发布")
    def make_published(self, request, queryset):
        updated = queryset.update(status="PB")
        self.message_user(request, f"成功发布 {updated} 篇文章。")

    @admin.action(description="将选中文章标记为草稿")
    def make_draft(self, request, queryset):
        queryset.update(status="DF")

    @admin.action(description="导出为 CSV")
    def export_csv(self, request, queryset):
        import csv
        from django.http import HttpResponse

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="articles.csv"'
        writer = csv.writer(response)
        writer.writerow(["标题", "状态", "创建时间"])
        for article in queryset:
            writer.writerow([article.title, article.status, article.created_at])
        return response
```

## 重写 ModelAdmin 方法

### 权限控制

```python
class ArticleAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return request.user.is_superuser

    def has_delete_permission(self, request, obj=None):
        if obj and obj.status == "PB":
            return False  # 已发布文章不可删除
        return super().has_delete_permission(request, obj)

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(author=request.user)
```

### 保存时注入数据

```python
class ArticleAdmin(admin.ModelAdmin):
    exclude = ["author"]

    def save_model(self, request, obj, form, change):
        if not change:  # 新建时
            obj.author = request.user
        super().save_model(request, obj, form, change)
```

### 动态调整表单

```python
class ArticleAdmin(admin.ModelAdmin):
    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        if not request.user.is_superuser:
            form.base_fields["status"].disabled = True
        return form

    def get_readonly_fields(self, request, obj=None):
        if obj and obj.status == "PB":
            return ["title", "slug", "author"]
        return []

    def get_list_display(self, request):
        if request.user.is_superuser:
            return ["title", "author", "status", "created_at"]
        return ["title", "status", "created_at"]
```

## Django 5.1 Admin 新特性

### show_facets — 过滤器数量统计

```python
@admin.register(Article)
class ArticleAdmin(admin.ModelAdmin):
    list_filter = ["status", "author"]
    show_facets = admin.ShowFacets.ALWAYS   # 始终显示数量
    # ShowFacets.ALLOW  — 通过 URL 参数开启（默认）
    # ShowFacets.NEVER  — 关闭
```

### list_display 支持关联字段

```python
class ArticleAdmin(admin.ModelAdmin):
    list_display = ["title", "author__email", "category__name"]
```

### collapse 使用语义化 HTML

fieldsets 的 `collapse` class 现在使用 `<details>` 和 `<summary>` 元素。

## Admin 站点定制

```python
# admin.py
admin.site.site_header = "我的项目管理后台"
admin.site.site_title = "后台管理"
admin.site.index_title = "数据管理"

# 自定义 AdminSite
class MyAdminSite(admin.AdminSite):
    site_header = "自定义后台"

    def get_app_list(self, request, app_label=None):
        app_list = super().get_app_list(request, app_label)
        # 自定义应用排序
        return app_list

my_admin = MyAdminSite(name="myadmin")
```

## 常见陷阱

- **list_editable 与 list_display_links 冲突**：字段不能同时出现在两者中
- **autocomplete_fields 需 search_fields**：被关联模型的 ModelAdmin 必须设置 `search_fields`
- **show_facets 性能**：大数据集上启用 ALWAYS 会增加额外数据库查询
- **save_model 不处理 M2M**：M2M 关系在 `save_model` 后才保存，用 `save_related` 钩子处理
- **inline extra 过多**：`extra` 值过大导致编辑页加载缓慢
- **Admin 不是前台**：不要在生产环境将 Admin 作为面向用户的管理界面

## 组合提示

- 配合 **django-models** 理解模型注册
- 配合 **django-auth** 自定义 UserAdmin
- 配合 **django-forms** 理解 Admin 表单定制
- 配合 **django-core** 中 `INSTALLED_APPS` 配置 `django.contrib.admin`
