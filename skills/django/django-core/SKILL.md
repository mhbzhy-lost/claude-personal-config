---
name: django-core
description: "Django 项目创建、settings 配置、manage.py 命令与 WSGI/ASGI 部署"
tech_stack: [django]
---

# Django Core（项目基础与配置）

> 来源：https://docs.djangoproject.com/en/5.1/
> 版本基准：Django 5.1+

## 用途
Django 项目的创建、核心配置管理、常用管理命令以及生产环境部署（WSGI/ASGI）。

## 何时使用
- 新建 Django 项目或应用
- 配置数据库、中间件、模板引擎等核心设置
- 执行数据库迁移、静态文件收集等运维操作
- 部署到生产环境（Gunicorn/Uvicorn/Daphne）

## 项目创建

### startproject — 创建项目骨架

```bash
django-admin startproject myproject
cd myproject
```

生成结构：
```
myproject/
    manage.py
    myproject/
        __init__.py
        settings.py
        urls.py
        asgi.py
        wsgi.py
```

### startapp — 创建应用模块

```bash
python manage.py startapp myapp
```

生成结构：
```
myapp/
    __init__.py
    admin.py
    apps.py
    models.py
    tests.py
    views.py
    migrations/
        __init__.py
```

创建后必须注册到 `INSTALLED_APPS`。

## settings.py 核心配置

### INSTALLED_APPS

```python
INSTALLED_APPS = [
    # Django 内置
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # 第三方
    "rest_framework",
    # 本项目应用（推荐使用 AppConfig）
    "myapp.apps.MyappConfig",
]
```

### DATABASES

```python
# SQLite（开发用）
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

# PostgreSQL（生产推荐）— Django 5.1 支持连接池
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": "mydb",
        "USER": "myuser",
        "PASSWORD": "mypassword",
        "HOST": "127.0.0.1",
        "PORT": "5432",
        "CONN_MAX_AGE": 600,
        "CONN_HEALTH_CHECKS": True,
        "OPTIONS": {
            "pool": {               # Django 5.1 新增：原生连接池
                "min_size": 2,
                "max_size": 4,
                "timeout": 10,
            }
        },
    }
}
```

### MIDDLEWARE

```python
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    # Django 5.1 新增：全局登录要求
    "django.contrib.auth.middleware.LoginRequiredMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
```

### TEMPLATES

```python
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]
```

### 静态文件与媒体文件

```python
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"]

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# Django 5.1 存储后端配置（替代已移除的 DEFAULT_FILE_STORAGE）
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}
```

### 安全与生产设置

```python
DEBUG = False
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY")
ALLOWED_HOSTS = ["example.com", "www.example.com"]

# HTTPS 相关
SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# 密钥轮换
SECRET_KEY_FALLBACKS = ["old-secret-key"]

# 默认主键类型
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# 自定义用户模型（必须在首次迁移前设置）
AUTH_USER_MODEL = "accounts.User"
```

## manage.py 常用命令

```bash
# 数据库迁移
python manage.py makemigrations          # 生成迁移文件
python manage.py migrate                 # 执行迁移
python manage.py showmigrations          # 查看迁移状态

# 开发服务器
python manage.py runserver 0.0.0.0:8000

# 用户管理
python manage.py createsuperuser

# 静态文件
python manage.py collectstatic --noinput

# Shell 与调试
python manage.py shell                   # Python shell（推荐配合 django-extensions 的 shell_plus）
python manage.py dbshell                 # 数据库 shell

# 检查与测试
python manage.py check --deploy          # 生产部署安全检查
python manage.py test                    # 运行测试
```

## WSGI 部署（Gunicorn）

```python
# myproject/wsgi.py（startproject 自动生成）
import os
from django.core.wsgi import get_wsgi_application
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "myproject.settings")
application = get_wsgi_application()
```

```bash
pip install gunicorn
gunicorn myproject.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers 4 \
    --timeout 120
```

## ASGI 部署（Uvicorn/Daphne）

```python
# myproject/asgi.py（startproject 自动生成）
import os
from django.core.asgi import get_asgi_application
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "myproject.settings")
application = get_asgi_application()
```

```bash
# Uvicorn
pip install uvicorn
uvicorn myproject.asgi:application --host 0.0.0.0 --port 8000 --workers 4

# Daphne（Django 官方维护）
pip install daphne
daphne -b 0.0.0.0 -p 8000 myproject.asgi:application
```

### 环境变量管理推荐模式

```python
# settings.py — 使用 os.environ 或 django-environ
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ["DJANGO_SECRET_KEY"]
DEBUG = os.environ.get("DJANGO_DEBUG", "False").lower() == "true"
ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "").split(",")
```

## 常见陷阱

- **DEBUG=True 上生产**：泄露敏感信息（堆栈、设置、SQL），Django 5.1 的 `check --deploy` 可检测
- **忘记注册 app**：新建 app 后不加入 `INSTALLED_APPS`，模型迁移和模板查找均失效
- **ALLOWED_HOSTS 为空**：`DEBUG=False` 时所有请求返回 400
- **DEFAULT_FILE_STORAGE/STATICFILES_STORAGE 已移除**：Django 5.1 必须使用 `STORAGES` 配置
- **SECRET_KEY 硬编码**：必须从环境变量读取，泄露后所有签名（session/token/CSRF）失效
- **PostgreSQL 连接池需 psycopg 3**：`pool` 选项仅支持 `psycopg`（非 `psycopg2`）

## 组合提示

- 配合 **django-models** 理解数据库迁移流程
- 配合 **django-middleware** 理解 MIDDLEWARE 配置顺序
- 配合 **django-auth** 配置 AUTH_USER_MODEL
- 配合 **django-drf** 在 INSTALLED_APPS 中注册 rest_framework
