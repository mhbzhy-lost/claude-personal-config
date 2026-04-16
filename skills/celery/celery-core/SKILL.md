---
name: celery-core
description: "Celery 应用创建、任务定义、Broker/Backend 配置、Worker 启动参数、任务序列化全流程。"
tech_stack: [celery, backend]
language: [python]
---

# Celery Core（核心基础）

> 来源：https://docs.celeryq.dev/en/stable/getting-started/introduction.html
> 版本基准：Celery 5.4+（当前稳定线 5.6）

## 用途

Celery 是 Python 分布式任务队列框架，通过消息中间件（Broker）将耗时操作异步分发给后台 Worker 进程执行，支持结果存储、任务重试、定时调度等能力。适用于 Web 应用中的异步处理、CPU 密集型计算分发、定时批处理等场景。

## 何时使用

- Web 请求中需要卸载耗时操作（发邮件、生成报表、调用第三方 API）
- 需要水平扩展的后台计算集群
- 需要可靠的任务重试与错误恢复机制
- 需要定时/周期性任务调度（配合 Celery Beat）
- 需要复杂的任务编排工作流（配合 Canvas）

## 安装

```bash
pip install celery[redis]       # Redis 作为 Broker + Backend
# 或
pip install celery[rabbitmq]    # RabbitMQ 作为 Broker（需单独安装 RabbitMQ 服务）
# 常见组合
pip install celery[redis] flower  # 附带监控面板
```

## Celery 应用创建

### 最小示例

```python
# proj/celery_app.py
from celery import Celery

app = Celery(
    "proj",                                    # 应用名称
    broker="redis://localhost:6379/0",         # Broker 地址
    backend="redis://localhost:6379/1",        # 结果存储地址
)

# 可选：从配置对象加载
app.config_from_object("proj.celeryconfig")
```

### 配置文件方式

```python
# proj/celeryconfig.py
broker_url = "redis://localhost:6379/0"
result_backend = "redis://localhost:6379/1"

# 序列化
task_serializer = "json"
result_serializer = "json"
accept_content = ["json"]

# 时区
timezone = "Asia/Shanghai"
enable_utc = True

# 任务执行
task_acks_late = True                 # 任务完成后才确认（更可靠）
task_reject_on_worker_lost = True     # Worker 异常退出时拒绝任务（重新入队）
worker_prefetch_multiplier = 1        # 每个进程只预取 1 条（长任务推荐）

# 结果过期
result_expires = 3600                 # 结果保存 1 小时
```

### Django 集成

```python
# myproject/celery.py
import os
from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "myproject.settings")

app = Celery("myproject")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()   # 自动发现各 app 下的 tasks.py
```

```python
# myproject/__init__.py
from .celery import app as celery_app
__all__ = ("celery_app",)
```

```python
# myproject/settings.py
CELERY_BROKER_URL = "redis://localhost:6379/0"
CELERY_RESULT_BACKEND = "redis://localhost:6379/1"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_TIMEZONE = "Asia/Shanghai"
```

### FastAPI 集成

```python
# app/worker.py
from celery import Celery

celery_app = Celery(
    "worker",
    broker="redis://localhost:6379/0",
    backend="redis://localhost:6379/1",
)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Shanghai",
    enable_utc=True,
)
```

```python
# app/tasks.py
from app.worker import celery_app

@celery_app.task(name="process_data")
def process_data(data: dict) -> dict:
    # 耗时处理逻辑
    result = heavy_computation(data)
    return {"status": "done", "result": result}
```

```python
# app/main.py
from fastapi import FastAPI
from celery.result import AsyncResult
from app.tasks import process_data

app = FastAPI()

@app.post("/tasks/")
def create_task(data: dict):
    task = process_data.delay(data)
    return {"task_id": task.id}

@app.get("/tasks/{task_id}")
def get_task_result(task_id: str):
    result = AsyncResult(task_id)
    return {
        "task_id": task_id,
        "status": result.status,       # PENDING / STARTED / SUCCESS / FAILURE
        "result": result.result if result.ready() else None,
    }
```

