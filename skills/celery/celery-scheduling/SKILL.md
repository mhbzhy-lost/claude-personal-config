---
name: celery-scheduling
description: "Celery Beat 定时调度：crontab/solar 表达式、django-celery-beat 数据库调度、动态增删定时任务。"
tech_stack: [celery, backend]
language: [python]
capability: [task-scheduler]
---

# Celery Scheduling（定时调度）

> 来源：https://docs.celeryq.dev/en/stable/userguide/periodic-tasks.html
> 版本基准：Celery 5.4+（当前稳定线 5.6）

## 用途

Celery Beat 是 Celery 内置的定时任务调度器，作为独立进程运行，按预设的时间规则周期性地向 Broker 发送任务消息。支持固定间隔（interval）、crontab 表达式、太阳时（solar）等多种调度方式，替代系统 cron 实现应用级的定时任务管理。

## 何时使用

- 需要定时执行后台任务（数据库清理、缓存刷新、报表生成）
- 需要类似 cron 的定时调度但希望在应用层管理
- 需要通过 Web 管理界面动态增删改定时任务（django-celery-beat）
- 需要基于日出/日落的时间调度（solar）
- 需要跨时区的定时任务调度

## Beat 启动方式

```bash
# 独立启动 Beat 进程
celery -A proj beat --loglevel=info

# Beat + Worker 合并启动（仅开发环境，生产环境应分开）
celery -A proj worker --beat --loglevel=info

# 指定调度器（使用 django-celery-beat）
celery -A proj beat --scheduler django_celery_beat.schedulers:DatabaseScheduler

# 指定调度文件路径（默认 celerybeat-schedule）
celery -A proj beat --schedule=/var/run/celery/celerybeat-schedule
```

**关键**：Beat 进程必须是单实例运行。如果启动多个 Beat，任务会被重复调度。

## 静态配置方式

### Interval（固定间隔）

```python
# celeryconfig.py 或 Django settings.py
from datetime import timedelta

beat_schedule = {
    # 每 30 秒执行一次
    "check-health-every-30s": {
        "task": "proj.tasks.health_check",
        "schedule": 30.0,  # 秒数
    },
    # 每 5 分钟执行一次（timedelta）
    "cleanup-every-5min": {
        "task": "proj.tasks.cleanup_expired_sessions",
        "schedule": timedelta(minutes=5),
    },
    # 带参数的定时任务
    "send-daily-digest": {
        "task": "proj.tasks.send_digest",
        "schedule": timedelta(hours=24),
        "args": ("daily",),
        "kwargs": {"include_stats": True},
    },
    # 指定队列和选项
    "sync-inventory": {
        "task": "proj.tasks.sync_inventory",
        "schedule": timedelta(minutes=15),
        "options": {
            "queue": "sync",
            "expires": 600,  # 10 分钟后过期
        },
    },
}
```

### Crontab（类 cron 表达式）

```python
from celery.schedules import crontab

beat_schedule = {
    # 每天早上 8:30 执行
    "morning-report": {
        "task": "proj.tasks.generate_report",
        "schedule": crontab(hour=8, minute=30),
    },
    # 每周一凌晨 0:00
    "weekly-cleanup": {
        "task": "proj.tasks.weekly_cleanup",
        "schedule": crontab(hour=0, minute=0, day_of_week="monday"),
        # day_of_week: 0=周一(或 "monday")，6=周日(或 "sunday")
    },
    # 每月 1 号和 15 号 9:00
    "bimonthly-billing": {
        "task": "proj.tasks.process_billing",
        "schedule": crontab(hour=9, minute=0, day_of_month="1,15"),
    },
    # 每 15 分钟
    "every-15-minutes": {
        "task": "proj.tasks.poll_status",
        "schedule": crontab(minute="*/15"),
    },
    # 工作日每小时（周一到周五，每小时的第 0 分钟）
    "workday-hourly": {
        "task": "proj.tasks.hourly_sync",
        "schedule": crontab(minute=0, day_of_week="1-5"),
    },
    # 每天 0:00, 6:00, 12:00, 18:00
    "four-times-daily": {
        "task": "proj.tasks.quarter_day_task",
        "schedule": crontab(hour="0,6,12,18", minute=0),
    },
}
```

