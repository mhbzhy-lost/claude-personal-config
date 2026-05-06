---
name: structlog-stdlib
description: Integrate structlog with Python standard library logging — four approaches from simple string-passing to full ProcessorFormatter multiplexing.
tech_stack: [structlog]
language: [python]
capability: [observability]
version: "structlog 25.x"
collected_at: 2025-07-17
---

# structlog + Standard Library logging

> Source: https://www.structlog.org/en/stable/standard-library.html, https://www.structlog.org/en/stable/configuration.html, https://www.structlog.org/en/stable/processors.html

## Purpose

structlog is designed as a drop-in replacement for stdlib `logging`. Replace `logging.getLogger()` with `structlog.get_logger()` and — with correct configuration — things work. This skill covers the four integration approaches, stdlib-specific processors, `ProcessorFormatter`, `LoggerFactory`, `BoundLogger`, async logging, and `dictConfig`-based multi-handler setups.

## When to Use

- Integrating structlog into existing codebases that already use stdlib `logging` heavily
- Getting structured JSON output while third-party libraries still use `logging`
- Using `logging.config.dictConfig` for complex multi-handler setups (e.g., colored console + plain JSON file)
- When you need async logging (`ainfo`/`adebug`) with stdlib integration

## Basic Usage

### Quick start — `recreate_defaults()`

```python
import structlog
structlog.stdlib.recreate_defaults()  # one call, sensible defaults on top of logging
```

### You MUST configure BOTH systems

structlog does not configure stdlib `logging` for you. Minimal logging setup:

```python
import logging, sys
logging.basicConfig(format="%(message)s", stream=sys.stdout, level=logging.INFO)
```

### Core building blocks

```python
structlog.configure(
    logger_factory=structlog.stdlib.LoggerFactory(),   # creates logging.Logger
    wrapper_class=structlog.stdlib.BoundLogger,         # mirrors logging.Logger API
    cache_logger_on_first_use=True,
)
```

## Key APIs (Summary)

### The four integration approaches

| # | Approach | Last processor | Who renders? | Best for |
|---|----------|---------------|--------------|----------|
| 1 | **Don't integrate** | — | — | Third-party logs are rare; configure logging separately to match structlog's format |
| 2 | **Render within structlog** | `JSONRenderer()` etc. | structlog | Simplest; structlog passes strings to logging; your app logs are structured, third-party logs are plain |
| 3 | **Render within logging** | `render_to_log_kwargs` | logging formatter | structlog builds the dict, logging's formatter (e.g., `python-json-logger`) renders it |
| 4 | **ProcessorFormatter** | `ProcessorFormatter.wrap_for_formatter` | structlog via logging | Both structlog AND third-party logs get identical structured formatting |

### Approach 2: Render within structlog (most common)

```python
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.CallsiteParameterAdder({
            structlog.processors.CallsiteParameter.FILENAME,
            structlog.processors.CallsiteParameter.FUNC_NAME,
            structlog.processors.CallsiteParameter.LINENO,
        }),
        structlog.processors.JSONRenderer()
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)
logging.basicConfig(format="%(message)s", stream=sys.stdout, level=logging.INFO)
```

### Approach 4: ProcessorFormatter (unified output)

```python
timestamper = structlog.processors.TimeStamper(fmt="%Y-%m-%d %H:%M:%S")
shared_processors = [structlog.stdlib.add_log_level, timestamper]

structlog.configure(
    processors=shared_processors + [
        structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
    ],
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

formatter = structlog.stdlib.ProcessorFormatter(
    foreign_pre_chain=shared_processors,          # runs ONLY on non-structlog entries
    processors=[
        structlog.stdlib.ProcessorFormatter.remove_processors_meta,
        structlog.dev.ConsoleRenderer(),           # or JSONRenderer() for prod
    ],
)

handler = logging.StreamHandler()
handler.setFormatter(formatter)
root_logger = logging.getLogger()
root_logger.addHandler(handler)
root_logger.setLevel(logging.INFO)
```

### Stdlib-specific processors (all in `structlog.stdlib`)

