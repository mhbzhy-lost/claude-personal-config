---
name: httpx-retries-tenacity
description: Retry strategies for httpx using Tenacity — exponential backoff, jitter, status-code-based retry, and async support.
tech_stack: ["http"]
language: ["python"]
capability: ["http-client"]
version: "httpx / tenacity unversioned"
collected_at: 2025-01-01
---

# httpx + Tenacity Retries

> Source: https://tenacity.readthedocs.io/en/latest/, https://www.python-httpx.org/advanced/transports/

## Purpose

HTTPX's built-in `HTTPTransport(retries=N)` only retries on connection-level
errors (`ConnectError` / `ConnectTimeout`). Tenacity fills the gap for richer
retry strategies: read/write errors, HTTP status codes (429, 503, 5xx),
exponential backoff with jitter, and result-based retry.

## When to Use

- Retrying on specific HTTP status codes (e.g. 429, 503, 5xx)
- Exponential backoff or jittered wait between retries
- Retrying based on response body/content, not just exceptions
- Async retry with `httpx.AsyncClient`
- Fine-grained callbacks (logging, metrics) during retry loops

## Basic Usage

### Minimal httpx + Tenacity

```python
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    retry=retry_if_exception_type(httpx.HTTPStatusError)
)
def fetch(url: str):
    response = httpx.get(url)
    response.raise_for_status()
    return response.json()
```

### Retry on 5xx by inspecting the response

```python
from tenacity import retry, retry_if_result, stop_after_attempt, wait_exponential

def is_server_error(response):
    return response.status_code >= 500

@retry(
    retry=retry_if_result(is_server_error),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=30)
)
def get_with_retry(url):
    return httpx.get(url)  # returns the Response, not raising
```

### Async with httpx.AsyncClient

```python
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
async def fetch_async(url: str):
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.json()
```

Or with the context-manager style:

```python
from tenacity import AsyncRetrying, stop_after_attempt

async def fetch(url):
    async for attempt in AsyncRetrying(stop=stop_after_attempt(3)):
        with attempt:
            async with httpx.AsyncClient() as client:
                response = await client.get(url)
                response.raise_for_status()
                return response.json()
```

## Key APIs (Summary)

| Concept | Import | Common values |
|---|---|---|
| **Decorator** | `from tenacity import retry` | `@retry(stop=..., wait=..., retry=...)` |
| **Stop** | `stop_after_attempt(n)`, `stop_after_delay(sec)` | Combine: `stop_after_delay(10) \| stop_after_attempt(5)` |
| **Wait** | `wait_fixed(s)`, `wait_exponential(min=,max=)`, `wait_random(min=,max=)`, `wait_random_exponential(max=)` | `wait_exponential(multiplier=1, min=2, max=30)` — most common for HTTP |
| **Retry if** | `retry_if_exception_type(E)`, `retry_if_result(fn)` | `retry_if_exception_type(httpx.HTTPStatusError)` |
| **Error raising** | `reraise=True` | Re-raises the original exception instead of `RetryError` |
| **Logging** | `before_log()`, `after_log()`, `before_sleep_log()` | Use `before_sleep_log` to log each retry attempt |
| **Async context** | `AsyncRetrying(...)` | `async for attempt in AsyncRetrying(...): with attempt: ...` |
| **Stats** | `fn.retry.statistics` | Read after decorated function finishes |

### Common wait strategy decision table

| Scenario | Wait strategy |
|---|---|
| Fixed interval polling | `wait_fixed(5)` |
| Remote API with rate limits | `wait_exponential(min=2, max=60)` |
| Avoid thundering herd | `wait_exponential(...) + wait_random(0, 2)` |
| Multiple retry tiers | `wait_chain(*[...])` |

## Caveats

- **Default is infinite retry with zero wait.** Always set explicit `stop` and
  `wait` in production.
- `RetryError` wraps the original exception by default. Set `reraise=True` to
  surface the underlying error directly.
- **Idempotency**: retrying POST/PUT/PATCH/DELETE can cause duplicate side
  effects. Ensure the operation is idempotent or use result-based retry to
  check before re-executing.
- HTTPX's built-in `retries=1` only covers TCP-level connection failures, not
  application-layer errors — Tenacity is the recommended path for the latter.
- For async, Tenacity works natively with asyncio. Use `AsyncRetrying` for
  context-manager style, or `@retry` on async def functions.

## Composition Hints

- **Wrap at the function level**, not inside the client: decorate the function
  that calls `httpx.get()`/`client.get()`, not the client itself.
- Combine `retry_if_exception_type(httpx.HTTPStatusError)` with
  `retry_if_result(...)` using `|` when you need both exception-based and
  status-code-based retry logic.
- Use `before_sleep_log` with a logger to get visibility into retry timing
  during debugging.
- For complex workflows, prefer `Retrying(...)` / `AsyncRetrying(...)` context
  managers over the decorator — they let you scope the retry block precisely
  and share local state.
- Use `.retry.statistics` in tests to assert retry counts and timings.
