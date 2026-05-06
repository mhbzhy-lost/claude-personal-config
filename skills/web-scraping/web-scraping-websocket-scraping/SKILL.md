---
name: web-scraping-websocket-scraping
description: Capture real-time streaming data from WebSocket connections via Playwright frame interception and curl_cffi direct clients with TLS fingerprinting.
tech_stack: [playwright]
language: [python]
capability: [websocket, data-fetching]
version: "Playwright unversioned; curl_cffi unversioned"
collected_at: 2025-01-01
---

# WebSocket Scraping

> Source: https://playwright.dev/python/docs/network, https://curl-cffi.readthedocs.io/en/latest/

## Purpose

Scrape real-time data from websites that push updates over persistent WebSocket connections — the protocol that powers live dashboards, trading terminals, chat systems, and streaming APIs. Unlike traditional HTTP polling, WebSocket scraping captures data as it arrives without repeatedly hammering the server.

Two complementary strategies: **Playwright interception** (passive — attach to an existing browser session, let the browser handle auth/cookies/handshake) and **curl_cffi direct client** (programmatic — open WebSocket connections with JA3/JA4 TLS fingerprint impersonation when you already know the endpoint and auth tokens).

## When to Use

- **Real-time feeds**: stock tickers, crypto order books, sports scores, live auction bids
- **Streaming APIs**: endpoints that push incremental updates rather than requiring paginated polling
- **Chat/messaging**: Slack, Discord-style message streams, customer support panels
- **Live monitoring**: server metrics dashboards, log tailing, CI/CD pipeline status
- **Any page where DevTools Network tab shows `ws://` or `wss://` connections carrying payload data**

Prefer this over HTTP polling when: (a) the site opens a WebSocket immediately on page load, (b) data arrives at unpredictable intervals, (c) polling would miss updates between requests.

## Basic Usage

### Playwright: passive interception (recommended for most cases)

Attach to a live page and collect every frame the server pushes:

```python
from playwright.sync_api import sync_playwright

messages = []

def on_ws(ws):
    print(f"[WS] {ws.url}")
    ws.on("framereceived", lambda payload: messages.append(payload))
    ws.on("close", lambda _: print("[WS] closed"))

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.on("websocket", on_ws)       # fires for every new WebSocket
    page.goto("https://target.site/dashboard")
    page.wait_for_timeout(30_000)     # collect 30s of streaming data
    browser.close()
```

This approach requires zero knowledge of the WebSocket handshake — the browser negotiates it with the site's existing cookies and authentication.

### curl_cffi: direct connection (when the endpoint is known)

```python
from curl_cffi import requests

# Open WebSocket with Chrome 120 TLS fingerprint
ws = requests.ws_connect(
    "wss://api.target.site/stream",
    impersonate="chrome120",
    headers={"Authorization": "Bearer <token>"}
)

for frame in ws:
    print(frame.data)  # text or bytes
```

This is lighter weight (no browser) but requires you to supply auth headers yourself. Pair with SSO/OAuth extraction skills to obtain tokens programmatically.

## Key APIs (Summary)

### Playwright WebSocket events

| Event | Fires when | Payload |
|-------|-----------|---------|
| `page.on("websocket", cb)` | Any new WebSocket created by the page | `WebSocket` instance |
| `ws.on("framesent", cb)` | Page sends a frame | Frame payload (text/bytes) |
| `ws.on("framereceived", cb)` | Server sends a frame | Frame payload (text/bytes) |
| `ws.on("close", cb)` | Connection closes | Close reason |

Access `ws.url` to identify which endpoint a frame belongs to — critical when a page opens multiple WebSockets.

### curl_cffi WebSocket

- `requests.ws_connect(url, impersonate=..., headers=...)` — open with fingerprint
- Iterate the returned object to receive frames
- Supports both sync and async (`curl_cffi.requests.async_ws_connect`)
- http/2 and http/3 transports available

### Feature comparison

| | requests | aiohttp | httpx | curl_cffi |
|---|---|---|---|---|
| WebSocket | ❌ | ✅ | ❌ | ✅ |
| TLS fingerprinting | ❌ | ❌ | ❌ | ✅ |
| Sync + Async | sync | async | both | both |

## Caveats

- **Binary protocols**: Frames often use MessagePack, Protobuf, or custom binary encodings — not plain JSON. Inspect a few frames before writing parsers.
- **Service Workers**: If `page.route()` or WebSocket events seem to miss traffic, disable service workers: `browser.new_context(service_workers="block")`.
- **Heartbeat required**: Long-running WebSocket scrapes must respond to server ping frames or the connection will be silently dropped. Monitor `ws.on("close")` and reconnect.
- **Reconnection with backoff**: Connections drop unpredictably. Always wrap in a retry loop with exponential backoff + jitter.
- **Auth asymmetry**: Playwright reuses the browser's authenticated session automatically; curl_cffi requires you to manually extract and inject cookies/tokens. Prefer Playwright unless you need lightweight headless operation.
- **Verify first**: Not all streaming sites use WebSocket — some use Server-Sent Events (SSE) or long-polling. Check the Network tab before building a WebSocket scraper.

## Composition Hints

- **Session persistence**: Save Playwright `storage_state` after login so future scraper runs skip auth and go straight to WebSocket capture (`web-scraping-session-state-persistence`).
- **Auto-relogin**: If the WebSocket drops with a 401/403, trigger a relogin flow before reconnecting (`web-scraping-auto-relogin-pattern`).
- **SSO/OAuth**: Use Playwright to walk the OAuth flow, extract the access token, then pass it to curl_cffi's `ws_connect` headers (`web-scraping-sso-oauth-extraction`).
- **Rate limiting**: Apply token-bucket or exponential-backoff pacing when reconnecting to avoid triggering rate limits (`web-scraping-rate-limiting-pacing`).
- **Stealth**: Combine with Patchright for sites that detect headless browsers and block WebSocket upgrades (`web-scraping-playwright-stealth-patchright`).
