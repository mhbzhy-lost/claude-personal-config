---
name: Espresso RecyclerView Actions
description: Interact with RecyclerView items using RecyclerViewActions — scroll to positions, perform actions on items by position or ViewHolder matcher.
tech_stack: [android]
language: [kotlin, java]
capability: [integration-testing]
version: "AndroidX Test espresso-contrib (unversioned reference)"
collected_at: 2026-03-25
---

# Espresso RecyclerView Actions

> Source: https://developer.android.com/reference/androidx/test/espresso/contrib/RecyclerViewActions, https://developer.android.com/training/testing/espresso/basics

## Purpose

`RecyclerViewActions` (from `androidx.test.espresso:espresso-contrib`) provides `ViewAction` methods to scroll `RecyclerView` and act on its items. It exists because RecyclerView is **not** an `AdapterView` — `onData()` does not work with it. Instead, you target the RecyclerView with `onView()` and then perform a `RecyclerViewActions` action.

## When to Use

- You need to scroll a RecyclerView to a specific position or item
- You need to click, type, or otherwise interact with a RecyclerView item at a known position
- You need to find a RecyclerView item by its content (text, descendant view) and act on it
- You need to scroll to the end of a long list

## Basic Usage

```kotlin
// Scroll to position 5 and click
onView(withId(R.id.recycler_view))
    .perform(RecyclerViewActions.actionOnItemAtPosition(5, click()))

// Scroll to an item with specific descendant text, then click
onView(withId(R.id.recycler_view))
    .perform(RecyclerViewActions.actionOnItem(
        hasDescendant(withText("Target Item")),
        click()
    ))

// Scroll to last position (no click)
onView(withId(R.id.recycler_view))
    .perform(RecyclerViewActions.scrollToLastPosition())

// Assert the RecyclerView itself is displayed
onView(withId(R.id.recycler_view))
    .check(matches(isDisplayed()))
```

## Key APIs (Summary)

All methods are static on `RecyclerViewActions`. Every action auto-scrolls before executing.

| Method | What it does |
|---|---|
| `actionOnItemAtPosition(int pos, ViewAction)` | Scroll to position, then act on that item |
| `actionOnItem(Matcher<View>, ViewAction)` | Scroll to item matching a view matcher, then act |
| `actionOnHolderItem(Matcher<VH>, ViewAction)` | Scroll to item matching a ViewHolder matcher, then act |
| `scrollToPosition(int pos)` | Scroll to given position (no action) |
| `scrollTo(Matcher<View>)` | Scroll to item matching a view matcher (no action) |
| `scrollToHolder(Matcher<VH>)` | Scroll to item matching a ViewHolder matcher (no action) |
| `scrollToLastPosition()` | Scroll to last position (no action) |

## Caveats

- **Never use `onData()`** with RecyclerView — it only works with `AdapterView` (ListView, GridView, Spinner). Always `onView()` + `RecyclerViewActions`.
- **`PerformException` on ambiguous matchers**: `actionOnItem`, `scrollTo`, `scrollToHolder`, and `actionOnHolderItem` throw if more than one item matches. Narrow your matcher with `allOf()`.
- **No generic overloads**: `scrollTo(Matcher<VH>)` and `actionOnItem(Matcher<VH>)` do not exist due to Java type erasure. Use `scrollToHolder` / `actionOnHolderItem` for ViewHolder-level matching.
- **`scrollTo()` from core Espresso ≠ `RecyclerViewActions.scrollTo()`**: The general `scrollTo()` ViewAction is for views inside `ScrollView`. For RecyclerView items, always use `RecyclerViewActions`.
- **Matchers for `onView()` target the RecyclerView itself**, not the items. Item-level matching goes inside the `RecyclerViewActions` method.

## Composition Hints

Match the RecyclerView container first, then apply RecyclerViewActions:

```kotlin
onView(allOf(
    withId(R.id.recycler_view),
    isDisplayed()
)).perform(
    RecyclerViewActions.actionOnItemAtPosition(0, click())
)
```

Combine with `hasDescendant()` to find items by content:

```kotlin
onView(withId(R.id.recycler_view))
    .perform(RecyclerViewActions.scrollTo(
        hasDescendant(allOf(
            withId(R.id.item_title),
            withText("Hello")
        ))
    ))
```

Chain multiple RecyclerView actions in one `perform()`:

```kotlin
onView(withId(R.id.recycler_view))
    .perform(
        RecyclerViewActions.actionOnItemAtPosition(0, typeText("input")),
        RecyclerViewActions.actionOnItemAtPosition(1, click())
    )
```

Add assertions on the RecyclerView itself after performing actions:

```kotlin
onView(withId(R.id.recycler_view))
    .perform(RecyclerViewActions.actionOnItemAtPosition(0, click()))
    .check(matches(isDisplayed()))
```

For custom ViewHolders, use `actionOnHolderItem` with a ViewHolder matcher to avoid view-level ambiguity.
