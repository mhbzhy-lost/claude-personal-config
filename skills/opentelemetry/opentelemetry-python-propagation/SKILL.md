---
name: opentelemetry-python-propagation
description: W3C Trace Context propagation (inject/extract) for OpenTelemetry Python — manual and automatic, including baggage.
tech_stack: [opentelemetry]
language: [python]
capability: [observability]
version: "OpenTelemetry Python unversioned"
collected_at: 2026-01-14
---

# OpenTelemetry Python Context Propagation

> Source: https://opentelemetry.io/docs/languages/python/propagation/

## Purpose
Propagation moves trace context between services and processes, enabling end-to-end distributed traces across service boundaries. OpenTelemetry Python uses W3C Trace Context HTTP headers (`traceparent`/`tracestate`) plus W3C Baggage.

## When to Use
- When trace context must flow across HTTP, gRPC, or message-queue boundaries between services.
- When instrumentation libraries don't cover your transport layer and you must manually inject/extract context.
- When using sqlcommenter for database-level context propagation.

## Basic Usage

### Automatic (preferred)
Instrumentation libraries for Flask, Django, Jinja2, and Celery propagate context automatically — no manual code needed. Always prefer this over manual propagation.

### Manual Inject (sending side)
```python
from opentelemetry import baggage
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator
from opentelemetry.baggage.propagation import W3CBaggagePropagator

ctx = baggage.set_baggage("hello", "world")
headers = {}
W3CBaggagePropagator().inject(headers, ctx)
TraceContextTextMapPropagator().inject(headers, ctx)
# Forward `headers` in your outgoing HTTP request
```

### Manual Extract (receiving side)
```python
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator
from opentelemetry.baggage.propagation import W3CBaggagePropagator

carrier = {'traceparent': headers['Traceparent']}
ctx = TraceContextTextMapPropagator().extract(carrier=carrier)

b2 = {'baggage': headers['Baggage']}
ctx2 = W3CBaggagePropagator().extract(b2, context=ctx)

# Use propagated context in a new span
with tracer.start_span("api2_span", context=ctx2):
    print(baggage.get_baggage('hello', ctx2))
```

## Key APIs (Summary)

| Class | Purpose |
|---|---|
| `TraceContextTextMapPropagator` | W3C Trace Context — inject/extract `traceparent` and `tracestate` |
| `W3CBaggagePropagator` | W3C Baggage — inject/extract user-defined key-value pairs across services |
| `baggage.set_baggage(key, value)` | Set a baggage entry on the current context |
| `baggage.get_baggage(key, ctx)` | Read a baggage entry from a context |

Both propagators follow the same interface: `.inject(carrier, context)` and `.extract(carrier, context)` where `carrier` is a dict-like object (e.g., HTTP headers dict).

## Caveats
- **Prefer automatic propagation** via instrumentation libraries — manual inject/extract is error-prone (wrong header names, missed carriers, context loss).
- **Baggage propagator must be called before TraceContext propagator** on inject, and after on extract (baggage extraction requires the trace context as parent).
- **sqlcommenter** enriches SQL queries with trace context (e.g., `/*traceparent=00-0123...*/`), enabling propagation through database logs. Supported by some Python instrumentations — not universal.

## Composition Hints
- Pair with `opentelemetry-python-sdk` for TracerProvider setup (needed before any propagation code runs).
- Pair with `opentelemetry-python-otlp` to export the full distributed trace to a collector.
- For FastAPI services, use `opentelemetry-python-fastapi` which handles propagation automatically — manual code only needed for outbound calls to other services.
