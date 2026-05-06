---
name: uiautomator-device-control
description: UiDevice API for Android device-level control — button simulation, screen rotation, power state, coordinate gestures, and system UI interaction.
tech_stack: [android]
language: [kotlin, java]
capability: [integration-testing]
version: "androidx.test.uiautomator:uiautomator 2.4.0-alpha05"
collected_at: 2026-04-22
---

# UiDevice — Device Control

> Source: https://developer.android.com/reference/androidx/test/uiautomator/UiDevice, https://developer.android.com/training/testing/other-components/ui-automator-legacy, https://developer.android.com/training/testing/other-components/ui-automator

## Purpose
UiDevice is the primary entry point for UI Automator tests. It provides access to device state (display, orientation, current package) and simulates user actions at the system level — button presses, rotation changes, gestures, and power control. Unlike Espresso, UiDevice operates outside the target app process, enabling cross-app and system-level testing.

## When to Use
- Any UI Automator test — `UiDevice.getInstance(Instrumentation)` is the mandatory first step
- Pressing system buttons (Back, Home, Recent Apps, D-pad keys)
- Forcing screen orientation (landscape/portrait) and freezing rotation
- Waking/sleeping the device programmatically
- Querying display dimensions for coordinate-based gestures
- Opening notification shade / Quick Settings
- Taking screenshots for debugging or visual assertions
- Sending shell commands (e.g., launching system Settings)

## Basic Usage

### Initialization (mandatory pattern)
```java
UiDevice device = UiDevice.getInstance(
    InstrumentationRegistry.getInstrumentation());
// ALWAYS use the Instrumentation-accepting form;
// the no-arg getInstance() is deprecated and prone to misuse.
```

### Common lifecycle
```java
// Start every test from Home screen
device.pressHome();
String launcherPkg = device.getLauncherPackageName();
device.wait(Until.hasObject(By.pkg(launcherPkg).depth(0)), 5000);
```

### Modern DSL (2.4.0+, Kotlin)
```kotlin
uiAutomator {
    startApp("com.example.app")
    waitForAppToBeVisible("com.example.app")
    activeWindow().waitForStable()
    onElement { textAsString() == "Submit" }.click()
}
```

## Key APIs (Summary)

### Button Simulation
| Method | What it does |
|--------|-------------|
| `pressHome()` | Press Home button |
| `pressBack()` | Press Back button |
| `pressRecentApps()` | Press Recent Apps button |
| `pressMenu()` | Press Menu button |
| `pressKeyCode(int keyCode, int metaState?)` | Press any key code, optional meta state |
| `pressKeyCodes(int[] keyCodes)` | Press key sequence |
| `pressEnter()` / `pressDelete()` | Enter / Delete keys |
| `pressDPadCenter/Up/Down/Left/Right()` | D-pad directional buttons |

### Rotation Control
All setters **freeze rotation** after applying — call `unfreezeRotation()` to allow physical rotation again.

| Method | Effect |
|--------|--------|
| `setOrientationLandscape()` | Force landscape (width ≥ height) |
| `setOrientationPortrait()` | Force portrait (height ≥ width) |
| `setOrientationNatural()` | Return to device's natural orientation |
| `setOrientationLeft()` / `setOrientationRight()` | Rotate left/right |
| `freezeRotation()` / `unfreezeRotation()` | Freeze/unfreeze current rotation |
| `getDisplayRotation()` | Query current rotation value |
| `isNaturalOrientation()` | Check if display is in natural orientation |

API 30+ multi-display variants accept `int displayId`: e.g. `setOrientationLandscape(int)`.

### Power State
- `wakeUp()` — presses power if screen is OFF, no-op otherwise
- `sleep()` — presses power if screen is ON, no-op otherwise
- `isScreenOn()` — queries power manager state

### Display Queries (orientation-aware)
- `getDisplayWidth()` / `getDisplayHeight()` — pixels, adjusted for current orientation
- `getDisplaySizeDp()` — device-independent pixels, actual screen size (ignores status bar)
- API 30+: `getDisplayWidth(int displayId)`, `getDisplayHeight(int displayId)`

### Coordinate Gestures
Each step is throttled to ~5ms. A 100-step swipe ≈ 0.5 seconds.

