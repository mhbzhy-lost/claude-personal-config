---
name: maestro-flow-yaml-basics
description: YAML flow file structure and core interaction commands (launchApp, tapOn) for Maestro mobile UI testing.
tech_stack: [maestro, mobile-native]
capability: [e2e-testing]
version: "maestro unversioned"
collected_at: 2025-01-01
---

# Maestro Flow YAML Basics

> Source: https://docs.maestro.dev/maestro-flows, https://docs.maestro.dev/api-reference/commands, https://docs.maestro.dev/reference/commands-available/launchapp, https://docs.maestro.dev/reference/commands-available/tapon

## Purpose

Maestro Flows are YAML-based test scripts for cross-platform UI automation (Android, iOS, Web). They model user journeys as declarative command sequences — maintained by both developers and manual testers without heavy programming knowledge.

## When to Use

- Writing UI automation tests for Android, iOS, and Web from a single suite
- Defining reusable user journey segments (Login, Checkout, Search)
- Filtering test runs with tags and environment variables
- Composing flows into larger scenarios via subflows (`runFlow`)

## Basic Usage

### Flow anatomy — two sections separated by `---`

```yaml
# --- Config section (above ---) ---
appId: com.example.app    # Mandatory for native apps
name: My Login Flow       # Optional: name shown in reports
tags:                     # Optional: filter with --include-tags
  - smoke-test
env:                      # Optional: environment variables
  USERNAME: "[email protected]"
---
# --- Commands section (below ---) ---
- launchApp
- tapOn: "Username"
- inputText: ${USERNAME}
- tapOn: "Login"
- assertVisible: "Welcome"
```

For web apps, replace `appId` with `url`:
```yaml
url: https://example.com
---
- launchApp
```

### launchApp — core patterns

```yaml
# Simple launch (stops app first, then re-launches)
- launchApp

# Launch a different app by ID
- launchApp: com.other.app

# Clear all app state before launch
- launchApp:
    clearState: true

# Bring backgrounded app to foreground (no restart)
- launchApp:
    stopApp: false

# Grant/deny permissions at launch
- launchApp:
    permissions:
      all: deny
# Or selectively:
- launchApp:
    permissions:
      camera: grant
      location: deny

# Pass typed launch arguments (string/boolean/double/integer)
- launchApp:
    arguments:
      isDebug: true
      serverPort: 8080
      apiKey: "abc123"
      zoomLevel: 1.5
```

### tapOn — the most common interaction command

```yaml
# Shorthand: tap by visible text
- tapOn: "My text"

# Tap by element ID
- tapOn:
    id: "com.example:id/login_button"

# Repeat taps (e.g., counter increment)
- tapOn:
    text: "+"
    repeat: 5
    delay: 200            # ms between repeats, default 100

# Retry if UI doesn't respond (animations still playing)
- tapOn:
    text: "Submit"
    retryTapIfNoChange: true

# Tap center of screen (relative %)
- tapOn:
    point: "50%,50%"

# Tap within a specific element
- tapOn:
    text: "Slider Track"
    point: "90%,50%"
```

Prefer `id`/`text` selectors over raw coordinates — coordinate taps are brittle and device-dependent.

### Other high-frequency commands (quick reference)

| Command | Purpose |
|---------|---------|
| `inputText` | Type text into a field. Supports `${ENV_VAR}` interpolation |
| `swipe` | Swipe by direction or between coordinates |
| `assertVisible` | Assert an element is visible (auto-retries ~7s) |
| `scroll` / `scrollUntilVisible` | Scroll the screen or until an element appears |
| `back` | Press the back button |
| `hideKeyboard` | Dismiss the soft keyboard |
| `longPressOn` | Long-press, same selectors as `tapOn` |
| `doubleTapOn` | Double-tap |

## Key APIs (Summary)

**launchApp** — parameters: `appId` (optional, defaults to config `appId`), `clearState` (bool), `clearKeychain` (bool, iOS only), `stopApp` (bool, default `true`), `permissions` (map), `arguments` (map of typed values).

**tapOn** — parameters: selector (string shorthand for text, or map with `id`/`text`/`point`), `repeat` (int), `delay` (ms), `retryTapIfNoChange` (bool), `waitToSettleTimeoutMs` (int, best-effort), `point` (relative `"X%,Y%"` or absolute `"X,Y"`).

## Caveats

- `appId` is mandatory for native apps; use `url` for web apps.
- `launchApp` without parameters stops and restarts the app (default `stopApp: true`). To foreground without restart, use `stopApp: false`.
- Coordinate taps are brittle — always prefer element selectors.
- `waitToSettleTimeoutMs` is best-effort; Maestro won't interrupt core operations to honor it.
- On iOS, `clearKeychain` clears the **entire** Keychain, not just the app under test.
- Launch arguments must match typed expectations: `string`, `boolean`, `double`, `integer`.

## Composition Hints

- Combine with `maestro-assertions-conditions` for `assertVisible`/`assertNotVisible` validation and conditional branching with `when`.
- Combine with `maestro-ci-integration` for running flows in CI (headless mode, artifact collection).
- Organize reusable sequences (e.g., login) as separate `.yaml` flow files and invoke with `runFlow`.
- Use `tags` in the config section to enable selective test execution via `--include-tags`.
