---
name: celery-monitoring
description: "Celery 监控与可靠性：Flower 面板、事件信号、自动重试/退避、任务超时、死信队列、inspect/control 命令。"
tech_stack: [celery]
language: [python]
---

# Celery Monitoring（监控与可靠性）

> 来源：https://docs.celeryq.dev/en/stable/userguide/monitoring.html
> 版本基准：Celery 5.4+（当前稳定线 5.6）

## 用途

覆盖 Celery 生产运维的核心需求：实时监控 Worker 和任务状态（Flower）、基于事件信号的自定义逻辑（告警/审计）、任务级错误处理与自动重试策略、超时控制、死信队列、以及通过 inspect/control API 运维管理 Worker 集群。

## 何时使用

- 需要 Web 界面实时查看 Worker 状态和任务执行情况
- 需要在任务成功/失败/重试时触发自定义逻辑（告警、日志、指标采集）
- 需要对不稳定的外部调用（HTTP、数据库）实现自动重试与指数退避
- 需要防止任务无限运行（超时控制）
- 需要运维命令检查/控制运行中的 Worker

## Flower Web 监控

### 安装与启动

```bash
pip install flower

# 基础启动
celery -A proj flower

# 完整参数
celery -A proj flower \
    --port=5555 \
    --broker=redis://localhost:6379/0 \
    --basic-auth=admin:secret \           # 基础认证
    --persistent=True \                   # 持久化任务历史
    --db=flower.db \                      # 持久化数据库路径
    --max-tasks=10000                     # 内存中保留的最大任务数

# 通过环境变量配置（Docker 部署常用）
CELERY_BROKER_URL=redis://redis:6379/0 celery flower
```

### Flower 功能概览

| 功能 | 说明 |
|------|------|
| Dashboard | Worker 列表、在线状态、处理速率 |
| Tasks | 任务列表（按状态过滤）、参数、结果、耗时、异常栈 |
| Worker 管理 | 在线调整 concurrency、关闭/重启 Worker |
| Broker | 队列长度、消息数、消费者数 |
| 图表 | 任务成功/失败趋势、Worker 负载 |
| API | REST API 可用于集成到自有监控系统 |

### Flower REST API

```python
import httpx

FLOWER_URL = "http://localhost:5555/api"

# 列出所有 Worker
workers = httpx.get(f"{FLOWER_URL}/workers").json()

# 查看特定任务
task = httpx.get(f"{FLOWER_URL}/task/info/{task_id}").json()

# 获取队列长度
queues = httpx.get(f"{FLOWER_URL}/queues/length").json()

# 终止任务
httpx.post(f"{FLOWER_URL}/task/revoke/{task_id}", json={"terminate": True})
```

### Docker Compose 部署

```yaml
# docker-compose.yml
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  worker:
    build: .
    command: celery -A proj worker --loglevel=info --concurrency=4
    depends_on: [redis]
    environment:
      CELERY_BROKER_URL: redis://redis:6379/0
      CELERY_RESULT_BACKEND: redis://redis:6379/1

  beat:
    build: .
    command: celery -A proj beat --loglevel=info
    depends_on: [redis]
    environment:
      CELERY_BROKER_URL: redis://redis:6379/0

  flower:
    build: .
    command: celery -A proj flower --port=5555
    ports: ["5555:5555"]
    depends_on: [redis]
    environment:
      CELERY_BROKER_URL: redis://redis:6379/0
```

## 事件信号系统

### 任务生命周期信号

```python
from celery.signals import (
    before_task_publish,
    after_task_publish,
    task_prerun,
    task_postrun,
    task_success,
    task_failure,
    task_retry,
    task_revoked,
)

@before_task_publish.connect
def on_before_publish(sender=None, headers=None, body=None, **kwargs):
    """任务发送到 Broker 之前（在发送端进程执行）"""
    print(f"即将发送任务: {sender}, id={headers['id']}")

@after_task_publish.connect
def on_after_publish(sender=None, headers=None, body=None, **kwargs):
    """任务消息已发送到 Broker"""
    print(f"任务已发送: {sender}")

@task_prerun.connect
def on_task_prerun(sender=None, task_id=None, task=None, args=None, **kwargs):
    """任务即将在 Worker 中执行"""
    print(f"开始执行: {task.name}[{task_id}]")

@task_postrun.connect
def on_task_postrun(sender=None, task_id=None, task=None, retval=None,
                    state=None, **kwargs):
    """任务在 Worker 中执行完毕（无论成功/失败）"""
    print(f"执行完毕: {task.name}[{task_id}] state={state}")

@task_success.connect
def on_task_success(sender=None, result=None, **kwargs):
    """任务执行成功"""
    print(f"任务成功: {sender.name}, 结果: {result}")

@task_failure.connect
def on_task_failure(sender=None, task_id=None, exception=None,
                    traceback=None, **kwargs):
    """任务执行失败"""
    print(f"任务失败: {sender.name}[{task_id}], 异常: {exception}")
    # 常见用途：发送告警
    send_alert(f"Celery task failed: {sender.name}", str(exception))

@task_retry.connect
def on_task_retry(sender=None, request=None, reason=None, **kwargs):
    """任务正在重试"""
    print(f"任务重试: {sender.name}, 原因: {reason}")

@task_revoked.connect
def on_task_revoked(sender=None, request=None, terminated=None, **kwargs):
    """任务被撤销"""
    print(f"任务撤销: {sender.name}, terminated={terminated}")
```

