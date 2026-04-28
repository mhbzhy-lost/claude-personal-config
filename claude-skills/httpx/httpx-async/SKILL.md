---
name: httpx-async
description: Async HTTPX usage with AsyncClient — async/await patterns, concurrent requests, streaming, and asyncio/trio/anyio integration.
tech_stack: [httpx]
language: [python]
capability: [http-client, performance]
version: "httpx unversioned"
collected_at: 2025-01-01
---

# HTTPX Async

> Source: https://www.python-httpx.org/async/

## Purpose
`httpx.AsyncClient` provides the full HTTPX feature set with async/await concurrency. It auto-detects the async backend: asyncio (built-in), trio (`pip install trio`), or anyio. Async concurrency is more efficient than threading for I/O-bound HTTP workloads.

## When to Use
- Async web frameworks (FastAPI, Starlette, etc.)
- Many concurrent HTTP requests where async yields performance gains
- Long-lived connections (WebSockets, SSE, streaming)
- HTTP/2 with high concurrency (`AsyncClient(http2=True)`)

## Basic Usage

### Making requests
```python
import httpx
import asyncio

async def main():
    async with httpx.AsyncClient() as client:
        r = await client.get('https://www.example.com/')
        print(r)

asyncio.run(main())
```

All methods are async and must be awaited: `get`, `options`, `head`, `post`, `put`, `patch`, `delete`, `request`, `send`.

### Client lifecycle
```python
# Recommended: async context manager
async with httpx.AsyncClient() as client:
    ...

# Manual close:
client = httpx.AsyncClient()
try:
    ...
finally:
    await client.aclose()
```

**Critical**: Do NOT create new `AsyncClient` instances inside hot loops — connection pooling requires a single shared instance. Pass the client around or use a global.

## Key APIs (Summary)

### Async streaming responses
```python
async with httpx.AsyncClient() as client:
    async with client.stream('GET', 'https://www.example.com/') as r:
        async for chunk in r.aiter_bytes():     # bytes
            ...
        # r.aiter_text()    — text chunks
        # r.aiter_lines()   — line-by-line
        # r.aiter_raw()     — raw bytes, no content decoding
        # await r.aread()   — conditional read inside stream block
```

### Manual streaming mode (no context manager)
Use `client.send(..., stream=True)` when context-managed streaming is impractical. **You must call `await r.aclose()`**:

```python
client = httpx.AsyncClient()

async def proxy_endpoint(request):
    req = client.build_request("GET", "https://upstream.example.com/")
    r = await client.send(req, stream=True)
    return StreamingResponse(
        r.aiter_text(),
        background=BackgroundTask(r.aclose)  # MANDATORY cleanup
    )
```

### Async request body streaming
Use an **async** generator (not sync) for `content=`:
```python
async def upload_bytes():
    for chunk in ...:
        yield chunk

await client.post(url, content=upload_bytes())
```

### Explicit transport
```python
transport = httpx.AsyncHTTPTransport(retries=1)
async with httpx.AsyncClient(transport=transport) as client:
    ...
```

### Backend selection
HTTPX auto-detects via `sniffio`. Explicit control:

```python
# asyncio (built-in, default)
asyncio.run(main())

# trio (requires pip install trio)
import trio
trio.run(main)

# anyio (choose backend)
import anyio
anyio.run(main, backend='trio')
```

## Caveats
- `AsyncClient` MUST be used with `async with` or closed via `await client.aclose()`.
- Do NOT instantiate inside hot loops — use one shared client instance.
- Manual streaming (`send(..., stream=True)`) requires explicit `await r.aclose()` — leaks otherwise.
- Async streaming uses `aiter_*` methods, NOT `iter_*` (which are sync-only).
- Streaming request bodies must use an **async** bytes generator with `AsyncClient`.
- Use `httpx.AsyncHTTPTransport` (not `HTTPTransport`) for explicit async transports.
- Trio backend requires `pip install trio`.
- IPython or `python -m asyncio` (3.9+) support top-level `await` for interactive use.

## Composition Hints
- Combine with `httpx-core` — all request/response patterns are identical, just with `await`.
- Combine with `httpx-client` — `AsyncClient` supports the same `base_url`, `headers`, `auth`, config merging as `Client`.
- For maximum concurrent throughput: `AsyncClient(http2=True)` + `asyncio.gather()` with multiple `client.get()` calls.
- For FastAPI/Starlette: create one `AsyncClient` at app startup, close at shutdown (lifespan pattern).
- For testing: `httpx.AsyncClient(transport=httpx.ASGITransport(app=...))` to call ASGI apps directly.
