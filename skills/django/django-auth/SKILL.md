---
name: django-auth
description: "Django 认证系统：登录登出、权限模型、自定义 User 模型与密码验证"
tech_stack: [django, backend]
language: [python]
capability: [auth, permission]
---

# Django Auth（认证与授权）

> 来源：https://docs.djangoproject.com/en/5.1/topics/auth/
> 版本基准：Django 5.1+

## 用途
用户认证（登录/登出/注册）、权限管理（Permission/Group）、自定义用户模型以及密码安全。

## 何时使用
- 实现用户注册、登录、登出
- 基于权限的访问控制
- 自定义用户模型（邮箱登录、额外字段）
- 密码重置与验证策略
- Django 5.1 全局登录要求（LoginRequiredMiddleware）

## 认证核心 API

### authenticate / login / logout

```python
from django.contrib.auth import authenticate, login, logout

def login_view(request):
    if request.method == "POST":
        username = request.POST["username"]
        password = request.POST["password"]
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)  # 创建 session
            return redirect("dashboard")
        else:
            return render(request, "login.html", {"error": "用户名或密码错误"})
    return render(request, "login.html")

def logout_view(request):
    logout(request)  # 清除 session
    return redirect("home")
```

### 内置认证视图（推荐）

```python
# urls.py
from django.contrib.auth import views as auth_views

urlpatterns = [
    path("login/", auth_views.LoginView.as_view(template_name="auth/login.html"), name="login"),
    path("logout/", auth_views.LogoutView.as_view(), name="logout"),
    path("password_change/", auth_views.PasswordChangeView.as_view(), name="password_change"),
    path("password_change/done/", auth_views.PasswordChangeDoneView.as_view(), name="password_change_done"),
    path("password_reset/", auth_views.PasswordResetView.as_view(), name="password_reset"),
    path("password_reset/done/", auth_views.PasswordResetDoneView.as_view(), name="password_reset_done"),
    path("reset/<uidb64>/<token>/", auth_views.PasswordResetConfirmView.as_view(), name="password_reset_confirm"),
    path("reset/done/", auth_views.PasswordResetCompleteView.as_view(), name="password_reset_complete"),
]

# 设置
LOGIN_URL = "/login/"
LOGIN_REDIRECT_URL = "/dashboard/"
LOGOUT_REDIRECT_URL = "/"
```

## 权限模型

### Permission

```python
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType

# 自动权限：每个模型自动创建 add_、change_、delete_、view_ 权限
# 例如：myapp.add_article, myapp.change_article

# 自定义权限
class Article(models.Model):
    class Meta:
        permissions = [
            ("publish_article", "Can publish article"),
            ("feature_article", "Can feature article on homepage"),
        ]
```

### 检查权限

```python
# 代码中检查
user.has_perm("myapp.publish_article")
user.has_perms(["myapp.change_article", "myapp.publish_article"])
user.has_module_perms("myapp")  # 是否有该 app 的任何权限

# 模板中检查
{% if perms.myapp.publish_article %}
    <a href="{% url 'articles:publish' article.pk %}">发布</a>
{% endif %}
```

### Group

```python
from django.contrib.auth.models import Group

# 创建组并分配权限
editors = Group.objects.create(name="编辑")
publish_perm = Permission.objects.get(codename="publish_article")
editors.permissions.add(publish_perm)

# 将用户加入组
user.groups.add(editors)
# 用户自动继承组的所有权限
user.has_perm("myapp.publish_article")  # True
```

### 视图中的权限控制

```python
# FBV 装饰器
from django.contrib.auth.decorators import login_required, permission_required

@login_required
def dashboard(request):
    ...

@permission_required("myapp.publish_article", raise_exception=True)
def publish_article(request, pk):
    ...

# CBV Mixin
from django.contrib.auth.mixins import LoginRequiredMixin, PermissionRequiredMixin

class PublishView(PermissionRequiredMixin, UpdateView):
    permission_required = "myapp.publish_article"
    # permission_required = ["myapp.change_article", "myapp.publish_article"]  # 多权限
```

## 自定义 User 模型

### 方式一：AbstractUser（推荐，扩展默认 User）

```python
# accounts/models.py
from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    """保留默认的 username/email/password 字段，添加额外字段"""
    phone = models.CharField("手机号", max_length=11, blank=True)
    avatar = models.ImageField("头像", upload_to="avatars/", blank=True)
    bio = models.TextField("简介", blank=True)

    class Meta:
        db_table = "auth_user"
        verbose_name = "用户"
        verbose_name_plural = "用户"
```

