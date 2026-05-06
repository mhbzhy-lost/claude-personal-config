---
name: structlog-core
description: Configure structlog processor chains, contextvars context binding, JSON/console rendering, and bound logger patterns for structured logging in Python.
tech_stack: [structlog]
language: [python]
capability: [observability]
version: "structlog 25.x"
collected_at: 2025-07-17
---

# structlog Core

> Source: https://www.structlog.org/en/stable/configuration.html, https://www.structlog.org/en/stable/processors.html, https://www.structlog.org/en/stable/console-output.html, https://www.structlog.org/en/stable/contextvars.html, https://www.structlog.org/en/stable/getting-started.html

## Purpose

structlog is a structured logging library for Python that wraps any logger (stdlib `logging`, Twisted, or its own `PrintLogger`) and adds incremental context building, composable processor chains, and multiple rendering options. The core API centers on `structlog.configure()` + `structlog.get_logger()` — once configured, application code never touches config again.

## When to Use

- Any Python app needing structured, machine-parseable logs (JSON to stdout for ELK/Graylog)
- Incremental context building: bind key-value pairs step-by-step as they become available in a request/unit of work
- Development-time colorful console output (`ConsoleRenderer`) → production-time JSON output (`JSONRenderer`) with zero code changes
- Multi-threaded or async apps needing request-scoped context via `contextvars` (request ID, user, peer IP)
- Replacing or augmenting stdlib `logging` with structured output

## Basic Usage

### Minimal (default config — colorful console)

```python
import structlog
log = structlog.get_logger()
log.info("hello, %s!", "world", key="value!", more_than_strings=[1, 2, 3])
# 2022-10-07 10:41:29 [info     ] hello, world!   key=value! more_than_strings=[1, 2, 3]
```

### JSON production config

```python
structlog.configure(processors=[structlog.processors.JSONRenderer()])
log = structlog.get_logger()
log.info("hi")  # {"event": "hi"}
```

### The default configuration (explicit)

```python
import structlog, logging

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.set_exc_info,
        structlog.processors.TimeStamper(fmt="%Y-%m-%d %H:%M:%S", utc=False),
        structlog.dev.ConsoleRenderer()
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.NOTSET),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=False
)
```

### Incremental context building (core pattern)

```python
log = structlog.get_logger()
log = log.bind(user_agent=request.headers.get("User-Agent"), peer_ip=request.client_addr)
if foo := request.get("foo"):
    log = log.bind(foo=foo)
log.info("something")  # all bound context merged into event dict
```

### Request-scoped context via contextvars

```python
from structlog.contextvars import bind_contextvars, clear_contextvars, merge_contextvars

structlog.configure(processors=[merge_contextvars, structlog.processors.KeyValueRenderer()])

# In middleware / request start:
clear_contextvars()
bind_contextvars(request_id="abc-123", peer="10.0.0.1")

# In any downstream module — context auto-merged:
log = structlog.get_logger()
log.info("user action")  # event='user action' request_id=abc-123 peer=10.0.0.1
```

## Key APIs (Summary)

| API | Role |
|-----|------|
| `structlog.configure(processors, wrapper_class, logger_factory, context_class, cache_logger_on_first_use)` | Global config, call once at startup |
| `structlog.get_logger(*args, **initial_values)` | Returns lazy proxy → BoundLogger; args passed to logger_factory |
| `structlog.reset_defaults()` | Reset to factory defaults (useful in tests) |
| `structlog.get_config()` / `is_configured()` | Introspect current config |
| `structlog.make_filtering_bound_logger(min_level)` | Create level-filtering BoundLogger subclass |
| `structlog.DropEvent` | Raise from a processor to silently drop the entry |

### Processor chain (the heart of structlog)

Each processor: `(logger, method_name, event_dict) -> event_dict`. The **last** processor is also the renderer — it can return `str` / `bytes` / `bytearray`, a `(args, kwargs)` tuple, or a `dict`.

**Essential built-in processors:**

