---
name: maestro-assertions-conditions
description: Assertions (assertVisible/assertNotVisible), conditional branching (when), and subflow execution (runFlow) in Maestro.
tech_stack: [maestro, mobile-native]
capability: [e2e-testing]
version: "maestro unversioned"
collected_at: 2025-01-01
---

# Maestro Assertions & Conditions

> Source: https://docs.maestro.dev/maestro-flows/flow-control-and-logic/conditions, https://docs.maestro.dev/reference/commands-available/assertvisible, https://docs.maestro.dev/reference/commands-available/assertnotvisible, https://docs.maestro.dev/reference/commands-available/runflow

## Purpose

Validate UI state with `assertVisible`/`assertNotVisible`, branch test logic with `when` conditions, and compose modular flows with `runFlow`. Together these three primitives enable resilient, maintainable test suites that handle platform differences and dynamic UI.

## When to Use

- **assertVisible**: Confirm critical UI elements appear after navigation, form submission, or login. Auto-retries up to 7 seconds.
- **assertNotVisible**: Confirm elements have disappeared — loading spinners, dismissed modals, resolved errors.
- **Conditions (`when`)**: Handle platform-specific UI (Android/iOS/Web), dynamic state like onboarding screens or A/B tests, "if element exists then act" patterns.
- **runFlow**: Reuse common sequences (login, setup, teardown). Group conditional steps. Keep tests DRY.

## Basic Usage

### assertVisible / assertNotVisible — shorthand and full form

Both commands auto-retry for ~7 seconds before failing. For longer waits, use `extendedWaitUntil`.

```yaml
# Shorthand — assert by visible text
- assertVisible: "My Button"
- assertNotVisible: "Loading..."

# Full form — combine multiple selector properties
- assertVisible:
    text: "Submit"
    enabled: true
# Fails if: no "Submit" element, OR "Submit" exists but is disabled

- assertNotVisible:
    text: "Error"
    enabled: true
# Fails only if an enabled "Error" element is visible
```

Available selector properties: `text`, `id`, `enabled`, `checked`, `focused`, `selected`.

### Conditions with `when` — four condition types

Attach a `when` block to `runFlow` (or certain other commands). Maestro skips the command if the condition is false.

| Condition | Syntax | Use when… |
|-----------|--------|------------|
| `visible` | `visible: {text: "Foo"}` | Element is on screen |
| `notVisible` | `notVisible: {text: "Foo"}` | Element is absent |
| `platform` | `platform: Android` | Platform-specific logic |
| `true` | `true: "${VAR} === 'on'"` | Arbitrary JS expression |

### runFlow — file-based or inline commands

| Parameter | Type | Purpose |
|-----------|------|---------|
| `file` | string | Relative path to a `.yaml` flow file |
| `commands` | list | Inline command list (alternative to `file`) |
| `label` | string | Description shown in reports |
| `env` | map | Environment variables passed to the subflow |

## Key Patterns

### 1. Platform branching

```yaml
- runFlow:
    when:
      platform: Android
    file: subflows/android-permissions.yaml
- runFlow:
    when:
      platform: iOS
    file: subflows/ios-permissions.yaml
```

### 2. Dynamic state — handle optional popups

**Pattern A: `runFlow` + `when` (preferred for clarity)**
```yaml
- runFlow:
    when:
      visible:
        text: "Rate this App"
    file: subflows/dismiss-rate-popup.yaml
```

**Pattern B: `optional` property (for single commands)**
```yaml
- tapOn:
    text: "No Thanks"
    optional: true
    label: "Dismiss rate popup if present"
```

### 3. Negative conditions — act when element is absent

```yaml
- runFlow:
    when:
      notVisible:
        text: "Biometric Login"
    commands:
      - tapOn: "Standard Login"
```

### 4. Inline commands — no separate file needed

```yaml
- runFlow:
    label: "Complete onboarding"
    when:
      visible:
        text: "Welcome to our App"
    commands:
      - tapOn: "Next"
      - tapOn: "Next"
      - tapOn: "Get Started"
```

### 5. Multiple conditions — AND logic

All conditions in a `when` block must be true:
```yaml
- tapOn:
    when:
      platform: Android
      visible:
        text: "Allow Notifications"
    text: "Allow"
```

### 6. JavaScript expressions for advanced logic

```yaml
# Inline JS expression
- runFlow:
    when:
      true: "${IS_FEATURE_ENABLED} === true"
    file: new-feature-test.yaml

# External JS file (keeps YAML clean)
- runScript: checkFeatureFlag.js
- runFlow:
    when:
      true: "${output.FEATURE_FLAG} === true"
    file: new-feature-test.yaml
```

### 7. Reusable subflows with env passing

```yaml
# Login.yaml — defined once
appId: com.example.app
---
- launchApp
- tapOn: Username
- inputText: ${USERNAME}
- tapOn: Password
- inputText: ${PASSWORD}
- tapOn: Login

# Profile.yaml — reused
appId: com.example.app
---
- runFlow:
    file: Login.yaml
    env:
      USERNAME: "admin"
      PASSWORD: "secret123"
- tapOn: Profile
- assertVisible: "Name: admin"
```

## Key APIs (Summary)

**assertVisible / assertNotVisible**: Accept a string shorthand (`text`) or a map of selectors (`text`, `id`, `enabled`, `checked`, `focused`, `selected`). Auto-retry ~7s. Use `extendedWaitUntil` for longer waits.

**when**: Attached to `runFlow` (and some other commands). Supports `visible`, `notVisible`, `platform` (`Android`/`iOS`/`Web`), `true` (JS expression). Multiple conditions → AND logic.

**runFlow**: `file` (relative path to flow), `commands` (inline list), `label` (report name), `env` (variable map). Inline form is ideal for conditional branching without creating extra files.

## Caveats

- **Avoid overusing conditions** — they make flows hard to debug. Prefer separate flows for significantly different scenarios.
- **Unstable UI selectors cause flaky tests** — ensure `visible`/`notVisible` selectors target unique, reliable elements.
- **7-second assertion timeout** — if your UI takes longer, switch to `extendedWaitUntil`.
- **Multiple conditions = AND** — there is no OR syntax inside a single `when` block. Use separate `runFlow` steps for OR logic.
- **Cloud execution**: pass a workspace **folder** (not a single file) to `runFlow` so Maestro can upload dependencies and `config.yaml`. Single-file mode uses best-effort dependency collection and may fail with `Failed to parse file`.
- **`assertVisible` with `enabled: true`**: fails if the element exists but is disabled, not just if absent.
- **`tapOn` does not natively accept `when`** in all contexts — use `runFlow` + `when` + inline `commands` as the workaround.

## Composition Hints

- Combine with `maestro-flow-yaml-basics` for the foundational commands (`launchApp`, `tapOn`, `inputText`) that populate the UI state you'll assert against.
- Before writing conditional branches, ask: "Can I use two separate flows instead?" Simpler is usually better.
- Use inline `commands` for small conditional blocks (1-3 commands); use `file` for reusable, multi-step sequences.
- Always add a `label` to `runFlow` — it makes CI reports readable.
