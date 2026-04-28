---
name: httpx-core
description: Core HTTPX usage — making requests, handling responses, parameters, streaming, auth, and error handling.
tech_stack: [httpx]
language: [python]
capability: [http-client, data-fetching, data-mutation]
version: "httpx unversioned"
collected_at: 2025-01-01
---

# HTTPX Core

> Source: https://www.python-httpx.org/quickstart/, https://www.python-httpx.org/

## Purpose
HTTPX is a modern, fully-featured HTTP client for Python 3.9+ with a `requests`-compatible API, plus async and HTTP/2 support. Install: `pip install httpx`.

## When to Use
- Any HTTP client work in Python (replaces `requests`)
- Streaming large downloads
- Typed codebases needing a well-annotated HTTP client
- Testing WSGI/ASGI apps directly (no server needed)

## Basic Usage

### Making requests
```python
import httpx

r = httpx.get('https://httpbin.org/get')
r = httpx.post('https://httpbin.org/post', data={'key': 'value'})
r = httpx.put('https://httpbin.org/put', data={'key': 'value'})
r = httpx.delete('https://httpbin.org/delete')
r = httpx.head('https://httpbin.org/get')
r = httpx.options('https://httpbin.org/get')
```

### Query parameters
```python
params = {'key1': 'value1', 'key2': ['value2', 'value3']}
r = httpx.get('https://httpbin.org/get', params=params)
r.url  # URL('https://httpbin.org/get?key1=value1&key2=value2&key2=value3')
```

### Response handling
```python
r.text         # decoded Unicode (auto-detects encoding)
r.encoding     # inspect/set encoding (None = auto-detect)
r.content      # raw bytes (gzip/deflate auto-decoded)
r.json()       # parse JSON body
r.status_code  # int, e.g. 200
r.headers      # case-insensitive dict-like Headers
r.url          # final URL after redirects
```

### Sending data
```python
# Form-encoded
httpx.post(url, data={'key1': 'value1'})

# JSON
httpx.post(url, json={'integer': 123, 'list': ['a','b','c']})

# Binary
httpx.post(url, content=b'Hello, world')

# Multipart file upload (streamed by default)
with open('report.xls', 'rb') as f:
    httpx.post(url, files={'upload-file': f})

# With explicit filename + MIME type:
files = {'upload-file': ('report.xls', f, 'application/vnd.ms-excel')}

# Mixed form fields + files:
httpx.post(url, data={'message': 'hello'}, files={'file': f})
```

### Headers, cookies, auth
```python
# Custom headers
httpx.get(url, headers={'user-agent': 'my-app/0.0.1'})

# Cookies (read)
r.cookies['chocolate']  # from response

# Cookies (send)
httpx.get(url, cookies={"peanut": "butter"})

# Domain-scoped cookies (only matching ones sent)
cookies = httpx.Cookies()
cookies.set('cookie_on_domain', 'hello', domain='httpbin.org')
cookies.set('cookie_off_domain', 'nope', domain='example.org')
httpx.get('http://httpbin.org/cookies', cookies=cookies)

# Basic auth
httpx.get(url, auth=("my_user", "password123"))

# Digest auth
httpx.get(url, auth=httpx.DigestAuth("my_user", "password123"))
```

### Status codes and error handling
```python
r.status_code == httpx.codes.OK      # True
r.raise_for_status()                  # raises HTTPStatusError on 4xx/5xx

# Inline pattern:
data = httpx.get('...').raise_for_status().json()

# Exception hierarchy:
# HTTPError (base) → RequestError (network issues) + HTTPStatusError (bad responses)
try:
    r = httpx.get("https://www.example.com/")
    r.raise_for_status()
except httpx.RequestError as exc:
    print(f"Request failed: {exc.request.url}")
except httpx.HTTPStatusError as exc:
    print(f"HTTP {exc.response.status_code} from {exc.request.url}")
```

### Streaming
```python
with httpx.stream("GET", "https://www.example.com") as r:
    for data in r.iter_bytes():     # binary chunks
        ...
    # r.iter_text()                 # text chunks
    # r.iter_lines()                # line-by-line (universal \n)
    # r.iter_raw()                  # raw bytes, no content decoding

    # Conditional read (only if small enough):
    if int(r.headers['Content-Length']) < TOO_LONG:
        r.read()
        print(r.text)
```

### Redirects and timeouts
```python
# Redirects: OFF by default
r = httpx.get('http://github.com/', follow_redirects=True)
r.history  # list of redirect responses in order

# Timeout: 5s default, can override
httpx.get(url, timeout=0.001)   # strict
httpx.get(url, timeout=None)     # disable
```

## Key APIs (Summary)
| API | Purpose |
|-----|---------|
| `httpx.get/post/put/delete/head/options(url, ...)` | Top-level convenience functions |
| `r.text`, `r.content`, `r.json()`, `r.status_code`, `r.headers`, `r.url` | Response accessors |
| `r.raise_for_status()` | Raise on 4xx/5xx, return self on 2xx |
| `httpx.stream(method, url)` | Context manager for streaming responses |
| `httpx.Cookies()` | Domain/path-scoped cookie jar |
| `httpx.DigestAuth(user, pass)` | Digest authentication handler |
| `httpx.RequestError`, `httpx.HTTPStatusError`, `httpx.HTTPError` | Exception classes |

## Caveats
- Redirects are **NOT followed by default** — pass `follow_redirects=True`.
- Default timeout is 5s inactivity; hanging ops need `timeout=None` or higher.
- When streaming, `r.content` and `r.text` are UNAVAILABLE — use `r.read()` first.
- `r.headers` merges duplicate header values into comma-separated strings (RFC 7230).
- HTTP/2 requires `pip install httpx[http2]`.
- Brotli/zstd decompression require `pip install httpx[brotli,zstd]`.

## Composition Hints
- For repeated requests to the same host, use `httpx.Client` (connection pooling) — see `httpx-client`.
- For async workloads, use `httpx.AsyncClient` — see `httpx-async`.
- For testing, use `httpx.Client(transport=httpx.WSGITransport(app=...))` to call WSGI/ASGI apps directly.
- Always call `r.raise_for_status()` when you need non-2xx to be an error — it returns `self` for chaining.
