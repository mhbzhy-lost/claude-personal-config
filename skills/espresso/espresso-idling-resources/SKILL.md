---
name: espresso-idling-resources
description: Synchronize Espresso UI tests with asynchronous background work using CountingIdlingResource, IdlingRegistry, and the IdlingResource interface
tech_stack: [android]
language: [kotlin, java]
capability: [e2e-testing, integration-testing]
version: "espresso-idling-resource 3.6.1"
collected_at: 2026-03-05
---

# Espresso Idling Resources

> Source: https://developer.android.com/training/testing/espresso/idling-resource, https://developer.android.com/training/testing/espresso

## Purpose
Idling resources tell Espresso to wait for asynchronous operations to complete before proceeding with the next UI action or assertion. Without them, Espresso only synchronizes with the `MessageQueue` — it has no visibility into background threads, network calls, or database operations. Idling resources bridge this gap, eliminating the need for `Thread.sleep()`, retry loops, or `CountDownLatch` hacks.

## When to Use
Any time a UI test depends on the result of asynchronous work:
- Loading data from network or local database
- Establishing database connections and callbacks
- Managing `IntentService` or system services
- Complex business logic (e.g., bitmap transformations)
- Especially when async work updates UI that the test then validates

**Don't use idling resources** for operations already on the `MessageQueue` (standard View drawing, click handling) — Espresso handles those automatically.

## Basic Usage

### 1. Add dependencies
```groovy
androidTestImplementation 'androidx.test.espresso:espresso-idling-resource:3.6.1'
androidTestImplementation 'androidx.test.espresso:espresso-contrib:3.6.1'  // for CountingIdlingResource
```

### 2. Create a CountingIdlingResource (covers ~90% of cases)
```kotlin
val countingIdlingResource = CountingIdlingResource("NetworkCalls")
```

### 3. Wire it into your app code
```kotlin
fun fetchData() {
    countingIdlingResource.increment()       // task started
    api.fetchData { result ->
        // process result
        countingIdlingResource.decrement()   // task completed
    }
}
```
When the counter reaches 0, Espresso considers the resource idle. This pattern works like a `Semaphore`.

### 4. Register in tests with @Before/@After
```kotlin
@Before
fun setUp() {
    IdlingRegistry.getInstance().register(countingIdlingResource)
}

@After
fun tearDown() {
    IdlingRegistry.getInstance().unregister(countingIdlingResource)
}

@Test
fun testDataDisplayed() {
    // Espresso automatically waits for countingIdlingResource to be idle
    onView(withId(R.id.data_view)).check(matches(isDisplayed()))
}
```

## Key APIs (Summary)

| API | Purpose |
|-----|---------|
| `CountingIdlingResource(name)` | Counter-based idling resource — use for most cases |
| `.increment()` | Mark a task as started |
| `.decrement()` | Mark a task as completed |
| `IdlingRegistry.getInstance().register(r)` | Register a resource so Espresso waits on it |
| `IdlingRegistry.getInstance().unregister(r)` | Remove a resource when no longer needed |
| `UriIdlingResource` | Like CountingIdlingResource but requires idle for a minimum time period (handles consecutive network requests) |
| `IdlingThreadPoolExecutor` | Custom `ThreadPoolExecutor` that tracks running tasks automatically |
| `IdlingScheduledThreadPoolExecutor` | Same as above but also tracks scheduled/future tasks |

**For custom IdlingResource implementations**, the contract is:
- `isIdleNow()` — Espresso polls this; return `true` when ready
- `onTransitionToIdle()` — callback you call when work finishes
- `getName()` — resource name for logging

## Caveats
- **Register BEFORE first Espresso action:** Synchronization only kicks in after Espresso's first call to `isIdleNow()`. Register in `@Before` to cover the whole test.
- **Unregister in `@After`** to prevent resource leaks and interference between tests.
- **Never call `onTransitionToIdle()` inside `isIdleNow()`** — it causes an unnecessary second idle check by Espresso.
- **No post-processing after `onTransitionToIdle()`** — Espresso proceeds immediately; any queued work may cause flakiness.
- **`CountingIdlingResource` is in `espresso-contrib`**, not `espresso-idling-resource`. You need both dependencies.
- **Don't hold View references** in idling resources — keep app state simple.
- **`IdlingRegistry` is the only supported registration method** — don't try to register idling resources directly with Espresso.

## Composition Hints
- Every test that touches async-loaded UI needs this — pair with **espresso-matchers-actions** and **espresso-assertions**.
- When testing UI that launches external intents AND loads data asynchronously, combine with **espresso-intents** — register idling resources for the data loading, use `intended()/intending()` for the intent validation.
- For `RecyclerView` with async adapter data, pair with **espresso-recyclerview-actions** — idling resources ensure data is loaded before `scrollToPosition()` or `actionOnItemAtPosition()`.
