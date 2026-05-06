---
name: web-scraping-curl-cffi-tls-fingerprint
description: JA3/JA4 TLS fingerprint impersonation via curl_cffi to simulate real browser TLS signatures and bypass anti-bot detection.
tech_stack: [http]
language: [python]
capability: [http-client]
version: "curl_cffi v0.15.1+"
collected_at: 2025-01-01
---

# curl_cffi — TLS Fingerprint Impersonation

> Source: https://curl-cffi.readthedocs.io/en/latest/, https://curl-cffi.readthedocs.io/en/latest/impersonate/

## Purpose
curl_cffi is a Python binding for the `curl-impersonate` fork (via cffi) that impersonates browser TLS signatures — JA3 and JA4 fingerprints — at the network layer. Unlike pure-Python HTTP clients (requests, httpx), it patches the TLS handshake to match real Chrome, Safari, Edge, or Firefox browsers, making requests appear to originate from a legitimate browser.

## When to Use
- Target website blocks standard HTTP clients (requests/httpx) due to JA3/JA4 fingerprint mismatch.
- Need HTTP/2 or HTTP/3 combined with browser-grade TLS impersonation.
- Need async HTTP client with per-request proxy rotation and impersonation.
- Need a drop-in `requests`-compatible API with anti-detection.
- Need WebSocket connections that carry impersonated TLS fingerprints.

## Basic Usage

```python
# Synchronous — drop-in requests replacement
from curl_cffi import requests

resp = requests.get(
    "https://example.com",
    impersonate="chrome120"       # impersonate Chrome 120 TLS fingerprint
)
print(resp.status_code, resp.text)

# With a persistent session
session = requests.Session()
session.get("https://example.com", impersonate="safari17_0")

# Async with proxy rotation
from curl_cffi.requests import AsyncSession

async with AsyncSession() as s:
    resp = await s.get(
        "https://example.com",
        impersonate="chrome120",
        proxy="http://user:pass@proxy:8080"
    )
```

## Key APIs (Summary)

| API | Notes |
|-----|-------|
| `curl_cffi.requests.get/post/put/...` | Drop-in `requests`-compatible functions. Accept `impersonate=` kwarg. |
| `curl_cffi.requests.Session` | Persistent session with cookie jar and connection pooling. |
| `curl_cffi.requests.AsyncSession` | Async variant with per-request proxy rotation. |
| `impersonate=` parameter | Target browser: `"chrome110"`, `"chrome120"`, `"safari17_0"`, `"edge101"`, `"firefox117"`, etc. |
| Fingerprint updates (v0.15.1+) | CLI tool to load/update/edit fingerprints without reinstalling the package. |
| Transport adapters | Use curl_cffi as an `httpx` transport or `urllib3`/`requests` adapter. |
| `CURLOPT_*` access | Low-level curl options exposed through the requests API for fine-grained control. |
| Cookie management | `session.cookies` — save/load cookies across runs. |

## Caveats
- **No Cloudflare guarantee**: curl_cffi does not guarantee bypassing Cloudflare or any specific site — it's one layer of the anti-detection stack.
- **ErrCode 77**: Certificate verification failure. Fix with proper CA bundle path.
- **ErrCode 92**: `HTTP/2 stream 0 was not closed cleanly: PROTOCOL_ERROR` — HTTP/2 protocol negotiation mismatch; try a different `impersonate` target or fall back to HTTP/1.1.
- **Chrome 110+ JA3 drift**: Chrome 110+ JA3 fingerprints change dynamically per connection; not a bug in curl_cffi.
- **Header order matters**: Some sites check header ordering; adjust manually if needed.
- **Encoding errors**: Non-UTF-8 responses may need manual decoding handling.
- **PyInstaller packaging**: Extra steps required to bundle pre-compiled curl_cffi wheels.

## Composition Hints
- **With Playwright stealth**: Use curl_cffi for API-level requests after Playwright handles the initial login/browser challenge (combine with `web-scraping-playwright-stealth-patchright`).
- **With session persistence**: Export curl_cffi cookies to httpx cookie jars for bidirectional state sharing (combine with `web-scraping-session-state-persistence`).
- **With rate limiting**: Layer exponential-backoff pacing on top of curl_cffi requests (combine with `web-scraping-rate-limiting-pacing`).
- **As httpx transport**: For codebases already on httpx, use `curl_cffi.requests.adapters.HTTPXTransport` to upgrade TLS fingerprinting without rewriting request logic.
