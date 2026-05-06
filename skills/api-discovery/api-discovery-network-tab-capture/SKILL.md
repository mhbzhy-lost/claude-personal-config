---
name: api-discovery-network-tab-capture
description: Capture, monitor, and intercept browser network traffic with Playwright to discover API endpoints from real web application sessions
tech_stack: [playwright]
language: [typescript]
capability: [e2e-testing]
version: "Playwright unversioned"
collected_at: 2025-01-01
---

# Network Tab API Capture (Playwright)

> Source: https://playwright.dev/docs/network

## Purpose
Capture and analyze every HTTP/HTTPS request a web application makes at runtime using Playwright's network interception APIs. This is the runtime complement to static spec probing — it discovers API endpoints by observing actual browser traffic, including XHR/fetch calls, WebSocket connections, and authenticated requests that may not appear in any public spec.

## When to Use
- Discovering API endpoints of a web application that has no OpenAPI spec or GraphQL introspection
- Capturing real request/response payloads, headers, and authentication patterns from live browser sessions
- Extracting API call sequences triggered by specific user interactions (clicks, form submissions, navigation)
- Intercepting traffic that static analysis misses (dynamically constructed URLs, conditional endpoints)
- Observing WebSocket connections and frame-level messaging patterns
- Blocking noise (images, CSS, fonts) to isolate API traffic during capture sessions

## Basic Usage

### Minimal API Capture Script
```typescript
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();

const apiCalls = [];

// Log every request to /api/
page.on('request', request => {
  if (request.url().includes('/api/')) {
    apiCalls.push({
      method: request.method(),
      url: request.url(),
      headers: request.headers(),
      postData: request.postData()
    });
  }
});

// Capture response bodies
page.on('response', async response => {
  const call = apiCalls.find(c => c.url === response.url());
  if (call) {
    call.status = response.status();
    call.responseBody = await response.text().catch(() => null);
  }
});

await page.goto('https://target-app.com');
// Interact with the page to trigger more API calls...
await page.click('button.load-data');
await page.waitForTimeout(2000);

console.log(JSON.stringify(apiCalls, null, 2));
await browser.close();
```

### Blocking Noise During Capture
Speed up capture and reduce log clutter by aborting non-API resources:
```typescript
await page.route(/\.(css|woff2?|png|jpg|jpeg|gif|svg|ico)$/, route => route.abort());
await page.route('**/google-analytics.com/**', route => route.abort());
```

### Targeted Capture: Wait for a Specific Call
```typescript
// Set up the listener BEFORE the triggering action
const responsePromise = page.waitForResponse(
  response => response.url().includes('/api/search') && response.status() === 200
);
await page.fill('input[type="search"]', 'test query');
await page.press('input[type="search"]', 'Enter');
const response = await responsePromise;
const body = await response.json();
```

### Capturing WebSocket Traffic
```typescript
page.on('websocket', ws => {
  console.log(`WebSocket opened: ${ws.url()}`);
  ws.on('framesent', event => console.log('SENT:', event.payload));
  ws.on('framereceived', event => console.log('RECV:', event.payload));
  ws.on('close', () => console.log('WebSocket closed'));
});
```

## Key APIs (Summary)

| Method / Event | Purpose |
|---|---|
| `page.on('request', fn)` | Observe every outgoing request (method, URL, headers, postData) |
| `page.on('response', fn)` | Observe every incoming response (status, URL, body via `.text()`) |
| `page.waitForResponse(url)` | Wait for a specific response (glob, RegExp, or predicate) |
| `page.route(url, fn)` | Intercept and handle matching requests (mock, abort, modify) |
| `browserContext.route(url, fn)` | Intercept at context level — applies to all pages, popups, links |
| `route.fulfill({status, body})` | Mock a response without hitting the server |
| `route.fetch()` | Fetch the real response, then optionally modify it |
| `route.continue({headers, method})` | Forward the request with modifications |
| `route.abort()` | Block the matching request entirely |
| `route.request().resourceType()` | Filter by type: `xhr`, `fetch`, `script`, `image`, `stylesheet`, etc. |
| `page.on('websocket', fn)` | Inspect WebSocket connections and frame payloads |

## Caveats

- **Service Workers blind routing**: If the target app uses MSW (Mock Service Worker) or another SW-based tool, Playwright's `route()` will not see those requests. Set `serviceWorkers: 'block'` when creating the context to force requests through Playwright's network stack.
- **Response body is single-use**: `response.text()` or `response.json()` consumes the body stream. Cache the result — calling again will fail.
- **`waitForResponse` timing**: The promise must be created BEFORE the action that triggers the request. This is a common source of flakes.
- **Route handler ordering**: When multiple routes match a URL, the most recently registered one handles the request. Register catch-all routes first, then specific overrides.
- **`route.fetch()` is one-shot**: Once you call `route.fulfill()` or `route.abort()`, `route.fetch()` cannot be called. Decide: fetch-then-modify OR mock-from-scratch.
- **Glob patterns match full URLs**: `**/api/*` matches the complete URL string. A glob of just `/api/users` will NOT match `https://example.com/api/users` — use `**/api/users` instead.
- **WebSocket traffic is separate**: `page.route()` and `page.on('request')` do NOT capture WebSocket frames. Use `page.on('websocket')` for WS inspection.
- **POST data only on request**: `response.request().postData()` provides the POST body — it's not directly on the response object.
- **Block resources early**: Register `page.route()` for blocking BEFORE `page.goto()` to prevent unwanted resources from loading.

## Composition Hints
- Pair with **api-discovery-swagger-openapi-probing**: use network capture to find the swagger.json URL, then feed it to Swagger UI
- Pair with **api-discovery-graphql-introspection**: use network capture to find the GraphQL endpoint URL and observe actual query shapes, then run introspection queries against that endpoint
- When a site requires authentication, set `httpCredentials` or use `page.route()` to inject auth headers via `route.continue({headers})`
- For SPAs that load data lazily, script user interactions (clicks, scrolls) to trigger hidden API calls
- Use `resourceType()` filtering to isolate `xhr` and `fetch` calls from document/script/image noise
- Export captured API call logs as HAR files for persistence and sharing
