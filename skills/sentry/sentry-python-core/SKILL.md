---
name: sentry-python-core
description: Initialize and configure the Sentry Python SDK for error monitoring, release tracking, and environment segmentation.
tech_stack: [observability]
language: [python]
capability: [observability]
version: "sentry-python-sdk unversioned"
collected_at: 2025-07-21
---

# Sentry Python SDK — Core

> Source: https://docs.sentry.io/platforms/python/, https://docs.sentry.io/platforms/python/configuration/options/, https://docs.sentry.io/platforms/python/configuration/releases/

## Purpose

The Sentry Python SDK (`sentry-sdk`) provides automatic error reporting and performance tracing for Python applications. A single `sentry_sdk.init()` call wired early in the application lifecycle enables exception capture, breadcrumb tracking, release/environment tagging, and optional PII collection — all configurable via keyword arguments and environment variables.

## When to Use

- Any Python application (web, CLI, async, scripts) that needs centralized error monitoring
- When you need to tag errors by **release** and **environment** for triage
- When you want to control error sampling (`sample_rate`, `error_sampler`), PII scrubbing (`send_default_pii`, `event_scrubber`, `before_send`), and stack trace fidelity (`attach_stacktrace`, `add_full_stack`, `in_app_include`)
- As a prerequisite for FastAPI, Django, Flask, and other framework integrations

## Basic Usage

**Install:**
```bash
pip install sentry-sdk
```

**Minimal init (place as early as possible):**
```python
import sentry_sdk

sentry_sdk.init(
    dsn="https://examplePublicKey@o0.ingest.sentry.io/0",
    traces_sample_rate=1.0,
)
```

**With release, environment, and PII:**
```python
sentry_sdk.init(
    dsn="...",
    release="myapp@1.0.0",
    environment="production",
    send_default_pii=True,
    traces_sample_rate=1.0,
)
```

**Async programs — init inside the first async function:**
```python
import asyncio
import sentry_sdk

async def main():
    sentry_sdk.init(dsn="...", traces_sample_rate=1.0)
    # ...

asyncio.run(main())
```

**Verify with a deliberate error:**
```python
division_by_zero = 1 / 0
```

## Key APIs (Summary)

### Essential options with env-var fallback

| Option | ENV | Default | Purpose |
|--------|-----|---------|---------|
| `dsn` | `SENTRY_DSN` | `None` | Where to send events; SDK silent if unset |
| `release` | `SENTRY_RELEASE` | auto-detect | Version string; auto-falls-back to Git SHA or provider env vars |
| `environment` | `SENTRY_ENVIRONMENT` | `production` | Freeform label to segment staging vs prod |
| `debug` | `SENTRY_DEBUG` | `False` | Verbose SDK logging (not for production) |
| `spotlight` | `SENTRY_SPOTLIGHT` | `None` | Sidecar debugging; `True` → `http://localhost:8969/stream` |

### Sampling

| Option | Signature | Behavior |
|--------|-----------|----------|
| `sample_rate` | `float 0.0–1.0` | Uniform error sampling; default `1.0` |
| `error_sampler` | `(event, hint) -> bool \| float 0–1` | Per-event sampling; **overrides `sample_rate`** |
| `traces_sample_rate` | `float 0.0–1.0` | Uniform transaction sampling; **required** to enable tracing |
| `traces_sampler` | `(sampling_context) -> float 0–1` | Dynamic transaction sampling; overrides `traces_sample_rate` |

### Lifecycle hooks (all return `None` to drop)

| Hook | Signature |
|------|-----------|
| `before_send` | `(event, hint) -> event \| None` |
| `before_send_transaction` | `(transaction, hint) -> transaction \| None` |
| `before_breadcrumb` | `(breadcrumb, hint) -> breadcrumb \| None` |
| `before_send_log` | `(log, hint) -> log \| None` *(SDK ≥ 2.35.0)* |

### Stack trace & in-app control

| Option | Default | Effect |
|--------|---------|--------|
| `include_source_context` | `True` | ±5 lines of source around error |
| `include_local_variables` | `True` | Snapshot locals in event |
| `attach_stacktrace` | `False` | Stack traces on messages too (**changes grouping**) |
| `add_full_stack` | `False` | All frames from execution start (**changes grouping**) |
| `max_stack_frames` | `100` | Cap when `add_full_stack=True` |
| `in_app_include` / `in_app_exclude` | `[]` | Module prefixes to mark / hide from in-app view |
| `project_root` | `os.getcwd()` | Root path for in-app detection |

### Integration toggles

| Option | Default | Effect |
|--------|---------|--------|
| `integrations` | `[]` | Extra integrations or overrides for auto-enabled ones |
| `disabled_integrations` | `[]` | Explicitly block specific integrations |
| `auto_enabling_integrations` | `True` | `False` disables all framework-detected integrations |
| `default_integrations` | `True` | `False` disables **all** default + auto integrations |

### Data safety

| Option | Default | Purpose |
|--------|---------|---------|
| `send_default_pii` | `None` | Enable PII attachment by integrations |
| `event_scrubber` | `None` | Deny-list scrubber for cookies/sessions/passwords |
| `max_request_body_size` | `medium` | `never` / `small` (~4 KB) / `medium` (~10 KB) / `always` |
| `max_value_length` | `100000` | Truncation threshold (was `1024` before 2.34.0) |
| `ignore_errors` | `[]` | Exception class names to drop (subclasses included) |
| `max_breadcrumbs` | `100` | Breadcrumb cap; exceed max payload → event dropped |

## Caveats

- **Release naming**: no `/`, `\`, newlines, tabs; not exactly `.`/`..`/space; ≤200 chars. Prefer `package@version`.
- **Grouping breaks**: toggling `attach_stacktrace` or `add_full_stack` creates **new issue groups** for existing errors.
- **Tracing requires explicit opt-in**: `traces_sample_rate` or `traces_sampler` must be set — no default.
- **`error_sampler` fully replaces `sample_rate`** — not additive.
- **`default_integrations=False`** also disables `auto_enabling_integrations`.
- **`max_value_length`** jumped from 1024 → 100000 in 2.34.0; upgrade may increase payload size.
- **Async**: call `init()` inside an `async def` for correct async instrumentation.
- **Release health**: notify Sentry of the release **before** sending events to unlock regression detection and commit association.

## Composition Hints

- Pair with **sentry-python-fastapi** or **sentry-python-django** for framework-level request/error capture.
- Pair with **sentry-python-performance** to go beyond `traces_sample_rate` into custom spans, distributed tracing, and dynamic sampling.
- `before_send` + `event_scrubber` together form a defense-in-depth PII strategy.
- Use `traces_sampler` (not `traces_sample_rate`) when you need to drop health-check transactions or vary sampling by endpoint.
