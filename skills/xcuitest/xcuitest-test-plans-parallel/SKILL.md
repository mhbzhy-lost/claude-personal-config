---
name: xcuitest-test-plans-parallel
description: Xcode Test Plans for multi-configuration testing, selective test execution, and parallel CI runs via xcodebuild
tech_stack: [ios]
language: [swift, objc]
capability: [ci-cd, integration-testing]
version: "Xcode"
collected_at: 2025-07-14
---

# XCUITest Test Plans & Parallel Execution

> Source: https://developer.apple.com/documentation/xcode/organizing-tests-to-improve-feedback, https://developer.apple.com/documentation/xcode/running-tests-and-interpreting-results, https://developer.apple.com/documentation/xctest/xctestcase/runsforeachtargetapplicationuiconfiguration

## Purpose
Declarative test configuration via `.xctestplan` files — run the same test suite across multiple configurations (locales, environments, arguments), selectively skip flaky tests, and execute tests in parallel across many simulators for fast CI feedback.

## When to Use
- Running UI tests against multiple backend environments or feature-flag combinations
- Localization testing: same test suite, multiple `-AppleLanguages` arguments
- Parallel CI: splitting large test suites across 3–6 simulators
- Temporarily skipping flaky tests without commenting out code
- Separating smoke tests (fast, every commit) from full regression (nightly)
- Consistent xcodebuild-driven test execution in headless CI

## Basic Usage

### Create a minimal test plan (Smoke.xctestplan)
```json
{
  "configurations": [
    {
      "name": "Default",
      "options": {
        "targetForVariableExpansion": {
          "containerPath": "container:MyApp.xcodeproj",
          "name": "MyApp"
        }
      }
    }
  ],
  "testTargets": [
    {
      "target": { "containerPath": "container:MyApp.xcodeproj", "name": "MyUITests_Smoke" }
    }
  ]
}
```

### Multi-configuration: locales
```json
{
  "configurations": [
    {
      "name": "English",
      "options": {
        "defaultOptions": {
          "commandLineArgumentEntries": [
            { "argument": "-AppleLanguages (en)" }
          ]
        }
      }
    },
    {
      "name": "Arabic",
      "options": {
        "defaultOptions": {
          "commandLineArgumentEntries": [
            { "argument": "-AppleLanguages (ar)" }
          ]
        }
      }
    }
  ],
  "testTargets": [
    {
      "target": { "containerPath": "container:MyApp.xcodeproj", "name": "MyUITests" }
    }
  ]
}
```

### Skip flaky tests without editing code
```json
{
  "testTargets": [
    {
      "target": { "containerPath": "container:MyApp.xcodeproj", "name": "MyUITests" },
      "skippedTests": [
        "MyUITests/TestFlakyAnimation/testFlakyTransition",
        "MyUITests/TestPayment/testApplePaySetup"
      ]
    }
  ]
}
```

### CI: build once, test in parallel
```bash
# Step 1: Build
xcodebuild build-for-testing \
  -workspace MyApp.xcworkspace -scheme MyScheme \
  -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.0' \
  -derivedDataPath ./DerivedData

# Step 2: Run in parallel on 3 simulators
xcodebuild test-without-building \
  -workspace MyApp.xcworkspace -scheme MyScheme \
  -testPlan FullTests \
  -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.0' \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro,OS=18.0' \
  -destination 'platform=iOS Simulator,name=iPhone SE (3rd generation),OS=18.0' \
  -parallel-testing-enabled YES \
  -parallel-testing-worker-count 3 \
  -resultBundlePath ./results.xcresult
```

### Opt out of per-configuration re-execution
```swift
class MyLoginTests: XCTestCase {
    // Don't re-run for each test plan configuration
    override class var runsForEachTargetApplicationUIConfiguration: Bool {
        return false
    }

    func testLogin() { /* ... */ }
}
```

## Key APIs (Summary)

| API / Concept | Purpose |
|---------------|---------|
| `.xctestplan` file | Declarative JSON config for test execution — configurations, targets, skip/select rules. |
| `xcodebuild -testPlan <name>` | Run tests using a specific test plan from CLI. |
| `xcodebuild -parallel-testing-enabled YES` | Enable parallel distribution of test bundles across destinations. |
| `xcodebuild -parallel-testing-worker-count N` | Limit concurrent simulator workers (default: auto). |
| `xcodebuild build-for-testing` / `test-without-building` | Separate build and test phases for CI — build once, test many. |
| `runsForEachTargetApplicationUIConfiguration` | Class property (default `true` for XCUITest). Set `false` to avoid N× execution per config count. |
| `testExecutionConfiguration.run_order` | `"random"` to surface order dependencies; `"strict"` for deterministic order. |
| `testExecutionConfiguration.testTimeLimit` | Per-test timeout in seconds. |
| `selectedTests` / `skippedTests` | Per-target arrays of test identifiers to include/exclude. |
| `defaultOptions.commandLineArgumentEntries` | Launch arguments passed to the app for this configuration. |
| `defaultOptions.environmentVariableEntries` | Environment variables passed to the app for this configuration. |

## Caveats

- **Parallelism is at the bundle level**: tests within a single bundle run sequentially on one simulator. Split large bundles into multiple targets to maximize parallelism.
- **runsForEachTargetApplicationUIConfiguration is true by default**: a test plan with 3 configurations × 20 test cases = 60 executions. Disable it when configurations don't affect your test.
- **Simulators must be available**: xcodebuild auto-boots them, but they must be pre-created (`xcrun simctl create`). CI images should pre-warm commonly used simulators.
- **Test data is NOT shared**: each parallel worker gets its own simulator instance with separate app sandboxes.
- **Worker count ≤ CPU cores**: exceeding core count causes thrashing. Let Xcode auto-detect unless you have a specific reason.
- **`-testPlan` needs scheme association**: the scheme must reference the test plan. Schemes using direct "Test" target selection ignore `-testPlan`.
- **xctestplan is JSON, so merge conflicts happen**: keep plans small and focused. One plan per purpose (smoke, full, per-locale).
- **`testTimeLimit` is per individual test**: a single slow test crossing the limit fails immediately. Set generously for UI tests (they're inherently slower).
- **`run_order: "random"` is non-deterministic**: great for surfacing flaky order dependencies, bad for bisecting failures. Use `"strict"` for reproducible CI runs.

## Composition Hints

- **Build once, test many**: use `build-for-testing` → `test-without-building` in CI. Parallel destinations share the same `.xctestrun` bundle.
- **Per-environment test plans**: create separate plans for staging vs production backends, setting `API_BASE_URL` via environment variables.
- **Smoke plan for PRs, full plan for merge**: smoke plan runs a fast subset (<5 min), full plan runs overnight.
- **Combine with launch-config skill**: test plan configurations set launch arguments/environments; the app side reads them via `ProcessInfo` (see xcuitest-launch-config).
- **Result bundles per plan**: use `-resultBundlePath` with a unique path per test plan to avoid overwriting results.