## 任务定义

### @app.task vs @shared_task

```python
# 方式一：绑定到具体 app 实例
@celery_app.task
def add(x, y):
    return x + y

# 方式二：shared_task —— 不依赖具体 app 实例（推荐，尤其 Django）
from celery import shared_task

@shared_task
def add(x, y):
    return x + y
```

**选择原则**：Django 项目或需要跨模块复用的任务用 `@shared_task`；独立脚本或 FastAPI 项目用 `@app.task`。

### 绑定任务（bind=True）

```python
@shared_task(bind=True)
def send_email(self, to: str, subject: str, body: str):
    """bind=True 时第一个参数 self 是任务实例，可访问 self.request / self.retry"""
    try:
        mail_client.send(to, subject, body)
    except ConnectionError as exc:
        # 手动重试，最多 3 次，间隔 60 秒
        raise self.retry(exc=exc, countdown=60, max_retries=3)
```

### 任务常用参数

```python
@shared_task(
    name="proj.tasks.send_report",    # 显式任务名（跨项目调用必须）
    bind=True,
    max_retries=5,
    default_retry_delay=30,           # 默认重试间隔（秒）
    soft_time_limit=120,              # 软超时（抛 SoftTimeLimitExceeded）
    time_limit=180,                   # 硬超时（直接 kill）
    rate_limit="10/m",                # 每分钟最多执行 10 次
    ignore_result=True,               # 不存储结果（提升性能）
    acks_late=True,                   # 执行完才确认
    track_started=True,               # 任务开始时记录 STARTED 状态
    serializer="json",                # 本任务的序列化方式
)
def send_report(self, report_id: int):
    ...
```

### 任务调用方式

```python
# 异步调用（最常用）
result = add.delay(4, 6)

# 等价写法，支持更多参数
result = add.apply_async(
    args=(4, 6),
    countdown=10,            # 延迟 10 秒执行
    expires=60,              # 60 秒后过期
    queue="high_priority",   # 指定队列
    priority=9,              # 优先级（0-9，RabbitMQ）
)

# 同步调用（测试/调试用）
result = add.apply(args=(4, 6))
result_value = result.get()   # 阻塞等待结果

# 获取异步结果
async_result = add.delay(4, 6)
async_result.ready()    # 是否完成
async_result.status     # 状态字符串
async_result.get(timeout=10)  # 阻塞等待，带超时
```

## Broker 配置

### Redis

```python
broker_url = "redis://:password@hostname:6379/0"
# Sentinel 高可用
broker_url = "sentinel://sentinel1:26379;sentinel://sentinel2:26379"
broker_transport_options = {
    "master_name": "mymaster",
    "sentinel_kwargs": {"password": "sentinel_pass"},
}
```

### RabbitMQ

```python
broker_url = "amqp://user:password@hostname:5672/myvhost"
# 连接池
broker_pool_limit = 10
broker_connection_timeout = 4.0
```

## Backend 结果存储

```python
# Redis
result_backend = "redis://localhost:6379/1"

# 数据库（通过 SQLAlchemy）
result_backend = "db+postgresql://user:pass@localhost/celery_results"

# Django ORM（需安装 django-celery-results）
# pip install django-celery-results
# INSTALLED_APPS += ["django_celery_results"]
result_backend = "django-db"

# 不需要结果时（推荐提升性能）
result_backend = None    # 或在任务上设置 ignore_result=True
```

## Worker 启动与参数

```bash
# 基础启动
celery -A proj worker --loglevel=info

# 完整参数示例
celery -A proj worker \
    --loglevel=info \
    --concurrency=4 \           # 并发进程/线程数
    --pool=prefork \            # 执行池类型
    --queues=default,high \     # 监听的队列
    --hostname=worker1@%h \     # Worker 标识
    --max-tasks-per-child=1000  # 每个子进程执行 1000 个任务后回收（防内存泄漏）
```

