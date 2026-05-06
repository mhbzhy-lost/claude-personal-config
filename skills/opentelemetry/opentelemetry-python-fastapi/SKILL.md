---
name: opentelemetry-python-fastapi
description: Auto-instrument FastAPI applications with OpenTelemetry — install, configure, capture HTTP headers, custom request/response hooks, and URL exclusion.
tech_stack: ["fastapi"]
language: ["python"]
capability: ["observability", "web-framework"]
version: "opentelemetry-instrumentation-fastapi 0.62b1"
collected_at: 2026-04-24
---

# OpenTelemetry FastAPI Instrumentation

> Source: https://opentelemetry-python-contrib.readthedocs.io/en/latest/instrumentation/fastapi/fastapi.html, https://pypi.org/project/opentelemetry-instrumentation-fastapi/

## Purpose
Provides automatic distributed tracing for FastAPI web frameworks by instrumenting all incoming HTTP requests. A single call to `FastAPIInstrumentor.instrument_app(app)` wires up server and client spans, with rich configuration for hooks, header capture, URL exclusion, and header sanitization.

## When to Use
- Any FastAPI application that needs automatic distributed tracing of HTTP requests.
- When you need to capture specific HTTP request/response headers as span attributes.
- When you need custom hooks to attach application-specific data to every request span.
- When you want to exclude health-check or metrics endpoints from tracing.
- When you need to redact sensitive headers (PII, session tokens, passwords) before they appear in spans.

## Basic Usage

```python
import fastapi
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

app = fastapi.FastAPI()

@app.get("/foobar")
async def foobar():
    return {"message": "hello world"}

FastAPIInstrumentor.instrument_app(app)
```

Install: `pip install opentelemetry-instrumentation-fastapi`

## Key APIs (Summary)

### `FastAPIInstrumentor.instrument_app()` — the main entry point

```python
FastAPIInstrumentor.instrument_app(
    app,                                          # FastAPI instance
    server_request_hook=None,                     # Callable[[Span, scope], None]
    client_request_hook=None,                     # Callable[[Span, scope, message], None]
    client_response_hook=None,                    # Callable[[Span, scope, message], None]
    tracer_provider=None,                         # Optional TracerProvider
    meter_provider=None,                          # Optional MeterProvider
    excluded_urls=None,                           # Comma-delimited regex string
    http_capture_headers_server_request=None,     # list[str] or env var
    http_capture_headers_server_response=None,    # list[str] or env var
    http_capture_headers_sanitize_fields=None,    # list[str] or env var
    exclude_spans=None,                           # list[Literal['receive','send']]
)
```

### `FastAPIInstrumentor.uninstrument_app(app)` — remove instrumentation

### Hooks: Three hook types, all receive `(span, scope)` or `(span, scope, message)`:

- **server_request_hook** — called when a new server span is created for an incoming request.
- **client_request_hook** — called on the internal span when `receive` is called.
- **client_response_hook** — called on the internal span when `send` is called.

Always guard with `if span and span.is_recording():` before setting attributes.

### URL Exclusion

Two equivalent ways:
- Env var: `OTEL_PYTHON_FASTAPI_EXCLUDED_URLS="client/.*/info,healthcheck"`
- Code: `FastAPIInstrumentor.instrument_app(app, excluded_urls="client/.*/info,healthcheck")`

The broader env var `OTEL_PYTHON_EXCLUDED_URLS` applies to all instrumentations.

### Header Capture (request)

Env var `OTEL_INSTRUMENTATION_HTTP_CAPTURE_HEADERS_SERVER_REQUEST` or the `http_capture_headers_server_request` parameter. Accepts comma-delimited header names or regexes (`".*"` captures all). Header names are case-insensitive in FastAPI. Produces span attributes in the form `http.request.header.<lower_normalized_name>` as a list of values.

### Header Capture (response)

Same pattern via `OTEL_INSTRUMENTATION_HTTP_CAPTURE_HEADERS_SERVER_RESPONSE`. Produces `http.response.header.<lower_normalized_name>`.

### Header Sanitization

`OTEL_INSTRUMENTATION_HTTP_CAPTURE_HEADERS_SANITIZE_FIELDS` — comma-delimited header names or regexes. Matched headers have their values replaced with `[REDACTED]`. Case-insensitive matching. Example: `".*session.*,set-cookie"`.

## Caveats
- **Beta software** (Development Status: 4 - Beta). APIs may change.
- The header-capture environment variable names are **experimental** and subject to change.
- Requires **Python >= 3.9**.
- Always call `instrument_app()` **before** starting the ASGI server (e.g., before `uvicorn.run()`).
- Header names in span attributes are normalized: lowercase, `-` → `_`.
- The `exclude_spans` parameter (`'receive'` / `'send'`) can reduce span noise by dropping internal ASGI-level spans.

## Composition Hints
- Pair with **OTLP exporter** (`opentelemetry-exporter-otlp-proto-http`) to ship traces to a collector.
- Combine with **manual spans** inside route handlers for fine-grained operation tracing within requests.
- Use **server_request_hook** to extract tenant ID, user ID, or request correlation IDs from headers/scope and set them as span attributes.
- Set `OTEL_PYTHON_FASTAPI_EXCLUDED_URLS` in production to exclude `/health`, `/metrics`, and `/ready` endpoints.
- The `tracer_provider` parameter lets you inject a custom TracerProvider (e.g., one shared across multiple instrumentors) rather than relying on the global default.
