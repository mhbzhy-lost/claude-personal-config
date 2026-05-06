---
name: uiautomator-cross-app
description: Cross-app UI testing with UI Automator — launching external apps, system UI interaction, and multi-app flow orchestration on Android.
tech_stack: [android]
language: [kotlin, java]
capability: [integration-testing, e2e-testing]
version: "androidx.test.uiautomator:uiautomator 2.4.0-alpha05"
collected_at: 2026-04-22
---

# UI Automator — Cross-App Testing

> Source: https://developer.android.com/training/testing/other-components/ui-automator-legacy, https://developer.android.com/training/testing/other-components/ui-automator, https://developer.android.com/reference/androidx/test/uiautomator/package-summary

## Purpose
UI Automator is uniquely suited for cross-app testing because it operates at the system level through Android's accessibility framework — it can interact with visible elements on screen **regardless of which Activity or app is in focus**. Unlike Espresso (confined to the target app's process), UI Automator enables tests that launch external apps, interact with system UI, navigate between apps, and verify behavior across app boundaries.

## When to Use
- Flows that launch another app (e.g., "Share to Gmail", "Open in Maps")
- Interacting with system Settings during tests (toggle permissions, Wi‑Fi, Do Not Disturb)
- Testing deep-link or Intent-based navigation between apps
- Launching the app under test from launcher, recents, or notification
- Macrobenchmark and Baseline Profile generation (driving multiple apps)
- Opaque-box / black-box testing of release builds (no internal implementation access)
- Notification shade and Quick Settings interaction
- Multi-window scenarios (Picture-in-Picture, split-screen)

## Basic Usage

### Cross-app programming model
```
1. Get UiDevice instance
2. Start from Home screen (known state)
3. Navigate to first app / system UI
4. Wait for app transition (Until.newWindow / Until.hasObject)
5. Interact across app boundaries
6. Verify state in target app
```

### Legacy API skeleton
```java
@RunWith(AndroidJUnit4.class)
@SdkSuppress(minSdkVersion = 18)
public class CrossAppTest {
    private UiDevice device;

    @Before
    public void setUp() {
        device = UiDevice.getInstance(
            InstrumentationRegistry.getInstrumentation());
        device.pressHome();
        String launcherPkg = device.getLauncherPackageName();
        device.wait(Until.hasObject(By.pkg(launcherPkg).depth(0)), 5000);
    }
}
```

### Modern DSL skeleton (2.4.0+, Kotlin)
```kotlin
@Test
fun crossAppFlow() = uiAutomator {
    startApp("com.example.sourceapp")
    waitForAppToBeVisible("com.example.sourceapp")
    // ... interact across apps ...
}
```

## Key APIs (Summary)

### App Launch Strategies (choose one per scenario)

**Intent-based launch** — most flexible, works with any package:
```java
Context ctx = InstrumentationRegistry.getInstrumentation().getTargetContext();
Intent intent = ctx.getPackageManager()
    .getLaunchIntentForPackage("com.example.targetapp");
intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK);   // critical!
ctx.startActivity(intent);
device.wait(Until.hasObject(By.pkg("com.example.targetapp").depth(0)), 5000);
```

**Shell command** — best for system components (Settings, dialer):
```java
device.executeShellCommand("am start -a android.settings.SETTINGS");
device.executeShellCommand("am start -a android.settings.WIFI_SETTINGS");
device.executeShellCommand("am start -a android.settings.APPLICATION_SETTINGS");
```

**Modern DSL (2.4.0+, preferred for new code)** — must be inside `uiAutomator { }`:
```kotlin
startApp("com.example.targetapp")                // by package name
startActivity(SettingsActivity::class.java)       // by Activity class
startIntent(myIntent)                            // arbitrary Intent
clearAppData("com.example.targetapp")            // reset app to fresh state
```

### Cross-app Element Finding

**Scoping with `By.pkg()` — locate elements in ANY app on screen:**
```java
// Find launcher icon regardless of what app is foreground
UiObject2 icon = device.findObject(
    By.pkg(device.getLauncherPackageName()).text("Settings"));

// Read system UI elements (SystemUI package)
UiObject2 clock = device.findObject(
    By.res("com.android.systemui:id/clock"));

// Find element in a specific target app
UiObject2 button = device.findObject(
    By.pkg("com.google.android.gm").text("Compose"));
```

### Cross-app Wait Conditions

**`Until.newWindow()`** — the primary mechanism for detecting app transitions:
```java
// Launch an app and wait for its window to appear
UiObject2 gmail = device.findObject(By.text("Gmail"));
boolean opened = gmail.clickAndWait(Until.newWindow(), 3000);
// opened == false means timeout — the transition didn't happen
```

