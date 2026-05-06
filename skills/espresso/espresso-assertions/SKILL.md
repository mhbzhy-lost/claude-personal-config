---
name: espresso-assertions
description: Verify Android View states with Espresso's check(matches(...)) pattern, Hamcrest matcher composition, and custom ViewAssertion.
tech_stack: [android]
language: [java, kotlin]
capability: [integration-testing]
version: "espresso-core:3.x"
collected_at: 2026-03-05
---

# Espresso Assertions

> Source: https://developer.android.com/training/testing/espresso/basics, https://github.com/android/android-test/blob/main/espresso/core/java/androidx/test/espresso/matcher/ViewMatchers.java

## Purpose

Verify the state of Android Views after interactions using Espresso's `check(matches(...))` pattern. Compose complex assertions with Hamcrest combinators (`allOf`, `anyOf`, `not`) and string matchers. Write custom `ViewAssertion` implementations for app-specific checks.

## When to Use

- Verifying visibility, text content, enabled/disabled state, focus, selection after an interaction
- Checking CompoundButton (CheckBox, Switch, RadioButton) checked/unchecked state
- Asserting a view does NOT exist in the hierarchy (`doesNotExist()`)
- Composing multi-condition assertions (e.g., "is displayed AND has text X AND is enabled")
- Building custom assertions beyond what the built-in matchers provide

## Basic Usage

Every assertion follows this pattern:

```java
onView(ViewMatcher)              // locate the view
    .perform(ViewAction)         // interact (optional)
    .check(matches(ViewMatcher)); // assert its state
```

### Core examples

```java
// Visibility
onView(withId(R.id.result)).check(matches(isDisplayed()));

// Text content
onView(withId(R.id.title)).check(matches(withText("Hello Espresso!")));

// State checks
onView(withId(R.id.submit_btn)).check(matches(isEnabled()));
onView(withId(R.id.checkbox)).check(matches(isChecked()));

// Absence
onView(withId(R.id.error_panel)).check(doesNotExist());
```

```kotlin
onView(withId(R.id.result)).check(matches(isDisplayed()))
onView(withId(R.id.title)).check(matches(withText("Hello Espresso!")))
onView(withId(R.id.submit_btn)).check(matches(isEnabled()))
onView(withId(R.id.checkbox)).check(matches(isChecked()))
onView(withId(R.id.error_panel)).check(doesNotExist())
```

### Critical: separate finding from asserting

**Anti-pattern** — asserting text inside `onView()`:

```java
// BAD: assertion buried in view location
onView(allOf(withId(R.id.label), withText("Expected")))
    .check(matches(isDisplayed()));
```

**Correct pattern** — use `check()` for assertions:

```java
// GOOD: locate by ID, assert text via check()
onView(withId(R.id.label)).check(matches(withText("Expected")));
```

