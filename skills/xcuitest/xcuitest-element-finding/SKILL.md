---
name: xcuitest-element-finding
description: Locate and query UI elements in XCUITest using identifiers, predicates, type matching, and hierarchical traversal.
tech_stack: [ios]
language: [swift]
capability: [e2e-testing]
version: "XCTest unversioned"
collected_at: 2025-07-17
---

# XCUITest Element Finding

> Source: Apple Developer Documentation – XCUIElement / XCUIElementQuery / NSPredicate matching

## Purpose
Locate UI elements in the app's view hierarchy using a lazy two-phase query system: build an `XCUIElementQuery` with matching criteria, then resolve it to an `XCUIElement` for interaction or inspection.

## When to Use
- Finding buttons, text fields, cells, and other interactable elements **before** tapping, typing, or swiping.
- Filtering large element trees with `NSPredicate` conditions (e.g., "the enabled button labeled 'Submit'").
- Traversing the hierarchy: `descendants(matching:)` for deep search, `children(matching:)` for shallow.
- Waiting for async elements to appear with `waitForExistence(timeout:)`.

## Basic Usage
```swift
let app = XCUIApplication()
app.launch()

// Identifier lookup — most stable, preferred approach
let loginButton = app.buttons["loginButton"]
let emailField = app.textFields["emailField"]

// Predicate lookup — flexible but slightly slower
let pred = NSPredicate(format: "label CONTAINS[c] %@ AND isEnabled == true", "submit")
let submitButton = app.buttons.element(matching: pred)

// Hierarchical: scope to a parent first
let firstCell = app.cells.element(boundBy: 0)
let deleteButton = firstCell.buttons["Delete"]

// Wait for async element
XCTAssertTrue(app.staticTexts["Welcome"].waitForExistence(timeout: 5))
```

## Key APIs (Summary)

### XCUIElementQuery — building queries

| API | Description |
|-----|-------------|
| `app.buttons["id"]` | Subscript by `accessibilityIdentifier` (most stable) |
| `.element` | Resolves and returns first match; **throws** if zero matches |
| `.firstMatch` | Returns first match; defers failure to interaction time |
| `.element(boundBy: index)` | Index-based access (fragile — avoid when possible) |
| `.matching(NSPredicate)` | Filter by predicate on label, value, isEnabled, etc. |
| `.matching(.elementType)` | Filter by `XCUIElement.ElementType` |
| `.children(matching:)` | Shallow: direct children only |
| `.descendants(matching:)` | Deep: all nested descendants |
| `.containing(...)` | Elements whose descendants match a condition |

### XCUIElement — inspecting resolved elements

| API | Description |
|-----|-------------|
| `.exists: Bool` | Whether element currently exists (triggers query resolution) |
| `.waitForExistence(timeout:)` | Block until element appears; returns `Bool` |
| `.label: String` | Accessibility label (localized, may change) |
| `.identifier: String` | `accessibilityIdentifier` (programmatic, stable) |
| `.isEnabled: Bool` | Whether element is enabled for interaction |
| `.isSelected: Bool` | Selection state (toggles, segments, cells) |
| `.value: Any?` | Current value (text field content, slider position, etc.) |

## Caveats
- **`.element` crashes on zero matches** — prefer `.firstMatch` when existence is uncertain; the error surfaces at interaction time instead of query time.
- **`exists` is not free** — each access triggers a fresh query resolution. Cache the boolean if you check it repeatedly.
- **Identifier > label > index** — `accessibilityIdentifier` survives localization and layout changes. Labels break on translation. Indices break on reorder.
- **Predicates snapshot attributes** — if a label changes asynchronously after the predicate query, the element may be missed. Use `waitForExistence` or `NSPredicate` on stable attributes.
- **Scope queries for performance** — `app.buttons["X"]` searches the entire app tree. Narrow with `cell.buttons["X"]` or `navigationBar.buttons["X"]`.
- **Lazy resolution** — queries don't evaluate until you access `.count`, `.element`, or subscript. This is efficient but can confuse debugging if you expect eager evaluation.

## Composition Hints
- Feeds directly into **xcuitest-interactions** — find an element, then `.tap()`, `.typeText()`, `.swipeUp()`, etc.
- Use with **xcuitest-launch-config** to ensure the app is in the right state before querying elements.
- For custom `UIView` subclasses, set `isAccessibilityElement = true` and `accessibilityIdentifier` in production code to make them findable.
