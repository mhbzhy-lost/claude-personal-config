---
name: compose-ui-testing-actions
description: Simulate user input on Compose UI elements — clicks, text input, scrolling, touch gestures, key presses, and custom semantics actions.
tech_stack: [compose]
language: [kotlin]
capability: [integration-testing]
version: "Jetpack Compose ui-test 1.0.0+"
collected_at: 2026-05-01
---

# Compose UI Testing — Actions

> Source: https://developer.android.com/develop/ui/compose/testing/apis, https://developer.android.com/reference/kotlin/androidx/compose/ui/test/SemanticsNodeInteraction, https://developer.android.com/reference/kotlin/androidx/compose/ui/test/TouchInjectionScope

## Purpose
Actions inject simulated user events — clicks, text entry, scrolls, touch gestures, key presses — onto Compose UI elements found by finders.

## When to Use
- Simulating taps/clicks on buttons, toggles, or links.
- Entering text into text fields via IME-style injection.
- Scrolling to off-screen items in `LazyColumn`/`LazyRow` before interacting with them.
- Performing swipe, pinch, long-press, or custom touch gestures.
- Sending key events to focused components.
- Invoking custom semantics actions defined by composables.

## Basic Usage

```kotlin
// Click
composeTestRule.onNodeWithText("Submit").performClick()

// Text input
composeTestRule.onNode(hasSetTextAction()).performTextInput("Hello")

// Scroll then click
composeTestRule.onNodeWithText("Item 50").performScrollTo().performClick()

// Touch gesture (swipe up)
composeTestRule.onNodeWithTag("list").performTouchInput { swipeUp() }

// Key press
composeTestRule.onNode(isFocused()).performKeyPress(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER))
```

**Critical rule:** You CANNOT chain multiple actions inside a single `perform…()` block. Each action must be a separate call:

```kotlin
// ✅ Correct — separate calls
composeTestRule.onNodeWithText("Field").performClick().performTextInput("text")

// ❌ Wrong — chaining inside performTouchInput doesn't work for non-touch actions
```

## Key APIs (Summary)

### High-frequency actions
| Action | What it does |
|--------|-------------|
| `performClick()` | Tap/click the element. Returns `SemanticsNodeInteraction` for chaining. |
| `performTextInput("text")` | Inject text IME-style. Requires node to have `SetText` semantics action. |
| `performTextClearance()` | Clear text IME-style. |
| `performTextReplacement("text")` | Replace existing text IME-style. |
| `performScrollTo()` | Scroll the nearest scroll parent so this node is fully visible in the viewport. |
| `performImeAction()` | Send the IME action (Done, Search, etc.) associated with the node. |

### Scroll-to-item actions
| Action | Use case |
|--------|---------|
| `performScrollToIndex(index)` | `LazyColumn` — scroll to item by index. |
| `performScrollToKey(key)` | `LazyColumn`/`LazyRow` — scroll to keyed item. |
| `performScrollToNode(matcher)` | Scroll to content matching a `SemanticsMatcher`. |

### Other actions
| Action | What it does |
|--------|-------------|
| `performKeyPress(keyEvent)` | Send a `KeyEvent` to the focused node. Returns `Boolean`. |
| `performFirstLinkClick(predicate)` | Click a link inside a `Text` composable. |
| `performSemanticsAction(key)` | Invoke a custom semantics action. |
| `requestFocus()` | Request focus via `RequestFocus` semantics action. |
| `performTouchInput { … }` | Inject raw touch gestures (see below). |
| `performMouseInput { … }` | Inject mouse gestures. |
| `performKeyInput { … }` | Inject key gestures with timing control. |

### Deprecated
`performGesture { … }` — replaced by `performTouchInput` in 1.1.0. Use `TouchInjectionScope` instead of `GestureScope`.

## TouchInjectionScope (since 1.1.0)

Receiver scope for `performTouchInput { … }`. All coordinates are in the **node's local coordinate system** (px): `(0, 0)` = top-left.

