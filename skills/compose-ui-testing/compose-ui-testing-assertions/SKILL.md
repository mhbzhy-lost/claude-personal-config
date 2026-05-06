---
name: compose-ui-testing-assertions
description: Assert on Compose UI semantics nodes — visibility, text, toggle states, click actions, layout geometry, and collection-level checks.
tech_stack: [compose]
language: [kotlin]
capability: [integration-testing]
version: "Compose UI Testing 1.0.0"
collected_at: 2026-05-01
---

# Compose UI Testing — Assertions

> Source: https://developer.android.com/develop/ui/compose/testing/apis, https://developer.android.com/reference/kotlin/androidx/compose/ui/test/SemanticsNodeInteraction, https://developer.android.com/reference/kotlin/androidx/compose/ui/semantics/SemanticsNode

## Purpose

Assertions validate that Compose UI elements exist, are visible, contain correct text, have expected states (enabled/disabled, toggled, focused, selected), and are positioned correctly. All assertions operate on a `SemanticsNodeInteraction` obtained from a finder like `onNode`, `onNodeWithText`, etc. The assertion system is backed by the Compose semantics tree — each composable that emits semantics exposes key/value properties tests can inspect.

## When to Use

- Verifying a composable is present and visible after navigation or state changes
- Checking text/content description values match expected data
- Validating toggle/checkbox/switch states (on/off)
- Confirming click actions exist on interactive elements
- Inspecting layout geometry (position, size) in the Compose hierarchy
- Asserting counts and properties across collections of nodes
- Debugging the semantics tree with `printToLog()` / `printToString()`
- Verifying a node has been removed from the hierarchy

## Basic Usage

### Visibility & existence

```kotlin
// Verify a node is displayed on screen
composeTestRule.onNodeWithText("Welcome").assertIsDisplayed()

// Verify a node is NOT displayed
composeTestRule.onNodeWithText("Error").assertIsNotDisplayed()

// Verify a node exists in the tree (synchronizes with UI)
composeTestRule.onNodeWithText("Loading...").assertExists()

// Verify a node is gone after an action
composeTestRule.onNodeWithText("Loading...").assertDoesNotExist()
```

### Text assertions

```kotlin
// Exact text match
composeTestRule.onNodeWithText("Continue").assertTextEquals("Continue")

// Substring match (default: substring=true)
composeTestRule.onNodeWithTag("result").assertTextContains("success")

// Case-insensitive match
composeTestRule.onNodeWithTag("result").assertTextContains("success", ignoreCase = true)

// Content description checks
composeTestRule.onNodeWithContentDescription("Close dialog")
    .assertContentDescriptionEquals("Close dialog")
```

### Toggle / checkbox state assertions

```kotlin
composeTestRule.onNode(isToggleable()).assertIsOn()        // checked
composeTestRule.onNode(hasTestTag("darkMode")).assertIsOff() // unchecked

composeTestRule.onNodeWithText("Subscribe")
    .assertIsToggleable()
    .assertIsEnabled()
```

### Click action existence

```kotlin
composeTestRule.onNodeWithText("Submit").assertHasClickAction()
composeTestRule.onNodeWithText("Disabled").assertHasNoClickAction()
```

### Focus & selection

```kotlin
composeTestRule.onNodeWithTag("searchField").assertIsFocused()
composeTestRule.onNodeWithTag("item-3").assertIsSelected()
```

### Layout position & size

```kotlin
// Position of inner element (needs useUnmergedTree when parent merges semantics)
composeTestRule.setContent {
    Box(Modifier.testTag("box").padding(16.dp)) {
        Box(Modifier.testTag("icon").size(48.dp))
    }
}
composeTestRule.onNodeWithTag("icon", useUnmergedTree = true)
    .assertLeftPositionInRootIsEqualTo(16.dp)
    .assertTopPositionInRootIsEqualTo(16.dp)

// Combined position check
composeTestRule.onNodeWithTag("icon", useUnmergedTree = true)
    .assertPositionInRootIsEqualTo(16.dp, 16.dp)

// Size checks
composeTestRule.onNodeWithTag("icon")
    .assertWidthIsEqualTo(48.dp)
    .assertHeightIsEqualTo(48.dp)

// Minimum size
composeTestRule.onNodeWithTag("button").assertWidthIsAtLeast(64.dp)
```

### Collection assertions (on `onAllNodes`, `onChildren`, etc.)

```kotlin
// Exact count
composeTestRule.onAllNodesWithContentDescription("Beatle").assertCountEquals(4)

// At least one matches
composeTestRule.onAllNodesWithContentDescription("Beatle").assertAny(hasClickAction())

// All match
composeTestRule.onAllNodesWithContentDescription("Beatle").assertAll(hasClickAction())
```

### General assert() with matcher combinators

```kotlin
// Custom matcher with or/and/not combinators
composeTestRule.onNode(hasClickAction())
    .assert(hasText("Save") or hasText("Done"))

composeTestRule.onNodeWithTag("submit")
    .assert(hasClickAction() and isEnabled())
```

## Key APIs (Summary)

### Most-used assertion functions on SemanticsNodeInteraction

