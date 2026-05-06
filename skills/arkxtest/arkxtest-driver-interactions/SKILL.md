---
name: arkxtest-driver-interactions
description: Perform UI interactions in HarmonyOS ArkUI tests using arkXtest — component clicks, text input, coordinate-based swipe/click, List scrollSearch, BACK key injection, window manipulation, and deliberate delays.
tech_stack: [harmonyos]
language: [arkts, typescript]
capability: [integration-testing, e2e-testing]
version: "OpenHarmony arkXtest API 8+; fling/orientation v3.2.2.1"
collected_at: 2025-01-15
---

# arkXtest Driver Interactions

> Source: https://raw.githubusercontent.com/openharmony/testfwk_arkxtest/master/README_en.md; arkxtest-guidelines-V5 and hypium-python-guidelines were unavailable

## Purpose
Perform UI interactions in arkXtest tests at three levels: coordinate-based actions via UiDriver (click, swipe, pressBack), component-aware actions via UiComponent (click, inputText, scrollSearch), and window manipulation via UiWindow (moveTo, resize, focus, close). All interaction APIs are Promise-based and require `await`.

## When to Use
- Clicking buttons or tappable components (prefer `component.click()` over coordinate clicks)
- Typing text into InputText/TextBox fields
- Swiping between screens or scrolling content areas
- Scrolling within a List to locate off-screen child components
- Injecting system BACK key presses between screens
- Adding waits (`delayMs`) for animations or network responses
- Moving/resizing/focusing windows in multi-window test scenarios

## Basic Usage

### Component Click (Preferred)
```typescript
let button = await driver.findComponent(BY.text('Submit').enabled(true))
await button.click()
```

### Text Input
```typescript
let field = await driver.findComponent(BY.type('InputText'))
await field.inputText('hello_world')
```

### Swipe
```typescript
// Swipe left: from right edge to left edge
await driver.swipe(900, 500, 100, 500)
```

### Scroll Search in List
```typescript
let list = await driver.findComponent(BY.id(Id_list))
let found = await list.scrollSearch(BY.text("TargetItem"))
if (!found) { /* item not in list */ }
```

### BACK Key + Delay
```typescript
await driver.pressBack()
await driver.delayMs(500)  // wait for transition
```

## Key APIs (Summary)

### UiDriver — Coordinate & System Actions
| API | Use |
|-----|-----|
| `driver.click(x, y)` | Tap at screen coordinates (fragile — prefer component click) |
| `driver.swipe(x1, y1, x2, y2)` | Swipe gesture between two points |
| `driver.pressBack()` | System BACK button |
| `driver.delayMs(ms)` | Pause execution for ms milliseconds |
| `driver.screenCap(path)` | Screenshot to file |

### UiComponent — Component-Aware Actions
| API | Use |
|-----|-----|
| `component.click()` | Tap the located component |
| `component.inputText(str)` | Type text (InputText/TextBox only) |
| `component.scrollSearch(by)` | Scroll List to find child; returns `bool` |

### UiWindow — Window Actions
| API | Use |
|-----|-----|
| `window.moveTo(x, y)` | Move window; returns bool |
| `window.resize(w, h, dir)` | Resize from direction; returns bool |
| `window.focus()` | Bring window to foreground |
| `window.split()` | Enter split-screen mode |
| `window.close()` | Close the window |

### Full Login-Flow Example
```typescript
import { BY, UiDriver, UiComponent } from '@ohos.uitest'
import { describe, it } from '@ohos/hypium'

export default async function interactionTest() {
  describe('LoginFlow', function() {
    it('login_success', 0, async function() {
      let driver = await UiDriver.create()

      await (await driver.findComponent(BY.id('username'))).inputText('testuser')
      await (await driver.findComponent(BY.id('password'))).inputText('secret')
      await (await driver.findComponent(BY.text('Login').enabled(true))).click()

      await driver.delayMs(1000)
      await driver.assertComponentExist(BY.text('Welcome'))
    })
  })
}
```

## Caveats
- **Await everything**: All UiDriver and UiComponent interaction APIs return Promises. Forgetting `await` causes silent race conditions — the next line executes before the action completes.
- **Coordinate fragility**: `driver.click(x,y)` and `driver.swipe(...)` are tied to screen resolution and layout. Prefer `component.click()` after locating via BY.
- **inputText is type-gated**: Only works on InputText/TextBox components. Other components silently fail or error.
- **pressBack can exit app**: If the navigation stack is empty, BACK may close the application. Verify navigation depth before using.
- **scrollSearch returns boolean**: It returns `true`/`false`, NOT the found component. To interact with the found item, re-locate it after the scroll.
- **Window ops are conditional**: `moveTo`, `resize`, `split` return booleans — check return values; they silently fail on unsupported windows.
- **Advanced gestures unavailable**: longClick, doubleClick, multi-finger gestures (PointerMatrix, pinch, drag), direction-swipe, and keyboard/mouse injection are documented in arkxtest-guidelines-V5 and hypium-python-guidelines, which were unavailable at collection time. Consult latest developer.huawei.com for these APIs.
- **UiTest must be enabled**: `hdc_std shell param set persist.ace.testmode.enabled 1` before any test execution.

## Composition Hints
- Prerequisite: `arkxtest-project-setup` for test structure and lifecycle hooks
- Prerequisite: `arkxtest-on-component` for locating components (BY descriptors, findComponent)
- Pair with `arkxtest-assertions` for verifying outcomes after interactions
- Pair with `arkxtest-screenshots-recording` for capturing screen state during interaction sequences
