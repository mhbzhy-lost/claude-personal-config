---
name: web-scraping-pagination-patterns
description: Unified iterator/generator abstractions for offset-based, cursor-based, and infinite-scroll pagination across httpx, Playwright, and curl_cffi.
tech_stack: [http, web]
language: [python]
capability: [data-fetching, http-client]
version: "Playwright unversioned, httpx unversioned, curl_cffi unversioned"
collected_at: 2025-01-20
---

# Pagination Patterns

> Source: https://playwright.dev/python/docs/network, https://www.python-httpx.org/quickstart/, https://curl-cffi.readthedocs.io/en/latest/

## Purpose
Unify the three pagination strategies encountered in web scraping — offset-based (`?page=N`), cursor-based (`?cursor=abc123` / `Link` headers), and infinite-scroll (XHR interception) — into a consistent iterator/generator pattern. Each strategy yields results lazily with built-in retry, exhaustion detection, and concurrency control.

## When to Use
- Scraping list/directory pages via `?page=1,2,3...` query parameters
- Scraping API endpoints that return `next_cursor` fields or `Link: <...>; rel="next"` headers (GraphQL connections, Stripe, Slack, Twitter APIs)
- Scraping social media feeds or product grids that load more content on scroll
- Combining pagination with rate-limiting — the generator pattern supports inter-request delays natively
- Concurrent page fetching with semaphore-based parallelism for offset pagination

## Basic Usage

### Offset-Based Pagination

```python
import httpx
from typing import Iterator, Optional

def offset_paginate(
    client: httpx.Client,
    url: str,
    page_param: str = "page",
    start: int = 1,
    max_pages: Optional[int] = None,
    **kwargs
) -> Iterator[dict]:
    page = start
    while max_pages is None or page <= max_pages:
        params = kwargs.pop("params", {})
        params[page_param] = page
        response = client.get(url, params=params, **kwargs)
        response.raise_for_status()
        data = response.json()
        results = data.get("results") or data.get("items") or data.get("data", [])
        if not results:
            break
        yield from results
        page += 1
```

### Cursor-Based Pagination

```python
import httpx, re
from typing import Iterator, Optional, Callable

def cursor_paginate(
    client: httpx.Client,
    url: str,
    cursor_extractor: Callable[[httpx.Response], Optional[str]],
    initial_params: Optional[dict] = None,
    **kwargs
) -> Iterator[dict]:
    params = dict(initial_params or {})
    while True:
        response = client.get(url, params=params, **kwargs)
        response.raise_for_status()
        data = response.json()
        results = data.get("results") or data.get("items") or data.get("data", [])
        if not results:
            break
        yield from results
        cursor = cursor_extractor(response)
        if not cursor:
            break
        params["cursor"] = cursor

# Cursor extractor: Link header
def link_header_extractor(response: httpx.Response) -> Optional[str]:
    link = response.headers.get("link", "")
    match = re.search(r'<[^>]*[?&]cursor=([^>&]+)[^>]*>\s*;\s*rel="next"', link)
    return match.group(1) if match else None

# Cursor extractor: JSON body
def json_cursor_extractor(response: httpx.Response) -> Optional[str]:
    data = response.json()
    return data.get("next_cursor") or data.get("pagination", {}).get("next")
```

### Infinite-Scroll Pagination (Playwright XHR Capture)

```python
from playwright.sync_api import sync_playwright

def infinite_scroll_collect(url: str, scroll_pause: float = 2.0, max_scrolls: int = 10):
    api_responses = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.on("response", lambda resp: api_responses.append({
            "url": resp.url,
            "status": resp.status,
            "body": resp.text() if "json" in resp.headers.get("content-type", "") else None,
        }))
        page.goto(url)
        last_height = page.evaluate("document.body.scrollHeight")
        scrolls = 0
        while scrolls < max_scrolls:
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            page.wait_for_timeout(int(scroll_pause * 1000))
            new_height = page.evaluate("document.body.scrollHeight")
            if new_height == last_height:
                break
            last_height = new_height
            scrolls += 1
        browser.close()
    return api_responses
```

## Key APIs (Summary)
- **httpx `client.get(url, params=...)`** — construct offset/page query parameters
- **httpx `response.headers.get("link")`** — extract cursor from `Link` header
- **httpx `response.json()`** — extract cursor from JSON body (`next_cursor`, `pagination.next`)
- **httpx `response.raise_for_status()`** — detect exhaustion via 404/4xx on invalid page
- **httpx `stream("GET", url)` / `iter_lines()`** — stream large paginated datasets without loading all pages into memory
- **Playwright `page.on("response")`** — intercept XHR API calls triggered by infinite scroll
- **Playwright `page.evaluate("window.scrollTo(...)")`** — trigger scroll-driven content loads
- **curl_cffi async session** — concurrent pagination with TLS fingerprint impersonation for protected endpoints

## Caveats
- **Cursor expiration**: Short-lived cursors fail silently — design generators to restart from page 1 on cursor error.
- **Offset drift**: When data is added/removed during offset scraping, items may duplicate or skip. Deduplicate by ID.
- **Infinite-scroll scrollable ancestor**: Some sites scroll a container element, not `document.body`. Inspect the DOM to find the correct scroll target.
- **API vs DOM infinite-scroll**: Sites may fetch JSON from an internal API (intercept XHR) or return HTML fragments (`<template>` injection). Adjust extraction accordingly.
- **Page size negotiation**: Always check for `limit`/`per_page`/`page_size` parameters and set them to the maximum to minimize requests.
- **Cursor concurrency**: Cursor pagination is inherently sequential — do NOT parallelize cursor traversal. Offset pagination can be parallelized safely with a semaphore.
- **curl_cffi for protected endpoints**: Use curl_cffi when the target blocks standard HTTP clients via TLS fingerprinting. It impersonates Chrome/Safari/Edge TLS signatures.
- **Rate limit awareness**: Always parse `X-RateLimit-Remaining`, `Retry-After`, and `RateLimit-Reset` headers between pages.
- **Generator memory**: Generators keep one page in memory at a time. For infinite-scroll with Playwright, filter or flush accumulated XHR responses periodically.

## Composition Hints
- Pair with **rate-limiting-pacing** to insert exponential-backoff delays between page fetches based on `Retry-After` and rate-limit headers.
- Pair with **curl-cffi-tls-fingerprint** when paginating through endpoints that block non-browser TLS fingerprints — use curl_cffi as the transport.
- Pair with **session-state-persistence** so that pagination state (last cursor, last offset) can be checkpointed and resumed after interruption.
- Pair with **auto-relogin-pattern** so that a 401 mid-pagination triggers a transparent re-login before resuming the page sequence.
- For infinite-scroll + form interaction, combine with **multi-step-form-flow** to navigate to the listing page before starting scroll collection.
