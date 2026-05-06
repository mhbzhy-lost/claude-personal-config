---
name: structlog-fastapi
description: Integrate structlog with FastAPI/Starlette via ASGI middleware, contextvars request-scoped context, uvicorn logging override, and async logging methods.
tech_stack: [structlog, fastapi]
language: [python]
capability: [observability, web-framework]
version: "structlog 25.x"
collected_at: 2025-07-17
---

# structlog + FastAPI

> Source: https://www.structlog.org/en/stable/frameworks.html, https://www.structlog.org/en/stable/contextvars.html, https://www.structlog.org/en/stable/standard-library.html

## Purpose

Integrate structlog with FastAPI/Starlette to get structured, JSON-logged output with automatic request-scoped context (request ID, client IP, path, user) on every log entry — in any module, without passing loggers around.

Three mechanisms work together:
1. **ASGI middleware** manages the contextvars lifecycle (clear + bind per request)
2. **Stdlib logging integration** (via `ProcessorFormatter`) ensures uvicorn and app logs share the same structured format
3. **Async logging methods** (`ainfo()` etc.) prevent the processor chain from blocking the event loop

## When to Use

- FastAPI/Starlette apps needing structured JSON logs in production
- Automatically attaching request ID, client IP, URL path, user identity to every log entry
- Replacing uvicorn's default access/error log formatting with structured JSON
- Hybrid sync/async FastAPI apps (but read the Starlette context isolation caveat first)

## Basic Usage

### Pure ASGI middleware (preferred)

Avoid `BaseHTTPMiddleware` — it uses `anyio` which can break contextvar propagation. Use raw ASGI middleware:

```python
from starlette.types import ASGIApp, Receive, Scope, Send
import structlog, uuid

class StructlogMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=str(uuid.uuid4()),
            path=scope.get("path", ""),
            method=scope.get("method", ""),
            client_addr=scope.get("client", ("unknown", 0))[0],
        )
        await self.app(scope, receive, send)
```

### Development setup (ConsoleRenderer)

```python
import structlog, logging, sys
from fastapi import FastAPI

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logging.basicConfig(format="%(message)s", stream=sys.stdout, level=logging.INFO)

# Uvicorn loggers must propagate to root
for name in ["uvicorn", "uvicorn.access", "uvicorn.error"]:
    logging.getLogger(name).handlers.clear()
    logging.getLogger(name).propagate = True

app = FastAPI()
app.add_middleware(StructlogMiddleware)
```

### Production setup (JSON + ProcessorFormatter + uvicorn)

```python
timestamper = structlog.processors.TimeStamper(fmt="iso")
shared_processors = [
    structlog.contextvars.merge_contextvars,
    structlog.stdlib.add_log_level,
    structlog.stdlib.add_logger_name,
    structlog.stdlib.PositionalArgumentsFormatter(),
    timestamper,
    structlog.processors.StackInfoRenderer(),
    structlog.processors.format_exc_info,
    structlog.processors.UnicodeDecoder(),
]

structlog.configure(
    processors=shared_processors + [
        structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
    ],
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)

formatter = structlog.stdlib.ProcessorFormatter(
    foreign_pre_chain=shared_processors,
    processors=[
        structlog.stdlib.ProcessorFormatter.remove_processors_meta,
        structlog.processors.JSONRenderer(),
    ],
)

handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(formatter)
root_logger = logging.getLogger()
root_logger.addHandler(handler)
root_logger.setLevel(logging.INFO)

for name in ["uvicorn", "uvicorn.access", "uvicorn.error"]:
    logging.getLogger(name).handlers.clear()
    logging.getLogger(name).propagate = True

app = FastAPI()
app.add_middleware(StructlogMiddleware)
```

### Async logging in endpoints

```python
@app.get("/items/{item_id}")
async def get_item(item_id: str):
    logger = structlog.get_logger().bind(item_id=item_id)
    await logger.ainfo("fetching item")       # processor chain runs in thread pool
    await logger.ainfo("item fetched", status="ok")
    return {"item_id": item_id}
```

