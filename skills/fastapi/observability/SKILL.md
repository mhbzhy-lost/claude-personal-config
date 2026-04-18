---
name: fastapi-observability
description: FastAPI 可观测性三件套——OpenTelemetry 追踪/指标/日志、Prometheus 指标、structlog 结构化日志
tech_stack: [fastapi, opentelemetry, prometheus, structlog]
language: [python]
capability: [observability]
version: "opentelemetry-python unversioned; prometheus-fastapi-instrumentator unversioned; structlog unversioned"
collected_at: 2026-04-18
---

# FastAPI 可观测性（OTel / Prometheus / structlog）

> 来源：https://opentelemetry.io/docs/languages/python/ 、https://github.com/trallnag/prometheus-fastapi-instrumentator 、https://github.com/hynek/structlog

## 用途
- **OpenTelemetry**：traces + metrics + logs 统一接入 OTLP 后端（Jaeger、Tempo、Prometheus 等）
- **prometheus-fastapi-instrumentator**：零配置暴露 FastAPI HTTP 指标
- **structlog**：结构化（JSON / logfmt）日志，可转发到 stdlib logging

## 何时使用
- 需要分布式追踪、跨服务 trace context 传播 → OpenTelemetry
- 只要 Prometheus 抓 HTTP 指标 → prometheus-fastapi-instrumentator
- 需要 JSON 日志上 ELK/Loki → structlog

## 基础用法

### OpenTelemetry 自动埋点
```bash
pip install opentelemetry-distro opentelemetry-exporter-otlp
opentelemetry-bootstrap -a install
opentelemetry-instrument \
  --traces_exporter otlp --metrics_exporter otlp --logs_exporter otlp \
  --service_name my-api \
  uvicorn app:app
```

### OpenTelemetry 手动埋点
```python
from opentelemetry import trace, metrics
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter

provider = TracerProvider()
provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
trace.set_tracer_provider(provider)
tracer = trace.get_tracer("my.tracer")

@tracer.start_as_current_span("do_work")
def do_work():
    span = trace.get_current_span()
    span.set_attribute("work.kind", "roll")
    span.add_event("started")
```

### Prometheus 指标
```python
from prometheus_fastapi_instrumentator import Instrumentator
Instrumentator().instrument(app).expose(app)
# 访问 /metrics
```

默认指标：`http_requests_total`、`http_request_size_bytes`、`http_response_size_bytes`、`http_request_duration_seconds`（低基数）、`http_request_duration_highr_seconds`（高精度）。

### structlog（最小用法）
参考 https://www.structlog.org/ ——设计为"函数 + dict"；支持 JSON / logfmt / 彩色 console；可独立输出或转发到 stdlib `logging`。

## 关键 API

**OpenTelemetry Traces**
- `tracer.start_as_current_span(name)`：上下文管理器 / 装饰器
- `span.set_attribute(k, v)` / `add_event(msg)` / `record_exception(e)` / `set_status(Status(StatusCode.ERROR))`
- `SpanAttributes.HTTP_METHOD`（语义约定，`opentelemetry-semantic-conventions`）
- `trace.Link(ctx)`：跨 trace 因果链接
- 传播：`OTEL_PROPAGATORS=tracecontext,baggage` 或 `set_global_textmap(B3Format())`

**OpenTelemetry Metrics**
- `meter.create_counter / create_histogram / create_observable_gauge`
- `PeriodicExportingMetricReader(exporter)` → `MeterProvider(metric_readers=[...])`

**OpenTelemetry Logs**：`LoggerProvider` + `LoggingHandler` 把 stdlib `logging` 桥接到 OTLP。

**prometheus-fastapi-instrumentator 关键参数**
| 参数 | 用途 |
|---|---|
| `should_group_status_codes` | 2xx/3xx 分组 |
| `should_ignore_untemplated` | 忽略未匹配路由 |
| `should_respect_env_var` + `env_var_name` | 运行时按环境变量开关 |
| `excluded_handlers` | 正则排除（如 `/metrics`、`/admin.*`） |
| `should_instrument_requests_inprogress` | 正在处理请求的 gauge |

内置 metrics：`metrics.latency()`、`metrics.request_size()`、`metrics.response_size()`、`metrics.default()`，支持 `metric_namespace` / `metric_subsystem` / `custom_labels`。

自定义指标：实现 `def instrumentation(info: Info) -> None`，通过 `instrumentator.add(...)` 注册。

## 注意事项
- **instrumentator 非通用 Prometheus 客户端**：只做 FastAPI HTTP 指标；业务指标用 `prometheus_client`
- **`info.response` 可能是 None**：自定义 instrumentation 中判空；handler 抛的异常不会被捕获
- **`should_respect_env_var` 环境变量不存在时**：`instrument()` / `expose()` 都会静默 no-op
- **`should_gzip=True`**：CPU vs 带宽取舍
- **AsyncEngine + OTel**：SQLAlchemy 用 `opentelemetry-instrumentation-sqlalchemy`，传 `engine.sync_engine`
- **默认 OTLP 端点**：`localhost:4317` gRPC
- **structlog 可桥接 stdlib**：保留现有 logging handler 时用 `ProcessorFormatter`

## 组合提示
典型栈：`opentelemetry-instrument` 做 trace/log 自动埋点 + `prometheus-fastapi-instrumentator` 暴露 `/metrics` 给 Prometheus 抓 + `structlog` 输出 JSON 日志并注入 trace_id/span_id。
