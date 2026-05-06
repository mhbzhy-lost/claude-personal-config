---
name: arkxtest-assertions
description: Hypium assertion APIs for validating UI component properties, application state, and test outcomes in HarmonyOS arkxtest UI automation tests.
tech_stack: [harmonyos]
language: [arkts]
capability: [unit-testing, e2e-testing]
version: "OpenHarmony arkxtest API 8+"
collected_at: 2025-01-01
---

# arkxtest Assertions

> Source: https://raw.githubusercontent.com/openharmony/testfwk_arkxtest/master/README_en.md

## Purpose
Provide the complete set of hypium assertion APIs (`expect().assertXxx()`) for verifying test outcomes in arkxtest UI automation and JsUnit unit tests on HarmonyOS. Covers equality, containment, type checking, comparison, truthiness, null/undefined checking, and error-throwing assertions — plus UiDriver-level `assertComponentExist`.

## When to Use
- Verifying UI component properties after interaction: `getText()`, `isEnabled()`, component presence
- Asserting that a component exists on screen via `driver.assertComponentExist(BY.xxx)`
- Waiting for async UI changes (Toast, dialog) — combine `delayMs` polling with assertions
- Validating numeric proximity with tolerance via `assertClose`
- Type-checking values with `assertInstanceOf`
- Verifying error conditions with `assertThrowError`
- Any test case inside a `describe`/`it` block that needs pass/fail evaluation

## Basic Usage

### Import and Structure

```typescript
import { describe, it, expect } from '@ohos/hypium'

export default async function abilityTest() {
  describe('MyTestSuite', function () {
    it('myTestCase', 0, function () {
      let actual = someFunction()
      expect(actual).assertEqual('expected')
    })
  })
}
```

### Common Assertion Patterns

```typescript
// Equality
expect(result).assertEqual('hello')

// Truthiness
expect(found).assertTrue()
expect(empty).assertFalse()

// Containment
expect('hello world').assertContain('world')

// Numeric proximity (tolerance)
expect(100).assertClose(99, 0.1)   // |100-99| <= 0.1 ✓
expect(100).assertClose(1, 0.1)    // |100-1| = 99 > 0.1 ✗

// Null/undefined checks
expect(value).assertNull()
expect(value).assertUndefined()

// Type checking (string type name required)
expect('strTest').assertInstanceOf('String')

// Comparisons
expect(10).assertLarger(5)
expect(3).assertLess(5)
```

### UI Component Assertions

```typescript
import { BY, UiDriver, UiComponent } from '@ohos.uitest'
import { describe, it, expect } from '@ohos/hypium'

export default async function abilityTest() {
  describe('UI Assertions', function () {
    it('assert_button_text', 0, async function (done) {
      try {
        let driver = await UiDriver.create()
        let button = await driver.findComponent(BY.text('Submit'))
        await button.click()
        let content = await button.getText()
        expect(content).assertEqual('clicked!')
      } finally {
        done()
      }
    })

    it('assert_component_exists', 0, async function (done) {
      try {
        let driver = await UiDriver.create()
        await driver.assertComponentExist(BY.text('hello'))
      } finally {
        done()
      }
    })
  })
}
```

### Toast/Dialog Waiting Pattern

```typescript
it('wait_for_toast_and_assert', 0, async function (done) {
  try {
    let driver = await UiDriver.create()
    // Trigger action that shows toast
    await driver.findComponent(BY.text('Show Toast')).click()
    // Poll until toast appears
    let toast = null
    for (let i = 0; i < 10; i++) {
      await driver.delayMs(500)
      try {
        toast = await driver.findComponent(BY.text('Operation successful'))
        break
      } catch (e) { /* not found yet */ }
    }
    expect(toast !== null).assertTrue()
  } finally {
    done()
  }
})
```

## Key APIs (Summary)

| API | Signature | Purpose |
|-----|-----------|---------|
| `assertEqual` | `expect(actual).assertEqual(expected)` | Strict equality check |
| `assertClose` | `expect(actual).assertClose(expected, tolerance)` | Numeric proximity |
| `assertContain` | `expect(actual).assertContain(expected)` | Substring/element containment |
| `assertTrue` | `expect(actual).assertTrue()` | Boolean true check |
| `assertFalse` | `expect(actual).assertFalse()` | Boolean false check |
| `assertNull` | `expect(actual).assertNull()` | Null check |
| `assertUndefined` | `expect(actual).assertUndefined()` | Undefined check |
| `assertInstanceOf` | `expect(actual).assertInstanceOf('TypeName')` | Type check (string name) |
| `assertLarger` | `expect(actual).assertLarger(expected)` | Greater-than comparison |
| `assertLess` | `expect(actual).assertLess(expected)` | Less-than comparison |
| `assertThrowError` | `expect(fn).assertThrowError(expectedMsg)` | Error throw verification |
| `assertFail` | `expect().assertFail()` | Unconditional failure |
| `assertComponentExist` | `driver.assertComponentExist(BY.xxx)` | UiDriver-level component presence assertion |

## Caveats
- **`assertClose` requires two numeric arguments**: expected value AND proximity tolerance. Passing `null` for either causes failure.
- **`assertInstanceOf` takes a string**: use `'String'`, `'Number'`, not constructor references like `String`.
- **The `it()` filter parameter is required**: second argument (typically `0`) cannot be omitted, even if unused.
- **All assertions go through `expect()`**: there are no standalone assertion functions — `expect(value).assertXxx()` is the only pattern.
- **Missing components throw before assertion**: if `driver.findComponent()` fails, the test throws before reaching your `expect()`. Use `assertComponentExist()` for existence checks.
- **Async UI (Toast, dialog) needs polling**: assertions on transient UI elements must be preceded by a `delayMs` polling loop — the element may not exist yet when you check.
- **UI test cases must be async**: all `it` blocks using UiDriver APIs must use `async function` with `done()` callback or `async`/`await`.

## Composition Hints
- Pair with `arkxtest-on-component` for `BY` locator patterns used in `assertComponentExist` and `findComponent` before property assertions.
- Pair with `arkxtest-driver-interactions` — perform an interaction, then assert the resulting UI state.
- Use `driver.delayMs()` between triggering an action and asserting async UI changes (Toast, dialog, navigation).
- For multi-step validations, chain multiple `expect()` calls within a single `it` block — the first failure stops the test.
