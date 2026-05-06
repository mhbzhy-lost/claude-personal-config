---
name: arq-tasks
description: Define, enqueue, and manage arq background tasks — deferral, uniqueness, results, retries, cron scheduling, and serialization.
tech_stack: [arq]
language: [python]
capability: [task-scheduler, message-queue]
version: "arq v0.28.0"
collected_at: 2026-04-16
---

# arq Tasks

> Source: https://github.com/python-arq/arq, https://arq-docs.helpmanual.io/

## Purpose

Define async Python functions as arq tasks, enqueue them into Redis-backed queues,
and interact with job lifecycle — check status, retrieve results, retry on failure,
and schedule deferred or periodic execution. The task author writes the function;
the arq worker executes it.

## When to Use

- Writing background tasks for an async Python application (replacing Celery/rq).
- Tasks that need deferred execution (`_defer_by`, `_defer_until`).
- Tasks requiring at-most-once-at-a-time semantics (`_job_id` uniqueness).
- Tasks that must retry with configurable backoff on transient failures.
- Scheduled/cron-style periodic work.
- **Caveat**: arq is in maintenance-only mode (see issue #510).

## Basic Usage

### 1. Define the task

Every task is an async function whose first argument is `ctx` (the worker context dict):

```python
async def download_content(ctx, url):
    session = ctx['session']
    response = await session.get(url)
    if response.status_code >= 500:
        raise Retry(defer=ctx['job_try'] * 5)
    return len(response.text)
```

### 2. Enqueue it

```python
from arq import create_pool
from arq.connections import RedisSettings

redis = await create_pool(RedisSettings())
job = await redis.enqueue_job('download_content', 'https://example.com')
```

### 3. Check result (optional)

```python
status = await job.status()          # JobStatus.queued / in_progress / complete
result = await job.result(timeout=30)  # blocks; raises if task raised
```

The worker must be running separately (`arq module.WorkerSettings`) for tasks to execute.

## Key APIs (Summary)

### `ArqRedis.enqueue_job()` — the core API

```python
await redis.enqueue_job(
    function,           # str: function name registered in WorkerSettings.functions
    *args,              # positional args for the function (after ctx)
    _job_id=None,       # str | None: custom ID for uniqueness; returns None if duplicate
    _queue_name=None,   # str | None: route to a different Redis queue
    _defer_by=None,     # int | float | timedelta: delay execution
    _defer_until=None,  # datetime: execute at exact time
    _expires=None,      # int | float | timedelta: max age before dropping (default ~24h)
    _job_try=None,      # int: attempt number (set when re-enqueueing inside a job)
    **kwargs,           # keyword args for the function
) -> Job | None
```

### `Job` — inspect and control a task

```python
job.job_id              # str
await job.info()        # JobDef: metadata without awaiting result
await job.status()      # JobStatus enum
await job.result(timeout)  # Any: poll until complete, re-raises task exceptions
await job.abort()       # cancel running/queued job (worker needs allow_abort_jobs=True)
```

### `Retry` — retry with backoff

```python
from arq import Retry

raise Retry(defer=10)  # re-queue with 10s delay; max_tries defaults to 5
```

`ctx['job_try']` holds the 1-based attempt number — use it for linear/exponential backoff.

### `cron` — periodic scheduling

```python
from arq import cron

cron(func, *, second=0, minute=None, hour=None, day=None, month=None, day_of_week=None)
```

`None` = every. Use sets: `hour={9,12,18}`. `second` defaults to `0`.

### `create_pool` — connect to Redis

```python
redis = await create_pool(
    RedisSettings(host='localhost', port=6379),
    job_serializer=msgpack.packb,         # optional custom serializer
    job_deserializer=lambda b: msgpack.unpackb(b, raw=False),
)
```

## Caveats

- **Idempotency is mandatory**: arq's pessimistic execution means tasks can be
  cancelled mid-run and re-executed. Always use DB transactions, idempotency keys,
  or Redis markers to make tasks safe to re-run.
- **Task name is a magic string**: `enqueue_job('download_content', ...)` must
  match the function name in `WorkerSettings.functions`. Renaming silently breaks.
- **`_job_id` uniqueness is temporary**: Once the job finishes and `keep_result`
  expires (on the worker), the same ID can be reused.
- **Pickle is the default serializer**: Code changes can break deserialization
  of queued jobs. MsgPack is recommended for safety and interop.
- **`_expires` defaults to ~24 hours** from expected start time plus defer time.
  Tasks deferred beyond this are silently dropped.
- **`Job.abort()` requires opt-in**: `allow_abort_jobs=True` on the worker, or
  the call silently does nothing.
- **`ctx` mutations persist**: Don't mutate shared `ctx` state in ways that leak
  across tasks on the same worker.

## Composition Hints

- **From web frameworks**: Create the pool at app startup, reuse it across
  request handlers. Enqueue is non-blocking and cheap.
- **Chaining tasks**: Enqueue the next task from within a task using
  `redis.enqueue_job(...)` — the worker's Redis connection is accessible via `ctx`.
- **Unique per-entity tasks**: Use `_job_id=f'generate-invoice:{company_id}'` to
  ensure at-most-one invoice generation per company at a time.
- **Time-bound tasks**: Set `_expires=timedelta(minutes=5)` so outdated tasks
  are discarded rather than executed late.
- **Blocking code**: Offload to `loop.run_in_executor(ctx['pool'], fn)` — the
  pool is attached in `on_startup` and available via `ctx`.
