---
name: opentelemetry-js-sdk
description: OpenTelemetry JavaScript SDK initialization for Node.js (NodeSDK) and Browser (WebTracerProvider) — TracerProvider setup, span processors, and resource attributes.
tech_stack: [opentelemetry]
language: [javascript, typescript]
capability: [observability]
version: "OpenTelemetry JavaScript (Traces: Stable, Metrics: Stable, Logs: Development)"
collected_at: 2026-02-21
---

# OpenTelemetry JavaScript SDK

> Source: https://opentelemetry.io/docs/languages/js/instrumentation/, https://opentelemetry.io/docs/languages/js/

## Purpose
Initialize the OpenTelemetry SDK in Node.js or browser applications to enable tracing, metrics, and logging. Covers `NodeSDK` for Node.js, `WebTracerProvider` for browser, span processor selection (`BatchSpanProcessor` vs `SimpleSpanProcessor`), resource attributes, and acquiring tracers via `getTracer()`.

## When to Use
- Bootstrapping OpenTelemetry in any Node.js application (use `NodeSDK`).
- Bootstrapping OpenTelemetry in a browser/web app (use `WebTracerProvider`).
- You need to understand `BatchSpanProcessor` vs `SimpleSpanProcessor` trade-offs before configuring exporters.

## Basic Usage

### Node.js — NodeSDK (recommended)
```typescript
// instrumentation.ts — MUST be loaded before any other module
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { PeriodicExportingMetricReader, ConsoleMetricExporter } from '@opentelemetry/sdk-metrics';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'yourServiceName',
    [ATTR_SERVICE_VERSION]: '1.0',
  }),
  traceExporter: new ConsoleSpanExporter(),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new ConsoleMetricExporter(),
  }),
});

sdk.start();
```

Launch: `npx tsx --import ./instrumentation.ts app.ts` (Node.js v20+) or `node --import ./instrumentation.mjs app.js`.

> **Critical ordering rule**: The SDK must be initialized *before any other module loads*. Late initialization causes no-op implementations — all `getTracer()` calls silently do nothing.

### Browser — WebTracerProvider
```typescript
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';

const resource = defaultResource().merge(
  resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'service-name-here',
    [ATTR_SERVICE_VERSION]: '0.1.0',
  }),
);

const provider = new WebTracerProvider({
  resource,
  spanProcessors: [new BatchSpanProcessor(new ConsoleSpanExporter())],
});
provider.register();
```

Bundle this file with your web app (webpack/parcel/etc.). Browser instrumentation is **experimental**.

### Acquiring a Tracer
```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer(
  'instrumentation-scope-name',    // required — package/module/class name
  'instrumentation-scope-version', // recommended, optional
);
```

Call `getTracer()` locally where needed rather than exporting a singleton — avoids tricky module load-order issues.

## Key APIs (Summary)

| Concept | Node.js | Browser |
|---|---|---|
| SDK entry | `new NodeSDK({...}).start()` | `new WebTracerProvider({...}).register()` |
| Resource | `resourceFromAttributes({...})` | `defaultResource().merge(resourceFromAttributes({...}))` |
| Span processor | `BatchSpanProcessor` (default) | `BatchSpanProcessor` |
| Dev exporter | `ConsoleSpanExporter` | `ConsoleSpanExporter` |
| Tracer | `trace.getTracer(name, ver?)` | `trace.getTracer(name, ver?)` |

**Span processors:**
- `BatchSpanProcessor` — Batches spans before export. Default and recommended for production.
- `SimpleSpanProcessor` — Exports each span synchronously as created. Useful for debugging; heavy overhead in production.

**Required packages:** `@opentelemetry/api`, `@opentelemetry/sdk-node` (Node), `@opentelemetry/sdk-trace-web` (browser), `@opentelemetry/resources`, `@opentelemetry/semantic-conventions`.

## Caveats
- **SDK init order is fatal if wrong**: If any module imports `@opentelemetry/api` before the SDK starts, tracing is permanently no-op for that process.
- **Browser is experimental**: `WebTracerProvider` and browser instrumentation are not yet stable — expect API changes and limited ecosystem support.
- **Node.js v18**: `--import` with `.mjs` (plain JS) works; TypeScript `--import` requires v20+.
- **ESM**: Node.js ESM apps need the loader hook from the ESM Support docs.
- **`span.end()` is mandatory**: Forgetting to call `.end()` on a span means it is never exported — silent data loss.

## Composition Hints
- Pair with `opentelemetry-js-otlp` to replace `ConsoleSpanExporter` with `OTLPTraceExporter` for production.
- Pair with `opentelemetry-js-manual-span` for creating and enriching spans after SDK init.
- Pair with `opentelemetry-js-browser` for browser-specific auto-instrumentation (DocumentLoad, UserInteraction, XHR).
- Pair with `opentelemetry-js-propagation` for cross-service trace context propagation.
- The `NodeSDK` constructor also accepts `instrumentations: [...]` to register instrumentation libraries for automatic tracing of Express, HTTP, gRPC, etc.
