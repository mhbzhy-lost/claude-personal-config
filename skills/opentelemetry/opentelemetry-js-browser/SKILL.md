---
name: opentelemetry-js-browser
description: Setup and configure OpenTelemetry browser instrumentation — WebTracerProvider, ZoneContextManager, document load, user interaction, fetch/XHR tracing, and event-based web vitals.
tech_stack: [opentelemetry]
language: [javascript, typescript]
capability: [observability]
version: "OpenTelemetry JS Browser (browser-instrumentation v0.4.0)"
collected_at: 2025-07-17
---

# OpenTelemetry JS — Browser Instrumentation

> Source: https://opentelemetry.io/docs/languages/js/browser/, https://github.com/open-telemetry/opentelemetry-browser

## Purpose

Add OpenTelemetry tracing and telemetry to browser-based web applications. Two complementary approaches are available: **span-based instrumentations** (document load, user interactions, fetch/XHR — producing traditional trace spans) and **event-based instrumentations** (navigation timing, web vitals, user actions — producing structured log records). Client instrumentation for the browser is **experimental**.

## When to Use

- Instrumenting browser/web applications (not Node.js servers)
- Capturing document load timing, user interactions (clicks), XHR/fetch request traces
- Propagating server trace context to the browser via `<meta name="traceparent">`
- Span-based approach when you need traditional distributed traces
- Event-based approach (`@opentelemetry/browser-instrumentation`) for web vitals (LCP, FID, CLS), navigation timing, or structured log records

## Basic Usage

### Span-based Setup (Tracing)

Propagate server trace context in HTML:
```html
<meta name="traceparent" content="00-{traceId}-{spanId}-01" />
```

Initialize tracing in your app entry:
```js
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { registerInstrumentations } from '@opentelemetry/instrumentation';

const provider = new WebTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())],
});

provider.register({
  contextManager: new ZoneContextManager(),
});

registerInstrumentations({
  instrumentations: [new DocumentLoadInstrumentation()],
});
```

### Add More Instrumentations

```js
import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';

registerInstrumentations({
  instrumentations: [
    new DocumentLoadInstrumentation(),
    new UserInteractionInstrumentation(),
    new XMLHttpRequestInstrumentation(),
  ],
});
```

### Event-based Setup (Logs / Web Vitals)

```js
import { logs } from '@opentelemetry/api-logs';
import { ConsoleLogRecordExporter, LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { NavigationTimingInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/navigation-timing';
import { UserActionInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/user-action';
import { WebVitalsInstrumentation } from '@opentelemetry/browser-instrumentation/experimental/web-vitals';

const logProvider = new LoggerProvider({
  processors: [new SimpleLogRecordProcessor(new ConsoleLogRecordExporter())],
});
logs.setGlobalLoggerProvider(logProvider);

registerInstrumentations({
  instrumentations: [
    new NavigationTimingInstrumentation(),
    new UserActionInstrumentation(),
    new WebVitalsInstrumentation(),
  ],
});
```

## Key APIs (Summary)

| API / Package | Purpose |
|---|---|
| `WebTracerProvider` (`@opentelemetry/sdk-trace-web`) | Browser span-based tracer provider |
| `ZoneContextManager` (`@opentelemetry/context-zone`) | Async context propagation via Zone.js — **required** for correct span nesting |
| `registerInstrumentations()` (`@opentelemetry/instrumentation`) | Register one or more instrumentations at once |
| `DocumentLoadInstrumentation` | Document load/navigation timing spans |
| `UserInteractionInstrumentation` | User click/interaction spans |
| `XMLHttpRequestInstrumentation` | XHR request spans |
| `FetchInstrumentation` (`@opentelemetry/instrumentation-fetch`) | Fetch API request spans |
| `ConsoleSpanExporter` (`@opentelemetry/sdk-trace-base`) | Print spans to browser console (dev only) |
| `SimpleSpanProcessor` / `BatchSpanProcessor` | Export immediately (dev) vs batched (prod) |
| `LoggerProvider` (`@opentelemetry/sdk-logs`) | Provider for event-based log records |
| `NavigationTimingInstrumentation` (`@opentelemetry/browser-instrumentation`) | Event-based navigation timing |
| `WebVitalsInstrumentation` (`@opentelemetry/browser-instrumentation`) | Event-based LCP/FID/CLS |
| `auto-instrumentations-web` | Meta-package: all common web instrumentations |

## Caveats

- **Experimental**: Browser instrumentation APIs and specs are not yet stable and may change.
- **ZoneContextManager is essential** — without it, async operations (promises, timeouts) break span nesting. Always include `@opentelemetry/context-zone`.
- **Bundle size matters**: browser packages add significant weight. Use `auto-instrumentations-web` with tree-shaking, and prefer `BatchSpanProcessor` in production.
- **`traceparent` meta tag**: must be dynamically generated server-side with the correct trace ID, parent span ID, and sampling flag (`01` = sampled, `00` = not).
- **`SimpleSpanProcessor` is for development only** — it blocks on every span export. Use `BatchSpanProcessor` in production.
- **CORS**: remote collector endpoints must be configured with appropriate CORS headers for browser export.
- **Event-based vs span-based**: these produce different telemetry types (log records vs spans). Choose based on backend support — they can coexist.
- **Manual span creation** in the browser uses the identical `@opentelemetry/api` (`startActiveSpan`/`startSpan`) as Node.js, backed by `WebTracerProvider`.

## Composition Hints

- Combine span-based (document load, user interaction, fetch/XHR) with event-based (web vitals, navigation timing) for complete browser observability.
- Use `auto-instrumentations-web` meta-package for quick setup; strip unused instrumentations for production builds.
- Pair browser instrumentation with server-side OpenTelemetry to get end-to-end traces: the `traceparent` meta tag connects browser spans to the originating server request.
- For manual spans in browser code, import from `@opentelemetry/api` — the same `trace.getTracer()` / `startActiveSpan()` API works with `WebTracerProvider`.
