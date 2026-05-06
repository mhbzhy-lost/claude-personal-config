---
name: arq-worker
description: Run and manage arq background job workers with asyncio and Redis — startup, shutdown, health checks, cron, retries, and abort.
tech_stack: [arq]
language: [python]
capability: [task-scheduler, message-queue]
version: "arq v0.28.0"
collected_at: 2026-04-16
---

# arq Worker

> Source: https://github.com/python-arq/arq, https://arq-docs.helpmanual.io/

## Purpose

Run an asyncio-based job worker that pulls tasks from Redis queues. arq workers are
configured via a `WorkerSettings` class and launched with the `arq` CLI. The worker
manages task lifecycle — startup/shutdown hooks, concurrent task execution via
asyncio Tasks, health checks, cron scheduling, and graceful (pessimistic) shutdown.

## When to Use

- You need a lightweight async Python worker for Redis-backed job queues.
- You want cron-like periodic task scheduling without a separate scheduler.
- You need health-check endpoints for monitoring worker liveness.
- You are replacing rq/Celery in an asyncio-native codebase.
- **Caveat**: arq is in maintenance-only mode (see issue #510).

## Basic Usage

Define a `WorkerSettings` class with registered functions and optional lifecycle hooks,
then launch via CLI:

```python
# worker.py
from arq.connections import RedisSettings
from httpx import AsyncClient

async def download_content(ctx, url):
    session: AsyncClient = ctx['session']
    response = await session.get(url)
    return len(response.text)

async def startup(ctx):
    ctx['session'] = AsyncClient()

async def shutdown(ctx):
    await ctx['session'].aclose()

class WorkerSettings:
    functions = [download_content]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings()
```

```bash
arq worker.WorkerSettings           # run until stopped
arq worker.WorkerSettings --burst   # stop when queue is empty
arq worker.WorkerSettings --watch ./src  # reload on code changes (needs watchfiles)
```

## Key APIs (Summary)

### WorkerSettings — the central configuration class

| Attribute | Type | Purpose |
|---|---|---|
| `functions` | `list[Callable]` | Async functions the worker can run (by name) |
| `on_startup` | `Coroutine \| None` | Called once when worker starts; populate `ctx` here |
| `on_shutdown` | `Coroutine \| None` | Called once before worker stops; clean up `ctx` resources |
| `redis_settings` | `RedisSettings` | Redis connection configuration |
| `cron_jobs` | `list` | Periodic tasks from `arq.cron.cron()` |
| `allow_abort_jobs` | `bool` | Default `False`; set `True` to enable `Job.abort()` |
| `keep_result` | `int \| None` | Seconds to retain job results in Redis after completion |
| `health_check_interval` | `int` | Seconds between health-check writes to Redis |
| `job_serializer` | `Callable \| None` | Custom serializer (default: pickle) |
| `job_deserializer` | `Callable \| None` | Custom deserializer (default: pickle) |

### CLI

```bash
arq <module>.WorkerSettings [--burst] [--watch <dir>]
arq --check <module>.WorkerSettings   # health check; exit 0 if alive, 1 if not
arq --help
```

### Health checks

Workers write a Redis key every `health_check_interval` seconds with TTL =
`health_check_interval + 1`. The value encodes:

```
Mar-01 17:41:22 j_complete=0 j_failed=0 j_retried=0 j_ongoing=0 queued=0
```

### Cron jobs

```python
from arq import cron

cron(func, *, second=0, minute=None, hour=None, day=None, month=None, day_of_week=None)
```

- `None` = `*` (every). Use sets for multiple: `hour={9,12,18}`.
- `second` defaults to `0`; `microsecond` defaults to `123456` to avoid top-of-second contention.

### The `ctx` dict

Every task receives `ctx` as first argument. It's populated by `on_startup` and
persists across tasks on the same worker. Built-in keys:

| Key | Meaning |
|---|---|
| `ctx['job_id']` | The job's UUID string |
| `ctx['job_try']` | 1-based attempt counter |
| `ctx['enqueue_time']` | `datetime` when the job was enqueued |

## Caveats

- **Pessimistic execution**: Jobs are NOT removed from queue until success/failure.
  On worker shutdown, running jobs are cancelled and re-queued. **Design every job
  to be idempotent** — use DB transactions, idempotency keys, or Redis markers.
- **`allow_abort_jobs` is `False` by default**: `Job.abort()` silently does nothing
  unless explicitly enabled.
- **Pickle serializer is the default**: Both enqueue and worker sides must use the
  same serializer. Changing serializers requires queue draining or backward compat.
- **Job expiry defaults to 24 hours** from expected start (`expires_extra_ms`).
- **Maintenance-only mode**: No active development. Evaluate for new projects.

## Composition Hints

- **With FastAPI**: Enqueue jobs from FastAPI route handlers via `create_pool`;
  run the worker as a separate process (or sidecar container).
- **With Redis Sentinel**: Configure `RedisSettings(sentinel=True, sentinel_master=...)`.
- **Long-running blocking code**: Offload to an executor pool attached to `ctx` in
  `on_startup`; use `loop.run_in_executor(ctx['pool'], fn)` inside tasks.
- **Multiple queues**: Use `_queue_name` in `enqueue_job()` to route jobs to
  different Redis list keys; run separate workers pointed at each queue.
- **Graceful shutdown in containers**: Handle `SIGINT`/`SIGTERM` — the worker
  cancels running jobs and exits. Ensure jobs are idempotent since they will re-run.
