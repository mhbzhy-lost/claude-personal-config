---
execution_mode: executable_sandbox
name: playwright-python-screenshot
description: Capture web page screenshots with Playwright Python sync API and headless Chromium
tech_stack: [playwright]
language: [python]
capability: [e2e-testing]
version: "Playwright Python v1.59.0 (Chromium 148.0.7778.96)"
collected_at: 2026-05-03
---

# Playwright Python Screenshot

> Source: https://playwright.dev/python/docs/library, https://playwright.dev/python/docs/screenshots, https://playwright.dev/python/docs/browsers, https://github.com/microsoft/playwright-python

## Purpose

Capture screenshots of web pages using Playwright's Python synchronous API with headless Chromium. Supports full-page captures, element-level screenshots, and in-memory buffer output. Designed for CLI tools, sandboxes, and CI environments.

## When to Use

- CLI-driven screenshot capture from a Debian/Ubuntu sandbox or Docker container
- Headless Chromium automation for URL-to-image pipelines
- Full-page screenshots of scrollable pages
- Element-specific captures via CSS selector
- In-memory screenshot buffers for post-processing or pixel-diff

## Basic Usage

### Installation

```bash
pip install playwright
playwright install --with-deps chromium
```

Verify:

```bash
playwright --version
python3 -c "from playwright.sync_api import sync_playwright; print('OK')"
```

### Minimal script

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto("https://example.com")
    page.screenshot(path="screenshot.png")
    browser.close()
```

### CLI-friendly wrapper pattern

```python
import sys
from playwright.sync_api import sync_playwright

def screenshot(url: str, output: str = "screenshot.png") -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(url)
        page.screenshot(path=output, full_page=True)
        browser.close()

if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "https://example.com"
    out = sys.argv[2] if len(sys.argv) > 2 else "screenshot.png"
    screenshot(url, out)
```

## Key APIs (Summary)

### `sync_playwright()` — Context Manager

Entry point. Manages driver lifecycle; start/stop is automatic within the `with` block.

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    # ...
```

### `browser_type.launch()`

```python
browser = p.chromium.launch()                          # headless, defaults
browser = p.chromium.launch(headless=False, slow_mo=50) # headed + slowed
browser = p.chromium.launch(channel="chrome")           # branded Chrome
```

Available Chromium channels: `"chrome"`, `"msedge"`, `"chrome-beta"`, `"msedge-beta"`, `"chrome-dev"`, `"msedge-dev"`.

### `page.goto(url)`

Navigate to a URL. Playwright auto-waits for the page to reach a stable state before resolving.

### `page.screenshot(**kwargs)`

| Parameter | Type | Default | Notes |
|-----------|------|---------|-------|
| `path` | str | None | File path; omit to get buffer |
| `full_page` | bool | False | Capture entire scrollable page |
| `clip` | dict | None | `{"x":0, "y":0, "width":800, "height":600}` |
| `type` | str | "png" | `"png"` or `"jpeg"` |
| `quality` | int | None | 0-100, JPEG only |
| `timeout` | int | 30000 | Max wait in ms |

Returns `bytes` when `path` is omitted.

### `locator.screenshot(path=...)`

Capture a single element by selector:

```python
page.locator(".header").screenshot(path="header.png")
```

## Caveats

- **`time.sleep()` breaks**: Use `page.wait_for_timeout(5000)` instead. Playwright's internal async operations can't process during `time.sleep()`.
- **Not thread-safe**: Create one `sync_playwright()` instance per thread.
- **Chromium ≠ Chrome**: Default is open-source Chromium — no proprietary media codecs. Use `channel="chrome"` if needed.
- **Headless shell vs new headless**: `--only-shell` gives a smaller headless-only binary. `--no-shell` + `channel="chromium"` uses the full browser in new headless mode (more authentic, supports extensions).
- **Browser cache**: `~/.cache/ms-playwright` on Linux. Override with `PLAYWRIGHT_BROWSERS_PATH`. Playwright GCs unused versions automatically; opt-out with `PLAYWRIGHT_SKIP_BROWSER_GC=1`.
- **Proxy/firewall**: Set `HTTPS_PROXY` env var for downloads. Use `NODE_EXTRA_CA_CERTS` for custom CA bundles.

## Composition Hints

- **executable_sandbox**: Package as an install script (`install.sh`) + runner script (`run-impl.sh`). Install: `apt-get install -y python3-pip ca-certificates curl`, `pip install playwright`, `playwright install --with-deps chromium`. Runner: accept URL + output path, wrap `sync_playwright()` in a `try/finally` to ensure `browser.close()`.
- **CI pipelines**: Use `playwright install --with-deps --only-shell chromium` for smaller footprint when only headless is needed.
- **Error handling**: Wrap `page.goto()` in try/except for unreachable URLs; always close the browser in a `finally` block or rely on the context manager.
