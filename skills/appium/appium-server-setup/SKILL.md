---
name: appium-server-setup
description: Install and configure Appium 2.x server, manage drivers (XCUITest/UiAutomator2) via Extension CLI, and compose W3C capabilities for iOS/Android sessions.
tech_stack: [mobile-native]
capability: [container, ci-cd]
version: "Appium 2.x"
collected_at: 2025-01-01
---

# Appium Server Setup

> Source: https://appium.io/docs/en/2.0/quickstart/, https://appium.io/docs/en/2.0/guides/migrating-1-to-2/, https://appium.io/docs/en/2.0/guides/caps/, https://appium.io/docs/en/2.0/guides/managing-exts/

## Purpose

Appium 2.0 is a **platform** where drivers (platform automation) and plugins (behavior extensions) are separate, installable modules. Installing Appium only gives the server; you install drivers separately via the Extension CLI.

## When to Use

- Setting up Appium 2.x from scratch or migrating from Appium 1.x
- Installing and version-pinning XCUITest (iOS) and UiAutomator2 (Android) drivers
- Composing capabilities for new sessions with correct W3C vendor prefix format
- Managing plugins (images, execute-driver, etc.)

## Basic Usage

### Installation

```bash
# Install Appium server (no drivers bundled)
npm install --location=global appium

# Install platform drivers
appium driver install xcuitest        # iOS
appium driver install uiautomator2    # Android

# CI one-liner
npm install --location=global appium --drivers=xcuitest,uiautomator2

# Start
appium
```

### Capabilities (W3C Format)

The two **required** capabilities: `platformName` and `appium:automationName`. All non-standard capabilities MUST use the `appium:` vendor prefix.

**iOS session:**
```json
{
  "platformName": "iOS",
  "appium:options": {
    "automationName": "XCUITest",
    "platformVersion": "16.0",
    "deviceName": "iPhone 14",
    "app": "/path/to/app.ipa"
  }
}
```

**Android session:**
```json
{
  "platformName": "Android",
  "appium:options": {
    "automationName": "UiAutomator2",
    "deviceName": "Android Emulator",
    "app": "/path/to/app.apk"
  }
}
```

### `appium:options` — Bundling Caps

Wrap all `appium:`-prefixed capabilities into a single object. Values inside `appium:options` take precedence over same-name top-level keys.

### APPIUM_HOME

Default is `~/.appium`. Set to different paths to manage conflicting driver versions:

```bash
APPIUM_HOME=/path/home1 appium driver install [email protected]
APPIUM_HOME=/path/home1 appium   # uses xcuitest 4.11.1
```

## Key APIs (Summary)

### Extension CLI

| Command | Purpose |
|---|---|
| `appium driver install <name>` | Install latest driver |
| `appium driver install <name>@<ver>` | Pin driver version |
| `appium driver list --updates` | Check for driver updates |
| `appium driver update <name>` | Update a driver |
| `appium driver uninstall <name>` | Remove a driver |
| `appium plugin install <name>` | Install a plugin |
| `appium --use-plugins=images` | Start with plugins active |

### Essential Capabilities

| Capability | Required | Purpose |
|---|---|---|
| `platformName` | **Yes** | `"iOS"` or `"Android"` |
| `appium:automationName` | **Yes** | `"XCUITest"` or `"UiAutomator2"` |
| `appium:deviceName` | No | Device/simulator name |
| `appium:platformVersion` | No | OS version |
| `appium:app` | No | Path to .app / .apk |
| `appium:udid` | No | Specific device ID (preferred over deviceName for real devices) |
| `appium:noReset` | No | Skip app reset (default `false`) |
| `appium:fullReset` | No | Full cleanup (default `false`) |
| `appium:newCommandTimeout` | No | Seconds before idle session shutdown |

### Driver-Specific CLI Params

Must prefix with driver name: `--driver-xcuitest-webdriveragent-port=5000`. Some params moved to capabilities: use `--default-capabilities '{"appium:chromedriverExecutable": "..."}'`.

## Caveats

1. **Vendor prefix is mandatory** — capabilities without `appium:` prefix will be rejected. Modern clients auto-add it; older ones need manual prefixing.
2. **Base path changed** — default is `/` (was `/wd/hub` in 1.x). Restore with `--base-path=/wd/hub`.
3. **No JSONWP/MJSONWP** — only W3C WebDriver Protocol. The WD JS client is dead; use WebdriverIO.
4. **Drivers are separate** — not bundled. Old drivers (UiAutomator 1, iOS legacy) removed.
5. **`--port 0` removed** — must use explicit port ≥ 1.
6. **Capabilities are immutable** after session start — use driver Settings for runtime changes.
7. **First-match capabilities** are not recommended — use explicit always-match caps.
8. **Chromedriver flags** changed from CLI to env vars: `APPIUM_SKIP_CHROMEDRIVER_INSTALL`, `CHROMEDRIVER_VERSION`, `CHROMEDRIVER_CDNURL`.
9. **Appium Desktop is deprecated** — use Appium Inspector (standalone or browser at inspector.appiumpro.com, requires `--allow-cors`).
10. **npm DIY mode** — only use if Appium is already a project dependency; prefer Extension CLI otherwise.

## Composition Hints

- After setup, create sessions with platform-specific Options classes (e.g., `XCUITestOptions`, `UiAutomator2Options`)
- Pair with `appium-locators` for finding elements and `appium-cross-platform-strategy` for Page Object Model design
- For CI, combine driver install with `--drivers=` flag in npm install, or pre-bake APPIUM_HOME into Docker images
- Use `appium driver list --updates` regularly — drivers release independently from the server
