---
name: arq-fastapi
description: Integrate arq (async Python task queue) with FastAPI — lifespan-based Redis pool management, enqueueing jobs from route handlers, and running the worker as a separate process.
tech_stack: [fastapi, redis]
language: [python]
capability: [task-scheduler, web-framework]
version: "arq v0.28.0"
collected_at: 2025-07-17
---

# arq + FastAPI Integration

> Source: https://arq-docs.helpmanual.io/, https://fastapi.tiangolo.com/advanced/events/

## Purpose

Integrate arq (an asyncio-based job queue backed by Redis) into a FastAPI application. The FastAPI process enqueues background jobs; a separate arq worker process dequeues and executes them. They communicate only through Redis.

## When to Use

- Offloading heavy/slow work (email, report generation, file processing) from HTTP request handlers
- Scheduling deferred or future work triggered by API calls
- Running periodic cron jobs alongside your API
- Any scenario where the request-response cycle must remain fast while work happens in the background

## Basic Usage

### 1. Define task functions (shared module, e.g. `tasks.py`)

```python
# tasks.py — importable by BOTH FastAPI and the arq worker
async def send_email(ctx, to: str, subject: str, body: str):
    print(f"Sending to {to}: {subject}")
    return True
```

### 2. FastAPI app with lifespan-managed arq pool (`main.py`)

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Depends
from arq import create_pool
from arq.connections import RedisSettings, ArqRedis

REDIS_SETTINGS = RedisSettings()  # defaults to localhost:6379

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.arq_redis = await create_pool(REDIS_SETTINGS)
    yield
    await app.state.arq_redis.aclose()

app = FastAPI(lifespan=lifespan)

async def get_arq(request: Request) -> ArqRedis:
    return request.app.state.arq_redis

@app.post("/notify/{user_id}")
async def notify(user_id: int, arq: ArqRedis = Depends(get_arq)):
    job = await arq.enqueue_job("send_email", f"user{user_id}@x.com",
                                 "Hello", "Your report is ready")
    return {"job_id": job.job_id}
```

### 3. Worker file (`worker.py` — separate process)

```python
from arq.connections import RedisSettings
from tasks import send_email  # same function

class WorkerSettings:
    functions = [send_email]
    redis_settings = RedisSettings()
```

### 4. Run both processes

```bash
uvicorn main:app                    # Terminal 1: HTTP server
arq worker.WorkerSettings           # Terminal 2: job worker
```

## Key APIs (Summary)

| API | Role |
|-----|------|
| `create_pool(RedisSettings)` → `ArqRedis` | Create async Redis connection pool; call once at startup, `.aclose()` at shutdown |
| `ArqRedis.enqueue_job("func_name", *args, **kwargs)` → `Job \| None` | Enqueue a job; key kwargs: `_defer_by`, `_defer_until`, `_job_id` (uniqueness), `_expires` |
| `WorkerSettings` class | Configuration for the worker CLI: `functions`, `redis_settings`, `on_startup`, `on_shutdown`, `cron_jobs` |
| `Job.status()` / `Job.result(timeout)` / `Job.info()` | Poll job state and retrieve results from a route handler |
| `Job.abort()` | Cancel a queued or running job (requires `allow_abort_jobs = True` on worker) |

### Enqueue options quick reference

```python
# Immediate
job = await arq.enqueue_job("my_task", arg1, kw=val)

# Delayed 30 seconds
job = await arq.enqueue_job("my_task", _defer_by=30)

# At specific time
job = await arq.enqueue_job("my_task", _defer_until=datetime(2025, 8, 1, 9, 0))

# Unique — returns None if job_id already queued
job = await arq.enqueue_job("my_task", user_id, _job_id=f"backup-{user_id}")
```

## Caveats

1. **Worker is a separate process.** It does NOT run inside uvicorn. Both processes need access to the same task function code (importable module). Communication is Redis-only.

2. **Pessimistic execution = jobs may run multiple times.** If a worker shuts down mid-job, the job stays in the queue and reruns on next start. Design EVERY job to be idempotent — use DB transactions, idempotency keys, or Redis markers.

3. **Lifespan vs deprecated events.** If you pass `lifespan=` to `FastAPI()`, `@app.on_event("startup")` / `@app.on_event("shutdown")` are silently ignored. Pick one pattern.

4. **Serializer consistency.** If using custom serializers (e.g., msgpack), both `create_pool()` and `WorkerSettings` must use the same `job_serializer`/`job_deserializer`.

5. **`keep_result` controls result availability.** Default 3600s. `Job.result()` raises `ResultNotFound` after expiry. Use `keep_result_forever=True` on `@func` decorator for critical jobs whose results must persist.

6. **Job uniqueness** via `_job_id` prevents duplicate enqueues. The check is atomic (Redis transaction). A duplicate returns `None` from `enqueue_job()`.

7. **Sub-applications** (mounted via `app.mount()`) do NOT trigger lifespan events — only the main app does.

## Composition Hints

- **With FastAPI background tasks:** arq is for heavier/longer work; use `BackgroundTasks` for trivial fire-and-forget within the same process.
- **With databases:** Create your DB pool in the worker's `on_startup` (via `ctx`) AND in the FastAPI lifespan — the two processes cannot share in-memory connections.
- **With cron:** Add `cron_jobs` to `WorkerSettings` for periodic tasks (e.g., nightly cleanup). The cron schedule is defined in the worker config, not in FastAPI.
- **Health checks:** Run `arq --check worker.WorkerSettings` in a monitoring endpoint or external probe.
- **Testing:** Use `arq.worker.Worker().run(check=False)` to run jobs synchronously in tests, or use `create_pool` with a test Redis instance and `arq --burst` mode.
