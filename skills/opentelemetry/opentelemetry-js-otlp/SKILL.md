---
name: opentelemetry-js-otlp
description: Configure OTLP exporters for OpenTelemetry JavaScript/TypeScript — HTTP/protobuf, HTTP/JSON, and gRPC transports for Node.js and browser.
tech_stack: [opentelemetry]
language: [javascript, typescript]
capability: [observability]
version: "OpenTelemetry JS unversioned"
collected_at: 2025-10-13
---

# OTLP Exporters for JavaScript

> Source: https://opentelemetry.io/docs/languages/js/exporters/

## Purpose
Export traces and metrics from Node.js or browser applications via the OpenTelemetry Protocol (OTLP) — the native OTel data model format with zero information loss. In production, always route through an OpenTelemetry Collector; for development, use `ConsoleSpanExporter`.

## When to Use
- Exporting telemetry to an OpenTelemetry Collector, Jaeger, Prometheus, or any OTLP-compatible backend.
- You need lossless OTel-native export (as opposed to Zipkin or Prometheus exporters which may lose fields).
- Browser applications that need to send telemetry to a collector (with special CORS/CSP configuration).
- You want to switch between HTTP/protobuf, HTTP/JSON, or gRPC transport.

## Basic Usage

### 1. Install dependencies (pick one transport)

| Protocol | Packages |
|---|---|
| HTTP/Protobuf | `@opentelemetry/exporter-trace-otlp-proto` + `@opentelemetry/exporter-metrics-otlp-proto` |
| HTTP/JSON | `@opentelemetry/exporter-trace-otlp-http` + `@opentelemetry/exporter-metrics-otlp-http` |
| gRPC | `@opentelemetry/exporter-trace-otlp-grpc` + `@opentelemetry/exporter-metrics-otlp-grpc` |

### 2. Configure NodeSDK (HTTP/Protobuf example)

```typescript
import * as opentelemetry from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

const sdk = new opentelemetry.NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: '<your-otlp-endpoint>/v1/traces',  // default: http://localhost:4318/v1/traces
    headers: {},
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: '<your-otlp-endpoint>/v1/metrics', // default: http://localhost:4318/v1/metrics
      headers: {},
      concurrencyLimit: 1,
    }),
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();
```

### 3. Local Collector (Docker) for testing

```yaml
# collector-config.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
exporters:
  debug:
    verbosity: detailed
service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [debug]
    metrics:
      receivers: [otlp]
      exporters: [debug]
    logs:
      receivers: [otlp]
      exporters: [debug]
```

```bash
docker run -p 4317:4317 -p 4318:4318 --rm \
  -v $(pwd)/collector-config.yaml:/etc/otelcol/config.yaml \
  otel/opentelemetry-collector
```

## Key APIs (Summary)

- **`OTLPTraceExporter`** — Exports spans via OTLP. Constructor accepts `url` (default `http://localhost:4318/v1/traces`) and `headers`.
- **`OTLPMetricExporter`** — Exports metrics via OTLP. Constructor accepts `url` (default `http://localhost:4318/v1/metrics`), `headers`, and `concurrencyLimit`.
- **`PeriodicExportingMetricReader`** — Required wrapper around `OTLPMetricExporter`; metrics are not exported via `traceExporter`.
- **`SimpleSpanProcessor`** / **`BatchSpanProcessor`** — `NodeSDK` defaults to batching. Override via `spanProcessors: [new SimpleSpanProcessor(exporter)]` for one-by-one export (dev only).
- **`ConsoleSpanExporter`** — Bundled in `@opentelemetry/sdk-trace-node`; useful for local debugging.

## Caveats

- **gRPC does NOT work in the browser.** Use HTTP/protobuf or HTTP/JSON exporters for browser apps.
- **Browser CSP:** add `connect-src collector.example.com:4318/v1/traces` to your Content Security Policy.
- **Browser CORS:** configure the collector's OTLP HTTP receiver with `cors.allowed_origins` matching your site origin.
- **Never expose the collector directly to the public internet.** Place an NGINX reverse proxy in front for SSL-offloading and CORS header injection.
- **`PeriodicExportingMetricReader` is mandatory** when using `OTLPMetricExporter` — metrics won't export if you only set `traceExporter`.
- Default OTLP ports: **4318** for HTTP, **4317** for gRPC.

## Composition Hints
- Combine with `@opentelemetry/auto-instrumentations-node` or specific instrumentation libraries to automatically capture spans.
- For browser apps, pair with `@opentelemetry/auto-instrumentations-web` and a `ZoneContextManager`.
- In production, always export to a Collector (which can fan out to multiple backends) rather than directly to a backend.
