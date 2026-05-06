---
name: compose-ui-testing-finders
description: Locate Compose UI elements via semantics matchers, convenience finders, and tree navigation for test assertions and actions.
tech_stack: [compose]
language: [kotlin]
capability: [integration-testing]
version: "Jetpack Compose ui-test 1.0.0+"
collected_at: 2026-05-01
---

# Compose UI Testing — Finders

> Source: https://developer.android.com/develop/ui/compose/testing/apis, https://developer.android.com/reference/kotlin/androidx/compose/ui/test/SemanticsMatcher, https://developer.android.com/develop/ui/compose/testing/semantics

## Purpose
Finders locate one or more nodes in the Compose semantics tree so tests can assert on or perform actions against them. Every Compose UI test starts with a finder.

## When to Use
- You need to select a UI element before calling `assert…()` or `perform…()`.
- You need to match elements by text, content description, test tag, or custom semantics properties.
- You need to navigate the semantics tree hierarchically (parent, children, siblings, ancestors, descendants).
- You need to inspect the unmerged semantics tree to reach child text nodes that get merged by their parent.

## Basic Usage

### Dependencies
```groovy
androidTestImplementation("androidx.compose.ui:ui-test-junit4:$compose_version")
debugImplementation("androidx.compose.ui:ui-test-manifest:$compose_version")
```

### Quick start
```kotlin
class MyComposeTest {
    @get:Rule val composeTestRule = createComposeRule()

    @Test
    fun myTest() {
        composeTestRule.setContent { MyAppTheme { MainScreen(uiState = fakeUiState) } }

        // Find a single node by text
        composeTestRule.onNodeWithText("Continue").performClick()

        // Find by test tag
        composeTestRule.onNodeWithTag("submit-button").assertIsDisplayed()

        // Find all nodes matching a condition
        composeTestRule.onAllNodes(hasClickAction()).assertCountEquals(3)
    }
}
```

## Key APIs (Summary)

### Primary finders (on ComposeTestRule)
| Finder | Returns | Notes |
|--------|---------|-------|
| `onNode(matcher, useUnmergedTree=false)` | `SemanticsNodeInteraction` | Throws if 0 or >1 matches |
| `onAllNodes(matcher)` | `SemanticsNodeInteractionCollection` | For multiple matches |
| `onNodeWithText(text, useUnmergedTree=false)` | `SemanticsNodeInteraction` | Convenience for `onNode(hasText(text))` |
| `onNodeWithContentDescription(label, useUnmergedTree=false)` | `SemanticsNodeInteraction` | Convenience |
| `onNodeWithTag(testTag, useUnmergedTree=false)` | `SemanticsNodeInteraction` | Requires `Modifier.testTag("…")` on composable |
| `onRoot(useUnmergedTree=false)` | `SemanticsNodeInteraction` | Root of the semantics tree |

Plural variants: `onAllNodesWithText`, `onAllNodesWithContentDescription`, `onAllNodesWithTag`.

### Most-used matcher functions (top-level)
```kotlin
hasText("text", substring=true, ignoreCase=false)   // most common
hasTestTag("tag")
hasContentDescription("desc")
isEnabled() / isNotEnabled()
isDisplayed() / isNotDisplayed()
isFocused() / isNotFocused()
isSelected()
isToggleable() / isOn() / isOff()
hasClickAction() / hasNoClickAction()
hasScrollAction()
isDialog() / isPopup()
```

### SemanticsMatcher combinators
```kotlin
hasText("Foo") and isEnabled()          // both must match
hasText("Foo") or hasText("Bar")        // either matches
!hasClickAction()                        // operator not()
```

### Hierarchical matchers
```kotlin
hasParent(matcher)         // parent satisfies matcher
hasAnyAncestor(matcher)    // any ancestor satisfies matcher
hasAnyDescendant(matcher)  // any descendant satisfies matcher
hasAnySibling(matcher)     // any sibling satisfies matcher
hasAnyChild(matcher)       // any child satisfies matcher
```

Example: find a clickable element inside a row:
```kotlin
composeTestRule.onNode(hasClickAction() and hasParent(hasTestTag("row-1")))
```

### Selectors (chained on SemanticsNodeInteraction)
```kotlin
composeTestRule
    .onNode(hasTestTag("Players"))
    .onChildren()
    .filter(hasClickAction())
    .assertCountEquals(4)
    .onFirst()
    .assert(hasText("John"))
```
- `onChildren()` — direct children collection
- `filter(matcher)` — keep matching nodes
- `onFirst()` / `onLast()` — pick single node

### Custom SemanticsMatcher
```kotlin
SemanticsMatcher("my description") { node: SemanticsNode ->
    // custom boolean logic on the semantics node
}
```

Companion factories: `SemanticsMatcher.expectValue(key, expectedValue)`, `SemanticsMatcher.keyIsDefined(key)`, `SemanticsMatcher.keyNotDefined(key)`.

## Unmerged Tree (`useUnmergedTree`)

**Problem:** Composables that merge semantics (e.g., `Button`, `Box`) combine child text into a single label. A `Button` containing `Text("Hello")` and `Text("World")` exposes `Text = '[Hello, World]'` in the merged tree — you can't match "World" individually.

**Solution:** Set `useUnmergedTree = true` on any finder to access the raw child nodes:

```kotlin
composeTestRule.onNodeWithText("World", useUnmergedTree = true).assertIsDisplayed()
```

Use `printToLog("TAG")` to inspect both trees and decide:
```kotlin
composeTestRule.onRoot().printToLog("merged")                         // merged view
composeTestRule.onRoot(useUnmergedTree = true).printToLog("unmerged") // unmerged view
```

## Caveats
- `onNode` throws `AssertionError` if zero or multiple nodes match. Use `onAllNodes` for collections or `onNodeWithTag` for unique test tags.
- `hasTestTag` requires `Modifier.testTag("…")` on the composable — it is not the same as resource IDs in View-based testing.
- Merged trees can hide individual child text nodes. When `onNodeWithText("World")` fails on a `Button { Text("Hello"); Text("World") }`, switch to `useUnmergedTree = true`.
- Always call `composeTestRule.setContent {}` before any finder — the semantics tree is empty otherwise.
- Prefer built-in matchers over custom `SemanticsMatcher` constructors; combinators (`and`/`or`/`not`) preserve the `description` for readable error messages.

## Composition Hints
- After finding a node, chain `.performClick()`, `.performTouchInput { … }`, `.performTextInput("…")`, or `.assertIsDisplayed()` directly.
- For scrollable lists, find the target item then call `.performScrollTo()` before acting on it.
- Use `hasTestTag` + `hasAnyAncestor` to scope searches within a specific screen section.
- When testing dialogs, use `isDialog()` to target the dialog root, then navigate with `onChildren()`.