| Processor | Purpose |
|-----------|---------|
| `structlog.contextvars.merge_contextvars` | Merge context-local binds into every event (put first) |
| `structlog.processors.add_log_level` | Add `level` name + `level_number` |
| `structlog.processors.TimeStamper(fmt="iso")` | Add timestamp |
| `structlog.processors.JSONRenderer()` | Render event dict as JSON string (production) |
| `structlog.dev.ConsoleRenderer()` | Colorful aligned console output (development) |
| `structlog.dev.set_exc_info` | Set `exc_info` for ConsoleRenderer (use instead of `format_exc_info`) |
| `structlog.processors.StackInfoRenderer()` | Render stack traces |
| `structlog.processors.format_exc_info` | Format `exc_info` → `exception` key |
| `structlog.processors.CallsiteParameterAdder(...)` | Add filename/func_name/lineno |
| `structlog.processors.UnicodeDecoder()` | Decode bytes values to str |

### ConsoleRenderer quick config

```python
# Tweak defaults
cr = structlog.dev.ConsoleRenderer.get_active()
cr.exception_formatter = structlog.dev.plain_traceback  # disable Rich pretty-printing

# Explicit columns
cr = structlog.dev.ConsoleRenderer(columns=[
    structlog.dev.Column("timestamp", structlog.dev.KeyValueColumnFormatter(...)),
    structlog.dev.Column("event", structlog.dev.KeyValueColumnFormatter(...)),
    structlog.dev.Column("", structlog.dev.KeyValueColumnFormatter(...)),  # default
])
```

Environment: `FORCE_COLOR` enables, `NO_COLOR` disables (trumps `FORCE_COLOR`).

### Contextvars API

| Function | Purpose |
|----------|---------|
| `merge_contextvars` | Processor — merge context-local binds |
| `clear_contextvars()` | Reset context-local state (call at request start) |
| `bind_contextvars(**kw)` | Bind → returns tokens |
| `unbind_contextvars(*keys)` | Remove keys |
| `bound_contextvars(**kw)` | Context manager for temporary binds |
| `reset_contextvars(**tokens)` | Restore from tokens |
| `get_contextvars()` / `get_merged_contextvars()` | Read current state |

## Caveats

- **Lazy proxy trap**: `structlog.get_logger()` at module scope → lazy proxy. Never call `.new()` or `.bind()` at module/class scope — you'll get default config. Use `initial_values` kwarg for pre-populated contexts.
- **Contextvars isolation**: Context variable storage is isolated per concurrency mechanism. In Starlette/FastAPI hybrid apps, sync-context binds are invisible to async handlers and vice versa.
- **ConsoleRenderer columns vs args**: If you pass `columns`, all other output params (`level_styles`, `colors`, etc.) are silently ignored. Don't mix modes.
- **Pretty exceptions require `set_exc_info`, not `format_exc_info`**: The default config uses `set_exc_info`. If you add `format_exc_info` to the chain, ConsoleRenderer's pretty exception rendering breaks.
- **Performance**: The module-level lazy proxy creates a temporary bound logger per call. In tight loops, do `log = structlog.get_logger().bind()` once at function start.
- **`NO_COLOR` disables everything**: Bold, italics, colors — all gone.

## Composition Hints

- **Prefer `structlog.stdlib.recreate_defaults()`** when integrating with stdlib `logging` — one call sets up sensible defaults on top of `logging`.
- **Put `merge_contextvars` first** in the processor chain so context-local binds are available to all downstream processors.
- **Put `filter_by_level` (stdlib) or use `make_filtering_bound_logger`** early to avoid expensive processing of dropped entries.
- **Development vs production**: Use the same processor chain, just swap the last processor: `ConsoleRenderer` for dev, `JSONRenderer` for prod.
- **Custom processors are trivial**: Any `(logger, method_name, event_dict) -> event_dict` callable. Raise `DropEvent` to filter. Mutate `event_dict` safely (it's a copy).
- **For stdlib integration specifically**, see the `structlog-stdlib` skill which covers the 4 integration approaches and `ProcessorFormatter`.
