---
name: espresso-matchers-actions
description: Locate and interact with Android View system UI elements using Espresso's onView(), ViewMatchers, ViewActions, and onData() for AdapterViews.
tech_stack: [android]
language: [java, kotlin]
capability: [integration-testing]
version: "espresso-core:3.6.1"
collected_at: 2026-05-01
---

# Espresso Matchers & Actions

> Source: https://developer.android.com/training/testing/espresso/basics, https://developer.android.com/training/testing/espresso/cheat-sheet, https://developer.android.com/training/testing/espresso/setup

## Purpose

Espresso's core interaction loop: locate a View in the hierarchy with `onView()` + `ViewMatchers`, then interact with `perform()` + `ViewActions`. For Adapter-based widgets (ListView, Spinner, GridView), use `onData()` to first load the adapter item into the hierarchy.

## When to Use

- You need to find and interact with a UI element in an Android instrumentation test
- You need to uniquely identify a view when `R.id` is shared or missing
- You're testing AdapterView widgets (Spinner, ListView, GridView)
- You need to chain multiple actions (type then click) in a single perform call
- You need to scroll to a view before interacting with it

## Basic Usage

Every Espresso interaction follows this pattern:

```java
onView(ViewMatcher)       // locate exactly one view
    .perform(ViewAction)  // interact with it
    .check(ViewAssertion); // verify its state
```

### Minimal example

```java
@RunWith(AndroidJUnit4.class)
@LargeTest
public class HelloWorldEspressoTest {
    @Rule
    public ActivityScenarioRule<MainActivity> activityRule =
        new ActivityScenarioRule<>(MainActivity.class);

    @Test
    public void clickButton_changesText() {
        onView(withId(R.id.button_simple)).perform(click());
        onView(withId(R.id.text_simple))
            .check(matches(withText("Hello Espresso!")));
    }
}
```

```kotlin
@RunWith(AndroidJUnit4::class)
@LargeTest
class HelloWorldEspressoTest {
    @get:Rule
    val activityRule = ActivityScenarioRule(MainActivity::class.java)

    @Test
    fun clickButton_changesText() {
        onView(withId(R.id.button_simple)).perform(click())
        onView(withId(R.id.text_simple))
            .check(matches(withText("Hello Espresso!")))
    }
}
```

### Setup requirements

**build.gradle:**
```groovy
android {
    defaultConfig {
        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"
    }
}
dependencies {
    androidTestImplementation 'androidx.test.espresso:espresso-core:3.6.1'
    androidTestImplementation 'androidx.test:runner:1.6.1'
    androidTestImplementation 'androidx.test:rules:1.6.1'
}
```

**Disable system animations** (Settings → Developer options) — critical to avoid flakiness:
- Window animation scale → off
- Transition animation scale → off
- Animator duration scale → off

**Run tests:** `./gradlew connectedAndroidTest`

## Key APIs (Summary)

### ViewMatchers — locating views

| Matcher | Purpose |
|---|---|
| `withId(int)` | Match by `R.id` |
| `withText(String)` | Match by exact text content |
| `withText(Matcher<String>)` | Match text with Hamcrest string matcher |
| `withSubstring(String)` | Shorthand for `withText(containsString(...))` |
| `withContentDescription(String)` | Match by accessibility content description |
| `withHint(String)` | Match EditText hint |
| `withTagKey(int)` / `withTagValue(Matcher)` | Match by view tag |
| `isAssignableFrom(Class)` | Match by View subclass (e.g., `TextView.class`) |
| `withClassName(Matcher)` | Match by class name |
| `isDisplayed()` | View is visible on screen (accepts partial) |
| `isEnabled()` / `isClickable()` / `isFocused()` | State matchers |
| `hasSibling(Matcher)` | Match by sibling view |
| `hasDescendant(Matcher)` | Match by child in hierarchy |

### Hamcrest combinators

```java
allOf(matcher1, matcher2)  // logical AND — all must match
anyOf(matcher1, matcher2)  // logical OR — at least one must match
not(matcher)               // negation
```

**Resolving ambiguous matches** (multiple views share same `R.id`):

```java
onView(allOf(withId(R.id.button), withText("Hello!")));
onView(allOf(withId(R.id.button), not(withText("Unwanted"))));
```

### ViewActions — interacting with views

| Action | Purpose |
|---|---|
| `click()` | Single click |
| `doubleClick()` | Double click |
| `longClick()` | Long press |
| `typeText(String)` | Type text into an EditText |
| `clearText()` | Clear EditText content |
| `pressBack()` | Press the back button (Espresso class method) |
| `pressKey(KeyEvent)` | Press a specific key |
| `scrollTo()` | Scroll to make the view visible |
| `closeSoftKeyboard()` | Hide the IME |
| `swipeLeft()` / `swipeRight()` / `swipeUp()` / `swipeDown()` | Gesture swipes |

### Chaining multiple actions

```java
onView(...).perform(typeText("Hello"), click());
// types "Hello" then clicks — executes in order
```

### scrollTo() + action pattern

Always precede `click()` or `typeText()` with `scrollTo()` when the view may be inside a ScrollView:

```java
onView(...).perform(scrollTo(), click());
```

`scrollTo()` is a no-op if the view is already visible, so it's safe to always include.

### onData() — AdapterView items

For ListView, GridView, Spinner — views whose children are loaded dynamically from an Adapter:

```java
// Spinner example: open, select "Americano", verify
onView(withId(R.id.spinner_simple)).perform(click());

onData(allOf(is(instanceOf(String.class)), is("Americano")))
    .perform(click());

onView(withId(R.id.spinnertext_simple))
    .check(matches(withText(containsString("Americano"))));
```

**Always prefer `onData()` over `onView()` for AdapterView items** — even for items initially visible. `onData()` first loads the adapter item into the hierarchy before operating on it.

## Caveats

- **`onView()` must match exactly ONE view.** Zero matches → `NoMatchingViewException`. Multiple matches → `AmbiguousViewMatcherException`. The exception dumps the full view hierarchy for debugging.
- **Never put assertions inside `onView()` arguments.** Use `withText()` inside `onView()` to *find* a view; use `check(matches(withText(...)))` to *assert* content.
- **Custom AdapterView implementations that break `getItem()` contract** will cause `onData()` failures. Refactoring the app code is the best fix.
- **System animations must be disabled** on test devices — they are the #1 cause of test flakiness.
- **Use the least descriptive matcher possible.** Don't add `isAssignableFrom(TextView.class)` if `withText(...)` already uniquely identifies the view.
- **`scrollTo()` must precede click/typeText** when the target is inside a ScrollView, otherwise the action may fail silently.
- **R.id is not guaranteed unique** across the hierarchy. Use `allOf()` combination matchers when needed.

## Composition Hints

- **For view-finding issues:** Use `allOf()` with `withId()` + `withText()` or `withContentDescription()`. If still ambiguous, add `hasSibling()` or `hasDescendant()`.
- **For AdapterView:** Always use `onData()`. Match the underlying data type (e.g., `instanceOf(String.class)`) plus the specific value.
- **For ScrollView safety:** Always prepend `scrollTo()` before `click()`/`typeText()` — it's a no-op when unnecessary.
- **For multi-step flows:** Chain actions in `perform()` in the order they should execute.
- **Combine with assertions skill:** After interacting, use `check(matches(...))` to verify state changes.
