---
name: xcuitest-launch-config
description: Configure XCUIApplication launch arguments, environment variables, and test organization for XCUITest.
tech_stack: [ios]
language: [swift]
capability: [e2e-testing, native-lifecycle]
version: "XCTest unversioned"
collected_at: 2025-07-17
---

# XCUITest Launch Configuration

> Source: Apple Developer Documentation – XCUIApplication / launchArguments / launchEnvironment

## Purpose
Control how the app under test starts by setting launch-time arguments and environment variables read via `ProcessInfo`, and by structuring test classes for fast feedback loops.

## When to Use
- Setting feature flags or mock server URLs **before** the app process launches.
- Injecting test-only configuration (e.g., logged-in vs. logged-out, reset-database) without rebuilding.
- Running one test suite against multiple app configurations by varying launch parameters.
- Grouping related tests that share the same launch setup to avoid costly terminate/relaunch cycles.

## Basic Usage
```swift
let app = XCUIApplication()
app.launchArguments = ["-UITesting", "-MockServerURL", "http://localhost:8080"]
app.launchEnvironment = ["RESET_DB": "1", "TEST_USER": "alice"]
app.launch()
```

**In the app target**, read the values:
```swift
let args = ProcessInfo.processInfo.arguments
let env  = ProcessInfo.processInfo.environment

// UserDefaults convention: "-MyFlag" sets MyFlag=true
if UserDefaults.standard.bool(forKey: "UITesting") {
    // configure mock services
}
```

## Key APIs (Summary)
| API | Description |
|-----|-------------|
| `XCUIApplication()` | Proxy for the app under test (inherits `XCUIElement`) |
| `.launchArguments: [String]` | CLI-style flags; set **before** `launch()` |
| `.launchEnvironment: [String:String]` | Key-value pairs; set **before** `launch()` |
| `.launch()` | Starts the app process with the configured args/env |
| `.terminate()` | Force-quits the app; next `launch()` starts fresh |
| `ProcessInfo.processInfo.arguments` | Read launch arguments in the app |
| `ProcessInfo.processInfo.environment` | Read launch environment in the app |

## Caveats
- `launchArguments` and `launchEnvironment` **must be set before** calling `launch()`. Changes after launch are silently ignored.
- The `-` / `UserDefaults` convention is **not enforced** by XCTest — your app must explicitly read `ProcessInfo`. If the app ignores these, tests will fail silently.
- `terminate()` + `launch()` is expensive (~seconds). Prefer `setUp()` once per class and share state across related test methods.
- `XCUIApplication()` defaults to the primary target. Multi-app test bundles need explicit initializers.
- State resets on each `launch()`. If you need persistent state across launches, use `launchEnvironment` to restore it.

## Composition Hints
- Pair with **xcuitest-element-finding** to locate UI elements after launch.
- Pair with **xcuitest-interactions** to tap/type/swipe after the app is running.
- Use `setUp()` / `tearDown()` class methods (`override class func setUp()`) for one-time launch config shared across the entire test class.