**`Until.hasObject(By.pkg(...))`** — wait for a package's UI to exist:
```java
device.wait(Until.hasObject(By.pkg("com.example.app").depth(0)), 5000);
```

### System UI Patterns

```java
// Open notification shade / Quick Settings
device.openNotification();
device.openQuickSettings();

// Open system Settings
device.executeShellCommand("am start -a android.settings.SETTINGS");
device.wait(Until.hasObject(By.pkg("com.android.settings").depth(0)), 5000);

// Interact with Quick Settings tiles (resource IDs vary by OEM)
device.openQuickSettings();
UiObject2 dndTile = device.findObject(
    By.res("com.android.systemui:id/dnd_tile"));
if (dndTile != null) dndTile.click();
```

### Launcher Interaction Pattern

```java
device.pressHome();
String launcherPkg = device.getLauncherPackageName();  // never hardcode!
device.wait(Until.hasObject(By.pkg(launcherPkg).depth(0)), 5000);

// Find app icon by text on launcher
UiObject2 appIcon = device.findObject(
    By.pkg(launcherPkg).text("Calculator"));
if (appIcon != null) {
    appIcon.clickAndWait(Until.newWindow(), 5000);
}
```

### Complete Cross-app Flow (e.g., Share to Gmail)

```java
@Test
public void testShareToGmail() {
    // 1. Launch source app
    Context ctx = InstrumentationRegistry.getInstrumentation().getTargetContext();
    Intent intent = ctx.getPackageManager()
        .getLaunchIntentForPackage("com.example.sourceapp");
    intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK);
    ctx.startActivity(intent);
    device.wait(Until.hasObject(By.pkg("com.example.sourceapp").depth(0)), 5000);

    // 2. Tap share
    device.findObject(By.res("com.example.sourceapp:id/share_button")).click();

    // 3. Select Gmail from share sheet
    device.wait(Until.hasObject(By.text("Gmail")), 3000);
    device.findObject(By.text("Gmail")).clickAndWait(Until.newWindow(), 5000);

    // 4. Verify we landed in Gmail
    UiObject2 composeField = device.findObject(
        By.pkg("com.google.android.gm").textStartsWith("Subject"));
    assertNotNull(composeField);
}
```

## Caveats
- **Always add `FLAG_ACTIVITY_CLEAR_TASK`** when launching via Intent — stale Activity instances from prior test runs will break `Until.hasObject()` expectations.
- **`Until.newWindow()` is critical for app switches**: A plain `click()` followed by `wait()` is unreliable — the new window may never appear or may appear after the wait expires. Always use `clickAndWait(Until.newWindow(), timeout)`.
- **Never hardcode launcher package**: Use `device.getLauncherPackageName()` — launcher packages differ across OEMs (e.g., `com.google.android.apps.nexuslauncher` vs `com.miui.home`).
- **System UI resource IDs are fragile**: `com.android.systemui:id/clock` may change across Android versions and OEM skins. Fall back to text or contentDescription selectors when IDs fail.
- **UiObject2 instances stale after app switches**: Create fresh selectors after each app transition — do not reuse UiObject2 references from a previous app.
- **Cross-app tests are opaque-box**: Only UI state is observable. You cannot access internal app databases, SharedPreferences, or in-memory state. Design assertions around what's visible on screen.
- **Shell commands lack error handling**: `executeShellCommand()` returns stdout only; it cannot detect command failure, handle input, or manage pipes/quotes reliably. Prefer Intent-based launch or modern DSL.
- **Modern `waitForAppToBeVisible` requires accessibility events**: Some apps or custom views may not post accessibility events reliably, causing timeouts. Fall back to `Until.hasObject()` if needed.
- **System dialogs interrupt cross-app flows**: Permission dialogs, ANR/crash dialogs can appear mid-transition. Use `watchFor(PermissionDialog)` (modern) or `registerWatcher()` (legacy) to handle them.
- **API 18+ required**: Annotate all cross-app tests with `@SdkSuppress(minSdkVersion = 18)`.

## Composition Hints
- **Pair with device control**: Cross-app flows start with `device.pressHome()`, use `openNotification()`/`openQuickSettings()`, and rely on `executeShellCommand()` for Settings — all from the UiDevice skill.
- **Pair with selectors**: Cross-app element finding depends on `By.pkg()` to scope searches. For complex nested hierarchies, use `hasChild()`/`hasDescendant()` with `BySelector`.
- **Pair with watchers**: Always register watchers before starting cross-app flows that may trigger permission dialogs or system popups.
- **For multi-step flows**: Break into `@Test` methods that each test one app transition. Use `clearAppData()` between tests to reset target app state.
- **For CI stability**: Add generous timeouts (5-10 seconds) for inter-app transitions — CI emulators are slower than development devices.
