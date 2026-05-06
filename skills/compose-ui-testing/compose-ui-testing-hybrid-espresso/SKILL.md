---
name: compose-ui-testing-hybrid-espresso
description: Hybrid Compose + View testing — mixing Espresso.onView with ComposeTestRule, createAndroidComposeRule, UiAutomator testTagsAsResourceId, and createEmptyComposeRule.
tech_stack: [compose, android]
language: [kotlin]
capability: [integration-testing]
version: "Jetpack Compose 1.2.0-alpha08+"
collected_at: 2026-05-01
---

# Compose UI Testing — Hybrid Espresso Interop

> Source: https://developer.android.com/develop/ui/compose/testing/interoperability, https://developer.android.com/develop/ui/compose/testing

## Purpose

In hybrid apps (Compose + traditional Android Views), you can freely mix
`Espresso.onView()` with `ComposeTestRule.onNode*()` in the same test — no
special glue needed. This skill covers the rules, patterns, and pitfalls for
testing mixed View/Compose UIs, including `createAndroidComposeRule`,
`createEmptyComposeRule`, and UiAutomator integration via `testTagsAsResourceId`.

## When to Use

- App has both Compose and traditional Views (migration in progress)
- A single test scenario crosses Compose ↔ View boundaries
- Need UiAutomator for cross-app/system interactions targeting Compose
  composables by `testTag`
- Injecting Compose content into an existing View-based test harness
  (`createEmptyComposeRule`)

## Basic Usage

### Hybrid test: Espresso + ComposeTestRule side by side

```kotlin
@get:Rule
val composeTestRule = createAndroidComposeRule<YourActivity>()

@Test
fun androidViewInteropTest() {
    // Check View state with Espresso
    Espresso.onView(withText("Hello Views")).check(matches(isDisplayed()))
    // Interact with Compose
    composeTestRule.onNodeWithText("Click here").performClick()
    // Verify View updated
    Espresso.onView(withText("Hello Compose")).check(matches(isDisplayed()))
}
```

### Rule selection guide

| Rule factory | When |
|---|---|
| `createAndroidComposeRule<YourActivity>()` | Hybrid: need both Activity access + Compose testing |
| `createEmptyComposeRule()` | Inject Compose into existing View test fixture |
| `createComposeRule()` | Pure Compose, no Activity (use `setContent{}`) |

### Dependencies

```groovy
androidTestImplementation("androidx.compose.ui:ui-test-junit4:$compose_version")
// Only needed for createComposeRule(), NOT for createAndroidComposeRule:
debugImplementation("androidx.compose.ui:ui-test-manifest:$compose_version")
```

## Key APIs (Summary)

### UiAutomator access to Compose test tags

```kotlin
// 1. Enable in Compose hierarchy (once, high up)
Scaffold(
    modifier = Modifier.semantics { testTagsAsResourceId = true }
) {
    LazyColumn(modifier = Modifier.testTag("myLazyColumn")) { /* … */ }
}

// 2. Find in UiAutomator — use By.res(tag), NOT By.res(pkg, id)!
val device = UiDevice.getInstance(getInstrumentation())
val lazyColumn: UiObject2 = device.findObject(By.res("myLazyColumn"))
```

## Caveats

- **`By.res(resourceName)` not `By.res(package, id)`** — the latter formats as
  `$pkg:id/$id`, which differs from `Modifier.testTag`'s value.
- `testTagsAsResourceId` requires **Jetpack Compose ≥ 1.2.0-alpha08**.
- Enable `testTagsAsResourceId` **once high in the hierarchy** — it propagates
  down to all nested `testTag` modifiers.
- `ui-test-manifest` dependency is **not needed** for
  `createAndroidComposeRule<YourActivity>()` — the Activity already provides the
  manifest.
- Hybrid tests can hit **IdlingResource timeouts** when Compose and Espresso
  sync mechanisms clash. Bridge them with `composeTestRule.waitForIdle()` and
  `waitUntil()`, or register Espresso idling resources via
  `composeTestRule.registerIdlingResource()`.

## Composition Hints

- For synchronization issues in hybrid tests, see
  **compose-ui-testing-synchronization** (`waitForIdle`, `waitUntil`,
  `IdlingResource`).
- Compose-side finders/actions/assertions are covered by
  **compose-ui-testing-finders**, **compose-ui-testing-actions**, and
  **compose-ui-testing-assertions**.
- Espresso-side matchers (`withText`, `withId`, `isDisplayed`) are standard
  Espresso — this skill only covers the interop boundary.
