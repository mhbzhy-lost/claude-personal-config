---
name: django-storage-backends
description: Django 文件存储 API、自定义 Storage 类实现与 django-storages S3 后端配置
tech_stack: [django, django-storages]
language: [python]
capability: [object-storage, file-upload]
version: "Django stable (4.2+ STORAGES API); django-storages unversioned"
collected_at: 2026-04-18
---

# Django Storage Backends（Django 存储后端）

> 来源：https://docs.djangoproject.com/en/stable/topics/files/、/howto/custom-file-storage/、django-storages S3 docs

## 用途
统一抽象用户上传文件的存储位置。默认本地 `MEDIA_ROOT`，可替换为 S3/GCS/Azure 或自定义远程后端；也可用于将 `collectstatic` 输出到对象存储。

## 何时使用
- 用户上传文件（`FileField` / `ImageField`）需存到对象存储
- 多环境分别使用不同存储（dev 本地、prod S3）
- 需要自定义路径生成、ACL、CloudFront 签名 URL 等
- 实现自有后端（FTP/某私有协议/加密存储）

## 基础用法

### 模型字段

```python
from django.db import models

class Car(models.Model):
    photo = models.ImageField(upload_to="cars")
    specs = models.FileField(upload_to="specs")

# 访问
car.photo.name    # 'cars/chevy.jpg'
car.photo.path    # 本地磁盘路径（仅本地后端）
car.photo.url     # 'https://media.example.com/cars/chevy.jpg'
```

保存外部文件到 FileField：

```python
from django.core.files import File
from pathlib import Path

with Path("/ext/specs.pdf").open("rb") as f:
    car.specs = File(f, name="specs.pdf")
    car.save()
```

### Django 4.2+ `STORAGES` 配置

```python
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
    "mystorage": {
        "BACKEND": "path.to.MyStorage",
        "OPTIONS": {...},
    },
}
```

按 alias 访问：

```python
from django.core.files.storage import storages, default_storage
s = storages["mystorage"]
default_storage.save("path/file", ContentFile(b"..."))
default_storage.exists(path); default_storage.delete(path)
```

### 通过 callable 切换存储

```python
from django.core.files.storage import storages
from django.utils.functional import LazyObject

class OtherStorage(LazyObject):
    def _setup(self):
        self._wrapped = storages["mystorage"]

my_storage = OtherStorage()     # LazyObject：延迟到实际使用，测试可 override_settings

class MyModel(models.Model):
    upload = models.FileField(storage=my_storage)
```

### S3 后端（django-storages）

```bash
pip install 'django-storages[s3]'   # 需 boto3 >= 1.4.4
```

```python
# Django >= 4.2
STORAGES = {
    "default": {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "bucket_name": "my-bucket",
            "region_name": "eu-west-1",
            "default_acl": "private",
            "querystring_auth": True,
            "querystring_expire": 3600,
            "file_overwrite": False,
            "location": "uploads",
            "object_parameters": {"CacheControl": "max-age=86400"},
        },
    },
    "staticfiles": {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {"bucket_name": "my-static", "location": "static"},
    },
}
```

### 自定义 Storage 类

```python
from django.core.files.storage import Storage
from django.utils.deconstruct import deconstructible
from django.conf import settings

@deconstructible
class MyStorage(Storage):
    def __init__(self, option=None):
        self.option = option or settings.CUSTOM_STORAGE_OPTIONS

    def _open(self, name, mode="rb"):
        # 返回 File 子类；文件不存在时 raise FileNotFoundError
        ...

    def _save(self, name, content):
        # 写入 content（File 对象），返回实际保存的 name
        ...

    # 通常还需覆盖
    def exists(self, name): ...
    def delete(self, name): ...
    def url(self, name): ...
    def size(self, name): ...
    def listdir(self, path): ...
```

## 关键 API（摘要）

- `FileField(upload_to=..., storage=...)` — `storage` 可是实例或 callable（模型加载时求值）
- `default_storage` / `storages[alias]` — 全局入口
- `Storage` 必须实现 `_open(name, mode)` 与 `_save(name, content)`；`delete/exists/listdir/size/url` 默认抛 `NotImplementedError`
- `get_valid_name(name)` — 清洗不合法字符；`get_alternative_name(root, ext)` — 重名时追加 `_<7 随机字符>`；`get_available_name(name, max_length)` — 组合前两者
- django-storages S3 常用 options：`bucket_name`（必填）、`region_name`、`location`（路径前缀）、`default_acl`、`querystring_auth`（默认 True）、`querystring_expire`（默认 3600）、`file_overwrite`（默认 True，同名覆盖）、`object_parameters`（传给 boto3，含 `CacheControl` / `Metadata` / `StorageClass` / `SSEKMSKeyId`）、`endpoint_url`（第三方 S3 兼容需同时设 `region_name`）、`custom_domain` + `cloudfront_key`/`cloudfront_key_id`（CDN 签名 URL）、`signature_version`（默认 s3v4）
- AWS 凭证查找顺序：`session_profile` → `access_key/secret_key` options → `AWS_S3_*` / `AWS_*` 环境变量 → boto3 default session

## 注意事项

- **Django 4.2 起 `DEFAULT_FILE_STORAGE` / `STATICFILES_STORAGE` 被 `STORAGES` dict 替代**，新项目直接用 `STORAGES`。
- **模型保存前文件名不可靠**：`upload_to` + 冲突处理会改名，保存 model 后才能拿到最终 `name`/`path`。
- **手工 `File(open(...))` 不会自动 close**，用 `with` 管理。
- **callable storage 在 model class 加载时求值**：测试要 `override_settings` 切换存储时必须用 `LazyObject` 包装，否则设置变更不生效。
- **自定义 Storage 必须：① 可无参实例化（读 `settings`）、② `@deconstructible` 以便 migration 序列化、③ 本地存储还需覆盖 `path()`**。
- **S3 `custom_domain` 不要带末尾斜杠**；而 Django `STATIC_URL` 必须带，两者独立配置。
- **S3 `client_config` 会覆盖** `addressing_style` / `signature_version` / `proxies`，要保留需作为 `botocore.config.Config` 参数传入。
- **S3 `default_acl` 被 `object_parameters["ACL"]` 覆盖**（后者优先）。
- **S3 签名版本不向后兼容**：已上线 legacy URL 的桶切换 `signature_version` 要评估影响。
- **`endpoint_url`（MinIO/R2 等 S3 兼容端点）必须同时设 `region_name`**，否则报 `AuthorizationQueryParametersError`。

## 组合提示

- 与 Django `collectstatic`：S3 backend 同时配置 `default` 和 `staticfiles` 两个 alias。
- 与 CloudFront：`custom_domain` + `cloudfront_key` / `cloudfront_key_id` + `cryptography` 或 `rsa` 包即可生成签名 CDN URL。
- 多环境：用 callable 或 LazyObject 按 `settings.DEBUG` / env 切换 `FileSystemStorage` 与 `S3Storage`。
- IAM 最小策略需包含 `s3:PutObject/GetObject/DeleteObject/GetObjectAcl/PutObjectAcl/ListBucket`，资源同时含 `bucket/*` 和 `bucket`。
