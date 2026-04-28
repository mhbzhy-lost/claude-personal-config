---
name: httpx-api
description: API reference for HTTPX — helper functions, Client, AsyncClient, Response, Request, URL, Headers, Cookies, Proxy, and key version-specific caveats.
tech_stack: [httpx]
language: [python]
version: "httpx 0.28.1"
collected_at: 2024-12-06
---

# HTTPX API Reference

> Source: https://www.python-httpx.org/api/, https://raw.githubusercontent.com/encode/httpx/master/CHANGELOG.md

## Purpose

HTTPX is a modern HTTP client for Python with sync and async support, HTTP/2, connection pooling, and a clean API. This skill covers the full public API surface: helper functions, `Client`/`AsyncClient`, and the data models (`Response`, `Request`, `URL`, `Headers`, `Cookies`, `Proxy`).

## When to Use

- **`httpx.get/post/...` functions** — quick scripts, REPL exploration, one-off requests. Stateless; no connection reuse.
- **`httpx.Client`** — any application making multiple requests. Provides connection pooling, HTTP/2, shared configuration, cookie persistence across redirects.
- **`httpx.AsyncClient`** — async applications (asyncio/trio). Same benefits as `Client` plus concurrent request support.
- **`httpx.stream`** — when response bodies are too large to load into memory.

## Basic Usage

```python
# Helper function (one-shot)
import httpx
r = httpx.get("https://httpbin.org/get")
print(r.status_code, r.json())

# Client (reuse connections, shared config)
with httpx.Client(base_url="https://api.example.com", follow_redirects=True) as client:
    r = client.get("/items")
    r = client.post("/items", json={"name": "new"})

# AsyncClient
async with httpx.AsyncClient() as client:
    r = await client.get("https://example.org")

# Streaming large responses
with httpx.stream("GET", "https://large.file") as r:
    for chunk in r.iter_bytes(chunk_size=65536):
        ...
```

## Key APIs (Summary)

### Two-Tier API

| Tier | Constructor | Use Case |
|------|-------------|----------|
| Top-level | `httpx.get()`, `.post()`, `.put()`, `.patch()`, `.delete()`, `.head()`, `.options()`, `.request()`, `.stream()` | Console, one-off |
| Client | `httpx.Client(...)` | Multi-request, pooling, HTTP/2 |
| Async | `httpx.AsyncClient(...)` | asyncio/trio, concurrent |

Configuration merging: Client-level `params`, `headers`, `cookies`, `auth`, `timeout`, `follow_redirects`, `base_url` are merged with per-request overrides. Per-request wins. `base_url` is merged with per-request URLs.

### Client Constructor

```python
httpx.Client(*, auth=None, params=None, headers=None, cookies=None,
    verify=True, cert=None, trust_env=True, http1=True, http2=False,
    proxy=None, mounts=None, timeout=Timeout(5.0),
    follow_redirects=False, limits=Limits(max_connections=100,
    max_keepalive_connections=20, keepalive_expiry=5.0),
    max_redirects=20, event_hooks=None, base_url="", transport=None,
    default_encoding="utf-8")
```

Mutable config on instance: `.headers`, `.cookies`, `.params`, `.auth` — merged into every request.

Key methods: `.request()`, `.get()`, `.post()`, `.put()`, `.patch()`, `.delete()`, `.head()`, `.options()`, `.stream()`, `.build_request()`, `.send()`, `.close()`

### AsyncClient

Identical constructor to `Client`. Must use `async with`. All request methods are `async`. Close with `await client.aclose()`.

### Response

Essential attributes: `.status_code`, `.headers`, `.text`, `.content`, `.json()`, `.url`, `.http_version`, `.elapsed`, `.history`, `.request`, `.cookies`, `.encoding`

Status-check properties: `.is_informational` (1xx), `.is_success` (2xx), `.is_redirect` (3xx), `.is_client_error` (4xx), `.is_server_error` (5xx)

```python
# Chain raise_for_status (returns self since 0.25.0)
data = httpx.get("...").raise_for_status().json()

# Streaming iterators (and async counterparts)
r.iter_bytes(chunk_size=...)   # r.aiter_bytes(...)
r.iter_text(chunk_size=...)    # r.aiter_text(...)
r.iter_lines()                 # r.aiter_lines() — no newlines included
```

