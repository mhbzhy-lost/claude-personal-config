---
name: httpx-client
description: Advanced Client usage — connection pooling, config sharing, HTTP/2, progress monitoring, and explicit request control.
tech_stack: [httpx]
language: [python]
capability: [http-client, performance, file-upload]
version: "httpx unversioned"
collected_at: 2025-01-01
---

# HTTPX Client

> Source: https://www.python-httpx.org/advanced/clients/, https://www.python-httpx.org/http2/

## Purpose
`httpx.Client` provides connection pooling, persistent configuration, cookie persistence, HTTP/2, and proxy support. It is the recommended API for everything beyond one-off scripts. Equivalent to `requests.Session()`.

## When to Use
Use `Client` for:
- Multiple requests to the same host (connection reuse)
- Shared default headers/auth/params across requests
- Cookie persistence across requests
- HTTP/2 (`http2=True`, needs `pip install httpx[http2]`)
- Download/upload progress monitoring
- Explicit `Request` instance construction and dispatch

Do NOT use `Client` for a single one-off request — top-level `httpx.get()` is fine.

## Basic Usage

### Instantiation and lifecycle
```python
# Recommended: context manager (auto-cleanup)
with httpx.Client() as client:
    r = client.get('https://example.com')

# Manual close:
client = httpx.Client()
try:
    ...
finally:
    client.close()

# With shared defaults:
with httpx.Client(
    headers={'user-agent': 'my-app/0.0.1'},
    params={'api_version': 'v1'},
    auth=('user', 'pass'),
    base_url='https://api.example.com',
    http2=True,                # requires httpx[http2]
) as client:
    r = client.get('/users')   # → https://api.example.com/users?api_version=v1
```

All methods available on the top-level API (`get`, `post`, `put`, `delete`, `head`, `options`, `patch`, `stream`, `send`) work identically on `Client`.

## Key APIs (Summary)

### Configuration merging rules
- **Headers, params, cookies**: COMBINED (client-level + request-level)
- **auth, timeout, follow_redirects, etc.**: request-level OVERRIDES client-level

```python
with httpx.Client(headers={'X-Auth': 'from-client'}) as client:
    r = client.get(url, headers={'X-Custom': 'from-request'})
    # r.request.headers has BOTH X-Auth and X-Custom

with httpx.Client(auth=('tom', 'pass1')) as client:
    r = client.get(url, auth=('alice', 'pass2'))
    # alice:pass2 wins
```

### Explicit Request instances
```python
# Build and dispatch separately:
request = httpx.Request("GET", "https://example.com")
with httpx.Client() as client:
    response = client.send(request)

# build_request() applies client defaults, then you can mutate:
with httpx.Client(headers={"X-Api-Key": "sk-..."}) as client:
    req = client.build_request("GET", "https://api.example.com")
    del req.headers["X-Api-Key"]  # suppress for this one request
    resp = client.send(req)
```

### HTTP/2
```python
# Install: pip install httpx[http2]
# Enable on client — negotiated, falls back to HTTP/1.1 if server doesn't support it:
with httpx.Client(http2=True) as client:
    r = client.get('https://example.com')
    print(r.http_version)  # "HTTP/1.0", "HTTP/1.1", or "HTTP/2"
```

### Download progress
Use `r.num_bytes_downloaded` — the correct metric (accounts for transport compression):
```python
with httpx.stream("GET", url) as r:
    total = int(r.headers["Content-Length"])
    for chunk in r.iter_bytes():
        downloaded = r.num_bytes_downloaded  # accurate byte count
        ...
```

### Upload progress
Use a sync generator for `content=` and track `len(data)`:
```python
def upload_gen():
    with open('large.bin', 'rb') as f:
        while data := f.read(1024):
            yield data
            # track progress via len(data)

httpx.post(url, content=upload_gen())
```

### Multipart file encoding (advanced)
Tuple format: `(filename, file_obj_or_str, content_type?)` — 2 or 3 elements.

```python
# Explicit filename + MIME:
files = {'file': ('report.xls', file_obj, 'application/vnd.ms-excel')}

# No filename → no Content-Type MIME header:
files = {'field': (None, 'text content', 'text/plain')}

# Multiple files under same field (use list, not dict):
files = [
    ('images', ('foo.png', foo_file, 'image/png')),
    ('images', ('bar.png', bar_file, 'image/png')),
]
```

File uploads are streamed by default — only one chunk in memory at a time.

## Caveats
- Top-level API creates a **new connection for every request** — use `Client` for efficiency.
- Always close the client (context manager or `.close()`) or connections leak.
- HTTP/2 is opt-in and server-negotiated; check `r.http_version` to confirm.
- `r.num_bytes_downloaded` is the correct download-progress metric; raw chunk sizes can be misleading due to decompression.
- `client.build_request()` already applies client defaults to the returned `Request`.
- Multipart tuple with `filename=None` suppresses the Content-Type MIME header entirely.

## Composition Hints
- Combine with `httpx-core` for basic request/response patterns — `Client` methods mirror the top-level API.
- Combine with `httpx-async` — use `httpx.AsyncClient(http2=True)` for concurrent async HTTP/2 workloads.
- For testing: `httpx.Client(transport=httpx.MockTransport(handler))` to mock HTTP without network.
- Use `base_url` to avoid repeating the same base across many endpoint calls.
- For fine-grained merge control, use `build_request()` → mutate → `send()`.