### Worker 信号

```python
from celery.signals import (
    worker_init,
    worker_ready,
    worker_shutting_down,
    worker_process_init,
)

@worker_init.connect
def on_worker_init(**kwargs):
    """Worker 主进程初始化（在 fork 子进程之前）"""
    print("Worker 初始化")

@worker_ready.connect
def on_worker_ready(**kwargs):
    """Worker 已准备好接收任务"""
    print("Worker 就绪")

@worker_process_init.connect
def on_worker_process_init(**kwargs):
    """Worker 子进程初始化（每个子进程各调一次，适合初始化数据库连接）"""
    db.init_connection()

@worker_shutting_down.connect
def on_worker_shutdown(**kwargs):
    """Worker 正在关闭"""
    print("Worker 关闭中")
```

### 信号最佳实践

```python
# 1. 始终接受 **kwargs，防止 Celery 新版本添加参数时出错
@task_success.connect
def handler(sender=None, result=None, **kwargs):  # 注意 **kwargs
    pass

# 2. 限定信号只对特定任务生效
@task_success.connect(sender="proj.tasks.important_task")
def on_important_success(sender=None, result=None, **kwargs):
    notify_team(result)

# 3. 将信号处理器放在独立模块中，在 app.ready() 或 celery 配置中导入
# proj/signals.py  <-- 定义信号处理器
# proj/celery.py   <-- import proj.signals
```

## 错误处理与自动重试

### autoretry_for（声明式自动重试）

```python
from celery import shared_task
import httpx

@shared_task(
    bind=True,
    autoretry_for=(httpx.HTTPError, ConnectionError, TimeoutError),
    retry_backoff=True,          # 启用指数退避
    retry_backoff_max=600,       # 最大退避间隔 600 秒（默认也是 600）
    retry_jitter=True,           # 在退避时间上添加随机抖动（防惊群）
    retry_kwargs={"max_retries": 5},  # 最大重试 5 次
)
def call_external_api(self, url: str, payload: dict):
    """自动重试：遇到 HTTP/连接/超时错误时指数退避重试"""
    response = httpx.post(url, json=payload, timeout=30)
    response.raise_for_status()
    return response.json()

# 退避计算：第 N 次重试等待 2^N 秒（加 jitter）
# 第 1 次: ~2s, 第 2 次: ~4s, 第 3 次: ~8s, 第 4 次: ~16s, 第 5 次: ~32s
```

### 手动重试（bind=True + self.retry）

```python
@shared_task(bind=True, max_retries=3)
def process_payment(self, order_id: int):
    try:
        result = payment_gateway.charge(order_id)
        return result
    except payment_gateway.TemporaryError as exc:
        # 手动重试，指定倒计时
        raise self.retry(exc=exc, countdown=60)
    except payment_gateway.PermanentError as exc:
        # 永久性错误，不重试，记录并通知
        log_permanent_failure(order_id, exc)
        raise  # 让任务标记为 FAILURE
```

### 自定义重试策略

```python
@shared_task(bind=True, max_retries=10)
def resilient_task(self, data):
    try:
        return do_work(data)
    except TransientError as exc:
        # 自定义退避：指数退避 + 最大 5 分钟 + 随机抖动
        import random
        backoff = min(2 ** self.request.retries * 10, 300)
        jitter = random.uniform(0, backoff * 0.1)
        raise self.retry(exc=exc, countdown=backoff + jitter)
```

## 任务超时控制

```python
@shared_task(
    soft_time_limit=120,   # 软超时 120 秒：抛出 SoftTimeLimitExceeded
    time_limit=180,        # 硬超时 180 秒：直接 SIGKILL 子进程
)
def long_running_task(data):
    from celery.exceptions import SoftTimeLimitExceeded
    try:
        for chunk in process_in_chunks(data):
            handle(chunk)
    except SoftTimeLimitExceeded:
        # 软超时：有机会做清理工作
        save_partial_progress(data)
        raise  # 重新抛出，任务标记为失败

# Worker 全局超时配置
# celeryconfig.py
task_soft_time_limit = 300   # 全局软超时 5 分钟
task_time_limit = 360        # 全局硬超时 6 分钟
```