```java
device.click(500, 1000);                               // tap at coordinates
device.swipe(x1, y1, x2, y2, steps);                   // linear swipe
device.swipe(Point[] segments, int segmentSteps);      // multi-segment swipe
device.drag(startX, startY, endX, endY, steps);        // drag (like swipe)
```

### System UI
- `openNotification()` — open notification shade
- `openQuickSettings()` — open Quick Settings shade
- `executeShellCommand("am start -a android.settings.SETTINGS")` — launch system Settings (discouraged for complex commands; prefer `UiAutomation.executeShellCommandRwe`)

### Screenshots
```java
Bitmap bmp = device.takeScreenshot();
device.takeScreenshot(new File("/sdcard/screen.png"));           // default 1.0 scale, 90% quality
device.takeScreenshot(new File("/sdcard/screen.png"), 0.5f, 80); // custom scale/quality
```
Screenshots are automatically adjusted for screen rotation.

### Wait Mechanisms
- `device.wait(Condition, timeoutMs)` — generic condition wait
- `device.wait(SearchCondition, timeoutMs)` — search-based wait
- `waitForIdle()` / `waitForIdle(timeoutMs)` — wait for event queue idle (no hard UI-stability guarantee)
- `waitForWindowUpdate(packageName, timeoutMs)` — wait for window content update
- `performActionAndWait(action, EventCondition, timeoutMs)` — execute action, then wait

### Wait (Modern DSL, 2.4.0+)
- `waitForAppToBeVisible(packageName, timeoutMs)` — wait for app to appear
- `activeWindow().waitForStable()` — wait until accessibility tree stops changing
- `waitForRootInActiveWindow(timeoutMs, sleepIntervalMs, clearCache)` — wait for root node

### Device Info
- `getCurrentPackageName()` — last package reporting accessibility events (reliable)
- `getLauncherPackageName()` — default launcher package (varies by OEM)
- `getProductName()` — device product name
- `getCurrentActivityName()` — **deprecated, unreliable**

### Element Finding (on UiDevice)
- `findObject(BySelector)` → `UiObject2` or null
- `findObjects(BySelector)` → `List<UiObject2>`
- `findWindow(ByWindowSelector)` → `UiWindow` or null (2.4.0-beta02+)
- `findWindows(ByWindowSelector)` → sorted List (descending Z-order)
- `hasObject(BySelector)` / `hasWindow(ByWindowSelector)` → boolean

## Caveats
- **API 18+ required**: Annotate tests with `@SdkSuppress(minSdkVersion = 18)`. Multi-display methods need API 30+.
- **Always use `getInstance(Instrumentation)`**: The no-arg form is deprecated and hides the Instrumentation dependency.
- **Orientation setters freeze rotation**: Call `unfreezeRotation()` to re-enable physical rotation after `setOrientationLandscape()` etc.
- **Coordinate gestures depend on orientation**: Always query `getDisplayWidth()`/`getDisplayHeight()` before computing coordinates — dimensions change with rotation.
- **waitForIdle is not a stability guarantee**: It only waits for the event queue, not UI rendering. Prefer `waitForStable()` (modern) for UI stability.
- **executeShellCommand is limited**: No error handling, no input support, struggles with quotes/pipes. Use `UiAutomation.executeShellCommandRwe` for complex commands.
- **UiDevice is a singleton**: Tied to the Instrumentation; tests sharing an Instrumentation share the same UiDevice state.
- **Typo alert**: `setCompressedLayoutHeirarchy` is misspelled; the correct method is `setCompressedLayoutHierarchy`.

## Composition Hints
- **Pair with selectors**: Use `UiDevice.findObject()` with `BySelector` or the modern `onElement {}` predicate DSL to find UI elements before interacting.
- **Pair with cross-app skills**: Use `pressHome()` + `By.pkg(launcherPackage)` to start cross-app flows; use `openNotification()` / `openQuickSettings()` for SystemUI interaction.
- **Pair with watchers**: Register `UiWatcher` instances via `registerWatcher()` to handle permission dialogs or ANR popups that may appear during device-level actions.
- **For screen rotation tests**: Freeze → assert layout → unfreeze. Always unfreeze in `@After` to avoid contaminating other tests.
- **For gesture-based scrolling**: Compute swipe coordinates relative to `getDisplayWidth()`/`getDisplayHeight()` rather than hardcoding.
