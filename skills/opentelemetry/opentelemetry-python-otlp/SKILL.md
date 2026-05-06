---
name: opentelemetry-python-otlp
description: Configure OTLP exporters (HTTP/protobuf and gRPC) for Python OpenTelemetry SDK — traces, metrics, collector setup, temporality presets, and console fallback.
tech_stack: ["backend"]
language: ["python"]
capability: ["observability"]
version: "OpenTelemetry Python SDK (exporters page, 2026-01-14)"
collected_at: 2026-01-14
---

# OpenTelemetry OTLP Exporters (Python)

> Source: https://opentelemetry.io/docs/languages/python/exporters/

## Purpose
Configure the OpenTelemetry Python SDK to export traces and metrics to an OTLP-compatible backend (Collector, Jaeger, Prometheus, or vendor). Covers both HTTP/protobuf and gRPC transports, `BatchSpanProcessor` / `PeriodicExportingMetricReader` wiring, temporality presets, and the console exporter for local development.

## When to Use
- You have set up TracerProvider / MeterProvider and need to ship telemetry out of the process.
- Choosing between `opentelemetry-exporter-otlp-proto-http` and `opentelemetry-exporter-otlp-proto-grpc`.
- Running a local OpenTelemetry Collector in Docker for development.
- Setting delta vs cumulative temporality for metrics backends (e.g., Datadog wants DELTA).
- Debugging locally with `ConsoleSpanExporter` before connecting to a real backend.

## Basic Usage

**Install** (pick one):
```bash
pip install opentelemetry-exporter-otlp-proto-http   # HTTP/protobuf
pip install opentelemetry-exporter-otlp-proto-grpc   # gRPC
```

**Minimal traces-only setup (HTTP/protobuf):**
```python
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

resource = Resource.create(attributes={SERVICE_NAME: "your-service-name"})

tracer_provider = TracerProvider(resource=resource)
tracer_provider.add_span_processor(
    BatchSpanProcessor(OTLPSpanExporter(endpoint="http://localhost:4318/v1/traces"))
)
trace.set_tracer_provider(tracer_provider)
```

## Key APIs (Summary)

### Exporters

| Transport | Trace Exporter | Metric Exporter | Package |
|---|---|---|---|
| HTTP/protobuf | `OTLPSpanExporter` from `opentelemetry.exporter.otlp.proto.http.trace_exporter` | `OTLPMetricExporter` from `opentelemetry.exporter.otlp.proto.http.metric_exporter` | `opentelemetry-exporter-otlp-proto-http` |
| gRPC | `OTLPSpanExporter` from `opentelemetry.exporter.otlp.proto.grpc.trace_exporter` | `OTLPMetricExporter` from `opentelemetry.exporter.otlp.proto.grpc.metric_exporter` | `opentelemetry-exporter-otlp-proto-grpc` |
| Console (dev) | `ConsoleSpanExporter` from `opentelemetry.sdk.trace.export` | `ConsoleMetricExporter` from `opentelemetry.sdk.metrics.export` | included in `opentelemetry-sdk` |

### Endpoint conventions
- **HTTP/protobuf traces**: `http://<host>:4318/v1/traces`
- **HTTP/protobuf metrics**: `http://<host>:4318/v1/metrics`
- **gRPC**: `http://<host>:4317` (no path suffix)

### Span Processors
- **`BatchSpanProcessor(exporter)`** — buffers spans and exports in batches. **Always use for production.**
- **`SimpleSpanProcessor(exporter)`** — exports each span synchronously. Dev/debug only.

### Metric Readers
- **`PeriodicExportingMetricReader(exporter)`** — periodically flushes metrics on a configurable interval.

### Temporality Preset
Env var: `OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE`

| Value | Counter | Histogram | ObservableCounter | Use case |
|---|---|---|---|---|
| `CUMULATIVE` (default) | CUMULATIVE | CUMULATIVE | CUMULATIVE | Prometheus, most backends |
| `DELTA` | DELTA | DELTA | DELTA | Datadog, delta-friendly backends |
| `LOWMEMORY` | DELTA | DELTA | CUMULATIVE | Memory-constrained environments |

Invalid values silently fall back to `CUMULATIVE` with a warning.

## Caveats
- **Always use the Collector in production.** Sending SDK spans directly to a backend bypasses buffering, retries, and sampling control.
- **HTTP/protobuf needs explicit `/v1/traces` or `/v1/metrics` paths** on the endpoint; gRPC does not.
- **`SimpleSpanProcessor` blocks on every span** — never use it in production.
- **Console exporters** (`ConsoleSpanExporter`, `ConsoleMetricExporter`) ship with `opentelemetry-sdk` — no extra install.
- Temporality is **per-instrumentation-kind**, not per-instrument. The env var applies a preset globally.
- Collector default ports: gRPC **4317**, HTTP **4318**.

## Composition Hints
- Pair with **FastAPI instrumentor** — the exporter is the "output" side while the instrumentor is the "input" side of the tracing pipeline.
- In development, start with `ConsoleSpanExporter` to verify spans are being created, then swap to OTLP.
- For **Jaeger**, run `jaegertracing/all-in-one:latest` (it supports OTLP natively on 4317/4318) and point your OTLP exporter at it.
- For **Prometheus metrics**, either use the OTLP exporter (if Prometheus has the OTLP receiver enabled) or the dedicated `PrometheusMetricReader` from `opentelemetry-exporter-prometheus`.
- The `Resource` with `SERVICE_NAME` is required by most backends — always set it.
