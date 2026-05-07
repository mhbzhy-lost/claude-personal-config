---
execution_mode: executable_sandbox
name: playwright-cli-screenshot
description: Capture webpage screenshots from the command line using Playwright's headless Chromium via Python sync API
tech_stack: [playwright]
language: [python]
capability: [media-processing]
version: "Playwright Python (stable, unversioned docs)"
collected_at: 2025-07-11
---

# Playwright CLI Screenshot

> Source: https://playwright.dev/python/docs/library, https://playwright.dev/python/docs/screenshots, https://playwright.dev/python/docs/intro

## Purpose

Take full-page or viewport screenshots of any URL from a script or sandbox using Playwright's headless Chromium. This skill focuses on the minimal CLI path — no test framework, no Pytest plugin, just the core `playwright` Python library with the sync API.

## When to Use

- Programmatic screenshot capture from shell scripts, sandboxes, or CI pipelines
- Lightweight headless browser automation (not the full Pytest test framework)
- Page rendering capture for archiving, preview thumbnails, or visual diffing
- Any scenario where you need `url in → screenshot.png out`

Do NOT use this skill for writing Playwright test suites — those belong to the Pytest plugin workflow, which is a separate concern.

## Basic Usage

The canonical 6-line screenshot:

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto("https://example.com")
    page.screenshot(path="/work/screenshot.png")
    browser.close()
```

Browsers launch **headless by default**. No browser window appears.

## Key APIs (Summary)

| Call | Purpose |
|------|---------|
| `sync_playwright()` | Context manager that starts/stops the Playwright driver |
| `p.chromium.launch()` | Launch headless Chromium. Use `p.firefox.launch()` or `p.webkit.launch()` for other engines |
| `browser.new_page()` | Open a fresh tab/page |
| `page.goto(url)` | Navigate to URL (auto-waits for load) |
| `page.screenshot(path=..., full_page=..., clip=..., type=...)` | Capture screenshot to file or return bytes |
| `page.locator(selector).screenshot(path=...)` | Screenshot a single element |
| `browser.close()` | Close the browser instance |

### `page.screenshot()` key parameters

- **`path`** (`str`) — output file path. If omitted, returns raw `bytes`.
- **`full_page`** (`bool`) — `True` captures the entire scrollable page. Default `False` (viewport only).
- **`clip`** (`dict`) — `{"x": 0, "y": 0, "width": 800, "height": 600}` for region capture.
- **`type`** (`str`) — `"png"` (default) or `"jpeg"`.
- **`quality`** (`int`) — JPEG quality 0–100, only for `.jpg` paths.

### Full-page screenshot

```python
page.screenshot(path="full.png", full_page=True)
```

### Capture into buffer (no file written)

```python
screenshot_bytes = page.screenshot()
```

## Caveats

- **`time.sleep()` breaks Playwright**: Playwright internally relies on async operations. Use `page.wait_for_timeout(5000)` instead of `time.sleep(5)`. This is the most common pitfall.

- **Browser binaries are separate from the pip package**: `pip install playwright` only installs the Python bindings. You MUST also run `playwright install chromium` to download the actual browser binary. Without this, `launch()` will fail.

- **Thread safety**: Playwright's API is NOT thread-safe. Create one playwright instance per thread if you must use threads.

- **Windows requires ProactorEventLoop**: On Windows, the default Python 3.8+ event loop works. If you're on Python 3.7, Playwright automatically sets it.

- **System requirements**: Python ≥ 3.8. Works on Debian 12/13, Ubuntu 22.04/24.04 (x86-64, arm64), macOS 14+, Windows 11+/WSL.

## Composition Hints

This skill pairs with two supporting scripts for sandbox execution:

- **`install.sh`**: Bootstraps the environment — `pip install playwright` followed by `playwright install chromium`. Idempotent: safe to re-run.
- **`run-impl.sh`**: Accepts a URL as `$1`, wraps a Python snippet that launches headless Chromium, navigates to the URL, and writes the screenshot to `/work/screenshot.png`.

Typical sandbox workflow:

```bash
# install (once)
bash install.sh

# capture (repeatable)
bash run-impl.sh "https://example.com"
# → /work/screenshot.png
```