| Processor | What it does | Position |
|-----------|-------------|----------|
| `filter_by_level()` | Drop entries below configured logging level | **First** |
| `add_logger_name()` | Add `logger` key with logger name | Early |
| `add_log_level()` | Add `level` name | Early |
| `add_log_level_number()` | Add `level_number` (30=WARNING, 40=ERROR…) | Early |
| `PositionalArgumentsFormatter()` | `%s`-style interpolation: `log.info("Hello %s", name)` | Before rendering |
| `ExtraAdder` | Add `logging.LogRecord`'s `extra` dict to event dict | Early |
| `render_to_log_kwargs()` | event→`msg`, rest→`extra` dict (for approach 3) | **Last** |
| `render_to_log_args_and_kwargs()` | Same + positional args support (for approach 3) | **Last** |
| `ProcessorFormatter.wrap_for_formatter()` | Prepares event dict for ProcessorFormatter (approach 4) | **Last** |
| `ProcessorFormatter.remove_processors_meta` | Strip `_from_structlog` and `_record` from output | In formatter chain |

### ProcessorFormatter arguments

- **`processors`**: chain for rendering ALL entries to strings (structlog + non-structlog)
- **`foreign_pre_chain`**: processors that run ONLY on entries NOT from structlog — add timestamp/level to plain `logging` calls so output is consistent
- **`keep_processors_meta`**: keep `_from_structlog` + `_record` in event dict (default `True`; set `False` or use `remove_processors_meta`)

The `_record` key gives access to `logging.LogRecord` for extracting thread name, process name, etc.

### dictConfig with multiple formatters

```python
logging.config.dictConfig({
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "plain": {
            "()": structlog.stdlib.ProcessorFormatter,
            "processors": [
                structlog.stdlib.ProcessorFormatter.remove_processors_meta,
                structlog.dev.ConsoleRenderer(colors=False),
            ],
            "foreign_pre_chain": pre_chain,
        },
        "colored": {
            "()": structlog.stdlib.ProcessorFormatter,
            "processors": [
                extract_from_record,               # custom: extract thread/process from _record
                structlog.stdlib.ProcessorFormatter.remove_processors_meta,
                structlog.dev.ConsoleRenderer(colors=True),
            ],
            "foreign_pre_chain": pre_chain,
        },
    },
    "handlers": {
        "default": {"class": "logging.StreamHandler", "formatter": "colored"},
        "file": {"class": "logging.handlers.WatchedFileHandler", "filename": "test.log", "formatter": "plain"},
    },
    "loggers": {"": {"handlers": ["default", "file"], "level": "DEBUG"}},
})
# Then configure structlog with ProcessorFormatter.wrap_for_formatter as last processor
```

### Async logging

Default `BoundLogger` has both sync and async methods (since 23.1.0):

```python
logger.info("sync")        # blocks during processor chain
await logger.ainfo("async") # processor chain runs in thread pool executor
```

Mix freely. `AsyncBoundLogger` (all-async) is deprecated.

## Caveats

- **Double configuration is mandatory**: `structlog.configure()` AND `logging.basicConfig()`/`dictConfig()`. structlog never touches the logging system.
- **`render_to_log_kwargs` puts context in `extra`**: The stdlib formatter MUST render `extra` or context silently vanishes. This is the #1 cause of "my context disappeared" bugs.
- **Never mix `render_to_log_kwargs` with `ProcessorFormatter.wrap_for_formatter`**: Puzzling errors from stdlib. Pick one approach.
- **`WriteLogger` for shared streams**: If structlog and `logging.StreamHandler` both write to `sys.stdout`, interleaving occurs because `print()` writes message + newline separately. Use `WriteLogger` (writes atomically).
- **`_from_structlog` / `_record` leakage**: ProcessorFormatter adds these to every event. Use `remove_processors_meta` to strip them.
- **`AsyncBoundLogger` deprecated since 23.1.0**: Use default `BoundLogger` with `ainfo()`/`adebug()` instead.

## Composition Hints

- **Start with approach 2** (render within structlog) — simplest, covers 80% of cases. Upgrade to approach 4 (ProcessorFormatter) when third-party log formatting matters.
- **`filter_by_level` goes first** to avoid expensive processing of dropped entries. `merge_contextvars` goes right after (if using contextvars).
- **`foreign_pre_chain` should mirror structlog's pre-render processors** for consistent output between structlog and non-structlog entries.
- **Use `CallsiteParameterAdder`** to get filename/func/lineno in JSON — invaluable for debugging.
- **For uvicorn/FastAPI**, see the `structlog-fastapi` skill which extends approach 4 with ASGI middleware patterns.
