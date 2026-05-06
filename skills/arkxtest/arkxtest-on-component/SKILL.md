---
name: arkxtest-on-component
description: Locate and inspect UI components in HarmonyOS ArkUI apps using arkXtest UiDriver.findComponent with BY descriptors, including absolute positioning (text/id/type), relative positioning (isBefore/isAfter), fuzzy matching (MatchPattern), and property retrieval.
tech_stack: [harmonyos]
language: [arkts, typescript]
capability: [integration-testing, e2e-testing]
version: "OpenHarmony arkXtest API 8+"
collected_at: 2025-01-15
---

# arkXtest Component Locating (BY / UiDriver.findComponent)

> Source: https://raw.githubusercontent.com/openharmony/testfwk_arkxtest/master/README_en.md, https://developer.huawei.com/consumer/en/doc/harmonyos-guides-V5/arkxtest-guidelines-V5

## Purpose
The UiTest BY class is the component locator DSL for arkXtest. It provides a chainable builder API to describe UI components by text, ID, type, and state attributes, then locate them via `UiDriver.findComponent()`. Supports absolute positioning, relative positioning (isBefore/isAfter), and fuzzy text matching.

## When to Use
- Locating a button, text field, or any ArkUI component by its text, ID, or type
- Filtering components by state: enabled/disabled, clickable, focused, scrollable, selected
- Finding a component relative to a nearby uniquely-identifiable component (isBefore/isAfter)
- Fuzzy-matching text when the exact string is dynamic or partially known (CONTAINS, STARTS_WITH, ENDS_WITH)
- Retrieving component properties (getText, getId, getType, isEnabled) for assertions
- Scrolling within a List to find off-screen child components

## Basic Usage

### Import and Entry
```typescript
import { BY, UiDriver, UiComponent, MatchPattern } from '@ohos.uitest'
import { describe, it, expect } from '@ohos/hypium'

export default async function abilityTest() {
  describe('ComponentLocating', function() {
    it('find_and_click', 0, async function() {
      let driver = await UiDriver.create()
      let button = await driver.findComponent(BY.text('Submit').enabled(true))
      await button.click()
    })
  })
}
```

### Concurrency Rules (CRITICAL)
- **BY methods are synchronous** — chain freely without `await`
- **UiDriver / UiComponent methods are async (Promise)** — always `await`
- **All UI test cases must be async functions**

## Key APIs (Summary)

### BY — Chainable Component Descriptors
Build filter conditions by chaining. Final descriptor is passed to `findComponent()`.

| Method | Purpose | Example |
|--------|---------|---------|
| `BY.id(n)` | Match by component ID | `BY.id(Id_button)` |
| `BY.text(s, pattern?)` | Match by text, optional fuzzy pattern | `BY.text("hello", MatchPattern.CONTAINS)` |
| `BY.type(s)` | Match by component type | `BY.type('InputText')` |
| `BY.enabled(bool)` | Filter by enabled state | `BY.text("OK").enabled(true)` |
| `BY.clickable(bool)` | Filter by clickable state | `BY.clickable(true)` |
| `BY.focused(bool)` | Filter by focused state | `BY.focused(true)` |
| `BY.scrollable(bool)` | Filter by scrollable state | `BY.scrollable(true)` |
| `BY.selected(bool)` | Filter by selected state | `BY.selected(false)` |

### MatchPattern — Text Matching Strategies
Default is `MatchPattern.EQUALS` when omitted.

| Pattern | Match Rule |
|---------|------------|
| `MatchPattern.EQUALS` | Exact match (default) |
| `MatchPattern.CONTAINS` | Substring anywhere |
| `MatchPattern.STARTS_WITH` | Prefix match |
| `MatchPattern.ENDS_WITH` | Suffix match |

### Relative Positioning
Use when the target component lacks a unique ID/text. The anchor component must have a globally unique attribute.

| Method | Meaning |
|--------|---------|
| `BY.id(x).isAfter(BY.text("Label"))` | Target is *after* the component with text "Label" |
| `BY.id(x).isBefore(BY.text("Label"))` | Target is *before* the component with text "Label" |

```typescript
// Find the switch that comes after text "Item3_3"
let sw = await driver.findComponent(BY.id(Id_switch).isAfter(BY.text("Item3_3")))
```

### UiDriver — Finding
| API | Behavior |
|-----|----------|
| `driver.findComponent(by)` | Returns Promise<UiComponent> — the first match |
| `driver.assertComponentExist(by)` | Throws JS exception (test failure) if not found |
| `driver.findWindow({actived: true})` | Returns Promise<UiWindow> — window, not component |

### UiComponent — Property Retrieval
| API | Returns |
|-----|---------|
| `component.getText()` | Promise<string> |
| `component.getId()` | Promise<number> |
| `component.getType()` | Promise<string> |
| `component.isEnabled()` | Promise<bool> |
| `component.scrollSearch(by)` | Promise<bool> — scrolls List to find child; true if found |

### Common Locating Patterns
```typescript
// By ID only
let btn = await driver.findComponent(BY.id(Id_button))

// By ID + state
let btn = await driver.findComponent(BY.id(Id_button).enabled(true))

// By text with fuzzy match
let txt = await driver.findComponent(BY.text("hello", MatchPattern.CONTAINS))

// By type
let input = await driver.findComponent(BY.type('InputText'))

// Multi-attribute chain
let submit = await driver.findComponent(BY.text('Submit').enabled(true).clickable(true))

// Scroll to find in List
let list = await driver.findComponent(BY.id(Id_list))
let found = await list.scrollSearch(BY.text("Item3_3"))
```

## Caveats
- **BY is sync, UiDriver is async**: Never `await` a BY chain; always `await` findComponent/click/getText/etc.
- **Default EQUALS**: `BY.text("hello")` matches exactly "hello", not "hello world". Use `MatchPattern.CONTAINS` for substring.
- **Relative anchor must be unique**: `isBefore`/`isAfter` need an anchor component with a globally unique ID or text, otherwise the wrong component may be matched.
- **assertComponentExist throws**: No need for `expect()` — the throw itself fails the test. Wrap in try/catch if you want graceful handling.
- **scrollSearch is List-only**: Only works on List-type UiComponents. Returns boolean, not the found component.
- **findWindow ≠ findComponent**: Window search uses `{actived: true}` object, not a BY descriptor. BY is for components only.

## Composition Hints
- Foundation skill: import `arkxtest-project-setup` for test suite structure and lifecycle hooks
- Pair with `arkxtest-driver-interactions` for click/inputText/scrollSearch operations on located components
- Pair with `arkxtest-assertions` for asserting component properties (getText/getId/isEnabled) and existence
