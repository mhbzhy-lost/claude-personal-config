---
name: web-scraping-rate-limiting-pacing
description: Exponential backoff with jitter, token-bucket throttling, and adaptive pacing for httpx and curl_cffi
tech_stack: [http]
language: [python]
capability: [http-client]
version: "cross-library pattern"
collected_at: 2025-01-01
---

# Rate Limiting & Request Pacing

> Source: https://www.python-httpx.org/quickstart/, https://curl-cffi.readthedocs.io/en/latest/

## Purpose

Control request frequency when scraping to avoid being blocked. Covers the three core pacing patterns — exponential backoff with jitter, token-bucket throttling, and adaptive pacing — across httpx (manual implementation) and curl_cffi (native retry support).

## When to Use

- Target servers return 429 (Too Many Requests) or 503 responses
- Building polite crawlers that self-throttle
- Large-scale scraping with coordinated pacing across workers or proxies
- Balancing speed against detection risk
- Proxy rotation scenarios where each proxy has independent rate limits

## Basic Usage

### Exponential Backoff with Jitter (httpx — manual)

```python
import httpx
import random
import time

def fetch_with_backoff(url, max_retries=5, base_delay=1.0):
    for attempt in range(max_retries):
        try:
            resp = httpx.get(url, timeout=10.0)
            if resp.status_code == 429:
                retry_after = resp.headers.get("Retry-After")
                delay = float(retry_after) if retry_after and retry_after.isdigit() \
                        else base_delay * (2 ** attempt) + random.uniform(0, 1)
                time.sleep(delay)
                continue
            resp.raise_for_status()
            return resp
        except (httpx.RequestError, httpx.HTTPStatusError) as exc:
            if attempt == max_retries - 1:
                raise
            delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
            time.sleep(delay)
```

### Token-Bucket Throttler

```python
import time
import asyncio

class TokenBucket:
    def __init__(self, rate: float, burst: int = 1):
        self.rate = rate          # tokens per second
        self.burst = burst
        self.tokens = burst
        self.last_refill = time.monotonic()

    async def acquire(self):
        while True:
            now = time.monotonic()
            elapsed = now - self.last_refill
            self.tokens = min(self.burst, self.tokens + elapsed * self.rate)
            self.last_refill = now
            if self.tokens >= 1:
                self.tokens -= 1
                return
            await asyncio.sleep(0.1)

# Usage: throttle to 2 requests/second
bucket = TokenBucket(rate=2.0, burst=3)
for url in urls:
    await bucket.acquire()
    resp = httpx.get(url)
```

### Retry-After Header Parsing

```python
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone

def parse_retry_after(headers) -> float:
    """Return delay in seconds from Retry-After header."""
    val = headers.get("Retry-After")
    if val is None:
        return None
    if val.isdigit():
        return float(val)
    # HTTP-date format
    dt = parsedate_to_datetime(val)
    return (dt - datetime.now(timezone.utc)).total_seconds()
```

### curl_cffi (native retry + proxy rotation)

```python
from curl_cffi import requests as curl_requests

# curl_cffi has native retry — ideal for rate-limited endpoints
resp = curl_requests.get("https://example.com", impersonate="chrome110")

# Async with per-request proxy rotation
import asyncio
from curl_cffi.requests import AsyncSession

async def fetch_with_proxies(urls, proxies):
    async with AsyncSession() as s:
        tasks = []
        for url, proxy in zip(urls, proxies):
            tasks.append(s.get(url, proxy=proxy, impersonate="chrome110"))
        return await asyncio.gather(*tasks)
```

## Key APIs (Summary)

| Library | Native Retry | Async | Proxy Rotation | Best For |
|----------|-------------|-------|----------------|----------|
| httpx | ❌ (manual) | ✅ | ❌ (manual) | Simple backoff, streaming |
| curl_cffi | ✅ | ✅ | ✅ (per-request) | High-volume, fingerprint+pace |

**httpx key methods**: `httpx.get(url, timeout=N)`, `resp.raise_for_status()`, `resp.status_code`, `resp.headers["Retry-After"]`, `httpx.stream()` for backpressure

**curl_cffi key**: `requests.get(url, impersonate="chrome110")`, `AsyncSession` for async with proxy rotation

## Caveats

- **httpx has no built-in retry**: You must implement backoff manually. curl_cffi's native retry is an advantage for rate-limited sites.
- **Timeout ≠ rate-limit**: A timeout may mean a slow server, not throttling. Always check for 429 status and `Retry-After` headers.
- **Jitter is mandatory**: Without random jitter, simultaneous retries create a thundering herd that mimics a DDoS.
- **Per-proxy rate tracking**: Rotating proxies distributes load across IPs, but each proxy has its own rate limit — track limits per-proxy.
- **http2/http3 multiplexing**: curl_cffi's connection reuse reduces overhead but complicates per-request delay enforcement — consider connection-level tracking.
- **Redirect detection**: Servers may redirect to rate-limit or captcha pages. Inspect `resp.history` (httpx) or the final URL to detect this.

## Composition Hints

- **With stealth**: Combine pacing with `web-scraping-playwright-stealth-patchright` or `web-scraping-curl-cffi-tls-fingerprint` so requests look legitimate AND arrive at a polite rate.
- **With auto-relogin**: Use `web-scraping-auto-relogin-pattern` so that rate-limit-induced 401/403 responses trigger re-authentication before retrying.
- **With session persistence**: Load cookies from `web-scraping-session-state-persistence` so rate-limit counters are tied to a consistent session identity.
- **With pagination**: `web-scraping-pagination-patterns` — each page turn is a request; the token bucket should gate the combined fetch loop.
