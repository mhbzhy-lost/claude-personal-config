---
name: appium-locators
description: Master Appium element locator strategies across iOS (Predicate) and Android (UiAutomator), with cross-platform accessibility ID as the preferred approach.
tech_stack: [mobile-native]
capability: [e2e-testing]
version: "Appium 2.x"
collected_at: 2025-01-01
---

# Appium Locators

> Source: https://appium.readthedocs.io/en/stable/en/writing-running-appium/finding-elements/, https://appium.readthedocs.io/en/stable/en/writing-running-appium/ios/ios-predicate/, https://appium.readthedocs.io/en/stable/en/writing-running-appium/android/uiautomator-uiselector/

## Purpose

Appium supports multiple locator strategies across iOS and Android. The **accessibility ID** is the preferred cross-platform strategy; platform-native strategies (`-ios predicate string`, `-android uiautomator`) provide the most power and reliability for platform-specific work.

## When to Use

- Choosing which locator strategy to use for iOS vs. Android vs. cross-platform
- Writing complex iOS Predicate string queries (native predicate syntax, Apple-powered)
- Writing Android UiSelector/UiScrollable expressions for finding and scrolling to elements
- Debugging slow or brittle locators (particularly XPath)
- Building a locator abstraction layer that selects the right strategy per platform

## Basic Usage

### Strategy Decision Table

| Strategy | iOS | Android | Speed | Notes |
|---|---|---|---|---|
| `accessibility id` | ✅ | ✅ | Fast | **Preferred**. Use content-desc (Android) / accessibilityIdentifier (iOS) |
| `-ios predicate string` | ✅ (10+) | ❌ | Fast | Most powerful iOS strategy; Apple-native |
| `-android uiautomator` | ❌ | ✅ | Fast | UiSelector + UiScrollable API |
| `class name` | ✅ | ✅ | Moderate | Brittle; multiple elements often share class |
| `xpath` | ✅ | ✅ | Slow | Last resort; XML-based, fragile |
| `-custom` | ✅ | ✅ | Varies | Requires plugin via `customFindModules` cap |
| `-ios uiautomation` | ✅ (≤9.3) | ❌ | Fast | Legacy iOS only |

### Cross-Platform (Preferred)

```python
# Works identically on iOS and Android
driver.find_element(By.ACCESSIBILITY_ID, "loginButton")
```

## Key APIs (Summary)

### iOS Predicate String Operators (iOS 10+)

Predicates are Apple-native, comparable in power to XPath. **Indexes start at 0** (unlike XPath's 1-based).

**Comparisons:** `=`, `>=`, `<=`, `>`, `<`, `!=`, `BETWEEN {lower, upper}`

**String (case/diacritic-sensitive by default; add `[c]` / `[d]`):**
| Operator | Meaning | Example |
|---|---|---|
| `BEGINSWITH` | Starts with | `name BEGINSWITH[cd] 'hello'` |
| `CONTAINS` | Contains | `label CONTAINS 'Submit'` |
| `ENDSWITH` | Ends with | `name ENDSWITH 'Button'` |
| `LIKE` | Wildcard (`?`/`*`) | `name LIKE '*Total*'` |
| `MATCHES` | ICU v3 regex | `value MATCHES '.*of \d+'` |

**Compound:** `AND`/`&&`, `OR`/`||`, `NOT`/`!`

**Aggregate:** `ANY`/`SOME`, `ALL`, `NONE`, `IN`, `array[index]`, `array[FIRST]`, `array[LAST]`, `array[SIZE]`

**Reserved words** (escape with `#`): `AND, OR, IN, NOT, ALL, ANY, SOME, NONE, LIKE, CASEINSENSITIVE, CI, MATCHES, CONTAINS, BEGINSWITH, ENDSWITH, BETWEEN, NULL, NIL, SELF, TRUE, YES, FALSE, NO, FIRST, LAST, SIZE, ANYKEY, SUBQUERY, CAST, TRUEPREDICATE, FALSEPREDICATE`

### Android UiAutomator Selector

Use `UiSelector` builder pattern. **Avoid `index()` — use `instance()` instead.**

```java
// Core UiSelector methods
new UiSelector().className("android.widget.TextView")
new UiSelector().text("Animation")
new UiSelector().instance(0)          // prefer over index()
new UiSelector().scrollable(true)
```

**UiScrollable** for elements off-screen:

```java
// Find child by text, scrolling into view
new UiScrollable(new UiSelector().scrollable(true).instance(0))
    .getChildByText(new UiSelector().className("android.widget.TextView"), "Tabs")

// scrollIntoView returns the scrolled-to element
new UiScrollable(new UiSelector().scrollable(true).instance(0))
    .scrollIntoView(new UiSelector().text("WebView").instance(0))
```

### iOS Predicate String Examples

```java
// Simple equality
appiumDriver.findElementsByIosNsPredicate("label == 'Olivia'");

// Visibility check
appiumDriver.findElementsByIosNsPredicate("isWDVisible == 1");

// BEGINSWITH
// XPath: /UIAScrollView[4]/UIAButton[starts-with(@name, 'results toggle')][1]
// Predicate: scrollViews()[3].buttons().firstWithPredicate("name BEGINSWITH 'results toggle'")

// CONTAINS with ANY (cross-element matching)
tableViews()[1].cells().withPredicate("ANY collectionViews[0].buttons.name CONTAINS 'opera'")

// LIKE wildcard
tableViews()[0].cells().firstWithPredicate("name LIKE '*Total: $*'")

// MATCHES regex
tableViews().firstWithPredicate("value MATCHES '.*of 7'")

// SOME + chaining
tableViews()[0].cells().firstWithPredicate("SOME staticTexts.name = 'red'")
    .staticTexts().withName('red')

// SIZE aggregate
elements()[0].tableViews()[0].cells().withPredicate("staticTexts[SIZE] > 2")
```

## Caveats

1. **XPath is the slowest** — always try accessibility ID or native strategies first.
2. **UiSelector `index()` is unreliable** — use `instance()` for Nth-element selection.
3. **Predicate indexes start at 0** — unlike XPath (1-based). `firstWithPredicate` + index `0` hits the first match.
4. **Predicate strings are case/diacritic-sensitive** — add `[c]` and `[d]` modifiers: `CONTAINS[cd]`.
5. **Table cell invalidation** — known Appium issue where table cells become stale before interaction.
6. **Quoting in predicates** — `"a'b'c"` is concatenation of `a`, `'b'`, `c`, not a single string. Use consistent quoting.
7. **`-ios uiautomation` is dead** — only for iOS ≤9.3.
8. **Custom locator strategy** requires registering a plugin via `customFindModules` capability.

## Composition Hints

- Combine with `appium-cross-platform-strategy` for Page Object Model patterns that select locators by platform
- Use `appium-waits-conditions` to pair explicit waits with locator strategies (especially for slow XPath)
- For hybrid apps, use `ContentMappedBy` (Java client) to switch between native and web locators automatically
- Prefer `accessibility id` in shared page objects; fall back to platform-specific locators in subclass overrides