| Function | Purpose |
|---|---|
| `assertExists(errorMessageOnFail?)` | Node found in tree, syncs with UI first |
| `assertDoesNotExist()` | Node NOT in tree (returns `Unit`, not chainable) |
| `assertIsDisplayed()` / `assertIsNotDisplayed()` | Visible on screen |
| `assertIsEnabled()` / `assertIsNotEnabled()` | Enabled/disabled state |
| `assertIsFocused()` / `assertIsNotFocused()` | Focus state |
| `assertIsSelected()` / `assertIsNotSelected()` | Selection state |
| `assertIsOn()` / `assertIsOff()` | Toggle checked/unchecked |
| `assertIsToggleable()` | Node is checkable |
| `assertHasClickAction()` / `assertHasNoClickAction()` | Click action exists |
| `assertTextEquals(vararg values, includeEditableText=false)` | Exact text match |
| `assertTextContains(value, substring=true, ignoreCase=false)` | Partial text match |
| `assertContentDescriptionEquals(vararg values)` | Exact content description |
| `assertContentDescriptionContains(value, substring=true, ignoreCase=false)` | Partial content description |
| `assertValueEquals(value)` | State description value |
| `assertPositionInRootIsEqualTo(left, top)` | Layout position |
| `assertWidthIsEqualTo(d)` / `assertHeightIsEqualTo(d)` | Exact size |
| `assertWidthIsAtLeast(d)` / `assertHeightIsAtLeast(d)` | Minimum size |
| `assert(matcher, messagePrefixOnError?)` | General matcher check |

All except `assertDoesNotExist()` and `assertIsDeactivated()` return `SemanticsNodeInteraction` for fluent chaining.

### Collection assertions on SemanticsNodeInteractionCollection

| Function | Purpose |
|---|---|
| `assertCountEquals(expectedSize)` | Exact node count |
| `assertAll(matcher)` | Every node satisfies matcher |
| `assertAny(matcher)` | At least one node satisfies matcher |

### Debugging & inspection

| Function | Purpose |
|---|---|
| `printToLog(tag, maxDepth=2)` | Dump semantics tree to logcat (debug level) |
| `printToString(maxDepth=2)` | Return semantics tree as String |
| `fetchSemanticsNode(errorMessageOnFail?)` | Get raw `SemanticsNode` for property inspection. Cache result for multiple accesses — each call synchronizes. |

### Key SemanticsNode properties (via `fetchSemanticsNode()`)

| Property | Type | Use |
|---|---|---|
| `id` | `Int` | Unique semantics node ID |
| `config` | `SemanticsConfiguration` | All semantics key/value pairs |
| `boundsInRoot` | `Rect` | Clipped bounding box relative to root |
| `positionInRoot` | `Offset` | Unclipped position relative to root |
| `size` | `IntSize` | Unclipped size |
| `touchBoundsInRoot` | `Rect` | Touchable area (may exceed `size`) |
| `children` | `List<SemanticsNode>` | Children in inverse paint order |
| `parent` | `SemanticsNode?` | Parent node |
| `isRoot` | `Boolean` | Whether this is the root node |

## Caveats

- **Unmerged tree matters for position/size assertions**: When a parent uses `Modifier.semantics(mergeDescendants = true)`, child semantics are collapsed into the parent. Use `useUnmergedTree = true` in the finder to assert on individual children's positions. Without it, `assertLeftPositionInRootIsEqualTo` returns the parent's position.

- **`assertIsDisplayed` checks actual screen visibility**, not just tree presence. Off-screen or clipped nodes will fail.

- **`fetchSemanticsNode` throws on 0 or multiple matches**. Use `onAllNodes` + collection assertions for multi-match scenarios.

- **Cache `fetchSemanticsNode()` result** when accessing multiple properties in one atomic operation. Each call triggers UI synchronization.

- **`printToLog` tag is a logcat tag**, not a semantics test tag. The `tag` parameter is for log filtering.

- **`maxDepth` defaults to 2** in `printToLog`/`printToString`. Increase for deeper trees.

- **`assertDoesNotExist()` returns `Unit`** — cannot be chained. Same for `assertIsDeactivated()`.

- **Text defaults**: `assertTextContains` uses `substring=true` (contains) and `ignoreCase=false`. Use `assertTextEquals` for exact match. For `TextField`, set `includeEditableText=true` in `assertTextEquals`.

## Composition Hints

- **Chain assertions fluently**: `onNodeWithText("Submit").assertIsDisplayed().assertIsEnabled().assertHasClickAction()`

- **Pair with finders**: This skill covers assertions only. Use `compose-ui-testing-finders` for `onNode`, `onNodeWithText`, `onAllNodes`, `useUnmergedTree`. Use `compose-ui-testing-actions` for `performClick`, `performTextInput`, etc.

- **Debug first**: When assertions fail unexpectedly, insert `onRoot().printToLog("DEBUG")` before the assertion to see the actual semantics tree structure.

- **Unmerged tree for granular checks**: When testing composables that merge semantics (like `Box`, `Button`), use `useUnmergedTree = true` in the finder to peer inside the merged node. Check `printToLog` output first to understand the tree shape.

- **Combine with Synchronization**: For async UI updates, use `compose-ui-testing-synchronization`'s `waitUntil` / `waitForIdle` before asserting to avoid flaky tests.
