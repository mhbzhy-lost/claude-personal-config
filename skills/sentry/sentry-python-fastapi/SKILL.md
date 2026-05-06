---
name: sentry-python-fastapi
description: Integrate Sentry error monitoring and performance tracing into FastAPI applications with automatic or explicit configuration.
tech_stack: [observability, fastapi]
language: [python]
capability: [observability, web-framework]
version: "sentry-python-sdk unversioned"
collected_at: 2025-07-21
---

# Sentry — FastAPI Integration

> Source: https://docs.sentry.io/platforms/python/integrations/fastapi/, https://docs.sentry.io/platforms/python/tracing/

## Purpose

The Sentry FastAPI integration automatically captures unhandled exceptions, attaches request context (URL, headers, JSON payloads), and traces middleware/DB/Redis performance in FastAPI applications. It is **auto-enabled** when the `fastapi` package is present — no import of integration classes required for defaults. Explicit configuration unlocks control over transaction naming, status-code filtering, middleware spans, and HTTP method capture.

## When to Use

- Any FastAPI app (≥0.79.0, Python ≥3.7) needing automatic error capture with full request context
- When you want **transaction naming** by endpoint function rather than URL pattern
- When you need to **filter which HTTP status codes** trigger Sentry events (e.g., exclude 4xx, include only 500/503)
- When you want **middleware-layer span visibility** for performance debugging
- As the foundation for distributed tracing across FastAPI microservices

## Basic Usage

**Install:**
```bash
pip install sentry-sdk
```

**Auto-enabled (no import needed):**
```python
import sentry_sdk
from fastapi import FastAPI

sentry_sdk.init(
    dsn="https://examplePublicKey@o0.ingest.sentry.io/0",
    traces_sample_rate=1.0,       # required for performance monitoring
    send_default_pii=True,        # optional: include user IPs, cookies, etc.
)

app = FastAPI()

@app.get("/sentry-debug")
async def trigger_error():
    division_by_zero = 1 / 0      # captured automatically
```

## Key APIs (Summary)

### Explicit integration options

Both `StarletteIntegration` and `FastApiIntegration` **must** be instantiated together — FastAPI is layered on Starlette:

```python
from sentry_sdk.integrations.starlette import StarletteIntegration
from sentry_sdk.integrations.fastapi import FastApiIntegration

sentry_sdk.init(
    dsn="...",
    traces_sample_rate=1.0,
    integrations=[
        StarletteIntegration(
            transaction_style="endpoint",
            failed_request_status_codes={403, *range(500, 599)},
            middleware_spans=True,
            http_methods_to_capture=("GET", "POST", "PUT", "DELETE"),
        ),
        FastApiIntegration(
            transaction_style="endpoint",
            failed_request_status_codes={403, *range(500, 599)},
            middleware_spans=True,
            http_methods_to_capture=("GET", "POST", "PUT", "DELETE"),
        ),
    ],
)
```

### Option reference

| Option | Type | Default | Behavior |
|--------|------|---------|----------|
| `transaction_style` | `"url"` \| `"endpoint"` | `"url"` | `"url"` → `/catalog/product/{product_id}`; `"endpoint"` → `product_detail` |
| `failed_request_status_codes` | `set[int]` | `{*range(500, 600)}` | Which HTTP status codes are reported as errors. `set()` = none. Unhandled exceptions without `status_code` are always sent. |
| `middleware_spans` | `bool` | `False` | Create spans for every middleware layer |
| `http_methods_to_capture` | `tuple[str]` | `("CONNECT", "DELETE", "GET", "PATCH", "POST", "PUT", "TRACE")` | Which methods create transactions. `OPTIONS` and `HEAD` excluded by default. *(SDK ≥ 2.15.0)* |

### What is captured automatically

- **Errors**: all unhandled exceptions → 5xx responses (configurable via `failed_request_status_codes`)
- **Request data**: URL, HTTP method, headers, form data, JSON payloads
- **Performance spans**: middleware stack, database queries, Redis commands (when `traces_sample_rate > 0`)

### What is excluded by default

- Raw request bodies and multipart file uploads
- PII: user IDs, usernames, cookies, authorization headers, IP addresses (included only when `send_default_pii=True`)

## Caveats

- **Both integrations required**: when passing explicit `integrations=[...]`, you MUST instantiate both `StarletteIntegration` AND `FastApiIntegration` — FastAPI is a Starlette subclass and both layers need configuration.
- **No tracing without sampling**: `traces_sample_rate` (or `traces_sampler`) is required; without it, zero transactions are captured regardless of integration config.
- **`OPTIONS`/`HEAD` excluded**: these methods create no transactions by default. Add them to `http_methods_to_capture` if your app relies on them.
- **`failed_request_status_codes` only covers `HTTPException`**: unhandled exceptions without a `status_code` attribute always fire regardless of this set.
- **SDK version floor**: tracing requires SDK ≥0.11.2; `http_methods_to_capture` requires ≥2.15.0.
- **FastAPI ≥0.79.0, Python ≥3.7** required.

## Composition Hints

- Depends on **sentry-python-core** — DSN, `release`, `environment`, `send_default_pii`, and `traces_sample_rate` are all set at the `sentry_sdk.init()` level.
- Pair with **sentry-python-performance** for custom spans inside FastAPI route handlers and distributed tracing across services.
- `failed_request_status_codes={403, *range(500, 599)}` is a common pattern: treat forbidden as errors alongside server errors.
- `transaction_style="endpoint"` often produces cleaner transaction names in the Sentry UI than URL patterns with path parameters.
- Enable `middleware_spans=True` when debugging middleware-ordering issues or CORS middleware overhead.