*Exception:* The first form is acceptable when you specifically need to assert that *a view with that exact text* is displayed (e.g., verifying text didn't change after a visibility flag toggle).

## Key APIs (Summary)

### Visibility matchers

| Matcher | Behavior |
|---|---|
| `isDisplayed()` | View is displayed (accepts **partially** visible views) |
| `isCompletelyDisplayed()` | 100% of the view fits within the visible region |
| `isDisplayingAtLeast(int %)` | At least X% of the view's area is not obscured (1–100) |

**Important:** `ScrollView` and similar containers will **never** match `isCompletelyDisplayed()` because their content area exceeds the screen.

### State matchers

| Matcher | Negated form |
|---|---|
| `isEnabled()` | `isNotEnabled()` |
| `isClickable()` | — |
| `isFocusable()` | `isNotFocusable()` |
| `isFocused()` | `isNotFocused()` |
| `hasFocus()` | `doesNotHaveFocus()` |
| `isSelected()` | `isNotSelected()` |
| `isActivated()` | `isNotActivated()` |
| `isChecked()` | `isNotChecked()` |

`isChecked()` / `isNotChecked()` only work on `CompoundButton` subtypes (CheckBox, Switch, RadioButton).

### Text matchers

```java
withText("exact text")                    // Exact match
withText(startsWith("prefix"))            // Starts with
withText(endsWith("suffix"))              // Ends with
withText(containsString("substring"))     // Contains
withSubstring("substring")                // Shorthand for containsString
withHint("hint text")                     // EditText hint
```

**Note:** `withText` never matches `null`. A TextView whose text was set to `null` will have `""` (empty string). Use `withText("")` to match empty text.

### Content description matchers

```java
withContentDescription("text")       // Exact content description
withContentDescription(int resourceId) // By string resource
hasContentDescription()               // Any non-null content description
```

### Hamcrest compositors

```java
allOf(m1, m2, ...)  // ALL must match (AND)
anyOf(m1, m2, ...)  // AT LEAST ONE must match (OR)
not(matcher)         // Negation
```

### doesNotExist()

```java
onView(withId(R.id.missing)).check(doesNotExist());
// Passes only if NO view in the hierarchy matches the matcher.
```

**Critical distinction:**
- `doesNotExist()` → view is **absent from hierarchy** (e.g., not yet inflated)
- `not(isDisplayed())` → view **exists** but is `GONE` or `INVISIBLE`

If the view exists but is hidden, `doesNotExist()` will **fail**. Use `not(isDisplayed())` instead.

### Custom ViewAssertion

```java
ViewAssertion matchesPattern = (view, noViewFoundException) -> {
    if (noViewFoundException != null) throw noViewFoundException;
    if (!(view instanceof TextView)) {
        throw new AssertionFailedError("View is not a TextView");
    }
    TextView textView = (TextView) view;
    if (!Pattern.matches("\\d+", textView.getText().toString())) {
        throw new AssertionFailedError("Text doesn't match digit pattern");
    }
};

onView(withId(R.id.code)).check(matchesPattern);
```

### Combined assertions example

```java
// Assert: visible AND enabled AND has specific text
onView(withId(R.id.status))
    .check(matches(allOf(
        isDisplayed(),
        isEnabled(),
        withText("Ready")
    )));

// Assert: EITHER "Loading..." OR "Ready"
onView(withId(R.id.status))
    .check(matches(anyOf(
        withText("Loading..."),
        withText("Ready")
    )));
```

## Caveats

- **`isDisplayed()` matches partially visible views.** If a view is 10% visible, `isDisplayed()` passes. Use `isCompletelyDisplayed()` or `isDisplayingAtLeast(90)` for strict checks.
- **`isCompletelyDisplayed()` never matches ScrollView.** ScrollView dimensions exceed the screen by design.
- **`doesNotExist()` ≠ `not(isDisplayed())`.** The former requires the view to be absent from the hierarchy; the latter allows the view to exist but be hidden.
- **TextView text is never null.** `setText(null)` produces `""`. Use `withText("")` not a null matcher.
- **Don't bury assertions in `onView()`.** The `onView()` argument is for *locating* the view, `check()` is for *asserting* its state.
- **`R.id` is not guaranteed unique.** If your assertion matcher matches multiple views you'll get `AmbiguousViewMatcherException`. Use `allOf()` to disambiguate.
- **Over-specifying matchers adds unnecessary work.** Use the least descriptive matcher needed.

## Composition Hints

- **Visibility check flow:** after any UI-changing action, `check(matches(isDisplayed()))` is the standard follow-up.
- **Text assertions after input:** `onView(withId(...)).check(matches(withText("expected")))` — but ensure you've dismissed the soft keyboard first if needed.
- **CheckBox/Switch verification:** use `isChecked()` / `isNotChecked()`. These are type-safe — they cast to `CompoundButton` internally.
- **Custom assertions:** implement `ViewAssertion` when you need to check properties not exposed by built-in matchers (e.g., custom view attributes, compound layout properties).
- **Combine with matchers-actions skill:** locate + interact first, then assert with the patterns here.
- **Debug failures:** the exception message dumps the full view hierarchy. Search for `MATCHES` markers in `AmbiguousViewMatcherException`, or examine the hierarchy tree in `NoMatchingViewException`.
