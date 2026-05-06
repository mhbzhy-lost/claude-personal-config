---
name: web-scraping-playwright-stealth-patchright
description: Drop-in undetected Playwright replacement with anti-fingerprinting patches for Chromium
tech_stack: [web]
language: [python]
capability: [e2e-testing]
version: "Patchright v1.59.0"
collected_at: 2025-01-01
---

# Playwright Stealth (Patchright)

> Source: https://github.com/Kaliiiiiiiiii-Vinyzu/patchright-python, https://playwright.dev/python/docs/auth

## Purpose

Patchright is a drop-in replacement for Playwright that applies anti-fingerprinting patches to Chromium-based browsers. It allows browser automation (scraping, login flows, JS-rendered page capture) to pass undetected through Cloudflare, Akamai, Datadome, Kasada, and similar bot-detection services. The only code change needed is the import statement.

## When to Use

- Sites protected by Cloudflare, Akamai, Datadome, Shape/F5, or Kasada
- Login automation on sites that detect headless Chrome / standard Playwright
- Any scenario where Playwright is blocked but you need full browser JS execution
- When curl_cffi's TLS impersonation alone is insufficient (site requires browser rendering)
- Internal system research where anti-bot measures are deployed

## Basic Usage

### Installation

```bash
pip install patchright
patchright install chrome      # use real Chrome, not Chromium
```

### Drop-in Replacement — Only the Import Changes

```python
# Synchronous — identical API to Playwright
from patchright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto("https://example.com")
    print(page.content())
    browser.close()

# Asynchronous
import asyncio
from patchright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.goto("https://example.com")
        await browser.close()

asyncio.run(main())
```

### Recommended Undetectable Configuration

```python
from patchright.sync_api import sync_playwright

with sync_playwright() as p:
    context = p.chromium.launch_persistent_context(
        user_data_dir="./browser_data",
        channel="chrome",        # real Chrome, not Chromium
        headless=False,          # headed mode is less detectable
        no_viewport=True,
        # Do NOT set custom user_agent or browser headers
    )
    page = context.new_page()
    page.goto("https://example.com")
    # All standard Playwright locators work, including inside closed shadow roots
    page.get_by_text("Sign In").click()
```

### Authenticated Sessions with storage_state

```python
# Save login state once
context.storage_state(path="playwright/.auth/state.json")

# Reuse in later sessions — no re-login needed
context = browser.new_context(storage_state="playwright/.auth/state.json")
```

## Key APIs (Summary)

**Drop-in compatible** with all Playwright APIs. Key additions:

| Feature | Playwright | Patchright |
|---------|-----------|------------|
| Runtime.enable leak | ❌ exposed | ✅ patched (isolated ExecutionContexts) |
| Console API | ✅ works | ❌ disabled (detection vector) |
| `--enable-automation` flag | ❌ present | ✅ removed |
| Closed shadow roots | ❌ inaccessible | ✅ full locator + XPath support |
| `navigator.webdriver` | ❌ `true` | ✅ `false` (via `--disable-blink-features=AutomationControlled`) |

**Extended API — `isolated_context` parameter** on all `evaluate` methods (default `True`):
```python
page.evaluate("expr", arg=None, isolated_context=True)
page.evaluate_handle("expr", arg=None, isolated_context=True)
locator.evaluate_all("expr", arg=None, isolated_context=True)
```

## Caveats

- **Chromium only**: Firefox and WebKit are NOT supported. Only Chromium-based browsers.
- **Console API disabled**: `console.log()` and friends will not function. Use alternative in-page JS loggers for debugging.
- **Use real Chrome**: Install with `patchright install chrome` and use `channel="chrome"`. Chromium is more detectable.
- **No custom headers/UA**: Do not set custom `user_agent` or browser headers — Chrome's real defaults are the stealthiest.
- **headed mode recommended**: `headless=False` is significantly harder to detect than headless.
- **storage_state is sensitive**: The state file contains cookies/headers that can impersonate you. Never commit to version control.
- **Brotector requires extra CDP patches**: Default install passes Cloudflare/Kasada/Akamai, but Brotector needs additional CDP-level patching.
- **Version coupling**: Patchright tracks Playwright releases; upstream changes may cause temporary breakage (typically fixed within days).

## Composition Hints

- **With TLS fingerprinting**: For non-browser requests, use `web-scraping-curl-cffi-tls-fingerprint` to impersonate Chrome at the TLS level. Use Patchright for pages requiring JS, and curl_cffi for API calls.
- **With session persistence**: `web-scraping-session-state-persistence` can bridge Patchright's `storage_state` JSON to httpx cookie jars for mixed browser/programmatic access.
- **With SSO/OAuth**: `web-scraping-sso-oauth-extraction` — use Patchright to walk the OAuth flow undetected, extract the token, and switch to lighter HTTP clients for subsequent requests.
- **With rate limiting**: `web-scraping-rate-limiting-pacing` — even undetected browsers should respect rate limits; apply token-bucket throttling between page navigations.
- **With auto-relogin**: `web-scraping-auto-relogin-pattern` — detect 401/403 responses and trigger Patchright re-login to refresh the `storage_state` file.
