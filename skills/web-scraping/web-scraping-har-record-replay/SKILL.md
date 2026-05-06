---
name: web-scraping-har-record-replay
description: Record and replay browser network traffic as HAR files using Playwright, enabling deterministic offline replay of authenticated sessions for scraping and testing.
tech_stack: [web]
language: [python]
capability: [http-client]
version: "Playwright unversioned"
collected_at: 2025-01-01
---

# HAR Record & Replay

> Source: https://playwright.dev/python/docs/network, https://playwright.dev/python/docs/api/class-browsercontext

## Purpose
Capture real browser HTTP/HTTPS traffic into HAR (HTTP Archive) files via Playwright's `route_from_har`, then replay those archives deterministically — either inside Playwright or by extracting HAR entries for programmatic replay with `httpx`/`curl_cffi`. Eliminates the need to re-execute original browser interactions for authenticated scraping and API mocking.

## When to Use
- Replaying authenticated browsing sessions offline for deterministic scraping.
- Recording API responses once and mocking them in subsequent runs.
- Extracting HAR archives from browser flows to replay with Python HTTP clients.
- Building "record once, replay many times" scraping pipelines.
- Debugging network traffic by capturing HAR files programmatically.

## Basic Usage

### Recording a HAR file
```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(service_workers="block")
    # Enable recording
    context.route_from_har("session.har", update=True, update_mode="full")

    page = context.new_page()
    page.goto("https://example.com/login")
    page.fill("#username", "user")
    page.fill("#password", "pass")
    page.click("button[type=submit]")
    page.wait_for_url("**/dashboard")

    # HAR written to disk on close
    context.close()
    browser.close()
```

### Replaying from HAR
```python
with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(service_workers="block")
    context.route_from_har("session.har")       # Serve all requests from HAR

    page = context.new_page()
    page.goto("https://example.com/dashboard")  # Served from HAR
    # All XHR/fetch requests also served from HAR
```

### Replaying with fallback to real network
```python
context.route_from_har("session.har", not_found="fallback")
# Requests not in HAR pass through to real network
```

### URL-filtered HAR replay
```python
context.route_from_har("session.har", not_found="fallback", url="**/api/**")
# Only API calls come from HAR; everything else hits network
```

### Minimal recording (replay-only, smaller file)
```python
context.route_from_har("session.har", update=True, update_mode="minimal")
# Omits timing, page metadata, cookies, security — keeps only routing data
```

## Key APIs (Summary)

| API | Purpose |
|-----|---------|
| `context.route_from_har(path, update=True)` | Record all network traffic into a HAR file |
| `context.route_from_har(path)` | Serve all requests from a HAR file (offline replay) |
| `context.route_from_har(path, not_found="fallback")` | Replay from HAR, fall through to network for misses |
| `context.route_from_har(path, url="**/api/**")` | Filter which URLs are served from HAR |
| `context.route_from_har(path, update_mode="minimal")` | Record only routing-essential fields |
| `context.route_from_har(path, update_content="embed")` | Store response bodies inline in HAR |

### Complementary network APIs
```python
# Monitor all requests/responses
page.on("request", lambda r: print(">>", r.method, r.url))
page.on("response", lambda r: print("<<", r.status, r.url))

# Wait for a specific API response after an action
with page.expect_response("**/api/fetch_data") as resp:
    page.get_by_text("Update").click()
data = resp.value

# Mock without HAR
page.route("**/api/data", lambda route: route.fulfill(status=200, body='{"ok":true}'))
```

## Caveats
- **Service Workers**: Always set `service_workers="block"` — SW requests are invisible to `route_from_har`.
- **Default abort**: `not_found="abort"` is the default; missing requests are silently aborted, which can break pages. Prefer `not_found="fallback"` unless you're certain the HAR is complete.
- **HAR file size**: `update_mode="full"` + `update_content="embed"` produces large files. Use `"minimal"` for replay-only archives.
- **Write-on-close**: HAR is written to disk only at `context.close()`, not incrementally.
- **No WebSocket replay**: HAR covers HTTP/HTTPS only. WebSocket frames are not replayed.
- **Expiring cookies**: Cookies in HAR may expire. Combine with a refresh mechanism for long-lived replay.
- **External replay**: To replay HAR outside Playwright, parse JSON entries and match by `(url, method)`, then replay stored headers and body.

## Composition Hints
- **With session-state-persistence**: Record a HAR after loading stored auth state to capture authenticated API responses offline.
- **With auto-relogin-pattern**: If HAR replay hits a 401, fall through to real network (`not_found="fallback"`) and trigger relogin.
- **With curl-cffi-tls-fingerprint**: Parse HAR JSON, extract request/response pairs, and replay via curl_cffi with matching TLS fingerprints.
- **With pagination-patterns**: Record a HAR of a paginated list flow, then replay deterministically while iterating through pages.
