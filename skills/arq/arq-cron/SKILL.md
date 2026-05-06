---
name: arq-cron
description: Schedule periodic async jobs in arq using cron() — crontab-like recurring task scheduling
tech_stack: [arq]
language: [python]
capability: [task-scheduler]
version: "arq v0.28.0"
collected_at: 2025-01-01
---

# arq Cron Jobs

> Source: https://arq-docs.helpmanual.io/

## Purpose

arq's `cron()` function schedules async functions to run on a recurring basis — every hour, at specific times of day, on certain weekdays, or any combination thereof. Cron jobs are declared declaratively on the `WorkerSettings` class and are executed by the same worker that processes regular jobs.

## When to Use

- Periodic cleanup, report generation, or data sync
- Heartbeat / health-check pings on a fixed cadence
- Any task that must fire at specific wall-clock times (e.g., "midnight", "weekdays at 9am")
- NOT for: one-off deferred jobs (use `_defer_by` / `_defer_until` on `enqueue_job()`)

## Basic Usage

```python
from arq import cron

async def nightly_cleanup(ctx):
    # runs at 3am every day
    ...

class WorkerSettings:
    functions = [nightly_cleanup]
    cron_jobs = [
        cron(nightly_cleanup, hour=3, minute=0)
    ]
```

Start the worker normally — cron jobs fire automatically:

```bash
arq my_module.WorkerSettings
```

### Schedule syntax (vs crontab)

| crontab | arq `cron()`     |
|---------|------------------|
| `*`     | `None` (omit)    |
| `1,2,3` | `{1, 2, 3}` (a set) |
| `0`     | `0`              |

`second` defaults to `0` and `microsecond` defaults to `123456` — this avoids the top-of-second thundering herd from other cron systems.

### Multiple times per day

```python
cron(send_report, hour={9, 12, 18}, minute=12)
# runs at 9:12, 12:12, and 18:12
```

### Weekdays by name

```python
cron(weekday_task, weekday={'mon','tue','wed','thu','fri'}, hour=9)
```

### Run immediately on worker start, then on schedule

```python
cron(seed_cache, hour=0, minute=0, run_at_startup=True)
```

### Prevent overlapping runs

```python
cron(heavy_job, hour=2, minute=0, unique=True)
# if the 2am run is still executing at 2am the next day, skip
```

## Key APIs (Summary)

- **`arq.cron(function, *, month, day, weekday, hour, minute, second=0, microsecond=123456, run_at_startup=False, unique=False, timeout=None, keep_result=None, keep_result_forever=None, max_tries=None)`** — returns a `CronJob` to place in `WorkerSettings.cron_jobs`. All time fields accept `int`, `set[int]`, or `None` (wildcard). `weekday` also accepts string abbreviations `'mon'`–`'sun'`.
- **`WorkerSettings.cron_jobs: list[CronJob]`** — the list of cron schedules the worker will observe.

## Caveats

- **Multi-worker safety**: arq uses a Redis lock so the same cron job is enqueued only once per tick across all workers sharing the same Redis — no duplicate firings.
- **Pessimistic execution applies**: cron jobs are regular arq jobs under the hood. If the worker shuts down mid-execution, the job stays in the queue and re-runs. Make cron jobs idempotent.
- **`second`/`microsecond` defaults are non-obvious**: `second=0` means "at :00", not "every second". `microsecond=123456` avoids top-of-second contention. To run every 30 seconds, you'd need `second={0, 30}` and set `microsecond=0`.
- **Timezone**: arq cron uses the worker's local system time. No built-in timezone support — handle timezone conversions inside the job if needed.

## Composition Hints

- Cron jobs share the same `ctx` (context dict) as regular `functions` — the same `on_startup`/`on_shutdown` hooks apply. Initialize shared resources (DB pools, HTTP sessions) there.
- For complex schedules, use multiple `cron()` entries rather than cramming logic into one function.
- Combine `unique=True` with `run_at_startup=True` to safely seed caches or rebuild indexes on deploy without risk of double execution.
- For sub-minute schedules, lower `keep_result` to avoid filling Redis with results from high-frequency jobs.