### Crontab 字段参考

| 字段 | 说明 | 默认值 | 示例 |
|------|------|--------|------|
| `minute` | 分钟 | `*`（每分钟） | `0`, `*/15`, `0,30` |
| `hour` | 小时 | `*`（每小时） | `8`, `0-6`, `9,18` |
| `day_of_week` | 星期 | `*`（每天） | `1`(周一), `"mon-fri"`, `"1,3,5"` |
| `day_of_month` | 日 | `*`（每天） | `1`, `"1,15"`, `"1-7"` |
| `month_of_year` | 月 | `*`（每月） | `1`, `"1,6"`, `"1-3"` |

### Solar（太阳时调度）

```python
from celery.schedules import solar

beat_schedule = {
    # 日出时执行（需提供经纬度）
    "sunrise-task": {
        "task": "proj.tasks.open_blinds",
        "schedule": solar("sunrise", lat=39.9042, lon=116.4074),  # 北京
    },
    # 日落时执行
    "sunset-task": {
        "task": "proj.tasks.close_blinds",
        "schedule": solar("sunset", lat=39.9042, lon=116.4074),
    },
}
# 支持事件：dawn_astronomical, dawn_nautical, dawn_civil, sunrise,
#           solar_noon, sunset, dusk_civil, dusk_nautical, dusk_astronomical
```

## 时区配置

```python
# celeryconfig.py
timezone = "Asia/Shanghai"
enable_utc = True  # 推荐保持 True，内部统一 UTC，仅调度时转换

# crontab 中可指定时区（覆盖全局）
from celery.schedules import crontab
import zoneinfo

beat_schedule = {
    "us-morning-report": {
        "task": "proj.tasks.us_report",
        "schedule": crontab(
            hour=9, minute=0,
            nowfun=lambda: datetime.now(zoneinfo.ZoneInfo("America/New_York"))
        ),
    },
}
```

## django-celery-beat（数据库调度）

### 安装配置

```bash
pip install django-celery-beat
```

```python
# settings.py
INSTALLED_APPS = [
    ...
    "django_celery_beat",
]

# 使用数据库调度器
CELERY_BEAT_SCHEDULER = "django_celery_beat.schedulers:DatabaseScheduler"
```

```bash
# 创建数据表
python manage.py migrate django_celery_beat

# 启动 Beat（使用数据库调度器）
celery -A proj beat --scheduler django_celery_beat.schedulers:DatabaseScheduler
```

### 数据库模型

django-celery-beat 提供以下 Django 模型：

| 模型 | 说明 |
|------|------|
| `IntervalSchedule` | 固定间隔调度（每 N 秒/分/时/天） |
| `CrontabSchedule` | crontab 表达式调度 |
| `SolarSchedule` | 太阳时调度 |
| `ClockedSchedule` | 一次性定时调度（指定时间点） |
| `PeriodicTask` | 定时任务配置（关联上述调度 + 任务名 + 参数） |

### 通过 Django Admin 管理

django-celery-beat 自动注册 Admin，可在 Django 管理后台直接增删改查定时任务。

### 编程方式动态创建

