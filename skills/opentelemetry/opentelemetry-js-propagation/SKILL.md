---
name: opentelemetry-js-propagation
description: Context propagation for OpenTelemetry JavaScript — automatic via instrumentation libraries and manual inject/extract for custom protocols.
tech_stack: [opentelemetry]
language: [javascript, typescript]
capability: [observability]
version: "OpenTelemetry JS unversioned"
collected_at: 2025-10-13
---

# Context Propagation for JavaScript

> Source: https://opentelemetry.io/docs/languages/js/propagation/

## Purpose
Correlate traces across distributed services regardless of process/network boundaries. Propagation ensures spans from different services share the same `traceId` and maintain correct parent-child relationships. Uses the W3C Trace Context standard (`traceparent`/`tracestate`), which is language-agnostic — correlation works across services written in any OpenTelemetry-supported language.

## When to Use
- You have multiple services calling each other (HTTP, gRPC, message queues) and need end-to-end traces.
- **Automatic**: when using standard HTTP libraries with OpenTelemetry instrumentation (preferred).
- **Manual**: when using custom protocols (TCP, WebSocket with custom framing, proprietary RPC) where no instrumentation library exists.
- Libraries you author should **only** use `@opentelemetry/api` (never the SDK) so they remain compatible with any OpenTelemetry setup.

## Basic Usage

### Automatic Propagation (preferred)

Instrumentation libraries handle propagation transparently. Example with `undici`:

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { SimpleSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';

const sdk = new NodeSDK({
  spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())],
  instrumentations: [new UndiciInstrumentation()],
});
sdk.start();

// Outbound requests automatically carry traceparent/tracestate headers
import { request } from 'undici';
request('http://localhost:8080/rolldice').then(r => r.body.json().then(console.log));
```

The receiving service (also instrumented) will see `parentSpanContext` populated with `isRemote: true`, the client's `spanId` as parent, and the shared `traceId`.

Supported auto-propagation libraries include: `@opentelemetry/instrumentation-http`, `@opentelemetry/instrumentation-undici`, `@opentelemetry/instrumentation-express`, and others.

### Manual Propagation

Use when no instrumentation library covers your transport. Two operations:

#### Inject (sending side)

```typescript
import { context, propagation } from '@opentelemetry/api';

const carrier = {};
propagation.inject(context.active(), carrier);
// carrier now has { traceparent: '00-...', tracestate: '...' }
// Send carrier fields via your transport
```

#### Extract (receiving side)

```typescript
import { context, propagation, trace } from '@opentelemetry/api';

const carrier = { traceparent: '00-...', tracestate: '...' }; // from transport
const extractedCtx = propagation.extract(context.active(), carrier);

const tracer = trace.getTracer('my-service');
const span = tracer.startSpan('handle-request', { attributes: {} }, extractedCtx);
trace.setSpan(extractedCtx, span); // make it active
// ... do work ...
span.end();
```

Any spans created with `extractedCtx` as parent will belong to the same trace.

## Key APIs (Summary)

- **`propagation.inject(ctx, carrier)`** — Serializes `traceparent` and `tracestate` from the context into a carrier object (mutated in place). The carrier can be any object.
- **`propagation.extract(ctx, carrier)`** — Deserializes context from a carrier, returns a new `Context` with the extracted span context.
- **`context.active()`** — Returns the currently active context (the one on the current async execution).
- **`trace.setSpan(ctx, span)`** — Associates a span with a context, making it the active span.
- **`tracer.startSpan(name, opts, ctx)`** — Creates a span with `ctx` as parent context.

## Caveats

- **Without an SDK registered, all API calls are no-ops.** This is by design — libraries using only `@opentelemetry/api` work whether or not OpenTelemetry is wired up.
- **Library code must only depend on `@opentelemetry/api`**, never on SDK packages. The SDK is an application-level concern.
- **Manual propagation is for rare cases.** Always prefer instrumentation libraries for standard transports.
- **ESM users**: use `node --import ./instrumentation.mjs` rather than `--require`.
- **`propagation.inject` mutates the carrier in place** — it does not return a new object.
- **Cross-language correlation** relies on W3C Trace Context; any language with OTel support will produce compatible `traceparent` headers.

## Composition Hints
- Pair with any HTTP/RPC instrumentation library for automatic propagation.
- For custom protocols, store `traceparent`/`tracestate` in your wire format (JSON fields, message headers, etc.) and extract them on the receiving side.
- The TCP example in the source material demonstrates a complete pattern: embed `{ _meta: { traceparent, tracestate } }` in your JSON payload, extract it on the server, and create child spans from the extracted context.
