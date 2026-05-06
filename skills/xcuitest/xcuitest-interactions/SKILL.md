---
name: xcuitest-interactions
description: Simulate user gestures in XCUITest — tap, type, swipe, long-press, drag, pinch, rotate, and adjust sliders/pickers.
tech_stack: [ios]
language: [swift]
capability: [e2e-testing]
version: "XCTest unversioned"
collected_at: 2025-07-17
---

# XCUITest Interactions

> Source: Apple Developer Documentation – XCUIElement tap/typeText/swipe/gesture APIs

## Purpose
Simulate real user gestures on found UI elements. All interactions are **synchronous** — they block until the UI settles or a timeout fires.

## When to Use
- Tapping buttons, toggling switches, selecting cells/rows.
- Typing text into `textField`, `secureTextField`, or `textView`.
- Swiping to scroll lists, reveal delete actions, or navigate pages.
- Long-pressing to trigger context menus or drag handles.
- Adjusting sliders and picker wheels to specific values.
- Multi-finger gestures (pinch, rotate, two-finger tap) for maps and zoomable content.
- Drag-and-drop between elements using coordinate-based interactions.

## Basic Usage
```swift
let app = XCUIApplication()
app.launch()

// Tap
app.buttons["Submit"].tap()

// Type text
let email = app.textFields["emailField"]
email.tap()
email.typeText("user@example.com")

// Swipe
app.tables.cells.element(boundBy: 0).swipeLeft()  // reveal actions
app.scrollViews.firstMatch.swipeUp()              // scroll

// Long press
app.images["Avatar"].press(forDuration: 1.5)

// Slider & picker
app.sliders["volume"].adjust(toNormalizedSliderPosition: 0.75)
app.pickerWheels.element.adjust(toPickerWheelValue: "Medium")

// Drag and drop
let src = app.images["DragMe"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
let dst = app.cells["DropZone"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
src.press(forDuration: 0.5, thenDragTo: dst)
```

## Key APIs (Summary)

### XCUIElement gesture methods

| API | Description |
|-----|-------------|
| `.tap()` | Single tap at element center |
| `.tap(withNumberOfTaps:touches:)` | Multi-tap, multi-finger tap |
| `.doubleTap()` | Two-finger double-tap (system gesture) |
| `.twoFingerTap()` | Single two-finger tap |
| `.press(forDuration:)` | Long press / force touch |
| `.press(forDuration:thenDragTo:)` | Long press then drag to another element |
| `.typeText(_:)` | Types string character-by-character via software keyboard |
| `.swipeUp() / .swipeDown() / .swipeLeft() / .swipeRight()` | Directional swipe |
| `.pinch(withScale:velocity:)` | Pinch-to-zoom gesture |
| `.rotate(_:withVelocity:)` | Rotation gesture (radians) |
| `.adjust(toNormalizedSliderPosition:)` | Set slider to 0.0–1.0 position |
| `.adjust(toPickerWheelValue:)` | Select picker wheel item by title |

### Coordinate-based interaction

| API | Description |
|-----|-------------|
| `.coordinate(withNormalizedOffset:)` | Returns `XCUICoordinate` for pixel-precise work |
| `XCUICoordinate.tap() / press(forDuration:)` | Tap/press at exact point |
| `XCUICoordinate.press(forDuration:thenDragTo:)` | Drag from one coordinate to another |
| `.screenPoint: CGPoint` | Absolute screen coordinate |

## Caveats
- **Tap before typing** — `typeText()` requires keyboard focus. Always `.tap()` the field first. For `secureTextField`, the software keyboard must be available (disable hardware keyboard in Simulator → I/O → Keyboard).
- **Hardware keyboard breaks typing** — `typeText()` behaves unpredictably when Simulator's "Connect Hardware Keyboard" is enabled. Disable it.
- **Swipes need scrollable containers** — swiping on a non-scrollable element is a no-op. Target `.scrollViews`, `.tables`, or `.collectionViews`.
- **Coordinate APIs bypass accessibility** — fragile across screen sizes. Keep as a last resort when no accessibility element exists.
- **Interactions block synchronously** — if an animation or network call is in-flight, interactions time out. Use `waitForExistence(timeout:)` on the target element first.
- **System alerts live in a separate process** — use `addUIInterruptionMonitor` to handle permission dialogs; direct `.tap()` on alert buttons won't work across process boundaries.
- **Element type affects gesture availability** — `.adjust(toNormalizedSliderPosition:)` only works on `.slider` elements. The system infers `ElementType` from accessibility traits; set `accessibilityTraits = .button` in production code for custom buttons.

## Composition Hints
- Depends on **xcuitest-element-finding** to locate elements before interacting.
- Pair with **xcuitest-launch-config** to set up the app state before gesture sequences.
- For swipe-to-delete: `.swipeLeft()` on the cell, then `.tap()` the revealed "Delete" button (find it on the cell, not the table).