### 执行池类型（--pool）

| 池类型 | 适用场景 | 说明 |
|--------|---------|------|
| `prefork`（默认） | CPU 密集型 | 基于 multiprocessing，绕过 GIL |
| `gevent` | I/O 密集型 | 协程，可开数百并发 |
| `eventlet` | I/O 密集型 | 类似 gevent，基于 greenlet |
| `solo` | 开发/调试 | 单进程，无并发 |
| `threads` | 轻量 I/O | 基于线程池 |

```bash
# I/O 密集型任务：gevent 池 + 高并发
pip install gevent
celery -A proj worker --pool=gevent --concurrency=500

# CPU 密集型任务：prefork + 按 CPU 核心数
celery -A proj worker --pool=prefork --concurrency=8
```

### prefetch_multiplier 调优

```python
# 默认值 4：每个进程预取 4 条消息
worker_prefetch_multiplier = 4

# 长任务推荐设为 1：避免任务积压在单个 Worker
worker_prefetch_multiplier = 1

# 短任务高吞吐可调大
worker_prefetch_multiplier = 16
```

## 任务序列化

```python
# 全局配置
task_serializer = "json"       # 推荐：安全、跨语言
result_serializer = "json"
accept_content = ["json"]

# pickle：支持复杂 Python 对象，但有安全风险
task_serializer = "pickle"
accept_content = ["pickle", "json"]

# msgpack：高性能二进制（需 pip install msgpack）
task_serializer = "msgpack"
accept_content = ["msgpack", "json"]
```

**安全原则**：生产环境优先用 `json`，仅在受信网络内使用 `pickle`。`accept_content` 限制 Worker 接受的格式，避免反序列化攻击。

## 任务路由

```python
# celeryconfig.py
task_routes = {
    "proj.tasks.send_email": {"queue": "email"},
    "proj.tasks.process_image": {"queue": "media"},
    "proj.tasks.*": {"queue": "default"},
}

# 启动不同队列的 Worker
# celery -A proj worker --queues=email --concurrency=2
# celery -A proj worker --queues=media --concurrency=4 --pool=prefork
```

## 常见陷阱

- **忘记启动 Worker**：`delay()` 只是发消息到 Broker，必须有 Worker 在运行才会执行
- **Django 忘记 autodiscover_tasks()**：任务不会被自动注册，导致 `NotRegistered` 错误
- **pickle 安全风险**：不要在公网暴露的 Broker 上使用 pickle 序列化，攻击者可构造恶意消息
- **result.get() 在任务中调用**：在一个任务内部调用另一个任务的 `result.get()` 会导致死锁（Worker 进程被阻塞），应使用 Canvas 的 chain/chord 替代
- **prefetch_multiplier 过大**：长任务场景下，大量任务被预取到单个 Worker 而其他 Worker 空闲，设为 1 可缓解
- **task_acks_late 未配合 reject_on_worker_lost**：开启 `acks_late` 后，如果 Worker 被 kill，任务默认丢失；需同时设 `task_reject_on_worker_lost=True`
- **时区问题**：`enable_utc=True`（默认）时，所有时间为 UTC；与业务时区不一致时容易引发定时任务触发时间错误
- **Redis 作为 Broker 的限制**：Redis 不支持消息优先级（`priority` 参数无效），也无原生 confirm 机制；对可靠性要求高的场景考虑 RabbitMQ

## 组合提示

- 与 **celery-patterns** 搭配：使用 Canvas（chain/group/chord）编排复杂任务工作流
- 与 **celery-scheduling** 搭配：使用 Celery Beat 实现定时/周期任务
- 与 **celery-monitoring** 搭配：使用 Flower 监控 + 事件信号追踪任务状态
- Django 项目建议同时安装 `django-celery-results`（数据库存储结果）和 `django-celery-beat`（数据库管理定时任务）
