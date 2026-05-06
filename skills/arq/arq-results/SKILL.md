---
name: arq-results
description: Inspect job status and results, retry with backoff, cancel jobs, and handle arq's pessimistic execution model
tech_stack: [arq]
language: [python]
capability: [task-scheduler]
version: "arq v0.28.0"
collected_at: 2025-01-01
---

# arq Job Results & Retries

> Source: https://arq-docs.helpmanual.io/

## Purpose

Every `enqueue_job()` call returns a `Job` handle for tracking execution: poll status, await results, inspect metadata, and cancel if needed. arq uses **pessimistic execution** — jobs stay in the queue until they explicitly succeed or fail, so cancelled/crashed jobs are automatically re-run. This skill covers the full lifecycle after enqueue: result polling, retry with backoff, cancellation, and the idempotency patterns that pessimistic execution demands.

## When to Use

- Polling or awaiting a job's result from the enqueuing process
- Implementing retry logic for transient failures (HTTP 503, temporary Redis errors, rate limits)
- Cancelling a queued or in-flight job
- Controlling how long results persist in Redis
- Understanding and designing for arq's "at-least-once" / pessimistic execution semantics

## Basic Usage

### Enqueue and await result

```python
from arq import create_pool
from arq.connections import RedisSettings

async def main():
    redis = await create_pool(RedisSettings())
    job = await redis.enqueue_job('compute', arg1, arg2)

    # Check status without blocking
    status = await job.status()        # JobStatus.queued | in_progress | complete

    # Block until done (or timeout)
    result = await job.result(timeout=30)
```

### Retry on failure with increasing backoff

```python
from arq import Retry

async def fetch_url(ctx, url):
    response = await ctx['session'].get(url)
    if response.status_code >= 500:
        # 5s, 10s, 15s, 20s, then permanent failure
        raise Retry(defer=ctx['job_try'] * 5)
    return response.json()
```

### Cancel a job

```python
job = await redis.enqueue_job('long_task')
await asyncio.sleep(1)
await job.abort()  # cancels if running, dequeues if waiting

class WorkerSettings:
    functions = [long_task]
    allow_abort_jobs = True   # REQUIRED — default is False
```

### Handle worker shutdown (CancelledError)

Pessimistic execution means when the worker receives SIGINT, in-flight jobs get `CancelledError`. arq catches this and keeps the job in the queue. On next start it re-runs automatically:

```
shutdown on SIGINT ◆ 1 ongoing to cancel
  1.16s ↻ abc123:the_task cancelled, will be run again

# After restart:
  21.78s → abc123:the_task() try=2
```

**Do not suppress `CancelledError`** — let it propagate so arq can re-queue.

### Idempotency with job_id

```python
# Only one 'daily-backup' can exist at a time
job1 = await redis.enqueue_job('backup', _job_id='daily-backup')
job2 = await redis.enqueue_job('backup', _job_id='daily-backup')
# job2 is None — collision detected

# Prevent re-enqueue for 24h after completion
class WorkerSettings:
    functions = [backup]
    keep_result = 86400
```

## Key APIs (Summary)

| API | Purpose |
|-----|---------|
| `Job.result(timeout)` | Block until job finishes; re-raises job exceptions |
| `Job.info()` | Get `JobDef` (function, args, enqueue_time) without awaiting |
| `Job.status()` | Returns `JobStatus`: `queued` / `in_progress` / `complete` / `not_found` |
| `Job.result_info()` | Get `JobResult` (success, result, timings) after completion |
| `Job.abort()` | Cancel running job or dequeue waiting one |
| `raise Retry(defer=N)` | Retry job after N seconds; `job_try` auto-increments |
| `WorkerSettings.max_tries` | Max attempts before permanent failure (default 5) |
| `WorkerSettings.keep_result` | Seconds to persist result in Redis (default 3600) |
| `WorkerSettings.keep_result_forever` | Never expire results (grows Redis memory) |
| `WorkerSettings.allow_abort_jobs` | Must be `True` for `abort()` to work |
| `enqueue_job(_expires=...)` | Job won't start/retry after this duration |

## Caveats

- **`job.result()` re-raises exceptions** from the job. Prefer `result_info().success` check or wrap in try/except.
- **`allow_abort_jobs` defaults to `False`** for performance overhead reasons. Forgot to set it → `abort()` silently does nothing.
- **Results expire**: after `keep_result` seconds (default 1h), `info()` returns `None` and `result()` raises. Use `keep_result_forever=True` sparingly.
- **Pessimistic execution is the default**: there is no "fire and forget" with guaranteed at-most-once. Every job must be idempotent — use DB transactions, idempotency keys, or Redis markers.
- **`Retry.defer` is relative** to the current time, not cumulative from the first attempt. Use `ctx['job_try']` to calculate increasing delays.
- After `max_tries` (default 5), the job is permanently failed — it will not be retried even if the worker restarts.

## Composition Hints

- For fire-and-forget patterns where you don't need the result, simply discard the `Job` handle — the worker still executes the job.
- When chaining jobs (job A → job B), enqueue job B from inside job A's function using the same `ctx['redis']` pool. Avoid blocking on `job.result()` inside a job — instead pass data via Redis keys.
- For long-running workflows, store a correlation ID in Redis and have each job update its status there, rather than blocking on `result()` from the enqueuer.
- Combine `_job_id` uniqueness with `keep_result` to build de-duplication windows (e.g., "only one invoice generation per company per hour").
