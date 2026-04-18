---
name: django-celery-integration
description: Django 项目集成 Celery 异步任务、数据库化定时调度与 ORM 结果存储
tech_stack: [django, celery]
language: [python]
capability: [task-scheduler, message-queue]
version: "celery 5.5.x; django-celery-beat 2.9.0; django-celery-results 2.6.0"
collected_at: 2026-04-18
---

# Django + Celery Integration（Django 与 Celery 集成）

> 来源：https://docs.celeryq.dev/en/stable/django/、django-celery-beat、django-celery-results README

## 用途
在 Django 项目中接入 Celery 运行后台/异步任务，配合 django-celery-beat（数据库化定时任务）与 django-celery-results（用 Django ORM/Cache 存储结果）。

## 何时使用
- 需要异步执行耗时操作（发邮件、跑报表、调用外部 API）
- 定时任务需通过 Django Admin 动态管理（而非代码写死）
- 想用 Django ORM 查询和清理任务结果
- 需要确保任务在 DB 事务提交后才触发（避免读不到刚写入的数据）

## 基础用法

### 项目集成（`proj/proj/celery.py`）

```python
import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'proj.settings')

app = Celery('proj')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()   # 扫描所有 INSTALLED_APPS 下的 tasks.py

@app.task(bind=True)
def debug_task(self):
    print(f'Request: {self.request!r}')
```

在 `proj/proj/__init__.py` 中 import 这个 app，确保 Django 启动即加载：

```python
from .celery import app as celery_app
__all__ = ('celery_app',)
```

### settings.py

```python
# 所有 Celery 配置加 CELERY_ 前缀（namespace='CELERY'）
CELERY_BROKER_URL = "redis://localhost:6379/0"
CELERY_TIMEZONE = "Australia/Tasmania"
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 30 * 60
```

### 编写任务（reusable app 用 `@shared_task`）

```python
# demoapp/tasks.py
from celery import shared_task

@shared_task
def send_email(user_pk):
    ...
```

### 事务安全触发（关键陷阱）

```python
from django.db import transaction

def create_user(request):
    user = User.objects.create(username=...)
    # 错误：task 可能在事务提交前就执行
    # send_email.delay(user.pk)

    # 正确（传统方式）
    transaction.on_commit(lambda: send_email.delay(user.pk))

    # Celery 5.4+ 快捷方式（需使用 DjangoTask，autodiscover 默认已配置）
    send_email.delay_on_commit(user.pk)
```

注意：`delay_on_commit` 不返回 task_id（任务还未发出到 broker）。需要 id 就用 `delay + on_commit`。

### 启动 worker

```bash
celery -A proj worker -l INFO
```

### django-celery-results（ORM 存结果）

```bash
pip install django-celery-results
```
```python
INSTALLED_APPS = [..., 'django_celery_results']  # 下划线，不是短横
# python manage.py migrate django_celery_results

CELERY_RESULT_BACKEND = 'django-db'
# 或使用 Django cache：
# CELERY_RESULT_BACKEND = 'django-cache'
# CELERY_CACHE_BACKEND = 'default'
```

### django-celery-beat（数据库化定时任务）

```bash
pip install django-celery-beat
```
```python
INSTALLED_APPS = [..., 'django_celery_beat']
# python manage.py migrate django_celery_beat
```

创建 interval 调度：

```python
from django_celery_beat.models import PeriodicTask, IntervalSchedule
import json

schedule, _ = IntervalSchedule.objects.get_or_create(
    every=10, period=IntervalSchedule.SECONDS,
)
PeriodicTask.objects.create(
    interval=schedule,
    name='Import contacts',
    task='proj.tasks.import_contacts',
    args=json.dumps(['a', 'b']),
    kwargs=json.dumps({'be_careful': True}),
)
```

创建 crontab 调度：

```python
from django_celery_beat.models import CrontabSchedule
import zoneinfo

schedule, _ = CrontabSchedule.objects.get_or_create(
    minute='30', hour='*', day_of_week='*',
    day_of_month='*', month_of_year='*',
    timezone=zoneinfo.ZoneInfo('Canada/Pacific'),
)
PeriodicTask.objects.create(crontab=schedule, name='...', task='...')
```

启动 beat 使用数据库调度器：

```bash
celery -A proj beat -l info -S django
# 或显式：--scheduler django_celery_beat.schedulers:DatabaseScheduler
```

## 关键 API（摘要）

- `@shared_task` — 在 reusable app 中定义任务，不依赖具体 app 实例
- `task.delay(*args)` / `task.apply_async(args=[...], countdown=..., queue=...)` — 触发任务
- `task.delay_on_commit(*args)` — Celery 5.4+，在 Django 事务提交后才入队；不返回 task_id
- `app.config_from_object('django.conf:settings', namespace='CELERY')` — 用 Django settings 作为 Celery 配置源
- `app.autodiscover_tasks()` — 自动加载所有 app 的 tasks.py
- `IntervalSchedule.PERIOD_CHOICES` — `DAYS/HOURS/MINUTES/SECONDS/MICROSECONDS`
- `CrontabSchedule` 字段：`minute hour day_of_week day_of_month month_of_year timezone`
- `PeriodicTask` 字段：`interval` 或 `crontab` 或 `solar`/`clocked`、`name`、`task`、`args`(JSON)、`kwargs`(JSON)、`queue`、`expires`、`enabled`
- `PeriodicTasks.update_changed()` — 通知 beat 重载调度（批量更新时必须手动调用）
- `TaskResult` 模型（django-celery-results）— 可像普通 Django model 查询任务结果

## 注意事项

- **触发任务必须等事务提交**：否则 worker 可能查不到刚 create 的对象。优先用 `delay_on_commit`（5.4+）或 `transaction.on_commit(lambda: task.delay(...))`。
- **自定义 task 基类要继承 `DjangoTask`**，否则 `delay_on_commit` 不可用。
- **CELERY_ 命名空间**：所有 Celery 配置必须大写且前缀 `CELERY_`（`task_always_eager` → `CELERY_TASK_ALWAYS_EAGER`）。
- **模块名不含短横**：是 `django_celery_results` / `django_celery_beat`，不是 `django-celery-*`。
- **django-celery-beat 时区变更**：修改 Django `TIME_ZONE` 后旧的 `last_run_at` 仍沿用旧时区，需 `PeriodicTask.objects.all().update(last_run_at=None)` 并 `PeriodicTasks.update_changed()` 重置。
- **批量更新周期任务**：绕过 save() 时须手动 `PeriodicTasks.update_changed()`，否则 beat 不会重载。
- **MySQL 767 字节 key 限制**（django-celery-results migrate 报错）：设置 `DJANGO_CELERY_RESULTS_TASK_ID_MAX_LENGTH=191`。
- **worker + beat 一条命令**（`celery -A proj worker --beat -S django`）仅用于开发，生产必须分开启动。
- **Django 5.1+ DB 连接池**：启用后 Celery worker 会自动通过 backend 的 `close_pool` 清理，无需跨进程共享连接。
- **Celery 版本匹配 Django**：Celery 5.5.x 支持 Django 2.2 LTS+；老版 Django 需用 Celery 5.2.x（<2.2）或 4.4.x（<1.11）。

## 组合提示

- 与 `django-cache` skill 联用：`CELERY_RESULT_BACKEND='django-cache'` + `CELERY_CACHE_BACKEND='default'` 复用 Redis/Memcached 配置。
- 与 `django.db.transaction` 配合：写事务内调用 `delay_on_commit` 是最安全的模式。
- 与 Django Admin：django-celery-beat 自带 admin 注册，运维可直接在界面开关周期任务。
