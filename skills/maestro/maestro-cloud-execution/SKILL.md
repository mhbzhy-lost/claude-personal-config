---
name: maestro-cloud-execution
description: Run Maestro mobile UI tests on managed cloud devices with parallel execution, device matrix configuration, and app binary caching
tech_stack: [maestro, mobile-native]
language: [bash]
capability: [e2e-testing]
version: "Maestro unversioned"
collected_at: 2025-07-17
---

# Maestro Cloud Execution

> Source: https://docs.maestro.dev/maestro-cloud/run-tests-on-maestro-cloud, https://docs.maestro.dev/maestro-cloud, https://docs.maestro.dev/maestro-cloud/environment-configuration/configure-the-os, https://docs.maestro.dev/maestro-cloud/cloud-commands

## Purpose

Maestro Cloud is a hosted infrastructure for executing mobile UI tests with high parallelism. Every virtual device is wiped and recreated between tests, guaranteeing isolation. The `maestro cloud` CLI subcommand (no separate binary) uploads an app binary and Flow YAML directory, distributes tests across a managed device fleet, and returns results via the Maestro Console.

## When to Use

- **Parallel execution**: When local device fleets can't keep up — cloud execution can reduce test time by up to 90%.
- **Device matrix testing**: Validate against many Android API levels and iOS device models in a single run without maintaining a device lab.
- **Cross-device compatibility**: Run the same flows against `android-33`, `android-34`, `iPhone-11`, `iPhone-17-Pro` to catch regressions.
- **Locale/timezone validation**: Test localized behavior with `--device-locale` across regional settings.
- **Zero-maintenance device farm**: No emulator/simulator setup, updating, or cleanup — devices are isolated and recreated per test.

## Basic Usage

### Prerequisites

- Maestro account with a Cloud Plan (trial available)
- Maestro CLI installed
- App binary: Android ARMv8 APK, or iOS `*.app` directory (zipped or not)
- API key and Project ID from [Maestro Dashboard](https://console.maestro.dev)

### Quick start with samples

```shell
maestro download-samples
maestro cloud \
  --api-key "$MAESTRO_API_KEY" \
  --project-id "$PROJECT_ID" \
  --app-file samples/android-sample.apk \
  --flows samples/
```

After upload, the CLI prints a **Console URL** — open it to see videos, logs, and view hierarchy for every test.

### Run your own app

```shell
maestro cloud \
  --api-key "$MAESTRO_API_KEY" \
  --project-id "$MY_PROJECT_ID" \
  --app-file app/build/outputs/apk/debug/app-debug.apk \
  --flows ./e2e
```

## Key APIs (Summary)

### Device matrix configuration

| Flag | Purpose | Example |
|------|---------|---------|
| `--device-os` | OS version (replaces deprecated `--android-api-level` / `--ios-version`) | `android-34`, `iOS-26-2` |
| `--device-model` | Specific device model | `pixel_6`, `iPhone-17-Pro` |
| `--device-locale` | Locale for localized testing | `de_DE`, `ja_JP` |

**iOS requires both `--device-os` AND `--device-model`.** Without `--device-model`, iOS device selection is unpredictable. Android can run with `--device-os` alone.

### Discover available devices

```shell
maestro list-cloud-devices                  # All platforms
maestro list-cloud-devices --platform ios    # iOS only
maestro list-cloud-devices --platform android # Android only
```

### App binary caching (`--app-binary-id`)

Skip re-uploading the app when only flows changed:

```shell
# First run — note the binary ID from console output
maestro cloud --api-key "$KEY" --project-id "$ID" \
  --app-file app.apk --flows ./e2e

# Subsequent runs — reuse cached binary
maestro cloud --api-key "$KEY" --project-id "$ID" \
  --app-binary-id "abc123-previously-uploaded" \
  --flows ./e2e --device-os android-34
```

When `--app-binary-id` is used, `--app-file` is not required.

### Authentication for multi-org users

Always provide both flags to avoid interactive prompts:

```shell
maestro cloud --api-key "$MAESTRO_API_KEY" --project-id "$MY_PROJECT_ID" ...
```

### Other useful flags

| Flag | Purpose |
|------|---------|
| `--name` | Human-readable upload name |
| `--include-tags` / `--exclude-tags` | Filter flows by tag |
| `--async` | Fire-and-forget (exit immediately after upload) |
| `--format JUNIT --output report.xml` | Machine-readable test report |
| `-e`, `--env KEY=VALUE` | Environment variables injected into flows |
| `--mapping` | Path to ProGuard mapping (Android) or dSYM (iOS) for symbolicated crash logs |

### Full example — iOS with locale

```shell
maestro cloud \
  --api-key "$MAESTRO_API_KEY" \
  --project-id "$MY_PROJECT_ID" \
  --app-file build/MyApp.app \
  --flows ./e2e \
  --device-os "iOS-26-2" \
  --device-model "iPhone-17-Pro" \
  --device-locale "de_DE" \
  --format JUNIT \
  --output report.xml
```

## Caveats

- **iOS needs device-model**: Running iOS tests without `--device-model` gives unpredictable device selection. Always specify both OS version and model.
- **Deprecated flags**: `--ios-version` (only supported major versions, defaulted to iPhone 11) and `--android-api-level` are deprecated. Migrate to `--device-os` everywhere.
- **Build format is strict**: Android must be ARMv8 APK. iOS must be `*.app` directory or zip — `.ipa` is not accepted.
- **No separate Cloud CLI**: `maestro cloud` is a subcommand of the standard Maestro CLI. Do not look for a separate binary.
- **Console URL is the only result channel**: No local artifact download by default. The CLI prints a link — videos, logs, and hierarchy data live in the Maestro Console.
- **Processing latency**: After upload, tests may queue behind other runs. Processing time depends on your account's runner allocation.
- **Local reproducibility**: To match Android cloud behavior locally, create emulators with the **Google APIs** variant (not Google Play).
- **Cloud plan required**: Maestro Cloud execution is not part of the free tier. A Cloud Plan (trial available) is required.
- **Multi-org users**: Always pass `--api-key` and `--project-id` explicitly to prevent interactive prompts that block CI runners.
- **App binary ID is opaque**: The `--app-binary-id` value comes from a prior upload's console output. There's no `list-binaries` command — track IDs yourself.

## Composition Hints

- **Combine with `maestro-ci-integration`**: Cloud execution is the engine; CI integration wires it into pipelines. Use `maestro cloud` flags in CI YAML (GitHub Actions `device-os` input maps to `--device-os`).
- **Combine with `maestro-flow-yaml-basics`**: Flows uploaded to cloud must follow standard YAML structure — `launchApp` with `clearState: true` ensures clean cloud device state.
- **Combine with `maestro-assertions-conditions`**: Assertions provide the pass/fail signals that cloud execution reports. Conditional branching lets you run platform-specific flows on different device targets.
- **Device matrix strategy**: Run smoke tests on a single popular device per platform on PRs. Run the full matrix (multiple `--device-os` values) on main branch merges or release branches.
- **Binary caching workflow**: In CI, compute a hash of the app binary. If unchanged from last run, use `--app-binary-id` to skip the upload — dramatically faster cloud runs.
- **Locale testing**: Combine `--device-locale` with `--device-os` to create a localization matrix. Run on `de_DE`, `ja_JP`, `ar_SA` to catch layout and translation issues.
