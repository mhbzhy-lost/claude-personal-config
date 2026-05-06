---
name: sentry-python-performance
description: Configure Sentry tracing, custom spans, and distributed tracing for Python applications to monitor throughput, latency, and cross-service dependencies.
tech_stack: [observability]
language: [python]
capability: [observability]
version: "sentry-python-sdk unversioned"
collected_at: 2025-07-21
---

# Sentry Python — Performance & Tracing

> Source: https://docs.sentry.io/platforms/python/tracing/, https://docs.sentry.io/platforms/python/tracing/instrumentation/, https://docs.sentry.io/platforms/python/tracing/distributed-tracing/

## Purpose

Sentry Tracing captures **transactions** (top-level operations like HTTP requests) and **spans** (sub-operations like DB queries) to measure throughput and latency. Distributed tracing extends this across service boundaries by propagating `sentry-trace` and `baggage` HTTP headers, so a single request can be followed from frontend → API → worker → database.

## When to Use

- You need to identify **slow endpoints** or **bottleneck operations** in a Python service
- You want **custom spans** around business-critical functions (order processing, payment, external API calls)
- You run **microservices** and need to trace a request end-to-end across service boundaries
- You need **dynamic sampling** — drop health checks, vary rates by endpoint
- You operate in a **high-throughput** environment and need to tune sampling to control overhead

## Basic Usage

**Enable tracing (required — no default):**
```python
import sentry_sdk

sentry_sdk.init(
    dsn="https://examplePublicKey@o0.ingest.sentry.io/0",
    traces_sample_rate=1.0,   # 100% — adjust for production
)
```

**Dynamic sampling — drop health checks, sample 10% of rest:**
```python
def traces_sampler(sampling_context):
    name = sampling_context["transaction_context"]["name"]
    if "health" in name:
        return 0.0
    return 0.1

sentry_sdk.init(dsn="...", traces_sampler=traces_sampler)
```

**Custom span around business logic:**
```python
from sentry_sdk import start_span

with start_span(op="task", description="process_order") as span:
    process_order(order_id)
    span.set_data("order_id", order_id)
```

## Key APIs (Summary)

### Sampling controls

| Option | Signature | Precedence |
|--------|-----------|------------|
| `traces_sample_rate` | `float 0.0–1.0` | Uniform rate; must be set (no default) |
| `traces_sampler` | `(sampling_context) -> float 0–1` | Overrides `traces_sample_rate`; return `0` to drop |
| `trace_propagation_targets` | `list[str]` | Restrict which origins receive propagated headers |

The `sampling_context` dict provides:
- `transaction_context` — name, operation, source of the transaction
- `parent_sampled` — whether the upstream caller was sampled (enables head-based decisions)

### Custom instrumentation

```python
from sentry_sdk import start_span

# Context-manager span
with start_span(op="db", description="query_users") as span:
    users = db.query("SELECT * FROM users")
    span.set_data("row_count", len(users))

# Decorator pattern (manual)
@sentry_sdk.trace
def process_payment(amount: float):
    ...
```

### Distributed tracing — automatic

Supported frameworks get distributed tracing **out of the box** (SDK >1.25.x):
Django, FastAPI, Flask, Bottle, Falcon, Pyramid, Quart, Starlette, Tornado.

The SDK automatically reads incoming `sentry-trace` and `baggage` headers and propagates them on outgoing HTTP requests. No additional code required.

### Distributed tracing — CORS checklist

Two headers must survive the network path:
| Header | Purpose |
|--------|---------|
| `sentry-trace` | Trace ID + span ID + sampling decision |
| `baggage` | Key-value context carried across services |

- Add both to your **CORS allowlist** (JavaScript frontends)
- Ensure proxies, gateways, and firewalls **do not strip** them
- Every service in the call chain must be using Sentry

## Caveats

- **No tracing without opt-in**: `traces_sample_rate` or `traces_sampler` is **mandatory** — there is no default. Forgetting this means zero performance data.
- **High-throughput risk**: `traces_sample_rate=1.0` sends every transaction. Test before deploying to a busy production service; prefer `traces_sampler` for fine-grained control.
- **SDK version gates**: tracing → ≥0.11.2; automatic distributed tracing → >1.25.x. Below 1.25.x, distributed tracing still works but requires explicit tracing enablement.
- **`traces_sampler` replaces, not combines with, `traces_sample_rate`**: if both are set, the sampler wins.
- **Custom spans add overhead**: each `start_span()` call has a cost. Instrument hot-path code sparingly.
- **Distributed tracing is all-or-nothing**: if one service in the chain lacks Sentry (or strips headers), the trace breaks.
- **Automatic instrumentation** (framework integrations) creates transactions; custom spans augment them — they do not replace automatic spans.

## Composition Hints

- Prerequisite: **sentry-python-core** must be initialized first (`dsn`, `release`, `environment`).
- Framework skills (**sentry-python-fastapi**, sentry-python-django, sentry-python-flask) provide the automatic transactions that custom spans attach to.
- For frontend-backend traces, pair with **sentry-javascript-performance** and ensure `sentry-trace` + `baggage` pass CORS.
- Use `trace_propagation_targets` to prevent leaking trace headers to third-party APIs.
- `traces_sampler` + `parent_sampled` enables **head-based sampling**: if the frontend decided to sample, the backend follows that decision.
