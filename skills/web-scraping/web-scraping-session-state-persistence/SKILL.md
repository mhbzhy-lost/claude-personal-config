---
name: web-scraping-session-state-persistence
description: Persist and reuse authenticated browser/HTTP sessions to skip repeated logins in scraping workflows.
tech_stack: [web]
language: [python, javascript]
capability: [auth, local-storage]
version: "Playwright unversioned; httpx unversioned"
collected_at: 2025-01-01
---

# Session State Persistence for Web Scraping

> Source: Playwright Authentication docs, HTTPX Quickstart

## Purpose

Skip repeated login steps across scraping runs by saving and restoring authenticated browser state (cookies, localStorage, IndexedDB). This eliminates the need to authenticate in every session, dramatically speeding up scraping pipelines that target authenticated endpoints.

## When to Use

- Any scraper that logs into a target site and runs multiple sessions
- Sites using cookie-based or token-based authentication
- Batch scraping where you want one login → many data-fetching runs
- CI/CD scraping pipelines where login-on-every-run is too slow
- When login is expensive (CAPTCHA, 2FA, rate-limited)

## Basic Usage

### Playwright: Save & Restore (primary pattern)

```bash
mkdir -p playwright/.auth
echo $'\nplaywright/.auth' >> .gitignore
```

```python
# ── First run: authenticate and save ──
context = browser.new_context()
page = context.new_page()
page.goto('https://github.com/login')
page.get_by_label("Username or email address").fill("username")
page.get_by_label("Password").fill("password")
page.get_by_role("button", name="Sign in").click()
page.wait_for_url("https://github.com/")
context.storage_state(path="playwright/.auth/state.json")

# ── Subsequent runs: restore and go ──
context = browser.new_context(storage_state="playwright/.auth/state.json")
page = context.new_page()
page.goto('https://github.com/')
# Already authenticated — no login needed
```

### Session Storage Workaround (rare but critical)

`storage_state()` covers cookies, localStorage, IndexedDB but **NOT sessionStorage**. When a site relies on sessionStorage for auth state:

```python
import os

# Save
session_storage = page.evaluate("() => JSON.stringify(sessionStorage)")
os.environ["SESSION_STORAGE"] = session_storage

# Restore
session_storage = os.environ["SESSION_STORAGE"]
context.add_init_script("""(storage => {
  if (window.location.hostname === 'example.com') {
    const entries = JSON.parse(storage)
    for (const [key, value] of Object.entries(entries)) {
      window.sessionStorage.setItem(key, value)
    }
  }
})('""" + session_storage + "')")
```

### HTTPX: Cookie-based persistence (lightweight alternative)

```python
import httpx

client = httpx.Client()
# Login
client.post("https://example.com/login", data={"user": "u", "pass": "p"})
# Subsequent requests carry the session cookie automatically
client.get("https://example.com/dashboard")

# Cross-run persistence: save/load cookies manually
cookies = client.cookies
# ... serialize cookies dict to disk, reload on next run ...
```

## Key APIs (Summary)

| API | Purpose |
|-----|---------|
| `context.storage_state(path=...)` | Save cookies + localStorage + IndexedDB to JSON file |
| `browser.new_context(storage_state=...)` | Create context preloaded with saved state |
| `context.add_init_script(...)` | Inject JS to restore sessionStorage before page load |
| `page.evaluate("() => JSON.stringify(sessionStorage)")` | Extract sessionStorage for manual persistence |
| `httpx.Client(cookies=...)` / `.cookies` | Cookie jar persistence for HTTP-level scraping |

## Caveats

- **Never commit state files**: The JSON state file contains raw cookies/headers that can impersonate you. Always `.gitignore` the auth directory.
- **State expires**: Saved state is a snapshot — sessions time out. Pair this with an auto-relogin pattern for long-running jobs.
- **sessionStorage gap**: `storage_state()` does NOT capture sessionStorage. If your target site uses it for auth tokens, you must use the `add_init_script` workaround (see above).
- **Cross-browser portability**: Cookies/localStorage/IndexedDB state is portable across Chromium/Firefox/WebKit, but auth model specifics may vary.
- **Large state files**: Accumulated localStorage can make state files large. Periodically re-create from a fresh login.
- **Concurrent access**: If two scrapers share one state file, one may overwrite the other's updates. Use separate accounts or lock files.

## Composition Hints

- Pair with **auto-relogin pattern**: detect 401/403 responses and trigger re-login when the persisted state expires
- Pair with **CSRF token handling**: login forms require fresh CSRF tokens; fetch the login page before submitting credentials
- Pair with **stealth/impersonation**: when using curl_cffi or Playwright stealth patches, combine state persistence with fingerprint consistency