```python
from django_celery_beat.models import (
    PeriodicTask,
    IntervalSchedule,
    CrontabSchedule,
    ClockedSchedule,
)
import json
from datetime import datetime
from zoneinfo import ZoneInfo

# --- 创建间隔调度 ---
interval, _ = IntervalSchedule.objects.get_or_create(
    every=30,
    period=IntervalSchedule.SECONDS,
    # period 可选：MICROSECONDS, SECONDS, MINUTES, HOURS, DAYS
)

PeriodicTask.objects.create(
    interval=interval,
    name="Poll API Every 30s",          # 唯一名称
    task="proj.tasks.poll_api",          # 任务路径
    args=json.dumps(["https://api.example.com/status"]),
    kwargs=json.dumps({"timeout": 10}),
    enabled=True,
    expires=datetime(2026, 12, 31, tzinfo=ZoneInfo("UTC")),  # 到期失效
)

# --- 创建 crontab 调度 ---
cron, _ = CrontabSchedule.objects.get_or_create(
    minute="0",
    hour="9",
    day_of_week="1-5",          # 周一到周五
    day_of_month="*",
    month_of_year="*",
    timezone=ZoneInfo("Asia/Shanghai"),
)

PeriodicTask.objects.create(
    crontab=cron,
    name="Workday Morning Report",
    task="proj.tasks.generate_report",
    kwargs=json.dumps({"report_type": "daily"}),
)

# --- 创建一次性调度（Clocked）---
clocked, _ = ClockedSchedule.objects.get_or_create(
    clocked_time=datetime(2026, 6, 1, 10, 0, tzinfo=ZoneInfo("Asia/Shanghai")),
)

PeriodicTask.objects.create(
    clocked=clocked,
    one_off=True,               # 执行一次后自动禁用
    name="Product Launch Notification",
    task="proj.tasks.send_launch_email",
    args=json.dumps(["all_subscribers"]),
)
```

### 动态修改和删除

```python
# 修改调度频率
task = PeriodicTask.objects.get(name="Poll API Every 30s")
new_interval, _ = IntervalSchedule.objects.get_or_create(
    every=60, period=IntervalSchedule.SECONDS
)
task.interval = new_interval
task.save()  # save() 自动更新 PeriodicTasks 变更计数器，Beat 会重新加载

# 临时禁用
task.enabled = False
task.save()

# 重新启用
task.enabled = True
task.save()

# 删除
task.delete()

# 批量操作
PeriodicTask.objects.filter(name__startswith="temp-").update(enabled=False)
```

### FastAPI 中动态管理定时任务

FastAPI 项目没有 Django ORM，可通过直接修改 beat_schedule 配置或使用 Redbeat 实现动态调度：

```bash
pip install celery-redbeat
```

```python
# app/worker.py
from celery import Celery

celery_app = Celery("worker", broker="redis://localhost:6379/0")
celery_app.conf.update(
    beat_scheduler="redbeat.RedBeatSchedulerEntry",
    redbeat_redis_url="redis://localhost:6379/2",
)
```

```python
# app/api.py  动态创建/管理定时任务
from fastapi import FastAPI, HTTPException
from redbeat import RedBeatSchedulerEntry
from celery.schedules import crontab, schedule
from app.worker import celery_app

app = FastAPI()

@app.post("/schedules/")
def create_schedule(name: str, task: str, cron_expr: dict, args: list = None):
    """动态创建定时任务"""
    entry = RedBeatSchedulerEntry(
        name=name,
        task=task,
        schedule=crontab(**cron_expr),  # {"hour": 9, "minute": 0}
        args=args or [],
        app=celery_app,
    )
    entry.save()
    return {"name": name, "status": "created"}

@app.delete("/schedules/{name}")
def delete_schedule(name: str):
    """删除定时任务"""
    try:
        entry = RedBeatSchedulerEntry.from_key(
            f"redbeat:{name}", app=celery_app
        )
        entry.delete()
        return {"name": name, "status": "deleted"}
    except KeyError:
        raise HTTPException(status_code=404, detail="Schedule not found")

@app.get("/schedules/")
def list_schedules():
    """列出所有定时任务"""
    from redbeat.schedulers import RedBeatScheduler
    scheduler = RedBeatScheduler(app=celery_app)
    entries = []
    for key in scheduler.Entry.get_all_keys(app=celery_app):
        entry = RedBeatSchedulerEntry.from_key(key, app=celery_app)
        entries.append({
            "name": entry.name,
            "task": entry.task,
            "schedule": str(entry.schedule),
            "enabled": entry.enabled,
        })
    return entries
```

## Django 完整集成示例

```python
# myproject/settings.py
INSTALLED_APPS = [
    ...
    "django_celery_beat",
    "django_celery_results",
]

CELERY_BROKER_URL = "redis://localhost:6379/0"
CELERY_RESULT_BACKEND = "django-db"
CELERY_BEAT_SCHEDULER = "django_celery_beat.schedulers:DatabaseScheduler"
CELERY_TIMEZONE = "Asia/Shanghai"
```