```python
# settings.py
AUTH_USER_MODEL = "accounts.User"
```

### 方式二：AbstractBaseUser（完全自定义）

```python
# accounts/models.py
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models

class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("邮箱地址不能为空")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if not extra_fields.get("is_staff"):
            raise ValueError("超级用户必须设置 is_staff=True")
        if not extra_fields.get("is_superuser"):
            raise ValueError("超级用户必须设置 is_superuser=True")
        return self.create_user(email, password, **extra_fields)

class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField("邮箱", unique=True)
    name = models.CharField("姓名", max_length=150)
    is_active = models.BooleanField("是否活跃", default=True)
    is_staff = models.BooleanField("是否员工", default=False)
    date_joined = models.DateTimeField("注册时间", auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = "email"        # 用于认证的字段
    REQUIRED_FIELDS = ["name"]      # createsuperuser 额外提示的字段
    EMAIL_FIELD = "email"           # 邮箱字段名

    class Meta:
        verbose_name = "用户"
        verbose_name_plural = "用户"

    def __str__(self):
        return self.email
```

### 注册到 Admin

```python
# accounts/admin.py
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User

@admin.register(User)
class UserAdmin(BaseUserAdmin):
    # AbstractUser 继承时只需调整 fieldsets
    list_display = ["email", "name", "is_staff"]
    search_fields = ["email", "name"]
    ordering = ["email"]

    # AbstractBaseUser 需要完整定义
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("个人信息", {"fields": ("name",)}),
        ("权限", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
    )
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("email", "name", "password1", "password2"),
        }),
    )
```

### 引用 User 模型

```python
from django.conf import settings
from django.contrib.auth import get_user_model

# ForeignKey 中（推荐使用字符串引用）
class Article(models.Model):
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
    )

# 运行时获取 User 类
User = get_user_model()
user = User.objects.get(email="test@example.com")
```

## 密码验证

```python
# settings.py
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
     "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
```

### 自定义密码验证器

```python
from django.core.exceptions import ValidationError

class UppercaseValidator:
    def validate(self, password, user=None):
        if not any(c.isupper() for c in password):
            raise ValidationError("密码必须包含至少一个大写字母", code="no_uppercase")

    def get_help_text(self):
        return "密码必须包含至少一个大写字母。"
```

## 自定义认证后端

```python
# backends.py
from django.contrib.auth.backends import BaseBackend
from django.contrib.auth import get_user_model

User = get_user_model()

class EmailBackend(BaseBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        try:
            user = User.objects.get(email=username)
        except User.DoesNotExist:
            return None
        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None

    def get_user(self, user_id):
        try:
            return User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return None

# settings.py
AUTHENTICATION_BACKENDS = [
    "accounts.backends.EmailBackend",
    "django.contrib.auth.backends.ModelBackend",  # 保留默认后端作为 fallback
]
```

## Django 5.1 新特性

### LoginRequiredMiddleware

```python
# settings.py
MIDDLEWARE = [
    ...
    "django.contrib.auth.middleware.LoginRequiredMiddleware",
]

# 默认所有视图需要登录，公开页面需要显式标记
from django.contrib.auth.decorators import login_not_required

@login_not_required
def public_page(request):
    ...
```

### 异步认证装饰器支持

`@login_required`、`@permission_required`、`@user_passes_test` 现在原生支持 async 视图。

## 常见陷阱

- **必须在第一次迁移前设置 AUTH_USER_MODEL**：项目已有迁移后更改用户模型非常复杂
- **PermissionsMixin 遗漏**：`AbstractBaseUser` 必须混入 `PermissionsMixin` 才能使用权限系统
- **直接引用 User 模型**：不要 `from django.contrib.auth.models import User`，用 `settings.AUTH_USER_MODEL` 或 `get_user_model()`
- **create_superuser 缺少必要字段**：`REQUIRED_FIELDS` 中的字段必须在 `create_superuser` 中处理
- **AUTHENTICATION_BACKENDS 顺序**：按序尝试，第一个成功即返回；`PermissionDenied` 会终止后续后端
- **password_reset 需要邮件配置**：必须正确设置 `EMAIL_BACKEND` 和相关邮件服务器

## 组合提示

- 配合 **django-core** 配置 AUTH_USER_MODEL 和 MIDDLEWARE
- 配合 **django-views** 使用 LoginRequiredMixin/PermissionRequiredMixin
- 配合 **django-admin** 注册自定义 UserAdmin
- 配合 **django-forms** 使用内置的 AuthenticationForm/UserCreationForm
- 配合 **django-drf** 实现 API Token 认证