**soft_time_limit vs time_limit**：
- `soft_time_limit`：抛出 `SoftTimeLimitExceeded` 异常，任务代码可以 catch 并做清理
- `time_limit`：直接终止进程（SIGKILL），无法 catch，应设置比 soft 大一些作为兜底

## 死信队列（DLQ）

Celery 本身没有原生 DLQ 概念，但可以通过以下方式实现：

### 基于 RabbitMQ 的 DLQ

```python
from kombu import Exchange, Queue

# 定义死信交换机和队列
dead_letter_exchange = Exchange("dead_letter", type="direct")
dead_letter_queue = Queue(
    "dead_letter_queue",
    exchange=dead_letter_exchange,
    routing_key="dead_letter",
)

# 主任务队列配置死信路由
task_queues = (
    Queue(
        "default",
        Exchange("default"),
        routing_key="default",
        queue_arguments={
            "x-dead-letter-exchange": "dead_letter",
            "x-dead-letter-routing-key": "dead_letter",
        },
    ),
    dead_letter_queue,
)
```

### 基于信号的软 DLQ

```python
from celery.signals import task_failure
from celery import shared_task
import json

@task_failure.connect
def on_task_failure(sender=None, task_id=None, exception=None,
                    args=None, kwargs=None, traceback=None, **kw):
    """所有任务失败后的统一处理：写入死信表"""
    dead_letter = {
        "task_id": task_id,
        "task_name": sender.name,
        "args": args,
        "kwargs": kwargs,
        "exception": str(exception),
        "traceback": str(traceback),
    }
    # 写入数据库或 Redis
    redis_client.lpush("celery:dead_letters", json.dumps(dead_letter))

@shared_task
def retry_dead_letters(limit=100):
    """定时重试死信队列中的任务"""
    from celery import current_app
    for _ in range(limit):
        raw = redis_client.rpop("celery:dead_letters")
        if not raw:
            break
        letter = json.loads(raw)
        task = current_app.tasks.get(letter["task_name"])
        if task:
            task.apply_async(
                args=letter["args"],
                kwargs=letter["kwargs"],
                queue="retry_queue",
            )
```

## Inspect 与 Control 命令

### Inspect（只读查询）

```python
from proj.celery_app import app

inspect = app.control.inspect()

# 查看所有在线 Worker
inspect.ping()
# {'worker1@host': {'ok': 'pong'}, 'worker2@host': {'ok': 'pong'}}

# 正在执行的任务
inspect.active()
# {'worker1@host': [{'id': '...', 'name': 'proj.tasks.add', ...}]}

# 已预取等待执行的任务
inspect.reserved()

# 已注册的任务列表
inspect.registered()

# Worker 统计信息
inspect.stats()
# 包含 pool 信息、broker 连接、prefetch_count 等

# 查看定时任务调度表
inspect.scheduled()

# 查看活跃的 revoke 列表
inspect.revoked()

# 查看 Worker 配置
inspect.conf()

# 只查询特定 Worker
inspect_one = app.control.inspect(destination=["worker1@host"])
inspect_one.active()
```

### Control（写操作）

```python
control = app.control

# 撤销任务（任务还未开始执行时有效）
control.revoke(task_id)

# 撤销并终止正在执行的任务
control.revoke(task_id, terminate=True, signal="SIGTERM")

# 广播：让所有 Worker 增加/减少并发
control.pool_grow(n=2)         # 增加 2 个进程
control.pool_shrink(n=1)       # 减少 1 个进程

# 添加/取消消费队列
control.add_consumer("high_priority", destination=["worker1@host"])
control.cancel_consumer("low_priority")

# 限速：限制某任务的执行频率
control.rate_limit("proj.tasks.send_email", "100/m")

# 优雅关闭 Worker
control.shutdown(destination=["worker1@host"])

# 心跳检测
control.ping(timeout=5)
```

### 命令行方式

```bash
# inspect 命令
celery -A proj inspect active
celery -A proj inspect reserved
celery -A proj inspect registered
celery -A proj inspect stats
celery -A proj inspect ping

# control 命令
celery -A proj control revoke <task-id>
celery -A proj control rate_limit proj.tasks.send_email 100/m
celery -A proj control pool_grow 2

# 实时事件监控（终端）
celery -A proj events           # TUI 界面
celery -A proj events --dump    # 原始事件流
```

