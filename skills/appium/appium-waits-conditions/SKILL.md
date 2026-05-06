---
name: appium-waits-conditions
description: Appium implicit/explicit wait strategies, ExpectedConditions, and newCommandTimeout for mobile element synchronization
tech_stack: [appium, mobile-native]
language: [java, python, javascript, ruby, csharp]
capability: [e2e-testing]
version: "Appium 2.x"
collected_at: 2025-07-16
---

# Appium Wait Conditions

> Source: https://appium.readthedocs.io/en/stable/en/commands/session/timeouts/implicit-wait/, https://appium.readthedocs.io/en/stable/en/commands/session/timeouts/, https://appium.io/docs/en/2.0/guides/caps/

## Purpose
Master element synchronization in Appium mobile automation: implicit waits, explicit waits with ExpectedConditions, custom wait predicates, and session timeout management via newCommandTimeout.

## When to Use
- Any Appium test that interacts with UI elements (virtually all tests)
- When elements load asynchronously or after animations/transitions
- CI/CD pipelines where hanging sessions must be prevented
- Cross-platform suites where iOS (XCUITest) and Android (UiAutomator2) have different element-resolution speeds

## Basic Usage

### Implicit Wait (global, set once)
```java
driver.manage().timeouts().implicitlyWait(30, TimeUnit.SECONDS);
```
```python
driver.implicitly_wait(5000)  # milliseconds
```

### Explicit Wait (per-condition, preferred)
```python
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

wait = WebDriverWait(driver, 10)
element = wait.until(EC.element_to_be_clickable((By.ACCESSIBILITY_ID, "submit")))
```

### newCommandTimeout (session-level, at creation)
```json
{ "appium:newCommandTimeout": 300 }
```
Server shuts down session if no command received within N seconds.

## Key APIs (Summary)
- `implicitlyWait(ms)` / `implicitly_wait(ms)` — global element-search patience; defaults to 0ms
- `WebDriverWait(driver, timeout).until(condition)` — explicit wait with condition polling
- `ExpectedConditions`: `elementToBeClickable`, `presenceOfElementLocated`, `visibilityOfElementLocated`, `invisibilityOfElementLocated`, `stalenessOf`, `textToBePresentInElement`
- Custom conditions via function predicates: `wait.until(lambda d: d.find_element(...).text == "Done")`
- `appium:newCommandTimeout` capability — seconds before idle session auto-shutdown
- `POST /session/:id/timeouts/implicit_wait` — raw HTTP API, body `{"ms": <number>}`
- `appium:eventTimings` — collect Event Timings for debugging slow element interactions
- `appium:printPageSourceOnFindFailure` — dump XML source on element-not-found failures (debug aid)

## Caveats
- **Never mix implicit and explicit waits** — WebDriver spec warns this causes unpredictable combined timeouts. Prefer explicit waits for reliability.
- **Default implicit wait is 0ms** — without setting it, `findElement` throws immediately if element absent.
- **newCommandTimeout is a capability, not a setting** — immutable after session start. Must be set in the capabilities JSON at session creation.
- **XCUITest is slower than UiAutomator2** — iOS element resolution takes measurably longer. Adjust timeouts per platform in cross-platform suites.
- **Always use `appium:` vendor prefix** on extension capabilities per W3C spec. Some clients auto-add it but explicit is safer.
- **`appium:options` precedence:** values inside override duplicate top-level keys.
- **First-match capabilities are not recommended** for Appium; use explicit always-match sets.

## Composition Hints
- Combine with **appium-locators** (accessibility id / XPath) to build robust wait+find patterns
- In **cross-platform POM**, store per-platform timeout constants since XCUITest needs longer waits
- For CI/CD, always set `newCommandTimeout` ≥ 120s to prevent resource leaks from crashed test runners
- Use `appium:printPageSourceOnFindFailure` during debugging to dump XML source on element-not-found failures