### Request

```python
httpx.Request(method, url, params=..., headers=..., cookies=...,
              content=..., data=..., files=..., json=..., stream=...)
```

Build explicitly, send with `client.send(request)`. Can be pickled.

### URL

```python
httpx.URL("https://user:pass@example.org:443/path?q=1#frag")
```

Key attributes: `.scheme`, `.host` (unicode), `.raw_host` (IDNA bytes), `.port`, `.path`, `.query`, `.fragment`, `.params` (immutable `QueryParams`)

Port normalization: `:80` stripped from `http`, `:443` stripped from `https`.

```python
url.copy_with(path="/new-path")
url.copy_set_param("key", "val")
url.copy_add_param("key", "another")
url.copy_remove_param("key")
url.copy_merge_params({"a": "1"})
```

### Headers

Case-insensitive multi-dict: `Headers({"Content-Type": "application/json"})["content-type"]` → `"application/json"`. Use `.copy()` for mutation-safe duplication.

### Cookies

```python
cookies = Cookies()
cookies.set("name", "value", domain="example.org", path="/")
cookies.get("name", domain="example.org")
cookies.delete("name", domain="example.org")
cookies.clear(domain="example.org")
cookies.extract_cookies(response)   # populate from response
cookies.set_cookie_header(request)  # apply to outgoing request
```

### Proxy

```python
httpx.Proxy("http://proxy.example.com:8030", auth=("user", "pass"))
Client(proxy=proxy)  # or mounts= for per-scheme
```

### Other utilities

- `httpx.Timeout(timeout=5.0)` — default 5s
- `httpx.Limits(max_connections=100, max_keepalive_connections=20, keepalive_expiry=5.0)`
- `httpx.USE_CLIENT_DEFAULT` — sentinel for auth/timeout: "use client-level default"
- `httpx.MockTransport()` — testing
- `httpx.NetRCAuth()` — explicit netrc (not automatic since 0.24.0)
- `httpx.FunctionAuth` — custom auth callable (0.28+)

## Caveats

### Breaking Changes in 0.28.x

- **JSON body compact representation** — test suites may need updating.
- **`verify` as string deprecated**, **`cert` argument deprecated** — use revised SSL API.
- **`proxies` argument removed** — use `proxy=` or `mounts=`.
- **`app=...` shortcut removed** — use `transport=httpx.WSGITransport()` / `httpx.ASGITransport()`.

### Critical Behavioral Differences vs `requests`

- **`follow_redirects` defaults to `False`** (since 0.20.0). Enable explicitly.
- **`raise_for_status()` raises for ALL non-2xx** (not just 4xx/5xx).
- **Query encoding**: spaces → `%20` (not `+`), forward slash is safe (not `%2F`).
- **Default encoding is `utf-8`** — no automatic charset detection by default. Set `default_encoding` to a callable for auto-detect.
- **`Response.iter_lines()` omits newline characters** (matches stdlib).

### Other Pitfalls

- Set cookies on the **client**, not per-request — ensures predictable persistence across redirects.
- `QueryParams` is **immutable** — use `.merge()` / `.set()` / `.add()` / `.remove()`.
- Use `content=` not `data=` for bytes/str body (the latter is deprecated).
- Upload files must be opened in **binary mode**.
- `Response.encoding` raises `ValueError` if set after `.text` has been accessed.
- `NO_PROXY` supports fully qualified URLs and IP addresses.
- Digest auth uses case-insensitive algorithm comparison.

## Composition Hints

- **Client as base**: Create one `Client` (or `AsyncClient`) per target API host. Set `base_url`, `headers` (auth tokens), and `timeout` at client level.
- **Explicit Requests**: Use `client.build_request()` + `client.send()` when you need to inspect/modify the request before sending, or when you need per-request extensions.
- **Streaming**: Use `client.stream()` for large downloads; always close or use context manager.
- **Testing**: Use `httpx.MockTransport()` to inject fake responses without network calls.
- **WSGI/ASGI testing**: Use `transport=httpx.WSGITransport(app=...)` to test WSGI/ASGI apps directly.
