---
name: arkxtest-project-setup
description: Set up arkXtest (hypium + UiTest) test modules in DevEco Studio for HarmonyOS/OpenHarmony ArkUI applications, covering ohosTest directory structure, test runner configuration, and hdc-based CLI execution.
tech_stack: [harmonyos]
language: [arkts, typescript, python]
capability: [unit-testing, integration-testing, ci-cd]
version: "OpenHarmony arkXtest API 8+"
collected_at: 2025-01-15
---

# arkXtest Project Setup

> Source: https://raw.githubusercontent.com/openharmony/testfwk_arkxtest/master/README_en.md, https://developer.huawei.com/consumer/en/doc/harmonyos-guides-V5/arkxtest-guidelines-V5, https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/hypium-python-guidelines

## Purpose
arkXtest is the automated test framework of OpenHarmony, providing both JsUnit (unit testing) and UiTest (UI automation). This skill covers project initialization, directory structure, and test runner setup needed to write and execute UI tests for ArkUI/ArkTS applications.

## When to Use
- Creating a new test module (ohosTest) in a DevEco Studio HarmonyOS project
- Configuring the OpenHarmonyTestRunner or Python hypium CLI for test execution
- Integrating arkXtest UI tests into CI/CD pipelines via hdc
- Understanding the two-tier architecture (ArkTS @kit.TestKit + Python hypium)

## Basic Usage

### Architecture
arkXtest has a two-tier design:
- **ArkTS side (@kit.TestKit)**: In-process test scripts using `@ohos/hypium`, running inside the device sandbox
- **Python side (hypium)**: Host-side Python framework driving tests via `hdc` (HarmonyOS Device Connector)

### Enabling UiTest on Device
```shell
hdc_std shell param set persist.ace.testmode.enabled 1
```

### Test Structure (BDD-style)
Tests use describe/it blocks imported from `@ohos/hypium`:

```typescript
import { describe, beforeAll, beforeEach, afterEach, afterAll, it, expect } from '@ohos/hypium'

export default async function abilityTest() {
  describe('MyTestSuite', function () {
    beforeAll(function () { /* setup once */ })
    beforeEach(function () { /* before each test */ })
    afterEach(function () { /* after each test */ })
    afterAll(function () { /* teardown once */ })

    it('test_case_1', 0, function () {
      expect(1 + 1).assertEqual(2)
    })
  })
}
```

### Lifecycle Hooks
| Hook | Timing |
|------|--------|
| `beforeAll` | Once before all test cases in the suite |
| `beforeEach` | Before each individual test case |
| `afterEach` | After each individual test case |
| `afterAll` | Once after all test cases complete |

### Key Assertions (via expect())
| API | Checks |
|-----|--------|
| `assertEqual` | Actual equals expected |
| `assertTrue` / `assertFalse` | Boolean value |
| `assertContain` | Actual contains expected substring/element |
| `assertClose` | Numeric proximity within tolerance |
| `assertInstanceOf` | Value is of specified type |
| `assertNull` / `assertUndefined` | Value is null/undefined |
| `assertLarger` / `assertLess` | Greater-than / less-than |
| `assertThrowError` | Function throws expected error |

## Key APIs (Summary)
- `describe(name, fn)` — test suite container
- `it(name, filter, fn)` — individual test case (filter=0 for unconditional)
- `expect(value)` — assertion entry; chain with assert methods
- `UiDriver.create()` — UiTest entry point (see arkxtest-on-component)

## Caveats
- **API version floor**: Initial APIs require API 8+; newer APIs need higher versions
- **hypium npm version**: Must match target API level in `package.info`
- **Sandbox constraints**: Tests run inside app sandbox — permissions needed for system-level operations
- **Async requirement for UiTest**: All UiDriver/UiComponent APIs are Promise-based and require `await`; test cases must be async
- **Device test mode**: `persist.ace.testmode.enabled` must be set to 1 before UiTest execution
- **Source gaps**: The arkxtest-guidelines-V5 and hypium-python-guidelines sources were unavailable at collection time; refer to latest developer.huawei.com docs for DevEco Studio-specific setup details

## Composition Hints
- Pair with `arkxtest-on-component` for component locating APIs (BY, findComponent)
- Pair with `arkxtest-driver-interactions` for click/swipe/inputText operations
- Pair with `arkxtest-assertions` for UiComponent property assertions and Toast waiting
- For Python-side hypium usage, combine with Python test framework skills
