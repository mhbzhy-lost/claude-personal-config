---
name: xcuitest-screenshots-snapshot
description: XCUITest screenshot capture and snapshot regression testing — XCUIScreen, XCTAttachment, and iOSSnapshotTestCase integration
tech_stack: [ios]
language: [swift, objc]
capability: [integration-testing]
version: "iOSSnapshotTestCase 8.0.0"
collected_at: 2025-07-14
---

# XCUITest Screenshots & Snapshot Testing

> Source: https://developer.apple.com/documentation/xcuiautomation/xcuiscreen, https://developer.apple.com/documentation/xctest/xctattachment, https://github.com/uber/ios-snapshot-test-case

## Purpose
Capture screenshots during UI tests for debugging and test reports, and integrate iOSSnapshotTestCase for automated visual regression testing of UI components.

## When to Use
- Capturing full-screen or element-level screenshots for test diagnostics
- Attaching screenshots to XCTest results — especially on failure
- Snapshot regression testing of UIViews and CALayers (via iOSSnapshotTestCase)
- Verifying visual appearance across device models, OS versions, and size classes
- Generating reference images for visual QA baselines

## Basic Usage

### Capture and attach a full-screen screenshot
```swift
let screenshot = XCUIScreen.main.screenshot()
let attachment = XCTAttachment(screenshot: screenshot)
attachment.lifetime = .keepAlways
attachment.name = "PostLogin"
add(attachment)
```

### Capture a single element
```swift
let button = app.buttons["Submit"]
let elementShot = button.screenshot()
let attachment = XCTAttachment(screenshot: elementShot)
attachment.name = "SubmitButton"
add(attachment)
```

### Auto-attach screenshot on test failure (base class)
```swift
override func record(_ issue: XCTIssue) {
    super.record(issue)
    let screenshot = XCUIScreen.main.screenshot()
    let attachment = XCTAttachment(screenshot: screenshot)
    attachment.lifetime = .keepAlways
    attachment.name = "Failure-\(issue.description)"
    add(attachment)
}
```

### Snapshot regression test with iOSSnapshotTestCase
```swift
import iOSSnapshotTestCase

class MyViewTests: FBSnapshotTestCase {
    override func setUp() {
        super.setUp()
        // recordMode = true  // Uncomment ONCE to record reference images
    }

    func testMyViewAppearance() {
        let view = MyCustomView(frame: CGRect(x: 0, y: 0, width: 375, height: 100))
        view.configure(with: .mock)
        FBSnapshotVerifyView(view)
    }

    func testMultipleStates() {
        let view = MyCustomView(frame: CGRect(x: 0, y: 0, width: 375, height: 50))
        view.configure(with: .active)
        FBSnapshotVerifyView(view, identifier: "active")
        view.configure(with: .disabled)
        FBSnapshotVerifyView(view, identifier: "disabled")
    }
}
```

## Key APIs (Summary)

| API | Purpose |
|-----|---------|
| `XCUIScreen.main.screenshot() -> XCUIScreenshot` | Capture entire device screen. |
| `XCUIElement.screenshot() -> XCUIScreenshot` | Capture single element's rendered region. |
| `XCUIScreenshot.image` / `.pngRepresentation` | Access underlying UIImage or PNG Data. |
| `XCTAttachment(screenshot:)` | Wrap screenshot for test report attachment. |
| `XCTAttachment.Lifetime.keepAlways` / `.deleteOnSuccess` | Control whether attachment persists. |
| `XCTestCase.add(_:)` | Add attachment to current test run. |
| `FBSnapshotVerifyView(_:identifier:suffixes:perPixelTolerance:overallTolerance:)` | Compare UIView against reference image. |
| `FBSnapshotVerifyLayer(_:identifier:...)` | Compare CALayer against reference image. |
| `FBSnapshotTestCase.recordMode` | Set `true` to write reference images, `false` to verify. |
| `FBSnapshotTestCase.fileNameOptions` | Include device/OS/scale in reference image filenames. |
| `FBSnapshotTestCase.usesDrawViewHierarchyInRect` | Enable for UIVisualEffect / UIAppearance support. |

## Caveats

- **XCUIScreen.screenshot() includes status bar**: time, battery, signal indicators change between runs — don't snapshot-test full-screen for visual regression.
- **Element must exist**: `XCUIElement.screenshot()` fails silently if the element isn't in the hierarchy. Always `waitForExistence` first.
- **Application test bundle required**: iOSSnapshotTestCase needs UIKit/CoreAnimation rendering services. Tests must run inside an app bundle, not a logic test bundle.
- **Reference images are device/OS-specific**: unless configured via `fileNameOptions`, different simulators produce different reference images. Commit reference images for each target configuration.
- **Tolerances help with anti-aliasing**: use `perPixelTolerance` (0.0–1.0) and `overallTolerance` (0.0–1.0) to allow minor rendering variance without failing.
- **`.keepAlways` bloats xcresult**: use `.deleteOnSuccess` for diagnostic-only screenshots. Reserve `.keepAlways` for failure attachments.
- **Scheme variables required**: set `FB_REFERENCE_IMAGE_DIR` and `IMAGE_DIFF_DIR` in test scheme for iOSSnapshotTestCase to find reference images and store diffs.

## Composition Hints

- **Pair with assertions/waits**: call `waitForExistence` before `screenshot()` to ensure the element is on screen.
- **Base class pattern**: override `record(_:)` in a shared test base class to auto-capture screenshots on every failure across all tests.
- **JPEG compression for CI**: use `XCTAttachment(screenshot:quality:)` with 0.6–0.8 quality to keep CI artifacts small.
- **Use identifiers for multi-state snapshots**: the `identifier` parameter in `FBSnapshotVerifyView` lets you verify multiple states of the same view in one test method.
- **Record mode is per-test**: set `recordMode = true` in `setUp()`, run once, then remove it. Never commit with `recordMode = true`.
