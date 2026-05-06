---
name: web-scraping-csrf-token-handling
description: Dual-source CSRF token extraction from form hidden inputs and response headers with auto-refresh and injection across Playwright and httpx.
tech_stack: [http, web]
language: [python]
capability: [auth, http-client]
version: "Playwright unversioned, httpx unversioned"
collected_at: 2025-01-20
---

# CSRF Token Handling

> Source: https://playwright.dev/python/docs/network, https://www.python-httpx.org/quickstart/

## Purpose
Extract, inject, and auto-refresh CSRF tokens from two sources — HTML form hidden `<input>` elements and HTTP response headers (`X-CSRF-Token`, `XSRF-TOKEN`, `X-CSRFToken`). Handles the full token lifecycle so scrapers can transparently survive token expiration across Playwright browser sessions and httpx programmatic requests.

## When to Use
- Scraping sites protected by CSRF middleware (Django, Laravel, Spring Security, Express csurf, Rails)
- Automating multi-step form submissions where each form embeds its own CSRF token
- Building a session-persistent scraper that must survive token rotation
- Bridging a Playwright-based login flow to httpx for high-throughput scraping while maintaining valid CSRF tokens

## Basic Usage

### Dual-Source Extraction with Playwright

```python
from playwright.sync_api import sync_playwright

csrf_token = None

def capture_csrf(response):
    """Extract CSRF from response headers."""
    global csrf_token
    for name in ['x-csrf-token', 'xsrf-token', 'x-csrftoken']:
        if name in response.headers:
            csrf_token = response.headers[name]
            return

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.on("response", capture_csrf)

    # Navigate to form page
    page.goto("https://target-site.com/form")

    # Source 2: extract from hidden input
    csrf_input = page.locator('input[name="csrf_token"]').input_value()
    csrf_token = csrf_token or csrf_input
```

### httpx CSRF Client with Auto-Refresh

```python
import httpx
from bs4 import BeautifulSoup

class CSRFSession:
    def __init__(self):
        self.client = httpx.Client()
        self.csrf_token = None

    def _extract_and_store(self, response):
        for h in ['x-csrf-token', 'xsrf-token', 'x-csrftoken']:
            if h in response.headers:
                self.csrf_token = response.headers[h]
                return
        soup = BeautifulSoup(response.text, 'html.parser')
        meta = soup.find('meta', attrs={'name': 'csrf-token'})
        if meta:
            self.csrf_token = meta['content']
            return
        hidden = soup.find('input', attrs={'name': 'csrf_token'})
        if hidden:
            self.csrf_token = hidden.get('value')

    def request(self, method, url, **kwargs):
        if self.csrf_token and method.upper() in ['POST', 'PUT', 'PATCH', 'DELETE']:
            headers = kwargs.get('headers', {})
            headers['x-csrf-token'] = self.csrf_token
            kwargs['headers'] = headers
        response = self.client.request(method, url, **kwargs)
        self._extract_and_store(response)

        # Auto-refresh on 403/419
        if response.status_code in [403, 419]:
            form_resp = self.client.get(url)
            self._extract_and_store(form_resp)
            if self.csrf_token:
                kwargs.setdefault('headers', {})['x-csrf-token'] = self.csrf_token
            response = self.client.request(method, url, **kwargs)
        return response
```

## Key APIs (Summary)
- **Playwright `page.on("response")`** — capture CSRF tokens from every HTTP response header
- **Playwright `page.route()`** — intercept and modify outgoing request headers (inject CSRF)
- **Playwright `page.locator().input_value()`** — extract CSRF from form hidden inputs
- **httpx `response.headers`** — case-insensitive header access for token extraction
- **httpx `client.request(method, url, headers=...)`** — inject CSRF header into outgoing requests
- **httpx `Cookies`** — manage CSRF cookie when using double-submit cookie pattern
- **BeautifulSoup `soup.find()`** — extract CSRF from `<meta name="csrf-token">` tags

## Caveats
- **Header name variance**: Django uses `X-CSRFToken`, Angular/Laravel use `X-XSRF-TOKEN`, others use `X-CSRF-Token`. Always match case-insensitively across multiple variants.
- **Token scoping**: Some sites scope CSRF tokens per-form, not per-session. Re-extract after each page navigation.
- **Double-submit cookie pattern**: Some implementations require both a cookie AND a header with the same value. Keep cookie jar and header synchronized.
- **Token refresh race condition**: When concurrent requests all detect 403 and all re-fetch the token, use a lock or deduplicate the refresh GET.
- **Playwright route vs. `page.on("request")`**: `page.on("request")` is read-only — use `page.route()` to actually modify outgoing headers.
- **SPA token refresh**: Single-page apps may refresh CSRF tokens via XHR responses, not full page loads. Monitor all responses, not just HTML.

## Composition Hints
- Pair with **session-state-persistence** to save CSRF tokens as part of the serialized session state alongside cookies and auth tokens.
- Pair with **auto-relogin-pattern** so that when a 403 triggers CSRF token refresh, an expired session also triggers re-login transparently.
- Pair with **multi-step-form-flow** — each form step may carry its own CSRF token; the state machine should re-extract on each transition.
- Use **rate-limiting-pacing** between CSRF refresh retries to avoid tripping WAF rate limits when multiple 403s fire in rapid succession.
