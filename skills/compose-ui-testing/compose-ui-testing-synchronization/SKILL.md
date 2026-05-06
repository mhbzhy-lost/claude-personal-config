---
name: compose-ui-testing-synchronization
description: Compose test synchronization — virtual clock, waitForIdle, waitUntil, autoAdvance, IdlingResource, and v2 migration (StandardTestDispatcher).
tech_stack: [compose]
language: [kotlin]
capability: [integration-testing, task-scheduler]
version: "androidx.compose.ui:ui-test 1.11.0-alpha03+"
collected_at: 2026-05-01
---

# Compose UI Test Synchronization

> Source: https://developer.android.com/develop/ui/compose/testing/synchronization, https://developer.android.com/develop/ui/compose/testing/migrate-v2

## Purpose

Compose tests use a **virtual clock** — they don't run in real time, so tests
pass as fast as possible. The framework synchronizes automatically: every
assertion/action via `ComposeTestRule` waits until the UI tree is idle before
proceeding. This skill covers both the default synchronization model and the
manual control APIs needed for timing-sensitive scenarios (animations, async
loads, v2 coroutine dispatching).

## When to Use

- Coroutines/`LaunchedEffect` aren't executing before your assertions — fix with
  `waitForIdle()` or `runOnIdle{}`
- You need to capture an **intermediate animation frame** — disable
  `autoAdvance` and step frame-by-frame with `advanceTimeByFrame()`
- Background async work (network, DB) affects UI — register an `IdlingResource`
- **v1→v2 migration**: tests suddenly fail because coroutines are queued instead
  of running immediately
- Mixing Compose testing with `kotlinx.coroutines.test.runTest` —
  use `runComposeUiTest` instead

## Basic Usage

### Default sync (no code needed)

```kotlin
// Every action/assertion auto-synchronizes:
composeTestRule.onNodeWithText("Continue").performClick()
composeTestRule.onNodeWithText("Welcome").assertIsDisplayed()
// Recomposition happens during synchronization; state changes alone don't trigger it.
```

### Fix v2 "queued coroutine" failures

```kotlin
// ❌ Fails in v2 — coroutine hasn't run yet
viewModel.loadData()
assertEquals(Success, viewModel.state.value)

// ✅ waitForIdle advances clock until idle
viewModel.loadData()
composeTestRule.waitForIdle()
assertEquals(Success, viewModel.state.value)

// ✅ runOnIdle executes after idle without inline clock advance
viewModel.loadData()
composeTestRule.runOnIdle { assertEquals(Success, viewModel.state.value) }
```

## Key APIs (Summary)

| API | Behavior |
|-----|----------|
| `mainClock.autoAdvance = false` | Disable automatic clock — recompositions paused |
| `mainClock.advanceTimeByFrame()` | Advance exactly 1 frame |
| `mainClock.advanceTimeBy(ms)` | Advance by a duration |
| `mainClock.advanceTimeUntil(ms){cond}` | Advance until Compose-state condition true |
| `mainClock.scheduler.runCurrent()` | Run queued coroutines at current virtual time (v2) |
| `waitForIdle()` | autoAdvance=true → advance clock to idle; autoAdvance=false → wait only for IdlingResources. Always waits for draw/layout. |
| `waitUntil(ms){cond}` | Poll external condition (e.g., data loading, View draw) |
| `waitUntilAtLeastOneExists(m,ms)` | Shorthand — node count ≥ 1 |
| `waitUntilDoesNotExist(m,ms)` | Shorthand — node absent |
| `waitUntilExactlyOneExists(m,ms)` | Shorthand — exactly 1 node |
| `waitUntilNodeCount(m,n,ms)` | Shorthand — count == n |
| `registerIdlingResource(r)` | Register async work tracker |
| `runOnIdle { … }` | Execute block on UI thread after idle |

### v1 → v2 quick migration

```kotlin
// Rule factory — find+replace package:
// androidx.compose.ui.test.junit4.createComposeRule
// →  androidx.compose.ui.test.junit4.v2.createComposeRule
// Same pattern for: createAndroidComposeRule, createEmptyComposeRule,
// runComposeUiTest, runAndroidComposeUiTest

// runTest + createComposeRule → replace with runComposeUiTest:
@Test
fun testWithCoroutines() = runComposeUiTest {
    setContent { /* … */ }
    onNodeWithText("Loading...").assertIsDisplayed()
    mainClock.advanceTimeBy(1000 + 16 /* frame buffer */)
    onNodeWithText("Done!").assertIsDisplayed()
}
```

## Caveats

- **`MainTestClock` doesn't control Android measure/draw passes** — those are
  external to Compose's virtual clock. Use `waitUntil()` for conditions
  involving View-side state.
- Don't use external `CountDownLatch` instead of `waitUntil` — the test clock
  won't advance and you'll get unexpected behavior.
- `advanceTimeUntil` condition must check **Compose state** only (state that the
  virtual clock can affect).
- v1 APIs still work but use `UnconfinedTestDispatcher` (immediate coroutine
  execution) — only `AndroidComposeUiTestEnvironment` constructor changed to
  `StandardTestDispatcher` by default.
- `runCurrent()` vs `waitForIdle()`: `runCurrent` drains the queue without
  advancing time (good for intermediate states); `waitForIdle` advances the
  clock to stability.

## Composition Hints

- Pair with **compose-ui-testing-finders** for the matchers used in
  `waitUntil*` helpers.
- Pair with **compose-ui-testing-actions** — `performClick` etc. all
  auto-synchronize.
- For hybrid View+Compose apps, register `IdlingResource` wrappers for
  Espresso's idling registry via `compose-ui-testing-hybrid-espresso`.
