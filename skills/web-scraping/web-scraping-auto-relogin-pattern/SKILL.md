---
name: web-scraping-auto-relogin-pattern
description: Detect expired sessions and transparently re-authenticate so long-running scrapers recover without manual intervention.
tech_stack: [web]
language: [python, javascript]
capability: [auth, http-client]
version: "Playwright unversioned; curl_cffi unversioned; httpx unversioned"
collected_at: 2025-01-01
---

# Auto-Relogin Pattern for Web Scraping

> Source: Playwright Authentication docs, curl_cffi docs, HTTPX Quickstart

## Purpose

In long-running scraping jobs, authenticated sessions inevitably expire. The auto-relogin pattern detects session expiration and transparently re-authenticates, allowing unattended scrapers to recover without losing progress.

## When to Use

- Scraping jobs that run longer than the target site's session timeout
- Sites with aggressive session invalidation (15-30 min or less)
- Overnight / multi-day pipelines that must run unattended
- Any authenticated scraping where you cannot predict when the session will die
- Sites protected by TLS fingerprinting (pair with curl_cffi for impersonation)

## Basic Usage

### Detection Strategies (choose one or combine)

| Strategy | Signal | Best For |
|----------|--------|----------|
| **Status code** | HTTP 401 / 403 | API scraping, XHR-heavy sites |
| **Redirect** | 302 to `/login` or `/signin` | Traditional server-rendered sites |
| **Content check** | Login form present, or authenticated element absent | SPAs, sites without clean HTTP signals |

### Playwright Pattern (browser automation)

```python
import os
from playwright.sync_api import sync_playwright

AUTH_STATE_PATH = "playwright/.auth/state.json"
MAX_RELOGIN_RETRIES = 3

def is_logged_in(page):
    """Check for a known authenticated-only element."""
    return page.locator(".user-avatar, .dashboard").count() > 0

def login(page, credentials):
    """Perform login and persist state."""
    page.goto("https://example.com/login")
    page.get_by_label("Username").fill(credentials["username"])
    page.get_by_label("Password").fill(credentials["password"])
    page.get_by_role("button", name="Sign in").click()
    page.wait_for_url("https://example.com/dashboard")
    page.context.storage_state(path=AUTH_STATE_PATH)

def navigate_with_relogin(page, url, credentials):
    """Navigate to URL; relogin transparently if session expired."""
    for attempt in range(MAX_RELOGIN_RETRIES):
        page.goto(url)
        if is_logged_in(page):
            return
        print(f"Session expired — relogin attempt {attempt + 1}")
        login(page, credentials)
    raise RuntimeError(f"Relogin failed after {MAX_RELOGIN_RETRIES} attempts")

# Usage
with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(
        storage_state=AUTH_STATE_PATH if os.path.exists(AUTH_STATE_PATH) else None
    )
    page = context.new_page()

    creds = {"username": "myuser", "password": "mypass"}
    navigate_with_relogin(page, "https://example.com/data/page1", creds)
    navigate_with_relogin(page, "https://example.com/data/page2", creds)
    browser.close()
```

### HTTPX Pattern (HTTP client)

```python
import httpx
import time

class ReloginClient:
    def __init__(self, base_url, username, password, max_retries=3):
        self.base_url = base_url
        self.credentials = (username, password)
        self.max_retries = max_retries
        self.client = httpx.Client(base_url=base_url)
        self._login()

    def _login(self):
        r = self.client.post("/login", data={
            "username": self.credentials[0],
            "password": self.credentials[1]
        })
        r.raise_for_status()

    def _request_with_relogin(self, method, path, **kwargs):
        for attempt in range(self.max_retries + 1):
            r = self.client.request(method, path, **kwargs)
            if r.status_code not in (401, 403):
                return r
            if attempt < self.max_retries:
                print(f"Session expired — relogin attempt {attempt + 1}")
                self._login()
                continue
            r.raise_for_status()
        raise RuntimeError("Relogin failed")

    def get(self, path, **kwargs):
        return self._request_with_relogin("GET", path, **kwargs)

    def post(self, path, **kwargs):
        return self._request_with_relogin("POST", path, **kwargs)
```

## Key APIs (Summary)

| API | Role in Pattern |
|-----|-----------------|
| `response.status_code` / `raise_for_status()` | Detect 401/403 as expiry signal |
| `page.locator(...).count() > 0` | Content-based login detection |
| `page.wait_for_url(...)` | Confirm successful login redirect |
| `context.storage_state(path=...)` | Persist new session after relogin |
| `httpx.Client` (stateful) | Maintain session cookies across relogin cycles |
| curl_cffi `Session` | Same as above, with TLS fingerprint impersonation |

## Caveats

- **Max retries are mandatory**: If credentials are wrong or the account is locked, the pattern will loop forever without a retry cap. Always bound the retry count.
- **Backoff between relogins**: Rapid repeated logins can trigger rate limits or account locks. Add `time.sleep(n)` with exponential backoff between attempts.
- **Fresh CSRF tokens**: Login forms almost always require a CSRF token. Always `page.goto(login_url)` before filling the form — never submit credentials on a stale page.
- **CAPTCHA risk**: Frequent relogins from the same IP may trigger CAPTCHAs. If available, use refresh-token flows instead of full re-login.
- **Shared account collisions**: If multiple scraper instances share credentials, one instance's relogin may invalidate the other's session. Use separate accounts or a locking mechanism.
- **sessionStorage gap**: Playwright's `storage_state()` does not persist sessionStorage. If the target site stores auth tokens there, use `add_init_script` to manually persist/restore it.

## Composition Hints

- **With session-state-persistence**: After each relogin, call `storage_state()` to update the persisted state file so subsequent runs start fresh.
- **With CSRF token handling**: Before submitting the login form, always fetch the login page to extract a fresh CSRF token from the `<form>` or `<meta>` tags.
- **With stealth/curl_cffi**: When the target uses TLS fingerprinting, use curl_cffi's `Session` class — it maintains cookies across requests and impersonates browser fingerprints, so the relogin looks natural.
- **With rate-limiting-pacing**: After a relogin, apply a short delay before resuming scraping to avoid hammering the site right after a fresh session.
