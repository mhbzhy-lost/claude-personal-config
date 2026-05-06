---
name: xcuitest-assertions-waits
description: XCUITest wait strategies and assertions — waitForExistence, XCTNSPredicateExpectation, XCTWaiter, and XCTest assertions for UI test synchronization
tech_stack: [ios]
language: [swift, objc]
capability: [integration-testing, unit-testing]
version: "XCTest/XCUITest unversioned"
collected_at: 2025-07-14
---

# XCUITest Assertions & Waits

> Source: https://developer.apple.com/documentation/xctest/xctestcase, https://developer.apple.com/documentation/xctest/xctnspredicateexpectation, https://developer.apple.com/documentation/xcuiautomation/xcuielement, https://developer.apple.com/documentation/xctest

## Purpose
Reliable UI test synchronization: wait for elements to appear, disappear, or change state, then assert properties. Prevents flaky tests caused by racing against animations, network responses, or async UI updates.

## When to Use
- Waiting for a UI element to appear after navigation or animation completes
- Waiting for an element to disappear (spinner, loading overlay, toast)
- Waiting for element state changes (label text updates, enabled/disabled state)
- Asserting element existence, hittability, and property values after async operations
- Polling for custom conditions not expressible as a single NSPredicate
- CI pipelines where slower simulators need longer timeouts

## Basic Usage

### Primary pattern: waitForExistence then act
```swift
let button = app.buttons["Submit"]
XCTAssertTrue(button.waitForExistence(timeout: 5.0), "Submit button did not appear")
button.tap()
```

### Wait for disappearance (Xcode 16+)
```swift
let spinner = app.activityIndicators["LoadingSpinner"]
XCTAssertTrue(spinner.waitForNonExistence(timeout: 10.0))
```

### State change via XCTNSPredicateExpectation
```swift
let label = app.staticTexts["StatusLabel"]
let predicate = NSPredicate(format: "label == %@", "Complete")
let expectation = XCTNSPredicateExpectation(predicate: predicate, object: label)
let result = XCTWaiter().wait(for: [expectation], timeout: 10.0)
XCTAssertEqual(result, .completed)
```

### Set default timeout once in setUp
```swift
override func setUp() {
    super.setUp()
    continueAfterFailure = true   // keep running after individual failure
    defaultTimeout = 8.0          // applied when no explicit timeout given
}
```

## Key APIs (Summary)

| API | Purpose |
|-----|---------|
| `XCUIElement.waitForExistence(timeout:) -> Bool` | Block until element exists + is hittable. Most common wait. |
| `XCUIElement.waitForNonExistence(timeout:) -> Bool` | Block until element disappears. Xcode 16+. |
| `XCTNSPredicateExpectation(predicate:object:)` | Poll NSPredicate against an object. Use for label/count/value changes. |
| `XCTWaiter.wait(for:timeout:) -> Result` | Low-level waiter. Returns `.completed`, `.timedOut`, `.interrupted`, etc. |
| `XCTWaiter.wait(for:timeout:enforceOrder:)` | Ordered wait — expectations must fulfill in array order. |
| `XCTestCase.wait(for:timeout:)` | Convenience wrapper around XCTWaiter. |
| `XCTestCase.defaultTimeout` | Fallback timeout for `waitForExistence` with no explicit arg. |
| `XCTAssertTrue/False/Equal/Nil/NotNil/ThrowsError/NoThrow` | Standard assertion macros. |
| `XCTUnwrap(_:)` | Unwraps optional, throws if nil. Use with `try`. |
| `XCTFail(_:)` | Unconditional failure with message. |

## Caveats

- **waitForExistence checks hittability too**: an off-screen element may exist but not be hittable → returns false. Use predicate-based wait if you only need existence.
- **~60 Hz polling**: XCTNSPredicateExpectation polls at display refresh rate; extremely fast state changes may be missed.
- **Don't use waitForExistence for negative checks**: for "element should disappear," use `waitForNonExistence` (Xcode 16+) or an NSPredicate with `exists == false`.
- **XCTWaiter blocks the main thread**: don't call from async contexts without understanding blocking implications.
- **XCTUnwrap requires try**: otherwise the test crashes at runtime, not as a clean failure.
- **enforceOrder: true is strict**: expectations must fulfill in exact array order; a single early fulfillment of the wrong expectation causes `.incorrectOrder`.
- **Handler short-circuit**: XCTNSPredicateExpectation's `handler` (returns Bool) can be set to fail fast — return `false` to immediately fail the expectation.

## Composition Hints

- **Set `defaultTimeout` once in setUp()** of a base test class — all tests inherit it.
- **Chain with interaction skills**: wait for element → tap/typeText (see xcuitest-interactions).
- **Combine with launch config**: pass launch arguments to control mock server delays, then tune timeouts accordingly.
- **Prefer predicate expectations over Timer polling**: predicate expectations are integrated with the run loop and more efficient. Use Timer only for truly custom logic.
- **Use XCTWaiter directly for result inspection**: when you need to branch on `.timedOut` vs `.interrupted` vs `.completed`, use XCTWaiter instead of XCTestCase.wait(for:).
