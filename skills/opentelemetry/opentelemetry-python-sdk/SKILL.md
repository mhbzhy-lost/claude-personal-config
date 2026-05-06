---
name: opentelemetry-python-sdk
description: Initialize and configure the OpenTelemetry Python SDK — TracerProvider, BatchSpanProcessor, ConsoleSpanExporter, and propagation format setup.
tech_stack: [opentelemetry]
language: [python]
capability: [observability]
version: "OpenTelemetry Python (Traces Stable, Metrics Stable, Logs Development)"
collected_at: 2025-12-03
---

# OpenTelemetry Python SDK — Initialization & Configuration

> Source: https://opentelemetry.io/docs/languages/python/instrumentation/, https://opentelemetry.io/docs/languages/python/

## Purpose

Bootstrap the OpenTelemetry SDK in Python applications. Covers installing packages, creating and registering a global `TracerProvider`, wiring up span processors and exporters, acquiring tracers, and configuring propagation formats. This is the foundational skill — every other OpenTelemetry Python skill depends on this initialization pattern.

## When to Use

- Starting a new Python service that needs distributed tracing
- Replacing a stub/no-op tracer with a real SDK-backed tracer
- Configuring how spans are processed (batching vs. immediate export)
- Switching propagation formats (W3C → B3, Jaeger, etc.)
- Setting up a development/debugging trace pipeline with `ConsoleSpanExporter`

## Basic Usage

### Minimal bootstrap (dev with console output)

```python
# pip install opentelemetry-api opentelemetry-sdk

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter

provider = TracerProvider()
processor = BatchSpanProcessor(ConsoleSpanExporter())
provider.add_span_processor(processor)
trace.set_tracer_provider(provider)

tracer = trace.get_tracer("my.service.name")
```

After this, any `tracer.start_as_current_span(...)` call will produce spans that flow through the processor chain and appear on the console.

### Span lifecycle in one pattern

```python
with tracer.start_as_current_span("operation-name") as span:
    span.set_attribute("key", "value")
    # ... business logic ...
    # span auto-closes on block exit
```

### Switch propagation format to B3 (Zipkin-compatible)

```python
# pip install opentelemetry-propagator-b3

from opentelemetry.propagate import set_global_textmap
from opentelemetry.propagators.b3 import B3Format

set_global_textmap(B3Format())
```

Or via environment variable: `OTEL_PROPAGATORS="b3"`. Environment variables override code settings.

## Key APIs (Summary)

| API | Role |
|-----|------|
| `TracerProvider()` | Create the provider that holds span processor chain |
| `BatchSpanProcessor(exporter)` | Accumulate spans and flush in batches (production) |
| `SimpleSpanProcessor(exporter)` | Export each span immediately (debug/short-lived processes) |
| `provider.add_span_processor(sp)` | Register a processor with the provider |
| `trace.set_tracer_provider(provider)` | Register as the global default |
| `trace.get_tracer("name")` | Acquire a named tracer from the global provider |
| `tracer.start_as_current_span("name")` | Context manager that creates and auto-closes the current span |
| `tracer.start_span("name")` | Create a span without making it current (caller must `.end()`) |
| `span.set_attribute(k, v)` | Attach key/value metadata (str, int, float, bool, or homogeneous list) |
| `span.set_status(Status(StatusCode.ERROR))` | Mark span as errored |
| `span.record_exception(ex)` | Record exception with stack trace on the span |
| `span.add_event("message")` | Attach a timestamped event log line |
| `set_global_textmap(propagator)` | Change the propagation format in code |
| `OTEL_PROPAGATORS` env var | Comma-separated list: `tracecontext`, `baggage`, `b3`, `b3multi`, `jaeger`, `xray`, `ottrace`, `none` |

## Caveats

- **Env vars beat code**: `OTEL_PROPAGATORS` always overrides `set_global_textmap()`.
- **BatchSpanProcessor is async**: Spans aren't exported until the batch size or interval is reached. For short-lived CLI tools or lambdas, use `SimpleSpanProcessor` or explicitly call `provider.shutdown()` before exit.
- **start_span vs start_as_current_span**: Only the latter sets the span as current. If you use `start_span()`, `get_current_span()` will not see it — and auto-instrumentation libraries won't either.
- **Decorator requires module-level tracer**: `@tracer.start_as_current_span("name")` needs `tracer` defined at module scope, not inside a function.
- **Python 3.9+ only**: Older Python versions are not supported.
- **Logs API is Development**: Not yet stable for production use (as of 2025-12).

## Composition Hints

- **Before OTLP export**: Bootstrap with this skill, then replace `ConsoleSpanExporter` with `OTLPSpanExporter` (see `opentelemetry-python-otlp`).
- **Before manual instrumentation**: This skill provides the `tracer` instance used by `opentelemetry-python-manual-span`.
- **Before FastAPI auto-instrumentation**: SDK must be initialized first, then `FastAPIInstrumentor.instrument_app()` attaches to the global provider.
- **Before context propagation**: The propagation format configured here determines how trace context is injected/extracted in `opentelemetry-python-propagation`.
- **Resource attributes**: Pass `resource=Resource.create({"service.name": "my-svc"})` to `TracerProvider()` to set service identity early.