```python
# myapp/tasks.py
from celery import shared_task
from django.core.mail import send_mail
from django.utils import timezone

@shared_task
def daily_report():
    today = timezone.now().date()
    stats = compute_daily_stats(today)
    send_mail(
        subject=f"日报 - {today}",
        message=str(stats),
        from_email="noreply@example.com",
        recipient_list=["admin@example.com"],
    )
    return {"date": str(today), "sent": True}

@shared_task
def cleanup_old_records(days=30):
    cutoff = timezone.now() - timezone.timedelta(days=days)
    count, _ = OldRecord.objects.filter(created_at__lt=cutoff).delete()
    return {"deleted": count}
```

```python
# myapp/management/commands/setup_schedules.py
from django.core.management.base import BaseCommand
from django_celery_beat.models import PeriodicTask, CrontabSchedule, IntervalSchedule
import json
from zoneinfo import ZoneInfo

class Command(BaseCommand):
    help = "初始化定时任务"

    def handle(self, *args, **options):
        # 每天早上 9:00 生成日报
        cron, _ = CrontabSchedule.objects.get_or_create(
            minute="0", hour="9",
            day_of_week="*", day_of_month="*", month_of_year="*",
            timezone=ZoneInfo("Asia/Shanghai"),
        )
        PeriodicTask.objects.update_or_create(
            name="daily-report",
            defaults={
                "crontab": cron,
                "task": "myapp.tasks.daily_report",
                "enabled": True,
            },
        )

        # 每 6 小时清理旧数据
        interval, _ = IntervalSchedule.objects.get_or_create(
            every=6, period=IntervalSchedule.HOURS,
        )
        PeriodicTask.objects.update_or_create(
            name="cleanup-old-records",
            defaults={
                "interval": interval,
                "task": "myapp.tasks.cleanup_old_records",
                "kwargs": json.dumps({"days": 90}),
                "enabled": True,
            },
        )

        self.stdout.write(self.style.SUCCESS("定时任务初始化完成"))
```

## 常见陷阱

- **Beat 多实例重复调度**：Beat 必须单实例运行；在 Docker/K8s 中部署时，确保只有一个 Beat Pod/Container（使用 Deployment replicas=1 或分布式锁）
- **django-celery-beat 不自动发现任务**：`PeriodicTask.task` 字段是字符串（任务全路径名），拼写错误不会在创建时报错，只有运行时才会 `NotRegistered`
- **修改 beat_schedule 后不生效**：默认文件调度器（shelve）会缓存上次的调度信息，删除 `celerybeat-schedule` 文件或使用 `--schedule` 指定新路径
- **时区混淆**：`enable_utc=True` 时，crontab 的时间是 UTC；如果业务在东八区，用 `crontab(hour=1, minute=0)` 对应的是北京时间 9:00。推荐在 crontab 中显式指定 `timezone`
- **ClockedSchedule 忘记设 one_off=True**：Clocked 本意是一次性任务，不设 `one_off=True` 会导致 Beat 在该时间点后每次启动都重复调度
- **interval 的最小精度**：Beat 的 `beat_max_loop_interval` 默认 5 秒（Django 用 DatabaseScheduler 时可能更长），极短间隔（如 1 秒）不保证精确
- **PeriodicTask.save() 的副作用**：每次 save 都会更新 `PeriodicTasks` 全局计数器，触发 Beat 重新加载所有调度；高频更新时注意性能

## 组合提示

- 与 **celery-core** 搭配：Beat 依赖 Celery app 实例和 Broker 配置
- 与 **celery-patterns** 搭配：定时任务的 `task` 可以是触发 Canvas 工作流的入口任务
- 与 **celery-monitoring** 搭配：通过 Flower 查看定时任务的执行历史和成功率
- Django 项目推荐组合：`django-celery-beat`（数据库调度）+ `django-celery-results`（数据库存储结果）
- FastAPI 项目推荐组合：`celery-redbeat`（Redis 存储调度）实现动态管理
