---
name: arkxtest-screenshots-recording
description: Screen capture via UiDriver.screenCap() and hdc-based UiTest device setup for HarmonyOS arkxtest UI automation.
tech_stack: [harmonyos]
language: [arkts]
capability: [e2e-testing]
version: "OpenHarmony arkxtest API 8+"
collected_at: 2025-01-01
---

# arkxtest Screenshots & Recording

> Source: https://raw.githubusercontent.com/openharmony/testfwk_arkxtest/master/README_en.md

## Purpose
Capture device screenshots during arkxtest UI automation runs using the `UiDriver.screenCap()` API. Covers device-side UiTest enablement via `hdc`, UiTest binary deployment, and the programmatic screenshot API for embedding visual evidence into test reports and debugging workflows.

## When to Use
- Capturing screenshots at specific test steps for debugging and reporting
- Embedding visual evidence in automated test reports (pass/fail screenshots)
- Verifying UI layout visually at assertion points
- Debugging component rendering issues by capturing screen state before/after interactions
- Integrating screenshot capture into CI/CD test pipelines for HarmonyOS apps

## Basic Usage

### Prerequisites: Enable UiTest on Device

Before any screenshot or UI automation, UiTest mode must be enabled:

```shell
hdc_std shell param set persist.ace.testmode.enabled 1
```

For OpenHarmony 3.1 Release, UiTest must be manually built and deployed:

```shell
# Build
./build.sh --product-name rk3568 --build-target uitestkit

# Deploy to device
hdc_std target mount
hdc_std shell mount -o rw,remount /
hdc_std file send uitest /system/bin/uitest
hdc_std file send libuitest.z.so /system/lib/module/libuitest.z.so
hdc_std shell chmod +x /system/bin/uitest
```

### Capturing a Screenshot

```typescript
import { BY, UiDriver, UiComponent } from '@ohos.uitest'
import { describe, it, expect } from '@ohos/hypium'

export default async function abilityTest() {
  describe('ScreenshotTest', function () {
    it('capture_after_action', 0, async function (done) {
      try {
        let driver = await UiDriver.create()

        // Perform UI action
        let button = await driver.findComponent(BY.text('Submit'))
        await button.click()

        // Capture screenshot
        await driver.screenCap('/data/local/tmp/after_submit.png')
      } finally {
        done()
      }
    })
  })
}
```

### Screenshot at Multiple Checkpoints

```typescript
it('multi_step_screenshots', 0, async function (done) {
  try {
    let driver = await UiDriver.create()

    // Initial state
    await driver.screenCap('/data/local/tmp/step0_initial.png')

    // Navigate
    await driver.findComponent(BY.text('Settings')).click()
    await driver.screenCap('/data/local/tmp/step1_settings.png')

    // Toggle a switch
    let toggle = await driver.findComponent(BY.text('Wi-Fi'))
    await toggle.click()
    await driver.screenCap('/data/local/tmp/step2_wifi_toggled.png')
  } finally {
    done()
  }
})
```

### Pulling Screenshots to Host

After test execution, retrieve screenshots from the device:

```shell
hdc_std file recv /data/local/tmp/after_submit.png ./test-artifacts/
```

## Key APIs (Summary)

| API | Signature | Purpose |
|-----|-----------|---------|
| `screenCap` | `driver.screenCap(path: string): Promise<void>` | Captures current screen to device-local path |
| `create` | `UiDriver.create(): Promise<UiDriver>` | Creates UiDriver instance (required before screenCap) |

## Caveats
- **UiTest must be enabled first**: `hdc_std shell param set persist.ace.testmode.enabled 1` — screenshots and all UiDriver APIs fail without this.
- **Device-local path only**: `screenCap()` saves to the device filesystem. Use `hdc_std file recv` to pull files to the host. The path `/data/local/tmp/` is commonly used as it's writable.
- **All UiDriver APIs are Promise-based**: always use `await` with `screenCap()`. Forgetting `await` will not capture the screenshot and won't throw an obvious error.
- **UiTest not built by default on OpenHarmony 3.1**: manual build and deployment required for OpenHarmony 3.1 Release.
- **Screen state matters**: screenshot may fail or produce blank output if the device is locked or in power-saving mode.
- **Visible content only**: `screenCap()` captures what's rendered on screen — off-screen, occluded, or not-yet-rendered components won't appear.
- **File overwrite**: repeated calls with the same path overwrite the previous file silently. Use unique filenames (e.g., timestamped) for multi-step captures.

## Composition Hints
- Pair with `arkxtest-assertions` to capture screenshots on assertion failure for debugging.
- Pair with `arkxtest-driver-interactions` to capture before/after screenshots around clicks, swipes, and text input.
- Use `driver.delayMs()` before `screenCap()` to wait for animations or transitions to complete.
- In CI pipelines, capture screenshots to a known directory and archive them as build artifacts.
- For test reports, include the pulled PNG files as embedded evidence alongside assertion results.