## 生产环境监控集成

### Prometheus + Grafana

```bash
pip install celery-exporter
# 或使用 flower 的 /metrics 端点
```

```python
# 自定义 Prometheus 指标
from prometheus_client import Counter, Histogram
from celery.signals import task_success, task_failure, task_prerun, task_postrun
import time

TASK_COUNTER = Counter(
    "celery_tasks_total", "Total tasks", ["task_name", "status"]
)
TASK_DURATION = Histogram(
    "celery_task_duration_seconds", "Task duration", ["task_name"]
)

_task_start_times = {}

@task_prerun.connect
def on_prerun(task_id=None, task=None, **kwargs):
    _task_start_times[task_id] = time.time()

@task_postrun.connect
def on_postrun(task_id=None, task=None, state=None, **kwargs):
    start = _task_start_times.pop(task_id, None)
    if start:
        TASK_DURATION.labels(task_name=task.name).observe(time.time() - start)

@task_success.connect
def on_success(sender=None, **kwargs):
    TASK_COUNTER.labels(task_name=sender.name, status="success").inc()

@task_failure.connect
def on_failure(sender=None, **kwargs):
    TASK_COUNTER.labels(task_name=sender.name, status="failure").inc()
```

### Sentry 集成

```bash
pip install sentry-sdk
```

```python
# celery.py 或 conftest.py
import sentry_sdk
from sentry_sdk.integrations.celery import CeleryIntegration

sentry_sdk.init(
    dsn="https://xxx@sentry.io/123",
    integrations=[CeleryIntegration()],
    traces_sample_rate=0.1,        # 采样 10% 的任务做 tracing
    send_default_pii=False,
)
# CeleryIntegration 自动捕获任务异常、重试、超时
```

### 结构化日志

```python
import structlog
from celery.signals import task_prerun, task_postrun, task_failure

logger = structlog.get_logger()

@task_prerun.connect
def log_task_start(task_id=None, task=None, args=None, kwargs=None, **kw):
    logger.info("task.start", task_name=task.name, task_id=task_id,
                args=args, kwargs=kwargs)

@task_postrun.connect
def log_task_end(task_id=None, task=None, state=None, retval=None, **kw):
    logger.info("task.end", task_name=task.name, task_id=task_id, state=state)

@task_failure.connect
def log_task_failure(task_id=None, sender=None, exception=None, **kw):
    logger.error("task.failure", task_name=sender.name, task_id=task_id,
                 exception=str(exception))
```

## 常见陷阱

- **soft_time_limit 对 gevent/eventlet 池不生效**：软超时基于信号机制，仅对 prefork 池有效；gevent/eventlet 池需要在任务内部自行实现超时控制
- **revoke 对 Redis Broker 的局限**：revoke 命令在 Redis Broker 下通过 Worker 内存中的 revoke 集合实现，Worker 重启后丢失；RabbitMQ Broker 则原生支持
- **Flower 内存增长**：Flower 默认将所有任务事件存储在内存中，长时间运行需设置 `--max-tasks` 限制
- **信号处理器中的异常**：信号处理器内抛出异常不会影响任务执行，但会被静默吞掉；务必在处理器内做好 try/except
- **autoretry_for 与 bind=True 的参数**：使用 `autoretry_for` 时如果同时 `bind=True`，`self` 会自动注入，不需要额外处理
- **retry_backoff 的默认最大值是 600 秒**：如果不设 `retry_backoff_max`，最大退避间隔为 10 分钟，对某些场景可能太长
- **inspect 命令超时**：`inspect.active()` 等命令是向所有 Worker 发送广播并等待回复，如果有 Worker 离线会等待直到超时；建议设置 `timeout` 参数
- **task_failure 信号不捕获 Retry 异常**：任务重试时抛出的 `Retry` 异常触发的是 `task_retry` 信号而非 `task_failure`；只有最终放弃重试后才触发 `task_failure`
- **Flower basic_auth 不加密**：`--basic-auth` 是明文 HTTP 认证，生产环境应在 Flower 前放置 Nginx 反向代理并配置 HTTPS

## 组合提示

- 与 **celery-core** 搭配：Worker 启动参数（concurrency/pool）直接影响监控指标和超时行为
- 与 **celery-patterns** 搭配：chord/chain 中的错误回调（`link_error` / `on_error`）与信号互补，前者处理工作流级错误，后者处理全局横切关注点
- 与 **celery-scheduling** 搭配：Beat 定时任务的执行历史可通过 Flower 查看，失败的定时任务可通过信号触发告警
- Sentry + CeleryIntegration 是最低成本的生产监控方案，自动捕获异常和性能数据
