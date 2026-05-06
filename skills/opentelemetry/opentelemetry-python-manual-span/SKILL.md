---
name: opentelemetry-python-manual-span
description: Create and manipulate OpenTelemetry spans manually in Python — nested spans, attributes, semantic conventions, events, links, status, and exception recording.
tech_stack: [opentelemetry]
language: [python]
capability: [observability]
version: "OpenTelemetry Python (Traces Stable)"
collected_at: 2025-12-03
---

# OpenTelemetry Python — Manual Span Instrumentation

> Source: https://opentelemetry.io/docs/languages/python/instrumentation/, https://opentelemetry-python.readthedocs.io/en/latest/sdk/index.html

## Purpose

Create, nest, enrich, and finalize spans by hand in Python applications. This skill covers every span-level API: starting spans as context managers or bare objects, decorating functions, attaching attributes (including semantic conventions), recording timed events, establishing causal links between non-nested spans, setting error status, and capturing exceptions. Assumes a `tracer` instance is already available via `trace.get_tracer()`.

## When to Use

- Adding tracing to custom business logic not covered by auto-instrumentation libraries
- Creating nested sub-spans to decompose a complex operation
- Enriching auto-generated spans with domain-specific attributes
- Recording critical lifecycle events within a span (e.g., "cache miss", "retry")
- Linking causally related but non-nested spans (e.g., async message correlation)
- Marking spans as errored with full exception context
- Decorator-based function tracing for clean code

## Basic Usage

### The two fundamental patterns

```python
# Pattern A: context manager (auto-close, becomes current span)
with tracer.start_as_current_span("operation") as span:
    span.set_attribute("key", "value")
    # span is the current span here; auto-closes on block exit

# Pattern B: bare span (manual close, does NOT become current)
span = tracer.start_span("background-task")
try:
    do_work()
finally:
    span.end()
```

Prefer **Pattern A** for all synchronous call chains. Use **Pattern B** when the span lifetime doesn't map to a single scope (concurrent tasks, fire-and-forget).

### The standard error-handling recipe

```python
from opentelemetry.trace import Status, StatusCode

with tracer.start_as_current_span("risky-op") as span:
    try:
        result = risky_call()
        span.add_event("call succeeded")
        return result
    except Exception as ex:
        span.set_status(Status(StatusCode.ERROR))
        span.record_exception(ex)
        raise
```

Always pair `set_status(ERROR)` with `record_exception(ex)` — the status alone carries no stack trace or exception message.

### Semantic attributes (HTTP)

```python
# pip install opentelemetry-semantic-conventions
from opentelemetry.semconv.trace import SpanAttributes

span.set_attribute(SpanAttributes.HTTP_METHOD, "GET")
span.set_attribute(SpanAttributes.HTTP_URL, "https://api.example.com/v1/items")
span.set_attribute(SpanAttributes.HTTP_STATUS_CODE, 200)
```

## Key APIs (Summary)

### Span creation

| Method | Behavior |
|--------|----------|
| `tracer.start_as_current_span(name, attributes=..., links=...)` | Context manager; sets as current; auto-ends on exit |
| `tracer.start_span(name, attributes=..., links=...)` | Bare span; NOT current; caller must `.end()` |
| `@tracer.start_as_current_span("name")` | Decorator wrapping entire function |

### Span enrichment

| Method | Purpose |
|--------|---------|
| `span.set_attribute(k, v)` | Key/value — str, int, float, bool, or homogeneous list thereof |
| `span.add_event("msg", attributes=...)` | Timestamped human-readable event |
| `span.set_status(Status(StatusCode.ERROR))` | Mark span as errored |
| `span.record_exception(ex)` | Record exception with traceback |
| `span.get_span_context()` | Get immutable SpanContext for link creation |

### Span links

```python
link = trace.Link(some_span.get_span_context(), attributes={"relationship": "causal"})
with tracer.start_as_current_span("consumer", links=[link]):
    ...
```

Links create causal associations **without** parent-child nesting — useful for async message passing where the producer and consumer have independent lifetimes.

### Status codes

| Code | Meaning |
|------|---------|
| `StatusCode.UNSET` | Default — completed without error |
| `StatusCode.OK` | Explicit success (rarely needed) |
| `StatusCode.ERROR` | Failed operation |

## Caveats

- **`start_span()` → no current span**: If downstream code calls `trace.get_current_span()`, it will NOT see a span created with `start_span()`. Always use `start_as_current_span()` for synchronous call chains.
- **Manual `.end()` is mandatory with `start_span()`**: Forgetting to call `span.end()` leaks the span and it will never be exported. Wrap in `try/finally`.
- **Status alone is insufficient for errors**: `set_status(ERROR)` without `record_exception(ex)` gives no visibility into *why* it failed. Always record the exception too.
- **Decorator needs module-level tracer**: `@tracer.start_as_current_span` is evaluated at import time. If `tracer` is a local variable inside a function, the decorator will fail with `NameError`.
- **Attribute types are restricted**: Only str, int, float, bool, and homogeneous sequences of these types. Dicts, arbitrary objects, or mixed-type lists will raise errors.
- **Semantic conventions are a separate package**: `pip install opentelemetry-semantic-conventions`; import from `opentelemetry.semconv.trace`.
- **SpanContext is immutable**: `trace_id` and `span_id` are fixed at span creation. Plan your trace topology before creating spans — you can't retroactively reparent.
- **`is_recording()` may return False**: If the span was sampled out, calling `set_attribute` or `add_event` is a no-op. Check `span.is_recording()` before expensive attribute computation.

## Composition Hints

- **Depends on `opentelemetry-python-sdk`**: A global `TracerProvider` must be set and a tracer acquired before any span API is usable.
- **Complements FastAPI auto-instrumentation**: Use `trace.get_current_span()` inside route handlers to enrich spans that `FastAPIInstrumentor` created automatically.
- **Complements OTLP export**: Spans created here flow through the `BatchSpanProcessor` → `OTLPSpanExporter` chain configured by `opentelemetry-python-otlp`.
- **With context propagation**: When you inject/extract context manually (`opentelemetry-python-propagation`), use `tracer.start_as_current_span(name, context=extracted_ctx)` to attach the span to the propagated context.
