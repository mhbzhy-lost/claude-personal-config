---
name: uiautomator-permissions-popups
description: Handle Android runtime permission dialogs, ANR popups, and SystemUI interruptions in UI Automator tests using watchFor/ScopedWatcher and legacy UiWatcher APIs.
tech_stack: [android]
language: [kotlin, java]
capability: [permission, e2e-testing]
version: "uiautomator 2.4.0-alpha05 (modern); 2.3.0 (legacy)"
collected_at: 2026-04-22
---

# UI Automator — Permissions & Popup Handling

> Source: https://developer.android.com/training/testing/other-components/ui-automator, https://developer.android.com/training/testing/other-components/ui-automator-legacy, https://developer.android.com/reference/androidx/test/uiautomator/UiDevice

## Purpose

UI Automator tests run outside the app process and frequently encounter system-level dialogs — runtime permission prompts, ANR ("App isn't responding") popups, crash dialogs, and other SystemUI interruptions. This skill covers both the modern `watchFor`/`ScopedWatcher<T>` API (2.4.0+) and the legacy `registerWatcher`/`UiWatcher` mechanism (2.2.0+) for automatically dismissing or interacting with these unexpected dialogs.

## When to Use

- Dismissing Android runtime permission dialogs (CAMERA, LOCATION, STORAGE, etc.) during test flows
- Handling ANR/crash dialogs that block UI interactions
- Testing multi-phase permission flows (deny → clear data → grant)
- Handling SystemUI overlays (system update prompts, battery-saver notifications)
- **Not for** expected in-app dialogs — use regular `onElement` assertions for those

## Basic Usage

### Modern API (recommended, 2.4.0+)

```kotlin
import androidx.test.uiautomator.PermissionDialog

@Test fun testWithPermissions() = uiAutomator {
    startApp("com.example.app")

    // Register watcher BEFORE the action that triggers the dialog
    watchFor(PermissionDialog) { clickAllow() }

    // Trigger the permission dialog
    onElement { textAsString() == "Enable Camera" }.click()

    // For multi-phase: switch to deny after clearing app data
    clearAppData("com.example.app")
    startApp("com.example.app")
    watchFor(PermissionDialog) { clickDeny() }
    onElement { textAsString() == "Enable Camera" }.click()
    onElement { textAsString() == "Permission denied message" }
}
```

### Legacy API (2.2.0+)

```kotlin
val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())

device.registerWatcher("PermissionWatcher") {
    val allow = device.findObject(By.text("Allow").clazz("android.widget.Button"))
    if (allow != null) { allow.click(); true } else { false }
}

// ... test actions ...

if (device.hasWatcherTriggered("PermissionWatcher")) {
    device.resetWatcherTriggers()  // re-arm for next occurrence
}
device.removeWatcher("PermissionWatcher")  // clean up
```

## Key APIs (Summary)

| API | Generation | Scope | Fires when |
|---|---|---|---|
| `watchFor(ScopedWatcher) { }` | Modern 2.4.0+ | `uiAutomator { }` block | Matching dialog appears |
| `PermissionDialog.clickAllow()` | Built-in | PermissionDialog scope | Clicks Allow/OK |
| `PermissionDialog.clickDeny()` | Built-in | PermissionDialog scope | Clicks Deny/Cancel |
| `registerWatcher(name, UiWatcher)` | Legacy 2.2.0+ | UiDevice | `findObject(UiSelector)` fails |
| `removeWatcher(name)` | Legacy | UiDevice | Manual cleanup |
| `resetWatcherTriggers()` | Legacy | UiDevice | Re-arms triggered watcher |
| `runWatchers()` | Legacy | UiDevice | Forces all watchers to run immediately |
| `hasWatcherTriggered(name)` | Legacy | UiDevice | Check if specific watcher fired |
| `hasAnyWatcherTriggered()` | Legacy | UiDevice | Check if any watcher fired |
| `clearAppData(packageName)` | Modern | `uiAutomator { }` | Resets app + permissions |

## Caveats

- **Legacy watchers only fire on `UiSelector` misses**, NOT on `BySelector`/`findObject(By...)` failures. If your tests use the `By` API, legacy watchers are ineffective.
- **Watchers fire once per trigger**. Legacy: call `resetWatcherTriggers()` to re-arm. Modern: `watchFor` handles re-registration naturally, but re-call it after `clearAppData`.
- **Register watchers BEFORE the triggering action**, not after. System dialogs appear during the action that causes them.
- **Permission dialog text is localized** — `PermissionDialog` handles this; for custom `ScopedWatcher`, match on resource IDs or content descriptions, not hardcoded "Allow"/"Deny".
- **SystemUI layout varies by OEM** — ANR/crash dialogs on Samsung, Xiaomi, etc. may differ from AOSP. Custom watchers need multi-device validation.
- **`clearAppData` is destructive** — it resets all app data including granted permissions, databases, and SharedPreferences.

## Composition Hints

- **Pair with `uiautomator-selectors`** for robust element finding before and after dialog dismissal.
- **Pair with `uiautomator-device-control`** when permissions involve device-level actions (e.g., `openQuickSettings` for location toggles).
- **Pair with `uiautomator-cross-app`** when permission flows cross app boundaries (e.g., testing that a denied permission still allows in-app fallback, then launching Settings to grant it).
- For custom `ScopedWatcher<T>`, implement `match(node: AccessibilityNodeInfo): T?` and expose action methods on `T` — follow the `PermissionDialog` pattern.
