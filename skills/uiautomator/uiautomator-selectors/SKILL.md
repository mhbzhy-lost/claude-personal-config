---
name: uiautomator-selectors
description: Find UI elements in UI Automator tests using modern predicate-based DSL (onElement/onElements) and legacy BySelector/UiSelector APIs, including chaining, timeouts, and cross-app resource IDs.
tech_stack: [android]
language: [kotlin, java]
capability: [e2e-testing]
version: "uiautomator 2.4.0-alpha05 (modern predicate API); 2.3.0 (legacy BySelector compat)"
collected_at: 2026-04-22
---

# UI Automator — Element Selectors

> Source: https://developer.android.com/training/testing/other-components/ui-automator, https://developer.android.com/training/testing/other-components/ui-automator-legacy, https://developer.android.com/reference/androidx/test/uiautomator/package-summary

## Purpose

UI Automator finds UI elements by traversing the accessibility tree. Two API generations exist: the **modern predicate DSL** (`onElement`/`onElements`, 2.4.0+) is concise, type-safe, and has built-in waiting; the **legacy `BySelector`** API (2.2.0+) is compatible with existing Java codebases. `UiSelector` (pre-2.2.0) is deprecated. This skill covers all three, with decision guidance.

## When to Use

| Scenario | API | Why |
|---|---|---|
| New Kotlin tests | `onElement { predicate }` | Concise, auto-wait, throws clearly |
| Element may be absent | `onElementOrNull { predicate }` | Safe null, no try/catch |
| Multiple matches needed | `onElements { predicate }` | Returns `List<UiObject2>` |
| Nested hierarchy | `onElement{}.onElement{}` chaining | Clean parent→child traversal |
| Existing Java tests | `By.text()` / `By.res()` | Backward compatible |
| Cross-app (SystemUI, Settings) | `By.res("com.android.systemui:id/...")` | Fully-qualified IDs cross packages |

## Basic Usage

### Modern: Find and interact (recommended)

```kotlin
@Test fun basicSelectors() = uiAutomator {
    startApp("com.example.app")

    // By text — throws ElementNotFoundException if absent after 10s default timeout
    onElement { textAsString() == "Submit" }.click()

    // By resource ID (fully-qualified)
    onElement { viewIdResourceName == "com.example.app:id/my_button" }.click()

    // Combined predicates
    onElement {
        className == "android.widget.Button" && textAsString() == "OK" && isClickable
    }.click()

    // Optional element — returns null instead of throwing
    onElementOrNull { textAsString() == "Skip" }?.click()

    // All matching elements — waits until ≥1 exists, then returns all
    onElements { className == "android.widget.CheckBox" }.forEach { it.click() }
}
```

### Legacy: BySelector

```kotlin
val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())

// Single criterion → UiObject2 (or null)
val gmail = device.findObject(By.text("Gmail"))

// Chained criteria
val ok = device.findObject(By.text("OK").clazz("android.widget.Button"))

// Existence check
if (device.hasObject(By.text("Error"))) { /* handle error */ }

// Wait for element
device.wait(Until.hasObject(By.pkg("com.example.app").depth(0)), 5000)
```

### Key predicate properties (AccessibilityNodeInfo)

`textAsString()` · `viewIdResourceName` · `contentDescription` · `className` · `isClickable` · `isSelected` · `isFocused` · `isCheckable` · `isChecked` · `isScrollable` · `isEnabled`

## Key APIs (Summary)

### Modern finders (inside `uiAutomator { }`)

| Function | Returns | On failure | Default timeout |
|---|---|---|---|
| `onElement(timeoutMs) { pred }` | `UiObject2` | throws `ElementNotFoundException` | 10 000 ms |
| `onElementOrNull(timeoutMs) { pred }` | `UiObject2?` | returns `null` | 10 000 ms |
| `onElements(timeoutMs) { pred }` | `List<UiObject2>` | throws if 0 matches | 10 000 ms |

### Chaining

```kotlin
onElement { viewIdResourceName == "parent" }
    .onElement { textAsString() == "child" }
    .onElement { viewIdResourceName == "grandchild" }
    .click()
```

### Legacy By factory methods

| Factory | Matches |
|---|---|
| `By.text("OK")` | Exact visible text |
| `By.res("pkg", "id")` or `By.res("pkg:id/name")` | Resource ID |
| `By.clazz("android.widget.Button")` | Java class name |
| `By.desc("description")` | Content description |
| `By.pkg("com.example.app")` | Package name |

### BySelector chaining

`.text()` `.clazz()` `.desc()` `.pkg()` `.res()` — refine match  
`.checked(Boolean)` `.depth(Int)` — filter by state/depth  
`.hasChild(BySelector)` `.hasDescendant(BySelector)` — nested requirements

### Until conditions (legacy waits)

`Until.hasObject(BySelector)` · `Until.newWindow()` · `Until.gone(BySelector)`

## Caveats

- **`onElement` throws, `onElementOrNull` returns null** — choose based on whether the element is required for the test to be valid.
- **`onElements` waits for ≥1 match** — it never returns an empty list; it times out if zero. Wrap in try/catch if zero is valid.
- **Cross-app resource IDs must be fully qualified**: `By.res("com.other.app:id/element")` or `viewIdResourceName == "com.other.app:id/element"`. Short forms only work within your own instrumentation target.
- **`By.text()` is exact match** — use `textAsString()?.contains("partial") == true` in predicates, or `UiSelector.textContains()` in legacy.
- **`StaleObjectException`**: cached `UiObject2` references die after screen transitions. Re-query after navigation.
- **`depth(0)` for app detection**: `By.pkg("pkg").depth(0)` matches only the root window — essential for `Until.hasObject()` waits to avoid false positives from embedded WebViews.
- **Layout compression hides nodes**: `setCompressedLayoutHierarchy(true)` (default) merges redundant layout nodes. Custom `View`s need `ExploreByTouchHelper` for accessibility visibility.
- **`UiSelector` / `UiObject` / `UiCollection` / `UiScrollable` are deprecated** — migrate to `BySelector` or predicates.

## Composition Hints

- **Foundation for all UI Automator skills** — every interaction begins with `onElement` or `findObject`.
- **Pair with `uiautomator-permissions-popups`**: use `onElement` to click permission-triggering buttons after registering `watchFor`.
- **Pair with `uiautomator-cross-app`**: use `By.pkg("other.app").depth(0)` + `Until.hasObject()` to wait for external app launches, and `By.res("com.android.systemui:id/...")` for SystemUI elements.
- **Pair with `uiautomator-device-control`**: use selectors to find UI elements before invoking `device.pressBack()` / `device.click(x, y)`.
- **For macrobenchmarks**: prefer `onElement` with explicit timeouts — its built-in wait mechanism is more deterministic than `waitForIdle()`.