## Key APIs (Summary)

### Contextvars lifecycle (middleware pattern)

| Step | Call | When |
|------|------|------|
| 1. Reset | `structlog.contextvars.clear_contextvars()` | Start of every request |
| 2. Bind | `structlog.contextvars.bind_contextvars(request_id=..., path=..., ...)` | After reset, in middleware |
| 3. Merge | `structlog.contextvars.merge_contextvars` (processor) | Automatic — put first in chain |
| 4. Use | `structlog.get_logger().info(...)` | Any module — context auto-included |

### Uvicorn logger override

```python
for name in ["uvicorn", "uvicorn.access", "uvicorn.error"]:
    logging.getLogger(name).handlers.clear()
    logging.getLogger(name).propagate = True
```

This forces uvicorn's internal logs to bubble to the root logger, where `ProcessorFormatter` (or your configured handler) formats them consistently with your app logs.

### Async logging methods (BoundLogger, since 23.1.0)

`await logger.ainfo()`, `await logger.adebug()`, `await logger.awarning()`, `await logger.aerror()`, `await logger.acritical()`, `await logger.aexception()`

These run the processor chain in a thread pool executor. Mix sync and async freely.

## Caveats

- **Starlette hybrid context isolation (CRITICAL)**: Context variables set in sync code **do not appear** in async logs and vice versa. This is a Python `contextvars` limitation. If your middleware sets context in one concurrency mode and the endpoint runs in another, the context is invisible. Use pure ASGI middleware (not `BaseHTTPMiddleware`) and bind context **before** any `await`.
- **Avoid `BaseHTTPMiddleware`**: Starlette's `BaseHTTPMiddleware` uses `anyio` which can break contextvar propagation. Prefer raw ASGI middleware as shown above.
- **Uvicorn loggers must be cleared**: Uvicorn configures its own handlers. Clear them and set `propagate = True` or uvicorn logs won't go through your structlog formatter.
- **Dual configuration**: Both `structlog.configure()` and `logging` setup are required. This is not FastAPI-specific — see the `structlog-stdlib` skill.
- **Never mix `render_to_log_kwargs` with `ProcessorFormatter.wrap_for_formatter`**: Use one integration approach consistently.
- **`ainfo()` overhead**: Async methods add thread pool overhead per log entry. For high-throughput endpoints with cheap formatting, sync methods are fine.
- **Duplicate access logs**: If your middleware logs requests AND uvicorn.access is at INFO+, you get duplicate entries. Either suppress uvicorn.access or don't log in middleware.
- **Context bound before await sticks**: In pure ASGI middleware, context is bound synchronously before the `await self.app(...)` call, so it's in the sync context. The `merge_contextvars` processor merges it — this works because the processor runs in whatever context the log call is made from, and the contextvars are stored per-context. The binding itself happens in sync context. If your endpoint is async and calls `log.info()` (sync), the processor runs in async context and may not see sync-bound vars. Use `await logger.ainfo()` to ensure processing stays in the async context.

## Composition Hints

- **Structure**: `configure()` at startup → middleware → endpoint handlers use `structlog.get_logger()` with optional local `.bind()`.
- **`merge_contextvars` must be first** in the processor chain so context is available to all downstream processors (timestamper, log level, etc.).
- **For hybrid sync/async apps**: If you can't avoid the isolation issue, fall back to explicit `.bind()` in each handler rather than relying on middleware-set contextvars.
- **Combine with `structlog-stdlib` skill**: The production setup here is approach 4 (ProcessorFormatter) from the stdlib skill. Read that skill for deeper understanding of `foreign_pre_chain`, `ProcessorFormatter.remove_processors_meta`, and `dictConfig` variants.
- **Health check endpoints**: Skip context binding for `/health` or `/metrics` by checking `scope["path"]` in middleware to reduce noise.
