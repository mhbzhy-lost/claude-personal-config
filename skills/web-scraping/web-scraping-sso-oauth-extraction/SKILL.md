---
name: web-scraping-sso-oauth-extraction
description: Playwright-driven OAuth/SAML/OIDC flow automation to extract access_token from redirect URLs or network interception, cached for httpx reuse with refresh support.
tech_stack: [web-scraping]
language: [python]
capability: [auth, http-client]
version: "Playwright / HTTPX unversioned"
collected_at: 2025-01-01
---

# SSO / OAuth Token Extraction

> Source: https://playwright.dev/python/docs/auth, https://playwright.dev/python/docs/network, https://www.python-httpx.org/quickstart/

## Purpose
Use Playwright to drive a full browser-based SSO login flow (OAuth 2.0 / OIDC / SAML), intercept the resulting `access_token` from network responses or redirect URL fragments, then hand that token off to httpx for programmatic API access — without re-authenticating every time.

## When to Use
- Target system uses browser redirect-based SSO (Azure AD, Okta, Google Workspace, GitHub OAuth) that can't be replicated with pure HTTP.
- Login involves JavaScript challenges, multi-page redirects, or WebAuthn.
- You need a Bearer token for API calls after SSO login, plus periodic refresh without re-running the browser flow.
- The `access_token` appears in a redirect URL fragment (`#access_token=...`) or in a JSON response body from `/oauth2/token`.

## Basic Usage

### Pattern 1: Intercept Token from Network Response (most reliable)

```python
from playwright.sync_api import sync_playwright
import httpx

captured_token = None

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    context = browser.new_context()
    page = context.new_page()

    # Hook network BEFORE triggering the login action
    def on_response(response):
        nonlocal captured_token
        if "/oauth2/token" in response.url and response.status == 200:
            captured_token = response.json().get("access_token")

    page.on("response", on_response)
    page.goto("https://app.example.com/login")

    # Drive the SSO flow
    page.get_by_label("Email").fill("user@example.com")
    page.get_by_label("Password").fill("password")
    page.get_by_role("button", name="Sign in").click()
    page.wait_for_url("**/dashboard")

    # Persist session for later reuse
    context.storage_state(path="playwright/.auth/state.json")
    browser.close()

# Use the extracted token with httpx
headers = {"Authorization": f"Bearer {captured_token}"}
data = httpx.get("https://api.example.com/v1/records", headers=headers).json()
```

### Pattern 2: Extract Token from Redirect URL Fragment

```python
from urllib.parse import urlparse, parse_qs

page.wait_for_url("**/callback**")
fragment = urlparse(page.url).fragment
params = parse_qs(fragment)
access_token = params.get("access_token", [None])[0]
```

### Pattern 3: Token Refresh (keep the session alive)

```python
def refresh(refresh_token):
    r = httpx.post("https://auth.example.com/oauth2/token", data={
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": "my_client",
        "client_secret": os.environ["CLIENT_SECRET"],
    })
    r.raise_for_status()
    return r.json()["access_token"]
```

## Key APIs (Summary)

| Layer | API | Role |
|-------|-----|------|
| Playwright | `page.on("response", handler)` | Capture OAuth token response body |
| Playwright | `page.on("request", handler)` | Inspect outgoing Authorization headers |
| Playwright | `page.expect_response("**/token")` | Block until a specific endpoint responds |
| Playwright | `page.route("**", handler)` | Intercept + read/modify before fulfill |
| Playwright | `context.storage_state(path=...)` | Persist cookies + localStorage to JSON |
| Playwright | `browser.new_context(storage_state=...)` | Restore authenticated context |
| Playwright | `page.evaluate("sessionStorage")` | Manual sessionStorage extraction (not in storage_state) |
| httpx | `httpx.get(url, headers={"Authorization": f"Bearer {token}"})` | Bearer-authenticated API calls |
| httpx | `httpx.Cookies()` + `.set(name, value, domain=...)` | Domain-scoped cookie jar for cookie-based auth |

## Caveats
- **Never commit `state.json`** — it contains session cookies that can impersonate you. Store in `playwright/.auth/` with `.gitignore`.
- **Session storage is invisible to `storage_state()`** — manually extract via `page.evaluate("() => JSON.stringify(sessionStorage)")` and restore via `context.add_init_script()`.
- **Network listeners fire for ALL responses** — filter aggressively by URL pattern to avoid false captures.
- **`page.expect_response()` must be set up BEFORE the triggering action**, otherwise the response will be missed.
- **`route()` interceptors shadow `page.on("response")`** — fulfilled/aborted requests never reach response listeners.
- **Service Workers (MSW, etc.) hijack network** — set `service_workers='block'` in context options if network events are missing.
- **httpx does NOT follow redirects by default** — pass `follow_redirects=True` explicitly (unlike the `requests` library).
- **Default httpx timeout is 5 seconds** — SSO endpoints can be slow; adjust or disable (`timeout=None`) as needed.

## Composition Hints
- Pair with **session-state-persistence** to serialize the captured token + cookies into an encrypted, versioned cache.
- Pair with **auto-relogin-pattern** so a 401 triggers automatic re-authentication using the stored refresh_token instead of crashing.
- Pair with **csrf-token-handling** if the SSO-protected API also requires CSRF tokens on mutating requests.
- If the SSO flow involves TOTP 2FA, compose with **totp-2fa** to auto-generate and fill the 2FA code during login.
- For anti-fingerprinting during the browser login phase, use **playwright-stealth-patchright** as a drop-in replacement for Playwright.