### Coordinate helpers (properties on the scope)
```kotlin
topLeft, topRight, bottomLeft, bottomRight, center
topCenter, bottomCenter, centerLeft, centerRight
left, right, top, bottom   // Float
centerX, centerY            // Float
width, height               // Int
visibleSize                 // IntSize (clipped)
```

### Smart offset: `percentOffset`
```kotlin
percentOffset(0.5f, 0.5f)  // center of the node
percentOffset(0f, 0.1f)    // 10% down from top-left
```

### Built-in full gestures
```kotlin
// Single-tap gestures
click(center)                        // tap at center (default)
doubleClick(center, delayMillis=100) // double tap
longClick(center, durationMillis=500)// long press

// Directional swipes (along center axis)
swipeUp(startY=bottom, endY=top, durationMillis=200)
swipeDown(startY=top, endY=bottom, durationMillis=200)
swipeLeft(startX=right, endX=left, durationMillis=200)
swipeRight(startX=left, endX=right, durationMillis=200)

// Custom swipe
swipe(start=Offset, end=Offset, durationMillis=200)
swipeWithVelocity(start, end, endVelocity, durationMillis)

// Multi-touch
pinch(start0, end0, start1, end1, durationMillis=200)
multiTouchSwipe(curves, durationMillis, keyTimes)
```

### Raw touch primitives (for custom gestures)
```kotlin
down(position)                          // pointer 0 down (starts gesture)
down(pointerId, position)               // named pointer down
moveTo(position, delayMillis)           // move pointer 0 to absolute position
moveBy(delta, delayMillis)              // move pointer 0 by relative delta
move(delayMillis)                       // send move event without changing position
updatePointerTo(pointerId, position)    // change position without sending event
updatePointerBy(pointerId, delta)       // change position by delta, no event
up(pointerId=0)                         // pointer up
cancel()                                // abort gesture
advanceEventTime(millis)                // delay next event
currentPosition(pointerId=0)            // where is this pointer now?
```

### Custom gesture example: L-shaped path
```kotlin
composeTestRule.onNodeWithTag("canvas").performTouchInput {
    down(topLeft)
    // move down the left edge
    repeat(5) { moveBy(percentOffset(0f, 0.1f)) }
    moveTo(centerLeft)
    // move right along the center
    repeat(5) { moveBy(percentOffset(0.1f, 0f)) }
    moveTo(center)
    up()
}
```

### Event batching behavior
All events in a `performTouchInput` block are **batched** and dispatched together after the block completes. This means:
- No recomposition happens mid-gesture within a single block.
- The event injection state is **shared** across ALL `perform.*Input` calls — you can spread a gesture across multiple blocks.
- **Pitfall:** If a gesture spans multiple `performTouchInput` blocks, recomposition/layout may occur between them. Since pointer positions are in the node's local coordinate system, subsequent blocks on a different node will report different `currentPosition` for the same screen location.

## Caveats
- **No action chaining inside perform blocks.** Chain at the `SemanticsNodeInteraction` level: `.performClick().performTextInput("x")`.
- **`performGesture` is deprecated.** Always use `performTouchInput` with `TouchInjectionScope`.
- **Scroll before interacting with off-screen items.** `performScrollTo()` is your first call before `performClick()` on items in `LazyColumn`.
- **`performTextInput` needs `SetText` semantics action.** Not all composables have it. Use `hasSetTextAction()` matcher to find text fields.
- **Multi-block gestures risk targeting drift.** If splitting a gesture across `performTouchInput` calls, be aware coordinates are node-local and the node may move between blocks.
- **Cache `fetchSemanticsNode()` results.** Each call synchronizes with the UI; if accessing properties multiple times, cache the node.

## Composition Hints
- Combine with finders: `onNodeWithText("…").performClick().assertIsOn()`.
- For scrollable lists: `onNodeWithText("Item 99").performScrollTo().performClick()`.
- Test swipe-to-dismiss: `onNodeWithTag("dismissable").performTouchInput { swipeLeft() }`.
- Test text entry flows: `onNode(hasSetTextAction()).performTextInput("query").performImeAction()`.
