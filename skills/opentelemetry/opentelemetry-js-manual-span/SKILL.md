---
name: opentelemetry-js-manual-span
description: Manual span creation and management with the OpenTelemetry JS API — startActiveSpan, startSpan, attributes, events, status, and context propagation.
tech_stack: [opentelemetry]
language: [javascript, typescript]
capability: [observability]
version: "OpenTelemetry JS unversioned"
collected_at: 2025-07-17
---

# OpenTelemetry JS — Manual Span Instrumentation

> Source: https://opentelemetry.io/docs/languages/js/instrumentation/, https://opentelemetry.io/docs/languages/js/

## Purpose

Manual instrumentation lets you add tracing spans to your application code using the OpenTelemetry JS API. You create spans around units of work, enrich them with attributes/events/status, and manage parent-child relationships — giving you fine-grained observability into custom business logic that automatic instrumentation cannot cover.

## When to Use

- Custom business logic not covered by automatic instrumentation
- Library authors who want to emit spans when their library is used in an instrumented app (use `@opentelemetry/api` only, never the SDK)
- Need for fine-grained span lifecycle control: attributes, events, status codes, links
- In most cases: prefer `startActiveSpan` (auto-context); use `startSpan` only for independent sibling spans or manual context management

## Basic Usage

### Acquire a Tracer

```js
import { trace } from '@opentelemetry/api';
const tracer = trace.getTracer('my-component', '1.0');
```

Call `getTracer` where needed rather than exporting a singleton.

### Create an Active Span (recommended)

```js
tracer.startActiveSpan('operation-name', (span) => {
  // ... do work ...
  span.setAttribute('key', 'value');
  span.end(); // MUST end the span
  return result;
});
```

Nested `startActiveSpan` calls automatically create parent-child span relationships.

### Create Independent Sibling Spans

```js
const span1 = tracer.startSpan('work-1');
const span2 = tracer.startSpan('work-2');
// do work...
span1.end();
span2.end();
```

### Add Attributes, Events, Status

```js
span.setAttribute('user.id', userId);
span.addEvent('cache-miss', { 'cache.key': key });
span.setStatus({ code: SpanStatusCode.ERROR, message: 'Timeout' });
```

### Record Exceptions

```js
try { doWork(); }
catch (ex) {
  if (ex instanceof Error) { span.recordException(ex); }
  span.setStatus({ code: SpanStatusCode.ERROR });
}
```

### Get the Current Span

```js
import opentelemetry from '@opentelemetry/api';
const active = opentelemetry.trace.getActiveSpan();
```

## Key APIs (Summary)

| API | Signature | Notes |
|-----|-----------|-------|
| `trace.getTracer(name, version?)` | `(string, string?) => Tracer` | name required, version recommended |
| `tracer.startActiveSpan(name, cb)` | `(string, (Span) => R) => R` | Sets span active in context; **preferred** |
| `tracer.startActiveSpan(name, opts, cb)` | `(string, SpanOptions, cb) => R` | Pass `{attributes, links}` |
| `tracer.startSpan(name)` | `(string, SpanOptions?, Context?) => Span` | No context activation; for siblings |
| `span.setAttribute(key, value)` | `(string, string \| number \| boolean) => Span` | Attach key/value metadata |
| `span.addEvent(name, attrs?)` | `(string, Attributes?) => Span` | Discrete timestamped event |
| `span.setStatus({code, message?})` | `(SpanStatus) => Span` | `SpanStatusCode.ERROR` / `OK` / `UNSET` |
| `span.recordException(error)` | `(Error) => Span` | Pair with `setStatus(ERROR)` |
| `span.end()` | `() => void` | **Must** call; span leaks otherwise |
| `trace.getActiveSpan()` | `() => Span \| undefined` | Get current active span |
| `trace.setSpan(ctx, span)` | `(Context, Span) => Context` | Manual context propagation |

## Caveats

- **Always call `span.end()`** — spans that aren't ended continue tracking work indefinitely and leak resources.
- **SDK must initialize first**: the OpenTelemetry SDK must be loaded and started before any other module. Late initialization → no-op tracers.
- **`startActiveSpan` vs `startSpan`**: `startActiveSpan` handles context automatically and is the right choice for 90%+ of cases. `startSpan` requires manual context management via `trace.setSpan()` for nesting.
- **Library vs App**: libraries depend only on `@opentelemetry/api`; only applications install and initialize the SDK.
- **BatchSpanProcessor** is the production default (batches exports). `SimpleSpanProcessor` exports immediately — useful for debugging, but significant overhead in production.
- **Manual context propagation** (`sdk-trace-base`): without Node.js/Web SDK, you must call `trace.setSpan(context.active(), parentSpan)` before creating child spans with `startSpan`.

## Composition Hints

- Combine manual spans with automatic instrumentation: auto-instrumentation covers HTTP/database, manual spans cover your domain logic.
- Use `@opentelemetry/semantic-conventions` constants (`ATTR_CODE_FUNCTION_NAME`, etc.) for standardized attribute names.
- For browser: the same `startActiveSpan`/`startSpan` API works, backed by `WebTracerProvider` from `@opentelemetry/sdk-trace-web` with `ZoneContextManager` for async context.
- Use span links to correlate spans across different traces (e.g., batch job linking to originating request).
