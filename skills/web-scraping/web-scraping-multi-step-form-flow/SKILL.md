---
name: web-scraping-multi-step-form-flow
description: State-machine template for orchestrating multi-step browser flows (login→list→detail) with context passing, checkpoint/resume, and error-state transitions in Playwright.
tech_stack: [web]
language: [python]
capability: [routing, state-management]
version: "Playwright unversioned"
collected_at: 2025-01-01
---

# Multi-Step Form Flow

> Source: https://playwright.dev/python/docs/auth, https://playwright.dev/python/docs/network

## Purpose
Orchestrate complex multi-step browser scraping flows — typically login → search → list → detail → action — using a state-machine pattern. Each step is a discrete state that receives input context, performs actions, and produces output for the next step. Built on Playwright's browser context isolation, storage state persistence, and network synchronization APIs to enable checkpoint/resume and resilient error recovery.

## When to Use
- Scraping multi-page workflows where each step depends on data from previous steps.
- Automating form wizards with multiple stages and validation.
- Building resilient scrapers that resume from the last checkpoint on failure.
- Flows requiring authentication persistence across page transitions.
- Pipelines that mix browser automation with programmatic HTTP requests between steps.

## Basic Usage

### State machine class: Login → List → Detail
```python
import json
from playwright.sync_api import sync_playwright

class MultiStepScraper:
    def __init__(self):
        self.ctx = {}  # Shared state between steps

    def step_login(self, context, page):
        page.goto("https://example.com/login")
        page.get_by_label("Username").fill("user")
        page.get_by_label("Password").fill("pass")
        page.get_by_role("button", name="Sign in").click()
        page.wait_for_url("**/dashboard")
        context.storage_state(path="auth_checkpoint.json")
        return {"status": "logged_in"}

    def step_list(self, context, page):
        page.goto("https://example.com/dashboard/items")
        page.wait_for_selector(".item-row")
        items = page.evaluate("""() => Array.from(
            document.querySelectorAll('.item-row'),
            row => ({id: row.dataset.id, title: row.querySelector('.title').textContent})
        )""")
        self.ctx["items"] = items
        with open("items_checkpoint.json", "w") as f:
            json.dump(items, f)
        return {"status": "list_extracted", "count": len(items)}

    def step_detail(self, context, page, item):
        page.goto(f"https://example.com/dashboard/items/{item['id']}")
        with page.expect_response("**/api/items/*/details") as resp:
            page.get_by_role("button", name="Load Details").click()
        return {"status": "detail_extracted", "data": resp.value.json()}

    def run(self):
        with sync_playwright() as p:
            browser = p.chromium.launch()
            # Resume from checkpoint or start fresh
            try:
                context = browser.new_context(storage_state="auth_checkpoint.json")
                page = context.new_page()
            except FileNotFoundError:
                context = browser.new_context()
                page = context.new_page()
                self.step_login(context, page)

            self.step_list(context, page)
            for item in self.ctx["items"][:5]:
                self.step_detail(context, page, item)
            context.close()
            browser.close()
```

### Retry wrapper for error recovery
```python
import asyncio

async def step_with_retry(step_fn, context, page, max_retries=3, **kwargs):
    for attempt in range(max_retries):
        try:
            result = await step_fn(context, page, **kwargs)
            if result.get("status") == "error":
                raise RuntimeError(f"Step returned error: {result}")
            return result
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            await asyncio.sleep(2 ** attempt)  # Exponential backoff
```

### Context dictionary pattern (inter-step data transfer)
```python
ctx = {}
# Step 1 populates
ctx["auth_token"] = response.headers.get("X-Auth-Token")
ctx["user_id"] = page.evaluate("() => window.__USER__.id")

# Step 2 reads and extends
page.set_extra_http_headers({"Authorization": f"Bearer {ctx['auth_token']}"})
ctx["search_results"] = page.evaluate("...")

# Step 3 consumes accumulated context
for result in ctx["search_results"]:
    process(result, ctx["auth_token"])
```

## Key APIs (Summary)

| API | Purpose |
|-----|---------|
| `context.storage_state(path=...)` | Save cookies/localStorage/IndexedDB as checkpoint |
| `browser.new_context(storage_state=...)` | Resume from a saved checkpoint |
| `page.evaluate("() => JSON.stringify(sessionStorage)")` | Capture sessionStorage (not covered by storage_state) |
| `context.add_init_script(...)` | Restore sessionStorage into new context |
| `page.expect_response(pattern)` | Synchronize on a specific API response after an action |
| `page.on("request"/"response", handler)` | Monitor all network traffic for debugging |
| `context.route(pattern, handler)` | Intercept/modify requests across all pages in context |

## Caveats
- **sessionStorage not persisted**: `storage_state()` covers cookies, localStorage, and IndexedDB only. Capture sessionStorage manually with `page.evaluate()` and restore via `add_init_script()`.
- **Sensitive state files**: Auth state files contain cookies/headers usable for impersonation. Store in a `.gitignore`'d directory like `playwright/.auth`.
- **Init script ordering**: Multiple `add_init_script()` calls have undefined evaluation order — don't depend on sequencing.
- **Routing disables cache**: Leaving `page.route()` active disables the HTTP cache, slowing multi-step flows. Unroute when no longer needed.
- **Service Workers**: Disable with `service_workers='block'` to ensure all requests are visible to routing/interception.
- **expect_response timing**: Must be set up *before* the triggering action, or the response will be missed.
- **Stale checkpoints**: Include version/timestamp metadata in checkpoint files; force re-authentication when state is too old.

## Composition Hints
- **With session-state-persistence**: Use `storage_state` checkpoints between steps; the persistence skill handles encryption and expiry detection of the state file.
- **With har-record-replay**: Record a HAR during the full multi-step flow, then replay later without re-executing browser steps.
- **With pagination-patterns**: The list step feeds pagination iterators; detail steps consume paginated results.
- **With auto-relogin-pattern**: If a step detects 401/302, trigger the relogin decorator before retrying the failed step.
- **With csrf-token-handling**: Extract and inject CSRF tokens automatically between form-submission steps.
