---
name: espresso-intents
description: Validate and stub Android Intents in Espresso tests using intended(), intending(), and ActivityResult stubbing for hermetic UI testing
tech_stack: [android]
language: [kotlin, java]
capability: [e2e-testing, integration-testing]
version: "espresso-intents 3.6.1"
collected_at: 2026-03-05
---

# Espresso-Intents

> Source: https://developer.android.com/training/testing/espresso/intents

## Purpose
Espresso-Intents is an Espresso extension that enables validation and stubbing of intents sent by the application under test. Think of it as Mockito for Android Intents — it records all outgoing intents and lets you assert on them (`intended()`) or provide fake responses (`intending()`). This gives you hermetic tests isolated from external apps.

## When to Use
- Your app launches external activities (camera, contacts, browser, phone dialer, etc.)
- You need to verify the correct intent is sent with proper action, data, categories, and extras
- You need to stub `ActivityResult` responses from external activities (you can't control their UI)
- You want hermetic testing — isolating your app from external app behavior

## Basic Usage

### 1. Add dependency
```groovy
androidTestImplementation 'androidx.test.espresso:espresso-intents:3.6.1'
```

### 2. Use IntentsTestRule (instead of ActivityTestRule)
```kotlin
@get:Rule
val intentsTestRule = IntentsTestRule(MyActivity::class.java)
```
IntentsTestRule initializes Espresso-Intents before each `@Test` and releases it after each test run.

### 3. Validate an outgoing intent with `intended()`
```kotlin
@Test
fun validateIntentSentToPackage() {
    user.clickOnView(system.getView(R.id.callButton))
    intended(toPackage("com.android.phone"))
}
```
`intended()` is like `Mockito.verify()` — it asserts the intent was sent but does NOT stub the response. The external activity will still launch.

### 4. Stub a response with `intending().respondWith()`
```kotlin
@Test
fun activityResult_DisplaysContactsPhoneNumber() {
    // Build the ActivityResult to return
    val resultData = Intent()
    val phoneNumber = "123-345-6789"
    resultData.putExtra("phone", phoneNumber)
    val result = Instrumentation.ActivityResult(Activity.RESULT_OK, resultData)

    // Stub: intercept intents to "contacts" and return our fake result
    intending(toPackage("com.android.contacts")).respondWith(result)

    // Trigger the action that launches the external activity
    onView(withId(R.id.pickButton)).perform(click())

    // Verify the stubbed data is displayed
    onView(withId(R.id.phoneNumber)).check(matches(withText(phoneNumber)))
}
```
`intending()` is like `Mockito.when()` — it intercepts matching intents and returns a stub result instead of launching the real activity.

## Key APIs (Summary)

| API | Purpose | Mockito analog |
|-----|---------|----------------|
| `IntentsTestRule` | Test rule that manages Espresso-Intents lifecycle | — |
| `intended(matcher)` | Assert an intent matching `matcher` was sent | `verify()` |
| `intending(matcher).respondWith(result)` | Stub response for intents matching `matcher` | `when().thenReturn()` |
| `Instrumentation.ActivityResult(code, data)` | Build a stub result to return | — |
| `toPackage("com.example")` | Canned matcher: match intent by target package | — |

**Common Hamcrest intent matchers** (usable inside `intended()`/`intending()`):
```kotlin
hasAction(Intent.ACTION_VIEW)
hasData(Uri.parse("https://example.com"))
hasExtra("key", "value")
hasExtraWithKey("key")
toPackage("com.android.phone")
```

## Caveats
- **`intended()` does NOT stub** — the real external activity still launches. Use `intending().respondWith()` to stub.
- **Stubbing only works with `startActivityForResult()`**. For `startActivity()` (no result expected), `intended()` alone is enough.
- **Must use `IntentsTestRule`**, not plain `ActivityTestRule` — otherwise Espresso-Intents won't be initialized/released.
- Compatible with Espresso 2.1+ and Android testing libraries 0.3+.

## Composition Hints
- Pair with **espresso-matchers-actions** for the `onView()/perform()/click()` interaction loop that triggers intent sending.
- Pair with **espresso-assertions** for `check(matches(...))` assertions on the UI that displays stubbed results.
- For async operations that happen before/after intent handling, use **espresso-idling-resources** to keep tests synchronized.
